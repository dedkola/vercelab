import { spawn } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { getAppConfig } from "@/lib/app-config";

type CpuCounters = {
  idle: number;
  total: number;
};

type InterfaceCounters = {
  name: string;
  rxBytes: number;
  txBytes: number;
};

type DiskCounters = {
  readBytes: number;
  writeBytes: number;
};

type ContainerIoCounters = {
  networkRxBytes: number;
  networkTxBytes: number;
  blockReadBytes: number;
  blockWriteBytes: number;
};

export type ContainerRuntimeState =
  | "running"
  | "stopped"
  | "paused"
  | "restarting"
  | "dead"
  | "created"
  | "unknown";

export type ContainerHealthState =
  | "healthy"
  | "unhealthy"
  | "starting"
  | "none";

export type ContainerStats = {
  id: string;
  name: string;
  cpuPercent: number;
  memoryBytes: number;
  memoryPercent: number;
  networkRxBytesPerSecond: number;
  networkTxBytesPerSecond: number;
  networkTotalBytesPerSecond: number;
  diskReadBytesPerSecond: number;
  diskWriteBytesPerSecond: number;
  diskTotalBytesPerSecond: number;
  status: ContainerRuntimeState;
  health: ContainerHealthState;
  projectName: string | null;
  serviceName: string | null;
};

type SampleState<T> = {
  capturedAt: number;
  value: T;
};

export type MetricsSnapshot = {
  timestamp: string;
  warnings: string[];
  hostIp: string;
  system: {
    cpuPercent: number;
    loadAverage: [number, number, number];
    memoryPercent: number;
    memoryUsedBytes: number;
    memoryTotalBytes: number;
    diskReadBytesPerSecond: number;
    diskWriteBytesPerSecond: number;
  };
  network: {
    rxBytesPerSecond: number;
    txBytesPerSecond: number;
    interfaces: Array<{
      name: string;
      rxBytesPerSecond: number;
      txBytesPerSecond: number;
    }>;
  };
  containers: {
    running: number;
    total: number;
    cpuPercent: number;
    memoryPercent: number;
    memoryUsedBytes: number;
    statusBreakdown: {
      healthy: number;
      unhealthy: number;
      stopped: number;
    };
    top: ContainerStats[];
    all: ContainerStats[];
  };
};

const CACHE_WINDOW_MS = 2500;
const LOOPBACK_INTERFACE_RE = /^(lo|lo0)$/;
const IPV4_RE = /^\d{1,3}(?:\.\d{1,3}){3}$/;

let cachedSnapshot: SampleState<MetricsSnapshot> | null = null;
let lastCpuCounters: SampleState<CpuCounters> | null = null;
let lastNetworkCounters: SampleState<InterfaceCounters[]> | null = null;
let lastDiskCounters: SampleState<DiskCounters> | null = null;
let lastContainerIoCounters = new Map<
  string,
  SampleState<ContainerIoCounters>
>();

function escapeLineProtocol(value: string) {
  return value.replace(/([ ,=])/g, "\\$1");
}

