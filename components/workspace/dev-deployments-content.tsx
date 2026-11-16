'use client';

import { useEffect, useRef } from 'react';
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
  X,
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
import { getDevDeploymentPreviewUrl, selectStaleDeployments } from '@/lib/dev-preview';
import type { DevContainerState, DevDeployment, DevProject } from '@/lib/dev-types';
import type { DevDeploymentAction } from '@/lib/dev-validation';
import { cn } from '@/lib/utils';

type DevDeploymentsContentProps = {
  baseDomain: string;
  containerStates: Record<string, DevContainerState>;
  deployments: DevDeployment[];
  isBulkActionPending: boolean;
  isDeletingDeployment: boolean;
  onActionAction: (action: DevDeploymentAction, deploymentId: string) => void;
  onClearSelectionAction: () => void;
  onDeleteOldAction: () => void;
  onDeleteSelectedAction: () => void;
  onDeployLatestAction: () => void;
  onOpenCommitsAction: () => void;
  onOpenSettingsAction: () => void;
  onRedeploySelectedAction: () => void;
  onSelectDeploymentAction: (deploymentId: string) => void;
  onSyncAction: () => void;
  onToggleAllSelectionAction: () => void;
  onToggleDeploymentSelectionAction: (deploymentId: string) => void;
  pendingActionKey: string | null;
  previewProtocol: 'http' | 'https';
  project: DevProject;
  selectedDeploymentIds: ReadonlySet<string>;
};

function getPendingKey(deploymentId: string, action: DevDeploymentAction) {
  return `${deploymentId}:${action}`;
}

function isDeploymentBuilding(deployment: DevDeployment) {
  return deployment.status === 'queued' || deployment.status === 'building';
}

