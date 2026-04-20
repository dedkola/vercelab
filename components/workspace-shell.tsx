"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type FormEvent,
} from "react";
import { GitBranch, Home, type LucideIcon } from "lucide-react";
import { toast } from "sonner";

import { DashboardLeftSidebar } from "@/components/workspace/dashboard-left-sidebar";
import {
  DashboardAllContainersContent,
  type AllContainersMetricChart,
} from "@/components/workspace/dashboard-all-containers-content";
import {
  DashboardMainContent,
  type FocusedMetricChart,
} from "@/components/workspace/dashboard-main-content";
import { DashboardRightSidebar } from "@/components/workspace/dashboard-right-sidebar";
import { GitAppPageLeftSidebar } from "@/components/workspace/git-app-page-left-sidebar";
import { GitAppPageMainContent } from "@/components/workspace/git-app-page-main-content";
import { GitAppPageRightSidebar } from "@/components/workspace/git-app-page-right-sidebar";
import { type HostMetricsSidebarProps } from "@/components/workspace/host-metrics-sidebar";
import { WorkspaceFooter } from "@/components/workspace/workspace-footer";
import { WorkspaceHeader } from "@/components/workspace/workspace-header";
import { WorkspaceRail } from "@/components/workspace/workspace-rail";
import { SectionLabel } from "@/components/workspace/workspace-ui";
import {
  fetchDeploymentFromGitAction,
  redeployDeploymentAction,
  removeDeploymentAction,
  stopDeploymentAction,
  updateDeploymentAction,
  type DeploymentActionResult,
} from "@/app/actions";
import type { LogTab } from "./git-log-panel";
import { getContainerTone } from "@/lib/container-tone";
import type { GitHubRepository } from "@/lib/github";
import type {
  AllContainersMetricsHistorySeries,
  ContainerMetricsHistoryPoint,
  MetricsHistoryPoint,
} from "@/lib/influx-metrics";
import {
  DASHBOARD_RANGE_OPTIONS,
  type DashboardRange,
} from "@/lib/metrics-range";
import type { DeploymentSummary } from "@/lib/persistence";
import type { ContainerStats, MetricsSnapshot } from "@/lib/system-metrics";

export type MetricTone = "emerald" | "amber" | "slate";
export type PreviewContainerStatus = "running" | "degraded" | "idle";
export type DashboardLogView = "live" | "events" | "alerts";
export type WorkspaceView = "dashboard" | "git-app-page";

export type MetricCard = {
  title: string;
  value: string;
  caption: string;
  delta: string;
  points: number[];
  tone: MetricTone;
};

export type ContainerSignal = {
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

export type LogLine = {
  id: string;
  timestamp: string;
  level: "info" | "success" | "warning";
  message: string;
};

export type PreviewContainer = {
  id: string;
  name: string;
  stack: string;
  image: string;
  node: string;
  status: PreviewContainerStatus;
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
  logs: Record<DashboardLogView, LogLine[]>;
};

export type ContainerListEntry = {
  display: PreviewContainer;
  dotClassName: string;
  preview: PreviewContainer | null;
  runtime: ContainerStats | null;
  sidebarName: string;
  sidebarSecondaryLabel: string;
  searchText: string;
};

type WorkspaceShellProps = {
  baseDomain?: string;
  initialContainerHistory?: ContainerMetricsHistoryPoint[];
  initialDashboardRange?: DashboardRange;
  initialDeployments?: DeploymentSummary[];
  initialHistory?: MetricsHistoryPoint[];
  initialView?: WorkspaceView;
  initialSnapshot?: MetricsSnapshot | null;
};

export type DraftAppState = {
  appName: string;
  branch: string;
  port: string;
  repositoryUrl: string;
  subdomain: string;
};

export type RepositoryState = {
  error: string | null;
  hasLoaded: boolean;
  isLoading: boolean;
  repositories: GitHubRepository[];
  tokenConfigured: boolean;
};

type BranchState = {
  branchesByRepositoryId: Record<string, string[]>;
  error: string | null;
  isLoading: boolean;
};

const METRICS_PANEL_STORAGE_KEY = "vercelab:containers-metrics-panel-width";
const LIST_PANEL_STORAGE_KEY = "vercelab:containers-list-panel-width";
const LOGS_PANEL_STORAGE_KEY = "vercelab:containers-logs-panel-width";

const DEFAULT_METRICS_WIDTH_PX = 248;
const DEFAULT_LIST_WIDTH_PX = 304;
const DEFAULT_LOGS_WIDTH_PX = 340;
const EMPTY_DEPLOYMENTS: DeploymentSummary[] = [];
const EMPTY_CONTAINER_HISTORY: ContainerMetricsHistoryPoint[] = [];
const EMPTY_CONTAINER_LIST: ContainerListEntry[] = [];
const EMPTY_FOCUSED_METRIC_CHARTS: FocusedMetricChart[] = [];
const EMPTY_ALL_CONTAINERS_METRIC_CHARTS: AllContainersMetricChart[] = [];

const MIN_METRICS_WIDTH_PX = 216;
const MAX_METRICS_WIDTH_PX = 420;
const MIN_LIST_WIDTH_PX = 260;
const MAX_LIST_WIDTH_PX = 420;
const MIN_LOGS_WIDTH_PX = 300;
const MAX_LOGS_WIDTH_PX = 520;
const LIVE_POLL_INTERVAL_MS = 10000;
const HIDDEN_LIVE_POLL_INTERVAL_MS = 30000;
const LIVE_POLL_ERROR_BACKOFF_MAX_MS = 60000;
const VISIBILITY_REFRESH_DELAY_MS = 750;
const ALL_CONTAINERS_ID = "__all-containers__";
const STABLE_TIME_ZONE = "UTC";
const ALL_CONTAINERS_RANGE_OPTIONS = DASHBOARD_RANGE_OPTIONS.filter(
  (option) => option.value !== "90d",
) as ReadonlyArray<(typeof DASHBOARD_RANGE_OPTIONS)[number]>;

const PREVIEW_CONTAINERS: PreviewContainer[] = [
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
      {
        name: "/api/deployments",
        latency: "128 ms",
        uptime: "99.89%",
        load: 68,
      },
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
      {
        label: "Health check",
        detail: "Traefik and Postgres probes are green.",
      },
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
          message: "Rendered dashboard workspace with 5 live panels",
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
        points: [
          680, 720, 740, 790, 860, 910, 1020, 1110, 1180, 1210, 1200, 1200,
        ],
      },
    ],
    timeline: [
      { label: "Certificate sync", detail: "ACME renewals valid for 54 days." },
      { label: "Router drift", detail: "No stale routes detected." },
      {
        label: "Connection pressure",
        detail: "Peak concurrency held below 40%.",
      },
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
        points: [
          1900, 1950, 2010, 2140, 2220, 2310, 2440, 2520, 2640, 2710, 2790,
          2800,
        ],
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
      {
        label: "Replica lag",
        detail: "Hot standby trails primary by 7 seconds.",
      },
      {
        label: "Recent maintenance",
        detail: "Autovacuum completed 46 minutes ago.",
      },
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
      {
        name: "Artifact upload",
        latency: "812 ms",
        uptime: "99.87%",
        load: 52,
      },
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

const LOG_VIEW_OPTIONS: Array<{ value: DashboardLogView; label: string }> = [
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
    timeZone: STABLE_TIME_ZONE,
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

function formatSignedDelta(
  value: number,
  formatter: (delta: number) => string,
) {
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
      delta: getLatestDelta(containersCpuPoints, (delta) =>
        formatPercent(delta, 1),
      ),
      points: containersCpuPoints,
      tone: getUsageTone(snapshot.containers.cpuPercent, {
        calm: 20,
        elevated: 70,
      }),
    },
  ];
}

