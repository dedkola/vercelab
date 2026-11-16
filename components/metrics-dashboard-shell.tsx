'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { useOptionalWorkspaceChrome } from '@/components/workspace/workspace-chrome-shell';
import { MetricsDashboardMainContent } from '@/components/workspace/metrics-dashboard-main-content';
import { WorkspaceFooter } from '@/components/workspace/workspace-footer';
import { WorkspaceHeader } from '@/components/workspace/workspace-header';
import type { ContainerListEntry, WorkspaceView } from '@/components/workspace-shell';
import type { ContainerAction } from '@/lib/container-inventory';
import {
  readStoredContainerAliases,
  subscribeToStoredContainerAliases,
} from '@/lib/container-preferences';
import type { MetricsDashboardData } from '@/lib/metrics-dashboard-data';
import type { DashboardRange } from '@/lib/metrics-range';
import {
  ALL_CONTAINERS_ID,
  buildContainerListEntries,
  buildSystemMetricPanels,
  formatClock,
  METRICS_DASHBOARD_RANGE_OPTIONS,
} from '@/lib/metrics-dashboard-metrics';
import type { AllContainersMetricsHistorySeries, MetricsHistoryPoint } from '@/lib/influx-metrics';
import type { MetricsSnapshot } from '@/lib/system-metrics';
import {
  DEFAULT_TIME_DISPLAY_MODE,
  getTimeZoneForDisplayMode,
  readStoredTimeDisplayMode,
  type TimeDisplayMode,
  writeStoredTimeDisplayMode,
} from '@/lib/time-display';
import { useLiveMetricsPolling } from '@/lib/use-live-metrics-polling';

function buildMetricsRequestUrl(searchParams: Record<string, string | undefined>) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === 'string') {
      params.set(key, value);
    }
  }

  return '/api/metrics?' + params.toString();
}

// Docker reports the new state a beat after the lifecycle command returns, so refresh a
// few times instead of once.
const POST_ACTION_REFRESH_DELAYS_MS = [0, 900, 2400] as const;

const CONTAINER_ACTION_DONE_LABELS: Record<ContainerAction, string> = {
  remove: 'Removed',
  restart: 'Restarted',
  start: 'Started',
  stop: 'Stopped',
};

type MetricsDashboardShellProps = MetricsDashboardData & {
  embedded?: boolean;
};

