'use client';

import {
  ArrowClockwise,
  ArrowCounterClockwise,
  ArrowSquareOut,
  ArrowsClockwise,
  GearSix,
  GitCommit,
  Play,
  Plus,
  RocketLaunch,
  SpinnerGap,
  Stop,
  TerminalWindow,
  Trash,
} from '@phosphor-icons/react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { WorkspaceNotice } from '@/components/workspace/workspace-notice';
import {
  formatDevDateTime,
  formatDevRelativeTime,
  getContainerDotClassName,
  getContainerStatusLabel,
  getDevStatusLabel,
  getDevStatusVariant,
} from '@/lib/dev-format';
import { getDevDeploymentPreviewUrl } from '@/lib/dev-preview';
import type { DevContainerState, DevDeployment, DevProject } from '@/lib/dev-types';
import type { DevDeploymentAction } from '@/lib/dev-validation';
import { cn } from '@/lib/utils';

type DevDeploymentsContentProps = {
  baseDomain: string;
  containerStates: Record<string, DevContainerState>;
  deployments: DevDeployment[];
  onActionAction: (action: DevDeploymentAction, deploymentId: string) => void;
  onDeployLatestAction: () => void;
  onOpenCommitsAction: () => void;
  onOpenSettingsAction: () => void;
  onSelectDeploymentAction: (deploymentId: string) => void;
  onSyncAction: () => void;
  pendingActionKey: string | null;
  previewProtocol: 'http' | 'https';
  project: DevProject;
};

function getPendingKey(deploymentId: string, action: DevDeploymentAction) {
  return `${deploymentId}:${action}`;
}

function ActionButton({
  action,
  deployment,
  icon,
  label,
  onClickAction,
  pendingActionKey,
}: {
  action: DevDeploymentAction;
  deployment: DevDeployment;
  icon: React.ReactNode;
  label: string;
  onClickAction: (action: DevDeploymentAction, deploymentId: string) => void;
  pendingActionKey: string | null;
}) {
  const pending = pendingActionKey === getPendingKey(deployment.id, action);

  return (
    <Button
      aria-label={label}
      className="size-7 rounded-[6px] p-0"
      disabled={pendingActionKey !== null && pendingActionKey.startsWith(`${deployment.id}:`)}
      onClick={() => onClickAction(action, deployment.id)}
      size="icon"
      title={label}
      type="button"
      variant="ghost"
    >
      {pending ? <SpinnerGap aria-hidden="true" className="size-3.5 animate-spin" /> : icon}
    </Button>
  );
}

