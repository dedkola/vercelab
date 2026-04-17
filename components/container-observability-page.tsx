"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";

import { Icon } from "@/components/dashboard-kit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import type { MetricsHistoryPoint } from "@/lib/influx-metrics";
import type { MetricsSnapshot } from "@/lib/system-metrics";
import { cn } from "@/lib/utils";

type MetricTone = "emerald" | "amber" | "slate";
type ContainerStatus = "running" | "degraded" | "idle";
type LogView = "live" | "events" | "alerts";

type MetricCard = {
  title: string;
  value: string;
  caption: string;
  delta: string;
  points: number[];
  tone: MetricTone;
};

type ContainerSignal = {
  label: string;
  value: string;
  delta: string;
  caption: string;
  tone: MetricTone;
  points: number[];
};

type Endpoint = {
  name: string;
  latency: string;
  uptime: string;
  load: number;
};

type LogLine = {
  id: string;
  timestamp: string;
  level: "info" | "success" | "warning";
  message: string;
};

type MockContainer = {
  id: string;
  name: string;
  stack: string;
  image: string;
  node: string;
  status: ContainerStatus;
  summary: string;
  uptime: string;
  port: string;
  cpu: string;
  memory: string;
  restarts: number;
  requestRate: string;
  region: string;
  deployedAt: string;
  tags: string[];
  volumes: string[];
  environment: Array<{ key: string; value: string }>;
  endpoints: Endpoint[];
  activity: number[];
  signals: ContainerSignal[];
  timeline: Array<{ label: string; detail: string }>;
  logs: Record<LogView, LogLine[]>;
};

const METRICS_PANEL_STORAGE_KEY = "vercelab:containers-metrics-panel-width";
const LIST_PANEL_STORAGE_KEY = "vercelab:containers-list-panel-width";
const LOGS_PANEL_STORAGE_KEY = "vercelab:containers-logs-panel-width";

const DEFAULT_METRICS_WIDTH_PX = 248;
const DEFAULT_LIST_WIDTH_PX = 304;
const DEFAULT_LOGS_WIDTH_PX = 340;

const MIN_METRICS_WIDTH_PX = 216;
const MAX_METRICS_WIDTH_PX = 420;
const MIN_LIST_WIDTH_PX = 260;
const MAX_LIST_WIDTH_PX = 420;
const MIN_LOGS_WIDTH_PX = 300;
const MAX_LOGS_WIDTH_PX = 520;
const POLL_INTERVAL_MS = 5000;