function formatRuntimeHealthLabel(health: ContainerStats["health"]) {
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

function formatRuntimeStatusLabel(runtime: ContainerStats) {
  if (runtime.health === "unhealthy") {
    return "Unhealthy";
  }

  if (runtime.health === "starting") {
    return "Starting";
  }

  return runtime.status.charAt(0).toUpperCase() + runtime.status.slice(1);
}

function getRuntimeDotClassName(
  runtime: Pick<ContainerStats, "health" | "status">,
) {
  const tone = getContainerTone(runtime);

  if (tone === "running") {
    return "bg-emerald-500";
  }

  if (tone === "unhealthy" || runtime.health === "starting") {
    return "bg-amber-500";
  }

  return "bg-slate-400";
}

function createFlatSeries(value: number) {
  return Array.from({ length: 12 }, () => value);
}

function getRuntimePreviewStatus(
  runtime: ContainerStats,
): PreviewContainerStatus {
  const tone = getContainerTone(runtime);

  if (tone === "running") {
    return "running";
  }

  if (tone === "unhealthy") {
    return "degraded";
  }

  return "idle";
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

function buildRuntimeContainerMetricsKey(
  runtime: Pick<ContainerStats, "id" | "name">,
) {
  return `${runtime.id}:${runtime.name}`;
}

function formatAverageValue(
  points: number[],
  formatter: (value: number) => string,
) {
  if (!points.length) {
    return "--";
  }

  return formatter(
    points.reduce((sum, point) => sum + point, 0) / points.length,
  );
}

function formatPeakValue(
  points: number[],
  formatter: (value: number) => string,
) {
  if (!points.length) {
    return "--";
  }

  return formatter(Math.max(...points));
}

type AggregateHistoryContainer = {
  history: ContainerMetricsHistoryPoint[];
  id: string;
  label: string;
};

function getLatestSeriesTotal(points: number[]) {
  return points.length ? points[points.length - 1]! : null;
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

function buildAggregateHistoryContainers(
  snapshot: MetricsSnapshot | null,
  allContainerHistory: AllContainersMetricsHistorySeries[],
): AggregateHistoryContainer[] {
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
        label: formatManagedContainerLabel(runtime.name),
      }));
  }

  return [...allContainerHistory]
    .sort((left, right) =>
      left.containerName.localeCompare(right.containerName),
    )
    .map((series) => ({
      history: series.points,
      id: series.containerId,
      label: formatManagedContainerLabel(series.containerName),
    }));
}

function alignAllContainersMetricSeries(
  containers: AggregateHistoryContainer[],
  selectValue: (point: ContainerMetricsHistoryPoint) => number,
  formatter: (value: number) => string,
) {
  const timestamps = Array.from(
    new Set(
      containers.flatMap((container) =>
        container.history.map((point) => point.timestamp),
      ),
    ),
  ).sort();

  const linesWithMaps = containers.map((container) => {
    const valuesByTimestamp = new Map(
      container.history.map((point) => [point.timestamp, selectValue(point)]),
    );
    const latestPoint = container.history[container.history.length - 1] ?? null;

    return {
      id: container.id,
      label: container.label,
      latestValue: latestPoint ? formatter(selectValue(latestPoint)) : "--",
      points: timestamps.map(
        (timestamp) => valuesByTimestamp.get(timestamp) ?? null,
      ),
      valuesByTimestamp,
    };
  });

  return {
    latestTimestamp: timestamps[timestamps.length - 1] ?? null,
    lines: linesWithMaps.map((line) => ({
      id: line.id,
      label: line.label,
      latestValue: line.latestValue,
      points: line.points,
    })),
    totalPoints: timestamps.map((timestamp) =>
      linesWithMaps.reduce(
        (sum, line) => sum + (line.valuesByTimestamp.get(timestamp) ?? 0),
        0,
      ),
    ),
  } satisfies {
    latestTimestamp: string | null;
    lines: AllContainersMetricChart["series"];
    totalPoints: number[];
  };
}

function buildAllContainersMetricCharts(
  range: DashboardRange,
  snapshot: MetricsSnapshot | null,
  allContainerHistory: AllContainersMetricsHistorySeries[],
): AllContainersMetricChart[] {
  const containers = buildAggregateHistoryContainers(
    snapshot,
    allContainerHistory,
  );
  const liveNetworkTotal = snapshot
    ? snapshot.containers.all.reduce(
        (sum, container) => sum + container.networkTotalBytesPerSecond,
        0,
      )
    : 0;
  const liveDiskTotal = snapshot
    ? snapshot.containers.all.reduce(
        (sum, container) => sum + container.diskTotalBytesPerSecond,
        0,
      )
    : 0;
  const cpuMetric = alignAllContainersMetricSeries(
    containers,
    (point) => point.cpuPercent,
    (value) => formatPercent(value, 1),
  );
  const memoryMetric = alignAllContainersMetricSeries(
    containers,
    (point) => point.memoryUsedBytes,
    (value) => formatBytes(value),
  );
  const networkMetric = alignAllContainersMetricSeries(
    containers,
    (point) => point.networkTotal,
    (value) => formatBytesPerSecond(value),
  );
  const diskMetric = alignAllContainersMetricSeries(
    containers,
    (point) => point.diskTotal,
    (value) => formatBytesPerSecond(value),
  );

  const latestCpuTotal = getLatestSeriesTotal(cpuMetric.totalPoints);
  const latestMemoryTotal = getLatestSeriesTotal(memoryMetric.totalPoints);
  const latestNetworkTotal = getLatestSeriesTotal(networkMetric.totalPoints);
  const latestDiskTotal = getLatestSeriesTotal(diskMetric.totalPoints);

  return [
    {
      series: cpuMetric.lines,
      summaryLabel: "Fleet load",
      summaryValue: snapshot
        ? formatPercent(snapshot.containers.cpuPercent, 1)
        : latestCpuTotal !== null
          ? formatPercent(latestCpuTotal, 1)
          : "--",
      title: "CPU load",
      variant: "cpu",
    },
    {
      series: memoryMetric.lines,
      summaryLabel: "Resident set",
      summaryValue: snapshot
        ? formatBytes(snapshot.containers.memoryUsedBytes)
        : latestMemoryTotal !== null
          ? formatBytes(latestMemoryTotal)
          : "--",
      title: "Memory load",
      variant: "memory",
    },
    {
      series: networkMetric.lines,
      summaryLabel: "Live throughput",
      summaryValue:
        liveNetworkTotal > 0
          ? formatBytesPerSecond(liveNetworkTotal)
          : latestNetworkTotal !== null
            ? formatBytesPerSecond(latestNetworkTotal)
            : "--",
      title: "Network",
      variant: "network",
    },
    {
      series: diskMetric.lines,
      summaryLabel: "Live I/O",
      summaryValue:
        liveDiskTotal > 0
          ? formatBytesPerSecond(liveDiskTotal)
          : latestDiskTotal !== null
            ? formatBytesPerSecond(latestDiskTotal)
            : "--",
      title: "Disk I/O",
      variant: "disk",
    },
  ];
}

