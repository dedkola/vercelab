'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { MetricsDashboardMainContent } from '@/components/workspace/metrics-dashboard-main-content';
import { useWorkspaceChrome } from '@/components/workspace/workspace-chrome-shell';
import type { ContainerAction } from '@/lib/container-inventory';
import {
  readStoredContainerAliases,
  subscribeToStoredContainerAliases,
} from '@/lib/container-preferences';
import type { AllContainersMetricsHistorySeries } from '@/lib/influx-metrics';
import type { MetricsDashboardData } from '@/lib/metrics-dashboard-data';
import {
  ALL_CONTAINERS_ID,
  buildContainerListEntries,
  buildSystemMetricPanels,
  METRICS_DASHBOARD_RANGE_OPTIONS,
} from '@/lib/metrics-dashboard-metrics';
import { getTimeZoneForDisplayMode } from '@/lib/time-display';
import type { ContainerListEntry } from '@/lib/workspace-types';

function buildMetricsRequestUrl(searchParams: Record<string, string>) {
  return '/api/metrics?' + new URLSearchParams(searchParams).toString();
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

type MetricsDashboardShellProps = Pick<
  MetricsDashboardData,
  'initialAllContainerHistory' | 'initialDashboardRange' | 'initialDeployments'
>;

export function MetricsDashboardShell({
  initialAllContainerHistory = [],
  initialDashboardRange = '15m',
  initialDeployments = [],
}: MetricsDashboardShellProps) {
  const {
    dashboardRange,
    refreshSnapshot,
    registerResetHandler,
    setDashboardRange,
    sidebarHistory,
    sidebarSnapshot,
    timeDisplayMode,
  } = useWorkspaceChrome();
  const [selectedContainerId, setSelectedContainerId] = useState(ALL_CONTAINERS_ID);
  const [searchQuery, setSearchQuery] = useState('');
  const [allContainerHistory, setAllContainerHistory] = useState<
    AllContainersMetricsHistorySeries[]
  >(initialAllContainerHistory);
  const [aliases, setAliases] = useState<Record<string, string>>({});
  const [containerHistoryError, setContainerHistoryError] = useState<string | null>(null);
  const [isContainerHistoryLoading, setIsContainerHistoryLoading] = useState(
    initialAllContainerHistory.length === 0
  );
  const hasMountedContainerHistoryRef = useRef(false);
  const containerHistoryInFlightRef = useRef(false);
  const loadedContainerHistoryRangeRef = useRef<string | null>(
    initialAllContainerHistory.length ? initialDashboardRange : null
  );
  const graphTimeZone = getTimeZoneForDisplayMode(timeDisplayMode);
  const systemPanels = useMemo(
    () => buildSystemMetricPanels(sidebarSnapshot, sidebarHistory, graphTimeZone),
    [sidebarHistory, sidebarSnapshot, graphTimeZone]
  );

  useEffect(() => {
    setAliases(readStoredContainerAliases());

    return subscribeToStoredContainerAliases(setAliases);
  }, []);

  const workspaceContainers = useMemo(
    () =>
      buildContainerListEntries(
        sidebarSnapshot,
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
    [aliases, allContainerHistory, sidebarSnapshot, graphTimeZone, initialDeployments]
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
            void refreshSnapshot().catch(() => undefined);
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
    [refreshSnapshot]
  );

  useEffect(() => {
    const requestedRange = dashboardRange;
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
        };

        if (!active) {
          return;
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
  }, [allContainerHistory.length, dashboardRange]);

  const handleResetLayout = useCallback(() => {
    setSearchQuery('');
    setSelectedContainerId(ALL_CONTAINERS_ID);
  }, []);

  useEffect(
    () => registerResetHandler(handleResetLayout),
    [handleResetLayout, registerResetHandler]
  );

  return (
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
        onRangeChangeAction={setDashboardRange}
        onSearchQueryChangeAction={setSearchQuery}
        pendingContainerActions={pendingContainerActions}
        range={dashboardRange}
        rangeOptions={METRICS_DASHBOARD_RANGE_OPTIONS}
        runningContainersCount={sidebarSnapshot?.containers.running ?? null}
        searchQuery={searchQuery}
        selectedContainerId={isAllContainersSelected ? null : selectedRuntimeContainerId}
        snapshot={sidebarSnapshot}
        systemPanels={systemPanels}
        timeZone={graphTimeZone}
      />
    </main>
  );
}