const CONTAINERS: MockContainer[] = [
  {
    id: "control-plane",
    name: "control-plane",
    stack: "vercelab",
    image: "ghcr.io/dedkola/vercelab:preview",
    node: "edge-a / arm64",
    status: "running",
    summary:
      "Primary dashboard surface with deployment controls, health signals, and background orchestration hooks.",
    uptime: "3d 14h",
    port: "3000 -> 3000",
    cpu: "18%",
    memory: "612 MB",
    restarts: 0,
    requestRate: "148 req/min",
    region: "fra-1",
    deployedAt: "Today, 08:15",
    tags: ["Next.js", "Control plane", "Traefik"],
    volumes: ["./data:/app/data", "./logs:/app/logs", "/var/run/docker.sock"],
    environment: [
      { key: "NODE_ENV", value: "production" },
      { key: "NEXT_RUNTIME", value: "nodejs" },
      { key: "METRICS_MODE", value: "preview" },
      { key: "LOG_LEVEL", value: "info" },
    ],
    endpoints: [
      { name: "/dashboard", latency: "112 ms", uptime: "99.98%", load: 72 },
      { name: "/api/metrics", latency: "74 ms", uptime: "99.94%", load: 56 },
      { name: "/api/deployments", latency: "128 ms", uptime: "99.89%", load: 68 },
    ],
    activity: [24, 28, 33, 35, 39, 42, 46, 45, 49, 47, 43, 40],
    signals: [
      {
        label: "CPU trend",
        value: "18%",
        delta: "-2%",
        caption: "Healthy render cadence and API idle time.",
        tone: "emerald",
        points: [16, 17, 18, 20, 19, 22, 24, 22, 21, 19, 18, 18],
      },
      {
        label: "Memory trend",
        value: "612 MB",
        delta: "+48 MB",
        caption: "Resident set stayed stable after the last deploy.",
        tone: "amber",
        points: [420, 440, 470, 500, 520, 536, 548, 570, 586, 598, 604, 612],
      },
      {
        label: "Network trend",
        value: "148 req/min",
        delta: "+12%",
        caption: "Traffic mirrors the morning sync window.",
        tone: "slate",
        points: [78, 82, 84, 90, 102, 110, 126, 138, 145, 151, 148, 148],
      },
    ],
    timeline: [
      { label: "Last deploy", detail: "Merged preview branch 23 min ago." },
      { label: "Health check", detail: "Traefik and Postgres probes are green." },
      { label: "Queue depth", detail: "No pending background operations." },
    ],
    logs: {
      live: [
        {
          id: "cp-live-1",
          timestamp: "09:14:10",
          level: "info",
          message: "GET /api/metrics 200 in 42 ms",
        },
        {
          id: "cp-live-2",
          timestamp: "09:14:11",
          level: "success",
          message: "Rendered overview workspace with 5 live panels",
        },
        {
          id: "cp-live-3",
          timestamp: "09:14:16",
          level: "info",
          message: "Polling Influx snapshot for sidebar telemetry",
        },
        {
          id: "cp-live-4",
          timestamp: "09:14:19",
          level: "warning",
          message: "Soft latency bump on /api/deployments list query",
        },
      ],
      events: [
        {
          id: "cp-event-1",
          timestamp: "08:51:22",
          level: "success",
          message: "Preview deployment marked ready",
        },
        {
          id: "cp-event-2",
          timestamp: "08:42:07",
          level: "info",
          message: "Background sync refreshed repository metadata",
        },
        {
          id: "cp-event-3",
          timestamp: "08:31:03",
          level: "info",
          message: "Sidebars restored saved panel widths from local storage",
        },
      ],
      alerts: [
        {
          id: "cp-alert-1",
          timestamp: "09:14:19",
          level: "warning",
          message: "Latency crossed design target for a single request window",
        },
      ],
    },
  },
  {
    id: "edge-proxy",
    name: "edge-proxy",
    stack: "traefik",
    image: "traefik:v3.3",
    node: "edge-a / arm64",
    status: "running",
    summary:
      "Public ingress, TLS termination, and request routing for all managed workloads.",
    uptime: "9d 05h",
    port: "443 -> 443",
    cpu: "9%",
    memory: "186 MB",
    restarts: 0,
    requestRate: "1.2k req/min",
    region: "fra-1",
    deployedAt: "Yesterday, 19:40",
    tags: ["Ingress", "TLS", "Routing"],
    volumes: ["/etc/traefik", "./dynamic", "./acme.json"],
    environment: [
      { key: "TRAEFIK_LOG_LEVEL", value: "WARN" },
      { key: "TRAEFIK_PROVIDERS", value: "docker,file" },
    ],
    endpoints: [
      { name: "TLS handshake", latency: "34 ms", uptime: "99.99%", load: 82 },
      { name: "Router sync", latency: "19 ms", uptime: "99.97%", load: 58 },
      { name: "Dashboard", latency: "41 ms", uptime: "99.95%", load: 44 },
    ],
    activity: [42, 46, 48, 51, 56, 60, 62, 65, 61, 58, 54, 52],
    signals: [
      {
        label: "CPU trend",
        value: "9%",
        delta: "-1%",
        caption: "Proxy is largely limited by network bursts.",
        tone: "emerald",
        points: [8, 7, 9, 8, 10, 11, 12, 11, 10, 9, 9, 9],
      },
      {
        label: "Memory trend",
        value: "186 MB",
        delta: "+14 MB",
        caption: "TLS sessions warmed slightly during the last hour.",
        tone: "amber",
        points: [142, 148, 151, 154, 160, 166, 170, 173, 178, 182, 186, 186],
      },
      {
        label: "Network trend",
        value: "1.2k req/min",
        delta: "+6%",
        caption: "Ingress rose with the latest preview rollout.",
        tone: "slate",
        points: [680, 720, 740, 790, 860, 910, 1020, 1110, 1180, 1210, 1200, 1200],
      },
    ],
    timeline: [
      { label: "Certificate sync", detail: "ACME renewals valid for 54 days." },
      { label: "Router drift", detail: "No stale routes detected." },
      { label: "Connection pressure", detail: "Peak concurrency held below 40%." },
    ],
    logs: {
      live: [
        {
          id: "ep-live-1",
          timestamp: "09:14:15",
          level: "info",
          message: "Handled tls-alpn challenge lookup for preview domain",
        },
        {
          id: "ep-live-2",
          timestamp: "09:14:17",
          level: "success",
          message: "Routed request to control-plane@docker",
        },
      ],
      events: [
        {
          id: "ep-event-1",
          timestamp: "07:50:44",
          level: "info",
          message: "Dynamic file provider reloaded 12 routers and 9 services",
        },
      ],
      alerts: [],
    },
  },
  {
    id: "postgres-primary",
    name: "postgres-primary",
    stack: "database",
    image: "postgres:17",
    node: "edge-b / amd64",
    status: "degraded",
    summary:
      "Main relational store backing repositories, deployments, and operation history.",
    uptime: "12d 02h",
    port: "5432 -> 5432",
    cpu: "31%",
    memory: "2.8 GB",
    restarts: 1,
    requestRate: "420 tx/min",
    region: "fra-1",
    deployedAt: "Today, 02:10",
    tags: ["Database", "Persistent", "Replica pending"],
    volumes: ["/var/lib/postgresql/data", "./backup"],
    environment: [
      { key: "PGDATA", value: "/var/lib/postgresql/data" },
      { key: "MAX_CONNECTIONS", value: "200" },
    ],
    endpoints: [
      { name: "Primary reads", latency: "12 ms", uptime: "99.92%", load: 74 },
      { name: "Writes", latency: "26 ms", uptime: "99.85%", load: 81 },
      { name: "Replication", latency: "214 ms", uptime: "98.84%", load: 32 },
    ],
    activity: [34, 36, 40, 44, 49, 51, 55, 58, 56, 53, 48, 46],
    signals: [
      {
        label: "CPU trend",
        value: "31%",
        delta: "+8%",
        caption: "Write bursts are slightly higher than the morning baseline.",
        tone: "amber",
        points: [20, 22, 24, 27, 29, 31, 34, 36, 35, 33, 31, 31],
      },
      {
        label: "Memory trend",
        value: "2.8 GB",
        delta: "+0.3 GB",
        caption: "Shared buffers expanded after vacuum and analytics jobs.",
        tone: "amber",
        points: [1900, 1950, 2010, 2140, 2220, 2310, 2440, 2520, 2640, 2710, 2790, 2800],
      },
      {
        label: "Network trend",
        value: "420 tx/min",
        delta: "+14%",
        caption: "Burst queue still below the alert threshold.",
        tone: "slate",
        points: [220, 238, 244, 258, 286, 315, 344, 368, 389, 402, 420, 420],
      },
    ],
    timeline: [
      { label: "Replica lag", detail: "Hot standby trails primary by 7 seconds." },
      { label: "Recent maintenance", detail: "Autovacuum completed 46 minutes ago." },
      { label: "Backup window", detail: "Snapshot scheduled in 1 hour." },
    ],
    logs: {
      live: [
        {
          id: "pg-live-1",
          timestamp: "09:14:12",
          level: "warning",
          message: "replication slot apply delay crossed soft threshold",
        },
        {
          id: "pg-live-2",
          timestamp: "09:14:14",
          level: "info",
          message: "checkpoint completed in 4.2 s",
        },
      ],
      events: [
        {
          id: "pg-event-1",
          timestamp: "08:30:05",
          level: "success",
          message: "autovacuum on operations table finished successfully",
        },
      ],
      alerts: [
        {
          id: "pg-alert-1",
          timestamp: "09:14:12",
          level: "warning",
          message: "Replica lag is visible but not service affecting",
        },
      ],
    },
  },
  {
    id: "worker-builds",
    name: "worker-builds",
    stack: "jobs",
    image: "ghcr.io/dedkola/build-worker:latest",
    node: "edge-c / amd64",
    status: "running",
    summary:
      "Background worker handling image builds, cleanup passes, and deployment jobs.",
    uptime: "1d 09h",
    port: "internal only",
    cpu: "24%",
    memory: "428 MB",
    restarts: 0,
    requestRate: "18 jobs/hr",
    region: "fra-2",
    deployedAt: "Today, 06:40",
    tags: ["Worker", "Build queue", "Docker"],
    volumes: ["./cache", "./workspace", "/var/run/docker.sock"],
    environment: [
      { key: "QUEUE_CONCURRENCY", value: "2" },
      { key: "GC_MODE", value: "balanced" },
    ],
    endpoints: [
      { name: "Build queue", latency: "4 s", uptime: "99.90%", load: 64 },
      { name: "Artifact upload", latency: "812 ms", uptime: "99.87%", load: 52 },
      { name: "Cleanup", latency: "1.2 s", uptime: "99.95%", load: 26 },
    ],
    activity: [18, 22, 21, 24, 28, 33, 31, 29, 35, 38, 32, 28],
    signals: [
      {
        label: "CPU trend",
        value: "24%",
        delta: "+4%",
        caption: "Image build steps are holding steady with warm cache hits.",
        tone: "emerald",
        points: [14, 15, 18, 17, 19, 23, 26, 27, 28, 26, 24, 24],
      },
      {
        label: "Memory trend",
        value: "428 MB",
        delta: "+36 MB",
        caption: "Ephemeral layers are being released between jobs.",
        tone: "amber",
        points: [260, 274, 290, 308, 330, 348, 362, 381, 396, 410, 422, 428],
      },
      {
        label: "Network trend",
        value: "18 jobs/hr",
        delta: "+2",
        caption: "Deployment bursts cluster around merge windows.",
        tone: "slate",
        points: [6, 8, 7, 10, 12, 13, 11, 14, 17, 19, 18, 18],
      },
    ],
    timeline: [
      { label: "Queue health", detail: "Two builds in progress, one queued." },
      { label: "Image cache", detail: "Cache hit ratio stayed at 86%." },
      { label: "Cleanup cadence", detail: "Workspace prune ran 7 min ago." },
    ],
    logs: {
      live: [
        {
          id: "wb-live-1",
          timestamp: "09:14:20",
          level: "info",
          message: "Queued deploy: preview-control-plane-402",
        },
      ],
      events: [
        {
          id: "wb-event-1",
          timestamp: "09:02:11",
          level: "success",
          message: "Image build finished in 2m 42s with cached layers",
        },
      ],
      alerts: [],
    },
  },
  {
    id: "redis-cache",
    name: "redis-cache",
    stack: "cache",
    image: "redis:8",
    node: "edge-a / arm64",
    status: "idle",
    summary:
      "Low-churn shared cache used for queue coordination and short-lived UI reads.",
    uptime: "5d 21h",
    port: "6379 -> 6379",
    cpu: "3%",
    memory: "148 MB",
    restarts: 0,
    requestRate: "62 ops/min",
    region: "fra-1",
    deployedAt: "Yesterday, 11:05",
    tags: ["Cache", "Ephemeral", "Low churn"],
    volumes: ["./redis-data"],
    environment: [
      { key: "MAXMEMORY_POLICY", value: "allkeys-lru" },
      { key: "SAVE", value: "disabled" },
    ],
    endpoints: [
      { name: "Reads", latency: "5 ms", uptime: "99.99%", load: 24 },
      { name: "Writes", latency: "6 ms", uptime: "99.99%", load: 18 },
      { name: "Evictions", latency: "0 ms", uptime: "100%", load: 4 },
    ],
    activity: [6, 5, 6, 5, 4, 5, 6, 5, 4, 5, 4, 4],
    signals: [
      {
        label: "CPU trend",
        value: "3%",
        delta: "0%",
        caption: "Mostly quiet aside from worker coordination traffic.",
        tone: "emerald",
        points: [2, 2, 3, 2, 3, 4, 3, 3, 2, 3, 3, 3],
      },
      {
        label: "Memory trend",
        value: "148 MB",
        delta: "+4 MB",
        caption: "Key churn is flat with steady expiration behavior.",
        tone: "amber",
        points: [132, 134, 138, 140, 141, 142, 144, 145, 146, 147, 148, 148],
      },
      {
        label: "Network trend",
        value: "62 ops/min",
        delta: "-3%",
        caption: "Background refreshes remain comfortably below limits.",
        tone: "slate",
        points: [66, 68, 64, 63, 65, 66, 64, 62, 61, 60, 62, 62],
      },
    ],
    timeline: [
      { label: "Evictions", detail: "No keys evicted in the last 24 hours." },
      { label: "Persistence", detail: "Snapshotting disabled for this tier." },
      { label: "Warm cache", detail: "Hit rate stable at 94%." },
    ],
    logs: {
      live: [
        {
          id: "rc-live-1",
          timestamp: "09:13:58",
          level: "info",
          message: "expired 12 keys from preview namespace",
        },
      ],
      events: [],
      alerts: [],
    },
  },
];