function encodeLineProtocol(snapshot: MetricsSnapshot) {
  const timestampMs = Date.parse(snapshot.timestamp);
  const safeTimestamp = Number.isFinite(timestampMs) ? timestampMs : Date.now();
  const hostTag = escapeLineProtocol(snapshot.hostIp || "unknown");
  const lines: string[] = [
    `host_metrics,host=${hostTag} cpu_percent=${snapshot.system.cpuPercent},memory_percent=${snapshot.system.memoryPercent},memory_used_bytes=${snapshot.system.memoryUsedBytes},memory_total_bytes=${snapshot.system.memoryTotalBytes},load_1=${snapshot.system.loadAverage[0]},load_5=${snapshot.system.loadAverage[1]},load_15=${snapshot.system.loadAverage[2]},network_rx_bps=${snapshot.network.rxBytesPerSecond},network_tx_bps=${snapshot.network.txBytesPerSecond},disk_read_bps=${snapshot.system.diskReadBytesPerSecond},disk_write_bps=${snapshot.system.diskWriteBytesPerSecond} ${safeTimestamp}`,
    `container_metrics,host=${hostTag},scope=aggregate running=${snapshot.containers.running}i,cpu_percent=${snapshot.containers.cpuPercent},memory_percent=${snapshot.containers.memoryPercent},memory_used_bytes=${snapshot.containers.memoryUsedBytes} ${safeTimestamp}`,
  ];

  for (const iface of snapshot.network.interfaces) {
    const ifaceTag = escapeLineProtocol(iface.name);
    lines.push(
      `network_interface,host=${hostTag},interface=${ifaceTag} rx_bps=${iface.rxBytesPerSecond},tx_bps=${iface.txBytesPerSecond} ${safeTimestamp}`,
    );
  }

  for (const container of snapshot.containers.top) {
    const containerTag = escapeLineProtocol(container.name);
    lines.push(
      `container_metrics,host=${hostTag},scope=top,container=${containerTag} cpu_percent=${container.cpuPercent},memory_used_bytes=${container.memoryBytes} ${safeTimestamp}`,
    );
  }

  for (const container of snapshot.containers.all) {
    const containerTag = escapeLineProtocol(container.name);
    const containerIdTag = escapeLineProtocol(container.id);
    const projectTag = escapeLineProtocol(container.projectName ?? "unknown");
    const serviceTag = escapeLineProtocol(container.serviceName ?? "unknown");
    const statusTag = escapeLineProtocol(container.status);
    const healthTag = escapeLineProtocol(container.health);
    lines.push(
      `container_metrics,host=${hostTag},scope=container,container=${containerTag},container_id=${containerIdTag},project=${projectTag},service=${serviceTag},status=${statusTag},health=${healthTag} cpu_percent=${container.cpuPercent},memory_used_bytes=${container.memoryBytes},memory_percent=${container.memoryPercent},network_rx_bps=${container.networkRxBytesPerSecond},network_tx_bps=${container.networkTxBytesPerSecond},block_read_bps=${container.diskReadBytesPerSecond},block_write_bps=${container.diskWriteBytesPerSecond} ${safeTimestamp}`,
    );
  }

  return lines.join("\n");
}

async function writeSnapshotToInflux(snapshot: MetricsSnapshot) {
  const config = getAppConfig();

  if (!config.metrics.influxUrl || !config.metrics.influxDatabase) {
    return;
  }

  const writeUrl = new URL("/write", config.metrics.influxUrl);
  writeUrl.searchParams.set("db", config.metrics.influxDatabase);
  writeUrl.searchParams.set("precision", "ms");

  const headers: Record<string, string> = {
    "Content-Type": "text/plain; charset=utf-8",
  };

  if (config.metrics.influxToken) {
    headers.Authorization = `Bearer ${config.metrics.influxToken}`;
  }

  const response = await fetch(writeUrl, {
    method: "POST",
    headers,
    body: encodeLineProtocol(snapshot),
  });

  if (!response.ok) {
    throw new Error(`InfluxDB write failed with ${response.status}.`);
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, precision = 1) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function isValidIpv4(value: string) {
  if (!IPV4_RE.test(value)) {
    return false;
  }

  return value
    .split(".")
    .every((segment) => Number(segment) >= 0 && Number(segment) <= 255);
}

function parseHostIpv4FromBaseDomain(baseDomain: string) {
  const normalized = baseDomain.trim().toLowerCase().replace(/\.$/, "");

  for (const suffix of [".sslip.io", ".nip.io"]) {
    if (!normalized.endsWith(suffix)) {
      continue;
    }

    const candidate = normalized.slice(0, -suffix.length).replaceAll("-", ".");

    if (isValidIpv4(candidate)) {
      return candidate;
    }
  }

  return null;
}

function resolveHostLanIp() {
  const config = getAppConfig();

  if (config.runtime.hostLanIp && isValidIpv4(config.runtime.hostLanIp)) {
    return config.runtime.hostLanIp;
  }

  const lanIpFromBaseDomain = parseHostIpv4FromBaseDomain(config.baseDomain);

  if (lanIpFromBaseDomain) {
    return lanIpFromBaseDomain;
  }

  const ifaces = os.networkInterfaces();

  for (const iface of Object.values(ifaces)) {
    if (!iface) continue;
    for (const addr of iface) {
      if (addr.family === "IPv4" && !addr.internal) {
        return addr.address;
      }
    }
  }

  return "unknown";
}

function getCpuCount() {
  return typeof os.availableParallelism === "function"
    ? os.availableParallelism()
    : os.cpus().length;
}

async function pathExists(targetPath: string) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readProcFile(relativePath: string) {
  const config = getAppConfig();
  const candidates = [
    path.join(config.runtime.hostProcPath, relativePath),
    path.join("/proc", relativePath),
  ];

  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return await readFile(candidate, "utf8");
    }
  }

  throw new Error(`Unable to read proc file ${relativePath}.`);
}

