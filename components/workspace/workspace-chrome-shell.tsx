'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import type { WorkspaceView } from '@/components/workspace-shell';
import { WorkspaceFooter } from '@/components/workspace/workspace-footer';
import { WorkspaceHeader } from '@/components/workspace/workspace-header';
import type { GitHubRepository } from '@/lib/github';
import type { MetricsHistoryPoint } from '@/lib/influx-metrics';
import { formatClock } from '@/lib/metrics-dashboard-metrics';
import { normalizeDashboardRange, type DashboardRange } from '@/lib/metrics-range';
import type { MetricsSnapshot } from '@/lib/system-metrics';
import {
  DEFAULT_TIME_DISPLAY_MODE,
  getTimeZoneForDisplayMode,
  readStoredTimeDisplayMode,
  type TimeDisplayMode,
  writeStoredTimeDisplayMode,
} from '@/lib/time-display';
import { useLiveMetricsPolling } from '@/lib/use-live-metrics-polling';
import type { WorkspaceChromeData } from '@/lib/workspace-chrome-data';

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
  timeDisplayMode: TimeDisplayMode;
};

const WORKSPACE_PAGES: Array<{
  id: WorkspaceView;
  label: string;
}> = [
  { id: 'dashboard', label: 'Overview' },
  { id: 'git-app-page', label: 'Apps' },
  { id: 'containers', label: 'Containers' },
  { id: 'terminal', label: 'Terminal' },
];

const WorkspaceChromeContext = createContext<WorkspaceChromeContextValue | null>(null);