function buildFocusedMetricCharts(
  runtime: ContainerStats | null,
  history: ContainerMetricsHistoryPoint[],
  preview: PreviewContainer,
): FocusedMetricChart[] {
  if (!runtime) {
    return [
      {
        delta: "Preview",
        legends: [
          {
            label: "Latest",
            value: preview.cpu,
          },
          {
            label: "Mode",
            value: "Scaffold",
          },
        ],
        primaryPoints: preview.signals[0]?.points ?? [],
        trendPoints: preview.signals[0]?.points ?? [],
        title: "CPU load",
        value: preview.cpu,
        variant: "cpu",
      },
      {
        delta: "Preview",
        legends: [
          {
            label: "Latest",
            value: preview.memory,
          },
          {
            label: "Mode",
            value: "Scaffold",
          },
        ],
        primaryPoints: preview.signals[1]?.points ?? [],
        trendPoints: preview.signals[1]?.points ?? [],
        title: "Memory load",
        value: preview.memory,
        variant: "memory",
      },
      {
        delta: "Preview",
        legends: [
          {
            label: "Flow",
            value: preview.requestRate,
          },
        ],
        primaryPoints: preview.signals[2]?.points ?? [],
        secondaryPoints: [],
        trendPoints: preview.signals[2]?.points ?? [],
        title: "Network",
        value: preview.requestRate,
        variant: "network",
      },
      {
        delta: "Live only",
        legends: [
          {
            label: "Source",
            value: "InfluxDB",
          },
        ],
        primaryPoints: [],
        secondaryPoints: [],
        trendPoints: [],
        title: "Disk I/O",
        value: "--",
        variant: "disk",
      },
    ];
  }

  const latest = history[history.length - 1] ?? null;
  const cpuPoints = history.map((point) => point.cpuPercent);
  const memoryBytesPoints = history.map((point) => point.memoryUsedBytes);
  const memoryPercentPoints = history.map((point) => point.memoryPercent);
  const networkInPoints = history.map((point) => point.networkIn);
  const networkOutPoints = history.map((point) => point.networkOut);
  const networkTotalPoints = history.map((point) => point.networkTotal);
  const diskReadPoints = history.map((point) => point.diskRead);
  const diskWritePoints = history.map((point) => point.diskWrite);
  const diskTotalPoints = history.map((point) => point.diskTotal);

  return [
    {
      delta: getLatestDelta(cpuPoints, (delta) => formatPercent(delta, 1)),
      legends: [
        {
          label: "Avg",
          value: formatAverageValue(cpuPoints, (value) =>
            formatPercent(value, 1),
          ),
        },
        {
          label: "Peak",
          value: formatPeakValue(cpuPoints, (value) => formatPercent(value, 1)),
        },
      ],
      primaryPoints: cpuPoints,
      trendPoints: cpuPoints,
      title: "CPU load",
      value: latest ? formatPercent(latest.cpuPercent, 1) : "--",
      variant: "cpu",
    },
    {
      delta: getLatestDelta(memoryPercentPoints, (delta) =>
        formatPercent(delta, 1),
      ),
      legends: [
        {
          label: "Host share",
          value: latest ? formatPercent(latest.memoryPercent, 1) : "--",
        },
        {
          label: "Peak",
          value: formatPeakValue(memoryBytesPoints, (value) =>
            formatBytes(value),
          ),
        },
      ],
      primaryPoints: memoryBytesPoints,
      trendPoints: memoryBytesPoints,
      title: "Memory load",
      value: latest ? formatBytes(latest.memoryUsedBytes) : "--",
      variant: "memory",
    },
    {
      delta: getLatestDelta(
        networkTotalPoints,
        (delta) => formatBytesPerSecond(delta),
        1024,
      ),
      legends: [
        {
          label: "Ingress",
          value: latest ? formatBytesPerSecond(latest.networkIn) : "--",
        },
        {
          label: "Egress",
          value: latest ? formatBytesPerSecond(latest.networkOut) : "--",
        },
      ],
      primaryPoints: networkInPoints,
      secondaryPoints: networkOutPoints,
      trendPoints: networkTotalPoints,
      title: "Network",
      value: latest ? formatBytesPerSecond(latest.networkTotal) : "--",
      variant: "network",
    },
    {
      delta: getLatestDelta(
        diskTotalPoints,
        (delta) => formatBytesPerSecond(delta),
        1024,
      ),
      legends: [
        {
          label: "Read",
          value: latest ? formatBytesPerSecond(latest.diskRead) : "--",
        },
        {
          label: "Write",
          value: latest ? formatBytesPerSecond(latest.diskWrite) : "--",
        },
      ],
      primaryPoints: diskReadPoints,
      secondaryPoints: diskWritePoints,
      trendPoints: diskTotalPoints,
      title: "Disk I/O",
      value: latest ? formatBytesPerSecond(latest.diskTotal) : "--",
      variant: "disk",
    },
  ];
}

function buildRuntimeTimeline(
  runtime: ContainerStats,
  snapshot: MetricsSnapshot | null,
) {
  return [
    {
      label: "Runtime state",
      detail: `${formatRuntimeStatusLabel(runtime)} at ${snapshot ? formatClock(snapshot.timestamp) : "the latest sample"}.`,
    },
    {
      label: "Health check",
      detail: formatRuntimeHealthLabel(runtime.health),
    },
    {
      label: "Compose labels",
      detail:
        runtime.projectName || runtime.serviceName
          ? [runtime.projectName, runtime.serviceName]
              .filter(Boolean)
              .join(" / ")
          : "No compose metadata was exposed for this container.",
    },
  ];
}

function buildDisplayContainer(
  runtime: ContainerStats,
  preview: PreviewContainer | null,
  snapshot: MetricsSnapshot | null,
): PreviewContainer {
  const base =
    preview ??
    ({
      id: runtime.id,
      name: runtime.name,
      stack: runtime.projectName ?? "docker",
      image: runtime.serviceName
        ? `${runtime.serviceName} runtime`
        : "Container image details unavailable",
      node: snapshot?.hostIp ?? "Current host",
      status: getRuntimePreviewStatus(runtime),
      summary: buildRuntimeSummary(runtime),
      uptime: snapshot
        ? `Updated ${formatClock(snapshot.timestamp)}`
        : "Live sample",
      port: runtime.serviceName ?? "Inspect data unavailable",
      cpu: formatPercent(runtime.cpuPercent, 1),
      memory: formatBytes(runtime.memoryBytes),
      restarts: 0,
      requestRate: "Live sample",
      region: snapshot?.hostIp ?? "Docker host",
      deployedAt: snapshot ? formatClock(snapshot.timestamp) : "now",
      tags: [],
      volumes: [],
      environment: [],
      endpoints: [],
      activity: createFlatSeries(runtime.cpuPercent),
      signals: [],
      timeline: buildRuntimeTimeline(runtime, snapshot),
      logs: {
        live: [],
        events: [],
        alerts: [],
      },
    } satisfies PreviewContainer);

  return {
    ...base,
    id: runtime.id,
    name: runtime.name,
    stack: runtime.projectName ?? base.stack,
    node: snapshot?.hostIp ?? base.node,
    status: getRuntimePreviewStatus(runtime),
    summary: preview?.summary ?? base.summary,
    uptime: snapshot
      ? `Updated ${formatClock(snapshot.timestamp)}`
      : base.uptime,
    cpu: formatPercent(runtime.cpuPercent, 1),
    memory: formatBytes(runtime.memoryBytes),
    region: snapshot?.hostIp ?? base.region,
    tags: Array.from(
      new Set(
        [
          ...base.tags,
          runtime.projectName,
          runtime.serviceName,
          runtime.status,
          runtime.health !== "none" ? runtime.health : null,
        ].filter((value): value is string => Boolean(value)),
      ),
    ),
    activity: createFlatSeries(runtime.cpuPercent),
    signals: base.signals,
    timeline: buildRuntimeTimeline(runtime, snapshot),
  };
}

function buildContainerSidebarMetadata(
  runtime: ContainerStats | null,
  display: PreviewContainer,
  deployments: DeploymentSummary[],
) {
  if (!runtime?.projectName) {
    return {
      sidebarName: formatManagedContainerLabel(display.name),
      sidebarSecondaryLabel: runtime
        ? (runtime.projectName ?? display.stack)
        : display.stack,
    };
  }

  const matchingDeployment = deployments.find(
    (deployment) => deployment.projectName === runtime.projectName,
  );

  if (!matchingDeployment) {
    return {
      sidebarName: formatManagedContainerLabel(display.name),
      sidebarSecondaryLabel: runtime.projectName,
    };
  }

  const serviceLabel =
    runtime.serviceName?.trim() || matchingDeployment.serviceName?.trim() || "";

  return {
    sidebarName: serviceLabel
      ? `${matchingDeployment.appName} / ${serviceLabel}`
      : matchingDeployment.appName,
    sidebarSecondaryLabel: runtime.name,
  };
}