async function readFirstAvailableFile(candidates: string[]) {
  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return await readFile(candidate, "utf8");
    }
  }

  throw new Error(`Unable to read any file from ${candidates.join(", ")}.`);
}

async function runCommand(command: string, args: string[]) {
  return await new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      const output = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n");

      if (code === 0) {
        resolve(output);
        return;
      }

      reject(
        new Error(
          [output, `${command} ${args.join(" ")} exited with status ${code}.`]
            .filter(Boolean)
            .join("\n"),
        ),
      );
    });
  });
}

function parseProcCpuCounters(source: string): CpuCounters {
  const line = source.split("\n").find((entry) => entry.startsWith("cpu "));

  if (!line) {
    throw new Error("Unable to find CPU counters in proc stat output.");
  }

  const values = line
    .trim()
    .split(/\s+/)
    .slice(1)
    .map((entry) => Number.parseInt(entry, 10));

  const idle = values[3] + (values[4] ?? 0);
  const total = values.reduce((sum, value) => sum + value, 0);

  return {
    idle,
    total,
  };
}

function readOsCpuCounters(): CpuCounters {
  return os.cpus().reduce(
    (accumulator, cpu) => {
      accumulator.idle += cpu.times.idle;
      accumulator.total +=
        cpu.times.user +
        cpu.times.nice +
        cpu.times.sys +
        cpu.times.idle +
        cpu.times.irq;

      return accumulator;
    },
    {
      idle: 0,
      total: 0,
    },
  );
}

async function readCpuCounters() {
  try {
    return parseProcCpuCounters(await readProcFile("stat"));
  } catch {
    return readOsCpuCounters();
  }
}

async function readLoadAverage() {
  try {
    const source = await readProcFile("loadavg");
    const [one, five, fifteen] = source
      .trim()
      .split(/\s+/)
      .slice(0, 3)
      .map((entry) => Number.parseFloat(entry));

    return [one, five, fifteen] as [number, number, number];
  } catch {
    const values = os.loadavg();
    return [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0] as [
      number,
      number,
      number,
    ];
  }
}

async function readMemorySnapshot() {
  try {
    const source = await readProcFile("meminfo");
    const totalMatch = source.match(/^MemTotal:\s+(\d+)\s+kB$/m);
    const availableMatch = source.match(/^MemAvailable:\s+(\d+)\s+kB$/m);
    const freeMatch = source.match(/^MemFree:\s+(\d+)\s+kB$/m);

    const totalBytes = totalMatch
      ? Number.parseInt(totalMatch[1], 10) * 1024
      : 0;
    const availableBytes = availableMatch
      ? Number.parseInt(availableMatch[1], 10) * 1024
      : freeMatch
        ? Number.parseInt(freeMatch[1], 10) * 1024
        : 0;
    const usedBytes = Math.max(0, totalBytes - availableBytes);

    return {
      totalBytes,
      usedBytes,
      percent: totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0,
    };
  } catch {
    const totalBytes = os.totalmem();
    const usedBytes = Math.max(0, totalBytes - os.freemem());

    return {
      totalBytes,
      usedBytes,
      percent: totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0,
    };
  }
}

function isRelevantInterface(name: string) {
  return !LOOPBACK_INTERFACE_RE.test(name);
}

