'use client';

import { type ReactNode } from 'react';
import {
  Cube as Box,
  CaretRight as ChevronRight,
  Stack as Layers3,
  MagnifyingGlass as Search,
  X,
} from '@phosphor-icons/react';

import {
  CellStack,
  DataTable,
  DataTableActionsHead,
  DataTableCell,
  DataTableEmpty,
  DataTableHead,
  DataTableHeaderRow,
  DataTableRow,
  EntityCell,
  getInitials,
  InitialsAvatar,
  RouteLink,
  RowActionButton,
  StatusPill,
  type StatusTone,
} from '@/components/workspace/data-table';
import { WorkspaceDialog } from '@/components/workspace/workspace-dialog';
import { SegmentedControl } from '@/components/workspace/segmented-control';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ContainerListEntry } from '@/components/workspace-shell';

export type ContainerStatusFilter = 'all' | 'running' | 'attention';

type ContainersInventoryContentProps = {
  containers: ContainerListEntry[];
  createFooter?: ReactNode;
  createModeLabel: string;
  createPanel: ReactNode;
  isCreatePanelOpen: boolean;
  onCloseCreatePanelAction: () => void;
  onContainerSelectAction: (containerId: string) => void;
  onOpenComposeCreateAction: () => void;
  onOpenImageCreateAction: () => void;
  onSearchQueryChangeAction: (value: string) => void;
  onStatusFilterChangeAction: (filter: ContainerStatusFilter) => void;
  runningContainersCount: number | null;
  searchQuery: string;
  selectedContainerId: string | null;
  statusFilter: ContainerStatusFilter;
  totalContainersCount: number;
};

function getContainerState(container: ContainerListEntry) {
  if (container.runtime?.health === 'unhealthy') {
    return { label: 'Unhealthy', tone: 'attention' as const };
  }

  if (container.runtime?.health === 'starting') {
    return { label: 'Starting', tone: 'attention' as const };
  }

  if (container.deploymentStatus === 'deploying') {
    return { label: 'Deploying', tone: 'attention' as const };
  }

  if (container.deploymentStatus === 'failed' || container.display.status === 'degraded') {
    return { label: 'Attention', tone: 'attention' as const };
  }

  if (
    container.runtime?.status === 'running' ||
    container.deploymentStatus === 'running' ||
    container.display.status === 'running'
  ) {
    return { label: 'Running', tone: 'running' as const };
  }

  return { label: 'Stopped', tone: 'stopped' as const };
}

const STATE_TONE: Record<ReturnType<typeof getContainerState>['tone'], StatusTone> = {
  attention: 'warning',
  running: 'success',
  stopped: 'neutral',
};

function getStackLabel(container: ContainerListEntry) {
  return container.runtime?.projectName ?? container.display.stack ?? 'standalone';
}

function getServiceLabel(container: ContainerListEntry) {
  return container.runtime?.serviceName ?? container.sidebarSecondaryLabel ?? 'runtime';
}

function getRoute(container: ContainerListEntry) {
  const endpoint = container.display.endpoints[0] ?? null;
  const label = endpoint?.name ?? endpoint?.url ?? null;
  const href = endpoint?.url ?? (label?.startsWith('http') ? label : null);

  return { href, label };
}

function formatBytesPerSecond(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) {
    return '0 B/s';
  }

  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
  const unitIndex = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const scaledValue = value / 1024 ** unitIndex;

  return `${scaledValue >= 10 || unitIndex === 0 ? scaledValue.toFixed(0) : scaledValue.toFixed(1)} ${units[unitIndex]}`;
}

