import type {
  ContainerListEntry,
  DashboardLogView,
  LogLine,
  MetricCard,
  PreviewContainer,
  PreviewContainerStatus,
} from "@/components/workspace-shell";
import { getContainerTone } from "@/lib/container-tone";
import {
  DASHBOARD_RANGE_OPTIONS,
  type DashboardRange,
} from "@/lib/metrics-range";
import type {
  AllContainersMetricsHistorySeries,
  ContainerMetricsHistoryPoint,
  MetricsHistoryPoint,
} from "@/lib/influx-metrics";
import type { DeploymentSummary } from "@/lib/persistence";
import type { ContainerStats, MetricsSnapshot } from "@/lib/system-metrics";

const STABLE_TIME_ZONE = "UTC";

const SERIES_COLORS = [
  "#0f766e",
  "#0284c7",
  "#f97316",
  "#e11d48",
  "#7c3aed",
  "#d97706",
  "#14b8a6",
  "#ea580c",
] as const;

export const ALL_CONTAINERS_ID = "__all-containers__";

export const LOG_VIEW_OPTIONS: Array<{
  value: DashboardLogView;
  label: string;
}> = [
  { value: "live", label: "Live tail" },
  { value: "events", label: "Events" },
  { value: "alerts", label: "Alerts" },
];

export const METRICS_DASHBOARD_RANGE_OPTIONS = DASHBOARD_RANGE_OPTIONS.filter(
  (option) => option.value !== "90d",
);

export type ChartMetricFormat = "percent" | "bytes" | "bytesPerSecond";

export type ChartStat = {
  label: string;
  value: string;
};

export type SystemMetricPanel = {
  currentCaption: string;
  currentValue: string;
  format: ChartMetricFormat;
  id: "cpu" | "memory" | "network" | "disk";
  labels: string[];
  primaryValues: number[];
  secondaryValues?: number[];
  stats: ChartStat[];
  timestamps: string[];
  title: string;
  tone: "emerald" | "amber" | "sky" | "rose";
  variant: "area" | "bars" | "dual-line" | "banded";
};

export type ContainerMetricSeries = {
  color: string;
  id: string;
  isSelected: boolean;
  label: string;
  latestRaw: number | null;
  latestValue: string;
  values: Array<number | null>;
};

export type ContainerMetricPanel = {
  format: ChartMetricFormat;
  id: "cpu" | "memory" | "network";
  labels: string[];
  series: ContainerMetricSeries[];
  stats: ChartStat[];
  timestamps: string[];
  title: string;
};

type ContainerDescriptor = {
  history: ContainerMetricsHistoryPoint[];
  id: string;
  label: string;
  runtime: ContainerStats | null;
};

function createLogLine(
  id: string,
  timestamp: string,
  level: LogLine["level"],
  message: string,
): LogLine {
  return {
    id,
    level,
    message,
    timestamp: formatClock(timestamp),
  };
}

function getLatestDelta(
  points: number[],
  formatter: (value: number) => string,
  minimumDelta = 0.05,
) {
  if (points.length < 2) {
    return "Snapshot";
  }

  const delta = points[points.length - 1]! - points[points.length - 2]!;

  if (Math.abs(delta) < minimumDelta) {
    return "Stable";
  }

  return `${delta > 0 ? "+" : "-"}${formatter(Math.abs(delta))}`;
}

function getUsageTone(
  value: number,
  thresholds = { calm: 35, elevated: 75 },
): MetricCard["tone"] {
  if (value >= thresholds.elevated) {
    return "amber";
  }

  if (value <= thresholds.calm) {
    return "emerald";
  }

  return "slate";
}

function createFlatSeries(value: number) {
  return Array.from({ length: 12 }, () => value);
}

function buildTimeLabels(timestamps: string[]) {
  if (!timestamps.length) {
    return [] as string[];
  }

  const first = Date.parse(timestamps[0]!);
  const last = Date.parse(timestamps[timestamps.length - 1]!);
  const showDate =
    !Number.isFinite(first) ||
    !Number.isFinite(last) ||
    last - first >= 24 * 60 * 60 * 1000;

  const formatter = new Intl.DateTimeFormat("en", {
    ...(showDate
      ? {
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          month: "short",
        }
      : {
          hour: "2-digit",
          minute: "2-digit",
        }),
    timeZone: STABLE_TIME_ZONE,
  });

  return timestamps.map((timestamp) => formatter.format(new Date(timestamp)));
}

function getAverage(points: number[]) {
  if (!points.length) {
    return null;
  }

  return points.reduce((sum, point) => sum + point, 0) / points.length;
}

function getPeak(points: number[]) {
  if (!points.length) {
    return null;
  }

  return Math.max(...points);
}

