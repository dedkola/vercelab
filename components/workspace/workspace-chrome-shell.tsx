"use client";

import { Activity, Box, GitBranch, Home, type LucideIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";

import type { WorkspaceView } from "@/components/workspace-shell";
import { WorkspaceFooter } from "@/components/workspace/workspace-footer";
import { WorkspaceHeader } from "@/components/workspace/workspace-header";
import {
  HostMetricsSidebar,
  type HostMetricsSidebarProps,
} from "@/components/workspace/host-metrics-sidebar";
import { WorkspaceRail } from "@/components/workspace/workspace-rail";
import type { WorkspaceChromeData } from "@/lib/workspace-chrome-data";
import type { GitHubRepository } from "@/lib/github";
import type { MetricsHistoryPoint } from "@/lib/influx-metrics";
import {
  buildSystemMetricPanels,
  formatBytes,
  formatBytesPerSecond,
  formatClock,
  formatLoadAverage,
  formatPercent,
} from "@/lib/metrics-dashboard-metrics";
import {
  normalizeDashboardRange,
  type DashboardRange,
} from "@/lib/metrics-range";
import type { MetricsSnapshot } from "@/lib/system-metrics";

const METRICS_PANEL_STORAGE_KEY = "vercelab:workspace-metrics-panel-width";
const DEFAULT_METRICS_WIDTH_PX = 248;
const MIN_METRICS_WIDTH_PX = 216;
const MAX_METRICS_WIDTH_PX = 420;
const LIVE_POLL_INTERVAL_MS = 10000;
const HIDDEN_LIVE_POLL_INTERVAL_MS = 30000;
const LIVE_POLL_ERROR_BACKOFF_MAX_MS = 60000;
const VISIBILITY_REFRESH_DELAY_MS = 750;

type ResetHandler = () => void;

type SharedRepositoryState = {
  error: string | null;
  hasLoaded: boolean;
  isLoading: boolean;
  repositories: GitHubRepository[];
  tokenConfigured: boolean;
};

type WorkspaceChromeContextValue = {
  dashboardRange: DashboardRange;
  loadRepositories: () => Promise<void>;
  metricsError: string | null;
  registerResetHandler: (handler: ResetHandler) => () => void;
  repositoryState: SharedRepositoryState;
  setDashboardRange: (range: DashboardRange) => void;
  sidebarHistory: MetricsHistoryPoint[];
  sidebarSnapshot: MetricsSnapshot | null;
};

const WORKSPACE_PAGES: Array<{
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
  {
    description: "Container inventory, runtime logs, and lifecycle controls",
    iconComponent: Box,
    id: "containers",
    label: "Containers",
  },
];

const WorkspaceChromeContext =
  createContext<WorkspaceChromeContextValue | null>(null);

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

function getWorkspaceViewHref(view: WorkspaceView, range: DashboardRange) {
  const pathname =
    view === "git-app-page"
      ? "/git-app-page"
      : view === "containers"
        ? "/containers"
        : "/";

  if (range === "15m") {
    return pathname;
  }

  const searchParams = new URLSearchParams({
    range,
  });

  return `${pathname}?${searchParams.toString()}`;
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

export function useOptionalWorkspaceChrome() {
  return useContext(WorkspaceChromeContext);
}

export function WorkspaceChromeShell({
  children,
  influxExplorerUrl,
  initialHistory = [],
  initialSnapshot = null,
}: WorkspaceChromeData & {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [metricsWidth, setMetricsWidth] = useStoredPanelWidth(
    METRICS_PANEL_STORAGE_KEY,
    DEFAULT_METRICS_WIDTH_PX,
    MIN_METRICS_WIDTH_PX,
    MAX_METRICS_WIDTH_PX,
  );
  const [isMetricsCollapsed, setIsMetricsCollapsed] = useState(false);
  const [dashboardRange, setDashboardRangeState] = useState<DashboardRange>(
    () => normalizeDashboardRange(searchParams.get("range")),
  );
  const [sidebarSnapshot, setSidebarSnapshot] =
    useState<MetricsSnapshot | null>(initialSnapshot);
  const [sidebarHistory, setSidebarHistory] =
    useState<MetricsHistoryPoint[]>(initialHistory);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [repositoryState, setRepositoryState] = useState<SharedRepositoryState>(
    {
      error: null,
      hasLoaded: false,
      isLoading: false,
      repositories: [],
      tokenConfigured: false,
    },
  );
  const dragStateRef = useRef<{
    startWidth: number;
    startX: number;
  } | null>(null);
  const hasMountedLivePollingRef = useRef(false);
  const livePollInFlightRef = useRef(false);
  const repositoryRequestRef = useRef<Promise<void> | null>(null);
  const resetHandlersRef = useRef(new Set<ResetHandler>());

  const activeView =
    pathname === "/git-app-page"
      ? "git-app-page"
      : pathname === "/containers"
        ? "containers"
        : "dashboard";
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
              "Waiting for recent history samples to populate the charts.",
          }
        : {
            badgeClassName: "border-border/60 bg-background/80 text-foreground",
            badgeLabel: "Connecting",
            helperText: "Loading current host metrics.",
          };

  const loadRepositories = useCallback(async () => {
    if (repositoryState.hasLoaded || repositoryState.isLoading) {
      return;
    }

    if (repositoryRequestRef.current) {
      return repositoryRequestRef.current;
    }

    setRepositoryState((current) => ({
      ...current,
      error: null,
      isLoading: true,
    }));

    const request = (async () => {
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
      } finally {
        repositoryRequestRef.current = null;
      }
    })();

    repositoryRequestRef.current = request;
    return request;
  }, [repositoryState.hasLoaded, repositoryState.isLoading]);

  const registerResetHandler = useCallback((handler: ResetHandler) => {
    resetHandlersRef.current.add(handler);

    return () => {
      resetHandlersRef.current.delete(handler);
    };
  }, []);

  const setDashboardRange = useCallback((range: DashboardRange) => {
    setDashboardRangeState(range);
  }, []);

  const handleViewPrefetch = useCallback(
    (view: WorkspaceView) => {
      if (view === "git-app-page") {
        void loadRepositories();
      }
    },
    [loadRepositories],
  );

  const handleViewChange = useCallback(
    (view: WorkspaceView) => {
      if (view === activeView) {
        return;
      }

      if (view === "git-app-page") {
        void loadRepositories();
      }

      router.push(getWorkspaceViewHref(view, dashboardRange));
    },
    [activeView, dashboardRange, loadRepositories, router],
  );

  const workspaceRailItems = useMemo(() => {
    const internalItems = WORKSPACE_PAGES.map((item) => ({
      ...item,
      view: item.id,
    }));

    if (!influxExplorerUrl) {
      return internalItems;
    }

    return [
      ...internalItems,
      {
        description: "Open the InfluxDB Explorer UI",
        external: true,
        href: influxExplorerUrl,
        iconComponent: Activity,
        id: "influx-explorer",
        label: "Influx Explorer",
      },
    ];
  }, [influxExplorerUrl]);

  const handleResetLayout = useCallback(() => {
    const storage = getStorage();

    storage?.removeItem(METRICS_PANEL_STORAGE_KEY);
    setMetricsWidth(DEFAULT_METRICS_WIDTH_PX);
    setIsMetricsCollapsed(false);

    for (const handler of resetHandlersRef.current) {
      handler();
    }
  }, [setMetricsWidth]);

  useEffect(() => {
    const nextRange = normalizeDashboardRange(searchParams.get("range"));

    setDashboardRangeState((current) =>
      current === nextRange ? current : nextRange,
    );
  }, [searchParams]);

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
  }, [initialHistory.length, initialSnapshot]);

  useEffect(() => {
    function handleMouseMove(event: MouseEvent) {
      if (!dragStateRef.current) {
        return;
      }

      setMetricsWidth(
        clamp(
          dragStateRef.current.startWidth +
            (event.clientX - dragStateRef.current.startX),
          MIN_METRICS_WIDTH_PX,
          MAX_METRICS_WIDTH_PX,
        ),
      );
    }

    function handleMouseUp() {
      if (!dragStateRef.current) {
        return;
      }

      dragStateRef.current = null;
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
  }, [setMetricsWidth]);

  useEffect(() => {
    if (activeView === "git-app-page") {
      void loadRepositories();
    }
  }, [activeView, loadRepositories]);

  useEffect(() => {
    function syncResponsivePanels() {
      if (window.innerWidth < 960) {
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
    (event: ReactMouseEvent<HTMLDivElement>) => {
      dragStateRef.current = {
        startWidth: metricsWidth,
        startX: event.clientX,
      };

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [metricsWidth],
  );

  const activeViewMeta =
    WORKSPACE_PAGES.find((page) => page.id === activeView) ??
    WORKSPACE_PAGES[0]!;
  const activeViewTitle =
    activeView === "dashboard"
      ? "Metrics dashboard"
      : activeView === "git-app-page"
        ? "Git App Page"
        : "Containers";
  const activeViewDescription =
    activeView === "dashboard"
      ? "Live host and container observability inside the shared workspace shell."
      : activeView === "git-app-page"
        ? "Create, review, and edit live deployments in the same shared workspace shell."
        : "Runtime inventory, protected system services, and per-container log inspection.";
  const activeViewStatusLabel =
    activeView === "dashboard"
      ? "Live runtime"
      : activeView === "git-app-page"
        ? "Live deployments"
        : "Live containers";
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
    onResizeStartAction: handleResizeStart,
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

  const contextValue = useMemo(
    () => ({
      dashboardRange,
      loadRepositories,
      metricsError,
      registerResetHandler,
      repositoryState,
      setDashboardRange,
      sidebarHistory,
      sidebarSnapshot,
    }),
    [
      dashboardRange,
      loadRepositories,
      metricsError,
      registerResetHandler,
      repositoryState,
      setDashboardRange,
      sidebarHistory,
      sidebarSnapshot,
    ],
  );

  return (
    <WorkspaceChromeContext.Provider value={contextValue}>
      <section
        aria-label="Workspace shell"
        className="flex h-screen flex-col bg-linear-to-b from-background via-muted/12 to-background"
      >
        <WorkspaceHeader
          activeViewDescription={activeViewDescription}
          activeViewLabel={activeViewMeta.label}
          activeViewStatusLabel={activeViewStatusLabel}
          onResetLayoutAction={handleResetLayout}
          statusPills={headerStatusPills}
          title={activeViewTitle}
        />

        <div className="flex min-w-0 flex-1 overflow-hidden">
          <WorkspaceRail
            activeView={activeView}
            items={workspaceRailItems}
            onViewChangeAction={handleViewChange}
            onViewPrefetchAction={handleViewPrefetch}
          />

          <HostMetricsSidebar {...hostMetricsProps} />

          {children}
        </div>

        <WorkspaceFooter
          activeViewLabel={activeViewMeta.label}
          updatedAtLabel={
            sidebarSnapshot
              ? formatClock(sidebarSnapshot.timestamp)
              : "Waiting for metrics"
          }
        />
      </section>
    </WorkspaceChromeContext.Provider>
  );
}