export function ContainersInventoryContent({
  containers,
  createFooter,
  createModeLabel,
  createPanel,
  isCreatePanelOpen,
  onCloseCreatePanelAction,
  onContainerSelectAction,
  onOpenComposeCreateAction,
  onOpenImageCreateAction,
  onSearchQueryChangeAction,
  onStatusFilterChangeAction,
  runningContainersCount,
  searchQuery,
  selectedContainerId,
  statusFilter,
  totalContainersCount,
}: ContainersInventoryContentProps) {
  const attentionContainersCount = containers.filter(
    (container) => getContainerState(container).tone === 'attention'
  ).length;

  return (
    <div className="vercelab-page space-y-4">
      <h1 className="sr-only">Containers</h1>

      <section
        aria-labelledby="create-container-title"
        className="relative grid min-h-20 grid-cols-[minmax(220px,1fr)_auto] items-center gap-5 overflow-hidden rounded-[10px] border border-[var(--blue)]/20 bg-white px-4 py-3 shadow-[var(--shadow)] before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-[var(--blue)] max-[720px]:grid-cols-1 max-[720px]:gap-3 max-[640px]:px-3"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-[8px] bg-[var(--blue-soft)] text-[var(--blue)]">
            <Layers3 aria-hidden="true" className="size-4" />
          </span>
          <span className="min-w-0">
            <strong className="block text-sm font-semibold" id="create-container-title">
              Create container
            </strong>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Launch an image or review a Compose stack before it starts.
            </span>
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 max-[720px]:justify-start">
          <Button onClick={onOpenComposeCreateAction} type="button" variant="secondary">
            Compose stack
          </Button>
          <Button onClick={onOpenImageCreateAction} type="button" variant="primary">
            Review image
            <ChevronRight aria-hidden="true" className="size-3.5" />
          </Button>
        </div>
      </section>

      <section
        aria-labelledby="container-inventory-title"
        className="overflow-hidden rounded-[10px] border border-[var(--hairline)] bg-white shadow-[var(--shadow)]"
      >
        <header className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-[var(--hairline)] px-3 py-2.5 max-[640px]:grid max-[640px]:grid-cols-[minmax(0,1fr)_auto]">
          <div className="flex min-w-0 flex-1 items-center gap-3 max-[640px]:contents">
            <div className="min-w-0 shrink-0 max-[640px]:col-span-2">
              <h2 className="text-sm font-semibold" id="container-inventory-title">
                Runtime inventory
              </h2>
              <p className="mt-1 whitespace-nowrap font-mono text-2xs text-[var(--quiet)]">
                {containers.length} visible · {runningContainersCount ?? '—'} running
                {attentionContainersCount ? ` · ${attentionContainersCount} attention` : ''}
              </p>
            </div>
            <div className="relative w-60 max-w-full max-[640px]:col-start-1 max-[640px]:row-start-2 max-[640px]:w-full">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--quiet)]"
              />
              <Input
                aria-label="Search containers"
                className="h-9 rounded-[7px] bg-[var(--surface-subtle)] pl-8 text-body shadow-none"
                onChange={(event) => onSearchQueryChangeAction(event.target.value)}
                placeholder="Find container, stack, or image"
                value={searchQuery}
              />
            </div>
          </div>
          <SegmentedControl
            ariaLabel="Filter containers"
            className="max-[640px]:col-start-2 max-[640px]:row-start-2"
            onChange={onStatusFilterChangeAction}
            options={[
              { label: 'All', value: 'all' },
              { label: 'Running', value: 'running' },
              { label: 'Attention', value: 'attention' },
            ]}
            value={statusFilter}
          />
        </header>

        <DataTable caption="Docker containers and current runtime state">
          <colgroup>
            <col className="w-auto" />
            <col className="w-[8.5rem] max-[760px]:w-[7.5rem]" />
            <col className="w-[16%] max-[760px]:hidden" />
            <col className="w-[18%] max-[960px]:hidden" />
            <col className="w-[8rem] max-[760px]:hidden" />
            <col className="w-[8rem] max-[760px]:hidden" />
            <col className="w-[6.5rem]" />
          </colgroup>
          <DataTableHeaderRow>
            <DataTableHead>Container</DataTableHead>
            <DataTableHead>State</DataTableHead>
            <DataTableHead className="max-[760px]:hidden">Stack</DataTableHead>
            <DataTableHead className="max-[960px]:hidden">Route</DataTableHead>
            <DataTableHead align="right" className="max-[760px]:hidden">
              I/O
            </DataTableHead>
            <DataTableHead align="right" className="max-[760px]:hidden">
              Load
            </DataTableHead>
            <DataTableActionsHead />
          </DataTableHeaderRow>
          <tbody>
            {containers.map((container, index) => {
              const state = getContainerState(container);
              const route = getRoute(container);

              return (
                <DataTableRow
                  key={container.display.id}
                  label={`Manage ${container.sidebarName}`}
                  onSelectAction={() => onContainerSelectAction(container.display.id)}
                  selected={selectedContainerId === container.display.id}
                >
                  <DataTableCell>
                    <EntityCell
                      avatar={
                        <InitialsAvatar
                          initials={getInitials(container.sidebarName)}
                          toneIndex={index}
                        />
                      }
                      name={container.sidebarName}
                      subtitle={container.display.id.slice(0, 12)}
                    />
                  </DataTableCell>
                  <DataTableCell>
                    <StatusPill label={state.label} tone={STATE_TONE[state.tone]} />
                  </DataTableCell>
                  <DataTableCell className="max-[760px]:hidden">
                    <CellStack
                      primary={getStackLabel(container)}
                      secondary={getServiceLabel(container)}
                    />
                  </DataTableCell>
                  <DataTableCell className="max-[960px]:hidden">
                    <RouteLink href={route.href} label={route.label} />
                  </DataTableCell>
                  <DataTableCell align="right" className="max-[760px]:hidden">
                    <CellStack
                      primary={
                        <>
                          <span className="text-[var(--quiet)]">net </span>
                          {formatBytesPerSecond(container.runtime?.networkTotalBytesPerSecond)}
                        </>
                      }
                      secondary={
                        <>disk {formatBytesPerSecond(container.runtime?.diskTotalBytesPerSecond)}</>
                      }
                    />
                  </DataTableCell>
                  <DataTableCell align="right" className="max-[760px]:hidden">
                    <CellStack
                      primary={
                        <>
                          {container.display.cpu || '—'}
                          <span className="text-[var(--quiet)]"> cpu</span>
                        </>
                      }
                      secondary={container.display.memory || 'no sample'}
                    />
                  </DataTableCell>
                  <DataTableCell align="right">
                    <RowActionButton
                      onClickAction={() => onContainerSelectAction(container.display.id)}
                    >
                      Manage
                    </RowActionButton>
                  </DataTableCell>
                </DataTableRow>
              );
            })}
          </tbody>
        </DataTable>

        {containers.length === 0 ? (
          <DataTableEmpty>
            {totalContainersCount === 0
              ? 'No containers available. Create a container or check the Docker connection.'
              : 'No containers match this view.'}
          </DataTableEmpty>
        ) : null}
      </section>

      {isCreatePanelOpen ? (
        <WorkspaceDialog onCloseAction={onCloseCreatePanelAction} title="Review new container">
          <section className="min-w-0">
            <header className="flex min-h-[54px] items-center justify-between gap-4 border-b border-[var(--hairline)] px-4">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="grid size-[30px] shrink-0 place-items-center rounded-[7px] border border-[var(--blue)]/20 bg-[var(--blue-soft)] text-[var(--blue)]">
                  <Box aria-hidden="true" className="size-4" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-[0.9375rem] font-semibold" id="review-container-title">
                    Review new container
                  </h2>
                  <p className="mt-0.5 font-mono text-2xs text-[var(--quiet)]">
                    {createModeLabel} · validate configuration before start
                  </p>
                </div>
              </div>
              <Button
                aria-label="Close container review"
                autoFocus
                className="size-7"
                onClick={onCloseCreatePanelAction}
                size="icon"
                type="button"
                variant="ghost"
              >
                <X aria-hidden="true" className="size-4" />
              </Button>
            </header>
            <div className="p-4">{createPanel}</div>
            {createFooter ? (
              <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--hairline)] bg-[var(--surface-subtle)] px-4 py-3">
                <Button onClick={onCloseCreatePanelAction} type="button" variant="secondary">
                  Cancel
                </Button>
                {createFooter}
              </footer>
            ) : null}
          </section>
        </WorkspaceDialog>
      ) : null}
    </div>
  );
}
