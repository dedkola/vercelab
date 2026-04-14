"use client";

import {
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { StackedArea, themes, useContainerWidth } from "@derpdaderp/chartkit";

import { Icon, type IconName } from "@/components/dashboard-kit";
import { GitDeploymentPage, GitLogPanel } from "./git-deployment-page";
import type { GitHubRepository } from "@/lib/github";
import type { MetricsHistoryPoint } from "@/lib/influx-metrics";
import type { DashboardData } from "@/lib/persistence";
import type { MetricsSnapshot } from "@/lib/system-metrics";

// Patch pearl theme: swap second series color to purple for upload indicator
themes["pearl"].colors[1] = "#8b5cf6";

const POLL_INTERVAL_MS = 5000;
const HISTORY_LIMIT = 48;

type DashboardSection = "overview" | "git";

type MetricsDashboardProps = {
  baseDomain: string;
  dashboardData: DashboardData;
  flashMessage: {
    message: string;
    status: "success" | "error";
  } | null;
  initialGithubToken: string;
  initialSection: DashboardSection;
};

const RAIL_PRIMARY: Array<{
  icon: IconName;
  label?: string;
  section?: DashboardSection;
}> = [
  { icon: "network", label: "Overview", section: "overview" },
  { icon: "cloud", label: "Git", section: "git" },
];

const TRAFFIC_ROWS = [
  {
    name: "DelugeTorrent",
    badge: "D",
    color: "#1846b3",
    down: "1.61 GB",
    toneClass: "torrent",
    up: "57.3 GB",
    traffic: "58.9 GB",
  },
  {
    name: "BitTorrent Series",
    badge: "BT",
    color: "#2d6cf7",
    down: "1.00 GB",
    toneClass: "series",
    up: "22.4 GB",
    traffic: "23.4 GB",
  },
  {
    name: "SSL/TLS",
    badge: "S",
    color: "#48b8ea",
    down: "4.92 GB",
    toneClass: "ssl",
    up: "84.2 MB",
    traffic: "5.01 GB",
  },
  {
    name: "YouTube",
    badge: "YT",
    color: "#40c463",
    down: "3.34 GB",
    toneClass: "youtube",
    up: "20.5 MB",
    traffic: "3.36 GB",
  },
  {
    name: "Web Streaming",
    badge: "WS",
    color: "#bddb32",
    down: "2.92 GB",
    toneClass: "streaming",
    up: "14.4 MB",
    traffic: "2.94 GB",
  },
];

const CONNECTION_ROWS = [
  {
    label: "WiFi 6",
    band: "5 GHz",
    activity: 0.86,
    activityWidthClass: "connections-bar__fill--86",
    color: "#6a35db",
    experience: "Excellent",
    connections: 5,
    toneClass: "violet",
  },
  {
    label: "WiFi 5",
    band: "5 GHz",
    activity: 0.19,
    activityWidthClass: "connections-bar__fill--19",
    color: "#1d74f4",
    experience: "Excellent",
    connections: 1,
    toneClass: "blue",
  },
  {
    label: "WiFi 6",
    band: "6 GHz",
    activity: 0.04,
    activityWidthClass: "connections-bar__fill--4",
    color: "#1746af",
    experience: "Excellent",
    connections: 2,
    toneClass: "navy",
  },
  {
    label: "WiFi 4",
    band: "2.4 GHz",
    activity: 0.06,
    activityWidthClass: "connections-bar__fill--6",
    color: "#4ec0f0",
    experience: "Excellent",
    connections: 3,
    toneClass: "cyan",
  },
  {
    label: "WiFi 4",
    band: "5 GHz",
    activity: 0.03,
    activityWidthClass: "connections-bar__fill--6",
    color: "#5a93f3",
    experience: "Excellent",
    connections: 2,
    toneClass: "sky",
  },
  {
    label: "WiFi 6",
    band: "2.4 GHz",
    activity: 0.02,
    activityWidthClass: "connections-bar__fill--6",
    color: "#245cc7",
    experience: "Excellent",
    connections: 1,
    toneClass: "indigo",
  },
];

type HistoryPoint = {
  timestamp: string;
  cpu: number;
  memory: number;
  networkIn: number;
  networkOut: number;
  networkTotal: number;
  containersCpu: number;
  containersMemory: number;
};

type AxisTick = {
  label: string;
  position: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  const precision = size >= 100 ? 0 : size >= 10 ? 1 : 2;
  return `${size.toFixed(precision)} ${units[unitIndex]}`;
}

function formatRate(value: number) {
  return `${formatBytes(value)}/s`;
}

function formatBitRateParts(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return {
      amount: "0",
      unit: "bps",
    };
  }

  const units = ["bps", "Kbps", "Mbps", "Gbps", "Tbps"];
  let rate = value * 8;
  let unitIndex = 0;

  while (rate >= 1000 && unitIndex < units.length - 1) {
    rate /= 1000;
    unitIndex += 1;
  }

  const precision = unitIndex === 0 ? 0 : rate >= 100 ? 0 : rate >= 10 ? 1 : 2;

  return {
    amount: rate.toFixed(precision),
    unit: units[unitIndex],
  };
}

