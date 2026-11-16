'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowSquareOut,
  CheckCircle,
  MagnifyingGlass,
  RocketLaunch,
  SpinnerGap,
  X,
} from '@phosphor-icons/react';
import { toast } from 'sonner';

import { SelectionCheckbox } from '@/components/workspace/selection-checkbox';
import { WorkspaceDialog } from '@/components/workspace/workspace-dialog';
import { WorkspaceNotice } from '@/components/workspace/workspace-notice';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatDevDateTime, formatDevRelativeTime } from '@/lib/dev-format';
import type { DevProject, DevProjectCommits } from '@/lib/dev-types';
import { cn } from '@/lib/utils';

type DevCommitPickerDialogProps = {
  onCloseAction: () => void;
  onDeployAction: (commitSha: string) => Promise<void>;
  project: DevProject;
};

export function DevCommitPickerDialog({
  onCloseAction,
  onDeployAction,
  project,
}: DevCommitPickerDialogProps) {
  const [payload, setPayload] = useState<DevProjectCommits | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingSha, setPendingSha] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedShas, setSelectedShas] = useState<string[]>([]);
  const [queueProgress, setQueueProgress] = useState<{ index: number; total: number } | null>(null);

  const commits = useMemo(() => payload?.commits ?? [], [payload]);
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredCommits = useMemo(
    () =>
      normalizedQuery
        ? commits.filter((commit) =>
            [commit.message, commit.authorName ?? '', commit.shortSha, commit.sha].some((value) =>
              value.toLowerCase().includes(normalizedQuery)
            )
          )
        : commits,
    [commits, normalizedQuery]
  );

  const isBusy = pendingSha !== null;
  const selectableShas = useMemo(
    () => filteredCommits.filter((commit) => !commit.deployed).map((commit) => commit.sha),
    [filteredCommits]
  );
  const selectedCount = selectedShas.length;
  const selectedVisibleCount = selectableShas.filter((sha) => selectedShas.includes(sha)).length;
  const allVisibleSelected =
    selectableShas.length > 0 && selectedVisibleCount === selectableShas.length;

  function toggleCommit(sha: string) {
    setSelectedShas((current) =>
      current.includes(sha) ? current.filter((item) => item !== sha) : [...current, sha]
    );
  }

  function toggleAllVisible() {
    setSelectedShas((current) =>
      allVisibleSelected
        ? current.filter((sha) => !selectableShas.includes(sha))
        : [...new Set([...current, ...selectableShas])]
    );
  }

  useEffect(() => {
    let cancelled = false;

    const loadCommits = async () => {
      try {
        const response = await fetch(`/api/dev/projects/${project.id}/commits`, {
          cache: 'no-store',
        });
        const body = (await response.json()) as DevProjectCommits | { error?: string };

        if (!response.ok) {
          throw new Error(
            'error' in body && body.error ? body.error : 'Unable to load repository commits.'
          );
        }

        if (!cancelled) {
          setPayload(body as DevProjectCommits);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error ? loadError.message : 'Unable to load repository commits.'
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadCommits();

    return () => {
      cancelled = true;
    };
  }, [project.id]);

  async function reloadCommits() {
    try {
      const response = await fetch(`/api/dev/projects/${project.id}/commits`, {
        cache: 'no-store',
      });

      if (!response.ok) {
        return;
      }

      setPayload((await response.json()) as DevProjectCommits);
    } catch {
      // The queued previews already succeeded; keeping the stale list is harmless.
    }
  }

  async function handleDeploy(commitSha: string) {
    setPendingSha(commitSha);

    try {
      await onDeployAction(commitSha);
      setSelectedShas((current) => current.filter((sha) => sha !== commitSha));
      onCloseAction();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to deploy that commit.');
    } finally {
      setPendingSha(null);
    }
  }

  async function handleDeploySelected() {
    const commitBySha = new Map(commits.map((commit) => [commit.sha, commit]));
    const queue = selectedShas
      .map((sha) => commitBySha.get(sha))
      .filter((commit): commit is DevProjectCommits['commits'][number] => Boolean(commit))
      .filter((commit) => !commit.deployed)
      .sort(
        (left, right) =>
          new Date(left.committedAt ?? 0).getTime() - new Date(right.committedAt ?? 0).getTime()
      )
      .map((commit) => commit.sha);

    if (queue.length === 0) {
      return;
    }

    const failedShas: string[] = [];
    setQueueProgress({ index: 0, total: queue.length });

    for (const [index, sha] of queue.entries()) {
      setQueueProgress({ index, total: queue.length });
      setPendingSha(sha);

      try {
        await onDeployAction(sha);
      } catch (error) {
        failedShas.push(sha);
        toast.error(
          `${commitBySha.get(sha)?.shortSha ?? sha.slice(0, 7)}: ${error instanceof Error ? error.message : 'Unable to deploy that commit.'}`
        );
      }
    }

    setPendingSha(null);
    setQueueProgress(null);

    if (failedShas.length === 0) {
      setSelectedShas([]);
      onCloseAction();
      return;
    }

    setSelectedShas(failedShas);
    await reloadCommits();
    toast.error(
      `${failedShas.length} of ${queue.length} preview build${queue.length === 1 ? '' : 's'} could not be queued.`
    );
  }

  return (
    <WorkspaceDialog
      className="max-w-[760px]"
      onCloseAction={onCloseAction}
      title={`Deploy a commit from ${project.branch}`}
    >
      <header className="flex items-start justify-between gap-4 border-b border-[var(--hairline)] px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold tracking-tight">Deploy a commit</h2>
            <Badge variant="secondary">{project.branch}</Badge>
          </div>
          <p className="mt-1 text-xs leading-5 text-[var(--quiet)]">
            Recent commits from {project.repositoryOwner}/{project.repositoryName}. Deploying an
            older commit creates a new isolated preview; existing previews stay online. Select
            several to queue them one at a time, oldest first.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <MagnifyingGlass
                aria-hidden="true"
                className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--quiet)]"
              />
              <Input
                aria-label="Search commits"
                className="h-9 rounded-[7px] bg-[var(--surface-subtle)] pl-8 pr-8 text-body shadow-none"
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search commits by message, author, or SHA"
                value={searchQuery}
              />
              {searchQuery ? (
                <button
                  aria-label="Clear commit search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-[4px] p-0.5 text-[var(--quiet)] hover:text-foreground"
                  onClick={() => setSearchQuery('')}
                  type="button"
                >
                  <X aria-hidden="true" className="size-3.5" />
                </button>
              ) : null}
            </div>
            {normalizedQuery ? (
              <span className="shrink-0 font-mono text-2xs text-[var(--quiet)]">
                {filteredCommits.length} of {commits.length}
              </span>
            ) : null}
          </div>
        </div>
        <Button
          aria-label="Close commit picker"
          className="-mr-1.5 -mt-0.5"
          onClick={onCloseAction}
          size="icon"
          type="button"
          variant="ghost"
        >
          <X aria-hidden="true" className="size-4" />
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {error ? <WorkspaceNotice>{error}</WorkspaceNotice> : null}

        {isLoading ? (
          <div className="flex items-center gap-2 py-8 text-xs text-[var(--quiet)]">
            <SpinnerGap aria-hidden="true" className="size-4 animate-spin" />
            Loading commits from GitHub…
          </div>
        ) : null}

        {!isLoading && !error && payload?.commits.length === 0 ? (
          <div className="py-8 text-center text-xs text-[var(--quiet)]">
            No commits were returned for this branch.
          </div>
        ) : null}

        {!isLoading && !error && commits.length > 0 && filteredCommits.length === 0 ? (
          <div className="rounded-[8px] border border-dashed border-[var(--hairline)] px-3 py-8 text-center">
            <p className="text-xs text-[var(--quiet)]">
              No commits match &ldquo;{searchQuery.trim()}&rdquo;.
            </p>
            <Button
              className="mt-2"
              onClick={() => setSearchQuery('')}
              size="xs"
              type="button"
              variant="ghost"
            >
              Clear search
            </Button>
          </div>
        ) : null}

        {selectedCount > 0 || (commits.length > 0 && selectableShas.length > 0) ? (
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--quiet)]">
              <SelectionCheckbox
                ariaLabel="Select all commits"
                checked={allVisibleSelected}
                disabled={isBusy || selectableShas.length === 0}
                indeterminate={selectedVisibleCount > 0 && !allVisibleSelected}
                onChange={toggleAllVisible}
              />
              {normalizedQuery ? 'Select matches' : 'Select all'}
            </label>
            {selectedCount > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold">
                  {selectedCount} commit{selectedCount === 1 ? '' : 's'} selected
                </span>
                <span className="hidden text-2xs text-[var(--quiet)] sm:inline">
                  · queued one at a time, oldest first
                </span>
                <Button
                  disabled={isBusy}
                  onClick={() => setSelectedShas([])}
                  size="xs"
                  type="button"
                  variant="ghost"
                >
                  Clear
                </Button>
                <Button
                  disabled={isBusy}
                  onClick={() => void handleDeploySelected()}
                  size="xs"
                  type="button"
                  variant="primary"
                >
                  {isBusy ? (
                    <SpinnerGap aria-hidden="true" className="size-3 animate-spin" />
                  ) : (
                    <RocketLaunch aria-hidden="true" className="size-3" />
                  )}
                  {queueProgress
                    ? `Deploying ${queueProgress.index + 1}/${queueProgress.total}…`
                    : `Deploy ${selectedCount} commit${selectedCount === 1 ? '' : 's'}`}
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        {filteredCommits.length ? (
          <div className="divide-y divide-[var(--hairline)] overflow-hidden rounded-[8px] border border-[var(--hairline)]">
            {filteredCommits.map((commit) => {
              const isSelected = selectedShas.includes(commit.sha);

              return (
                <div
                  className={cn(
                    'grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 transition-colors duration-150',
                    isSelected ? 'bg-[var(--ink)]/[0.035]' : 'hover:bg-[var(--ink)]/[0.02]'
                  )}
                  key={commit.sha}
                >
                  <SelectionCheckbox
                    ariaLabel={`Select commit ${commit.shortSha}`}
                    checked={isSelected}
                    disabled={isBusy || commit.deployed}
                    onChange={() => toggleCommit(commit.sha)}
                    title={commit.deployed ? 'Already deployed' : undefined}
                  />
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-baseline gap-2">
                      <span className="shrink-0 font-mono text-2xs text-[var(--muted-ink)]">
                        {commit.shortSha}
                      </span>
                      <span
                        className="min-w-0 truncate text-body font-medium"
                        title={commit.message}
                      >
                        {commit.message}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-2xs text-[var(--quiet)]">
                      {commit.authorName ?? 'Unknown author'} ·{' '}
                      <span title={formatDevDateTime(commit.committedAt)}>
                        {formatDevRelativeTime(commit.committedAt)}
                      </span>
                      {commit.url ? (
                        <>
                          {' · '}
                          <a
                            className="hover:text-foreground hover:underline"
                            href={commit.url}
                            rel="noopener noreferrer"
                            target="_blank"
                          >
                            GitHub <ArrowSquareOut aria-hidden="true" className="inline size-2.5" />
                          </a>
                        </>
                      ) : null}
                    </p>
                  </div>

                  {commit.deployed ? (
                    <span className="inline-flex h-6 items-center gap-1 px-2 text-2xs font-medium text-[var(--green)]">
                      <CheckCircle aria-hidden="true" className="size-3.5" weight="fill" />
                      Deployed
                    </span>
                  ) : (
                    <Button
                      aria-label={`Deploy commit ${commit.shortSha}`}
                      disabled={pendingSha !== null}
                      onClick={() => void handleDeploy(commit.sha)}
                      size="xs"
                      type="button"
                    >
                      {pendingSha === commit.sha ? (
                        <SpinnerGap aria-hidden="true" className="size-3 animate-spin" />
                      ) : (
                        <RocketLaunch aria-hidden="true" className="size-3" />
                      )}
                      Deploy
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </WorkspaceDialog>
  );
}
