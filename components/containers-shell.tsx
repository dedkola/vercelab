"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";

import { ContainersMainContent } from "@/components/workspace/containers-main-content";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DashboardLeftSidebar } from "@/components/workspace/dashboard-left-sidebar";
import { DashboardRightSidebar } from "@/components/workspace/dashboard-right-sidebar";
import type {
  ContainerListEntry,
  DashboardLogView,
  LogLine,
} from "@/components/workspace-shell";
import {
  readStoredContainerAliases,
  subscribeToStoredContainerAliases,
  writeStoredContainerAliases,
} from "@/lib/container-preferences";
import type { ContainersData } from "@/lib/containers-data";
import {
  type ContainerAction,
  getContainerInventoryMeta,
} from "@/lib/container-inventory";
import type { ContainerInspectData } from "@/lib/container-inspect";
import type { RecreateChanges } from "@/lib/container-recreate";
import {
  ALL_CONTAINERS_ID,
  buildAggregateLogs,
  buildContainerListEntries,
  formatStatusLabel,
  getStatusBadgeVariant,
  LOG_VIEW_OPTIONS,
} from "@/lib/metrics-dashboard-metrics";
import type { MetricsSnapshot } from "@/lib/system-metrics";

import type { ExposureMode } from "@/lib/validation";

const LIST_PANEL_STORAGE_KEY = "vercelab:containers-list-panel-width";
const LOGS_PANEL_STORAGE_KEY = "vercelab:containers-logs-panel-width";
const DEFAULT_LIST_WIDTH_PX = 304;
const DEFAULT_LOGS_WIDTH_PX = 340;
const MIN_LIST_WIDTH_PX = 260;
const MAX_LIST_WIDTH_PX = 420;
const MIN_LOGS_WIDTH_PX = 300;
const MAX_LOGS_WIDTH_PX = 520;
const LIVE_POLL_INTERVAL_MS = 10000;
const HIDDEN_LIVE_POLL_INTERVAL_MS = 30000;
const LOG_TAIL_LINES = 150;
const POST_ACTION_REFRESH_DELAYS_MS = [0, 700, 1800] as const;

type CatalogSearchResult = {
  description: string | null;
  isOfficial: boolean;
  name: string;
  pullCount: number;
  starCount: number;
};

type CreateMode = "image" | "compose";

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

function formatCompactCount(value: number) {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Math.max(0, value));
}

type ContainersShellProps = ContainersData;

