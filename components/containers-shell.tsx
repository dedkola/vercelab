"use client";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";

import { ContainersMainContent } from "@/components/workspace/containers-main-content";
import { DashboardLeftSidebar } from "@/components/workspace/dashboard-left-sidebar";
import { DashboardRightSidebar } from "@/components/workspace/dashboard-right-sidebar";
import type {
  ContainerListEntry,
  DashboardLogView,
  LogLine,
} from "@/components/workspace-shell";
import type { ContainersData } from "@/lib/containers-data";
import {
  type ContainerAction,
  getContainerInventoryMeta,
} from "@/lib/container-runtime";
import {
  ALL_CONTAINERS_ID,
  buildAggregateLogs,
  buildContainerListEntries,
  formatStatusLabel,
  getStatusBadgeVariant,
  LOG_VIEW_OPTIONS,
} from "@/lib/metrics-dashboard-metrics";

const LIST_PANEL_STORAGE_KEY = "vercelab:containers-list-panel-width";
const LOGS_PANEL_STORAGE_KEY = "vercelab:containers-logs-panel-width";
const ALIAS_STORAGE_KEY = "vercelab:containers-friendly-labels";
const DEFAULT_LIST_WIDTH_PX = 304;
const DEFAULT_LOGS_WIDTH_PX = 340;
const MIN_LIST_WIDTH_PX = 260;
const MAX_LIST_WIDTH_PX = 420;
const MIN_LOGS_WIDTH_PX = 300;
const MAX_LOGS_WIDTH_PX = 520;
const LIVE_POLL_INTERVAL_MS = 10000;
const HIDDEN_LIVE_POLL_INTERVAL_MS = 30000;
const LOG_TAIL_LINES = 150;

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

    setWidth(clamp(parsedWidth, minWidth, maxWidth));
  }, [key, maxWidth, minWidth]);

  useEffect(() => {
    getStorage()?.setItem(key, String(Math.round(width)));
  }, [key, width]);

  return [width, setWidth] as const;
}

function isDocumentHidden() {
  if (typeof document === "undefined") {
    return false;
  }

  return document.visibilityState === "hidden";
}

