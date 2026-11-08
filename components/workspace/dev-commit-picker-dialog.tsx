'use client';

import { useEffect, useState } from 'react';
import { ArrowSquareOut, GitCommit, SpinnerGap } from '@phosphor-icons/react';
import { toast } from 'sonner';

import { WorkspaceDialog } from '@/components/workspace/workspace-dialog';
import { WorkspaceNotice } from '@/components/workspace/workspace-notice';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDevDateTime, formatDevRelativeTime } from '@/lib/dev-format';
import type { DevProject, DevProjectCommits } from '@/lib/dev-types';

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

  async function handleDeploy(commitSha: string) {
    setPendingSha(commitSha);

    try {
      await onDeployAction(commitSha);
      onCloseAction();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to deploy that commit.');
    } finally {
      setPendingSha(null);
    }
  }

  return (
    <WorkspaceDialog
      className="max-w-[760px]"
      onCloseAction={onCloseAction}
      title={`Deploy a commit from ${project.branch}`}
    >
      <header className="flex items-start justify-between gap-4 border-b border-[var(--hairline)] px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-[16px] font-semibold tracking-tight">Deploy a commit</h2>
            <Badge variant="secondary">{project.branch}</Badge>
          </div>
          <p className="mt-1 text-[11px] leading-5 text-[var(--quiet)]">
            Recent commits from {project.repositoryOwner}/{project.repositoryName}. Deploying an
            older commit creates a new isolated preview; existing previews stay online.
          </p>
        </div>
        <button
          aria-label="Close commit picker"
          className="text-[var(--quiet)] hover:text-foreground"
          onClick={onCloseAction}
          type="button"
        >
          ×
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {error ? <WorkspaceNotice>{error}</WorkspaceNotice> : null}

        {isLoading ? (
          <div className="flex items-center gap-2 py-8 text-[11px] text-[var(--quiet)]">
            <SpinnerGap aria-hidden="true" className="size-4 animate-spin" />
            Loading commits from GitHub…
          </div>
        ) : null}

        {!isLoading && !error && payload?.commits.length === 0 ? (
          <div className="py-8 text-center text-[11px] text-[var(--quiet)]">
            No commits were returned for this branch.
          </div>
        ) : null}

        {payload?.commits.length ? (
          <div className="divide-y divide-[var(--hairline)] overflow-hidden rounded-[8px] border border-[var(--hairline)]">
            {payload.commits.map((commit) => (
              <div
                className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5"
                key={commit.sha}
              >
                <div className="flex min-w-0 items-start gap-2.5">
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-[6px] bg-[var(--surface-subtle)] text-[var(--quiet)]">
                    <GitCommit aria-hidden="true" className="size-3.5" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[10px] text-[var(--blue)]">
                        {commit.shortSha}
                      </span>
                      <span
                        className="min-w-0 truncate text-[12px] font-medium"
                        title={commit.message}
                      >
                        {commit.message}
                      </span>
                      {commit.deployed ? <Badge variant="success">Deployed</Badge> : null}
                    </div>
                    <p className="mt-0.5 text-[10px] text-[var(--quiet)]">
                      {commit.authorName ?? 'Unknown author'} ·{' '}
                      <span title={formatDevDateTime(commit.committedAt)}>
                        {formatDevRelativeTime(commit.committedAt)}
                      </span>
                      {commit.url ? (
                        <>
                          {' · '}
                          <a
                            className="hover:text-[var(--blue)] hover:underline"
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
                </div>

                <Button
                  disabled={pendingSha !== null || commit.deployed}
                  onClick={() => void handleDeploy(commit.sha)}
                  type="button"
                  variant="secondary"
                >
                  {pendingSha === commit.sha ? (
                    <SpinnerGap aria-hidden="true" className="size-3.5 animate-spin" />
                  ) : null}
                  {commit.deployed ? 'Deployed' : 'Deploy'}
                </Button>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </WorkspaceDialog>
  );
}
