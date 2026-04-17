"use client";

import { useEffect, useState } from "react";

import { Icon } from "@/components/dashboard-kit";
import { Badge } from "@/components/ui/badge";
import { CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { DeploymentSummary } from "@/lib/persistence";
import { cn } from "@/lib/utils";

export type LogTab = "build" | "container";

type GitLogPanelProps = {
  currentView: "list" | "detail" | "create";
  deploymentId: string | null;
  deployments: DeploymentSummary[];
  initialActiveLogTab: LogTab;
  onLogTabChangeAction?: (tab: LogTab) => void;
  showHeader?: boolean;
};

type DeploymentLogPayload = {
  type: "build" | "container";
  deploymentId: string;
  appName: string;
  summary: string;
  output: string;
  status: string;
  updatedAt: string;
};

const deploymentTimeFormatter = new Intl.DateTimeFormat("en", {
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  month: "short",
});

const relativeTimeFormatter = new Intl.RelativeTimeFormat("en", {
  numeric: "auto",
});

const LOG_REFRESH_INTERVAL_MS = 2000;

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
    default:
      return status;
  }
}

function formatStatusBadgeVariant(
  status: DeploymentSummary["status"],
): "default" | "success" | "destructive" | "warning" | "info" {
  switch (status) {
    case "deploying":
      return "info";
    case "running":
      return "success";
    case "failed":
      return "destructive";
    case "stopped":
      return "default";
    case "removing":
      return "warning";
    default:
      return "default";
  }
}

function formatDeploymentTime(updatedAt: string) {
  return deploymentTimeFormatter.format(new Date(updatedAt));
}

function formatRelativeTime(value: string | null) {
  if (!value) {
    return "--";
  }

  const deltaSeconds = Math.round(
    (new Date(value).getTime() - Date.now()) / 1000,
  );
  const absoluteSeconds = Math.abs(deltaSeconds);

  if (absoluteSeconds < 60) {
    return relativeTimeFormatter.format(deltaSeconds, "second");
  }

  const deltaMinutes = Math.round(deltaSeconds / 60);

  if (Math.abs(deltaMinutes) < 60) {
    return relativeTimeFormatter.format(deltaMinutes, "minute");
  }

  const deltaHours = Math.round(deltaMinutes / 60);

  if (Math.abs(deltaHours) < 24) {
    return relativeTimeFormatter.format(deltaHours, "hour");
  }

  const deltaDays = Math.round(deltaHours / 24);

  if (Math.abs(deltaDays) < 30) {
    return relativeTimeFormatter.format(deltaDays, "day");
  }

  const deltaMonths = Math.round(deltaDays / 30);

  if (Math.abs(deltaMonths) < 12) {
    return relativeTimeFormatter.format(deltaMonths, "month");
  }

  const deltaYears = Math.round(deltaMonths / 12);

  return relativeTimeFormatter.format(deltaYears, "year");
}

function getLogPanelEmptyState(
  currentView: GitLogPanelProps["currentView"],
  hasPendingDeployment: boolean,
) {
  if (hasPendingDeployment) {
    return {
      description:
        "The selected deployment is still being resolved. Logs will appear here as soon as the workspace is ready.",
      title: "Preparing logs",
    };
  }

  if (currentView === "create") {
    return {
      description:
        "Deploy an app to start streaming build and container output in this sidebar.",
      title: "Logs are idle",
    };
  }

  return {
    description:
      "Select an app from the list to inspect build and container logs without leaving the dashboard shell.",
    title: "No app selected",
  };
}

