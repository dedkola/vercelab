'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowClockwise,
  ArrowCounterClockwise,
  ArrowSquareOut,
  GitCommit,
  Play,
  SpinnerGap,
  Stop,
  TerminalWindow,
  Trash,
} from '@phosphor-icons/react';

import { WorkspaceDialog } from '@/components/workspace/workspace-dialog';
import { WorkspaceTabs } from '@/components/workspace/workspace-tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  formatDevDateTime,
  getContainerDotClassName,
  getContainerStatusLabel,
  getDevStatusLabel,
  getDevStatusVariant,
} from '@/lib/dev-format';
import { getDevDeploymentPreviewUrl } from '@/lib/dev-preview';
import type {
  DevContainerState,
  DevDeployment,
  DevDeploymentLogPayload,
  DevProject,
} from '@/lib/dev-types';
import type { DevDeploymentAction } from '@/lib/dev-validation';
import { cn } from '@/lib/utils';

type DetailTab = 'build' | 'container' | 'details';

type DevDeploymentDetailProps = {
  baseDomain: string;
  containerState: DevContainerState | null;
  deployment: DevDeployment;
  onActionAction: (action: DevDeploymentAction, deploymentId: string) => void;
  onCloseAction: () => void;
  pendingActionKey: string | null;
  previewProtocol: 'http' | 'https';
  project: DevProject;
};

function useDevLog(
  deploymentId: string,
  type: 'build' | 'container',
  enabled: boolean,
  pollIntervalMs: number
) {
  const [payload, setPayload] = useState<DevDeploymentLogPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => {
    setRefreshKey((current) => current + 1);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setPayload(null);
      setError(null);
      return;
    }

    let cancelled = false;
    let timer: number | null = null;

    const load = async () => {
      setIsLoading(true);

      try {
        const response = await fetch(`/api/dev/deployments/${deploymentId}/logs?type=${type}`, {
          cache: 'no-store',
        });
        const body = (await response.json()) as DevDeploymentLogPayload | { error?: string };

        if (!response.ok) {
          throw new Error(
            'error' in body && body.error ? body.error : 'Unable to load preview logs.'
          );
        }

        if (cancelled) {
          return;
        }

        setPayload(body as DevDeploymentLogPayload);
        setError(null);
      } catch (loadError) {
        if (cancelled) {
          return;
        }

        setError(loadError instanceof Error ? loadError.message : 'Unable to load preview logs.');
      } finally {
        if (!cancelled) {
          setIsLoading(false);

          if (pollIntervalMs > 0) {
            timer = window.setTimeout(() => void load(), pollIntervalMs);
          }
        }
      }
    };

    void load();

    return () => {
      cancelled = true;

      if (timer !== null) {
        window.clearTimeout(timer);
      }
    };
  }, [deploymentId, enabled, pollIntervalMs, refreshKey, type]);

  return {
    error,
    isLoading,
    payload,
    refresh,
  };
}

function ActionButton({
  action,
  children,
  deployment,
  label,
  onActionAction,
  pendingActionKey,
  variant = 'secondary',
}: {
  action: DevDeploymentAction;
  children: React.ReactNode;
  deployment: DevDeployment;
  label: string;
  onActionAction: (action: DevDeploymentAction, deploymentId: string) => void;
  pendingActionKey: string | null;
  variant?: 'secondary' | 'danger' | 'ghost';
}) {
  const pending = pendingActionKey === `${deployment.id}:${action}`;

  return (
    <Button
      aria-label={label}
      disabled={pendingActionKey !== null && pendingActionKey.startsWith(`${deployment.id}:`)}
      onClick={() => onActionAction(action, deployment.id)}
      type="button"
      variant={variant}
    >
      {pending ? <SpinnerGap aria-hidden="true" className="size-3.5 animate-spin" /> : children}
    </Button>
  );
}