function createLogTimestamp(value: string) {
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatContainerLogLines(output: string, containerId: string): LogLine[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .slice(-LOG_TAIL_LINES)
    .map((line, index) => {
      const timestampMatch = /^(\S+)\s+(.*)$/.exec(line);
      const timestamp = timestampMatch?.[1] ?? new Date().toISOString();
      const message = timestampMatch?.[2] ?? line;

      return {
        id: `${containerId}:${index}`,
        level: /error|fail|panic/i.test(message)
          ? "warning"
          : /ready|started|listening|healthy/i.test(message)
            ? "success"
            : "info",
        message,
        timestamp: createLogTimestamp(timestamp),
      } satisfies LogLine;
    });
}

function readStoredAliases() {
  const rawValue = getStorage()?.getItem(ALIAS_STORAGE_KEY);

  if (!rawValue) {
    return {} as Record<string, string>;
  }

  try {
    const parsed = JSON.parse(rawValue) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {} as Record<string, string>;
  }
}

function writeStoredAliases(aliases: Record<string, string>) {
  getStorage()?.setItem(ALIAS_STORAGE_KEY, JSON.stringify(aliases));
}

type ContainersShellProps = ContainersData;

export function ContainersShell({
  initialAllContainerHistory = [],
  initialDeployments = [],
  initialSnapshot = null,
}: ContainersShellProps) {
  const router = useRouter();
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
  const [isLogsCollapsed, setIsLogsCollapsed] = useState(false);
  const [selectedContainerId, setSelectedContainerId] = useState(
    initialSnapshot?.containers.all[0]?.id ?? ALL_CONTAINERS_ID,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [dashboardLogView, setDashboardLogView] =
    useState<DashboardLogView>("live");
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [runtimeLogs, setRuntimeLogs] = useState<Record<string, LogLine[]>>({});
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [aliases, setAliases] = useState<Record<string, string>>({});
  const [aliasDraft, setAliasDraft] = useState("");
  const [actionPending, setActionPending] = useState<ContainerAction | null>(
    null,
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const dragStateRef = useRef<{
    kind: "list" | "logs" | null;
    startWidth: number;
    startX: number;
  }>({
    kind: null,
    startWidth: 0,
    startX: 0,
  });

  useEffect(() => {
    setAliases(readStoredAliases());
  }, []);

  const containers = useMemo(() => {
    const baseEntries = buildContainerListEntries(
      snapshot,
      initialAllContainerHistory,
      initialDeployments,
    );

    return baseEntries.map((entry) => {
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
        sidebarName: alias,
        searchText: `${alias} ${entry.searchText}`.toLowerCase(),
      } satisfies ContainerListEntry;
    });
  }, [aliases, initialAllContainerHistory, initialDeployments, snapshot]);

  useEffect(() => {
    if (!containers.length) {
      setSelectedContainerId(ALL_CONTAINERS_ID);
      return;
    }

    setSelectedContainerId((current) => {
      if (
        current !== ALL_CONTAINERS_ID &&
        containers.some((entry) => entry.display.id === current)
      ) {
        return current;
      }

      return containers[0]?.display.id ?? ALL_CONTAINERS_ID;
    });
  }, [containers]);

  const filteredContainers = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return containers;
    }

    return containers.filter((entry) =>
      entry.searchText.includes(normalizedQuery),
    );
  }, [containers, searchQuery]);

  const isAllContainersSelected = selectedContainerId === ALL_CONTAINERS_ID;
  const selectedEntry = useMemo(
    () =>
      containers.find((entry) => entry.display.id === selectedContainerId) ??
      null,
    [containers, selectedContainerId],
  );
  const inventoryMeta = getContainerInventoryMeta(selectedEntry);
  const aggregateLogs = useMemo(
    () =>
      buildAggregateLogs(
        snapshot,
        [],
        initialAllContainerHistory,
        initialDeployments,
      ),
    [initialAllContainerHistory, initialDeployments, snapshot],
  );
  const previewLogs = isAllContainersSelected
    ? aggregateLogs[dashboardLogView]
    : dashboardLogView === "live"
      ? (runtimeLogs[selectedEntry?.display.id ?? ""] ?? [])
      : (selectedEntry?.display.logs[dashboardLogView] ?? []);
  const selectedContainerName = isAllContainersSelected
    ? "All containers"
    : (selectedEntry?.sidebarName ?? "Container");
  const selectedContainerStatusLabel = selectedEntry
    ? formatStatusLabel(selectedEntry.display.status)
    : `${snapshot?.containers.running ?? 0} running`;
  const selectedContainerStatusVariant = selectedEntry
    ? getStatusBadgeVariant(selectedEntry.display.status)
    : "default";

  useEffect(() => {
    setAliasDraft(
      selectedEntry
        ? (aliases[selectedEntry.display.id] ?? selectedEntry.sidebarName)
        : "",
    );
  }, [aliases, selectedEntry]);

  useEffect(() => {
    let active = true;
    let timeoutId: number | null = null;
    let abortController: AbortController | null = null;

    const schedule = (delayMs: number) => {
      if (!active) {
        return;
      }

      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }

      timeoutId = window.setTimeout(() => {
        void pollSnapshot();
      }, delayMs);
    };

    const pollSnapshot = async () => {
      if (!active) {
        return;
      }

      if (isDocumentHidden()) {
        schedule(HIDDEN_LIVE_POLL_INTERVAL_MS);
        return;
      }

      abortController = new AbortController();

      try {
        const response = await fetch("/api/metrics?mode=current", {
          cache: "no-store",
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error(`Metrics request failed with ${response.status}.`);
        }

        const payload = (await response.json()) as {
          snapshot?: typeof snapshot;
        };

        if (!active) {
          return;
        }

        if (payload.snapshot) {
          setSnapshot(payload.snapshot);
        }
      } catch (error) {
        if (
          !active ||
          (error instanceof DOMException && error.name === "AbortError")
        ) {
          return;
        }
      } finally {
        abortController = null;
        schedule(LIVE_POLL_INTERVAL_MS);
      }
    };

    schedule(initialSnapshot ? LIVE_POLL_INTERVAL_MS : 0);

    return () => {
      active = false;
      abortController?.abort();

      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [initialSnapshot]);

  useEffect(() => {
    const selectedRuntime = selectedEntry?.runtime;

    if (isAllContainersSelected || !selectedRuntime) {
      setLogsError(null);
      setLogsLoading(false);
      return;
    }

    let active = true;
    let timeoutId: number | null = null;
    let abortController: AbortController | null = null;

    const schedule = (delayMs: number) => {
      if (!active) {
        return;
      }

      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }

      timeoutId = window.setTimeout(() => {
        void loadLogs();
      }, delayMs);
    };

    const loadLogs = async () => {
      if (!active) {
        return;
      }

      if (isDocumentHidden()) {
        schedule(HIDDEN_LIVE_POLL_INTERVAL_MS);
        return;
      }

      setLogsLoading(true);
      abortController = new AbortController();

      try {
        const response = await fetch(
          `/api/containers/${selectedRuntime.id}/logs?tail=${LOG_TAIL_LINES}`,
          {
            cache: "no-store",
            signal: abortController.signal,
          },
        );
        const payload = (await response.json()) as {
          error?: string;
          output?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to load container logs.");
        }

        if (!active) {
          return;
        }

        setRuntimeLogs((current) => ({
          ...current,
          [selectedEntry.display.id]: formatContainerLogLines(
            payload.output ?? "",
            selectedEntry.display.id,
          ),
        }));
        setLogsError(null);
      } catch (error) {
        if (
          !active ||
          (error instanceof DOMException && error.name === "AbortError")
        ) {
          return;
        }

        setLogsError(
          error instanceof Error
            ? error.message
            : "Unable to load container logs.",
        );
      } finally {
        if (active) {
          setLogsLoading(false);
          schedule(LIVE_POLL_INTERVAL_MS);
        }

        abortController = null;
      }
    };

    void loadLogs();

    return () => {
      active = false;
      abortController?.abort();

      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [isAllContainersSelected, selectedEntry]);

  useEffect(() => {
    function handleMouseMove(event: MouseEvent) {
      if (!dragStateRef.current.kind) {
        return;
      }

      if (dragStateRef.current.kind === "list") {
        setListWidth(
          clamp(
            dragStateRef.current.startWidth +
              (event.clientX - dragStateRef.current.startX),
            MIN_LIST_WIDTH_PX,
            MAX_LIST_WIDTH_PX,
          ),
        );
        return;
      }

      setLogsWidth(
        clamp(
          dragStateRef.current.startWidth -
            (event.clientX - dragStateRef.current.startX),
          MIN_LOGS_WIDTH_PX,
          MAX_LOGS_WIDTH_PX,
        ),
      );
    }

    function handleMouseUp() {
      if (!dragStateRef.current.kind) {
        return;
      }

      dragStateRef.current = {
        kind: null,
        startWidth: 0,
        startX: 0,
      };
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
  }, [setListWidth, setLogsWidth]);

  const handleResizeStart = (
    kind: "list" | "logs",
    event: ReactMouseEvent<HTMLDivElement>,
  ) => {
    dragStateRef.current = {
      kind,
      startWidth: kind === "list" ? listWidth : logsWidth,
      startX: event.clientX,
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const handleAliasSave = () => {
    if (!selectedEntry) {
      return;
    }

    const nextAliases = {
      ...aliases,
      [selectedEntry.display.id]: aliasDraft.trim() || selectedEntry.display.name,
    };

    setAliases(nextAliases);
    writeStoredAliases(nextAliases);
  };

  const handleRunAction = async (action: ContainerAction) => {
    if (!selectedEntry?.runtime) {
      return;
    }

    setActionPending(action);
    setActionError(null);

    try {
      const response = await fetch(
        `/api/containers/${selectedEntry.runtime.id}/actions`,
        {
          body: JSON.stringify({ action }),
          headers: {
            "Content-Type": "application/json",
          },
          method: "POST",
        },
      );
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Container action failed.");
      }

      router.refresh();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Container action failed.",
      );
    } finally {
      setActionPending(null);
    }
  };

  const liveRailLogs =
    logsError && dashboardLogView === "live" && !isAllContainersSelected
      ? [
          {
            id: "containers-live-log-error",
            level: "warning",
            message: logsError,
            timestamp: createLogTimestamp(new Date().toISOString()),
          } satisfies LogLine,
        ]
      : logsLoading && dashboardLogView === "live" && !isAllContainersSelected
        ? [
            {
              id: "containers-live-log-loading",
              level: "info",
              message: "Refreshing docker logs...",
              timestamp: createLogTimestamp(new Date().toISOString()),
            } satisfies LogLine,
          ]
        : previewLogs;

  return (
    <div className="flex min-w-0 flex-1 overflow-hidden">
      <DashboardLeftSidebar
        activeContainerId={selectedContainerId}
        containers={filteredContainers}
        isAllContainersSelected={isAllContainersSelected}
        listWidth={listWidth}
        onAllContainersSelectAction={() =>
          setSelectedContainerId(ALL_CONTAINERS_ID)
        }
        onContainerSelectAction={setSelectedContainerId}
        onListResizeStartAction={(event) => handleResizeStart("list", event)}
        onSearchQueryChangeAction={setSearchQuery}
        runningContainersCount={snapshot?.containers.running ?? null}
        searchQuery={searchQuery}
        visibleCount={filteredContainers.length}
      />

      <ContainersMainContent
        actionError={actionError}
        actionPending={actionPending}
        aliasDraft={aliasDraft}
        inventoryMeta={inventoryMeta}
        onAliasDraftChangeAction={setAliasDraft}
        onAliasSaveAction={handleAliasSave}
        onRunAction={handleRunAction}
        runtimeEntry={selectedEntry}
      />

      <DashboardRightSidebar
        activeLogView={dashboardLogView}
        isCollapsed={isLogsCollapsed}
        isAggregateSelection={isAllContainersSelected}
        logOptions={LOG_VIEW_OPTIONS}
        logs={liveRailLogs}
        onCollapseAction={() => setIsLogsCollapsed(true)}
        onExpandAction={() => setIsLogsCollapsed(false)}
        onLogViewChangeAction={setDashboardLogView}
        onResizeStartAction={(event) => handleResizeStart("logs", event)}
        selectedContainerName={selectedContainerName}
        selectedContainerRegion={
          selectedEntry?.display.region ?? snapshot?.hostIp ?? "Current host"
        }
        selectedContainerStatusLabel={selectedContainerStatusLabel}
        selectedContainerStatusVariant={selectedContainerStatusVariant}
        selectedPreviewAvailable={!isAllContainersSelected && Boolean(selectedEntry)}
        width={logsWidth}
      />
    </div>
  );
}