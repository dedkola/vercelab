"use client";

import {
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useState,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { themes } from "@derpdaderp/chartkit";

import { type IconName } from "@/components/dashboard-kit";
import { DashboardFooter } from "@/components/shell/dashboard-footer";
import { DashboardHeader } from "@/components/shell/dashboard-header";
import { DashboardLeftSidebar } from "@/components/shell/dashboard-left-sidebar";
import { DashboardRightSidebar } from "@/components/shell/dashboard-right-sidebar";
import { SidebarMetricCharts } from "@/components/sidebar-metric-charts";
import { GitDeploymentPage, GitLogPanel } from "./git-deployment-page";
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

const SECTION_META: Record<
  DashboardSection,
  { icon: IconName; label: string }
> = {
  overview: {
    icon: "network",
    label: "Overview",
  },
  git: {
    icon: "cloud",
    label: "Git",
  },
};

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

function MainTrafficChart({ history }: { history: HistoryPoint[] }) {
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
  const githubToken = initialGithubToken;
  const pathname = usePathname();
  const searchParams = useSearchParams();

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

  useEffect(() => {
    setActiveSection(initialSection);
  }, [initialSection]);

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

  const timestampLabel = deferredSnapshot
    ? formatClock(deferredSnapshot.timestamp)
    : "--:--";
  const isOverviewSection = activeSection === "overview";
  const isGitSection = activeSection === "git";
  const activeRailEntry = SECTION_META[activeSection];

  return (
    <section
      className="shell shell--compact"
      aria-label="UniFi styled dashboard"
    >
      <DashboardHeader
        activeIcon={activeRailEntry.icon}
        activeLabel={activeRailEntry.label}
        baseDomain={baseDomain}
        hostIp={deferredSnapshot?.hostIp}
        loadAverageLabel={
          deferredSnapshot
            ? deferredSnapshot.system.loadAverage[0].toFixed(2)
            : "-"
        }
        onCopyHostIpAction={() =>
          void navigator.clipboard.writeText(deferredSnapshot?.hostIp ?? "")
        }
        onCopyBaseDomainAction={() =>
          void navigator.clipboard.writeText(baseDomain)
        }
      />

      <div
        className={`body ${isPanelCollapsed ? "body--panel-collapsed" : ""} ${isGitSection ? (isRightPanelCollapsed ? "body--right-collapsed" : "body--right-open") : ""}`}
      >
        <DashboardLeftSidebar
          activeSection={activeSection}
          isPanelCollapsed={isPanelCollapsed}
          panelAriaLabel="system metrics"
          onSectionChangeAction={handleSectionChange}
          onTogglePanelAction={() => setIsPanelCollapsed((current) => !current)}
        >
          <SidebarMetricCharts
            className="sidebar-chart-stack--embedded"
            history={deferredHistory}
            snapshot={deferredSnapshot}
          />
        </DashboardLeftSidebar>

        <main className="main">
          {isOverviewSection ? (
            <>
              <section className="chart-area">
                <MainTrafficChart history={deferredHistory} />
              </section>
            </>
          ) : (
            <GitDeploymentPage
              baseDomain={baseDomain}
              dashboardData={dashboardData}
              flashMessage={flashMessage}
              githubToken={githubToken}
              onDeploymentSelectAction={(id) => setLogDeploymentId(id)}
              onToggleLogsAction={(id) => {
                setLogDeploymentId(id);
                setIsRightPanelCollapsed(false);
              }}
              repositoryDraft={null}
              repositoryDraftSignal={0}
            />
          )}
        </main>

        {isGitSection ? (
          <DashboardRightSidebar
            isCollapsed={isRightPanelCollapsed}
            onToggleAction={() =>
              setIsRightPanelCollapsed((current) => !current)
            }
          >
            <GitLogPanel
              deploymentId={logDeploymentId}
              deployments={dashboardData.deployments}
            />
          </DashboardRightSidebar>
        ) : null}
      </div>

      <DashboardFooter
        activeSection={activeSection}
        updatedAtLabel={timestampLabel}
      />
    </section>
  );
}