export function DevDeploymentDetail({
  baseDomain,
  containerState,
  deployment,
  onActionAction,
  onCloseAction,
  pendingActionKey,
  previewProtocol,
  project,
}: DevDeploymentDetailProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>('build');
  const previewUrl = getDevDeploymentPreviewUrl(deployment, baseDomain, previewProtocol);
  const isBuilding = deployment.status === 'queued' || deployment.status === 'building';
  const isRunning = deployment.status === 'running';
  const isStopped = deployment.status === 'stopped';
  const isFailed = deployment.status === 'failed';
  const buildPollInterval = isBuilding ? 2000 : 0;
  const containerPollInterval = isRunning ? 5000 : 0;
  const buildLog = useDevLog(deployment.id, 'build', activeTab === 'build', buildPollInterval);
  const containerLog = useDevLog(
    deployment.id,
    'container',
    activeTab === 'container',
    containerPollInterval
  );
  const activeLog = activeTab === 'build' ? buildLog : containerLog;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const activeLogOutput = activeLog.payload?.output ?? '';
  const tabItems = useMemo(
    () => [
      { label: 'Build log', value: 'build' as const },
      { label: 'Container log', value: 'container' as const },
      { label: 'Details', value: 'details' as const },
    ],
    []
  );

  useEffect(() => {
    if (activeTab === 'details') {
      return;
    }

    const container = scrollRef.current;

    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [activeLogOutput, activeTab]);

  return (
    <WorkspaceDialog
      onCloseAction={onCloseAction}
      title={`Preview ${deployment.shortSha}`}
      variant="drawer"
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="border-b border-[var(--hairline)] px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[15px] font-semibold tracking-tight">{deployment.shortSha}</h2>
                <Badge variant={getDevStatusVariant(deployment.status)}>
                  {isBuilding ? (
                    <SpinnerGap aria-hidden="true" className="mr-1 size-2.5 animate-spin" />
                  ) : null}
                  {getDevStatusLabel(deployment.status)}
                </Badge>
                {deployment.pullRequestNumber ? (
                  <a
                    className="rounded-[4px] border border-[var(--hairline)] px-1.5 py-0.5 font-mono text-[9px] font-medium text-[var(--quiet)] transition-colors hover:border-[var(--blue)] hover:text-[var(--blue)]"
                    href={`https://github.com/${project.repositoryOwner}/${project.repositoryName}/pull/${deployment.pullRequestNumber}`}
                    rel="noopener noreferrer"
                    target="_blank"
                    title={deployment.pullRequestTitle ?? undefined}
                  >
                    PR #{deployment.pullRequestNumber}
                  </a>
                ) : null}
                <span className="inline-flex items-center gap-1 text-[10px] text-[var(--quiet)]">
                  <span
                    aria-hidden="true"
                    className={cn(
                      'size-1.5 rounded-full',
                      getContainerDotClassName(containerState)
                    )}
                  />
                  {isBuilding ? 'Container pending' : getContainerStatusLabel(containerState)}
                </span>
              </div>
              <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-muted-foreground">
                {deployment.commitMessage ?? 'Commit'}
              </p>
              <p className="mt-1 text-[10px] text-[var(--quiet)]">
                {project.appName} · {project.repositoryOwner}/{project.repositoryName} ·{' '}
                {deployment.branch}
              </p>
            </div>
            <button
              aria-label="Close preview details"
              className="text-[var(--quiet)] hover:text-foreground"
              onClick={onCloseAction}
              type="button"
            >
              ×
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <a
              className="inline-flex h-8 max-w-full items-center gap-1.5 rounded-[7px] border border-border bg-secondary px-3 text-[11px] font-medium hover:bg-muted"
              href={previewUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              <ArrowSquareOut aria-hidden="true" className="size-3.5 shrink-0" />
              <span className="truncate">{previewUrl.replace(/^https?:\/\//, '')}</span>
            </a>
            {deployment.commitUrl ? (
              <a
                className="inline-flex h-8 items-center gap-1.5 rounded-[7px] border border-border bg-secondary px-3 text-[11px] font-medium hover:bg-muted"
                href={deployment.commitUrl}
                rel="noopener noreferrer"
                target="_blank"
              >
                <GitCommit aria-hidden="true" className="size-3.5" />
                Commit
              </a>
            ) : null}

            {isRunning ? (
              <>
                <ActionButton
                  action="restart"
                  deployment={deployment}
                  label="Restart preview"
                  onActionAction={onActionAction}
                  pendingActionKey={pendingActionKey}
                >
                  <ArrowClockwise aria-hidden="true" className="size-3.5" />
                  Restart
                </ActionButton>
                <ActionButton
                  action="stop"
                  deployment={deployment}
                  label="Stop preview"
                  onActionAction={onActionAction}
                  pendingActionKey={pendingActionKey}
                >
                  <Stop aria-hidden="true" className="size-3.5" />
                  Stop
                </ActionButton>
              </>
            ) : null}

            {isStopped ? (
              <>
                <ActionButton
                  action="start"
                  deployment={deployment}
                  label="Start preview"
                  onActionAction={onActionAction}
                  pendingActionKey={pendingActionKey}
                >
                  <Play aria-hidden="true" className="size-3.5" />
                  Start
                </ActionButton>
                <ActionButton
                  action="retry"
                  deployment={deployment}
                  label="Rebuild preview"
                  onActionAction={onActionAction}
                  pendingActionKey={pendingActionKey}
                >
                  <ArrowCounterClockwise aria-hidden="true" className="size-3.5" />
                  Rebuild
                </ActionButton>
              </>
            ) : null}

            {isFailed ? (
              <ActionButton
                action="retry"
                deployment={deployment}
                label="Retry preview build"
                onActionAction={onActionAction}
                pendingActionKey={pendingActionKey}
              >
                <ArrowCounterClockwise aria-hidden="true" className="size-3.5" />
                Retry build
              </ActionButton>
            ) : null}

            {!isBuilding ? (
              <ActionButton
                action="delete"
                deployment={deployment}
                label="Delete preview"
                onActionAction={onActionAction}
                pendingActionKey={pendingActionKey}
                variant="danger"
              >
                <Trash aria-hidden="true" className="size-3.5" />
                Delete
              </ActionButton>
            ) : null}
          </div>
        </header>

        <WorkspaceTabs
          id="dev-deployment-detail"
          label="Preview deployment details"
          onChange={setActiveTab}
          tabs={tabItems}
          value={activeTab}
        />

        {activeTab === 'details' ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <dl className="space-y-3 text-[11px]">
              {[
                ['Commit', deployment.commitSha],
                ['Branch', deployment.branch],
                ['Author', deployment.commitAuthor ?? 'Unknown'],
                ['Committed', formatDevDateTime(deployment.committedAt)],
                ['Created', formatDevDateTime(deployment.createdAt)],
                ['Deployed', formatDevDateTime(deployment.deployedAt)],
                [
                  'Duration',
                  deployment.buildStartedAt && deployment.buildFinishedAt
                    ? `${Math.max(0, Math.round((new Date(deployment.buildFinishedAt).getTime() - new Date(deployment.buildStartedAt).getTime()) / 1000))}s`
                    : '—',
                ],
                ['Preview URL', previewUrl],
                ['Container', deployment.containerName],
                ['Container id', containerState?.containerId ?? deployment.containerId ?? '—'],
                [
                  'Container state',
                  containerState?.statusText ?? getContainerStatusLabel(containerState),
                ],
                ['Image', deployment.imageTag],
                ['Dockerfile', deployment.dockerfilePath],
                ['Build context', deployment.buildContext],
                ['Port', String(deployment.port)],
                [
                  'Retention',
                  project.retentionLimit === 0
                    ? 'Keep all previews'
                    : `Keep last ${project.retentionLimit}`,
                ],
              ].map(([label, value]) => (
                <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3" key={label}>
                  <dt className="text-[var(--quiet)]">{label}</dt>
                  <dd className="break-all font-mono text-[10px] text-foreground">{value}</dd>
                </div>
              ))}
            </dl>

            {deployment.lastOutput ? (
              <div className="mt-5">
                <h3 className="text-[11px] font-semibold">Last output</h3>
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-[7px] border border-[var(--hairline)] bg-[var(--surface-subtle)] p-3 font-mono text-[10px] leading-5">
                  {deployment.lastOutput}
                </pre>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center justify-between gap-2 border-b border-[var(--hairline)] px-4 py-2">
              <div className="flex items-center gap-2 text-[10px] text-[var(--quiet)]">
                <TerminalWindow aria-hidden="true" className="size-3.5" />
                {activeTab === 'build' ? 'Build worker output' : 'Live container output'}
                {activeLog.isLoading ? (
                  <SpinnerGap aria-hidden="true" className="size-3 animate-spin" />
                ) : null}
              </div>
              <Button onClick={activeLog.refresh} size="xs" type="button" variant="secondary">
                <ArrowClockwise aria-hidden="true" className="size-3" />
                Refresh
              </Button>
            </div>

            {activeLog.error ? (
              <div className="px-4 py-3 text-[11px] text-[var(--red)]">{activeLog.error}</div>
            ) : null}

            <div className="min-h-0 flex-1 overflow-auto p-4" ref={scrollRef}>
              <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-[var(--ink)]">
                {activeLog.payload?.output ?? 'Loading logs…'}
              </pre>
            </div>
          </div>
        )}
      </div>
    </WorkspaceDialog>
  );
}
