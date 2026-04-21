"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { GitBranch, Home, type LucideIcon } from "lucide-react";

import { DashboardLeftSidebar } from "@/components/workspace/dashboard-left-sidebar";
import { DashboardRightSidebar } from "@/components/workspace/dashboard-right-sidebar";
import { type HostMetricsSidebarProps } from "@/components/workspace/host-metrics-sidebar";
import { MetricsDashboardMainContent } from "@/components/workspace/metrics-dashboard-main-content";
import { WorkspaceFooter } from "@/components/workspace/workspace-footer";
import { WorkspaceHeader } from "@/components/workspace/workspace-header";
import { WorkspaceRail } from "@/components/workspace/workspace-rail";
import {
  type DashboardLogView,
  type WorkspaceView,
} from "@/components/workspace-shell";
import type { MetricsDashboardData } from "@/lib/metrics-dashboard-data";
import type { DashboardRange } from "@/lib/metrics-range";
import {
  ALL_CONTAINERS_ID,
  buildAggregateLogs,
  buildContainerListEntries,
  buildSystemMetricPanels,
  formatBytes,
  formatBytesPerSecond,
  formatClock,
  formatLoadAverage,
  formatPercent,
  formatStatusLabel,
  getStatusBadgeVariant,
  LOG_VIEW_OPTIONS,
  METRICS_DASHBOARD_RANGE_OPTIONS,
} from "@/lib/metrics-dashboard-metrics";
import type {
  AllContainersMetricsHistorySeries,
  MetricsHistoryPoint,
} from "@/lib/influx-metrics";
import type { MetricsSnapshot } from "@/lib/system-metrics";

const METRICS_PANEL_STORAGE_KEY = "vercelab:dashboard-metrics-panel-width";
const LIST_PANEL_STORAGE_KEY = "vercelab:dashboard-list-panel-width";
const LOGS_PANEL_STORAGE_KEY = "vercelab:dashboard-logs-panel-width";

const DEFAULT_METRICS_WIDTH_PX = 248;
const DEFAULT_LIST_WIDTH_PX = 304;
const DEFAULT_LOGS_WIDTH_PX = 340;
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