function parseLinuxNetworkCounters(source: string) {
  return source
    .split("\n")
    .slice(2)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [rawName, rawValues] = line.split(":");

      if (!rawName || !rawValues) {
        return null;
      }

      const name = rawName.trim();

      if (!isRelevantInterface(name)) {
        return null;
      }

      const values = rawValues
        .trim()
        .split(/\s+/)
        .map((entry) => Number.parseInt(entry, 10));

      return {
        name,
        rxBytes: values[0] ?? 0,
        txBytes: values[8] ?? 0,
      } satisfies InterfaceCounters;
    })
    .filter((entry): entry is InterfaceCounters => Boolean(entry));
}

function parseDarwinNetworkCounters(source: string) {
  const lines = source.split("\n").filter(Boolean);
  const headerLine = lines.find(
    (line) => /\bIbytes\b/.test(line) && /\bObytes\b/.test(line),
  );

  if (!headerLine) {
    throw new Error("Unable to parse netstat output.");
  }

  const headers = headerLine.trim().split(/\s+/);
  const rxIndex = headers.indexOf("Ibytes");
  const txIndex = headers.indexOf("Obytes");
  const nameIndex = headers.indexOf("Name");

  if (rxIndex === -1 || txIndex === -1 || nameIndex === -1) {
    throw new Error("netstat output is missing byte counters.");
  }

  const byInterface = new Map<string, InterfaceCounters>();

  for (const line of lines) {
    if (line === headerLine || line.startsWith("Name")) {
      continue;
    }

    const columns = line.trim().split(/\s+/);
    const name = columns[nameIndex];

    if (!name || !isRelevantInterface(name)) {
      continue;
    }

    const rxBytes = Number.parseInt(columns[rxIndex] ?? "0", 10);
    const txBytes = Number.parseInt(columns[txIndex] ?? "0", 10);
    const existing = byInterface.get(name);

    if (!existing || rxBytes + txBytes > existing.rxBytes + existing.txBytes) {
      byInterface.set(name, {
        name,
        rxBytes: Number.isFinite(rxBytes) ? rxBytes : 0,
        txBytes: Number.isFinite(txBytes) ? txBytes : 0,
      });
    }
  }

  return Array.from(byInterface.values());
}

async function readNetworkCounters() {
  try {
    const config = getAppConfig();
    return parseLinuxNetworkCounters(
      await readFirstAvailableFile([
        path.join(config.runtime.hostProcPath, "1/net/dev"),
        path.join(config.runtime.hostProcPath, "net/dev"),
        path.join("/proc", "net/dev"),
      ]),
    );
  } catch {
    if (process.platform === "darwin") {
      return parseDarwinNetworkCounters(await runCommand("netstat", ["-ibn"]));
    }

    return [];
  }
}

function isRelevantDiskDevice(name: string) {
  return /^(sd[a-z]+|vd[a-z]+|xvd[a-z]+|nvme\d+n\d+|mmcblk\d+|md\d+|dm-\d+)$/.test(
    name,
  );
}

function parseLinuxDiskCounters(source: string): DiskCounters {
  return source
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .reduce<DiskCounters>(
      (accumulator, line) => {
        const columns = line.split(/\s+/);
        const name = columns[2];

        if (!name || !isRelevantDiskDevice(name)) {
          return accumulator;
        }

        const sectorsRead = Number.parseInt(columns[5] ?? "0", 10);
        const sectorsWritten = Number.parseInt(columns[9] ?? "0", 10);

        accumulator.readBytes +=
          (Number.isFinite(sectorsRead) ? sectorsRead : 0) * 512;
        accumulator.writeBytes +=
          (Number.isFinite(sectorsWritten) ? sectorsWritten : 0) * 512;

        return accumulator;
      },
      {
        readBytes: 0,
        writeBytes: 0,
      },
    );
}

async function readDiskCounters() {
  try {
    return parseLinuxDiskCounters(await readProcFile("diskstats"));
  } catch {
    return {
      readBytes: 0,
      writeBytes: 0,
    };
  }
}

function parsePercent(value: string | number | null | undefined) {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value !== "string") {
    return 0;
  }

  return Number.parseFloat(value.replace(/%/g, "").trim()) || 0;
}