export function DevDeploymentsContent({
  baseDomain,
  containerStates,
  deployments,
  onActionAction,
  onDeployLatestAction,
  onOpenCommitsAction,
  onOpenSettingsAction,
  onSelectDeploymentAction,
  onSyncAction,
  pendingActionKey,
  previewProtocol,
  project,
}: DevDeploymentsContentProps) {
  const runningCount = deployments.filter((deployment) => deployment.status === 'running').length;
  const buildingCount = deployments.filter(
    (deployment) => deployment.status === 'queued' || deployment.status === 'building'
  ).length;
  const failedCount = deployments.filter((deployment) => deployment.status === 'failed').length;
  const isProjectPending = pendingActionKey?.startsWith('project:') ?? false;

  return (
    <div className="vercelab-page space-y-4">
      <section className="relative overflow-hidden rounded-[10px] border border-blue-200 bg-white px-4 py-3 shadow-[var(--shadow)] before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-[var(--blue)] max-[760px]:px-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-[8px] bg-[var(--blue-soft)] text-[var(--blue)]">
              <RocketLaunch aria-hidden="true" className="size-4" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[15px] font-semibold tracking-tight">{project.appName}</h2>
                <Badge variant={project.autoDeploy ? 'success' : 'outline'}>
                  {project.autoDeploy ? 'Auto deploy' : 'Manual'}
                </Badge>
                <Badge variant="secondary">{project.branch}</Badge>
              </div>
              <p className="mt-1 truncate font-mono text-[10px] text-[var(--quiet)]">
                <a
                  className="hover:text-[var(--blue)] hover:underline"
                  href={`https://github.com/${project.repositoryOwner}/${project.repositoryName}`}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {project.repositoryOwner}/{project.repositoryName}
                </a>
                {' · '}
                preview prefix <span className="text-foreground">{project.appSlug}</span>
                {' · '}
                port {project.port}
              </p>
              <p className="mt-1 text-[10px] text-[var(--quiet)]">
                Last sync {formatDevRelativeTime(project.lastPolledAt)}
                {project.lastSeenSha ? ` · head ${project.lastSeenSha.slice(0, 7)}` : ''}
                {' · '}
                Dockerfile {project.dockerfilePath}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              disabled={isProjectPending}
              onClick={onSyncAction}
              type="button"
              variant="secondary"
            >
              {pendingActionKey === 'project:sync' ? (
                <SpinnerGap aria-hidden="true" className="size-3.5 animate-spin" />
              ) : (
                <ArrowsClockwise aria-hidden="true" className="size-3.5" />
              )}
              Sync now
            </Button>
            <Button
              className="border-[var(--blue)] bg-[var(--blue)] text-white shadow-none hover:bg-[#0d55bc]"
              disabled={isProjectPending}
              onClick={onDeployLatestAction}
              type="button"
            >
              {pendingActionKey === 'project:deploy' ? (
                <SpinnerGap aria-hidden="true" className="size-3.5 animate-spin" />
              ) : (
                <RocketLaunch aria-hidden="true" className="size-3.5" />
              )}
              Deploy latest
            </Button>
            <Button
              disabled={isProjectPending}
              onClick={onOpenCommitsAction}
              type="button"
              variant="secondary"
            >
              <GitCommit aria-hidden="true" className="size-3.5" />
              Deploy commit
            </Button>
            <Button
              aria-label="Project settings"
              className="size-8 rounded-[7px] p-0"
              onClick={onOpenSettingsAction}
              size="icon"
              title="Project settings"
              type="button"
              variant="secondary"
            >
              <GearSix aria-hidden="true" className="size-4" />
            </Button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[var(--hairline)] pt-3 sm:grid-cols-4">
          {[
            { label: 'Previews', value: deployments.length, tone: 'text-foreground' },
            { label: 'Running', value: runningCount, tone: 'text-[var(--green)]' },
            { label: 'Building', value: buildingCount, tone: 'text-[var(--warning-ink)]' },
            { label: 'Failed', value: failedCount, tone: 'text-[var(--red)]' },
          ].map((stat) => (
            <div
              className="rounded-[7px] bg-[var(--surface-subtle)] px-2.5 py-1.5"
              key={stat.label}
            >
              <div className="font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--quiet)]">
                {stat.label}
              </div>
              <div className={cn('text-[14px] font-semibold', stat.tone)}>{stat.value}</div>
            </div>
          ))}
        </div>
      </section>

      {project.lastPollError ? (
        <WorkspaceNotice>
          GitHub sync warning: {project.lastPollError} Polling will retry automatically.
        </WorkspaceNotice>
      ) : null}

      <section
        aria-labelledby="dev-deployments-title"
        className="overflow-hidden rounded-[10px] border border-[var(--hairline)] bg-white shadow-[var(--shadow)]"
      >
        <header className="flex min-h-14 flex-wrap items-center justify-between gap-2 border-b border-[var(--hairline)] px-3 py-2.5">
          <div>
            <h2 className="text-[13px] font-semibold" id="dev-deployments-title">
              Preview deployments
            </h2>
            <p className="mt-1 font-mono text-[10px] text-[var(--quiet)]">
              Every commit gets its own container and URL.
            </p>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-[var(--quiet)]">
            {buildingCount > 0 ? (
              <span className="inline-flex items-center gap-1.5">
                <SpinnerGap aria-hidden="true" className="size-3 animate-spin" />
                {buildingCount} building
              </span>
            ) : null}
            <span>Keep every preview or set a retention limit in settings.</span>
          </div>
        </header>

        {deployments.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-[var(--blue-soft)] text-[var(--blue)]">
              <GitCommit aria-hidden="true" className="size-5" />
            </div>
            <h3 className="mt-3 text-[13px] font-semibold">No preview deployments yet</h3>
            <p className="mx-auto mt-1 max-w-md text-[11px] leading-5 text-[var(--quiet)]">
              Push a commit to <span className="font-mono">{project.branch}</span> or deploy the
              latest commit now. Each commit produces an isolated container.
            </p>
            <Button className="mt-4" onClick={onDeployLatestAction} type="button">
              <Plus aria-hidden="true" className="size-3.5" />
              Deploy latest commit
            </Button>
          </div>
        ) : (
          <div>
            <div className="hidden grid-cols-[minmax(0,1fr)_9rem_12rem_8.5rem] gap-3 border-b border-[var(--hairline)] bg-[var(--surface-subtle)] px-3 py-2 font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--quiet)] lg:grid">
              <span>Commit</span>
              <span>Status</span>
              <span>Preview URL</span>
              <span className="text-right">Actions</span>
            </div>

            <div className="divide-y divide-[var(--hairline)]">
              {deployments.map((deployment) => {
                const containerState = containerStates[deployment.id] ?? null;
                const previewUrl = getDevDeploymentPreviewUrl(
                  deployment,
                  baseDomain,
                  previewProtocol
                );
                const isBuilding =
                  deployment.status === 'queued' || deployment.status === 'building';
                const isRunning = deployment.status === 'running';
                const isStopped = deployment.status === 'stopped';
                const isFailed = deployment.status === 'failed';

                return (
                  <div
                    className="grid grid-cols-1 gap-2 px-3 py-3 transition-colors hover:bg-[color-mix(in_srgb,var(--surface-subtle)_55%,white)] lg:grid-cols-[minmax(0,1fr)_9rem_12rem_8.5rem] lg:items-center lg:gap-3"
                    key={deployment.id}
                  >
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <Button
                          className="h-6 rounded-[5px] px-1.5 font-mono text-[10px]"
                          onClick={() => onSelectDeploymentAction(deployment.id)}
                          size="xs"
                          title="Open preview details"
                          type="button"
                          variant="secondary"
                        >
                          {deployment.shortSha}
                        </Button>
                        <p
                          className="min-w-0 truncate text-[12px] font-medium"
                          title={deployment.commitMessage ?? undefined}
                        >
                          {deployment.commitMessage ?? 'Commit'}
                        </p>
                      </div>
                      <p className="mt-1 truncate text-[10px] text-[var(--quiet)]">
                        {deployment.commitAuthor ?? 'Unknown author'}
                        {' · '}
                        <span title={formatDevDateTime(deployment.committedAt)}>
                          {formatDevRelativeTime(deployment.committedAt)}
                        </span>
                        {deployment.commitUrl ? (
                          <>
                            {' · '}
                            <a
                              className="hover:text-[var(--blue)] hover:underline"
                              href={deployment.commitUrl}
                              rel="noopener noreferrer"
                              target="_blank"
                            >
                              View commit
                            </a>
                          </>
                        ) : null}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={getDevStatusVariant(deployment.status)}>
                        {isBuilding ? (
                          <SpinnerGap aria-hidden="true" className="mr-1 size-2.5 animate-spin" />
                        ) : null}
                        {getDevStatusLabel(deployment.status)}
                      </Badge>
                      <span
                        className="inline-flex min-w-0 items-center gap-1 text-[10px] text-[var(--quiet)]"
                        title={
                          containerState?.statusText ?? getContainerStatusLabel(containerState)
                        }
                      >
                        <span
                          aria-hidden="true"
                          className={cn(
                            'size-1.5 shrink-0 rounded-full',
                            getContainerDotClassName(containerState)
                          )}
                        />
                        <span className="truncate">
                          {isBuilding
                            ? 'Container pending'
                            : getContainerStatusLabel(containerState)}
                        </span>
                      </span>
                    </div>

                    <div className="min-w-0">
                      <a
                        className="inline-flex max-w-full items-center gap-1 truncate font-mono text-[10px] text-[var(--blue)] hover:underline"
                        href={previewUrl}
                        rel="noopener noreferrer"
                        target="_blank"
                        title={previewUrl}
                      >
                        <span className="truncate">{previewUrl.replace(/^https?:\/\//, '')}</span>
                        <ArrowSquareOut aria-hidden="true" className="size-3 shrink-0" />
                      </a>
                    </div>

                    <div className="flex items-center gap-0.5 lg:justify-end">
                      <Button
                        aria-label={`Open preview for ${deployment.shortSha}`}
                        className="size-7 rounded-[6px] p-0"
                        disabled={!isRunning}
                        onClick={() => window.open(previewUrl, '_blank', 'noopener,noreferrer')}
                        size="icon"
                        title="Open preview"
                        type="button"
                        variant="ghost"
                      >
                        <Play aria-hidden="true" className="size-3.5" />
                      </Button>
                      <Button
                        aria-label={`View logs for ${deployment.shortSha}`}
                        className="size-7 rounded-[6px] p-0"
                        onClick={() => onSelectDeploymentAction(deployment.id)}
                        size="icon"
                        title="View build and container logs"
                        type="button"
                        variant="ghost"
                      >
                        <TerminalWindow aria-hidden="true" className="size-3.5" />
                      </Button>

                      {isRunning ? (
                        <>
                          <ActionButton
                            action="restart"
                            deployment={deployment}
                            icon={<ArrowClockwise aria-hidden="true" className="size-3.5" />}
                            label="Restart preview"
                            onClickAction={onActionAction}
                            pendingActionKey={pendingActionKey}
                          />
                          <ActionButton
                            action="stop"
                            deployment={deployment}
                            icon={<Stop aria-hidden="true" className="size-3.5" />}
                            label="Stop preview"
                            onClickAction={onActionAction}
                            pendingActionKey={pendingActionKey}
                          />
                        </>
                      ) : null}

                      {isStopped ? (
                        <>
                          <ActionButton
                            action="start"
                            deployment={deployment}
                            icon={<Play aria-hidden="true" className="size-3.5" />}
                            label="Start preview"
                            onClickAction={onActionAction}
                            pendingActionKey={pendingActionKey}
                          />
                          <ActionButton
                            action="retry"
                            deployment={deployment}
                            icon={<ArrowCounterClockwise aria-hidden="true" className="size-3.5" />}
                            label="Rebuild preview"
                            onClickAction={onActionAction}
                            pendingActionKey={pendingActionKey}
                          />
                        </>
                      ) : null}

                      {isFailed ? (
                        <ActionButton
                          action="retry"
                          deployment={deployment}
                          icon={<ArrowCounterClockwise aria-hidden="true" className="size-3.5" />}
                          label="Retry preview build"
                          onClickAction={onActionAction}
                          pendingActionKey={pendingActionKey}
                        />
                      ) : null}

                      {!isBuilding ? (
                        <ActionButton
                          action="delete"
                          deployment={deployment}
                          icon={<Trash aria-hidden="true" className="size-3.5" />}
                          label="Delete preview"
                          onClickAction={onActionAction}
                          pendingActionKey={pendingActionKey}
                        />
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
