'use client';

import { useMemo } from 'react';
import type { FormEvent, ReactNode } from 'react';
import {
  ArrowUpRight,
  CaretRight as ChevronRight,
  GitBranch,
  Package as PackagePlus,
  Plus,
  MagnifyingGlass as Search,
  X,
} from '@phosphor-icons/react';

import type { DraftAppState, RepositoryState } from '@/components/workspace-shell';
import { WorkspaceNotice } from '@/components/workspace/workspace-notice';
import { WorkspaceDialog } from '@/components/workspace/workspace-dialog';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupInput, InputGroupSuffix } from '@/components/ui/input-group';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { ExposureMode } from '@/lib/validation';

type SelectOption = {
  description?: string;
  label: string;
  value: string;
};

export type AppStatusFilter = 'all' | 'running' | 'attention';

type GitAppPageListItem = {
  appName: string;
  branchLabel: string;
  composeMode: string;
  domain: string;
  exposureMode?: ExposureMode;
  hostPort: number | null;
  id: string;
  isActive: boolean;
  port: number;
  relativeUpdatedAt: string;
  repositoryName: string;
  revisionLabel: string;
  statusLabel: string;
  statusVariant: 'success' | 'warning' | 'default';
};

type GitAppPageLeftSidebarProps = {
  appItems: GitAppPageListItem[];
  appSearchQuery: string;
  baseDomain?: string;
  branchError: string | null;
  branchHelperText: string | null;
  branchOptions: SelectOption[];
  draftApp: DraftAppState;
  isBranchLoading: boolean;
  isCreateAppExpanded: boolean;
  isCreateAppPending: boolean;
  liveAppsCount: number;
  onAppSearchQueryChangeAction: (value: string) => void;
  onCreateAppAction: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  onDraftChangeAction: (field: keyof DraftAppState, value: string) => void;
  onRepositorySelectAction: (value: string) => void;
  onSelectAppAction: (id: string) => void;
  onStatusFilterChangeAction: (filter: AppStatusFilter) => void;
  onToggleCreateAppAction: () => void;
  repositoryOptions: SelectOption[];
  repositoryState: RepositoryState;
  selectedRepositorySummary: string | null;
  selectedRepositoryValue: string;
  statusFilter: AppStatusFilter;
  totalAppsCount: number;
};

const APP_TONES = [
  'border-orange-200 bg-[var(--orange-soft)] text-[var(--orange)]',
  'border-blue-200 bg-[var(--blue-soft)] text-[var(--blue)]',
  'border-violet-200 bg-violet-50 text-[var(--purple)]',
  'border-emerald-200 bg-[var(--green-soft)] text-[var(--green)]',
];

function getStatusClassName(statusVariant: GitAppPageListItem['statusVariant']) {
  switch (statusVariant) {
    case 'success':
      return 'text-[var(--green)]';
    case 'warning':
      return 'text-[var(--blue)]';
    default:
      return 'text-[var(--quiet)]';
  }
}

function getAppInitials(appName: string) {
  const words = appName.split(/[-_\s]+/).filter(Boolean);

  if (words.length > 1) {
    return words
      .slice(0, 2)
      .map((word) => word[0])
      .join('')
      .toUpperCase();
  }

  return appName.slice(0, 2).toUpperCase();
}