function getLatestNumber(values: Array<number | null>) {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = values[index];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

function getSeriesColor(index: number) {
  return SERIES_COLORS[index % SERIES_COLORS.length] ?? SERIES_COLORS[0];
}

function formatManagedContainerLabel(label: string) {
  const normalized = label.trim().toLowerCase();

  if (normalized === "vercelab-ui") {
    return "Vercelab UI";
  }

  if (
    normalized === "vercelab-influxdb" ||
    normalized.startsWith("vercelab-influxdb-")
  ) {
    return "Vercelab InfluxDB";
  }

  if (
    normalized === "vercelab-postgres" ||
    normalized.startsWith("vercelab-postgres-")
  ) {
    return "Vercelab PostgreSQL";
  }

  if (
    normalized === "traefik" ||
    normalized === "vercelab-traefik" ||
    normalized.startsWith("vercelab-traefik-")
  ) {
    return "Vercelab Traefik";
  }

  return label;
}

function parseComposeContainerName(containerName: string) {
  const normalized = containerName.trim();
  const match = /^(.+)-([^-]+)-(\d+)$/.exec(normalized);

  if (!match) {
    return null;
  }

  const projectName = match[1]?.trim() ?? "";
  const serviceName = match[2]?.trim() ?? "";

  if (!projectName || !serviceName) {
    return null;
  }

  return {
    projectName,
    serviceName,
  };
}

function findDeploymentByProjectName(
  deployments: DeploymentSummary[],
  projectName: string,
) {
  return (
    deployments.find((deployment) => deployment.projectName === projectName) ??
    null
  );
}

function resolveDisplayLabelFromDeployment(
  deployment: DeploymentSummary,
  serviceName: string | null,
) {
  const normalizedService = serviceName?.trim() ?? "";

  return normalizedService
    ? `${deployment.appName} / ${normalizedService}`
    : deployment.appName;
}

function resolveRuntimeContainerLabel(
  runtime: ContainerStats,
  deployments: DeploymentSummary[],
) {
  const projectName = runtime.projectName?.trim() ?? "";

  if (projectName) {
    const deployment = findDeploymentByProjectName(deployments, projectName);

    if (deployment) {
      return resolveDisplayLabelFromDeployment(deployment, runtime.serviceName);
    }
  }

  return formatManagedContainerLabel(runtime.name);
}

function resolveHistoricalContainerLabel(
  containerName: string,
  deployments: DeploymentSummary[],
) {
  const parsed = parseComposeContainerName(containerName);

  if (parsed) {
    const deployment = findDeploymentByProjectName(
      deployments,
      parsed.projectName,
    );

    if (deployment) {
      return resolveDisplayLabelFromDeployment(deployment, parsed.serviceName);
    }
  }

  return formatManagedContainerLabel(containerName);
}

function buildRuntimeSummary(runtime: ContainerStats) {
  const parts = [
    runtime.projectName ? `Compose project ${runtime.projectName}` : null,
    runtime.serviceName
      ? `service ${runtime.serviceName}`
      : "standalone runtime",
  ].filter(Boolean);

  return `Live runtime view for ${runtime.name}, ${parts.join(" / ")} on the current Docker host.`;
}

function getPreviewStatus(runtime: ContainerStats): PreviewContainerStatus {
  const tone = getContainerTone(runtime);

  if (tone === "running") {
    return "running";
  }

  if (tone === "unhealthy") {
    return "degraded";
  }

  return "idle";
}

function getStatusDotClassName(status: PreviewContainerStatus) {
  switch (status) {
    case "running":
      return "bg-emerald-500";
    case "degraded":
      return "bg-amber-500";
    case "idle":
      return "bg-slate-400";
  }
}

function buildRuntimeLogs(
  runtime: ContainerStats,
  history: ContainerMetricsHistoryPoint[],
  snapshot: MetricsSnapshot | null,
) {
  const latest = history[history.length - 1] ?? null;
  const timestamp =
    latest?.timestamp ?? snapshot?.timestamp ?? new Date().toISOString();
  const cpuPoints = history.map((point) => point.cpuPercent);
  const memoryPoints = history.map((point) => point.memoryUsedBytes);
  const networkPoints = history.map((point) => point.networkTotal);
  const live: LogLine[] = [
    createLogLine(
      `${runtime.id}-live-cpu`,
      timestamp,
      runtime.health === "unhealthy" ? "warning" : "info",
      `CPU ${formatPercent(latest?.cpuPercent ?? runtime.cpuPercent, 1)} • memory ${formatBytes(latest?.memoryUsedBytes ?? runtime.memoryBytes)} • net ${formatBytesPerSecond(latest?.networkTotal ?? runtime.networkTotalBytesPerSecond)}.`,
    ),
    createLogLine(
      `${runtime.id}-live-disk`,
      timestamp,
      "info",
      `Disk ${formatBytesPerSecond(latest?.diskTotal ?? runtime.diskTotalBytesPerSecond)} • health ${formatRuntimeHealthLabel(runtime.health).toLowerCase()}.`,
    ),
  ];
  const events: LogLine[] = [
    createLogLine(
      `${runtime.id}-event-summary`,
      timestamp,
      "success",
      buildRuntimeSummary(runtime),
    ),
    createLogLine(
      `${runtime.id}-event-service`,
      timestamp,
      "info",
      `${runtime.projectName ?? "Standalone"} • ${runtime.serviceName ?? runtime.name} • ${runtime.status}.`,
    ),
  ];
  const alerts: LogLine[] = [];

  if (runtime.health === "unhealthy" || runtime.health === "starting") {
    alerts.push(
      createLogLine(
        `${runtime.id}-alert-health`,
        timestamp,
        "warning",
        `${formatManagedContainerLabel(runtime.name)} health is ${formatRuntimeHealthLabel(runtime.health).toLowerCase()}.`,
      ),
    );
  }

  if ((getPeak(cpuPoints) ?? runtime.cpuPercent) >= 85) {
    alerts.push(
      createLogLine(
        `${runtime.id}-alert-cpu`,
        timestamp,
        "warning",
        `CPU peaked at ${formatPercent(getPeak(cpuPoints) ?? runtime.cpuPercent, 1)} during the selected history window.`,
      ),
    );
  }

  if ((getPeak(memoryPoints) ?? runtime.memoryBytes) >= 3 * 1024 ** 3) {
    alerts.push(
      createLogLine(
        `${runtime.id}-alert-memory`,
        timestamp,
        "warning",
        `Memory peaked at ${formatBytes(getPeak(memoryPoints) ?? runtime.memoryBytes)} in the selected history window.`,
      ),
    );
  }

  if (
    (getPeak(networkPoints) ?? runtime.networkTotalBytesPerSecond) >=
    1024 ** 2
  ) {
    alerts.push(
      createLogLine(
        `${runtime.id}-alert-network`,
        timestamp,
        "warning",
        `Network throughput peaked at ${formatBytesPerSecond(getPeak(networkPoints) ?? runtime.networkTotalBytesPerSecond)}.`,
      ),
    );
  }

  return {
    alerts,
    events,
    live,
  } satisfies Record<DashboardLogView, LogLine[]>;
}

function buildDisplayContainer(
  runtime: ContainerStats,
  history: ContainerMetricsHistoryPoint[],
  snapshot: MetricsSnapshot | null,
): PreviewContainer {
  const status = getPreviewStatus(runtime);
  const cpuPoints = history.map((point) => point.cpuPercent);
  const memoryPoints = history.map((point) => point.memoryUsedBytes);
  const networkPoints = history.map((point) => point.networkTotal);

  return {
    activity: cpuPoints.length
      ? cpuPoints
      : createFlatSeries(runtime.cpuPercent),
    deployedAt: snapshot
      ? formatDetailedTimestamp(snapshot.timestamp)
      : "Unknown",
    endpoints: [],
    environment: [],
    id: runtime.id,
    image: runtime.serviceName
      ? `${runtime.projectName ?? "runtime"}/${runtime.serviceName}`
      : runtime.name,
    logs: buildRuntimeLogs(runtime, history, snapshot),
    memory: formatBytes(runtime.memoryBytes),
    name: runtime.name,
    node: snapshot?.hostIp ?? "Current host",
    port: runtime.serviceName ?? "Internal",
    region: snapshot?.hostIp ?? "Current host",
    requestRate: formatBytesPerSecond(runtime.networkTotalBytesPerSecond),
    restarts: 0,
    signals: [
      {
        caption: "Latest CPU usage from the selected window.",
        delta: getLatestDelta(cpuPoints, (value) => formatPercent(value, 1)),
        label: "CPU trend",
        points: cpuPoints.length
          ? cpuPoints
          : createFlatSeries(runtime.cpuPercent),
        tone: getUsageTone(runtime.cpuPercent),
        value: formatPercent(runtime.cpuPercent, 1),
      },
      {
        caption: "Resident memory sampled from container history.",
        delta: getLatestDelta(
          memoryPoints,
          (value) => formatBytes(value),
          1024,
        ),
        label: "Memory trend",
        points: memoryPoints.length
          ? memoryPoints
          : createFlatSeries(runtime.memoryBytes),
        tone: runtime.memoryPercent >= 70 ? "amber" : "slate",
        value: formatBytes(runtime.memoryBytes),
      },
      {
        caption: "Ingress plus egress throughput over time.",
        delta: getLatestDelta(
          networkPoints,
          (value) => formatBytesPerSecond(value),
          1024,
        ),
        label: "Network trend",
        points: networkPoints.length
          ? networkPoints
          : createFlatSeries(runtime.networkTotalBytesPerSecond),
        tone: "slate",
        value: formatBytesPerSecond(runtime.networkTotalBytesPerSecond),
      },
    ],
    stack: runtime.projectName ?? "runtime",
    status,
    summary: buildRuntimeSummary(runtime),
    tags: [
      runtime.projectName,
      runtime.serviceName,
      runtime.status,
      runtime.health !== "none" ? runtime.health : null,
    ].filter((value): value is string => Boolean(value)),
    timeline: [
      {
        detail: `Health ${formatRuntimeHealthLabel(runtime.health)} • status ${runtime.status}.`,
        label: "Runtime state",
      },
      {
        detail: `CPU ${formatPercent(runtime.cpuPercent, 1)} • memory ${formatBytes(runtime.memoryBytes)}.`,
        label: "Current load",
      },
      {
        detail: `Net ${formatBytesPerSecond(runtime.networkTotalBytesPerSecond)} • disk ${formatBytesPerSecond(runtime.diskTotalBytesPerSecond)}.`,
        label: "I/O profile",
      },
    ],
    uptime: snapshot
      ? `Updated ${formatClock(snapshot.timestamp)}`
      : "Live sample",
    volumes: [],
    cpu: formatPercent(runtime.cpuPercent, 1),
  };
}

function buildContainerDescriptors(
  snapshot: MetricsSnapshot | null,
  allContainerHistory: AllContainersMetricsHistorySeries[],
  deployments: DeploymentSummary[],
) {
  const historyById = new Map(
    allContainerHistory.map((series) => [series.containerId, series.points]),
  );
  const historyByName = new Map(
    allContainerHistory.map((series) => [series.containerName, series.points]),
  );

  if (snapshot?.containers.all.length) {
    return [...snapshot.containers.all]
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((runtime) => ({
        history:
          historyById.get(runtime.id) ?? historyByName.get(runtime.name) ?? [],
        id: runtime.id,
        label: resolveRuntimeContainerLabel(runtime, deployments),
        runtime,
      })) satisfies ContainerDescriptor[];
  }

  return [...allContainerHistory]
    .sort((left, right) =>
      left.containerName.localeCompare(right.containerName),
    )
    .map((series) => ({
      history: series.points,
      id: series.containerId,
      label: resolveHistoricalContainerLabel(series.containerName, deployments),
      runtime: null,
    })) satisfies ContainerDescriptor[];
}

function alignContainerSeries(
  descriptors: ContainerDescriptor[],
  selectedContainerId: string | null,
  selectValue: (point: ContainerMetricsHistoryPoint) => number,
  formatter: (value: number) => string,
) {
  const timestamps = Array.from(
    new Set(
      descriptors.flatMap((descriptor) =>
        descriptor.history.map((point) => point.timestamp),
      ),
    ),
  ).sort();
  const labels = buildTimeLabels(timestamps);

  const series = descriptors.map((descriptor, index) => {
    const valuesByTimestamp = new Map(
      descriptor.history.map((point) => [point.timestamp, selectValue(point)]),
    );
    const values = timestamps.map(
      (timestamp) => valuesByTimestamp.get(timestamp) ?? null,
    );
    const latestRaw = getLatestNumber(values);

    return {
      color: getSeriesColor(index),
      id: descriptor.id,
      isSelected: selectedContainerId === descriptor.id,
      label: descriptor.label,
      latestRaw,
      latestValue: latestRaw === null ? "--" : formatter(latestRaw),
      values,
    } satisfies ContainerMetricSeries;
  });

  return {
    labels,
    series,
    timestamps,
  };
}

function getSelectedSeries(
  series: ContainerMetricSeries[],
  selectedContainerId: string | null,
) {
  if (!selectedContainerId) {
    return null;
  }

  return series.find((item) => item.id === selectedContainerId) ?? null;
}

function getTopSeries(series: ContainerMetricSeries[]) {
  return (
    [...series]
      .filter((item) => item.latestRaw !== null)
      .sort(
        (left, right) => (right.latestRaw ?? 0) - (left.latestRaw ?? 0),
      )[0] ?? null
  );
}

function getGlobalPeak(series: ContainerMetricSeries[]) {
  const points = series.flatMap((item) =>
    item.values.filter((value): value is number => typeof value === "number"),
  );

  return getPeak(points);
}

export function formatClock(value: string) {
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: STABLE_TIME_ZONE,
  }).format(new Date(value));
}