function getWorkspaceViewHref(view: WorkspaceView, range: DashboardRange) {
  const pathname =
    view === 'git-app-page'
      ? '/git-app-page'
      : view === 'containers'
        ? '/containers'
        : view === 'terminal'
          ? '/terminal'
          : '/';

  if (range === '15m') {
    return pathname;
  }

  return `${pathname}?${new URLSearchParams({ range }).toString()}`;
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
  const [dashboardRange, setDashboardRangeState] = useState<DashboardRange>(() =>
    normalizeDashboardRange(searchParams.get('range'))
  );
  const [sidebarSnapshot, setSidebarSnapshot] = useState<MetricsSnapshot | null>(initialSnapshot);
  const [sidebarHistory, setSidebarHistory] = useState<MetricsHistoryPoint[]>(initialHistory);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [timeDisplayMode, setTimeDisplayMode] =
    useState<TimeDisplayMode>(DEFAULT_TIME_DISPLAY_MODE);
  const [repositoryState, setRepositoryState] = useState<SharedRepositoryState>({
    error: null,
    hasLoaded: false,
    isLoading: false,
    repositories: [],
    tokenConfigured: false,
  });
  const repositoryRequestRef = useRef<Promise<void> | null>(null);
  const resetHandlersRef = useRef(new Set<ResetHandler>());

  const activeView: WorkspaceView =
    pathname === '/git-app-page'
      ? 'git-app-page'
      : pathname === '/containers'
        ? 'containers'
        : pathname === '/terminal'
          ? 'terminal'
          : 'dashboard';
  const graphTimeZone = getTimeZoneForDisplayMode(timeDisplayMode);

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
        const response = await fetch('/api/github/repos', {
          cache: 'no-store',
        });
        const payload = (await response.json()) as {
          error?: string;
          repositories?: GitHubRepository[];
          tokenConfigured?: boolean;
        };

        if (!response.ok) {
          throw new Error(payload.error ?? 'Unable to load repositories from GitHub.');
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
            error instanceof Error ? error.message : 'Unable to load repositories from GitHub.',
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

  const handleGithubTokenSaved = useCallback(
    (payload: { repositories: GitHubRepository[]; tokenConfigured: boolean }) => {
      setRepositoryState({
        error: null,
        hasLoaded: true,
        isLoading: false,
        repositories: payload.repositories,
        tokenConfigured: payload.tokenConfigured,
      });
    },
    []
  );

  const handleTimeDisplayModeChange = useCallback((mode: TimeDisplayMode) => {
    setTimeDisplayMode(mode);
    writeStoredTimeDisplayMode(mode);
  }, []);

  const registerResetHandler = useCallback((handler: ResetHandler) => {
    resetHandlersRef.current.add(handler);

    return () => {
      resetHandlersRef.current.delete(handler);
    };
  }, []);

  const setDashboardRange = useCallback((range: DashboardRange) => {
    setDashboardRangeState(range);
  }, []);

  const handleViewChange = useCallback(
    (view: WorkspaceView) => {
      if (view !== activeView) {
        router.push(getWorkspaceViewHref(view, dashboardRange));
      }
    },
    [activeView, dashboardRange, router]
  );

  const handleResetLayout = useCallback(() => {
    for (const handler of resetHandlersRef.current) {
      handler();
    }
  }, []);

  const handleInfluxExplorerOpen = useCallback(() => {
    if (influxExplorerUrl) {
      window.open(influxExplorerUrl, '_blank', 'noopener,noreferrer');
    }
  }, [influxExplorerUrl]);

  useEffect(() => {
    setTimeDisplayMode(readStoredTimeDisplayMode());
  }, []);

  useEffect(() => {
    const nextRange = normalizeDashboardRange(searchParams.get('range'));
    setDashboardRangeState((current) => (current === nextRange ? current : nextRange));
  }, [searchParams]);

  useEffect(() => {
    const nextUrl = new URL(window.location.href);

    if (dashboardRange === '15m') {
      nextUrl.searchParams.delete('range');
    } else {
      nextUrl.searchParams.set('range', dashboardRange);
    }

    const nextHref = `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
    const currentHref = `${window.location.pathname}${window.location.search}${window.location.hash}`;

    if (nextHref !== currentHref) {
      window.history.replaceState(window.history.state, '', nextHref);
    }
  }, [dashboardRange]);

  useEffect(() => {
    for (const page of WORKSPACE_PAGES) {
      if (page.id !== activeView) {
        void router.prefetch(getWorkspaceViewHref(page.id, dashboardRange));
      }
    }
  }, [activeView, dashboardRange, router]);

  useLiveMetricsPolling({
    enabled: true,
    initialSnapshot,
    initialHistory,
    onSnapshot: setSidebarSnapshot,
    onHistory: setSidebarHistory,
    onError: setMetricsError,
  });

  const activeViewMeta =
    WORKSPACE_PAGES.find((page) => page.id === activeView) ?? WORKSPACE_PAGES[0]!;
  const updatedAtLabel = sidebarSnapshot
    ? formatClock(sidebarSnapshot.timestamp, graphTimeZone)
    : 'Waiting for metrics';
  const statusLabel = metricsError
    ? 'Metrics degraded'
    : sidebarSnapshot
      ? 'Host online'
      : 'Connecting';

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
      timeDisplayMode,
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
      timeDisplayMode,
    ]
  );

  return (
    <WorkspaceChromeContext.Provider value={contextValue}>
      <section aria-label="Workspace shell" className="flex h-screen flex-col bg-[var(--canvas)]">
        <WorkspaceHeader
          activeView={activeView}
          influxExplorerUrl={influxExplorerUrl}
          onGithubTokenSavedAction={handleGithubTokenSaved}
          onInfluxExplorerOpenAction={handleInfluxExplorerOpen}
          onResetLayoutAction={handleResetLayout}
          onTimeDisplayModeChangeAction={handleTimeDisplayModeChange}
          onViewChangeAction={handleViewChange}
          statusLabel={statusLabel}
          timeDisplayMode={timeDisplayMode}
          updatedAtLabel={updatedAtLabel}
        />

        <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">{children}</div>

        <WorkspaceFooter activeViewLabel={activeViewMeta.label} updatedAtLabel={updatedAtLabel} />
      </section>
    </WorkspaceChromeContext.Provider>
  );
}