function getRuntimeLabel(deployment: GitAppPageListItem) {
  if (
    (deployment.exposureMode === 'tcp' || deployment.exposureMode === 'host') &&
    deployment.hostPort
  ) {
    return `${deployment.composeMode} · :${deployment.hostPort}`;
  }

  return `${deployment.composeMode} · :${deployment.port}`;
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

export function GitAppPageLeftSidebar({
  appItems,
  appSearchQuery,
  baseDomain,
  branchError,
  branchHelperText,
  branchOptions,
  draftApp,
  isBranchLoading,
  isCreateAppExpanded,
  isCreateAppPending,
  liveAppsCount,
  onAppSearchQueryChangeAction,
  onCreateAppAction,
  onDraftChangeAction,
  onRepositorySelectAction,
  onSelectAppAction,
  onStatusFilterChangeAction,
  onToggleCreateAppAction,
  repositoryOptions,
  repositoryState,
  selectedRepositorySummary,
  selectedRepositoryValue,
  statusFilter,
  totalAppsCount,
}: GitAppPageLeftSidebarProps) {
  const needsHostPort = draftApp.exposureMode === 'tcp' || draftApp.exposureMode === 'host';
  const isCreateDisabled =
    isCreateAppPending ||
    repositoryState.isLoading ||
    (Boolean(draftApp.repositoryUrl) && isBranchLoading) ||
    !draftApp.repositoryUrl.trim() ||
    !draftApp.appName.trim() ||
    (draftApp.exposureMode === 'http' && !draftApp.subdomain.trim()) ||
    !draftApp.port.trim() ||
    (needsHostPort && !draftApp.hostPort.trim());
  const deployingAppsCount = useMemo(
    () => appItems.filter((deployment) => deployment.statusVariant === 'warning').length,
    [appItems]
  );

  return (
    <div className="vercelab-page space-y-4">
      <header className="flex min-h-8 flex-wrap items-center justify-between gap-3 px-0.5">
        <h1 className="vercelab-page-heading">
          Apps{' '}
          <span className="vercelab-page-count">
            {totalAppsCount} deployment{totalAppsCount === 1 ? '' : 's'}
          </span>
        </h1>
      </header>

      <section
        aria-labelledby="deploy-new-app-title"
        className="relative grid min-h-20 grid-cols-[minmax(220px,1fr)_minmax(440px,1.35fr)] items-center gap-5 overflow-hidden rounded-[10px] border border-orange-200 bg-white px-4 py-3 shadow-[var(--shadow)] before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-[var(--orange)] max-[900px]:grid-cols-1 max-[900px]:gap-3 max-[640px]:px-3"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-[8px] bg-[var(--orange-soft)] text-[var(--orange)]">
            <PackagePlus aria-hidden="true" className="size-4" />
          </span>
          <span className="min-w-0">
            <strong className="block text-[13px] font-semibold" id="deploy-new-app-title">
              Deploy new app
            </strong>
            <span className="mt-0.5 block text-[11px] text-muted-foreground">
              Choose a repository and branch. Review before creation.
            </span>
          </span>
        </div>

        <div className="grid min-w-0 grid-cols-[minmax(190px,1fr)_minmax(120px,0.55fr)_auto] items-center gap-2 max-[640px]:grid-cols-[minmax(0,1fr)_6.5rem]">
          <Combobox
            ariaLabel="Repository"
            buttonClassName="h-9 rounded-[7px] border border-border bg-[var(--surface-subtle)] px-2.5 text-[12px] shadow-none"
            disabled={repositoryState.isLoading}
            emptyText={repositoryState.error ?? 'No repositories found'}
            onValueChangeAction={onRepositorySelectAction}
            options={repositoryOptions}
            placeholder={repositoryState.isLoading ? 'Loading repositories…' : 'Select repository'}
            searchPlaceholder="Search repositories"
            value={selectedRepositoryValue}
          />
          <Combobox
            ariaLabel="Branch"
            buttonClassName="h-9 rounded-[7px] border border-border bg-[var(--surface-subtle)] px-2.5 text-[12px] shadow-none"
            disabled={!selectedRepositoryValue || isBranchLoading || branchOptions.length === 0}
            emptyText={
              selectedRepositoryValue
                ? (branchError ?? 'No branches found')
                : 'Select a repository first'
            }
            onValueChangeAction={(value) => onDraftChangeAction('branch', value)}
            options={branchOptions}
            placeholder={
              !selectedRepositoryValue ? 'Branch' : isBranchLoading ? 'Loading…' : 'Select branch'
            }
            searchPlaceholder="Search branches"
            value={draftApp.branch}
          />
          <Button
            className="h-9 rounded-[7px] border-[var(--orange)] bg-[var(--orange)] px-3 text-[12px] text-white shadow-none hover:bg-[#dc6f13] max-[640px]:col-span-2"
            disabled={!draftApp.repositoryUrl.trim() || isBranchLoading}
            onClick={onToggleCreateAppAction}
            type="button"
          >
            Review deploy
            <ChevronRight aria-hidden="true" className="size-3.5" />
          </Button>
        </div>
      </section>

      {repositoryState.error || branchError ? (
        <WorkspaceNotice>{repositoryState.error ?? branchError}</WorkspaceNotice>
      ) : null}

      <section
        aria-labelledby="applications-title"
        className="overflow-hidden rounded-[10px] border border-[var(--hairline)] bg-white shadow-[var(--shadow)]"
      >
        <header className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-[var(--hairline)] px-3 py-2.5 max-[640px]:grid max-[640px]:grid-cols-[minmax(0,1fr)_auto]">
          <div className="flex min-w-0 flex-1 items-center gap-3 max-[640px]:contents">
            <div className="min-w-0 shrink-0 max-[640px]:col-span-2">
              <h2 className="text-[13px] font-semibold" id="applications-title">
                Applications
              </h2>
              <p className="mt-1 whitespace-nowrap font-mono text-[10px] text-[var(--quiet)]">
                {appItems.length} visible · {liveAppsCount} running
                {deployingAppsCount ? ` · ${deployingAppsCount} deploying` : ''}
              </p>
            </div>
            <div className="relative w-56 max-w-full max-[640px]:col-start-1 max-[640px]:row-start-2 max-[640px]:w-full">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--quiet)]"
              />
              <Input
                aria-label="Search apps"
                className="h-9 rounded-[7px] bg-[var(--surface-subtle)] pl-8 text-[12px] shadow-none"
                onChange={(event) => onAppSearchQueryChangeAction(event.target.value)}
                placeholder="Find app or route"
                value={appSearchQuery}
              />
            </div>
          </div>
          <div
            aria-label="Filter applications"
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
            <caption className="sr-only">Git-backed applications and deployment state</caption>
            <colgroup>
              <col className="w-auto" />
              <col className="w-[7rem] max-[760px]:w-[6.5rem]" />
              <col className="w-[18%] max-[760px]:hidden" />
              <col className="w-[20%] max-[760px]:hidden" />
              <col className="w-[12%] max-[760px]:hidden" />
              <col className="w-[8%] max-[960px]:hidden" />
              <col className="w-[5.75rem] max-[760px]:w-[5.25rem]" />
            </colgroup>
            <thead className="bg-[var(--surface-subtle)]">
              <tr className="h-9 border-b border-[var(--hairline)]">
                {['App', 'State', 'Source', 'Route', 'Runtime', 'Updated'].map((label, index) => (
                  <th
                    className={cn(
                      'px-3 text-left font-mono text-[10px] font-semibold tracking-[0.08em] text-[var(--quiet)] uppercase',
                      index >= 2 && index <= 4 && 'max-[760px]:hidden',
                      index === 5 && 'max-[960px]:hidden'
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
              {appItems.map((deployment, index) => (
                <tr
                  aria-label={`Manage ${deployment.appName}`}
                  className={cn(
                    'group h-[58px] cursor-pointer border-b border-[var(--hairline)] outline-none transition-colors last:border-b-0 hover:bg-[#f8fafc] focus-visible:ring-2 focus-visible:ring-[var(--blue)] focus-visible:ring-inset',
                    deployment.isActive && 'bg-[color-mix(in_srgb,var(--blue-soft)_34%,white)]'
                  )}
                  key={deployment.id}
                  onClick={() => onSelectAppAction(deployment.id)}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return;
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onSelectAppAction(deployment.id);
                    }
                  }}
                  tabIndex={0}
                >
                  <td className="px-3 py-1.5">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        className={cn(
                          'grid size-8 shrink-0 place-items-center rounded-[7px] border font-mono text-[10px] font-bold',
                          APP_TONES[index % APP_TONES.length]
                        )}
                      >
                        {getAppInitials(deployment.appName)}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[12px] font-semibold tracking-[-0.01em]">
                          {deployment.appName}
                        </span>
                        <span className="mt-0.5 block truncate font-mono text-[10px] text-[var(--quiet)]">
                          {deployment.id}
                        </span>
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-1.5">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.04em] uppercase',
                        getStatusClassName(deployment.statusVariant)
                      )}
                    >
                      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
                      {deployment.statusLabel}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 max-[760px]:hidden">
                    <span className="block truncate font-mono text-[11px] text-foreground">
                      {deployment.repositoryName}
                    </span>
                    <span className="mt-0.5 block truncate font-mono text-[10px] text-[var(--quiet)]">
                      {deployment.branchLabel}@{deployment.revisionLabel}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 max-[760px]:hidden">
                    {deployment.domain ? (
                      <a
                        className="inline-flex max-w-full items-center gap-1 truncate font-mono text-[11px] text-[var(--blue)] underline-offset-2 hover:underline"
                        href={`https://${deployment.domain}`}
                        onClick={(event) => event.stopPropagation()}
                        rel="noreferrer"
                        target="_blank"
                      >
                        <span className="truncate">{deployment.domain}</span>
                        <ArrowUpRight aria-hidden="true" className="size-3 shrink-0" />
                      </a>
                    ) : (
                      <span className="font-mono text-[11px] text-[var(--quiet)]">not routed</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 max-[760px]:hidden">
                    <span className="font-mono text-[11px] text-[var(--muted-ink)]">
                      {getRuntimeLabel(deployment)}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 max-[960px]:hidden">
                    <span className="font-mono text-[11px] text-[var(--muted-ink)]">
                      {deployment.relativeUpdatedAt}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <Button
                      className="h-8 rounded-[6px] px-3 text-[11px] shadow-none group-hover:border-blue-200 group-hover:bg-[var(--blue-soft)] group-hover:text-[var(--blue)]"
                      onClick={(event) => {
                        event.stopPropagation();
                        onSelectAppAction(deployment.id);
                      }}
                      type="button"
                      variant="secondary"
                    >
                      Manage
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {appItems.length === 0 ? (
            <div className="px-4 py-10 text-center font-mono text-[12px] text-[var(--quiet)]">
              {totalAppsCount === 0
                ? 'No apps deployed yet. Choose a repository above to get started.'
                : 'No applications match this view.'}
            </div>
          ) : null}
        </div>
      </section>

      {isCreateAppExpanded ? (
        <WorkspaceDialog onCloseAction={onToggleCreateAppAction} title="Review new deployment">
          <form className="min-w-0" onSubmit={onCreateAppAction}>
            <header className="flex min-h-[54px] items-center justify-between gap-4 border-b border-[var(--hairline)] px-4">
              <div>
                <h2 className="text-[15px] font-semibold" id="review-deployment-title">
                  Review new deployment
                </h2>
                <p className="mt-0.5 font-mono text-[10px] text-[var(--quiet)]">
                  Git source → build → runtime
                </p>
              </div>
              <Button
                aria-label="Close deployment review"
                autoFocus
                className="size-7"
                onClick={onToggleCreateAppAction}
                size="icon"
                type="button"
                variant="ghost"
              >
                <X aria-hidden="true" className="size-4" />
              </Button>
            </header>

            <div className="grid gap-3 p-4">
              <div className="grid grid-cols-2 gap-3 max-[560px]:grid-cols-1">
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-medium text-muted-foreground">App name</Label>
                  <Input
                    aria-label="App name"
                    className="h-9 rounded-[7px] font-mono text-[12px] shadow-none"
                    onChange={(event) => onDraftChangeAction('appName', event.target.value)}
                    value={draftApp.appName}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-medium text-muted-foreground">
                    Internal port
                  </Label>
                  <Input
                    aria-label="Internal port"
                    className="h-9 rounded-[7px] font-mono text-[12px] shadow-none"
                    inputMode="numeric"
                    onChange={(event) => onDraftChangeAction('port', event.target.value)}
                    value={draftApp.port}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-[11px] font-medium text-muted-foreground">Repository</Label>
                <Combobox
                  ariaLabel="Deployment repository"
                  buttonClassName="h-9 rounded-[7px] border border-border bg-white px-2.5 font-mono text-[12px] shadow-none"
                  disabled={repositoryState.isLoading}
                  emptyText={repositoryState.error ?? 'No repositories found'}
                  onValueChangeAction={onRepositorySelectAction}
                  options={repositoryOptions}
                  placeholder="Select repository"
                  searchPlaceholder="Search repositories"
                  value={selectedRepositoryValue}
                />
                {selectedRepositorySummary ? (
                  <p className="font-mono text-[10px] text-[var(--quiet)]">
                    {selectedRepositorySummary}
                  </p>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-3 max-[560px]:grid-cols-1">
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-medium text-muted-foreground">Branch</Label>
                  <Combobox
                    ariaLabel="Deployment branch"
                    buttonClassName="h-9 rounded-[7px] border border-border bg-white px-2.5 font-mono text-[12px] shadow-none"
                    disabled={
                      !selectedRepositoryValue || isBranchLoading || branchOptions.length === 0
                    }
                    emptyText={branchError ?? 'No branches found'}
                    onValueChangeAction={(value) => onDraftChangeAction('branch', value)}
                    options={branchOptions}
                    placeholder={isBranchLoading ? 'Loading branches…' : 'Select branch'}
                    searchPlaceholder="Search branches"
                    value={draftApp.branch}
                  />
                  {branchHelperText ? (
                    <p className="font-mono text-[10px] text-[var(--quiet)]">{branchHelperText}</p>
                  ) : null}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-medium text-muted-foreground">Exposure</Label>
                  <select
                    aria-label="Exposure"
                    className="h-9 w-full rounded-[7px] border border-input bg-white px-3 text-[12px]"
                    onChange={(event) => onDraftChangeAction('exposureMode', event.target.value)}
                    value={draftApp.exposureMode}
                  >
                    <option value="http">HTTP — reverse proxy</option>
                    <option value="tcp">TCP passthrough</option>
                    <option value="host">Host port</option>
                    <option value="internal">Internal only</option>
                  </select>
                </div>
              </div>

              {draftApp.exposureMode === 'http' ? (
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-medium text-muted-foreground">
                    Public route
                  </Label>
                  <InputGroup className="h-9 rounded-[7px] shadow-none">
                    <InputGroupInput
                      aria-label="Public route"
                      className="font-mono text-[12px]"
                      onChange={(event) => onDraftChangeAction('subdomain', event.target.value)}
                      value={draftApp.subdomain}
                    />
                    {baseDomain ? (
                      <InputGroupSuffix className="font-mono text-[11px] leading-9">
                        .{baseDomain}
                      </InputGroupSuffix>
                    ) : null}
                  </InputGroup>
                </div>
              ) : null}

              {needsHostPort ? (
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-medium text-muted-foreground">Host port</Label>
                  <Input
                    aria-label="Host port"
                    className="h-9 rounded-[7px] font-mono text-[12px] shadow-none"
                    inputMode="numeric"
                    onChange={(event) => onDraftChangeAction('hostPort', event.target.value)}
                    placeholder="e.g. 27017"
                    value={draftApp.hostPort}
                  />
                </div>
              ) : null}

              {repositoryState.error || branchError ? (
                <WorkspaceNotice>{repositoryState.error ?? branchError}</WorkspaceNotice>
              ) : null}

              {!repositoryState.tokenConfigured && repositoryState.hasLoaded ? (
                <div className="rounded-[7px] border border-border bg-[var(--surface-subtle)] px-3 py-2 text-[12px] text-muted-foreground">
                  Configure a GitHub token to browse private repositories.
                </div>
              ) : null}

              <div className="mt-1 grid grid-cols-3 gap-2 border-t border-[var(--hairline)] pt-4 max-[560px]:grid-cols-1">
                <div className="rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-subtle)] p-2.5">
                  <span className="font-mono text-[10px] font-semibold tracking-[0.08em] text-[var(--quiet)] uppercase">
                    Source
                  </span>
                  <span className="mt-1 flex items-center gap-1.5 truncate font-mono text-[11px] font-semibold">
                    <GitBranch aria-hidden="true" className="size-3 text-[var(--orange)]" />
                    {draftApp.branch || 'default'}
                  </span>
                </div>
                <div className="rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-subtle)] p-2.5">
                  <span className="font-mono text-[10px] font-semibold tracking-[0.08em] text-[var(--quiet)] uppercase">
                    Build
                  </span>
                  <span className="mt-1 block truncate font-mono text-[11px] font-semibold">
                    Auto-detect
                  </span>
                </div>
                <div className="rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-subtle)] p-2.5">
                  <span className="font-mono text-[10px] font-semibold tracking-[0.08em] text-[var(--quiet)] uppercase">
                    Runtime
                  </span>
                  <span className="mt-1 block truncate font-mono text-[11px] font-semibold">
                    port {draftApp.port || '—'}
                  </span>
                </div>
              </div>
            </div>

            <footer className="flex items-center justify-end gap-2 border-t border-[var(--hairline)] bg-[var(--surface-subtle)] px-4 py-3">
              <Button onClick={onToggleCreateAppAction} type="button" variant="secondary">
                Cancel
              </Button>
              <Button
                className="border-[var(--orange)] bg-[var(--orange)] text-white shadow-none hover:bg-[#dc6f13]"
                disabled={isCreateDisabled}
                type="submit"
              >
                {isCreateAppPending ? 'Deploying…' : 'Deploy app'}
                {!isCreateAppPending ? <Plus aria-hidden="true" className="size-3.5" /> : null}
              </Button>
            </footer>
          </form>
        </WorkspaceDialog>
      ) : null}
    </div>
  );
}
