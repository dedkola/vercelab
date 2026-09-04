'use client';

import { type ReactNode } from 'react';
import {
  ArrowUpRight,
  Cube as Box,
  CaretRight as ChevronRight,
  Stack as Layers3,
  MagnifyingGlass as Search,
  X,
} from '@phosphor-icons/react';

import { WorkspaceDialog } from '@/components/workspace/workspace-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ContainerListEntry } from '@/components/workspace-shell';
import { cn } from '@/lib/utils';

export type ContainerStatusFilter = 'all' | 'running' | 'attention';

type ContainersInventoryContentProps = {
  containers: ContainerListEntry[];
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

const CONTAINER_TONES = [
  'border-blue-200 bg-[var(--blue-soft)] text-[var(--blue)]',
  'border-orange-200 bg-[var(--orange-soft)] text-[var(--orange)]',
  'border-violet-200 bg-violet-50 text-[var(--purple)]',
  'border-emerald-200 bg-[var(--green-soft)] text-[var(--green)]',
];

function getContainerInitials(name: string) {
  const words = name.split(/[-_\s]+/).filter(Boolean);

  if (words.length > 1) {
    return words
      .slice(0, 2)
      .map((word) => word[0])
      .join('')
      .toUpperCase();
  }

  return name.slice(0, 2).toUpperCase();
}

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

function getStateClassName(tone: ReturnType<typeof getContainerState>['tone']) {
  switch (tone) {
    case 'running':
      return 'text-[var(--green)]';
    case 'attention':
      return 'text-[var(--orange)]';
    case 'stopped':
      return 'text-[var(--quiet)]';
  }
}

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

function FilterButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={cn(
        'h-7 rounded-[5px] px-2.5 text-[11px] font-medium transition-colors',
        active
          ? 'bg-white text-foreground shadow-[0_1px_2px_rgb(16_24_40_/_0.08)]'
          : 'text-[var(--quiet)] hover:text-foreground'
      )}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

export function ContainersInventoryContent({
  containers,
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
      <header className="flex min-h-8 flex-wrap items-center justify-between gap-3 px-0.5">
        <h1 className="vercelab-page-heading">
          Containers{' '}
          <span className="vercelab-page-count">
            {totalContainersCount} runtime{totalContainersCount === 1 ? '' : 's'}
          </span>
        </h1>
      </header>

      <section
        aria-labelledby="create-container-title"
        className="relative grid min-h-20 grid-cols-[minmax(220px,1fr)_auto] items-center gap-5 overflow-hidden rounded-[10px] border border-blue-200 bg-white px-4 py-3 shadow-[var(--shadow)] before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-[var(--blue)] max-[720px]:grid-cols-1 max-[720px]:gap-3 max-[640px]:px-3"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-[8px] bg-[var(--blue-soft)] text-[var(--blue)]">
            <Layers3 aria-hidden="true" className="size-4" />
          </span>
          <span className="min-w-0">
            <strong className="block text-[13px] font-semibold" id="create-container-title">
              Create container
            </strong>
            <span className="mt-0.5 block text-[11px] text-muted-foreground">
              Launch an image or review a Compose stack before it starts.
            </span>
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 max-[720px]:justify-start">
          <Button
            className="h-9 rounded-[7px] px-3 text-[12px] shadow-none"
            onClick={onOpenComposeCreateAction}
            type="button"
            variant="secondary"
          >
            Compose stack
          </Button>
          <Button
            className="h-9 rounded-[7px] border-[var(--blue)] bg-[var(--blue)] px-3 text-[12px] text-white shadow-none hover:bg-[#0d55bc]"
            onClick={onOpenImageCreateAction}
            type="button"
          >
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
              <h2 className="text-[13px] font-semibold" id="container-inventory-title">
                Runtime inventory
              </h2>
              <p className="mt-1 whitespace-nowrap font-mono text-[10px] text-[var(--quiet)]">
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
                className="h-9 rounded-[7px] bg-[var(--surface-subtle)] pl-8 text-[12px] shadow-none"
                onChange={(event) => onSearchQueryChangeAction(event.target.value)}
                placeholder="Find container, stack, or image"
                value={searchQuery}
              />
            </div>
          </div>
          <div
            aria-label="Filter containers"
            className="grid grid-flow-col rounded-[7px] border border-[var(--hairline)] bg-[var(--surface-subtle)] p-0.5 max-[640px]:col-start-2 max-[640px]:row-start-2"
            role="group"
          >
            <FilterButton
              active={statusFilter === 'all'}
              onClick={() => onStatusFilterChangeAction('all')}
            >
              All
            </FilterButton>
            <FilterButton
              active={statusFilter === 'running'}
              onClick={() => onStatusFilterChangeAction('running')}
            >
              Running
            </FilterButton>
            <FilterButton
              active={statusFilter === 'attention'}
              onClick={() => onStatusFilterChangeAction('attention')}
            >
              Attention
            </FilterButton>
          </div>
        </header>

        <div className="overflow-x-auto">
          <table className="w-full table-fixed border-collapse">
            <caption className="sr-only">Docker containers and current runtime state</caption>
            <colgroup>
              <col className="w-auto" />
              <col className="w-[7rem] max-[760px]:w-[6.75rem]" />
              <col className="w-[17%] max-[760px]:hidden" />
              <col className="w-[21%] max-[760px]:hidden" />
              <col className="w-[16%] max-[960px]:hidden" />
              <col className="w-[12%] max-[760px]:hidden" />
              <col className="w-[5.75rem] max-[760px]:w-[5.25rem]" />
            </colgroup>
            <thead className="bg-[var(--surface-subtle)]">
              <tr className="h-9 border-b border-[var(--hairline)]">
                {['Container', 'State', 'Stack', 'I/O', 'Route', 'Load'].map((label, index) => (
                  <th
                    className={cn(
                      'px-3 text-left font-mono text-[10px] font-semibold tracking-[0.08em] text-[var(--quiet)] uppercase',
                      index >= 2 && index <= 3 && 'max-[760px]:hidden',
                      index === 4 && 'max-[960px]:hidden',
                      index === 5 && 'max-[760px]:hidden'
                    )}
                    key={label}
                    scope="col"
                  >
                    {label}
                  </th>
                ))}
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {containers.map((container, index) => {
                const state = getContainerState(container);
                const route = getRoute(container);

                return (
                  <tr
                    aria-label={`Manage ${container.sidebarName}`}
                    className={cn(
                      'group h-[58px] cursor-pointer border-b border-[var(--hairline)] outline-none transition-colors last:border-b-0 hover:bg-[#f8fafc] focus-visible:ring-2 focus-visible:ring-[var(--blue)] focus-visible:ring-inset',
                      selectedContainerId === container.display.id &&
                        'bg-[color-mix(in_srgb,var(--blue-soft)_34%,white)]'
                    )}
                    key={container.display.id}
                    onClick={() => onContainerSelectAction(container.display.id)}
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget) return;
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onContainerSelectAction(container.display.id);
                      }
                    }}
                    tabIndex={0}
                  >
                    <td className="px-3 py-1.5">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span
                          className={cn(
                            'grid size-8 shrink-0 place-items-center rounded-[7px] border font-mono text-[10px] font-bold',
                            CONTAINER_TONES[index % CONTAINER_TONES.length]
                          )}
                        >
                          {getContainerInitials(container.sidebarName)}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-[12px] font-semibold tracking-[-0.01em]">
                            {container.sidebarName}
                          </span>
                          <span className="mt-0.5 block truncate font-mono text-[10px] text-[var(--quiet)]">
                            {container.display.id.slice(0, 12)}
                          </span>
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-1.5">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.04em] uppercase',
                          getStateClassName(state.tone)
                        )}
                      >
                        <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
                        {state.label}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 max-[760px]:hidden">
                      <span className="block truncate font-mono text-[11px] text-foreground">
                        {getStackLabel(container)}
                      </span>
                      <span className="mt-0.5 block truncate font-mono text-[10px] text-[var(--quiet)]">
                        {getServiceLabel(container)}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 max-[760px]:hidden">
                      <span className="block whitespace-nowrap font-mono text-[11px] text-[var(--muted-ink)]">
                        Net {formatBytesPerSecond(container.runtime?.networkTotalBytesPerSecond)}
                      </span>
                      <span className="mt-0.5 block whitespace-nowrap font-mono text-[10px] text-[var(--quiet)]">
                        Disk {formatBytesPerSecond(container.runtime?.diskTotalBytesPerSecond)}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 max-[960px]:hidden">
                      {route.href && route.label ? (
                        <a
                          className="inline-flex max-w-full items-center gap-1 truncate font-mono text-[11px] text-[var(--blue)] underline-offset-2 hover:underline"
                          href={route.href}
                          onClick={(event) => event.stopPropagation()}
                          rel="noreferrer"
                          target="_blank"
                        >
                          <span className="truncate">{route.label}</span>
                          <ArrowUpRight aria-hidden="true" className="size-3 shrink-0" />
                        </a>
                      ) : (
                        <span className="font-mono text-[11px] text-[var(--quiet)]">
                          not routed
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 max-[760px]:hidden">
                      <span className="block whitespace-nowrap font-mono text-[11px] text-[var(--muted-ink)]">
                        {container.display.cpu || '—'} CPU
                      </span>
                      <span className="mt-0.5 block whitespace-nowrap font-mono text-[10px] text-[var(--quiet)]">
                        {container.display.memory || 'No sample'}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <Button
                        className="h-8 rounded-[6px] px-3 text-[11px] shadow-none group-hover:border-blue-200 group-hover:bg-[var(--blue-soft)] group-hover:text-[var(--blue)]"
                        onClick={(event) => {
                          event.stopPropagation();
                          onContainerSelectAction(container.display.id);
                        }}
                        type="button"
                        variant="secondary"
                      >
                        Manage
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {containers.length === 0 ? (
            <div className="px-4 py-10 text-center font-mono text-[12px] text-[var(--quiet)]">
              {totalContainersCount === 0
                ? 'No containers available. Create a container or check the Docker connection.'
                : 'No containers match this view.'}
            </div>
          ) : null}
        </div>
      </section>

      {isCreatePanelOpen ? (
        <WorkspaceDialog onCloseAction={onCloseCreatePanelAction} title="Review new container">
          <section className="min-w-0">
            <header className="flex min-h-[54px] items-center justify-between gap-4 border-b border-[var(--hairline)] px-4">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="grid size-[30px] shrink-0 place-items-center rounded-[7px] border border-blue-200 bg-[var(--blue-soft)] text-[var(--blue)]">
                  <Box aria-hidden="true" className="size-4" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-[15px] font-semibold" id="review-container-title">
                    Review new container
                  </h2>
                  <p className="mt-0.5 font-mono text-[10px] text-[var(--quiet)]">
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
          </section>
        </WorkspaceDialog>
      ) : null}
    </div>
  );
}