export function MetricsDashboardShell({
  embedded = false,
  influxExplorerUrl,
  initialAllContainerHistory = [],
  initialDashboardRange = '15m',
  initialDeployments = [],
  initialHistory = [],
  initialSnapshot = null,
}: MetricsDashboardShellProps) {
  const router = useRouter();
  const sharedChrome = useOptionalWorkspaceChrome();
  const isEmbedded = embedded && sharedChrome !== null;
  const [dashboardRange, setDashboardRange] = useState<DashboardRange>(initialDashboardRange);
  const [selectedContainerId, setSelectedContainerId] = useState(ALL_CONTAINERS_ID);
  const [searchQuery, setSearchQuery] = useState('');
  const [standaloneTimeDisplayMode, setStandaloneTimeDisplayMode] =
    useState<TimeDisplayMode>(DEFAULT_TIME_DISPLAY_MODE);
  const [sidebarSnapshot, setSidebarSnapshot] = useState<MetricsSnapshot | null>(initialSnapshot);
  const [sidebarHistory, setSidebarHistory] = useState<MetricsHistoryPoint[]>(initialHistory);
  const [allContainerHistory, setAllContainerHistory] = useState<
    AllContainersMetricsHistorySeries[]
  >(initialAllContainerHistory);
  const [aliases, setAliases] = useState<Record<string, string>>({});
  const [containerHistoryError, setContainerHistoryError] = useState<string | null>(null);
  const [isContainerHistoryLoading, setIsContainerHistoryLoading] = useState(
    initialSnapshot !== null && initialAllContainerHistory.length === 0
  );
  const hasMountedContainerHistoryRef = useRef(false);
  const containerHistoryInFlightRef = useRef(false);
  const loadedContainerHistoryRangeRef = useRef<string | null>(
    initialAllContainerHistory.length ? initialDashboardRange : null
  );
  const effectiveDashboardRange = isEmbedded ? sharedChrome.dashboardRange : dashboardRange;
  const setEffectiveDashboardRange = isEmbedded
    ? sharedChrome.setDashboardRange
    : setDashboardRange;
  const effectiveSidebarSnapshot = isEmbedded ? sharedChrome.sidebarSnapshot : sidebarSnapshot;
  const effectiveSidebarHistory = isEmbedded ? sharedChrome.sidebarHistory : sidebarHistory;
  const effectiveTimeDisplayMode = isEmbedded
    ? sharedChrome.timeDisplayMode
    : standaloneTimeDisplayMode;
  const graphTimeZone = getTimeZoneForDisplayMode(effectiveTimeDisplayMode);
  const systemPanels = useMemo(
    () => buildSystemMetricPanels(effectiveSidebarSnapshot, effectiveSidebarHistory, graphTimeZone),
    [effectiveSidebarHistory, effectiveSidebarSnapshot, graphTimeZone]
  );

  useEffect(() => {
    if (!isEmbedded) {
      setStandaloneTimeDisplayMode(readStoredTimeDisplayMode());
    }
  }, [isEmbedded]);

  useEffect(() => {
    setAliases(readStoredContainerAliases());

    return subscribeToStoredContainerAliases(setAliases);
  }, []);

  const workspaceContainers = useMemo(
    () =>
      buildContainerListEntries(
        effectiveSidebarSnapshot,
        allContainerHistory,
        initialDeployments,
        graphTimeZone
      ).map((entry) => {
        const alias = aliases[entry.display.id]?.trim();

        if (!alias) {
          return entry;
        }

        return {
          ...entry,
          display: {
            ...entry.display,
            name: alias,
          },
          searchText: `${alias} ${entry.searchText}`.toLowerCase(),
          sidebarName: alias,
        };
      }),
    [aliases, allContainerHistory, effectiveSidebarSnapshot, graphTimeZone, initialDeployments]
  );
  const filteredContainers = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return workspaceContainers;
    }

    return workspaceContainers.filter((container) =>
      container.searchText.includes(normalizedQuery)
    );
  }, [searchQuery, workspaceContainers]);

  const isAllContainersSelected = selectedContainerId === ALL_CONTAINERS_ID;
  const activeContainerId = isAllContainersSelected
    ? ALL_CONTAINERS_ID
    : filteredContainers.some((container) => container.display.id === selectedContainerId)
      ? selectedContainerId
      : (filteredContainers[0]?.display.id ??
        workspaceContainers[0]?.display.id ??
        selectedContainerId);
  const selectedEntry = isAllContainersSelected
    ? null
    : (filteredContainers.find((container) => container.display.id === activeContainerId) ??
      workspaceContainers.find((container) => container.display.id === activeContainerId) ??
      workspaceContainers[0] ??
      null);
  const selectedRuntimeContainer = selectedEntry?.runtime ?? null;
  const selectedRuntimeContainerId = selectedRuntimeContainer?.id ?? null;
  const [pendingContainerActions, setPendingContainerActions] = useState<
    Record<string, ContainerAction>
  >({});
  const postActionRefreshTimeoutIdsRef = useRef<number[]>([]);
  const sharedRefreshSnapshot = sharedChrome?.refreshSnapshot;

  const refreshSnapshotNow = useCallback(async () => {
    if (isEmbedded && sharedRefreshSnapshot) {
      await sharedRefreshSnapshot();
      return;
    }

    const response = await fetch('/api/metrics?mode=current', { cache: 'no-store' });

    if (!response.ok) {
      throw new Error(`Metrics request failed with ${response.status}.`);
    }

    const payload = (await response.json()) as { snapshot?: MetricsSnapshot | null };

    if (payload.snapshot) {
      setSidebarSnapshot(payload.snapshot);
    }
  }, [isEmbedded, sharedRefreshSnapshot]);

  useEffect(() => {
    return () => {
      for (const timeoutId of postActionRefreshTimeoutIdsRef.current) {
        window.clearTimeout(timeoutId);
      }
    };
  }, []);

  const handleContainerAction = useCallback(
    async (container: ContainerListEntry, action: ContainerAction) => {
      const runtimeId = container.runtime?.id;
      const containerKey = container.display.id;

      if (!runtimeId) {
        return;
      }

      setPendingContainerActions((current) => ({ ...current, [containerKey]: action }));

      try {
        const response = await fetch(`/api/containers/${runtimeId}/actions`, {
          body: JSON.stringify({ action }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        });
        const payload = (await response.json().catch(() => ({}))) as { error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? 'Container action failed.');
        }

        toast.success(`${CONTAINER_ACTION_DONE_LABELS[action]} ${container.sidebarName}`);

        for (const timeoutId of postActionRefreshTimeoutIdsRef.current) {
          window.clearTimeout(timeoutId);
        }

        postActionRefreshTimeoutIdsRef.current = POST_ACTION_REFRESH_DELAYS_MS.map((delayMs) =>
          window.setTimeout(() => {
            void refreshSnapshotNow().catch(() => undefined);
          }, delayMs)
        );
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Container action failed.');
      } finally {
        setPendingContainerActions((current) => {
          const next = { ...current };
          delete next[containerKey];
          return next;
        });
      }
    },
    [refreshSnapshotNow]
  );

  useEffect(() => {
    if (isEmbedded) {
      return;
    }

    if (typeof window === 'undefined') {
      return;
    }

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
  }, [dashboardRange, isEmbedded]);

  useLiveMetricsPolling({
    enabled: !isEmbedded,
    initialSnapshot,
    initialHistory,
    refreshKey: dashboardRange,
    onSnapshot: setSidebarSnapshot,
    onHistory: setSidebarHistory,
  });

  useEffect(() => {
    const requestedRange = effectiveDashboardRange;
    const hasHistoryForRange = loadedContainerHistoryRangeRef.current === requestedRange;

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
            allContainers: 'true',
            includeAllContainerHistory: 'true',
            includeHistory: 'false',
            includeSnapshot: 'false',
            range: requestedRange,
          }),
          {
            cache: 'no-store',
            signal: abortController.signal,
          }
        );

        if (!response.ok) {
          throw new Error('Metrics request failed with ' + response.status + '.');
        }

        const payload = (await response.json()) as {
          allContainerHistory?: AllContainersMetricsHistorySeries[];
          history?: MetricsHistoryPoint[];
          snapshot?: MetricsSnapshot | null;
        };

        if (!active) {
          return;
        }

        if (!isEmbedded && payload.snapshot && !sidebarSnapshot) {
          setSidebarSnapshot(payload.snapshot);
        }

        if (!isEmbedded && Array.isArray(payload.history) && sidebarHistory.length === 0) {
          setSidebarHistory(payload.history);
        }

        if (Array.isArray(payload.allContainerHistory)) {
          setAllContainerHistory(payload.allContainerHistory);
          loadedContainerHistoryRangeRef.current = requestedRange;
        }

        setContainerHistoryError(null);
      } catch (error) {
        if (!active || (error instanceof DOMException && error.name === 'AbortError')) {
          return;
        }

        setContainerHistoryError(
          error instanceof Error ? error.message : 'Unable to load container history.'
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
    effectiveDashboardRange,
    isEmbedded,
    sidebarHistory.length,
    sidebarSnapshot,
  ]);

  const handleLocalResetLayout = useCallback(() => {
    setSearchQuery('');
    setSelectedContainerId(ALL_CONTAINERS_ID);
  }, []);

  useEffect(() => {
    if (!isEmbedded) {
      return;
    }

    return sharedChrome.registerResetHandler(handleLocalResetLayout);
  }, [handleLocalResetLayout, isEmbedded, sharedChrome]);

  const handleResetLayout = useCallback(() => {
    handleLocalResetLayout();
  }, [handleLocalResetLayout]);

  const handleViewChange = useCallback(
    (view: WorkspaceView) => {
      const pathname =
        view === 'dashboard' ? '/' : view === 'git-app-page' ? '/git-app-page' : `/${view}`;
      const search = effectiveDashboardRange === '15m' ? '' : `?range=${effectiveDashboardRange}`;

      router.push(`${pathname}${search}`);
    },
    [effectiveDashboardRange, router]
  );

  const dashboardPanels = (
    <main className="min-w-0 flex-1 overflow-auto bg-[var(--canvas)]">
      <MetricsDashboardMainContent
        activeContainerId={activeContainerId}
        allContainerHistory={allContainerHistory}
        containerHistoryStatusText={containerHistoryError}
        containers={filteredContainers}
        deployments={initialDeployments}
        isAllContainerHistoryLoading={isContainerHistoryLoading}
        isAllContainersSelected={isAllContainersSelected}
        onAllContainersSelectAction={() => setSelectedContainerId(ALL_CONTAINERS_ID)}
        onContainerLifecycleAction={handleContainerAction}
        onContainerSelectAction={setSelectedContainerId}
        onRangeChangeAction={setEffectiveDashboardRange}
        onSearchQueryChangeAction={setSearchQuery}
        pendingContainerActions={pendingContainerActions}
        range={effectiveDashboardRange}
        rangeOptions={METRICS_DASHBOARD_RANGE_OPTIONS}
        runningContainersCount={effectiveSidebarSnapshot?.containers.running ?? null}
        searchQuery={searchQuery}
        selectedContainerId={isAllContainersSelected ? null : selectedRuntimeContainerId}
        snapshot={effectiveSidebarSnapshot}
        systemPanels={systemPanels}
        timeZone={graphTimeZone}
      />
    </main>
  );

  if (isEmbedded) {
    return dashboardPanels;
  }

  return (
    <section aria-label="Workspace shell" className="flex h-dvh flex-col bg-background">
      <WorkspaceHeader
        activeView="dashboard"
        influxExplorerUrl={influxExplorerUrl}
        onInfluxExplorerOpenAction={() => {
          if (influxExplorerUrl) {
            window.open(influxExplorerUrl, '_blank', 'noopener,noreferrer');
          }
        }}
        onResetLayoutAction={handleResetLayout}
        onTimeDisplayModeChangeAction={(mode) => {
          setStandaloneTimeDisplayMode(mode);
          writeStoredTimeDisplayMode(mode);
        }}
        onViewChangeAction={handleViewChange}
        statusLabel={effectiveSidebarSnapshot ? 'Host online' : 'Connecting'}
        timeDisplayMode={effectiveTimeDisplayMode}
        updatedAtLabel={
          effectiveSidebarSnapshot
            ? formatClock(effectiveSidebarSnapshot.timestamp, graphTimeZone)
            : 'Waiting for metrics'
        }
      />

      <div className="flex min-w-0 flex-1 overflow-hidden">{dashboardPanels}</div>

      <WorkspaceFooter
        activeViewLabel="Dashboard"
        updatedAtLabel={
          effectiveSidebarSnapshot
            ? formatClock(effectiveSidebarSnapshot.timestamp, graphTimeZone)
            : 'Waiting for metrics'
        }
      />
    </section>
  );
}