function SelectionCheckbox({
  ariaLabel,
  checked,
  indeterminate = false,
  onChange,
}: {
  ariaLabel: string;
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  return (
    <input
      aria-label={ariaLabel}
      checked={checked}
      className="size-3.5 shrink-0 cursor-pointer rounded-[3px] accent-[var(--blue)]"
      onChange={onChange}
      ref={inputRef}
      type="checkbox"
    />
  );
}

function ActionButton({
  action,
  danger = false,
  deployment,
  icon,
  label,
  onClickAction,
  pendingActionKey,
}: {
  action: DevDeploymentAction;
  danger?: boolean;
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
      className={cn('size-7 rounded-[6px] p-0', danger && 'hover:text-destructive')}
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
  isBulkActionPending,
  isDeletingDeployment,
  onActionAction,
  onClearSelectionAction,
  onDeleteOldAction,
  onDeleteSelectedAction,
  onDeployLatestAction,
  onOpenCommitsAction,
  onOpenSettingsAction,
  onRedeploySelectedAction,
  onSelectDeploymentAction,
  onSyncAction,
  onToggleAllSelectionAction,
  onToggleDeploymentSelectionAction,
  pendingActionKey,
  previewProtocol,
  project,
  selectedDeploymentIds,
}: DevDeploymentsContentProps) {
  const runningCount = deployments.filter((deployment) => deployment.status === 'running').length;
  const buildingCount = deployments.filter(isDeploymentBuilding).length;
  const failedCount = deployments.filter((deployment) => deployment.status === 'failed').length;
  const isProjectPending = pendingActionKey?.startsWith('project:') ?? false;
  const selectedDeployments = deployments.filter((deployment) =>
    selectedDeploymentIds.has(deployment.id)
  );
  const selectedCount = selectedDeployments.length;
  const selectedBuildingCount = selectedDeployments.filter(isDeploymentBuilding).length;
  const allSelected = deployments.length > 0 && selectedCount === deployments.length;
  const someSelected = selectedCount > 0 && !allSelected;
  const staleDeployments = selectStaleDeployments(deployments, project.branch);

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
                {project.autoDeployPullRequests ? <Badge variant="info">PR previews</Badge> : null}
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
        className="overflow-clip rounded-[10px] border border-[var(--hairline)] bg-white shadow-[var(--shadow)]"
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
          <div className="flex flex-wrap items-center justify-end gap-2 text-[10px] text-[var(--quiet)]">
            {buildingCount > 0 ? (
              <span className="inline-flex items-center gap-1.5">
                <SpinnerGap aria-hidden="true" className="size-3 animate-spin" />
                {buildingCount} building
              </span>
            ) : null}
            <span className="hidden sm:inline">
              Keep every preview or set a retention limit in settings.
            </span>
            <Button
              className="hover:text-destructive"
              disabled={
                isBulkActionPending ||
                isDeletingDeployment ||
                staleDeployments.deletable.length === 0
              }
              onClick={onDeleteOldAction}
              size="xs"
              title="Delete every preview except the latest release on the project branch"
              type="button"
              variant="secondary"
            >
              <Trash aria-hidden="true" className="size-3" />
              Delete old
            </Button>
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
            {selectedCount > 0 ? (
              <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-blue-200 bg-[var(--blue-soft)] px-3 py-2 shadow-[0_1px_0_var(--hairline)]">
                <div className="flex min-w-0 items-center gap-2">
                  <Button
                    aria-label="Clear selection"
                    className="size-6 rounded-[5px] p-0"
                    onClick={onClearSelectionAction}
                    size="icon"
                    title="Clear selection"
                    type="button"
                    variant="ghost"
                  >
                    <X aria-hidden="true" className="size-3.5" />
                  </Button>
                  <span className="text-[11px] font-semibold">
                    {selectedCount} preview{selectedCount === 1 ? '' : 's'} selected
                  </span>
                  {selectedBuildingCount > 0 ? (
                    <span className="truncate text-[10px] text-[var(--quiet)]">
                      · {selectedBuildingCount} still building will be skipped
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    disabled={isBulkActionPending || selectedCount === selectedBuildingCount}
                    onClick={onRedeploySelectedAction}
                    size="xs"
                    type="button"
                    variant="secondary"
                  >
                    {isBulkActionPending ? (
                      <SpinnerGap aria-hidden="true" className="size-3 animate-spin" />
                    ) : (
                      <ArrowCounterClockwise aria-hidden="true" className="size-3" />
                    )}
                    Redeploy
                  </Button>
                  <Button
                    disabled={isBulkActionPending || selectedCount === selectedBuildingCount}
                    onClick={onDeleteSelectedAction}
                    size="xs"
                    type="button"
                    variant="danger"
                  >
                    {isBulkActionPending ? (
                      <SpinnerGap aria-hidden="true" className="size-3 animate-spin" />
                    ) : (
                      <Trash aria-hidden="true" className="size-3" />
                    )}
                    Delete
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="hidden grid-cols-[1.25rem_minmax(0,1fr)_9rem_12rem_8.5rem] items-center gap-3 border-b border-[var(--hairline)] bg-[var(--surface-subtle)] px-3 py-2 font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--quiet)] lg:grid">
              <SelectionCheckbox
                ariaLabel="Select all previews"
                checked={allSelected}
                indeterminate={someSelected}
                onChange={onToggleAllSelectionAction}
              />
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
                const isBuilding = isDeploymentBuilding(deployment);
                const isRunning = deployment.status === 'running';
                const isStopped = deployment.status === 'stopped';
                const isFailed = deployment.status === 'failed';
                const isSelected = selectedDeploymentIds.has(deployment.id);

                return (
                  <div
                    className={cn(
                      'grid grid-cols-[1.25rem_minmax(0,1fr)] items-start gap-x-2 gap-y-2 px-3 py-3 transition-colors lg:grid-cols-[1.25rem_minmax(0,1fr)_9rem_12rem_8.5rem] lg:items-center lg:gap-3',
                      isSelected
                        ? 'bg-[color-mix(in_srgb,var(--blue-soft)_60%,white)]'
                        : 'hover:bg-[color-mix(in_srgb,var(--surface-subtle)_55%,white)]'
                    )}
                    key={deployment.id}
                  >
                    <div className="flex items-center pt-1 lg:pt-0">
                      <SelectionCheckbox
                        ariaLabel={`Select preview ${deployment.shortSha}`}
                        checked={isSelected}
                        onChange={() => onToggleDeploymentSelectionAction(deployment.id)}
                      />
                    </div>

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
                        {deployment.pullRequestNumber ? (
                          <a
                            className="shrink-0 rounded-[4px] border border-[var(--hairline)] px-1.5 py-0.5 font-mono text-[9px] font-medium text-[var(--quiet)] transition-colors hover:border-[var(--blue)] hover:text-[var(--blue)]"
                            href={`https://github.com/${project.repositoryOwner}/${project.repositoryName}/pull/${deployment.pullRequestNumber}`}
                            rel="noopener noreferrer"
                            target="_blank"
                            title={deployment.pullRequestTitle ?? undefined}
                          >
                            PR #{deployment.pullRequestNumber}
                          </a>
                        ) : null}
                        <p
                          className="min-w-0 truncate text-[12px] font-medium"
                          title={deployment.commitMessage ?? undefined}
                        >
                          {deployment.commitMessage ?? 'Commit'}
                        </p>
                      </div>
                      <p className="mt-1 truncate text-[10px] text-[var(--quiet)]">
                        {deployment.pullRequestNumber ? (
                          <>
                            <span className="font-mono">{deployment.branch}</span>
                            {' · '}
                          </>
                        ) : null}
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

                    <div className="col-span-2 flex flex-wrap items-center gap-2 lg:col-span-1">
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

                    <div className="col-span-2 min-w-0 lg:col-span-1">
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

                    <div className="col-span-2 flex items-center gap-0.5 lg:col-span-1 lg:justify-end">
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
                        <ActionButton
                          action="start"
                          deployment={deployment}
                          icon={<Play aria-hidden="true" className="size-3.5" />}
                          label="Start preview"
                          onClickAction={onActionAction}
                          pendingActionKey={pendingActionKey}
                        />
                      ) : null}

                      {!isBuilding ? (
                        <>
                          <ActionButton
                            action="retry"
                            deployment={deployment}
                            icon={<ArrowCounterClockwise aria-hidden="true" className="size-3.5" />}
                            label={
                              isFailed
                                ? 'Redeploy preview after failure'
                                : 'Redeploy preview from this commit'
                            }
                            onClickAction={onActionAction}
                            pendingActionKey={pendingActionKey}
                          />
                          <ActionButton
                            action="delete"
                            danger
                            deployment={deployment}
                            icon={<Trash aria-hidden="true" className="size-3.5" />}
                            label="Delete preview"
                            onClickAction={onActionAction}
                            pendingActionKey={pendingActionKey}
                          />
                        </>
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