const WORKSPACE_RAIL_ITEMS: Array<{
  description: string;
  iconComponent: LucideIcon;
  id: WorkspaceView;
  label: string;
}> = [
  {
    description: "Live containers and host load",
    iconComponent: Home,
    id: "dashboard",
    label: "Dashboard",
  },
  {
    description: "Deployments and repo wiring",
    iconComponent: GitBranch,
    id: "git-app-page",
    label: "Git App Page",
  },
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

function formatHeaderPillLabel(panel: {
  currentCaption: string;
  id: "cpu" | "memory" | "network" | "disk";
  stats: Array<{ label: string; value: string }>;
}) {
  if (panel.id === "network" || panel.id === "disk") {
    const primaryStat = panel.stats[0];
    const secondaryStat = panel.stats[1];

    if (primaryStat && secondaryStat) {
      return `${primaryStat.label} ${primaryStat.value} / ${secondaryStat.label} ${secondaryStat.value}`;
    }
  }

  return panel.currentCaption;
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

  return "/api/metrics?" + params.toString();
}

function isDocumentHidden() {
  if (typeof document === "undefined") {
    return false;
  }

  return document.visibilityState === "hidden";
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

type MetricsDashboardShellProps = MetricsDashboardData;

export function MetricsDashboardShell({
  initialAllContainerHistory = [],
  initialDashboardRange = "15m",
  initialDeployments = [],
  initialHistory = [],
  initialSnapshot = null,
}: MetricsDashboardShellProps) {
  const router = useRouter();
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
  const [dashboardRange, setDashboardRange] = useState<DashboardRange>(
    initialDashboardRange,
  );
  const [selectedContainerId, setSelectedContainerId] =
    useState(ALL_CONTAINERS_ID);
  const [searchQuery, setSearchQuery] = useState("");
  const [dashboardLogView, setDashboardLogView] =
    useState<DashboardLogView>("live");
  const [sidebarSnapshot, setSidebarSnapshot] =
    useState<MetricsSnapshot | null>(initialSnapshot);
  const [sidebarHistory, setSidebarHistory] =
    useState<MetricsHistoryPoint[]>(initialHistory);
  const [allContainerHistory, setAllContainerHistory] = useState<
    AllContainersMetricsHistorySeries[]
  >(initialAllContainerHistory);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [containerHistoryError, setContainerHistoryError] = useState<
    string | null
  >(null);
  const [isContainerHistoryLoading, setIsContainerHistoryLoading] = useState(
    initialSnapshot !== null && initialAllContainerHistory.length === 0,
  );
  const dragStateRef = useRef<{
    kind: "metrics" | "list" | "logs" | null;
    startWidth: number;
    startX: number;
  }>({
    kind: null,
    startWidth: 0,
    startX: 0,
  });
  const hasMountedLivePollingRef = useRef(false);
  const hasMountedContainerHistoryRef = useRef(false);
  const livePollInFlightRef = useRef(false);
  const containerHistoryInFlightRef = useRef(false);
  const loadedContainerHistoryRangeRef = useRef<string | null>(
    initialAllContainerHistory.length ? initialDashboardRange : null,
  );
  const systemPanels = useMemo(
    () => buildSystemMetricPanels(sidebarSnapshot, sidebarHistory),
    [sidebarHistory, sidebarSnapshot],
  );
  const headerStatusPills = useMemo(
    () =>
      systemPanels.map((panel) => ({
        label: formatHeaderPillLabel(panel),
      })),
    [systemPanels],
  );
  const workspaceContainers = useMemo(
    () =>
      buildContainerListEntries(
        sidebarSnapshot,
        allContainerHistory,
        initialDeployments,
      ),
    [allContainerHistory, initialDeployments, sidebarSnapshot],
  );
  const aggregateLogs = useMemo(
    () =>
      buildAggregateLogs(
        sidebarSnapshot,
        sidebarHistory,
        allContainerHistory,
        initialDeployments,
      ),
    [allContainerHistory, initialDeployments, sidebarHistory, sidebarSnapshot],
  );

  const metricsStatus = metricsError
    ? {
        badgeClassName: "border-amber-200/80 bg-amber-50/90 text-amber-700",
        badgeLabel: "Retrying",
        helperText: metricsError,
      }
    : sidebarSnapshot && sidebarHistory.length
      ? {
          badgeClassName:
            "border-emerald-200/80 bg-emerald-50/90 text-emerald-700",
          badgeLabel: "Live",
          helperText: `Updated ${formatClock(sidebarSnapshot.timestamp)} from recent live history.`,
        }
      : sidebarSnapshot
        ? {
            badgeClassName: "border-amber-200/80 bg-amber-50/90 text-amber-700",
            badgeLabel: "Snapshot only",
            helperText:
              "Waiting for recent InfluxDB buckets to fill the charts.",
          }
        : {
            badgeClassName: "border-border/60 bg-background/80 text-foreground",
            badgeLabel: "Connecting",
            helperText: "Loading current host metrics.",
          };

  const filteredContainers = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return workspaceContainers;
    }

    return workspaceContainers.filter((container) =>
      container.searchText.includes(normalizedQuery),
    );
  }, [searchQuery, workspaceContainers]);

  const isAllContainersSelected = selectedContainerId === ALL_CONTAINERS_ID;
  const activeContainerId = isAllContainersSelected
    ? ALL_CONTAINERS_ID
    : filteredContainers.some(
          (container) => container.display.id === selectedContainerId,
        )
      ? selectedContainerId
      : (filteredContainers[0]?.display.id ??
        workspaceContainers[0]?.display.id ??
        selectedContainerId);
  const selectedEntry = isAllContainersSelected
    ? null
    : (filteredContainers.find(
        (container) => container.display.id === activeContainerId,
      ) ??
      workspaceContainers.find(
        (container) => container.display.id === activeContainerId,
      ) ??
      workspaceContainers[0] ??
      null);
  const selectedContainerName = selectedEntry?.sidebarName ?? null;
  const selectedRuntimeContainer = selectedEntry?.runtime ?? null;
  const selectedRuntimeContainerId = selectedRuntimeContainer?.id ?? null;

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
          buildMetricsRequestUrl({
            includeHistory: "true",
            mode: "current",
          }),
          {
            cache: "no-store",
            signal: abortController.signal,
          },
        );

        if (!response.ok) {
          throw new Error(
            "Metrics request failed with " + response.status + ".",
          );
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

        setMetricsError(
          error instanceof Error
            ? error.message
            : "Unable to load live metrics.",
        );
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

    const shouldPollImmediately = hasMountedLivePollingRef.current
      ? true
      : !(initialSnapshot && initialHistory.length > 0);

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
  }, [dashboardRange, initialHistory.length, initialSnapshot]);

  useEffect(() => {
    const requestedRange = dashboardRange;
    const hasHistoryForRange =
      loadedContainerHistoryRangeRef.current === requestedRange;

    if (hasHistoryForRange) {
      setIsContainerHistoryLoading(false);
      setContainerHistoryError(null);

      if (!hasMountedContainerHistoryRef.current) {
        hasMountedContainerHistoryRef.current = true;
      }

      return;
    }

    let active = true;
    const abortController = new AbortController();
    const shouldFetchImmediately = hasMountedContainerHistoryRef.current
      ? true
      : allContainerHistory.length === 0;

    hasMountedContainerHistoryRef.current = true;

    if (!shouldFetchImmediately) {
      return;
    }

    setIsContainerHistoryLoading(true);

    const loadContainerHistory = async () => {
      if (!active || containerHistoryInFlightRef.current) {
        return;
      }

      containerHistoryInFlightRef.current = true;

      try {
        const response = await fetch(
          buildMetricsRequestUrl({
            allContainers: "true",
            includeAllContainerHistory: "true",
            includeHistory: "false",
            range: requestedRange,
          }),
          {
            cache: "no-store",
            signal: abortController.signal,
          },
        );

        if (!response.ok) {
          throw new Error(
            "Metrics request failed with " + response.status + ".",
          );
        }

        const payload = (await response.json()) as {
          allContainerHistory?: AllContainersMetricsHistorySeries[];
          history?: MetricsHistoryPoint[];
          snapshot?: MetricsSnapshot | null;
        };

        if (!active) {
          return;
        }

        if (payload.snapshot && !sidebarSnapshot) {
          setSidebarSnapshot(payload.snapshot);
        }

        if (Array.isArray(payload.history) && sidebarHistory.length === 0) {
          setSidebarHistory(payload.history);
        }

        if (Array.isArray(payload.allContainerHistory)) {
          setAllContainerHistory(payload.allContainerHistory);
          loadedContainerHistoryRangeRef.current = requestedRange;
        }

        setContainerHistoryError(null);
      } catch (error) {
        if (
          !active ||
          (error instanceof DOMException && error.name === "AbortError")
        ) {
          return;
        }

        setContainerHistoryError(
          error instanceof Error
            ? error.message
            : "Unable to load container history.",
        );
      } finally {
        containerHistoryInFlightRef.current = false;

        if (active) {
          setIsContainerHistoryLoading(false);
        }
      }
    };

    void loadContainerHistory();

    return () => {
      active = false;
      abortController.abort();
      containerHistoryInFlightRef.current = false;
    };
  }, [
    allContainerHistory.length,
    dashboardRange,
    sidebarHistory.length,
    sidebarSnapshot,
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
              dragStateRef.current.startWidth -
                (event.clientX - dragStateRef.current.startX),
              MIN_LOGS_WIDTH_PX,
              MAX_LOGS_WIDTH_PX,
            ),
          );
          break;
      }
    }

    function handleMouseUp() {
      if (!dragStateRef.current.kind) {
        return;
      }

      dragStateRef.current.kind = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
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

  const handleResizeStart = useCallback(
    (
      kind: "metrics" | "list" | "logs",
      event: ReactMouseEvent<HTMLDivElement>,
    ) => {
      dragStateRef.current = {
        kind,
        startWidth:
          kind === "metrics"
            ? metricsWidth
            : kind === "list"
              ? listWidth
              : logsWidth,
        startX: event.clientX,
      };

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [listWidth, logsWidth, metricsWidth],
  );

  const handleResetLayout = useCallback(() => {
    setMetricsWidth(DEFAULT_METRICS_WIDTH_PX);
    setListWidth(DEFAULT_LIST_WIDTH_PX);
    setLogsWidth(DEFAULT_LOGS_WIDTH_PX);
    setIsMetricsCollapsed(false);
    setIsLogsCollapsed(false);
  }, [setListWidth, setLogsWidth, setMetricsWidth]);

  const handleViewChange = useCallback(
    (view: WorkspaceView) => {
      const pathname = view === "git-app-page" ? "/git-app-page" : "/";
      const search = dashboardRange === "15m" ? "" : `?range=${dashboardRange}`;

      router.push(`${pathname}${search}`);
    },
    [dashboardRange, router],
  );

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
    metricCards: [],
    metricsStatus,
    onCollapseAction: () => setIsMetricsCollapsed(true),
    onExpandAction: () => setIsMetricsCollapsed(false),
    onResizeStartAction: (event: ReactMouseEvent<HTMLDivElement>) =>
      handleResizeStart("metrics", event),
    showStateWarning: Boolean(
      (sidebarSnapshot && !sidebarHistory.length) || metricsError,
    ),
    summaryLabel: sidebarSnapshot
      ? `${sidebarSnapshot.containers.running} running containers on ${sidebarSnapshot.hostIp}.`
      : "Waiting for the first host snapshot.",
    systemPanels,
    throughputLabel: sidebarSnapshot
      ? `Load avg ${formatLoadAverage(sidebarSnapshot.system.loadAverage)} • ${formatBytesPerSecond(sidebarSnapshot.network.rxBytesPerSecond)} down / ${formatBytesPerSecond(sidebarSnapshot.network.txBytesPerSecond)} up`
      : metricsStatus.helperText,
    width: metricsWidth,
  } satisfies HostMetricsSidebarProps;
  const selectedContainerStatusLabel = selectedEntry
    ? formatStatusLabel(selectedEntry.display.status)
    : "Fleet compare";
  const selectedContainerStatusVariant = selectedEntry
    ? getStatusBadgeVariant(selectedEntry.display.status)
    : "default";
  const previewLogs = isAllContainersSelected
    ? aggregateLogs[dashboardLogView]
    : (selectedEntry?.display.logs[dashboardLogView] ?? []);
  const selectedContainerRegion = isAllContainersSelected
    ? (sidebarSnapshot?.hostIp ?? "Current host")
    : (selectedEntry?.display.region ??
      sidebarSnapshot?.hostIp ??
      "Current host");

  return (
    <section
      aria-label="Workspace shell"
      className="flex h-screen flex-col bg-linear-to-b from-background via-muted/12 to-background"
    >
      <WorkspaceHeader
        activeViewDescription="Live host and container observability inside the shared workspace shell."
        activeViewLabel="Dashboard"
        activeViewStatusLabel="Live metrics"
        onResetLayoutAction={handleResetLayout}
        statusPills={headerStatusPills}
        title="Metrics dashboard"
      />

      <div className="flex min-w-0 flex-1 overflow-hidden">
        <WorkspaceRail
          activeView="dashboard"
          items={WORKSPACE_RAIL_ITEMS}
          onViewChangeAction={handleViewChange}
        />

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
          onListResizeStartAction={(event) => handleResizeStart("list", event)}
          onSearchQueryChangeAction={setSearchQuery}
          runningContainersCount={sidebarSnapshot?.containers.running ?? null}
          searchQuery={searchQuery}
          visibleCount={filteredContainers.length}
        />

        <main className="min-w-0 flex-1 overflow-auto bg-linear-to-b from-background/72 via-muted/14 to-background p-4 md:p-5">
          <MetricsDashboardMainContent
            allContainerHistory={allContainerHistory}
            containerHistoryStatusText={containerHistoryError}
            deployments={initialDeployments}
            isAllContainerHistoryLoading={isContainerHistoryLoading}
            onRangeChangeAction={setDashboardRange}
            range={dashboardRange}
            rangeOptions={METRICS_DASHBOARD_RANGE_OPTIONS}
            selectedContainerId={
              isAllContainersSelected ? null : selectedRuntimeContainerId
            }
            selectedContainerName={
              isAllContainersSelected ? null : selectedContainerName
            }
            snapshot={sidebarSnapshot}
          />
        </main>

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
          selectedContainerName={
            isAllContainersSelected
              ? "All containers"
              : (selectedContainerName ?? "Container")
          }
          selectedContainerRegion={selectedContainerRegion}
          selectedContainerStatusLabel={
            isAllContainersSelected
              ? `${sidebarSnapshot?.containers.running ?? 0} running`
              : selectedContainerStatusLabel
          }
          selectedContainerStatusVariant={
            isAllContainersSelected ? "default" : selectedContainerStatusVariant
          }
          selectedPreviewAvailable={
            !isAllContainersSelected && Boolean(selectedEntry)
          }
          width={logsWidth}
        />
      </div>

      <WorkspaceFooter
        activeViewLabel="Dashboard"
        updatedAtLabel={
          sidebarSnapshot
            ? formatClock(sidebarSnapshot.timestamp)
            : "Waiting for metrics"
        }
      />
    </section>
  );
}