function parseByteSize(input: string) {
  const match = input.trim().match(/^([\d.]+)\s*([kmgtpe]?i?b)?$/i);

  if (!match) {
    return 0;
  }

  const value = Number.parseFloat(match[1]);
  const unit = (match[2] ?? "b").toLowerCase();

  const multipliers: Record<string, number> = {
    b: 1,
    kb: 1000,
    mb: 1000 ** 2,
    gb: 1000 ** 3,
    tb: 1000 ** 4,
    kib: 1024,
    mib: 1024 ** 2,
    gib: 1024 ** 3,
    tib: 1024 ** 4,
  };

  return Math.round(value * (multipliers[unit] ?? 1));
}

function parseDockerMemoryUsage(value: string | null | undefined) {
  if (!value) {
    return 0;
  }

  const [usage] = value.split("/");
  return parseByteSize(usage);
}

function getContainerCounterKey(kind: "id" | "name", value: string) {
  return `${kind}:${value}`;
}

function parseDockerTransferCounters(value: string | null | undefined) {
  if (!value) {
    return {
      firstBytes: 0,
      secondBytes: 0,
    };
  }

  const [first = "0 B", second = "0 B"] = value.split("/");

  return {
    firstBytes: parseByteSize(first),
    secondBytes: parseByteSize(second),
  };
}

function normalizeContainerName(value: string | null | undefined) {
  const normalized = (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)[0]
    ?.replace(/^\//, "");

  return normalized || "container";
}

function parseDockerLabels(value: string | null | undefined) {
  const labels = new Map<string, string>();

  for (const entry of (value ?? "").split(",")) {
    const trimmed = entry.trim();

    if (!trimmed) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex < 1) {
      continue;
    }

    labels.set(
      trimmed.slice(0, separatorIndex),
      trimmed.slice(separatorIndex + 1),
    );
  }

  return labels;
}

function normalizeContainerRuntimeState(
  state: string | null | undefined,
  statusText: string | null | undefined,
): ContainerRuntimeState {
  const normalizedState = (state ?? "").trim().toLowerCase();

  if (normalizedState === "running") {
    return "running";
  }

  if (["exited", "removing", "stopped"].includes(normalizedState)) {
    return "stopped";
  }

  if (["paused", "restarting", "dead", "created"].includes(normalizedState)) {
    return normalizedState as ContainerRuntimeState;
  }

  const normalizedStatus = (statusText ?? "").trim().toLowerCase();

  if (normalizedStatus.startsWith("up ")) {
    return "running";
  }

  if (normalizedStatus.startsWith("exited ")) {
    return "stopped";
  }

  return "unknown";
}

function normalizeContainerHealth(
  statusText: string | null | undefined,
): ContainerHealthState {
  const normalizedStatus = (statusText ?? "").trim().toLowerCase();

  if (normalizedStatus.includes("(healthy)")) {
    return "healthy";
  }

  if (normalizedStatus.includes("(unhealthy)")) {
    return "unhealthy";
  }

  if (normalizedStatus.includes("starting")) {
    return "starting";
  }

  return "none";
}