function buildContainerListEntries(
  snapshot: MetricsSnapshot | null,
  deployments: DeploymentSummary[],
): ContainerListEntry[] {
  const previewByName = new Map(
    PREVIEW_CONTAINERS.map((container) => [container.name, container]),
  );
  const previewOrder = new Map(
    PREVIEW_CONTAINERS.map((container, index) => [container.name, index]),
  );
  const runtimeContainers = [...(snapshot?.containers.all ?? [])].sort(
    (left, right) => {
      const leftPreviewIndex = previewOrder.get(left.name);
      const rightPreviewIndex = previewOrder.get(right.name);

      if (
        leftPreviewIndex !== undefined &&
        rightPreviewIndex !== undefined &&
        leftPreviewIndex !== rightPreviewIndex
      ) {
        return leftPreviewIndex - rightPreviewIndex;
      }

      if (leftPreviewIndex !== undefined && rightPreviewIndex === undefined) {
        return -1;
      }

      if (leftPreviewIndex === undefined && rightPreviewIndex !== undefined) {
        return 1;
      }

      return left.name.localeCompare(right.name);
    },
  );

  if (!runtimeContainers.length) {
    return PREVIEW_CONTAINERS.map((preview) => ({
      display: preview,
      dotClassName: getStatusDotClassName(preview.status),
      preview,
      runtime: null,
      sidebarName: preview.name,
      sidebarSecondaryLabel: preview.stack,
      searchText: [preview.name, preview.stack, preview.image, preview.summary]
        .join(" ")
        .toLowerCase(),
    }));
  }

  return runtimeContainers.map((runtime) => {
    const preview = previewByName.get(runtime.name) ?? null;
    const display = buildDisplayContainer(runtime, preview, snapshot);
    const sidebarMetadata = buildContainerSidebarMetadata(
      runtime,
      display,
      deployments,
    );

    return {
      display,
      dotClassName: getRuntimeDotClassName(runtime),
      preview,
      runtime,
      sidebarName: sidebarMetadata.sidebarName,
      sidebarSecondaryLabel: sidebarMetadata.sidebarSecondaryLabel,
      searchText: [
        sidebarMetadata.sidebarName,
        sidebarMetadata.sidebarSecondaryLabel,
        runtime.name,
        runtime.projectName,
        runtime.serviceName,
        runtime.status,
        runtime.health,
        preview?.summary,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase(),
    };
  });
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

function formatStatusLabel(status: PreviewContainerStatus) {
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

const WORKSPACE_PAGES: Array<{
  description: string;
  iconComponent: LucideIcon;
  id: WorkspaceView;
  label: string;
}> = [
  {
    id: "dashboard",
    label: "Dashboard",
    iconComponent: Home,
    description: "Live containers and host load",
  },
  {
    id: "git-app-page",
    label: "Git App Page",
    iconComponent: GitBranch,
    description: "Deployments and repo wiring",
  },
];

function getWorkspaceViewHref(view: WorkspaceView, range: DashboardRange) {
  const pathname = view === "dashboard" ? "/" : "/git-app-page";

  if (range === "15m") {
    return pathname;
  }

  const searchParams = new URLSearchParams({
    range,
  });

  return `${pathname}?${searchParams.toString()}`;
}

function buildMetricsRequestUrl(
  searchParams: Record<string, string | undefined>,
) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === "string") {
      params.set(key, value);
    }
  }

  return `/api/metrics?${params.toString()}`;
}

function isDocumentHidden() {
  if (typeof document === "undefined") {
    return false;
  }

  return document.visibilityState === "hidden";
}

function toSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function buildRepositoryOptions(repositories: GitHubRepository[]) {
  return repositories.map((repository) => ({
    value: String(repository.id),
    label: repository.fullName,
    description:
      repository.description ??
      `${repository.visibility} repo • updated ${formatRelativeTime(repository.updatedAt)}`,
  }));
}

function buildBranchOptions(branches: string[], defaultBranch: string) {
  return branches.map((branch) => ({
    value: branch,
    label: branch,
    description: branch === defaultBranch ? "Default branch" : undefined,
  }));
}

function createEmptyDraftAppState(): DraftAppState {
  return {
    appName: "",
    branch: "",
    port: "3000",
    repositoryUrl: "",
    subdomain: "",
  };
}

function normalizeGitHubBranches(branches: string[], defaultBranch: string) {
  const normalizedBranches = Array.from(
    new Set(
      branches
        .map((branch) => branch.trim())
        .filter((branch) => branch.length > 0),
    ),
  );

  if (!defaultBranch.trim()) {
    return normalizedBranches;
  }

  const defaultBranchIndex = normalizedBranches.indexOf(defaultBranch);

  if (defaultBranchIndex === 0) {
    return normalizedBranches;
  }

  if (defaultBranchIndex > 0) {
    normalizedBranches.splice(defaultBranchIndex, 1);
  }

  return [defaultBranch, ...normalizedBranches];
}

function getPreferredBranch(
  currentBranch: string,
  defaultBranch: string,
  availableBranches: string[],
) {
  if (currentBranch && availableBranches.includes(currentBranch)) {
    return currentBranch;
  }

  if (defaultBranch && availableBranches.includes(defaultBranch)) {
    return defaultBranch;
  }

  return availableBranches[0] ?? currentBranch;
}

function formatRelativeTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const units = [
    ["year", 60 * 60 * 24 * 365],
    ["month", 60 * 60 * 24 * 30],
    ["week", 60 * 60 * 24 * 7],
    ["day", 60 * 60 * 24],
    ["hour", 60 * 60],
    ["minute", 60],
  ] as const;

  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  for (const [unit, divisor] of units) {
    if (Math.abs(seconds) >= divisor || unit === "minute") {
      return formatter.format(Math.round(seconds / divisor), unit);
    }
  }

  return formatter.format(seconds, "second");
}

function getDeploymentStatusBadgeVariant(
  status: DeploymentSummary["status"],
): "success" | "warning" | "default" {
  switch (status) {
    case "running":
      return "success";
    case "failed":
    case "deploying":
      return "warning";
    default:
      return "default";
  }
}

function getDeploymentStatusDotClassName(status: DeploymentSummary["status"]) {
  switch (status) {
    case "running":
      return "bg-emerald-500";
    case "failed":
    case "deploying":
      return "bg-amber-500";
    default:
      return "bg-slate-400";
  }
}

function formatDeploymentStatus(status: DeploymentSummary["status"]) {
  switch (status) {
    case "deploying":
      return "Deploying";
    case "running":
      return "Running";
    case "failed":
      return "Failed";
    case "stopped":
      return "Stopped";
    case "removing":
      return "Removing";
  }
}

function formatDeploymentDomain(
  deployment: Pick<DeploymentSummary, "subdomain">,
  baseDomain?: string,
) {
  if (!baseDomain) {
    return deployment.subdomain;
  }

  return `${deployment.subdomain}.${baseDomain}`;
}

function formatDeploymentHref(
  deployment: Pick<DeploymentSummary, "subdomain">,
  baseDomain?: string,
) {
  return `https://${formatDeploymentDomain(deployment, baseDomain)}`;
}

function createDraftFromRepository(
  repository: GitHubRepository,
): DraftAppState {
  const slug = toSlug(repository.name);

  return {
    appName: repository.name,
    branch: repository.defaultBranch,
    port: "3000",
    repositoryUrl: repository.cloneUrl,
    subdomain: slug || repository.name.toLowerCase(),
  };
}