export function GitLogPanel({
  currentView,
  deploymentId,
  deployments,
  initialActiveLogTab,
  onLogTabChangeAction,
  showHeader = true,
}: GitLogPanelProps) {
  const [activeLogTab, setActiveLogTab] = useState<LogTab>(initialActiveLogTab);
  const [logRefreshKey, setLogRefreshKey] = useState(0);
  const [logState, setLogState] = useState<{
    isLoading: boolean;
    isRefreshing: boolean;
    error: string | null;
    payload: DeploymentLogPayload | null;
  }>({
    error: null,
    isLoading: false,
    isRefreshing: false,
    payload: null,
  });

  const deployment =
    deployments.find((entry) => entry.id === deploymentId) ?? null;
  const emptyState = getLogPanelEmptyState(currentView, Boolean(deploymentId));

  useEffect(() => {
    setActiveLogTab(initialActiveLogTab);
  }, [initialActiveLogTab]);

  useEffect(() => {
    if (!deploymentId) {
      setLogState({
        error: null,
        isLoading: false,
        isRefreshing: false,
        payload: null,
      });
      return;
    }

    setLogState({
      error: null,
      isLoading: true,
      isRefreshing: false,
      payload: null,
    });
  }, [activeLogTab, deploymentId]);

  useEffect(() => {
    let cancelled = false;

    if (!deploymentId || !deployment) {
      return;
    }

    const loadLogs = async () => {
      setLogState((current) => ({
        ...current,
        error: null,
        isLoading: current.payload === null,
        isRefreshing: current.payload !== null,
      }));

      try {
        const response = await fetch(
          `/api/deployments/${deploymentId}/logs?type=${activeLogTab}`,
          { cache: "no-store" },
        );
        const payload = (await response.json()) as
          | DeploymentLogPayload
          | { error?: string };

        if (!response.ok) {
          throw new Error(
            "error" in payload && payload.error
              ? payload.error
              : "Unable to load deployment logs.",
          );
        }

        if (cancelled) {
          return;
        }

        setLogState({
          error: null,
          isLoading: false,
          isRefreshing: false,
          payload: payload as DeploymentLogPayload,
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        setLogState((current) => ({
          ...current,
          error:
            error instanceof Error
              ? error.message
              : "Unable to load deployment logs.",
          isLoading: false,
          isRefreshing: false,
        }));
      }
    };

    void loadLogs();

    return () => {
      cancelled = true;
    };
  }, [activeLogTab, deployment, deploymentId, logRefreshKey]);

  useEffect(() => {
    if (!deploymentId || !deployment || activeLogTab !== "build") {
      return;
    }

    const intervalId = window.setInterval(() => {
      setLogRefreshKey((current) => current + 1);
    }, LOG_REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [activeLogTab, deployment, deploymentId]);

  const logOutput =
    logState.payload?.output ?? "No logs available for this deployment yet.";
  const logLineCount = logOutput.split("\n").length;
  const activeLogLabel =
    activeLogTab === "build" ? "Build tail" : "Container tail";
  const activeLogCommand =
    activeLogTab === "build"
      ? `deployment build output --follow ${deployment?.appName ?? ""}`.trim()
      : `docker logs -f --tail 150 ${deployment?.appName ?? ""}`.trim();

  return (
    <div className="flex h-full min-w-0 flex-col bg-linear-to-b from-background via-muted/10 to-background">
      {showHeader ? (
        <div className="sticky top-0 z-10 border-b border-border/70 bg-linear-to-r from-background via-muted/40 to-background px-3 py-3 shadow-[0_18px_42px_-34px_rgba(15,23,42,0.45)]">
          <div className="flex items-center justify-between gap-3 pl-10">
            <div className="min-w-0">
              <CardTitle className="truncate text-right text-sm sm:text-base">
                Deployment logs
              </CardTitle>
              <div className="text-xs text-muted-foreground">
                {deployment ? deployment.appName : emptyState.title}
              </div>
            </div>

            {deployment ? (
              <Badge variant={formatStatusBadgeVariant(deployment.status)}>
                {formatDeploymentStatus(deployment.status)}
              </Badge>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="shrink-0 border-b border-border/60 px-3 py-3">
        <div className="flex flex-wrap gap-2">
          {[
            {
              icon: "bars" as const,
              label: "Build log",
              value: "build" as const,
            },
            {
              icon: "monitor" as const,
              label: "Container log",
              value: "container" as const,
            },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold tracking-tight transition-all duration-200",
                activeLogTab === option.value
                  ? "border-emerald-200/80 bg-emerald-50/90 text-emerald-700 shadow-sm"
                  : "border-border/60 bg-background/80 text-muted-foreground hover:text-foreground",
              )}
              onClick={() => {
                setActiveLogTab(option.value);
                onLogTabChangeAction?.(option.value);
              }}
            >
              <Icon name={option.icon} className="h-3.5 w-3.5" />
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1 min-w-0 [&>[data-radix-scroll-area-viewport]>div]:block! [&>[data-radix-scroll-area-viewport]>div]:w-full! [&>[data-radix-scroll-area-viewport]>div]:min-w-0">
        <div className="flex min-w-0 flex-col space-y-4 p-3">
          {deployment ? (
            <>
              <div className="w-full rounded-[1.35rem] border border-border/70 bg-linear-to-br from-background/96 via-muted/14 to-background px-4 py-4 shadow-[0_20px_56px_-46px_rgba(15,23,42,0.32)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold tracking-tight text-foreground">
                      {deployment.appName}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {activeLogCommand}
                    </div>
                  </div>
                  <Badge variant={formatStatusBadgeVariant(deployment.status)}>
                    {formatDeploymentStatus(deployment.status)}
                  </Badge>
                </div>
              </div>

              {logState.error ? (
                <div className="w-full rounded-[1.2rem] border border-amber-200/80 bg-amber-50/80 px-3.5 py-3 text-xs text-amber-800 shadow-[0_18px_44px_-40px_rgba(217,119,6,0.35)]">
                  {logState.error}
                </div>
              ) : null}

              <div className="min-w-0 overflow-hidden rounded-[1.35rem] border border-border/70 bg-[#0f1720] shadow-[0_24px_70px_-50px_rgba(15,23,42,0.5)]">
                <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
                  <div className="flex items-center gap-2 text-xs text-slate-300">
                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                    {activeLogLabel}
                  </div>
                  <div className="font-mono text-[11px] text-slate-400">
                    {logState.isLoading
                      ? "Loading..."
                      : `${logLineCount} lines`}
                  </div>
                </div>

                <div className="max-h-[52vh] min-w-0 overflow-y-auto overflow-x-hidden px-4 py-4 font-mono text-[12px] leading-6 text-slate-200">
                  {logState.isLoading ? (
                    <div className="text-slate-400">Loading logs...</div>
                  ) : (
                    <pre className="max-w-full whitespace-pre-wrap wrap-break-word text-slate-100">
                      {logOutput}
                    </pre>
                  )}
                </div>
              </div>

              <div className="w-full space-y-3 rounded-[1.35rem] border border-border/70 bg-background/88 px-4 py-4 shadow-[0_20px_52px_-44px_rgba(15,23,42,0.24)]">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Active context
                </div>
                <div className="grid gap-3">
                  <div className="rounded-[1.2rem] border border-border/60 bg-background/80 px-3 py-3">
                    <div className="text-xs text-muted-foreground">
                      Current view
                    </div>
                    <div className="mt-1 text-sm font-semibold text-foreground">
                      {activeLogTab === "build" ? "Build log" : "Container log"}
                    </div>
                  </div>
                  <div className="rounded-[1.2rem] border border-border/60 bg-background/80 px-3 py-3">
                    <div className="text-xs text-muted-foreground">
                      Last refresh
                    </div>
                    <div className="mt-1 text-sm font-semibold text-foreground">
                      {logState.payload?.updatedAt
                        ? formatRelativeTime(logState.payload.updatedAt)
                        : "Waiting for logs"}
                    </div>
                  </div>
                  <div className="rounded-[1.2rem] border border-border/60 bg-background/80 px-3 py-3">
                    <div className="text-xs text-muted-foreground">
                      Repository
                    </div>
                    <div className="mt-1 text-sm font-semibold text-foreground">
                      {deployment.repositoryName}
                    </div>
                  </div>
                  <div className="rounded-[1.2rem] border border-border/60 bg-background/80 px-3 py-3">
                    <div className="text-xs text-muted-foreground">
                      Updated at
                    </div>
                    <div className="mt-1 text-sm font-semibold text-foreground">
                      {logState.payload?.updatedAt
                        ? formatDeploymentTime(logState.payload.updatedAt)
                        : formatDeploymentTime(deployment.updatedAt)}
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex min-w-0 flex-col space-y-4">
              <div className="w-full rounded-[1.35rem] border border-border/70 bg-linear-to-br from-background/96 via-muted/14 to-background px-4 py-4 shadow-[0_20px_56px_-46px_rgba(15,23,42,0.32)]">
                <div className="text-sm font-semibold tracking-tight text-foreground">
                  {emptyState.title}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Deployment logs will appear here when an app is selected.
                </div>
              </div>

              <div className="min-w-0 overflow-hidden rounded-[1.35rem] border border-border/70 bg-[#0f1720] shadow-[0_24px_70px_-50px_rgba(15,23,42,0.5)]">
                <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
                  <div className="flex items-center gap-2 text-xs text-slate-300">
                    <span className="h-2 w-2 rounded-full bg-slate-400" />
                    Tail preview
                  </div>
                  <div className="font-mono text-[11px] text-slate-400">
                    Idle
                  </div>
                </div>
                <div className="px-4 py-4 font-mono text-[12px] leading-6 text-slate-400">
                  {emptyState.description}
                </div>
              </div>

              <div className="w-full space-y-3 rounded-[1.35rem] border border-border/70 bg-background/88 px-4 py-4 shadow-[0_20px_52px_-44px_rgba(15,23,42,0.24)]">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Active context
                </div>
                <div className="grid gap-3">
                  <div className="rounded-[1.2rem] border border-border/60 bg-background/80 px-3 py-3">
                    <div className="text-xs text-muted-foreground">
                      Current view
                    </div>
                    <div className="mt-1 text-sm font-semibold text-foreground">
                      {currentView === "create" ? "Create app" : "App list"}
                    </div>
                  </div>
                  <div className="rounded-[1.2rem] border border-border/60 bg-background/80 px-3 py-3">
                    <div className="text-xs text-muted-foreground">
                      Selected app
                    </div>
                    <div className="mt-1 text-sm font-semibold text-foreground">
                      None
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