async function readContainerStats(totalMemoryBytes: number) {
  try {
    const capturedAt = Date.now();
    const [statsOutput, containerListOutput] = await Promise.all([
      runCommand("docker", [
        "stats",
        "--no-stream",
        "--format",
        "{{ json . }}",
      ]).catch(() => ""),
      runCommand("docker", ["ps", "-a", "--format", "{{ json . }}"]),
    ]);

    const statsById = new Map<
      string,
      {
        cpuPercent: number;
        memoryBytes: number;
        networkRxBytesPerSecond: number;
        networkTxBytesPerSecond: number;
        networkTotalBytesPerSecond: number;
        diskReadBytesPerSecond: number;
        diskWriteBytesPerSecond: number;
        diskTotalBytesPerSecond: number;
      }
    >();
    const statsByName = new Map<
      string,
      {
        cpuPercent: number;
        memoryBytes: number;
        networkRxBytesPerSecond: number;
        networkTxBytesPerSecond: number;
        networkTotalBytesPerSecond: number;
        diskReadBytesPerSecond: number;
        diskWriteBytesPerSecond: number;
        diskTotalBytesPerSecond: number;
      }
    >();
    const nextContainerIoCounters = new Map<
      string,
      SampleState<ContainerIoCounters>
    >();

    for (const row of statsOutput
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, string>)) {
      const id = row.ID ?? row.Container ?? row.Name ?? "container";
      const name = normalizeContainerName(
        row.Name ?? row.Container ?? row.Names ?? row.ID,
      );
      const networkCounters = parseDockerTransferCounters(
        row.NetIO ?? row.NetworkIO,
      );
      const blockCounters = parseDockerTransferCounters(
        row.BlockIO ?? row.BlockIo,
      );
      const currentIoCounters = {
        networkRxBytes: networkCounters.firstBytes,
        networkTxBytes: networkCounters.secondBytes,
        blockReadBytes: blockCounters.firstBytes,
        blockWriteBytes: blockCounters.secondBytes,
      } satisfies ContainerIoCounters;
      const previousIoCounters =
        lastContainerIoCounters.get(getContainerCounterKey("id", id)) ??
        lastContainerIoCounters.get(getContainerCounterKey("name", name));
      const seconds = previousIoCounters
        ? Math.max((capturedAt - previousIoCounters.capturedAt) / 1000, 1)
        : 1;
      const networkRxBytesPerSecond = previousIoCounters
        ? Math.max(
            0,
            (currentIoCounters.networkRxBytes -
              previousIoCounters.value.networkRxBytes) /
              seconds,
          )
        : 0;
      const networkTxBytesPerSecond = previousIoCounters
        ? Math.max(
            0,
            (currentIoCounters.networkTxBytes -
              previousIoCounters.value.networkTxBytes) /
              seconds,
          )
        : 0;
      const diskReadBytesPerSecond = previousIoCounters
        ? Math.max(
            0,
            (currentIoCounters.blockReadBytes -
              previousIoCounters.value.blockReadBytes) /
              seconds,
          )
        : 0;
      const diskWriteBytesPerSecond = previousIoCounters
        ? Math.max(
            0,
            (currentIoCounters.blockWriteBytes -
              previousIoCounters.value.blockWriteBytes) /
              seconds,
          )
        : 0;
      const metric = {
        cpuPercent: parsePercent(row.CPUPerc ?? row.CPU),
        memoryBytes: parseDockerMemoryUsage(row.MemUsage ?? row.MemoryUsage),
        networkRxBytesPerSecond: round(networkRxBytesPerSecond),
        networkTxBytesPerSecond: round(networkTxBytesPerSecond),
        networkTotalBytesPerSecond: round(
          networkRxBytesPerSecond + networkTxBytesPerSecond,
        ),
        diskReadBytesPerSecond: round(diskReadBytesPerSecond),
        diskWriteBytesPerSecond: round(diskWriteBytesPerSecond),
        diskTotalBytesPerSecond: round(
          diskReadBytesPerSecond + diskWriteBytesPerSecond,
        ),
      };

      const ioSample = {
        capturedAt,
        value: currentIoCounters,
      } satisfies SampleState<ContainerIoCounters>;

      statsById.set(id, metric);
      statsByName.set(name, metric);
      nextContainerIoCounters.set(getContainerCounterKey("id", id), ioSample);
      nextContainerIoCounters.set(
        getContainerCounterKey("name", name),
        ioSample,
      );
    }

    lastContainerIoCounters = nextContainerIoCounters;

    const all = containerListOutput
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, string>)
      .map((row) => {
        const id = row.ID ?? row.Id ?? row.Container ?? crypto.randomUUID();
        const name = normalizeContainerName(
          row.Names ?? row.Name ?? row.Container ?? row.ID,
        );
        const labels = parseDockerLabels(row.Labels ?? row.Label ?? "");
        const stats = statsById.get(id) ?? statsByName.get(name);
        const memoryBytes = stats?.memoryBytes ?? 0;

        return {
          id,
          name,
          cpuPercent: stats?.cpuPercent ?? 0,
          memoryBytes,
          memoryPercent:
            totalMemoryBytes > 0
              ? clamp((memoryBytes / totalMemoryBytes) * 100, 0, 100)
              : 0,
          networkRxBytesPerSecond: stats?.networkRxBytesPerSecond ?? 0,
          networkTxBytesPerSecond: stats?.networkTxBytesPerSecond ?? 0,
          networkTotalBytesPerSecond: stats?.networkTotalBytesPerSecond ?? 0,
          diskReadBytesPerSecond: stats?.diskReadBytesPerSecond ?? 0,
          diskWriteBytesPerSecond: stats?.diskWriteBytesPerSecond ?? 0,
          diskTotalBytesPerSecond: stats?.diskTotalBytesPerSecond ?? 0,
          status: normalizeContainerRuntimeState(row.State, row.Status),
          health: normalizeContainerHealth(row.Status),
          projectName: labels.get("com.docker.compose.project") ?? null,
          serviceName: labels.get("com.docker.compose.service") ?? null,
        } satisfies ContainerStats;
      })
      .sort(
        (left, right) =>
          right.cpuPercent - left.cpuPercent ||
          right.memoryBytes - left.memoryBytes,
      );

    const totalCpuPercent = all.reduce((sum, item) => sum + item.cpuPercent, 0);
    const memoryUsedBytes = all.reduce(
      (sum, item) => sum + item.memoryBytes,
      0,
    );
    const healthy = all.filter(
      (item) => item.status === "running" && item.health !== "unhealthy",
    ).length;
    const unhealthy = all.filter((item) => item.health === "unhealthy").length;
    const stopped = all.filter(
      (item) => item.status !== "running" && item.health !== "unhealthy",
    ).length;

    return {
      running: all.filter((item) => item.status === "running").length,
      total: all.length,
      cpuPercent: clamp(totalCpuPercent / getCpuCount(), 0, 100),
      memoryPercent:
        totalMemoryBytes > 0
          ? clamp((memoryUsedBytes / totalMemoryBytes) * 100, 0, 100)
          : 0,
      memoryUsedBytes,
      statusBreakdown: {
        healthy,
        unhealthy,
        stopped,
      },
      top: all.slice(0, 3),
      all,
      warning: null,
    };
  } catch (error) {
    return {
      running: 0,
      total: 0,
      cpuPercent: 0,
      memoryPercent: 0,
      memoryUsedBytes: 0,
      statusBreakdown: {
        healthy: 0,
        unhealthy: 0,
        stopped: 0,
      },
      top: [],
      all: [],
      warning:
        error instanceof Error
          ? `Container metrics unavailable: ${error.message}`
          : "Container metrics unavailable.",
    };
  }
}