const LOG_VIEW_OPTIONS: Array<{ value: LogView; label: string }> = [
  { value: "live", label: "Live tail" },
  { value: "events", label: "Events" },
  { value: "alerts", label: "Alerts" },
];

function getStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  const storage = window.localStorage;

  if (
    !storage ||
    typeof storage.getItem !== "function" ||
    typeof storage.setItem !== "function" ||
    typeof storage.removeItem !== "function"
  ) {
    return null;
  }

  return storage;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatClock(value: string) {
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatLoadAverage(
  loadAverage: MetricsSnapshot["system"]["loadAverage"],
) {
  return loadAverage.map((value) => value.toFixed(2)).join(" / ");
}

function formatPercent(value: number, maximumFractionDigits = 0) {
  return `${value.toFixed(maximumFractionDigits)}%`;
}

function formatBytes(
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

function formatBytesPerSecond(value: number) {
  return `${formatBytes(value, value >= 1024 ** 2 ? 1 : 0)}/s`;
}

function formatSignedDelta(value: number, formatter: (delta: number) => string) {
  if (!Number.isFinite(value) || Math.abs(value) < 0.05) {
    return "Stable";
  }

  return `${value > 0 ? "+" : "-"}${formatter(Math.abs(value))}`;
}

function getLatestDelta(
  points: number[],
  formatter: (delta: number) => string,
  minimumDelta = 0.05,
) {
  if (points.length < 2) {
    return "Snapshot";
  }

  const delta = points[points.length - 1]! - points[points.length - 2]!;

  if (Math.abs(delta) < minimumDelta) {
    return "Stable";
  }

  return formatSignedDelta(delta, formatter);
}

function getUsageTone(
  value: number,
  thresholds = { calm: 35, elevated: 75 },
): MetricTone {
  if (value >= thresholds.elevated) {
    return "amber";
  }

  if (value <= thresholds.calm) {
    return "emerald";
  }

  return "slate";
}

function buildLiveServerMetrics(
  snapshot: MetricsSnapshot | null,
  history: MetricsHistoryPoint[],
): MetricCard[] {
  if (!snapshot) {
    return [
      {
        title: "CPU pressure",
        value: "--",
        caption: "Waiting for live host samples.",
        delta: "Connecting",
        points: [],
        tone: "slate",
      },
      {
        title: "Memory footprint",
        value: "--",
        caption: "Waiting for InfluxDB history.",
        delta: "Connecting",
        points: [],
        tone: "slate",
      },
      {
        title: "Network throughput",
        value: "--",
        caption: "Recent ingress and egress will appear here.",
        delta: "Connecting",
        points: [],
        tone: "slate",
      },
      {
        title: "Container demand",
        value: "--",
        caption: "Aggregate container pressure will appear here.",
        delta: "Connecting",
        points: [],
        tone: "slate",
      },
    ];
  }

  const cpuPoints = history.map((point) => point.cpu);
  const memoryPoints = history.map((point) => point.memory);
  const networkPoints = history.map((point) => point.networkTotal);
  const containersCpuPoints = history.map((point) => point.containersCpu);

  return [
    {
      title: "CPU pressure",
      value: formatPercent(snapshot.system.cpuPercent),
      caption: `Load avg ${formatLoadAverage(snapshot.system.loadAverage)}.`,
      delta: getLatestDelta(cpuPoints, (delta) => formatPercent(delta, 1)),
      points: cpuPoints,
      tone: getUsageTone(snapshot.system.cpuPercent),
    },
    {
      title: "Memory footprint",
      value: formatPercent(snapshot.system.memoryPercent),
      caption: `${formatBytes(snapshot.system.memoryUsedBytes)} of ${formatBytes(snapshot.system.memoryTotalBytes)} in use.`,
      delta: getLatestDelta(memoryPoints, (delta) => formatPercent(delta, 1)),
      points: memoryPoints,
      tone: getUsageTone(snapshot.system.memoryPercent, {
        calm: 45,
        elevated: 80,
      }),
    },
    {
      title: "Network throughput",
      value: formatBytesPerSecond(
        snapshot.network.rxBytesPerSecond + snapshot.network.txBytesPerSecond,
      ),
      caption: `${snapshot.network.interfaces.length} active interfaces tracked.`,
      delta: getLatestDelta(
        networkPoints,
        (delta) => formatBytesPerSecond(delta),
        1024,
      ),
      points: networkPoints,
      tone: "slate",
    },
    {
      title: "Container demand",
      value: formatPercent(snapshot.containers.cpuPercent),
      caption: `${snapshot.containers.running} running containers using ${formatBytes(snapshot.containers.memoryUsedBytes)}.`,
      delta: getLatestDelta(
        containersCpuPoints,
        (delta) => formatPercent(delta, 1),
      ),
      points: containersCpuPoints,
      tone: getUsageTone(snapshot.containers.cpuPercent, {
        calm: 20,
        elevated: 70,
      }),
    },
  ];
}

function useStoredPanelWidth(
  key: string,
  initialWidth: number,
  minWidth: number,
  maxWidth: number,
) {
  const [width, setWidth] = useState(initialWidth);

  useEffect(() => {
    const storedWidth = getStorage()?.getItem(key);

    if (!storedWidth) {
      return;
    }

    const parsedWidth = Number.parseInt(storedWidth, 10);

    if (!Number.isFinite(parsedWidth)) {
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWidth(clamp(parsedWidth, minWidth, maxWidth));
  }, [key, maxWidth, minWidth]);

  useEffect(() => {
    getStorage()?.setItem(key, String(Math.round(width)));
  }, [key, width]);

  return [width, setWidth] as const;
}

function formatStatusLabel(status: ContainerStatus) {
  switch (status) {
    case "running":
      return "Running";
    case "degraded":
      return "Degraded";
    case "idle":
      return "Idle";
  }
}

function getStatusBadgeVariant(
  status: ContainerStatus,
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

function getStatusDotClassName(status: ContainerStatus) {
  switch (status) {
    case "running":
      return "bg-emerald-500";
    case "degraded":
      return "bg-amber-500";
    case "idle":
      return "bg-slate-400";
  }
}

function getLogDotClassName(level: LogLine["level"]) {
  switch (level) {
    case "success":
      return "bg-emerald-500";
    case "warning":
      return "bg-amber-500";
    case "info":
      return "bg-slate-400";
  }
}

function getToneClasses(tone: MetricTone) {
  switch (tone) {
    case "emerald":
      return {
        badge: "border-emerald-200/80 bg-emerald-50/90 text-emerald-700",
        border: "border-emerald-200/70",
        surface: "from-emerald-50/80 via-background to-background",
        delta: "text-emerald-700",
        stroke: "rgba(5, 150, 105, 0.95)",
        fill: "rgba(16, 185, 129, 0.16)",
        grid: "rgba(16, 185, 129, 0.10)",
      };
    case "amber":
      return {
        badge: "border-amber-200/80 bg-amber-50/90 text-amber-700",
        border: "border-amber-200/70",
        surface: "from-amber-50/80 via-background to-background",
        delta: "text-amber-700",
        stroke: "rgba(217, 119, 6, 0.95)",
        fill: "rgba(245, 158, 11, 0.16)",
        grid: "rgba(245, 158, 11, 0.10)",
      };
    case "slate":
      return {
        badge: "border-slate-200/80 bg-slate-50/90 text-slate-700",
        border: "border-slate-200/70",
        surface: "from-slate-50/80 via-background to-background",
        delta: "text-slate-700",
        stroke: "rgba(71, 85, 105, 0.95)",
        fill: "rgba(148, 163, 184, 0.16)",
        grid: "rgba(148, 163, 184, 0.10)",
      };
  }
}

function Sparkline({
  className,
  height = 42,
  points,
  tone,
}: {
  className?: string;
  height?: number;
  points: number[];
  tone: MetricTone;
}) {
  const width = 180;
  const toneClasses = getToneClasses(tone);
  const coordinates = useMemo(() => {
    const safePoints = points.length ? points : [0, 0, 0, 0, 0, 0];
    const max = Math.max(...safePoints);
    const min = Math.min(...safePoints);
    const range = max - min || 1;
    const step =
      safePoints.length > 1 ? width / (safePoints.length - 1) : width;
    const safeHeight = Math.max(24, height);

    const linePoints = safePoints
      .map((value, index) => {
        const x = Number((index * step).toFixed(2));
        const normalized = (value - min) / range;
        const y = Number((safeHeight - normalized * (safeHeight - 10) - 5).toFixed(2));
        return `${x},${y}`;
      })
      .join(" ");

    return {
      areaPoints: `0,${safeHeight} ${linePoints} ${width},${safeHeight}`,
      linePoints,
      safeHeight,
    };
  }, [height, points]);

  return (
    <svg
      aria-hidden="true"
      className={cn("w-full", className)}
      viewBox={`0 0 ${width} ${coordinates.safeHeight}`}
      preserveAspectRatio="none"
    >
      <path
        d={`M0 ${coordinates.safeHeight - 1} H${width}`}
        stroke={toneClasses.grid}
        strokeDasharray="3 6"
        strokeWidth="1"
      />
      <polygon fill={toneClasses.fill} points={coordinates.areaPoints} />
      <polyline
        fill="none"
        points={coordinates.linePoints}
        stroke={toneClasses.stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.5"
      />
    </svg>
  );
}

function ResizeHandle({
  className,
  onMouseDown,
}: {
  className?: string;
  onMouseDown: (event: ReactMouseEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "group relative z-10 w-3 shrink-0 cursor-col-resize",
        className,
      )}
      onMouseDown={onMouseDown}
    >
      <div className="absolute inset-y-3 left-1/2 w-px -translate-x-1/2 rounded-full bg-border transition-colors duration-200 group-hover:bg-emerald-300" />
      <div className="absolute left-1/2 top-1/2 h-10 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-background shadow-[0_10px_25px_-18px_rgba(15,23,42,0.45)] ring-1 ring-border transition-all duration-200 group-hover:bg-emerald-50 group-hover:ring-emerald-200/80" />
    </div>
  );
}

function SectionLabel({
  icon,
  text,
}: {
  icon: "network" | "cloud" | "syslog" | "monitor";
  text: string;
}) {
  return (
    <Badge className="gap-1 border border-border/60 bg-background/85 text-foreground shadow-sm">
      <Icon name={icon} className="h-3.5 w-3.5" />
      {text}
    </Badge>
  );
}

export function ContainerObservabilityPage() {
  const [metricsWidth, setMetricsWidth] = useStoredPanelWidth(
    METRICS_PANEL_STORAGE_KEY,
    DEFAULT_METRICS_WIDTH_PX,
    MIN_METRICS_WIDTH_PX,
    MAX_METRICS_WIDTH_PX,
  );
  const [listWidth, setListWidth] = useStoredPanelWidth(
    LIST_PANEL_STORAGE_KEY,
    DEFAULT_LIST_WIDTH_PX,
    MIN_LIST_WIDTH_PX,
    MAX_LIST_WIDTH_PX,
  );
  const [logsWidth, setLogsWidth] = useStoredPanelWidth(
    LOGS_PANEL_STORAGE_KEY,
    DEFAULT_LOGS_WIDTH_PX,
    MIN_LOGS_WIDTH_PX,
    MAX_LOGS_WIDTH_PX,
  );
  const [isMetricsCollapsed, setIsMetricsCollapsed] = useState(false);
  const [isLogsCollapsed, setIsLogsCollapsed] = useState(false);
  const [selectedContainerId, setSelectedContainerId] = useState(
    CONTAINERS[0]?.id ?? "",
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [logView, setLogView] = useState<LogView>("live");
  const [sidebarSnapshot, setSidebarSnapshot] = useState<MetricsSnapshot | null>(
    null,
  );
  const [sidebarHistory, setSidebarHistory] = useState<MetricsHistoryPoint[]>([]);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const dragStateRef = useRef<{
    kind: "metrics" | "list" | "logs" | null;
    startWidth: number;
    startX: number;
  }>({
    kind: null,
    startWidth: 0,
    startX: 0,
  });
  const serverMetrics = useMemo(
    () => buildLiveServerMetrics(sidebarSnapshot, sidebarHistory),
    [sidebarHistory, sidebarSnapshot],
  );
  const metricsStatus = metricsError
    ? {
        badgeLabel: "Retrying",
        badgeClassName: "border-amber-200/80 bg-amber-50/90 text-amber-700",
        helperText: metricsError,
      }
    : sidebarSnapshot && sidebarHistory.length
      ? {
          badgeLabel: "Live",
          badgeClassName:
            "border-emerald-200/80 bg-emerald-50/90 text-emerald-700",
          helperText: `Updated ${formatClock(sidebarSnapshot.timestamp)} from Influx-backed history.`,
        }
      : sidebarSnapshot
        ? {
            badgeLabel: "Snapshot only",
            badgeClassName:
              "border-amber-200/80 bg-amber-50/90 text-amber-700",
            helperText: "Waiting for InfluxDB history samples to populate the charts.",
          }
        : {
            badgeLabel: "Connecting",
            badgeClassName: "border-border/60 bg-background/80 text-foreground",
            helperText: "Loading current host metrics.",
          };

  const filteredContainers = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return CONTAINERS;
    }

    return CONTAINERS.filter((container) => {
      const searchableText = [
        container.name,
        container.stack,
        container.image,
        container.summary,
      ]
        .join(" ")
        .toLowerCase();

      return searchableText.includes(normalizedQuery);
    });
  }, [searchQuery]);

  const activeContainerId =
    filteredContainers.some((container) => container.id === selectedContainerId)
      ? selectedContainerId
      : filteredContainers[0]?.id ?? CONTAINERS[0]?.id ?? selectedContainerId;

  const selectedContainer =
    CONTAINERS.find((container) => container.id === activeContainerId) ??
    CONTAINERS[0];

  useEffect(() => {
    let active = true;

    const poll = async () => {
      try {
        const response = await fetch("/api/metrics?mode=current", {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`Metrics request failed with ${response.status}.`);
        }

        const payload = (await response.json()) as {
          snapshot: MetricsSnapshot;
          history: MetricsHistoryPoint[];
        };

        if (!active) {
          return;
        }

        setSidebarSnapshot(payload.snapshot);
        setSidebarHistory(payload.history ?? []);
        setMetricsError(null);
      } catch (error) {
        if (!active) {
          return;
        }

        const message =
          error instanceof Error ? error.message : "Unable to load live metrics.";

        console.error(message);
        setMetricsError(message);
      }
    };

    void poll();
    const intervalId = window.setInterval(() => {
      void poll();
    }, POLL_INTERVAL_MS);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    function handleMouseMove(event: MouseEvent) {
      switch (dragStateRef.current.kind) {
        case "metrics":
          setMetricsWidth(
            clamp(
              dragStateRef.current.startWidth +
                (event.clientX - dragStateRef.current.startX),
              MIN_METRICS_WIDTH_PX,
              MAX_METRICS_WIDTH_PX,
            ),
          );
          break;
        case "list":
          setListWidth(
            clamp(
              dragStateRef.current.startWidth +
                (event.clientX - dragStateRef.current.startX),
              MIN_LIST_WIDTH_PX,
              MAX_LIST_WIDTH_PX,
            ),
          );
          break;
        case "logs":
          setLogsWidth(
            clamp(
              dragStateRef.current.startWidth +
                (dragStateRef.current.startX - event.clientX),
              MIN_LOGS_WIDTH_PX,
              MAX_LOGS_WIDTH_PX,
            ),
          );
          break;
        default:
          break;
      }
    }

    function handleMouseUp() {
      if (!dragStateRef.current.kind) {
        return;
      }

      dragStateRef.current.kind = null;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [setListWidth, setLogsWidth, setMetricsWidth]);

  useEffect(() => {
    function syncResponsivePanels() {
      if (window.innerWidth < 1280) {
        setIsLogsCollapsed(true);
      }

      if (window.innerWidth < 1120) {
        setIsMetricsCollapsed(true);
      }
    }

    syncResponsivePanels();
    window.addEventListener("resize", syncResponsivePanels);

    return () => {
      window.removeEventListener("resize", syncResponsivePanels);
    };
  }, []);

  function handleResizeStart(
    kind: "metrics" | "list" | "logs",
    event: ReactMouseEvent<HTMLDivElement>,
  ) {
    const startWidth =
      kind === "metrics" ? metricsWidth : kind === "list" ? listWidth : logsWidth;

    dragStateRef.current = {
      kind,
      startWidth,
      startX: event.clientX,
    };

    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  }

  function handleResetLayout() {
    const storage = getStorage();

    storage?.removeItem(METRICS_PANEL_STORAGE_KEY);
    storage?.removeItem(LIST_PANEL_STORAGE_KEY);
    storage?.removeItem(LOGS_PANEL_STORAGE_KEY);
    setMetricsWidth(DEFAULT_METRICS_WIDTH_PX);
    setListWidth(DEFAULT_LIST_WIDTH_PX);
    setLogsWidth(DEFAULT_LOGS_WIDTH_PX);
    setIsMetricsCollapsed(false);
    setIsLogsCollapsed(false);
  }

  const previewLogs = selectedContainer.logs[logView];

  return (
    <section
      className="flex h-screen flex-col bg-linear-to-b from-background via-muted/12 to-background"
      aria-label="Container observability preview"
    >
      <header className="flex h-15 shrink-0 items-center justify-between gap-4 border-b border-border/70 bg-linear-to-r from-background/98 via-muted/40 to-background/96 px-4 shadow-[0_20px_48px_-38px_rgba(15,23,42,0.45)] backdrop-blur-xl">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex items-center gap-2 rounded-full border border-border/70 bg-background/85 px-3.5 py-1.5 shadow-[0_16px_36px_-28px_rgba(15,23,42,0.35)]">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="text-sm font-semibold tracking-tight text-foreground">
              Vercelab
            </span>
          </div>
          <Separator orientation="vertical" className="hidden h-5 md:block" />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold tracking-tight text-foreground">
                Container operations workspace
              </div>
              <div className="truncate text-xs text-muted-foreground">
                Live Influx-backed host metrics on the left rail with preview data for the rest of the workspace.
              </div>
            </div>
          </div>

        <div className="hidden min-w-0 flex-1 items-center justify-center gap-2 xl:flex">
          <Badge className="border-emerald-200/80 bg-emerald-50/90 text-emerald-700">
            Live shell preview
          </Badge>
          <Badge className="border-amber-200/80 bg-amber-50/90 text-amber-700">
            Minimal accents
          </Badge>
          <Badge className="border-border/60 bg-background/80 text-foreground">
            Smooth panel transitions
          </Badge>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-8 px-3 text-[11px]"
            onClick={handleResetLayout}
          >
            Reset layout
          </Button>
          <Button asChild variant="default" size="sm">
            <Link href="/">Back to dashboard</Link>
          </Button>
        </div>
      </header>

      <div className="flex min-w-0 flex-1 overflow-hidden">
        {isMetricsCollapsed ? (
          <aside className="flex w-11 shrink-0 items-start border-r border-border/70 bg-linear-to-b from-background via-muted/26 to-background px-1.5 py-2 shadow-[20px_0_54px_-44px_rgba(15,23,42,0.3)]">
            <Button
              type="button"
              aria-label="Show server load sidebar"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setIsMetricsCollapsed(false)}
            >
              <Icon name="chevron-right" className="h-3.5 w-3.5" />
            </Button>
          </aside>
        ) : (
          <>
            <aside
              className="flex shrink-0 flex-col border-r border-border/70 bg-linear-to-b from-background via-muted/14 to-background shadow-[22px_0_72px_-58px_rgba(15,23,42,0.34)] transition-[width] duration-300"
              style={{ width: metricsWidth }}
            >
              <div className="flex items-center justify-between gap-3 border-b border-border/60 px-3 py-3">
                <div className="space-y-1">
                  <SectionLabel icon="network" text="Server load" />
                  <div className="text-xs text-muted-foreground">
                    Realtime host signals from InfluxDB.
                  </div>
                </div>
                <Button
                  type="button"
                  aria-label="Hide server load sidebar"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setIsMetricsCollapsed(true)}
                >
                  <Icon name="chevron-left" className="h-3.5 w-3.5" />
                </Button>
              </div>

              <ScrollArea className="h-full">
                <div className="space-y-4 p-3">
                  <div className="rounded-[1.35rem] border border-border/70 bg-linear-to-br from-background/96 via-muted/16 to-background px-4 py-4 shadow-[0_22px_54px_-44px_rgba(15,23,42,0.32)]">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold tracking-tight text-foreground">
                          Host summary
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {sidebarSnapshot
                            ? `${sidebarSnapshot.containers.running} running containers on ${sidebarSnapshot.hostIp}.`
                            : "Waiting for the first host snapshot."}
                        </div>
                      </div>
                      <Badge className={metricsStatus.badgeClassName}>
                        {metricsStatus.badgeLabel}
                      </Badge>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                      <div className="rounded-2xl border border-border/60 bg-background/80 px-3 py-2.5">
                        <div className="text-muted-foreground">CPU headroom</div>
                        <div className="mt-1 text-sm font-semibold text-foreground">
                          {sidebarSnapshot
                            ? formatPercent(
                                Math.max(
                                  0,
                                  100 - sidebarSnapshot.system.cpuPercent,
                                ),
                              )
                            : "--"}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-border/60 bg-background/80 px-3 py-2.5">
                        <div className="text-muted-foreground">Memory headroom</div>
                        <div className="mt-1 text-sm font-semibold text-foreground">
                          {sidebarSnapshot
                            ? formatBytes(
                                Math.max(
                                  0,
                                  sidebarSnapshot.system.memoryTotalBytes -
                                    sidebarSnapshot.system.memoryUsedBytes,
                                ),
                                1,
                              )
                            : "--"}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 text-[11px] text-muted-foreground">
                      {sidebarSnapshot
                        ? `Load avg ${formatLoadAverage(sidebarSnapshot.system.loadAverage)} • ${formatBytesPerSecond(sidebarSnapshot.network.rxBytesPerSecond)} down / ${formatBytesPerSecond(sidebarSnapshot.network.txBytesPerSecond)} up`
                        : metricsStatus.helperText}
                    </div>
                  </div>

                  {((sidebarSnapshot && !sidebarHistory.length) || metricsError) && (
                    <div className="rounded-[1.2rem] border border-amber-200/80 bg-amber-50/80 px-3.5 py-3 text-xs text-amber-800 shadow-[0_18px_44px_-40px_rgba(217,119,6,0.35)]">
                      {metricsStatus.helperText}
                    </div>
                  )}

                  {serverMetrics.map((metric) => {
                    const toneClasses = getToneClasses(metric.tone);

                    return (
                      <Card
                        key={metric.title}
                        className={cn(
                          "overflow-hidden bg-linear-to-br shadow-[0_20px_56px_-46px_rgba(15,23,42,0.32)]",
                          toneClasses.surface,
                        )}
                      >
                        <CardHeader className="space-y-2 border-b border-border/60 pb-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <CardTitle>{metric.title}</CardTitle>
                              <CardDescription>{metric.caption}</CardDescription>
                            </div>
                            <Badge className={cn("shadow-none", toneClasses.badge)}>
                              {metric.delta}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3 pt-3">
                          <div className="text-xl font-semibold tracking-tight text-foreground">
                            {metric.value}
                          </div>
                          <Sparkline points={metric.points} tone={metric.tone} />
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </ScrollArea>
            </aside>

            <ResizeHandle onMouseDown={(event) => handleResizeStart("metrics", event)} />
          </>
        )}

        <aside
          className="flex shrink-0 flex-col border-r border-border/70 bg-linear-to-b from-background via-muted/10 to-background shadow-[18px_0_56px_-52px_rgba(15,23,42,0.24)] transition-[width] duration-300"
          style={{ width: listWidth }}
        >
          <div className="space-y-3 border-b border-border/60 px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-1">
                <SectionLabel icon="cloud" text="Containers" />
                <div className="text-xs text-muted-foreground">
                  Select a workload to inspect its focused view.
                </div>
              </div>
              <Badge className="border-border/60 bg-background/80 text-foreground">
                {filteredContainers.length} visible
              </Badge>
            </div>
            <div className="relative">
              <Icon
                name="search"
                className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                aria-label="Search containers"
                className="h-10 rounded-2xl bg-background/80 pl-9 shadow-[0_18px_42px_-30px_rgba(15,23,42,0.22)]"
                placeholder="Search containers, stacks, images..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </div>
          </div>

          <ScrollArea className="h-full">
            <div className="space-y-3 p-3">
              {filteredContainers.length ? (
                filteredContainers.map((container) => (
                  <button
                    key={container.id}
                    type="button"
                    className={cn(
                      "w-full rounded-[1.35rem] border px-4 py-4 text-left transition-all duration-200",
                      "shadow-[0_20px_52px_-42px_rgba(15,23,42,0.24)] hover:-translate-y-px hover:bg-background/95",
                      activeContainerId === container.id
                        ? "border-emerald-200/80 bg-linear-to-br from-emerald-50/80 via-background to-background shadow-[0_26px_60px_-44px_rgba(16,185,129,0.26)]"
                        : "border-border/70 bg-background/85",
                    )}
                    onClick={() => setSelectedContainerId(container.id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "h-2 w-2 rounded-full",
                              getStatusDotClassName(container.status),
                            )}
                          />
                          <div className="truncate text-sm font-semibold tracking-tight text-foreground">
                            {container.name}
                          </div>
                        </div>
                        <div className="mt-1 truncate text-xs text-muted-foreground">
                          {container.stack} - {container.image}
                        </div>
                      </div>
                      <Badge variant={getStatusBadgeVariant(container.status)}>
                        {formatStatusLabel(container.status)}
                      </Badge>
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                      <div className="rounded-2xl border border-border/60 bg-background/80 px-2.5 py-2">
                        <div className="text-muted-foreground">CPU</div>
                        <div className="mt-1 font-semibold text-foreground">
                          {container.cpu}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-border/60 bg-background/80 px-2.5 py-2">
                        <div className="text-muted-foreground">Memory</div>
                        <div className="mt-1 font-semibold text-foreground">
                          {container.memory}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-border/60 bg-background/80 px-2.5 py-2">
                        <div className="text-muted-foreground">Port</div>
                        <div className="mt-1 truncate font-semibold text-foreground">
                          {container.port}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4">
                      <Sparkline className="h-12" points={container.activity} tone="slate" />
                    </div>
                  </button>
                ))
              ) : (
                <div className="rounded-[1.35rem] border border-dashed border-border/80 bg-background/70 px-4 py-10 text-center shadow-[0_18px_46px_-40px_rgba(15,23,42,0.2)]">
                  <div className="text-sm font-semibold tracking-tight text-foreground">
                    No matching containers
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Try a broader search term to repopulate the preview list.
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </aside>

        <ResizeHandle onMouseDown={(event) => handleResizeStart("list", event)} />

        <main className="min-w-0 flex-1 overflow-auto bg-linear-to-b from-background/72 via-muted/14 to-background p-4 md:p-5">
          <div className="space-y-4">
            <section className="overflow-hidden rounded-[1.75rem] border border-border/70 bg-linear-to-r from-background via-muted/20 to-background shadow-[0_32px_96px_-64px_rgba(15,23,42,0.42)]">
              <div className="flex flex-col gap-6 px-5 py-5 xl:flex-row xl:items-end xl:justify-between">
                <div className="max-w-3xl space-y-3">
                  <SectionLabel icon="monitor" text="Focused container" />
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
                        {selectedContainer.name}
                      </h1>
                      <Badge variant={getStatusBadgeVariant(selectedContainer.status)}>
                        {formatStatusLabel(selectedContainer.status)}
                      </Badge>
                    </div>
                    <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                      {selectedContainer.summary}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-[repeat(auto-fit,minmax(8.5rem,1fr))] gap-3">
                  <div className="rounded-2xl border border-border/60 bg-background/82 px-4 py-3 shadow-[0_18px_42px_-30px_rgba(15,23,42,0.24)]">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                      Runtime
                    </div>
                    <div className="mt-1 text-sm font-semibold text-foreground">
                      {selectedContainer.uptime}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-border/60 bg-background/82 px-4 py-3 shadow-[0_18px_42px_-30px_rgba(15,23,42,0.24)]">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                      Node
                    </div>
                    <div className="mt-1 text-sm font-semibold text-foreground">
                      {selectedContainer.node}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-border/60 bg-background/82 px-4 py-3 shadow-[0_18px_42px_-30px_rgba(15,23,42,0.24)]">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                      Region
                    </div>
                    <div className="mt-1 text-sm font-semibold text-foreground">
                      {selectedContainer.region}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-border/60 bg-background/82 px-4 py-3 shadow-[0_18px_42px_-30px_rgba(15,23,42,0.24)]">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                      Exposed port
                    </div>
                    <div className="mt-1 text-sm font-semibold text-foreground">
                      {selectedContainer.port}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <div className="grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-4">
              <Card className="overflow-hidden border-border/70 bg-linear-to-br from-emerald-50/70 via-background to-background">
                <CardHeader className="border-b border-border/60">
                  <CardTitle>CPU</CardTitle>
                  <CardDescription>Current compute demand.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 pt-3">
                  <div className="text-2xl font-semibold tracking-tight text-foreground">
                    {selectedContainer.cpu}
                  </div>
                  <Sparkline className="h-14" points={selectedContainer.signals[0].points} tone="emerald" />
                </CardContent>
              </Card>

              <Card className="overflow-hidden border-border/70 bg-linear-to-br from-amber-50/70 via-background to-background">
                <CardHeader className="border-b border-border/60">
                  <CardTitle>Memory</CardTitle>
                  <CardDescription>Resident set and cache.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 pt-3">
                  <div className="text-2xl font-semibold tracking-tight text-foreground">
                    {selectedContainer.memory}
                  </div>
                  <Sparkline className="h-14" points={selectedContainer.signals[1].points} tone="amber" />
                </CardContent>
              </Card>

              <Card className="overflow-hidden border-border/70 bg-linear-to-br from-slate-50/80 via-background to-background">
                <CardHeader className="border-b border-border/60">
                  <CardTitle>Traffic</CardTitle>
                  <CardDescription>Request or job flow.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 pt-3">
                  <div className="text-2xl font-semibold tracking-tight text-foreground">
                    {selectedContainer.requestRate}
                  </div>
                  <Sparkline className="h-14" points={selectedContainer.signals[2].points} tone="slate" />
                </CardContent>
              </Card>

              <Card className="overflow-hidden border-border/70 bg-linear-to-br from-background via-muted/14 to-background">
                <CardHeader className="border-b border-border/60">
                  <CardTitle>Restarts</CardTitle>
                  <CardDescription>Recent container churn.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 pt-3">
                  <div className="text-2xl font-semibold tracking-tight text-foreground">
                    {selectedContainer.restarts}
                  </div>
                  <div className="rounded-2xl border border-border/60 bg-background/80 px-3 py-3 text-xs leading-5 text-muted-foreground">
                    Last rollout landed {selectedContainer.deployedAt.toLowerCase()} with{" "}
                    {selectedContainer.restarts === 0 ? "no" : selectedContainer.restarts} unexpected restarts.
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
              <Card className="overflow-hidden border-border/70 bg-card/92">
                <CardHeader className="border-b border-border/60 bg-linear-to-r from-muted/52 via-background to-background">
                  <CardTitle>Current container signals</CardTitle>
                  <CardDescription>
                    Small trend cards tuned for a quiet, operational read.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 pt-4 lg:grid-cols-3">
                  {selectedContainer.signals.map((signal) => {
                    const toneClasses = getToneClasses(signal.tone);

                    return (
                      <div
                        key={signal.label}
                        className={cn(
                          "rounded-[1.35rem] border bg-linear-to-br px-4 py-4 shadow-[0_20px_52px_-44px_rgba(15,23,42,0.22)]",
                          toneClasses.border,
                          toneClasses.surface,
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold tracking-tight text-foreground">
                              {signal.label}
                            </div>
                            <div className="mt-1 text-xs leading-5 text-muted-foreground">
                              {signal.caption}
                            </div>
                          </div>
                          <div className={cn("text-xs font-semibold", toneClasses.delta)}>
                            {signal.delta}
                          </div>
                        </div>
                        <div className="mt-4 text-xl font-semibold tracking-tight text-foreground">
                          {signal.value}
                        </div>
                        <Sparkline className="mt-4 h-16" points={signal.points} tone={signal.tone} />
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              <Card className="overflow-hidden border-border/70 bg-card/92">
                <CardHeader className="border-b border-border/60 bg-linear-to-r from-muted/52 via-background to-background">
                  <CardTitle>Runtime overview</CardTitle>
                  <CardDescription>
                    Topology, endpoints, and rollout notes for the selected workload.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 pt-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[1.25rem] border border-border/60 bg-background/80 px-4 py-3">
                      <div className="text-xs text-muted-foreground">Image</div>
                      <div className="mt-1 text-sm font-semibold text-foreground">
                        {selectedContainer.image}
                      </div>
                    </div>
                    <div className="rounded-[1.25rem] border border-border/60 bg-background/80 px-4 py-3">
                      <div className="text-xs text-muted-foreground">Stack</div>
                      <div className="mt-1 text-sm font-semibold text-foreground">
                        {selectedContainer.stack}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {selectedContainer.endpoints.map((endpoint) => (
                      <div
                        key={endpoint.name}
                        className="rounded-[1.2rem] border border-border/60 bg-background/80 px-4 py-3"
                      >
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <div className="font-semibold text-foreground">
                            {endpoint.name}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {endpoint.latency} - {endpoint.uptime}
                          </div>
                        </div>
                        <div className="mt-3 h-2 rounded-full bg-muted/70">
                          <div
                            className="h-2 rounded-full bg-linear-to-r from-emerald-400 to-amber-300"
                            style={{ width: `${endpoint.load}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2 rounded-[1.2rem] border border-border/60 bg-background/80 px-4 py-3">
                    {selectedContainer.timeline.map((event) => (
                      <div key={event.label} className="flex gap-3 text-sm">
                        <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-500/80" />
                        <div>
                          <div className="font-semibold tracking-tight text-foreground">
                            {event.label}
                          </div>
                          <div className="text-xs leading-5 text-muted-foreground">
                            {event.detail}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
              <Card className="overflow-hidden border-border/70 bg-card/92">
                <CardHeader className="border-b border-border/60 bg-linear-to-r from-muted/52 via-background to-background">
                  <CardTitle>Environment and mounts</CardTitle>
                  <CardDescription>
                    UI-only preview cards for config, volumes, and attached context.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 pt-4 lg:grid-cols-2">
                  <div className="space-y-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      Environment
                    </div>
                    {selectedContainer.environment.map((item) => (
                      <div
                        key={item.key}
                        className="rounded-[1.2rem] border border-border/60 bg-background/80 px-4 py-3"
                      >
                        <div className="text-xs text-muted-foreground">{item.key}</div>
                        <div className="mt-1 font-mono text-sm text-foreground">
                          {item.value}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      Volumes
                    </div>
                    {selectedContainer.volumes.map((volume) => (
                      <div
                        key={volume}
                        className="rounded-[1.2rem] border border-border/60 bg-background/80 px-4 py-3"
                      >
                        <div className="font-mono text-sm text-foreground">{volume}</div>
                      </div>
                    ))}
                    <div className="flex flex-wrap gap-2 pt-1">
                      {selectedContainer.tags.map((tag) => (
                        <Badge
                          key={tag}
                          className="border-border/60 bg-muted/70 text-foreground"
                        >
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="overflow-hidden border-border/70 bg-card/92">
                <CardHeader className="border-b border-border/60 bg-linear-to-r from-muted/52 via-background to-background">
                  <CardTitle>Design notes</CardTitle>
                  <CardDescription>
                    The page leans on neutral surfaces, soft depth, and green or amber accents only where meaning helps.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 pt-4 text-sm leading-6 text-muted-foreground">
                  <div className="rounded-[1.2rem] border border-border/60 bg-background/80 px-4 py-3">
                    Left and right rails collapse into slim control columns, while the three drag handles keep the layout adjustable without overpowering the content.
                  </div>
                  <div className="rounded-[1.2rem] border border-border/60 bg-background/80 px-4 py-3">
                    Cards keep the same visual rhythm as the main dashboard: rounded corners, subtle gradients, light shadows, and restrained borders.
                  </div>
                  <div className="rounded-[1.2rem] border border-border/60 bg-background/80 px-4 py-3">
                    This route intentionally ships as a static preview so the final data hooks can be wired in later without redesigning the shell.
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </main>

        {!isLogsCollapsed ? (
          <ResizeHandle onMouseDown={(event) => handleResizeStart("logs", event)} />
        ) : null}

        {isLogsCollapsed ? (
          <aside className="flex w-11 shrink-0 items-start border-l border-border/70 bg-linear-to-b from-background via-muted/26 to-background px-1.5 py-2 shadow-[-20px_0_54px_-44px_rgba(15,23,42,0.3)]">
            <Button
              type="button"
              aria-label="Show logs sidebar"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setIsLogsCollapsed(false)}
            >
              <Icon name="chevron-left" className="h-3.5 w-3.5" />
            </Button>
          </aside>
        ) : (
          <aside
            className="flex shrink-0 flex-col border-l border-border/70 bg-linear-to-b from-background via-muted/16 to-background shadow-[-22px_0_72px_-58px_rgba(15,23,42,0.34)] transition-[width] duration-300"
            style={{ width: logsWidth }}
          >
            <div className="flex items-center justify-between gap-3 border-b border-border/60 px-3 py-3">
              <div className="space-y-1">
                <SectionLabel icon="syslog" text="Logs" />
                <div className="text-xs text-muted-foreground">
                  Quiet terminal framing for the selected container.
                </div>
              </div>
              <Button
                type="button"
                aria-label="Hide logs sidebar"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setIsLogsCollapsed(true)}
              >
                <Icon name="chevron-right" className="h-3.5 w-3.5" />
              </Button>
            </div>

            <div className="border-b border-border/60 px-3 py-3">
              <div className="flex flex-wrap gap-2">
                {LOG_VIEW_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-semibold tracking-tight transition-all duration-200",
                      logView === option.value
                        ? "border-emerald-200/80 bg-emerald-50/90 text-emerald-700 shadow-sm"
                        : "border-border/60 bg-background/80 text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() => setLogView(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <ScrollArea className="h-full">
              <div className="space-y-4 p-3">
                <div className="rounded-[1.35rem] border border-border/70 bg-linear-to-br from-background/96 via-muted/14 to-background px-4 py-4 shadow-[0_20px_56px_-46px_rgba(15,23,42,0.32)]">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold tracking-tight text-foreground">
                        {selectedContainer.name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        docker logs -f --tail 150 {selectedContainer.name}
                      </div>
                    </div>
                    <Badge variant={getStatusBadgeVariant(selectedContainer.status)}>
                      {formatStatusLabel(selectedContainer.status)}
                    </Badge>
                  </div>
                </div>

                <div className="overflow-hidden rounded-[1.35rem] border border-border/70 bg-[#0f1720] shadow-[0_24px_70px_-50px_rgba(15,23,42,0.5)]">
                  <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
                    <div className="flex items-center gap-2 text-xs text-slate-300">
                      <span className="h-2 w-2 rounded-full bg-emerald-400" />
                      Tail preview
                    </div>
                    <div className="font-mono text-[11px] text-slate-400">
                      {previewLogs.length} lines
                    </div>
                  </div>

                  <div className="space-y-2 px-4 py-4 font-mono text-[12px] leading-6 text-slate-200">
                    {previewLogs.length ? (
                      previewLogs.map((line) => (
                        <div key={line.id} className="flex gap-3">
                          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-500">
                            <span
                              className={cn(
                                "block h-1.5 w-1.5 rounded-full",
                                getLogDotClassName(line.level),
                              )}
                            />
                          </span>
                          <span className="shrink-0 text-slate-500">
                            {line.timestamp}
                          </span>
                          <span className="text-slate-100">{line.message}</span>
                        </div>
                      ))
                    ) : (
                      <div className="text-slate-400">
                        No lines in this view for the current static preview.
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-3 rounded-[1.35rem] border border-border/70 bg-background/88 px-4 py-4 shadow-[0_20px_52px_-44px_rgba(15,23,42,0.24)]">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Active context
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[1.2rem] border border-border/60 bg-background/80 px-3 py-3">
                      <div className="text-xs text-muted-foreground">Current view</div>
                      <div className="mt-1 text-sm font-semibold text-foreground">
                        {LOG_VIEW_OPTIONS.find((option) => option.value === logView)?.label}
                      </div>
                    </div>
                    <div className="rounded-[1.2rem] border border-border/60 bg-background/80 px-3 py-3">
                      <div className="text-xs text-muted-foreground">Selected region</div>
                      <div className="mt-1 text-sm font-semibold text-foreground">
                        {selectedContainer.region}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </ScrollArea>
          </aside>
        )}
      </div>
    </section>
  );
}