function formatPercent(value: number) {
  return `${value.toFixed(value >= 100 ? 0 : 1)}%`;
}

function formatClock(value: string) {
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatMegabitsPerSecond(value: number) {
  const mbps = (value * 8) / 1_000_000;

  if (!Number.isFinite(mbps) || mbps <= 0) {
    return "0.0";
  }

  if (mbps >= 100) {
    return mbps.toFixed(0);
  }

  return mbps.toFixed(1);
}

function buildPath(
  values: number[],
  width: number,
  height: number,
  maxValue: number,
) {
  if (values.length === 0) {
    return "";
  }

  const safeMax = Math.max(maxValue, 1);
  const stepX = values.length > 1 ? width / (values.length - 1) : width;

  return values
    .map((value, index) => {
      const x = index * stepX;
      const y = height - (clamp(value, 0, safeMax) / safeMax) * height;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function buildArea(
  values: number[],
  width: number,
  height: number,
  maxValue: number,
) {
  if (values.length === 0) {
    return "";
  }

  const line = buildPath(values, width, height, maxValue);
  const stepX = values.length > 1 ? width / (values.length - 1) : width;
  const endX = (values.length - 1) * stepX;

  return `${line} L${endX.toFixed(2)} ${height} L0 ${height} Z`;
}

function getNiceMaxValue(values: number[], fallback: number) {
  const peak = Math.max(...values, fallback, 1);
  const scaled = peak * 1.1;
  const power = 10 ** Math.floor(Math.log10(scaled));
  const normalized = scaled / power;

  if (normalized <= 1) {
    return power;
  }

  if (normalized <= 2) {
    return 2 * power;
  }

  if (normalized <= 5) {
    return 5 * power;
  }

  return 10 * power;
}

function buildAxisTicks(history: HistoryPoint[], count: number): AxisTick[] {
  if (history.length === 0) {
    return ["18:00", "22:04", "02:08", "06:13", "10:17", "14:21", "Now"].map(
      (label, index, all) => ({
        label,
        position: index / (all.length - 1),
      }),
    );
  }

  return Array.from({ length: count }, (_, index) => {
    const historyIndex =
      count === 1
        ? history.length - 1
        : Math.round(((history.length - 1) * index) / (count - 1));

    return {
      label:
        index === count - 1
          ? "Now"
          : formatClock(history[historyIndex].timestamp),
      position: count === 1 ? 0.5 : index / (count - 1),
    };
  });
}

function TrafficDonut({
  segments,
  centerValue,
  label,
}: {
  segments: Array<{ color: string; ratio: number }>;
  centerValue: string;
  label: string;
}) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="donut">
      <svg className="donut__ring" viewBox="0 0 140 140" aria-hidden="true">
        <circle
          cx="70"
          cy="70"
          r={radius}
          fill="none"
          stroke="#edf0f4"
          strokeWidth="12"
        />

        {segments.map((segment, index) => {
          const completedRatio = segments
            .slice(0, index)
            .reduce((sum, entry) => sum + entry.ratio, 0);
          const dash = circumference * segment.ratio;
          const dashOffset = circumference * (1 - completedRatio);

          return (
            <circle
              key={`${segment.color}-${segment.ratio}`}
              cx="70"
              cy="70"
              r={radius}
              fill="none"
              stroke={segment.color}
              strokeWidth="12"
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={dashOffset}
            />
          );
        })}
      </svg>

      <div className="donut__center">
        <div className="donut__value">{centerValue}</div>
        <div className="donut__label">{label}</div>
      </div>
    </div>
  );
}

function MainTrafficChart({
  history,
}: {
  history: HistoryPoint[];
}) {
  const width = 1160;
  const height = 262;
  const lineInset = 56;
  const graphWidth = width - lineInset * 2;
  const graphHeight = height - 38;
  const inbound = history.map((entry) => entry.networkIn);
  const outbound = history.map((entry) => entry.networkOut);
  const total = history.map((entry) => entry.networkTotal);
  const latency = history.map(
    (entry) => 1 + entry.cpu / 14 + entry.memory / 35,
  );
  const networkPeak = getNiceMaxValue(
    [...total, ...inbound, ...outbound],
    16_000,
  );
  const latencyPeak = 120;
  const xTicks = buildAxisTicks(history, 7);
  const yTicks = Array.from({ length: 5 }, (_, index) => index / 4);
  const inboundPath = buildPath(inbound, graphWidth, graphHeight, networkPeak);
  const outboundPath = buildPath(
    outbound,
    graphWidth,
    graphHeight,
    networkPeak,
  );
  const totalPath = buildPath(total, graphWidth, graphHeight, networkPeak);
  const inboundArea = buildArea(inbound, graphWidth, graphHeight, networkPeak);
  const outboundArea = buildArea(
    outbound,
    graphWidth,
    graphHeight,
    networkPeak,
  );
  const totalArea = buildArea(total, graphWidth, graphHeight, networkPeak);
  const latencyPath = buildPath(latency, graphWidth, graphHeight, latencyPeak);

  return (
    <div className="chart-placeholder">
      <svg
        className="main-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Network activity chart"
      >
        <text className="main-chart__unit main-chart__unit--left" x="10" y="16">
          ms
        </text>
        <text
          className="main-chart__unit main-chart__unit--right"
          x={width - 10}
          y="16"
        >
          Mbps
        </text>

        {yTicks.map((tick) => {
          const y = 24 + graphHeight * tick;
          const latencyValue = Math.round(latencyPeak - latencyPeak * tick);
          const networkValue = formatMegabitsPerSecond(
            networkPeak - networkPeak * tick,
          );

          return (
            <g key={`tick-${tick}`}>
              <line
                className="main-chart__grid"
                x1={lineInset}
                y1={y}
                x2={width - lineInset}
                y2={y}
              />
              <text
                className="main-chart__axis main-chart__axis--left"
                x={lineInset - 12}
                y={y + 4}
              >
                {latencyValue}
              </text>
              <text
                className="main-chart__axis main-chart__axis--right"
                x={width - lineInset + 16}
                y={y + 4}
              >
                {networkValue}
              </text>
            </g>
          );
        })}

        {xTicks.map((tick) => {
          const x = lineInset + graphWidth * tick.position;

          return (
            <g key={`x-${tick.label}-${tick.position}`}>
              <line
                className="main-chart__grid main-chart__grid--vertical"
                x1={x}
                y1="24"
                x2={x}
                y2={24 + graphHeight}
              />
              <text className="main-chart__time" x={x} y={height - 8}>
                {tick.label}
              </text>
            </g>
          );
        })}

        <g transform={`translate(${lineInset} 24)`}>
          {totalArea ? (
            <path
              className="main-chart__area main-chart__area--total"
              d={totalArea}
            />
          ) : null}
          {inboundArea ? (
            <path
              className="main-chart__area main-chart__area--blue"
              d={inboundArea}
            />
          ) : null}
          {outboundArea ? (
            <path
              className="main-chart__area main-chart__area--violet"
              d={outboundArea}
            />
          ) : null}
          {inboundPath ? (
            <path
              className="main-chart__line main-chart__line--blue"
              d={inboundPath}
            />
          ) : null}
          {outboundPath ? (
            <path
              className="main-chart__line main-chart__line--violet"
              d={outboundPath}
            />
          ) : null}
          {totalPath ? (
            <path
              className="main-chart__line main-chart__line--total"
              d={totalPath}
            />
          ) : null}
          {latencyPath ? (
            <path
              className="main-chart__line main-chart__line--amber"
              d={latencyPath}
            />
          ) : null}
        </g>
      </svg>
    </div>
  );
}

function MiniNetworkChart({ history }: { history: HistoryPoint[] }) {
  const { ref, width } = useContainerWidth<HTMLDivElement>();
  const series = history.slice(-24);
  const data = series.length
    ? series.map((entry, i) => ({
        time: `${i * (POLL_INTERVAL_MS / 1000)}s`,
        download: parseFloat(((entry.networkIn * 8) / 1_000_000).toFixed(2)),
        upload: parseFloat(((entry.networkOut * 8) / 1_000_000).toFixed(2)),
      }))
    : [];

  return (
    <div className="mini-network-chart" ref={ref}>
      {width > 0 && (
        <StackedArea
          data={data}
          dataKeys={["download", "upload"]}
          timeKey="time"
          theme="pearl"
          showArea
          fillOpacity={0.5}
          width={width}
          height={160}
          style={{ background: "transparent" }}
        />
      )}
    </div>
  );
}

export default function MetricsDashboard({
  baseDomain,
  dashboardData,
  flashMessage,
  initialGithubToken,
  initialSection,
}: MetricsDashboardProps) {
  const [activeSection, setActiveSection] =
    useState<DashboardSection>(initialSection);
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
  const [isRightPanelCollapsed, setIsRightPanelCollapsed] = useState(false);
  const [logDeploymentId, setLogDeploymentId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<MetricsSnapshot | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [githubToken, setGithubToken] = useState(initialGithubToken);
  const [gitRepositories, setGitRepositories] = useState<GitHubRepository[]>(
    [],
  );
  const [gitRepositoriesError, setGitRepositoriesError] = useState<
    string | null
  >(null);
  const [isLoadingGitRepositories, setIsLoadingGitRepositories] =
    useState(false);
  const [selectedGitRepositoryId, setSelectedGitRepositoryId] = useState("");
  const [isGitRepositoryMenuOpen, setIsGitRepositoryMenuOpen] = useState(false);
  const [repositoryDraft, setRepositoryDraft] =
    useState<GitHubRepository | null>(null);
  const [repositoryDraftSignal, setRepositoryDraftSignal] = useState(0);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const gitRepositoryMenuId = useId();
  const gitRepositoryMenuRef = useRef<HTMLDivElement | null>(null);

  const deferredSnapshot = useDeferredValue(snapshot);
  const deferredHistory = useDeferredValue(history);

  const commitSnapshot = useEffectEvent(
    (nextSnapshot: MetricsSnapshot, nextHistory: MetricsHistoryPoint[]) => {
    startTransition(() => {
      setSnapshot(nextSnapshot);
      setHistory(nextHistory.slice(-HISTORY_LIMIT));
      setErrorMessage(null);
    });
    },
  );

  const commitError = useEffectEvent((message: string) => {
    startTransition(() => {
      setErrorMessage(message);
    });
  });

  async function loadGitRepositories() {
    const token = githubToken.trim();

    if (token.length < 20) {
      setGitRepositoriesError(
        "Add a valid GitHub token before loading repositories.",
      );
      return;
    }

    setIsLoadingGitRepositories(true);
    setIsGitRepositoryMenuOpen(false);
    setGitRepositoriesError(null);

    try {
      const response = await fetch("/api/github/repos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token }),
      });

      const payload = (await response.json()) as {
        repositories?: GitHubRepository[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to load repositories.");
      }

      const repositories = payload.repositories ?? [];

      setGitRepositories(repositories);
      setSelectedGitRepositoryId((current) => {
        if (
          repositories.some((repository) => String(repository.id) === current)
        ) {
          return current;
        }

        return repositories[0] ? String(repositories[0].id) : "";
      });
      setGitRepositoriesError(
        repositories.length === 0
          ? "This token did not return any repositories."
          : null,
      );
    } catch (error) {
      setGitRepositories([]);
      setSelectedGitRepositoryId("");
      setGitRepositoriesError(
        error instanceof Error ? error.message : "Unable to load repositories.",
      );
    } finally {
      setIsLoadingGitRepositories(false);
    }
  }

  const selectedGitRepository =
    gitRepositories.find(
      (repository) => String(repository.id) === selectedGitRepositoryId,
    ) ?? null;

  function queueSelectedRepository() {
    if (!selectedGitRepository) {
      setGitRepositoriesError("Choose a repository before adding it.");
      return;
    }

    setRepositoryDraft(selectedGitRepository);
    setRepositoryDraftSignal((current) => current + 1);
    setIsGitRepositoryMenuOpen(false);
    setGitRepositoriesError(null);
  }

  useEffect(() => {
    if (!isGitRepositoryMenuOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (
        gitRepositoryMenuRef.current &&
        !gitRepositoryMenuRef.current.contains(event.target as Node)
      ) {
        setIsGitRepositoryMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsGitRepositoryMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isGitRepositoryMenuOpen]);

  useEffect(() => {
    setActiveSection(initialSection);
  }, [initialSection]);

  const autoLoadGitRepositories = useEffectEvent(() => {
    if (initialGithubToken.trim().length >= 20) {
      void loadGitRepositories();
    }
  });

  useEffect(() => {
    autoLoadGitRepositories();
  }, []);

  useEffect(() => {
    let active = true;

    const poll = async () => {
      try {
        const response = await fetch("/api/metrics", {
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

        commitSnapshot(payload.snapshot, payload.history ?? []);
      } catch (error) {
        if (!active) {
          return;
        }

        commitError(
          error instanceof Error
            ? error.message
            : "Unable to load live metrics.",
        );
      }
    };

    poll();
    const intervalId = window.setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, []);

  function handleSectionChange(section: DashboardSection) {
    setActiveSection(section);

    const params = new URLSearchParams(searchParams.toString());

    if (section === "git") {
      params.set("section", "git");
    } else {
      params.delete("section");
    }

    const query = params.toString();
    const nextUrl = query ? `${pathname}?${query}` : pathname;

    window.history.pushState(null, "", nextUrl);
  }

  const totalRate = deferredSnapshot
    ? deferredSnapshot.network.rxBytesPerSecond +
      deferredSnapshot.network.txBytesPerSecond
    : 0;
  const topContainers = deferredSnapshot?.containers.top ?? [];
  const statusMessage = deferredSnapshot
    ? "Live host traffic aggregated across server interfaces"
    : (errorMessage ?? "Connecting to metrics feed");
  const donutSegments = TRAFFIC_ROWS.map((row) => {
    const numericValue =
      Number.parseFloat(row.traffic.replace(/[^\d.]/g, "")) || 1;
    const totalNumeric = 58.9 + 23.4 + 5.01 + 3.36 + 2.94 + 2.66;

    return {
      color: row.color,
      ratio: numericValue / totalNumeric,
    };
  });
  const connectionSegments = CONNECTION_ROWS.map((row) => ({
    color: row.color,
    ratio: row.connections / 14,
  }));
  const panelMeta = deferredSnapshot
    ? `${formatPercent(deferredSnapshot.system.cpuPercent)} CPU · ${formatPercent(
        deferredSnapshot.system.memoryPercent,
      )} memory`
    : "Collecting system metrics";
  const uplinkLabel = deferredSnapshot
    ? `${formatRate(deferredSnapshot.network.rxBytesPerSecond)} down · ${formatRate(
        deferredSnapshot.network.txBytesPerSecond,
      )} up`
    : "Waiting for uplink counters";
  const timestampLabel = deferredSnapshot
    ? formatClock(deferredSnapshot.timestamp)
    : "--:--";
  const downloadRate = deferredSnapshot?.network.rxBytesPerSecond ?? 0;
  const uploadRate = deferredSnapshot?.network.txBytesPerSecond ?? 0;
  const downloadRateDisplay = formatBitRateParts(downloadRate);
  const uploadRateDisplay = formatBitRateParts(uploadRate);
  const isOverviewSection = activeSection === "overview";
  const isGitSection = activeSection === "git";
  const activeRailEntry =
    RAIL_PRIMARY.find((entry) => entry.section === activeSection) ??
    RAIL_PRIMARY[0];

  return (
    <section
      className="shell shell--compact"
      aria-label="UniFi styled dashboard"
    >
      <header className="topbar">
        <div className="topbar__left">
          <button className="site-switch" type="button">
            <span className="site-switch__dot" />
            <span className="site-switch__name">Vercelab</span>
          </button>

          <span className="app-pill">
            <Icon name={activeRailEntry.icon} />
            {activeRailEntry.label ?? "Overview"}
          </span>
        </div>

        <div className="topbar__center">
          <div className="header-sysinfo">
            <span className="header-sysinfo__item">
              <span className="header-sysinfo__label">Host IP</span>
              <span className="header-sysinfo__value">
                {deferredSnapshot?.hostIp ?? "—"}
              </span>
              <button
                className="header-sysinfo__copy"
                type="button"
                aria-label="Copy host IP"
                onClick={() =>
                  void navigator.clipboard.writeText(
                    deferredSnapshot?.hostIp ?? "",
                  )
                }
              >
                <Icon name="copy" />
              </button>
            </span>
            <span className="header-sysinfo__sep" />
            <span className="header-sysinfo__item">
              <span className="header-sysinfo__label">Traefik</span>
              <span className="header-sysinfo__value">{baseDomain}</span>
              <button
                className="header-sysinfo__copy"
                type="button"
                aria-label="Copy traefik hostname"
                onClick={() => void navigator.clipboard.writeText(baseDomain)}
              >
                <Icon name="copy" />
              </button>
            </span>
            <span className="header-sysinfo__sep" />
            <span className="header-sysinfo__item">
              <span className="header-sysinfo__label">LA</span>
              <span className="header-sysinfo__value">
                {deferredSnapshot
                  ? deferredSnapshot.system.loadAverage[0].toFixed(2)
                  : "—"}
              </span>
            </span>
          </div>
        </div>

        <div className="topbar__right">
          <button className="topbar-btn" type="button" aria-label="Theme">
            <Icon name="theme" />
          </button>
          <button className="topbar-avatar" type="button" aria-label="Profile">
            <Icon name="profile" />
          </button>
        </div>
      </header>

      <div
        className={`body ${isPanelCollapsed ? "body--panel-collapsed" : ""} ${isGitSection ? (isRightPanelCollapsed ? "body--right-collapsed" : "body--right-open") : ""}`}
      >
        <aside className="rail" aria-label="Primary navigation">
          <div className="rail__group">
            {RAIL_PRIMARY.map((entry) => (
              <button
                aria-label={entry.label ?? entry.icon}
                className={`rail__link ${
                  entry.section === activeSection ? "rail__link--active" : ""
                } ${entry.section ? "" : "rail__link--muted"}`}
                key={entry.icon}
                onClick={
                  entry.section
                    ? () => {
                        if (entry.section) {
                          handleSectionChange(entry.section);
                        }
                      }
                    : undefined
                }
                type="button"
              >
                <Icon name={entry.icon} />
              </button>
            ))}
          </div>
        </aside>

        <aside
          className={`panel ${isPanelCollapsed ? "panel--collapsed" : ""}`}
          aria-label={
            isOverviewSection ? "Gateway details" : "Git deployment sidebar"
          }
          id="gateway-panel"
        >
          <button
            className="panel__collapse"
            type="button"
            aria-controls="gateway-panel"
            aria-label={
              isPanelCollapsed
                ? `Show ${isOverviewSection ? "gateway details" : "Git tools"} panel`
                : `Hide ${isOverviewSection ? "gateway details" : "Git tools"} panel`
            }
            onClick={() => setIsPanelCollapsed((current) => !current)}
          >
            <Icon name={isPanelCollapsed ? "chevron-right" : "chevron-left"} />
          </button>

          {!isPanelCollapsed ? (
            <div className="panel__content" id="gateway-panel-content">
              {isOverviewSection ? (
                <>
                  <div className="info-row">
                    <span className="info-row__label">Gateway IP</span>
                    <span className="info-row__value">192.168.0.1</span>
                  </div>
                  <div className="info-row">
                    <span className="info-row__label">System Uptime</span>
                    <span className="info-row__value">3w 2d 13h 37m</span>
                  </div>

                  <div className="version-bar">
                    <span className="version-item">
                      Network 10.2.105
                      <Icon name="copy" />
                    </span>
                    <span className="version-item">
                      UniFi OS 5.0.16
                      <Icon name="copy" />
                    </span>
                  </div>

                  <hr className="panel__hr" />

                  <section className="throughput-card" aria-label="Throughput">
                    <div className="throughput-compact">
                      <div className="throughput-compact__item throughput-compact__item--down">
                        <span className="throughput-compact__label">
                          <Icon name="arrow-down" />
                        </span>
                        <span className="throughput-compact__value">
                          <span className="throughput-compact__value-main">
                            {downloadRateDisplay.amount}
                          </span>
                          <span className="throughput-compact__value-unit">
                            {downloadRateDisplay.unit}
                          </span>
                        </span>
                      </div>

                      <div className="throughput-compact__item throughput-compact__item--up">
                        <span className="throughput-compact__label">
                          <Icon name="arrow-up" />
                        </span>
                        <span className="throughput-compact__value">
                          <span className="throughput-compact__value-main">
                            {uploadRateDisplay.amount}
                          </span>
                          <span className="throughput-compact__value-unit">
                            {uploadRateDisplay.unit}
                          </span>
                        </span>
                      </div>
                    </div>

                    <MiniNetworkChart history={deferredHistory} />
                  </section>
                </>
              ) : (
                <div className="git-panel">
                  <div className="git-panel__eyebrow">Git</div>
                  <div className="git-panel__title">Repository access</div>

                  <form
                    className="git-panel__form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void loadGitRepositories();
                    }}
                  >
                    <label className="field" htmlFor="githubToken">
                      <span className="field__label">GitHub token</span>
                      <input
                        autoComplete="off"
                        id="githubToken"
                        onChange={(event) => setGithubToken(event.target.value)}
                        placeholder="ghp_..."
                        type="password"
                        value={githubToken}
                      />
                    </label>

                    <div className="git-panel__actions">
                      <button
                        className="git-panel__load-button"
                        disabled={isLoadingGitRepositories}
                        type="submit"
                      >
                        {isLoadingGitRepositories ? "Loading..." : "Load repos"}
                      </button>
                    </div>
                  </form>

                  <div className="field">
                    <span className="field__label">Repository</span>
                    <div className="git-panel__repo-row">
                      <div
                        className="git-panel__dropdown"
                        ref={gitRepositoryMenuRef}
                      >
                        <button
                          aria-controls={gitRepositoryMenuId}
                          aria-expanded={isGitRepositoryMenuOpen}
                          className="header-dropdown git-panel__dropdown-trigger"
                          disabled={
                            isLoadingGitRepositories ||
                            gitRepositories.length === 0
                          }
                          onClick={() =>
                            setIsGitRepositoryMenuOpen((current) => !current)
                          }
                          type="button"
                        >
                          <span className="git-panel__dropdown-value">
                            <span className="git-panel__dropdown-copy">
                              <span className="git-panel__dropdown-title">
                                {selectedGitRepository?.fullName ??
                                  (gitRepositories.length > 0
                                    ? "Choose a repository"
                                    : isLoadingGitRepositories
                                      ? "Loading repositories..."
                                      : "Load repositories first")}
                              </span>
                              <span className="git-panel__dropdown-meta">
                                {selectedGitRepository
                                  ? `${selectedGitRepository.visibility} branch ${selectedGitRepository.defaultBranch}`
                                  : gitRepositories.length > 0
                                    ? `${gitRepositories.length} repositories ready`
                                    : "Use your token to load repositories"}
                              </span>
                            </span>
                          </span>
                          <Icon name="chevron-down" />
                        </button>

                        {isGitRepositoryMenuOpen ? (
                          <div
                            className="git-panel__dropdown-menu"
                            id={gitRepositoryMenuId}
                            role="listbox"
                          >
                            {gitRepositories.length > 0 ? (
                              gitRepositories.map((repository) => {
                                const isSelected =
                                  String(repository.id) ===
                                  selectedGitRepositoryId;

                                return (
                                  <button
                                    aria-selected={isSelected}
                                    className={`git-panel__dropdown-option ${
                                      isSelected
                                        ? "git-panel__dropdown-option--selected"
                                        : ""
                                    }`}
                                    key={repository.id}
                                    onClick={() => {
                                      setSelectedGitRepositoryId(
                                        String(repository.id),
                                      );
                                      setIsGitRepositoryMenuOpen(false);
                                    }}
                                    role="option"
                                    type="button"
                                  >
                                    <span className="git-panel__dropdown-option-name">
                                      {repository.fullName}
                                    </span>
                                    <span className="git-panel__dropdown-option-meta">
                                      {repository.visibility} branch{" "}
                                      {repository.defaultBranch}
                                    </span>
                                  </button>
                                );
                              })
                            ) : (
                              <div className="git-panel__dropdown-empty">
                                Load repositories to start a deployment draft.
                              </div>
                            )}
                          </div>
                        ) : null}
                      </div>

                      <button
                        className="button button--secondary"
                        disabled={!selectedGitRepository}
                        onClick={() => {
                          queueSelectedRepository();
                        }}
                        type="button"
                      >
                        Add
                      </button>
                    </div>
                  </div>

                  {selectedGitRepository ? (
                    <div className="git-panel__repo-card">
                      <div className="git-panel__repo-name">
                        {selectedGitRepository.fullName}
                      </div>
                      <div className="git-panel__repo-meta">
                        <span>{selectedGitRepository.visibility}</span>
                        <span>{selectedGitRepository.defaultBranch}</span>
                      </div>
                      <p className="git-panel__repo-copy">
                        {selectedGitRepository.description ??
                          "This repository is ready to seed a deployment draft."}
                      </p>
                    </div>
                  ) : null}

                  {gitRepositoriesError ? (
                    <div className="git-panel__notice git-panel__notice--error">
                      {gitRepositoriesError}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}
        </aside>

        <main className="main">
          {isOverviewSection ? (
            <>
              <section className="chart-area">
                <MainTrafficChart
                  history={deferredHistory}
                />
              </section>

              <section className="dashboard-overview">
                <div className="dashboard-overview__main">
                  <div className="overview-grid">
                    <article className="unifi-card unifi-card--traffic">
                      <div className="overview-card__header">
                        <div>
                          <div className="overview-card__title">Traffic</div>
                          <div className="overview-card__meta">
                            {statusMessage}
                          </div>
                        </div>
                        <div className="overview-card__stamp">
                          {timestampLabel}
                        </div>
                      </div>

                      <div className="traffic">
                        <TrafficDonut
                          segments={donutSegments}
                          centerValue="102 GB"
                          label="Total Traffic"
                        />

                        <table className="traffic-table">
                          <thead>
                            <tr>
                              <th>Application</th>
                              <th>Down</th>
                              <th>Up</th>
                              <th>Traffic</th>
                            </tr>
                          </thead>
                          <tbody>
                            {TRAFFIC_ROWS.map((row) => (
                              <tr key={row.name}>
                                <td>
                                  <div className="traffic-app">
                                    <span
                                      className={`traffic-app__dot traffic-app__dot--${row.toneClass}`}
                                    />
                                    <span className="traffic-app__icon">
                                      {row.badge}
                                    </span>
                                    {row.name}
                                  </div>
                                </td>
                                <td>{row.down}</td>
                                <td>{row.up}</td>
                                <td>{row.traffic}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </article>

                    <article className="unifi-card unifi-card--connections">
                      <div className="overview-card__header">
                        <div>
                          <div className="overview-card__title">
                            Connections
                          </div>
                          <div className="overview-card__meta">
                            {uplinkLabel}
                          </div>
                        </div>
                        <div className="overview-card__stamp">{panelMeta}</div>
                      </div>

                      <div className="connections-card">
                        <TrafficDonut
                          segments={connectionSegments}
                          centerValue="14"
                          label="Total Connections"
                        />

                        <div className="connections-table">
                          <div className="connections-table__head">
                            <span>Type</span>
                            <span>Activity</span>
                            <span>Experience</span>
                            <span>Connections</span>
                          </div>

                          {CONNECTION_ROWS.map((row) => (
                            <div
                              className="connections-table__row"
                              key={`${row.label}-${row.band}`}
                            >
                              <div className="connections-type">
                                <span
                                  className={`connections-type__dot connections-type__dot--${row.toneClass}`}
                                />
                                <span>{row.label}</span>
                                <span className="connections-type__band">
                                  {row.band}
                                </span>
                              </div>

                              <div className="connections-bar">
                                <span
                                  className={`connections-bar__fill ${row.activityWidthClass}`}
                                />
                              </div>

                              <div className="connections-table__excellent">
                                {row.experience}
                              </div>
                              <div className="connections-table__count">
                                {row.connections}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </article>
                  </div>
                </div>

                <div className="dashboard-overview__side">
                  <div className="unifi-card side-note">
                    <div className="overview-card__title">Gateway Summary</div>
                    <div className="side-note__value">
                      {deferredSnapshot ? formatRate(totalRate) : "0 B/s"}
                    </div>
                    <div className="side-note__meta">
                      {topContainers.length > 0
                        ? `Top container ${topContainers[0].name}`
                        : "Container telemetry will appear here"}
                    </div>
                    <div className="side-note__list">
                      {topContainers.length > 0 ? (
                        topContainers.map((container) => (
                          <div className="side-note__row" key={container.name}>
                            <span>{container.name}</span>
                            <span>{formatPercent(container.cpuPercent)}</span>
                          </div>
                        ))
                      ) : (
                        <div className="side-note__row">
                          <span>Metrics feed</span>
                          <span>Online</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            </>
          ) : (
            <GitDeploymentPage
              baseDomain={baseDomain}
              dashboardData={dashboardData}
              flashMessage={flashMessage}
              githubToken={githubToken}
              onDeploymentSelect={(id) => setLogDeploymentId(id)}
              onToggleLogs={(id) => {
                setLogDeploymentId(id);
                setIsRightPanelCollapsed(false);
              }}
              repositoryDraft={repositoryDraft}
              repositoryDraftSignal={repositoryDraftSignal}
            />
          )}
        </main>

        {isGitSection ? (
          <aside
            className={`panel-right ${isRightPanelCollapsed ? "panel-right--collapsed" : ""}`}
            aria-label="Deployment logs sidebar"
            id="logs-panel"
          >
            <button
              className="panel-right__collapse"
              type="button"
              aria-controls="logs-panel"
              aria-label={
                isRightPanelCollapsed ? "Show logs panel" : "Hide logs panel"
              }
              onClick={() => setIsRightPanelCollapsed((current) => !current)}
            >
              <Icon
                name={isRightPanelCollapsed ? "chevron-left" : "chevron-right"}
              />
            </button>

            {!isRightPanelCollapsed ? (
              <div className="panel-right__content">
                <GitLogPanel
                  deploymentId={logDeploymentId}
                  deployments={dashboardData.deployments}
                />
              </div>
            ) : null}
          </aside>
        ) : null}
      </div>
    </section>
  );
}
