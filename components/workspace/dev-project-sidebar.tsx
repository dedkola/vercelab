'use client';

import { useMemo } from 'react';
import { GitBranch, MagnifyingGlass, Plus, SpinnerGap, WarningCircle } from '@phosphor-icons/react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getDevStatusLabel, getDevStatusVariant, formatDevRelativeTime } from '@/lib/dev-format';
import type { DevDeployment, DevProject } from '@/lib/dev-types';
import { cn } from '@/lib/utils';

type DevProjectSidebarProps = {
  deployments: DevDeployment[];
  isRefreshing: boolean;
  onConnectAction: () => void;
  onSearchQueryChangeAction: (value: string) => void;
  onSelectProjectAction: (projectId: string) => void;
  projects: DevProject[];
  searchQuery: string;
  selectedProjectId: string | null;
};

type ProjectSummary = {
  failed: number;
  latestDeployment: DevDeployment | null;
  previewCount: number;
  running: number;
};

export function DevProjectSidebar({
  deployments,
  isRefreshing,
  onConnectAction,
  onSearchQueryChangeAction,
  onSelectProjectAction,
  projects,
  searchQuery,
  selectedProjectId,
}: DevProjectSidebarProps) {
  const summaries = useMemo(() => {
    const map = new Map<string, ProjectSummary>();

    for (const project of projects) {
      map.set(project.id, {
        failed: 0,
        latestDeployment: null,
        previewCount: 0,
        running: 0,
      });
    }

    for (const deployment of deployments) {
      const summary = map.get(deployment.projectId);

      if (!summary) {
        continue;
      }

      summary.previewCount += 1;
      summary.latestDeployment ??= deployment;

      if (deployment.status === 'running') {
        summary.running += 1;
      }

      if (deployment.status === 'failed') {
        summary.failed += 1;
      }
    }

    return map;
  }, [deployments, projects]);

  const filteredProjects = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) {
      return projects;
    }

    return projects.filter((project) =>
      [
        project.appName,
        project.repositoryOwner,
        project.repositoryName,
        project.branch,
        project.appSlug,
      ]
        .join(' ')
        .toLowerCase()
        .includes(query)
    );
  }, [projects, searchQuery]);

  return (
    <aside className="flex w-[19rem] shrink-0 flex-col overflow-hidden border-r border-[var(--hairline)] bg-[var(--surface-subtle)] max-[960px]:w-full max-[960px]:max-h-[42dvh] max-[960px]:border-b max-[960px]:border-r-0">
      <div className="border-b border-[var(--hairline)] bg-white px-3 py-3">
        <div className="flex min-h-8 items-center justify-between gap-2">
          <h1 className="vercelab-page-heading">
            Dev{' '}
            <span className="vercelab-page-count">
              {projects.length} project{projects.length === 1 ? '' : 's'}
            </span>
          </h1>
          {isRefreshing ? (
            <SpinnerGap
              aria-label="Refreshing Dev state"
              className="size-3.5 animate-spin text-[var(--quiet)]"
            />
          ) : null}
        </div>

        <Button
          className="mt-3 h-9 w-full rounded-[7px] border-[var(--blue)] bg-[var(--blue)] text-[12px] text-white shadow-none hover:bg-[#0d55bc]"
          onClick={onConnectAction}
          type="button"
        >
          <Plus aria-hidden="true" className="size-3.5" />
          Connect repository
        </Button>

        <div className="relative mt-3">
          <MagnifyingGlass
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--quiet)]"
          />
          <Input
            aria-label="Search Dev projects"
            className="h-9 rounded-[7px] bg-white pl-8 text-[12px] shadow-none"
            onChange={(event) => onSearchQueryChangeAction(event.target.value)}
            placeholder="Find project or repository"
            value={searchQuery}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {filteredProjects.length === 0 ? (
          <div className="px-2 py-8 text-center text-[11px] leading-5 text-[var(--quiet)]">
            {projects.length === 0
              ? 'No repositories connected yet.'
              : 'No projects match your search.'}
          </div>
        ) : (
          <div className="space-y-1.5">
            {filteredProjects.map((project) => {
              const summary = summaries.get(project.id);
              const latest = summary?.latestDeployment ?? null;
              const selected = project.id === selectedProjectId;

              return (
                <button
                  aria-current={selected ? 'page' : undefined}
                  className={cn(
                    'group w-full rounded-[8px] border px-2.5 py-2 text-left transition-colors',
                    selected
                      ? 'border-blue-200 bg-[var(--blue-soft)]'
                      : 'border-transparent bg-transparent hover:border-[var(--hairline)] hover:bg-white'
                  )}
                  key={project.id}
                  onClick={() => onSelectProjectAction(project.id)}
                  type="button"
                >
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-[12px] font-semibold tracking-tight">
                        {project.appName}
                      </div>
                      <div className="mt-0.5 truncate font-mono text-[10px] text-[var(--quiet)]">
                        {project.repositoryOwner}/{project.repositoryName}
                      </div>
                    </div>
                    {latest ? (
                      <Badge className="mt-0.5" variant={getDevStatusVariant(latest.status)}>
                        {getDevStatusLabel(latest.status)}
                      </Badge>
                    ) : (
                      <Badge className="mt-0.5" variant="outline">
                        Idle
                      </Badge>
                    )}
                  </div>

                  <div className="mt-2 flex min-w-0 items-center gap-2 text-[10px] text-[var(--quiet)]">
                    <span className="inline-flex min-w-0 items-center gap-1 truncate">
                      <GitBranch aria-hidden="true" className="size-3" />
                      {project.branch}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {summary?.previewCount ?? 0} preview{summary?.previewCount === 1 ? '' : 's'}
                    </span>
                    {summary?.running ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-[var(--green)]">{summary.running} running</span>
                      </>
                    ) : null}
                    {summary?.failed ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-[var(--red)]">{summary.failed} failed</span>
                      </>
                    ) : null}
                  </div>

                  <div className="mt-1 flex min-w-0 items-center justify-between gap-2 text-[10px] text-[var(--quiet)]">
                    <span className="truncate">
                      {latest
                        ? `Updated ${formatDevRelativeTime(latest.updatedAt)}`
                        : 'Waiting for first push'}
                    </span>
                    {project.lastPollError ? (
                      <span
                        className="inline-flex shrink-0 items-center gap-1 text-[var(--warning-ink)]"
                        title={project.lastPollError}
                      >
                        <WarningCircle aria-hidden="true" className="size-3" />
                        Sync
                      </span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