export function WorkspaceShell({
  baseDomain,
  initialContainerHistory = [],
  initialDashboardRange = "15m",
  initialDeployments,
  initialHistory = [],
  initialView = "dashboard",
  initialSnapshot = null,
}: WorkspaceShellProps) {
  const router = useRouter();
  const deploymentSeed = initialDeployments ?? EMPTY_DEPLOYMENTS;
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
  const activeView = initialView;
  const [dashboardRange, setDashboardRange] = useState<DashboardRange>(
    initialDashboardRange,
  );
  const [selectedContainerId, setSelectedContainerId] =
    useState(ALL_CONTAINERS_ID);
  const [deployments, setDeployments] =
    useState<DeploymentSummary[]>(deploymentSeed);
  const [selectedAppId, setSelectedAppId] = useState(
    deploymentSeed[0]?.id ?? "",
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [appSearchQuery, setAppSearchQuery] = useState("");
  const [dashboardLogView, setDashboardLogView] =
    useState<DashboardLogView>("live");
  const [appLogTab, setAppLogTab] = useState<LogTab>("build");
  const [isCreateAppExpanded, setIsCreateAppExpanded] = useState(false);
  const [isCreateAppPending, setIsCreateAppPending] = useState(false);
  const [draftApp, setDraftApp] = useState<DraftAppState>(
    createEmptyDraftAppState,
  );
  const [repositoryState, setRepositoryState] = useState<RepositoryState>({
    error: null,
    hasLoaded: false,
    isLoading: false,
    repositories: [],
    tokenConfigured: false,
  });
  const [branchState, setBranchState] = useState<BranchState>({
    branchesByRepositoryId: {},
    error: null,
    isLoading: false,
  });
  const initialSelectedContainerHistoryKey = initialSnapshot?.containers.all[0]
    ? buildRuntimeContainerMetricsKey(initialSnapshot.containers.all[0])
    : null;
  const [sidebarSnapshot, setSidebarSnapshot] =
    useState<MetricsSnapshot | null>(initialSnapshot);
  const [sidebarHistory, setSidebarHistory] =
    useState<MetricsHistoryPoint[]>(initialHistory);
  const [selectedContainerHistory, setSelectedContainerHistory] = useState<
    ContainerMetricsHistoryPoint[]
  >(initialContainerHistory);
  const [allContainerHistory, setAllContainerHistory] = useState<
    AllContainersMetricsHistorySeries[]
  >([]);
  const [selectedContainerHistoryKey, setSelectedContainerHistoryKey] =
    useState<string | null>(initialSelectedContainerHistoryKey);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const branchCacheRef = useRef<Record<string, string[]>>({});
  const branchRequestIdRef = useRef(0);
  const hasMountedLivePollingRef = useRef(false);
  const hasMountedDetailedHistoryRef = useRef(false);
  const livePollInFlightRef = useRef(false);
  const detailedHistoryInFlightRef = useRef(false);
  const loadedDetailedHistoryKeyRef = useRef<string | null>(null);
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
  const workspaceContainers = useMemo(
    () =>
      activeView === "dashboard"
        ? buildContainerListEntries(sidebarSnapshot, deployments)
        : EMPTY_CONTAINER_LIST,
    [activeView, deployments, sidebarSnapshot],
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
      : sidebarSnapshot && activeView !== "dashboard"
        ? {
            badgeLabel: "Snapshot only",
            badgeClassName:
              "border-amber-200/80 bg-amber-50/90 text-amber-700",
            helperText:
              "Git App Page keeps the sidebar light and refreshes detailed charts only on the dashboard.",
          }
      : sidebarSnapshot
        ? {
            badgeLabel: "Snapshot only",
            badgeClassName: "border-amber-200/80 bg-amber-50/90 text-amber-700",
            helperText:
              "Waiting for InfluxDB history samples to populate the charts.",
          }
        : {
            badgeLabel: "Connecting",
            badgeClassName: "border-border/60 bg-background/80 text-foreground",
            helperText: "Loading current host metrics.",
          };

  const filteredContainers = useMemo(() => {
    if (activeView !== "dashboard") {
      return EMPTY_CONTAINER_LIST;
    }

    const normalizedQuery = searchQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return workspaceContainers;
    }

    return workspaceContainers.filter((container) =>
      container.searchText.includes(normalizedQuery),
    );
  }, [activeView, searchQuery, workspaceContainers]);
  const repositoryOptions = useMemo(
    () => buildRepositoryOptions(repositoryState.repositories),
    [repositoryState.repositories],
  );
  const selectedRepository = useMemo(
    () =>
      repositoryState.repositories.find(
        (repository) => repository.cloneUrl === draftApp.repositoryUrl,
      ) ?? null,
    [draftApp.repositoryUrl, repositoryState.repositories],
  );
  const branchOptions = useMemo(
    () =>
      selectedRepository
        ? buildBranchOptions(
            branchState.branchesByRepositoryId[String(selectedRepository.id)] ??
              [],
            selectedRepository.defaultBranch,
          )
        : [],
    [branchState.branchesByRepositoryId, selectedRepository],
  );
  const filteredDeployments = useMemo(() => {
    const normalizedQuery = appSearchQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return deployments;
    }

    return deployments.filter((deployment) =>
      [
        deployment.appName,
        deployment.repositoryName,
        deployment.repositoryUrl,
        deployment.subdomain,
        deployment.serviceName ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [appSearchQuery, deployments]);
  const selectedDeployment =
    filteredDeployments.find((deployment) => deployment.id === selectedAppId) ??
    deployments.find((deployment) => deployment.id === selectedAppId) ??
    deployments[0] ??
    null;
  const selectedDeploymentHref = selectedDeployment
    ? formatDeploymentHref(selectedDeployment, baseDomain)
    : null;
  const selectedRepositoryValue = selectedRepository
    ? String(selectedRepository.id)
    : "";
  const selectedRepositorySummary = selectedRepository
    ? `${selectedRepository.visibility} repo • default ${selectedRepository.defaultBranch} • updated ${formatRelativeTime(selectedRepository.updatedAt)}`
    : null;
  const branchHelperText = selectedRepository
    ? branchState.isLoading
      ? "Loading branches from GitHub."
      : branchOptions.length
        ? `${branchOptions.length} branches available for selection.`
        : branchState.error
          ? null
          : "No branches returned for this repository."
    : null;
  const isAllContainersSelected = selectedContainerId === ALL_CONTAINERS_ID;

  const activeContainerId = isAllContainersSelected
    ? ALL_CONTAINERS_ID
    : filteredContainers.some(
          (container) => container.display.id === selectedContainerId,
        )
      ? selectedContainerId
      : (filteredContainers[0]?.display.id ??
        workspaceContainers[0]?.display.id ??
        PREVIEW_CONTAINERS[0]?.name ??
        selectedContainerId);

  const selectedEntry = isAllContainersSelected
    ? null
    : (filteredContainers.find(
        (container) => container.display.id === activeContainerId,
      ) ??
      workspaceContainers.find(
        (container) => container.display.id === activeContainerId,
      ) ??
      workspaceContainers[0]);
  const selectedContainer = selectedEntry?.display ?? PREVIEW_CONTAINERS[0];
  const selectedRuntimeContainer = selectedEntry?.runtime ?? null;
  const selectedPreviewContainer = selectedEntry?.preview ?? null;
  const selectedRuntimeContainerId = selectedRuntimeContainer?.id ?? "";
  const selectedRuntimeContainerName = selectedRuntimeContainer?.name ?? "";
  const selectedRuntimeContainerKey = selectedRuntimeContainer
    ? buildRuntimeContainerMetricsKey(selectedRuntimeContainer)
    : null;
  const activeSelectedContainerHistory =
    selectedRuntimeContainerKey &&
    selectedContainerHistoryKey === selectedRuntimeContainerKey
      ? selectedContainerHistory
      : EMPTY_CONTAINER_HISTORY;
  const focusedMetricCharts = useMemo(() => {
    if (activeView !== "dashboard") {
      return EMPTY_FOCUSED_METRIC_CHARTS;
    }

    return buildFocusedMetricCharts(
      selectedRuntimeContainer,
      activeSelectedContainerHistory,
      selectedContainer,
    );
  }, [
    activeSelectedContainerHistory,
    activeView,
    selectedContainer,
    selectedRuntimeContainer,
  ]);
  const allContainersMetricCharts = useMemo(() => {
    if (activeView !== "dashboard") {
      return EMPTY_ALL_CONTAINERS_METRIC_CHARTS;
    }

    return buildAllContainersMetricCharts(
      dashboardRange,
      sidebarSnapshot,
      allContainerHistory,
    );
  }, [activeView, allContainerHistory, dashboardRange, sidebarSnapshot]);
  const detailedHistoryRequest = useMemo(() => {
    if (activeView !== "dashboard") {
      return null;
    }

    if (isAllContainersSelected) {
      return {
        key: `all:${dashboardRange}`,
        searchParams: {
          allContainers: "true",
          includeAllContainerHistory: "true",
          includeHistory: "false",
          range: dashboardRange,
        } satisfies Record<string, string>,
        target: "all-containers" as const,
      };
    }

    if (!selectedRuntimeContainerId || !selectedRuntimeContainerName) {
      return null;
    }

    return {
      key: `${selectedRuntimeContainerKey ?? selectedRuntimeContainerId}:${dashboardRange}`,
      searchParams: {
        containerId: selectedRuntimeContainerId,
        containerName: selectedRuntimeContainerName,
        includeContainerHistory: "true",
        includeHistory: "false",
        range: dashboardRange,
      } satisfies Record<string, string>,
      target: "container" as const,
    };
  }, [
    activeView,
    dashboardRange,
    isAllContainersSelected,
    selectedRuntimeContainerId,
    selectedRuntimeContainerKey,
    selectedRuntimeContainerName,
  ]);

  useEffect(() => {
    setDeployments(deploymentSeed);
  }, [deploymentSeed]);

  useEffect(() => {
    setDashboardRange(initialDashboardRange);
  }, [initialDashboardRange]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const nextUrl = new URL(window.location.href);

    if (dashboardRange === "15m") {
      nextUrl.searchParams.delete("range");
    } else {
      nextUrl.searchParams.set("range", dashboardRange);
    }

    const nextHref = `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
    const currentHref = `${window.location.pathname}${window.location.search}${window.location.hash}`;

    if (nextHref !== currentHref) {
      window.history.replaceState(window.history.state, "", nextHref);
    }
  }, [dashboardRange]);

  useEffect(() => {
    if (!deployments.length) {
      setSelectedAppId("");
      return;
    }

    if (!deployments.some((deployment) => deployment.id === selectedAppId)) {
      setSelectedAppId(deployments[0]?.id ?? "");
    }
  }, [deployments, selectedAppId]);

  useEffect(() => {
    let active = true;
    let timeoutId: number | null = null;
    let abortController: AbortController | null = null;
    let errorBackoffMs = LIVE_POLL_INTERVAL_MS;

    const scheduleNextPoll = (delayMs: number) => {
      if (!active) {
        return;
      }

      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }

      timeoutId = window.setTimeout(() => {
        void pollLiveMetrics();
      }, delayMs);
    };

    const pollLiveMetrics = async () => {
      if (!active) {
        return;
      }

      if (livePollInFlightRef.current) {
        scheduleNextPoll(errorBackoffMs);
        return;
      }

      if (isDocumentHidden()) {
        scheduleNextPoll(HIDDEN_LIVE_POLL_INTERVAL_MS);
        return;
      }

      livePollInFlightRef.current = true;
      abortController = new AbortController();

      try {
        const response = await fetch(
          buildMetricsRequestUrl(
            activeView === "dashboard"
              ? {
                  includeHistory: "true",
                  mode: "current",
                  range: dashboardRange,
                }
              : {
                  includeHistory: "false",
                  mode: "current",
                },
          ),
          {
            cache: "no-store",
            signal: abortController.signal,
          },
        );

        if (!response.ok) {
          throw new Error(`Metrics request failed with ${response.status}.`);
        }

        const payload = (await response.json()) as {
          history?: MetricsHistoryPoint[];
          snapshot?: MetricsSnapshot | null;
        };

        if (!active) {
          return;
        }

        if (payload.snapshot) {
          setSidebarSnapshot(payload.snapshot);
        }

        if (Array.isArray(payload.history)) {
          setSidebarHistory(payload.history);
        }

        setMetricsError(null);
        errorBackoffMs = LIVE_POLL_INTERVAL_MS;
      } catch (error) {
        if (
          !active ||
          (error instanceof DOMException && error.name === "AbortError")
        ) {
          return;
        }

        const message =
          error instanceof Error
            ? error.message
            : "Unable to load live metrics.";

        console.error(message);
        setMetricsError(message);
        errorBackoffMs = Math.min(
          errorBackoffMs * 2,
          LIVE_POLL_ERROR_BACKOFF_MAX_MS,
        );
      } finally {
        livePollInFlightRef.current = false;
        abortController = null;
        scheduleNextPoll(errorBackoffMs);
      }
    };

    const shouldPollImmediately =
      activeView === "dashboard"
        ? hasMountedLivePollingRef.current
          ? true
          : !(initialSnapshot && initialHistory.length > 0)
        : false;

    hasMountedLivePollingRef.current = true;
    scheduleNextPoll(shouldPollImmediately ? 0 : LIVE_POLL_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      scheduleNextPoll(VISIBILITY_REFRESH_DELAY_MS);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      active = false;
      livePollInFlightRef.current = false;
      abortController?.abort();

      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }

      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [activeView, dashboardRange, initialHistory.length, initialSnapshot]);

  useEffect(() => {
    if (!detailedHistoryRequest) {
      return;
    }

    if (loadedDetailedHistoryKeyRef.current === detailedHistoryRequest.key) {
      if (!hasMountedDetailedHistoryRef.current) {
        hasMountedDetailedHistoryRef.current = true;
      }

      return;
    }

    let active = true;
    const abortController = new AbortController();
    const shouldFetchImmediately = hasMountedDetailedHistoryRef.current
      ? true
      : detailedHistoryRequest.target === "all-containers"
        ? allContainerHistory.length === 0
        : selectedContainerHistory.length === 0;

    hasMountedDetailedHistoryRef.current = true;

    if (!shouldFetchImmediately) {
      return;
    }

    const loadDetailedHistory = async () => {
      if (!active || detailedHistoryInFlightRef.current) {
        return;
      }

      detailedHistoryInFlightRef.current = true;

      try {
        const response = await fetch(
          buildMetricsRequestUrl(detailedHistoryRequest.searchParams),
          {
            cache: "no-store",
            signal: abortController.signal,
          },
        );

        if (!response.ok) {
          throw new Error(`Metrics request failed with ${response.status}.`);
        }

        const payload = (await response.json()) as {
          allContainerHistory?: AllContainersMetricsHistorySeries[];
          containerHistory?: ContainerMetricsHistoryPoint[];
        };

        if (!active) {
          return;
        }

        if (detailedHistoryRequest.target === "all-containers") {
          setAllContainerHistory(payload.allContainerHistory ?? []);
          setSelectedContainerHistory([]);
          setSelectedContainerHistoryKey(null);
        } else {
          setSelectedContainerHistory(payload.containerHistory ?? []);
          setSelectedContainerHistoryKey(selectedRuntimeContainerKey);
        }

        loadedDetailedHistoryKeyRef.current = detailedHistoryRequest.key;
      } catch (error) {
        if (
          !active ||
          (error instanceof DOMException && error.name === "AbortError")
        ) {
          return;
        }
      } finally {
        detailedHistoryInFlightRef.current = false;
      }
    };

    void loadDetailedHistory();

    return () => {
      active = false;
      abortController.abort();
      detailedHistoryInFlightRef.current = false;
    };
  }, [
    allContainerHistory.length,
    detailedHistoryRequest,
    selectedContainerHistory.length,
    selectedRuntimeContainerKey,
  ]);

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
      kind === "metrics"
        ? metricsWidth
        : kind === "list"
          ? listWidth
          : logsWidth;

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

  const handleViewChange = useCallback(
    (view: WorkspaceView) => {
      if (view === activeView) {
        return;
      }

      router.push(getWorkspaceViewHref(view, dashboardRange));
    },
    [activeView, dashboardRange, router],
  );

  const loadRepositories = useCallback(async () => {
    setRepositoryState((current) => ({
      ...current,
      error: null,
      isLoading: true,
    }));

    try {
      const response = await fetch("/api/github/repos", {
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        error?: string;
        repositories?: GitHubRepository[];
        tokenConfigured?: boolean;
      };

      if (!response.ok) {
        throw new Error(
          payload.error ?? "Unable to load repositories from GitHub.",
        );
      }

      setRepositoryState({
        error: null,
        hasLoaded: true,
        isLoading: false,
        repositories: payload.repositories ?? [],
        tokenConfigured: Boolean(payload.tokenConfigured),
      });
    } catch (error) {
      setRepositoryState((current) => ({
        ...current,
        error:
          error instanceof Error
            ? error.message
            : "Unable to load repositories from GitHub.",
        hasLoaded: true,
        isLoading: false,
      }));
    }
  }, []);

  useEffect(() => {
    if (
      activeView === "git-app-page" &&
      !repositoryState.hasLoaded &&
      !repositoryState.isLoading
    ) {
      void loadRepositories();
    }
  }, [
    activeView,
    loadRepositories,
    repositoryState.hasLoaded,
    repositoryState.isLoading,
  ]);

  const loadBranches = useCallback(async (repository: GitHubRepository) => {
    const repositoryId = String(repository.id);
    const requestId = branchRequestIdRef.current + 1;

    branchRequestIdRef.current = requestId;

    const cachedBranches = branchCacheRef.current[repositoryId];

    if (cachedBranches) {
      setBranchState((current) =>
        current.error === null && !current.isLoading
          ? current
          : {
              ...current,
              error: null,
              isLoading: false,
            },
      );
      setDraftApp((current) => {
        if (current.repositoryUrl !== repository.cloneUrl) {
          return current;
        }

        const nextBranch = getPreferredBranch(
          current.branch,
          repository.defaultBranch,
          cachedBranches,
        );

        return current.branch === nextBranch
          ? current
          : {
              ...current,
              branch: nextBranch,
            };
      });
      return;
    }

    setBranchState((current) =>
      current.isLoading && current.error === null
        ? current
        : {
            ...current,
            error: null,
            isLoading: true,
          },
    );

    try {
      const response = await fetch(
        `/api/github/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}/branches`,
        {
          cache: "no-store",
        },
      );
      const payload = (await response.json()) as {
        branches?: string[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          payload.error ?? "Unable to load branches from GitHub.",
        );
      }

      if (branchRequestIdRef.current !== requestId) {
        return;
      }

      const branches = normalizeGitHubBranches(
        payload.branches ?? [],
        repository.defaultBranch,
      );

      setBranchState((current) => {
        const branchesByRepositoryId = {
          ...current.branchesByRepositoryId,
          [repositoryId]: branches,
        };

        branchCacheRef.current = branchesByRepositoryId;

        return {
          branchesByRepositoryId,
          error: null,
          isLoading: false,
        };
      });
      setDraftApp((current) => {
        if (current.repositoryUrl !== repository.cloneUrl) {
          return current;
        }

        const nextBranch = getPreferredBranch(
          current.branch,
          repository.defaultBranch,
          branches,
        );

        return current.branch === nextBranch
          ? current
          : {
              ...current,
              branch: nextBranch,
            };
      });
    } catch (error) {
      if (branchRequestIdRef.current !== requestId) {
        return;
      }

      setBranchState((current) => ({
        ...current,
        error:
          error instanceof Error
            ? error.message
            : "Unable to load branches from GitHub.",
        isLoading: false,
      }));
    }
  }, []);

  useEffect(() => {
    return () => {
      branchRequestIdRef.current += 1;
    };
  }, []);

  useEffect(() => {
    if (!selectedRepository) {
      branchRequestIdRef.current += 1;
      setBranchState((current) =>
        current.error === null && !current.isLoading
          ? current
          : {
              ...current,
              error: null,
              isLoading: false,
            },
      );
      return;
    }

    void loadBranches(selectedRepository);
  }, [loadBranches, selectedRepository]);

  function handleDeploymentActionResult(result: DeploymentActionResult) {
    if (result.status === "success") {
      toast.success(result.message);
      router.refresh();
      return;
    }

    toast.error(result.message);
  }

  async function handleCreateApp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const repositoryUrl = draftApp.repositoryUrl.trim();
    const appName = draftApp.appName.trim();
    const subdomain = draftApp.subdomain.trim();
    const port = draftApp.port.trim();

    if (!repositoryUrl || !appName || !subdomain || !port) {
      toast.error(
        "Select a repository and complete the app name, subdomain, and port.",
      );
      return;
    }

    setIsCreateAppPending(true);

    try {
      const formData = new FormData();
      formData.set("repositoryUrl", repositoryUrl);
      formData.set("appName", appName);
      formData.set("subdomain", subdomain);
      formData.set("port", port);

      if (draftApp.branch.trim()) {
        formData.set("branch", draftApp.branch.trim());
      }

      const response = await fetch("/api/deployments", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as {
        deploymentId?: string;
        domain?: string;
        error?: string;
      };

      if (!response.ok || !payload.deploymentId) {
        throw new Error(payload.error ?? "Unable to create deployment.");
      }

      toast.success(
        payload.domain
          ? `Deployment queued for https://${payload.domain}`
          : "Deployment created.",
      );
      setSelectedAppId(payload.deploymentId);
      setDraftApp(createEmptyDraftAppState());
      setIsCreateAppExpanded(false);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to create deployment.",
      );
    } finally {
      setIsCreateAppPending(false);
    }
  }

  async function handleSaveApp(formData: FormData) {
    if (!selectedDeployment) {
      return;
    }

    const result = await updateDeploymentAction(formData);
    handleDeploymentActionResult(result);
  }

  async function runDeploymentAction(
    action: (formData: FormData) => Promise<DeploymentActionResult>,
  ) {
    if (!selectedDeployment) {
      return;
    }

    const formData = new FormData();
    formData.set("deploymentId", selectedDeployment.id);

    const result = await action(formData);
    handleDeploymentActionResult(result);
  }

  async function handleStartApp() {
    await runDeploymentAction(redeployDeploymentAction);
  }

  async function handleStopApp() {
    await runDeploymentAction(stopDeploymentAction);
  }

  async function handleFetchApp() {
    await runDeploymentAction(fetchDeploymentFromGitAction);
  }

  async function handleRecreateApp() {
    await runDeploymentAction(redeployDeploymentAction);
  }

  async function handleDeleteApp() {
    await runDeploymentAction(removeDeploymentAction);
  }

  function handleToggleCreateAppPanel() {
    setIsCreateAppExpanded((current) => {
      const next = !current;

      if (next && !repositoryState.hasLoaded && !repositoryState.isLoading) {
        void loadRepositories();
      }

      return next;
    });
  }

  function handleRepositorySelect(value: string) {
    const repository = repositoryState.repositories.find(
      (item) => String(item.id) === value,
    );

    if (!repository) {
      return;
    }

    setDraftApp(createDraftFromRepository(repository));
  }

  function handleDraftAppChange(field: keyof DraftAppState, value: string) {
    setDraftApp((current) => ({
      ...current,
      [field]: value,
    }));
  }

  const activeViewMeta =
    WORKSPACE_PAGES.find((page) => page.id === activeView) ??
    WORKSPACE_PAGES[0]!;
  const activeViewTitle =
    activeView === "dashboard" ? "Dashboard" : "Git App Page";
  const activeViewDescription =
    activeView === "dashboard"
      ? "Live Influx-backed host metrics and Docker runtime state in the shared workspace shell."
      : "Create, review, and edit live deployments in the same shared workspace shell.";
  const activeViewStatusLabel =
    activeView === "dashboard" ? "Live runtime" : "Live deployments";
  const updatedAtLabel = sidebarSnapshot
    ? formatClock(sidebarSnapshot.timestamp)
    : "Waiting for metrics";
  const hostMetricsProps = {
    cpuHeadroomLabel: sidebarSnapshot
      ? formatPercent(Math.max(0, 100 - sidebarSnapshot.system.cpuPercent))
      : "--",
    isCollapsed: isMetricsCollapsed,
    memoryHeadroomLabel: sidebarSnapshot
      ? formatBytes(
          Math.max(
            0,
            sidebarSnapshot.system.memoryTotalBytes -
              sidebarSnapshot.system.memoryUsedBytes,
          ),
          1,
        )
      : "--",
    metricCards: serverMetrics,
    metricsStatus,
    onCollapseAction: () => setIsMetricsCollapsed(true),
    onExpandAction: () => setIsMetricsCollapsed(false),
    onResizeStartAction: (event: ReactMouseEvent<HTMLDivElement>) =>
      handleResizeStart("metrics", event),
    showStateWarning: Boolean(
      (activeView === "dashboard" && sidebarSnapshot && !sidebarHistory.length) ||
        metricsError,
    ),
    summaryLabel: sidebarSnapshot
      ? `${sidebarSnapshot.containers.running} running containers on ${sidebarSnapshot.hostIp}.`
      : "Waiting for the first host snapshot.",
    throughputLabel: sidebarSnapshot
      ? `Load avg ${formatLoadAverage(sidebarSnapshot.system.loadAverage)} • ${formatBytesPerSecond(sidebarSnapshot.network.rxBytesPerSecond)} down / ${formatBytesPerSecond(sidebarSnapshot.network.txBytesPerSecond)} up`
      : metricsStatus.helperText,
    width: metricsWidth,
  } satisfies HostMetricsSidebarProps;
  const previewLogs = isAllContainersSelected
    ? []
    : selectedContainer.logs[dashboardLogView];
  const selectedContainerStatusLabel = formatStatusLabel(
    selectedContainer.status,
  );
  const selectedContainerStatusVariant = getStatusBadgeVariant(
    selectedContainer.status,
  );
  const runtimePillLabel = selectedRuntimeContainer
    ? formatRuntimeStatusLabel(selectedRuntimeContainer)
    : selectedContainer.uptime;
  const healthOrNodeLabel = selectedRuntimeContainer
    ? formatRuntimeHealthLabel(selectedRuntimeContainer.health)
    : selectedContainer.node;
  const projectOrRegionLabel =
    selectedRuntimeContainer?.projectName ?? selectedContainer.region;
  const serviceOrPortLabel =
    selectedRuntimeContainer?.serviceName ?? selectedContainer.port;
  const sampleContextLabel = selectedRuntimeContainer
    ? buildRuntimeSummary(selectedRuntimeContainer)
    : selectedContainer.summary;
  const aggregateLogsTargetName = isAllContainersSelected
    ? "All containers"
    : selectedContainer.name;
  const aggregateLogsTargetRegion = isAllContainersSelected
    ? (sidebarSnapshot?.hostIp ?? "Current host")
    : selectedContainer.region;
  const aggregateLogsStatusLabel = isAllContainersSelected
    ? `${sidebarSnapshot?.containers.running ?? 0} running`
    : selectedContainerStatusLabel;
  const aggregateLogsStatusVariant = isAllContainersSelected
    ? "default"
    : selectedContainerStatusVariant;
  const liveAppsCount = deployments.filter(
    (deployment) => deployment.status === "running",
  ).length;
  const gitSidebarAppItems = filteredDeployments.map((deployment) => ({
    appName: deployment.appName,
    domain: formatDeploymentDomain(deployment, baseDomain),
    dotClassName: getDeploymentStatusDotClassName(deployment.status),
    id: deployment.id,
    isActive: deployment.id === selectedAppId,
    relativeUpdatedAt: formatRelativeTime(deployment.updatedAt),
    statusLabel: formatDeploymentStatus(deployment.status),
    statusVariant: getDeploymentStatusBadgeVariant(deployment.status),
  }));
  const selectedDeploymentStatusLabel = selectedDeployment
    ? formatDeploymentStatus(selectedDeployment.status)
    : "Stopped";
  const selectedDeploymentStatusVariant = selectedDeployment
    ? getDeploymentStatusBadgeVariant(selectedDeployment.status)
    : "default";
  const selectedDeploymentDomain = selectedDeployment
    ? formatDeploymentDomain(selectedDeployment, baseDomain)
    : "";

  return (
    <section
      className="flex h-screen flex-col bg-linear-to-b from-background via-muted/12 to-background"
      aria-label="Workspace shell"
    >
      <WorkspaceHeader
        activeViewDescription={activeViewDescription}
        activeViewLabel={activeViewMeta.label}
        activeViewStatusLabel={activeViewStatusLabel}
        onResetLayoutAction={handleResetLayout}
        title={activeViewTitle}
      />

      <div className="flex min-w-0 flex-1 overflow-hidden">
        <WorkspaceRail
          activeView={activeView}
          items={WORKSPACE_PAGES}
          onViewChangeAction={handleViewChange}
        />

        {activeView === "dashboard" ? (
          <DashboardLeftSidebar
            activeContainerId={activeContainerId}
            containers={filteredContainers}
            hostMetricsProps={hostMetricsProps}
            isAllContainersSelected={isAllContainersSelected}
            listWidth={listWidth}
            onAllContainersSelectAction={() =>
              setSelectedContainerId(ALL_CONTAINERS_ID)
            }
            onContainerSelectAction={setSelectedContainerId}
            onListResizeStartAction={(event) =>
              handleResizeStart("list", event)
            }
            onSearchQueryChangeAction={setSearchQuery}
            runningContainersCount={sidebarSnapshot?.containers.running ?? null}
            searchQuery={searchQuery}
            visibleCount={filteredContainers.length}
          />
        ) : (
          <GitAppPageLeftSidebar
            appItems={gitSidebarAppItems}
            appSearchQuery={appSearchQuery}
            baseDomain={baseDomain}
            branchError={branchState.error}
            branchHelperText={branchHelperText}
            branchOptions={branchOptions}
            draftApp={draftApp}
            hostMetricsProps={hostMetricsProps}
            isBranchLoading={branchState.isLoading}
            isCreateAppExpanded={isCreateAppExpanded}
            isCreateAppPending={isCreateAppPending}
            listWidth={listWidth}
            liveAppsCount={liveAppsCount}
            onAppSearchQueryChangeAction={setAppSearchQuery}
            onCreateAppAction={handleCreateApp}
            onDraftChangeAction={handleDraftAppChange}
            onListResizeStartAction={(event) =>
              handleResizeStart("list", event)
            }
            onRepositorySelectAction={handleRepositorySelect}
            onSelectAppAction={setSelectedAppId}
            onToggleCreateAppAction={handleToggleCreateAppPanel}
            repositoryOptions={repositoryOptions}
            repositoryState={repositoryState}
            selectedRepositorySummary={selectedRepositorySummary}
            selectedRepositoryValue={selectedRepositoryValue}
            totalAppsCount={deployments.length}
          />
        )}

        <main className="min-w-0 flex-1 overflow-auto bg-linear-to-b from-background/72 via-muted/14 to-background p-4 md:p-5">
          {activeView === "dashboard" ? (
            isAllContainersSelected ? (
              <DashboardAllContainersContent
                charts={allContainersMetricCharts}
                onRangeChangeAction={setDashboardRange}
                range={dashboardRange}
                rangeOptions={ALL_CONTAINERS_RANGE_OPTIONS}
                snapshot={sidebarSnapshot}
              />
            ) : (
              <DashboardMainContent
                focusedMetricCharts={focusedMetricCharts}
                healthOrNodeLabel={healthOrNodeLabel}
                onRangeChangeAction={setDashboardRange}
                projectOrRegionLabel={projectOrRegionLabel}
                range={dashboardRange}
                rangeOptions={ALL_CONTAINERS_RANGE_OPTIONS}
                runtimePillLabel={runtimePillLabel}
                sampleContextLabel={sampleContextLabel}
                selectedContainer={selectedContainer}
                selectedRuntimeContainer={selectedRuntimeContainer}
                selectedStatusLabel={selectedContainerStatusLabel}
                selectedStatusVariant={selectedContainerStatusVariant}
                serviceOrPortLabel={serviceOrPortLabel}
              />
            )
          ) : selectedDeployment ? (
            <GitAppPageMainContent
              baseDomain={baseDomain}
              deployment={selectedDeployment}
              deploymentHref={selectedDeploymentHref}
              deploymentStatusLabel={selectedDeploymentStatusLabel}
              deploymentStatusVariant={selectedDeploymentStatusVariant}
              onDeleteAction={handleDeleteApp}
              onFetchAction={handleFetchApp}
              onRefreshAction={() => router.refresh()}
              onRecreateAction={handleRecreateApp}
              onSaveSettingsAction={handleSaveApp}
              onStartAction={handleStartApp}
              onStopAction={handleStopApp}
              publicDomainLabel={selectedDeploymentDomain}
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="max-w-lg rounded-[1.75rem] border border-border/70 bg-background/86 px-6 py-8 text-center shadow-[0_28px_72px_-48px_rgba(15,23,42,0.3)]">
                <SectionLabel icon="github" text="Git App Page" />
                <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">
                  Add your first app
                </h1>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Open the compact create panel in the sidebar to pick a
                  repository and start a live deployment.
                </p>
              </div>
            </div>
          )}
        </main>

        {activeView === "dashboard" ? (
          <DashboardRightSidebar
            activeLogView={dashboardLogView}
            isCollapsed={isLogsCollapsed}
            isAggregateSelection={isAllContainersSelected}
            logOptions={LOG_VIEW_OPTIONS}
            logs={previewLogs}
            onCollapseAction={() => setIsLogsCollapsed(true)}
            onExpandAction={() => setIsLogsCollapsed(false)}
            onLogViewChangeAction={setDashboardLogView}
            onResizeStartAction={(event) => handleResizeStart("logs", event)}
            selectedContainerName={aggregateLogsTargetName}
            selectedContainerRegion={aggregateLogsTargetRegion}
            selectedContainerStatusLabel={aggregateLogsStatusLabel}
            selectedContainerStatusVariant={aggregateLogsStatusVariant}
            selectedPreviewAvailable={
              !isAllContainersSelected && Boolean(selectedPreviewContainer)
            }
            width={logsWidth}
          />
        ) : (
          <GitAppPageRightSidebar
            activeLogTab={appLogTab}
            deploymentId={selectedDeployment?.id ?? null}
            deployments={deployments}
            isCollapsed={isLogsCollapsed}
            onCollapseAction={() => setIsLogsCollapsed(true)}
            onExpandAction={() => setIsLogsCollapsed(false)}
            onLogTabChangeAction={setAppLogTab}
            onResizeStartAction={(event) => handleResizeStart("logs", event)}
            width={logsWidth}
          />
        )}
      </div>

      <WorkspaceFooter
        activeViewLabel={activeViewMeta.label}
        updatedAtLabel={updatedAtLabel}
      />
    </section>
  );
}