async function buildSystemMetrics() {
  const [cpuCounters, loadAverage, memory, diskCounters] = await Promise.all([
    readCpuCounters(),
    readLoadAverage(),
    readMemorySnapshot(),
    readDiskCounters(),
  ]);
  const currentSample: SampleState<CpuCounters> = {
    capturedAt: Date.now(),
    value: cpuCounters,
  };
  const currentDiskSample: SampleState<DiskCounters> = {
    capturedAt: currentSample.capturedAt,
    value: diskCounters,
  };

  let cpuPercent = clamp((loadAverage[0] / getCpuCount()) * 100, 0, 100);
  let diskReadBytesPerSecond = 0;
  let diskWriteBytesPerSecond = 0;

  if (lastCpuCounters) {
    const totalDelta = cpuCounters.total - lastCpuCounters.value.total;
    const idleDelta = cpuCounters.idle - lastCpuCounters.value.idle;

    if (totalDelta > 0) {
      cpuPercent = clamp(((totalDelta - idleDelta) / totalDelta) * 100, 0, 100);
    }
  }

  if (lastDiskCounters) {
    const seconds = Math.max(
      (currentDiskSample.capturedAt - lastDiskCounters.capturedAt) / 1000,
      1,
    );
    diskReadBytesPerSecond = Math.max(
      0,
      (diskCounters.readBytes - lastDiskCounters.value.readBytes) / seconds,
    );
    diskWriteBytesPerSecond = Math.max(
      0,
      (diskCounters.writeBytes - lastDiskCounters.value.writeBytes) / seconds,
    );
  }

  lastCpuCounters = currentSample;
  lastDiskCounters = currentDiskSample;

  return {
    cpuPercent: round(cpuPercent),
    loadAverage: loadAverage.map((value) => round(value, 2)) as [
      number,
      number,
      number,
    ],
    memoryPercent: round(memory.percent),
    memoryUsedBytes: memory.usedBytes,
    memoryTotalBytes: memory.totalBytes,
    diskReadBytesPerSecond: round(diskReadBytesPerSecond),
    diskWriteBytesPerSecond: round(diskWriteBytesPerSecond),
  };
}