export function ContainersShell({
  initialAllContainerHistory = [],
  initialDeployments = [],
  initialSnapshot = null,
}: ContainersShellProps) {
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
  const [logsError, setLogsError] = useState<string | null>(null);
  const [aliases, setAliases] = useState<Record<string, string>>({});
  const [aliasDraft, setAliasDraft] = useState("");
  const [isCreatePanelOpen, setIsCreatePanelOpen] = useState(false);
  const [createMode, setCreateMode] = useState<CreateMode>("image");
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogResults, setCatalogResults] = useState<CatalogSearchResult[]>(
    [],
  );
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [imageReference, setImageReference] = useState("nginx:latest");
  const [newContainerName, setNewContainerName] = useState("");
  const [newContainerPorts, setNewContainerPorts] = useState("");
  const [newContainerExposureMode, setNewContainerExposureMode] =
    useState<ExposureMode>("http");
  const [newContainerHostPort, setNewContainerHostPort] = useState("");
  const [newContainerEnvVariables, setNewContainerEnvVariables] = useState("");
  const [composeStackName, setComposeStackName] = useState("");
  const [composeContent, setComposeContent] = useState(
    "services:\n  app:\n    image: nginx:latest\n    ports:\n      - \"8080:80\"",
  );
  const [createPending, setCreatePending] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState<ContainerAction | null>(
    null,
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [inspectData, setInspectData] = useState<ContainerInspectData | null>(null);
  const [inspectLoading, setInspectLoading] = useState(false);
  const [recreatePending, setRecreatePending] = useState(false);
  const [recreateError, setRecreateError] = useState<string | null>(null);
  const postActionRefreshTimeoutIdsRef = useRef<number[]>([]);
  const dragStateRef = useRef<{
    kind: "list" | "logs" | null;
    startWidth: number;
    startX: number;
  }>({
    kind: null,
    startWidth: 0,
    startX: 0,
  });

  const refreshSnapshotNow = useCallback(async () => {
    const response = await fetch("/api/metrics?mode=current", {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Metrics request failed with ${response.status}.`);
    }

    const payload = (await response.json()) as {
      snapshot?: MetricsSnapshot | null;
    };

    if (payload.snapshot) {
      setSnapshot(payload.snapshot);
    }

    return payload.snapshot ?? null;
  }, []);

  const scheduleBackgroundSnapshotRefresh = useCallback(() => {
    for (const timeoutId of postActionRefreshTimeoutIdsRef.current) {
      window.clearTimeout(timeoutId);
    }

    postActionRefreshTimeoutIdsRef.current = POST_ACTION_REFRESH_DELAYS_MS.map(
      (delayMs) =>
        window.setTimeout(() => {
          void refreshSnapshotNow().catch(() => undefined);
        }, delayMs),
    );
  }, [refreshSnapshotNow]);

  useEffect(() => {
    setAliases(readStoredContainerAliases());

    return subscribeToStoredContainerAliases(setAliases);
  }, []);

  useEffect(() => {
    return () => {
      for (const timeoutId of postActionRefreshTimeoutIdsRef.current) {
        window.clearTimeout(timeoutId);
      }
    };
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
    const runtimeId = selectedEntry?.runtime?.id;

    if (!runtimeId || isAllContainersSelected) {
      setInspectData(null);
      return;
    }

    let active = true;
    setInspectData(null);
    setInspectLoading(true);

    void (async () => {
      try {
        const response = await fetch(`/api/containers/${runtimeId}/inspect`, {
          cache: "no-store",
        });
        const payload = (await response.json()) as ContainerInspectData & { error?: string };

        if (!active) {
          return;
        }

        if (response.ok) {
          setInspectData(payload);
        }
      } catch {
        // inspect failure is non-fatal
      } finally {
        if (active) {
          setInspectLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [isAllContainersSelected, selectedEntry]);

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
    writeStoredContainerAliases(nextAliases);
  };

  const handleCatalogSearch = async () => {
    const query = catalogQuery.trim();

    if (query.length < 2) {
      setCatalogResults([]);
      setCatalogError("Type at least 2 characters to search images.");
      return;
    }

    setCatalogLoading(true);
    setCatalogError(null);

    try {
      const response = await fetch(
        `/api/containers/catalog?query=${encodeURIComponent(query)}`,
        {
          cache: "no-store",
        },
      );
      const payload = (await response.json()) as {
        error?: string;
        results?: CatalogSearchResult[];
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to search image catalog.");
      }

      setCatalogResults(payload.results ?? []);
    } catch (error) {
      setCatalogError(
        error instanceof Error
          ? error.message
          : "Unable to search image catalog.",
      );
    } finally {
      setCatalogLoading(false);
    }
  };

  const handleCreateContainer = async () => {
    setCreatePending(true);
    setCreateError(null);
    setCreateSuccess(null);

    try {
      const body =
        createMode === "image"
          ? {
              containerName: newContainerName,
              envVariables: newContainerEnvVariables,
              exposureMode: newContainerExposureMode,
              hostPort: newContainerHostPort.trim()
                ? Number(newContainerHostPort.trim())
                : undefined,
              image: imageReference,
              mode: "image" as const,
              ports:
                newContainerExposureMode === "tcp"
                  ? undefined
                  : newContainerPorts || undefined,
            }
          : {
              composeContent,
              mode: "compose" as const,
              stackName: composeStackName,
            };

      const response = await fetch("/api/containers/create", {
        body: JSON.stringify(body),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const payload = (await response.json()) as {
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to create container.");
      }

      setCreateSuccess(payload.message ?? "Container started.");
      setIsCreatePanelOpen(false);
      scheduleBackgroundSnapshotRefresh();
    } catch (error) {
      setCreateError(
        error instanceof Error ? error.message : "Unable to create container.",
      );
    } finally {
      setCreatePending(false);
    }
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

      scheduleBackgroundSnapshotRefresh();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Container action failed.",
      );
    } finally {
      setActionPending(null);
    }
  };

  const handleRecreate = async (changes: RecreateChanges) => {
    const runtimeId = selectedEntry?.runtime?.id;

    if (!runtimeId) {
      return;
    }

    setRecreatePending(true);
    setRecreateError(null);

    try {
      const response = await fetch(`/api/containers/${runtimeId}/recreate`, {
        body: JSON.stringify(changes),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to recreate container.");
      }

      scheduleBackgroundSnapshotRefresh();
    } catch (error) {
      setRecreateError(
        error instanceof Error ? error.message : "Unable to recreate container.",
      );
    } finally {
      setRecreatePending(false);
    }
  };

  const createPanel = (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          onClick={() => setCreateMode("image")}
          size="xs"
          type="button"
          variant={createMode === "image" ? "default" : "secondary"}
        >
          Image
        </Button>
        <Button
          onClick={() => setCreateMode("compose")}
          size="xs"
          type="button"
          variant={createMode === "compose" ? "default" : "secondary"}
        >
          Compose
        </Button>
      </div>

      {createMode === "image" ? (
        <div className="space-y-2.5">
          <div className="grid gap-2 md:grid-cols-[1fr_auto]">
            <Input
              aria-label="Search images"
              onChange={(event) => setCatalogQuery(event.target.value)}
              placeholder="Search Docker Hub images"
              value={catalogQuery}
            />
            <Button
              disabled={catalogLoading}
              onClick={handleCatalogSearch}
              size="xs"
              type="button"
            >
              {catalogLoading ? "Searching..." : "Search"}
            </Button>
          </div>

          {catalogResults.length ? (
            <div className="max-h-36 space-y-1 overflow-auto rounded-md border border-border/60 bg-background/70 p-1.5">
              {catalogResults.map((result) => (
                <button
                  className="flex w-full items-center justify-between gap-2 rounded-md border border-transparent px-2 py-1.5 text-left text-xs transition hover:border-border/70 hover:bg-muted/20"
                  key={result.name}
                  onClick={() => {
                    setImageReference(`${result.name}:latest`);
                    setNewContainerName(result.name.split("/").at(-1) ?? "");
                  }}
                  type="button"
                >
                  <span className="truncate font-medium text-foreground">
                    {result.name}
                  </span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {formatCompactCount(result.pullCount)} pulls · {formatCompactCount(result.starCount)} stars
                  </span>
                </button>
              ))}
            </div>
          ) : null}

          <div className="grid gap-2 md:grid-cols-2">
            <Input
              aria-label="Container image reference"
              onChange={(event) => setImageReference(event.target.value)}
              placeholder="ghcr.io/org/image:tag or nginx:latest"
              value={imageReference}
            />
            <Input
              aria-label="Container name"
              onChange={(event) => setNewContainerName(event.target.value)}
              placeholder="Container name"
              value={newContainerName}
            />
            <select
              aria-label="Exposure mode"
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              onChange={(event) =>
                setNewContainerExposureMode(event.target.value as ExposureMode)
              }
              value={newContainerExposureMode}
            >
              <option value="http">HTTP — Traefik reverse proxy</option>
              <option value="tcp">TCP — Traefik TCP passthrough</option>
              <option value="host">Host port — bind directly to host</option>
              <option value="internal">Internal — no external exposure</option>
            </select>
            {newContainerExposureMode === "tcp" ? (
              <Input
                aria-label="Host port"
                inputMode="numeric"
                onChange={(event) => setNewContainerHostPort(event.target.value)}
                placeholder="Host port (e.g. 27017)"
                value={newContainerHostPort}
              />
            ) : newContainerExposureMode !== "internal" ? (
              <Input
                aria-label="Port mappings"
                onChange={(event) => setNewContainerPorts(event.target.value)}
                placeholder={
                  newContainerExposureMode === "host"
                    ? "27017:27017, 6379:6379"
                    : "8080:80, 8443:443"
                }
                value={newContainerPorts}
              />
            ) : null}
            <Input
              aria-label="Environment variables"
              className="md:col-span-2"
              onChange={(event) => setNewContainerEnvVariables(event.target.value)}
              placeholder="KEY=VALUE (comma or newline separated)"
              value={newContainerEnvVariables}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-2.5">
          <Input
            aria-label="Compose stack name"
            onChange={(event) => setComposeStackName(event.target.value)}
            placeholder="Stack name"
            value={composeStackName}
          />
          <textarea
            aria-label="Compose content"
            className="min-h-44 w-full rounded-md border border-border/70 bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-emerald-300/80"
            onChange={(event) => setComposeContent(event.target.value)}
            placeholder="Paste docker compose yaml"
            value={composeContent}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">
          {catalogError ?? createError ?? createSuccess ?? ""}
        </div>
        <Button
          disabled={createPending}
          onClick={handleCreateContainer}
          size="xs"
          type="button"
        >
          {createPending ? "Creating..." : "Create"}
        </Button>
      </div>
    </div>
  );

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
      : previewLogs;

  return (
    <div className="flex min-w-0 flex-1 overflow-hidden">
      <DashboardLeftSidebar
        activeContainerId={selectedContainerId}
        addPanel={createPanel}
        containers={filteredContainers}
        isAddPanelOpen={isCreatePanelOpen}
        isAllContainersSelected={isAllContainersSelected}
        listWidth={listWidth}
        onAddContainerAction={() => {
          setIsCreatePanelOpen((current) => !current);
          setCatalogError(null);
          setCreateError(null);
          setCreateSuccess(null);
        }}
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
        inspectData={inspectData}
        inspectLoading={inspectLoading}
        inventoryMeta={inventoryMeta}
        onAliasDraftChangeAction={setAliasDraft}
        onAliasSaveAction={handleAliasSave}
        onRecreateAction={handleRecreate}
        onRunAction={handleRunAction}
        recreateError={recreateError}
        recreatePending={recreatePending}
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
        selectedContainerStatusLabel={selectedContainerStatusLabel}
        selectedContainerStatusVariant={selectedContainerStatusVariant}
        selectedPreviewAvailable={!isAllContainersSelected && Boolean(selectedEntry)}
        width={logsWidth}
      />
    </div>
  );
}