export function formatDetailedTimestamp(value: string) {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    timeZone: STABLE_TIME_ZONE,
  }).format(new Date(value));
}

export function formatLoadAverage(
  loadAverage: MetricsSnapshot["system"]["loadAverage"],
) {
  return loadAverage.map((value) => value.toFixed(2)).join(" / ");
}

export function formatPercent(value: number, maximumFractionDigits = 0) {
  return `${value.toFixed(maximumFractionDigits)}%`;
}

export function formatBytes(
  value: number,
  maximumFractionDigits = value >= 1024 ** 3 ? 1 : 0,
) {
  if (!Number.isFinite(value) || value <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(
    Math.floor(Math.log(value) / Math.log(1024)),
    units.length - 1,
  );
  const normalized = value / 1024 ** exponent;
  const digits = normalized >= 100 ? 0 : maximumFractionDigits;

  return `${normalized.toFixed(digits)} ${units[exponent]}`;
}

export function formatBytesPerSecond(value: number) {
  return `${formatBytes(value, value >= 1024 ** 2 ? 1 : 0)}/s`;
}

export function formatMetricValue(value: number, format: ChartMetricFormat) {
  switch (format) {
    case "percent":
      return formatPercent(value, 1);
    case "bytes":
      return formatBytes(value);
    case "bytesPerSecond":
      return formatBytesPerSecond(value);
  }
}

export function formatAxisValue(value: number, format: ChartMetricFormat) {
  switch (format) {
    case "percent":
      return formatPercent(value, 0);
    case "bytes":
    case "bytesPerSecond":
      return formatBytes(value);
  }
}

export function formatRuntimeHealthLabel(health: ContainerStats["health"]) {
  switch (health) {
    case "healthy":
      return "Healthy";
    case "unhealthy":
      return "Unhealthy";
    case "starting":
      return "Starting";
    case "none":
      return "No healthcheck";
  }
}

export function formatRuntimeStatusLabel(runtime: ContainerStats) {
  if (runtime.health === "unhealthy") {
    return "Unhealthy";
  }

  if (runtime.health === "starting") {
    return "Starting";
  }

  return runtime.status.charAt(0).toUpperCase() + runtime.status.slice(1);
}

export function formatStatusLabel(status: PreviewContainerStatus) {
  switch (status) {
    case "running":
      return "Running";
    case "degraded":
      return "Degraded";
    case "idle":
      return "Idle";
  }
}

export function getStatusBadgeVariant(
  status: PreviewContainerStatus,
): "success" | "warning" | "default" {
  switch (status) {
    case "running":
      return "success";
    case "degraded":
      return "warning";
    case "idle":
      return "default";
  }
}

export function buildLiveServerMetrics(
  snapshot: MetricsSnapshot | null,
  history: MetricsHistoryPoint[],
): MetricCard[] {
  if (!snapshot) {
    return [
      {
        caption: "Waiting for live host samples.",
        delta: "Connecting",
        points: [],
        title: "CPU pressure",
        tone: "slate",
        value: "--",
      },
      {
        caption: "Waiting for memory history.",
        delta: "Connecting",
        points: [],
        title: "Memory footprint",
        tone: "slate",
        value: "--",
      },
      {
        caption: "Recent ingress and egress will appear here.",
        delta: "Connecting",
        points: [],
        title: "Network throughput",
        tone: "slate",
        value: "--",
      },
      {
        caption: "Aggregate container demand will appear here.",
        delta: "Connecting",
        points: [],
        title: "Container demand",
        tone: "slate",
        value: "--",
      },
    ];
  }

  const cpuPoints = history.map((point) => point.cpu);
  const memoryPoints = history.map((point) => point.memory);
  const networkPoints = history.map((point) => point.networkTotal);
  const containersCpuPoints = history.map((point) => point.containersCpu);

  return [
    {
      caption: `Load avg ${formatLoadAverage(snapshot.system.loadAverage)}.`,
      delta: getLatestDelta(cpuPoints, (value) => formatPercent(value, 1)),
      points: cpuPoints,
      title: "CPU pressure",
      tone: getUsageTone(snapshot.system.cpuPercent),
      value: formatPercent(snapshot.system.cpuPercent),
    },
    {
      caption: `${formatBytes(snapshot.system.memoryUsedBytes)} of ${formatBytes(snapshot.system.memoryTotalBytes)} in use.`,
      delta: getLatestDelta(memoryPoints, (value) => formatPercent(value, 1)),
      points: memoryPoints,
      title: "Memory footprint",
      tone: getUsageTone(snapshot.system.memoryPercent, {
        calm: 45,
        elevated: 80,
      }),
      value: formatPercent(snapshot.system.memoryPercent),
    },
    {
      caption: `${snapshot.network.interfaces.length} active interfaces tracked.`,
      delta: getLatestDelta(
        networkPoints,
        (value) => formatBytesPerSecond(value),
        1024,
      ),
      points: networkPoints,
      title: "Network throughput",
      tone: "slate",
      value: formatBytesPerSecond(
        snapshot.network.rxBytesPerSecond + snapshot.network.txBytesPerSecond,
      ),
    },
    {
      caption: `${snapshot.containers.running} running containers using ${formatBytes(snapshot.containers.memoryUsedBytes)}.`,
      delta: getLatestDelta(containersCpuPoints, (value) =>
        formatPercent(value, 1),
      ),
      points: containersCpuPoints,
      title: "Container demand",
      tone: getUsageTone(snapshot.containers.cpuPercent, {
        calm: 20,
        elevated: 70,
      }),
      value: formatPercent(snapshot.containers.cpuPercent),
    },
  ];
}

export function buildContainerListEntries(
  snapshot: MetricsSnapshot | null,
  allContainerHistory: AllContainersMetricsHistorySeries[],
  deployments: DeploymentSummary[] = [],
): ContainerListEntry[] {
  const descriptors = buildContainerDescriptors(
    snapshot,
    allContainerHistory,
    deployments,
  );

  return descriptors.map((descriptor) => {
    if (descriptor.runtime) {
      return {
        display: buildDisplayContainer(
          descriptor.runtime,
          descriptor.history,
          snapshot,
        ),
        dotClassName: getStatusDotClassName(
          getPreviewStatus(descriptor.runtime),
        ),
        preview: null,
        runtime: descriptor.runtime,
        sidebarName: descriptor.label,
        sidebarSecondaryLabel:
          descriptor.runtime.projectName ??
          descriptor.runtime.serviceName ??
          "runtime",
        searchText: [
          descriptor.label,
          descriptor.runtime.projectName,
          descriptor.runtime.serviceName,
          descriptor.runtime.name,
          descriptor.runtime.status,
          descriptor.runtime.health,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase(),
      } satisfies ContainerListEntry;
    }

    const latest = descriptor.history[descriptor.history.length - 1] ?? null;
    const display = {
      activity: descriptor.history.map((point) => point.cpuPercent),
      deployedAt: latest
        ? formatDetailedTimestamp(latest.timestamp)
        : "Unknown",
      endpoints: [],
      environment: [],
      id: descriptor.id,
      image: descriptor.label,
      logs: {
        alerts: [],
        events: latest
          ? [
              createLogLine(
                `${descriptor.id}-event`,
                latest.timestamp,
                "info",
                `${descriptor.label} history is available but no live runtime snapshot is attached.`,
              ),
            ]
          : [],
        live: latest
          ? [
              createLogLine(
                `${descriptor.id}-live`,
                latest.timestamp,
                "info",
                `CPU ${formatPercent(latest.cpuPercent, 1)} • memory ${formatBytes(latest.memoryUsedBytes)} • net ${formatBytesPerSecond(latest.networkTotal)}.`,
              ),
            ]
          : [],
      },
      memory: latest ? formatBytes(latest.memoryUsedBytes) : "--",
      name: descriptor.label,
      node: snapshot?.hostIp ?? "Current host",
      port: "Internal",
      region: snapshot?.hostIp ?? "Current host",
      requestRate: latest ? formatBytesPerSecond(latest.networkTotal) : "--",
      restarts: 0,
      signals: [],
      stack: "runtime",
      status: "running" as const,
      summary: `${descriptor.label} has historical samples but no live runtime metadata.`,
      tags: [],
      timeline: [],
      uptime: latest
        ? `Updated ${formatClock(latest.timestamp)}`
        : "History only",
      volumes: [],
      cpu: latest ? formatPercent(latest.cpuPercent, 1) : "--",
    } satisfies PreviewContainer;

    return {
      display,
      dotClassName: getStatusDotClassName(display.status),
      preview: null,
      runtime: null,
      sidebarName: descriptor.label,
      sidebarSecondaryLabel: "history only",
      searchText: `${descriptor.label} history only`.toLowerCase(),
    } satisfies ContainerListEntry;
  });
}

export function buildAggregateLogs(
  snapshot: MetricsSnapshot | null,
  history: MetricsHistoryPoint[],
  allContainerHistory: AllContainersMetricsHistorySeries[],
  deployments: DeploymentSummary[] = [],
) {
  const timestamp =
    snapshot?.timestamp ??
    history[history.length - 1]?.timestamp ??
    new Date().toISOString();
  const descriptors = buildContainerDescriptors(
    snapshot,
    allContainerHistory,
    deployments,
  );
  const hottestCpuRuntime =
    descriptors
      .map((descriptor) => {
        const latest =
          descriptor.history[descriptor.history.length - 1] ?? null;

        return {
          label: descriptor.label,
          value: latest?.cpuPercent ?? descriptor.runtime?.cpuPercent ?? 0,
        };
      })
      .sort((left, right) => right.value - left.value)[0] ?? null;

  const live: LogLine[] = [
    createLogLine(
      "fleet-live-1",
      timestamp,
      "info",
      snapshot
        ? `Host CPU ${formatPercent(snapshot.system.cpuPercent, 1)} • memory ${formatBytes(snapshot.system.memoryUsedBytes)} • net ${formatBytesPerSecond(snapshot.network.rxBytesPerSecond + snapshot.network.txBytesPerSecond)}.`
        : "Waiting for the current host snapshot.",
    ),
    createLogLine(
      "fleet-live-2",
      timestamp,
      hottestCpuRuntime && hottestCpuRuntime.value >= 80
        ? "warning"
        : "success",
      hottestCpuRuntime
        ? `${hottestCpuRuntime.label} is the current CPU hotspot at ${formatPercent(hottestCpuRuntime.value, 1)}.`
        : "Container hotspot data is not available yet.",
    ),
  ];

  const events: LogLine[] = [
    createLogLine(
      "fleet-event-1",
      timestamp,
      "info",
      `${snapshot?.containers.running ?? descriptors.length} running containers are being compared in the explorer.`,
    ),
    createLogLine(
      "fleet-event-2",
      timestamp,
      "success",
      `History window includes ${history.length} host buckets and ${allContainerHistory.length} container series.`,
    ),
  ];

  const alerts: LogLine[] = [];

  if ((snapshot?.containers.statusBreakdown.unhealthy ?? 0) > 0) {
    alerts.push(
      createLogLine(
        "fleet-alert-health",
        timestamp,
        "warning",
        `${snapshot?.containers.statusBreakdown.unhealthy ?? 0} container health warnings are active.`,
      ),
    );
  }

  for (const [index, warning] of (snapshot?.warnings ?? []).entries()) {
    alerts.push(
      createLogLine(
        `fleet-alert-warning-${index}`,
        timestamp,
        "warning",
        warning,
      ),
    );
  }

  return {
    alerts,
    events,
    live,
  } satisfies Record<DashboardLogView, LogLine[]>;
}

export function buildSystemMetricPanels(
  snapshot: MetricsSnapshot | null,
  history: MetricsHistoryPoint[],
): SystemMetricPanel[] {
  const timestamps = history.map((point) => point.timestamp);
  const labels = buildTimeLabels(timestamps);
  const cpuPoints = history.map((point) => point.cpu);
  const memoryPoints = history.map((point) => point.memory);
  const networkInPoints = history.map((point) => point.networkIn);
  const networkOutPoints = history.map((point) => point.networkOut);
  const diskReadPoints = history.map((point) => point.diskRead);
  const diskWritePoints = history.map((point) => point.diskWrite);

  return [
    {
      currentCaption: snapshot
        ? `Load ${formatLoadAverage(snapshot.system.loadAverage)}`
        : "Waiting for host samples",
      currentValue: snapshot
        ? formatPercent(snapshot.system.cpuPercent, 1)
        : "--",
      format: "percent",
      id: "cpu",
      labels,
      primaryValues: cpuPoints,
      stats: [
        {
          label: "Avg",
          value:
            getAverage(cpuPoints) === null
              ? "--"
              : formatPercent(getAverage(cpuPoints)!, 1),
        },
        {
          label: "Peak",
          value:
            getPeak(cpuPoints) === null
              ? "--"
              : formatPercent(getPeak(cpuPoints)!, 1),
        },
        {
          label: "Now",
          value: snapshot ? formatPercent(snapshot.system.cpuPercent, 1) : "--",
        },
      ],
      timestamps,
      title: "Host CPU",
      tone: "emerald",
      variant: "area",
    },
    {
      currentCaption: snapshot
        ? `${formatBytes(snapshot.system.memoryUsedBytes)} of ${formatBytes(snapshot.system.memoryTotalBytes)}`
        : "Waiting for host samples",
      currentValue: snapshot
        ? formatPercent(snapshot.system.memoryPercent, 1)
        : "--",
      format: "percent",
      id: "memory",
      labels,
      primaryValues: memoryPoints,
      stats: [
        {
          label: "Avg",
          value:
            getAverage(memoryPoints) === null
              ? "--"
              : formatPercent(getAverage(memoryPoints)!, 1),
        },
        {
          label: "Peak",
          value:
            getPeak(memoryPoints) === null
              ? "--"
              : formatPercent(getPeak(memoryPoints)!, 1),
        },
        {
          label: "Free",
          value: snapshot
            ? formatBytes(
                Math.max(
                  0,
                  snapshot.system.memoryTotalBytes -
                    snapshot.system.memoryUsedBytes,
                ),
              )
            : "--",
        },
      ],
      timestamps,
      title: "Host memory",
      tone: "amber",
      variant: "bars",
    },
    {
      currentCaption: snapshot
        ? `${snapshot.network.interfaces.length} tracked interfaces`
        : "Waiting for host samples",
      currentValue: snapshot
        ? formatBytesPerSecond(
            snapshot.network.rxBytesPerSecond +
              snapshot.network.txBytesPerSecond,
          )
        : "--",
      format: "bytesPerSecond",
      id: "network",
      labels,
      primaryValues: networkInPoints,
      secondaryValues: networkOutPoints,
      stats: [
        {
          label: "In",
          value: snapshot
            ? formatBytesPerSecond(snapshot.network.rxBytesPerSecond)
            : "--",
        },
        {
          label: "Out",
          value: snapshot
            ? formatBytesPerSecond(snapshot.network.txBytesPerSecond)
            : "--",
        },
        {
          label: "Peak",
          value:
            getPeak(history.map((point) => point.networkTotal)) === null
              ? "--"
              : formatBytesPerSecond(
                  getPeak(history.map((point) => point.networkTotal))!,
                ),
        },
      ],
      timestamps,
      title: "Host network",
      tone: "sky",
      variant: "dual-line",
    },
    {
      currentCaption: snapshot
        ? "Read vs write throughput"
        : "Waiting for host samples",
      currentValue: snapshot
        ? formatBytesPerSecond(
            snapshot.system.diskReadBytesPerSecond +
              snapshot.system.diskWriteBytesPerSecond,
          )
        : "--",
      format: "bytesPerSecond",
      id: "disk",
      labels,
      primaryValues: diskReadPoints,
      secondaryValues: diskWritePoints,
      stats: [
        {
          label: "Read",
          value: snapshot
            ? formatBytesPerSecond(snapshot.system.diskReadBytesPerSecond)
            : "--",
        },
        {
          label: "Write",
          value: snapshot
            ? formatBytesPerSecond(snapshot.system.diskWriteBytesPerSecond)
            : "--",
        },
        {
          label: "Peak",
          value:
            getPeak(
              history.map((point) => point.diskRead + point.diskWrite),
            ) === null
              ? "--"
              : formatBytesPerSecond(
                  getPeak(
                    history.map((point) => point.diskRead + point.diskWrite),
                  )!,
                ),
        },
      ],
      timestamps,
      title: "Host disk",
      tone: "rose",
      variant: "banded",
    },
  ];
}

export function buildContainerMetricPanels(
  snapshot: MetricsSnapshot | null,
  allContainerHistory: AllContainersMetricsHistorySeries[],
  selectedContainerId: string | null,
  deployments: DeploymentSummary[] = [],
): ContainerMetricPanel[] {
  const descriptors = buildContainerDescriptors(
    snapshot,
    allContainerHistory,
    deployments,
  );
  const cpuSeries = alignContainerSeries(
    descriptors,
    selectedContainerId,
    (point) => point.cpuPercent,
    (value) => formatPercent(value, 1),
  );
  const memorySeries = alignContainerSeries(
    descriptors,
    selectedContainerId,
    (point) => point.memoryUsedBytes,
    (value) => formatBytes(value),
  );
  const networkSeries = alignContainerSeries(
    descriptors,
    selectedContainerId,
    (point) => point.networkTotal,
    (value) => formatBytesPerSecond(value),
  );
  const selectedCpuSeries = getSelectedSeries(
    cpuSeries.series,
    selectedContainerId,
  );
  const selectedMemorySeries = getSelectedSeries(
    memorySeries.series,
    selectedContainerId,
  );
  const selectedNetworkSeries = getSelectedSeries(
    networkSeries.series,
    selectedContainerId,
  );
  const topCpuSeries = getTopSeries(cpuSeries.series);
  const topMemorySeries = getTopSeries(memorySeries.series);
  const topNetworkSeries = getTopSeries(networkSeries.series);

  return [
    {
      format: "percent",
      id: "cpu",
      labels: cpuSeries.labels,
      series: cpuSeries.series,
      stats: [
        {
          label: "Tracked",
          value: `${cpuSeries.series.length}`,
        },
        {
          label: "Hot now",
          value: topCpuSeries
            ? `${topCpuSeries.label} ${topCpuSeries.latestValue}`
            : "--",
        },
        {
          label: selectedCpuSeries ? "Focus" : "Peak",
          value: selectedCpuSeries
            ? `${selectedCpuSeries.label} ${selectedCpuSeries.latestValue}`
            : getGlobalPeak(cpuSeries.series) === null
              ? "--"
              : formatPercent(getGlobalPeak(cpuSeries.series)!, 1),
        },
      ],
      timestamps: cpuSeries.timestamps,
      title: "CPU by container",
    },
    {
      format: "bytes",
      id: "memory",
      labels: memorySeries.labels,
      series: memorySeries.series,
      stats: [
        {
          label: "Tracked",
          value: `${memorySeries.series.length}`,
        },
        {
          label: "Hot now",
          value: topMemorySeries
            ? `${topMemorySeries.label} ${topMemorySeries.latestValue}`
            : "--",
        },
        {
          label: selectedMemorySeries ? "Focus" : "Peak",
          value: selectedMemorySeries
            ? `${selectedMemorySeries.label} ${selectedMemorySeries.latestValue}`
            : getGlobalPeak(memorySeries.series) === null
              ? "--"
              : formatBytes(getGlobalPeak(memorySeries.series)!),
        },
      ],
      timestamps: memorySeries.timestamps,
      title: "Memory by container",
    },
    {
      format: "bytesPerSecond",
      id: "network",
      labels: networkSeries.labels,
      series: networkSeries.series,
      stats: [
        {
          label: "Tracked",
          value: `${networkSeries.series.length}`,
        },
        {
          label: "Hot now",
          value: topNetworkSeries
            ? `${topNetworkSeries.label} ${topNetworkSeries.latestValue}`
            : "--",
        },
        {
          label: selectedNetworkSeries ? "Focus" : "Peak",
          value: selectedNetworkSeries
            ? `${selectedNetworkSeries.label} ${selectedNetworkSeries.latestValue}`
            : getGlobalPeak(networkSeries.series) === null
              ? "--"
              : formatBytesPerSecond(getGlobalPeak(networkSeries.series)!),
        },
      ],
      timestamps: networkSeries.timestamps,
      title: "Network by container",
    },
  ];
}

export function formatDashboardRangeLabel(range: DashboardRange) {
  return (
    METRICS_DASHBOARD_RANGE_OPTIONS.find((option) => option.value === range)
      ?.label ?? range
  );
}