async function buildNetworkMetrics() {
  const counters = await readNetworkCounters();
  const sample: SampleState<InterfaceCounters[]> = {
    capturedAt: Date.now(),
    value: counters,
  };

  if (!lastNetworkCounters) {
    lastNetworkCounters = sample;

    return {
      rxBytesPerSecond: 0,
      txBytesPerSecond: 0,
      interfaces: counters.slice(0, 4).map((entry) => ({
        name: entry.name,
        rxBytesPerSecond: 0,
        txBytesPerSecond: 0,
      })),
    };
  }

  const seconds = Math.max(
    (sample.capturedAt - lastNetworkCounters.capturedAt) / 1000,
    1,
  );
  const previousByName = new Map(
    lastNetworkCounters.value.map((entry) => [entry.name, entry]),
  );
  const interfaces = counters
    .map((entry) => {
      const previous = previousByName.get(entry.name);

      return {
        name: entry.name,
        rxBytesPerSecond: previous
          ? Math.max(0, (entry.rxBytes - previous.rxBytes) / seconds)
          : 0,
        txBytesPerSecond: previous
          ? Math.max(0, (entry.txBytes - previous.txBytes) / seconds)
          : 0,
      };
    })
    .sort(
      (left, right) =>
        right.rxBytesPerSecond +
        right.txBytesPerSecond -
        (left.rxBytesPerSecond + left.txBytesPerSecond),
    );

  lastNetworkCounters = sample;

  return {
    rxBytesPerSecond: round(
      interfaces.reduce((sum, entry) => sum + entry.rxBytesPerSecond, 0),
    ),
    txBytesPerSecond: round(
      interfaces.reduce((sum, entry) => sum + entry.txBytesPerSecond, 0),
    ),
    interfaces: interfaces.slice(0, 4).map((entry) => ({
      name: entry.name,
      rxBytesPerSecond: round(entry.rxBytesPerSecond),
      txBytesPerSecond: round(entry.txBytesPerSecond),
    })),
  };
}

async function buildSnapshot(): Promise<MetricsSnapshot> {
  const warnings: string[] = [];
  const system = await buildSystemMetrics();
  const network = await buildNetworkMetrics();
  const containers = await readContainerStats(system.memoryTotalBytes);

  if (containers.warning) {
    warnings.push(containers.warning);
  }

  if (network.interfaces.length === 0) {
    warnings.push("Network interface counters are unavailable.");
  }

  const hostIp = resolveHostLanIp();

  return {
    timestamp: new Date().toISOString(),
    warnings,
    hostIp,
    system,
    network,
    containers: {
      running: containers.running,
      total: containers.total,
      cpuPercent: round(containers.cpuPercent),
      memoryPercent: round(containers.memoryPercent),
      memoryUsedBytes: containers.memoryUsedBytes,
      statusBreakdown: containers.statusBreakdown,
      top: containers.top,
      all: containers.all,
    },
  };
}

export async function getMetricsSnapshot() {
  const now = Date.now();

  if (cachedSnapshot && now - cachedSnapshot.capturedAt < CACHE_WINDOW_MS) {
    return cachedSnapshot.value;
  }

  const snapshot = await buildSnapshot();
  cachedSnapshot = {
    capturedAt: now,
    value: snapshot,
  };

  void writeSnapshotToInflux(snapshot).catch((error) => {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to write metrics to InfluxDB.";

    console.error(`[metrics] ${message}`);
  });

  return snapshot;
}
