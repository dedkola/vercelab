'use client';

import { useEffect, useState } from 'react';

import { WorkspaceNotice } from '@/components/workspace/workspace-notice';
import { Icon } from '@/components/dashboard-kit';
import { Badge } from '@/components/ui/badge';
import { CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { DeploymentSummary } from '@/lib/persistence';
import { cn } from '@/lib/utils';

export type LogTab = 'build' | 'container';

type GitLogPanelProps = {
  currentView: 'list' | 'detail' | 'create';
  deploymentId: string | null;
  deployments: DeploymentSummary[];
  initialActiveLogTab: LogTab;
  onLogTabChangeAction?: (tab: LogTab) => void;
  showHeader?: boolean;
};

type DeploymentLogPayload = {
  type: 'build' | 'container';
  deploymentId: string;
  appName: string;
  summary: string;
  output: string;
  status: string;
  updatedAt: string;
};

const LOG_REFRESH_INTERVAL_MS = 2000;

function formatDeploymentStatus(status: DeploymentSummary['status']) {
  switch (status) {
    case 'deploying':
      return 'Deploying';
    case 'running':
      return 'Running';
    case 'failed':
      return 'Failed';
    case 'stopped':
      return 'Stopped';
    case 'removing':
      return 'Removing';
    default:
      return status;
  }
}

function formatStatusBadgeVariant(
  status: DeploymentSummary['status']
): 'default' | 'success' | 'destructive' | 'warning' | 'info' {
  switch (status) {
    case 'deploying':
      return 'info';
    case 'running':
      return 'success';
    case 'failed':
      return 'destructive';
    case 'stopped':
      return 'default';
    case 'removing':
      return 'warning';
    default:
      return 'default';
  }
}

function getLogPanelEmptyState(
  currentView: GitLogPanelProps['currentView'],
  hasPendingDeployment: boolean
) {
  if (hasPendingDeployment) {
    return {
      description:
        'The selected deployment is still being resolved. Logs will appear here as soon as the workspace is ready.',
      title: 'Preparing logs',
    };
  }

  if (currentView === 'create') {
    return {
      description: 'Deploy an app to start streaming build and container output in this sidebar.',
      title: 'Logs are idle',
    };
  }

  return {
    description:
      'Select an app from the list to inspect build and container logs without leaving the dashboard shell.',
    title: 'No app selected',
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

  const deployment = deployments.find((entry) => entry.id === deploymentId) ?? null;
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
        const response = await fetch(`/api/deployments/${deploymentId}/logs?type=${activeLogTab}`, {
          cache: 'no-store',
        });
        const payload = (await response.json()) as DeploymentLogPayload | { error?: string };

        if (!response.ok) {
          throw new Error(
            'error' in payload && payload.error ? payload.error : 'Unable to load deployment logs.'
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
          error: error instanceof Error ? error.message : 'Unable to load deployment logs.',
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
    if (!deploymentId || !deployment || activeLogTab !== 'build') {
      return;
    }

    const intervalId = window.setInterval(() => {
      setLogRefreshKey((current) => current + 1);
    }, LOG_REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [activeLogTab, deployment, deploymentId]);

  const logOutput = logState.payload?.output ?? 'No logs available for this deployment yet.';
  const logLineCount = logOutput.split('\n').length;
  const activeLogLabel = activeLogTab === 'build' ? 'Build tail' : 'Container tail';
  const activeLogCommand =
    activeLogTab === 'build'
      ? `deployment build output --follow ${deployment?.appName ?? ''}`.trim()
      : `docker logs -f --tail 150 ${deployment?.appName ?? ''}`.trim();

  return (
    <div className="flex h-full min-w-0 flex-col bg-[var(--surface)]">
      {showHeader ? (
        <div className="sticky top-0 z-10 border-b border-border/70 bg-[var(--surface)] px-3 py-3 ">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="truncate text-[12px]">Deployment logs</CardTitle>
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
              icon: 'bars' as const,
              label: 'Build log',
              value: 'build' as const,
            },
            {
              icon: 'monitor' as const,
              label: 'Container log',
              value: 'container' as const,
            },
          ].map((option) => (
            <button
              aria-pressed={activeLogTab === option.value}
              key={option.value}
              type="button"
              className={cn(
                'inline-flex items-center gap-2 rounded-[6px] border px-3 py-1.5 text-[11px] font-medium transition-colors',
                activeLogTab === option.value
                  ? 'border-[var(--blue)]/20 bg-[var(--blue-soft)] text-[var(--blue)]'
                  : 'border-border/60 bg-background/80 text-muted-foreground hover:text-foreground'
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
        <div className="flex min-w-0 flex-col space-y-3 p-3">
          {deployment ? (
            <>
              <div className="min-w-0 w-full rounded-[8px] border border-border bg-[var(--surface-subtle)] px-3 py-3">
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="break-words text-[12px] font-semibold text-foreground">
                      {deployment.appName}
                    </div>
                    <div className="break-all font-mono text-[10px] text-muted-foreground">
                      {activeLogCommand}
                    </div>
                  </div>
                  <Badge variant={formatStatusBadgeVariant(deployment.status)}>
                    {formatDeploymentStatus(deployment.status)}
                  </Badge>
                </div>
              </div>

              {logState.error ? <WorkspaceNotice>{logState.error}</WorkspaceNotice> : null}

              <div className="min-w-0 overflow-hidden rounded-[8px] border border-border bg-[var(--surface-subtle)]">
                <div className="flex items-center justify-between border-b border-[var(--hairline)] px-4 py-3">
                  <div className="flex items-center gap-2 text-xs text-[var(--muted-ink)]">
                    <span className="h-2 w-2 rounded-full bg-[var(--green)]" />
                    {activeLogLabel}
                  </div>
                  <div className="font-mono text-[11px] text-[var(--quiet)]">
                    {logState.isLoading ? 'Loading...' : `${logLineCount} lines`}
                  </div>
                </div>

                <div className="max-h-[52vh] min-w-0 overflow-y-auto overflow-x-hidden px-4 py-4 font-mono text-[11px] leading-5 text-[var(--ink)]">
                  {logState.isLoading ? (
                    <div className="text-[var(--quiet)]">Loading logs...</div>
                  ) : (
                    <pre className="max-w-full whitespace-pre-wrap [overflow-wrap:anywhere] text-[var(--ink)]">
                      {logOutput}
                    </pre>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex min-w-0 flex-col space-y-3">
              <div className="w-full rounded-xl border border-border/70 bg-background px-3 py-3 shadow-sm">
                <div className="break-words text-[12px] font-semibold text-foreground">
                  {emptyState.title}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Deployment logs will appear here when an app is selected.
                </div>
              </div>

              <div className="min-w-0 overflow-hidden rounded-xl border border-border/70 bg-[var(--surface-subtle)] shadow-sm">
                <div className="flex items-center justify-between border-b border-[var(--hairline)] px-3 py-2">
                  <div className="flex items-center gap-2 text-xs text-[var(--muted-ink)]">
                    <span className="h-2 w-2 rounded-full bg-slate-400" />
                    Tail preview
                  </div>
                  <div className="font-mono text-[11px] text-[var(--quiet)]">Idle</div>
                </div>
                <div className="px-3 py-3 font-mono text-[12px] leading-5 text-[var(--quiet)]">
                  {emptyState.description}
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
