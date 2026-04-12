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

type ContainerStats = {
  name: string;
  cpuPercent: number;
  memoryBytes: number;
};

type SampleState<T> = {
  capturedAt: number;
  value: T;
};

export type MetricsSnapshot = {
  timestamp: string;
  warnings: string[];
  system: {
    cpuPercent: number;
    loadAverage: [number, number, number];
    memoryPercent: number;
    memoryUsedBytes: number;
    memoryTotalBytes: number;
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
    cpuPercent: number;
    memoryPercent: number;
    memoryUsedBytes: number;
    top: ContainerStats[];
  };
};

const CACHE_WINDOW_MS = 2500;
const LOOPBACK_INTERFACE_RE = /^(lo|lo0)$/;

let cachedSnapshot: SampleState<MetricsSnapshot> | null = null;
let lastCpuCounters: SampleState<CpuCounters> | null = null;
let lastNetworkCounters: SampleState<InterfaceCounters[]> | null = null;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, precision = 1) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
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

async function readContainerStats(totalMemoryBytes: number) {
  try {
    const output = await runCommand("docker", [
      "stats",
      "--no-stream",
      "--format",
      "{{ json . }}",
    ]);

    const rows = output
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, string>);

    const top = rows
      .map((row) => ({
        name: row.Name ?? row.Container ?? row.ID ?? "container",
        cpuPercent: parsePercent(row.CPUPerc ?? row.CPU),
        memoryBytes: parseDockerMemoryUsage(row.MemUsage ?? row.MemoryUsage),
      }))
      .sort((left, right) => right.cpuPercent - left.cpuPercent);

    const totalCpuPercent = top.reduce((sum, item) => sum + item.cpuPercent, 0);
    const memoryUsedBytes = top.reduce(
      (sum, item) => sum + item.memoryBytes,
      0,
    );

    return {
      running: top.length,
      cpuPercent: clamp(totalCpuPercent / getCpuCount(), 0, 100),
      memoryPercent:
        totalMemoryBytes > 0
          ? clamp((memoryUsedBytes / totalMemoryBytes) * 100, 0, 100)
          : 0,
      memoryUsedBytes,
      top: top.slice(0, 3),
      warning: null,
    };
  } catch (error) {
    return {
      running: 0,
      cpuPercent: 0,
      memoryPercent: 0,
      memoryUsedBytes: 0,
      top: [],
      warning:
        error instanceof Error
          ? `Container metrics unavailable: ${error.message}`
          : "Container metrics unavailable.",
    };
  }
}

async function buildSystemMetrics() {
  const [cpuCounters, loadAverage, memory] = await Promise.all([
    readCpuCounters(),
    readLoadAverage(),
    readMemorySnapshot(),
  ]);
  const currentSample: SampleState<CpuCounters> = {
    capturedAt: Date.now(),
    value: cpuCounters,
  };

  let cpuPercent = clamp((loadAverage[0] / getCpuCount()) * 100, 0, 100);

  if (lastCpuCounters) {
    const totalDelta = cpuCounters.total - lastCpuCounters.value.total;
    const idleDelta = cpuCounters.idle - lastCpuCounters.value.idle;

    if (totalDelta > 0) {
      cpuPercent = clamp(((totalDelta - idleDelta) / totalDelta) * 100, 0, 100);
    }
  }

  lastCpuCounters = currentSample;

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

  return {
    timestamp: new Date().toISOString(),
    warnings,
    system,
    network,
    containers: {
      running: containers.running,
      cpuPercent: round(containers.cpuPercent),
      memoryPercent: round(containers.memoryPercent),
      memoryUsedBytes: containers.memoryUsedBytes,
      top: containers.top,
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

  return snapshot;
}
