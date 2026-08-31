'use client';

import { Button, Input, Popover, Tabs } from '@cloudflare/kumo';
import { ChartLineUp, GearSix } from '@phosphor-icons/react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';

import type { WorkspaceView } from '@/components/workspace-shell';
import type { GitHubRepository } from '@/lib/github';
import { getLocalTimeZoneLabel, type TimeDisplayMode } from '@/lib/time-display';

type WorkspaceHeaderProps = {
  activeView: WorkspaceView;
  influxExplorerUrl?: string | null;
  onGithubTokenSavedAction?: (payload: {
    repositories: GitHubRepository[];
    tokenConfigured: boolean;
  }) => void;
  onInfluxExplorerOpenAction?: () => void;
  onResetLayoutAction: () => void;
  onTimeDisplayModeChangeAction?: (mode: TimeDisplayMode) => void;
  onViewChangeAction: (view: WorkspaceView) => void;
  statusLabel: string;
  timeDisplayMode?: TimeDisplayMode;
  updatedAtLabel: string;
};

const NAVIGATION_TABS = [
  { label: 'Overview', value: 'dashboard' },
  { label: 'Apps', value: 'git-app-page' },
  { label: 'Containers', value: 'containers' },
  { label: 'Terminal', value: 'terminal' },
] satisfies Array<{ label: string; value: WorkspaceView }>;

export function WorkspaceHeader({
  activeView,
  influxExplorerUrl,
  onGithubTokenSavedAction,
  onInfluxExplorerOpenAction,
  onResetLayoutAction,
  onTimeDisplayModeChangeAction,
  onViewChangeAction,
  statusLabel,
  timeDisplayMode = 'local',
  updatedAtLabel,
}: WorkspaceHeaderProps) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [githubToken, setGithubToken] = useState('');
  const [githubTokenError, setGithubTokenError] = useState<string | null>(null);
  const [isSavingGithubToken, setIsSavingGithubToken] = useState(false);
  const localTimeZoneLabel = getLocalTimeZoneLabel();

  async function handleSaveGithubToken(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const token = githubToken.trim();

    if (token.length < 20) {
      setGithubTokenError('GitHub token looks too short.');
      return;
    }

    setGithubTokenError(null);
    setIsSavingGithubToken(true);

    try {
      const response = await fetch('/api/github/token', {
        body: JSON.stringify({ token }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      });
      const payload = (await response.json()) as {
        error?: string;
        repositories?: GitHubRepository[];
        tokenConfigured?: boolean;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Unable to update GitHub token.');
      }

      onGithubTokenSavedAction?.({
        repositories: payload.repositories ?? [],
        tokenConfigured: Boolean(payload.tokenConfigured),
      });
      setGithubToken('');
      setIsSettingsOpen(false);
      toast.success('GitHub token saved to .env');
    } catch (error) {
      setGithubTokenError(
        error instanceof Error ? error.message : 'Unable to update GitHub token.'
      );
    } finally {
      setIsSavingGithubToken(false);
    }
  }

  return (
    <header className="vercelab-topbar shrink-0 border-b border-[var(--hairline)] bg-[rgb(255_255_255_/_0.94)] backdrop-blur-xl">
      <div className="mx-auto grid min-h-11 w-full max-w-[1680px] grid-cols-[minmax(12rem,1fr)_auto_minmax(12rem,1fr)] items-center gap-4 px-6 max-[960px]:grid-cols-[1fr_auto] max-[760px]:px-3">
        <div className="flex min-w-0 items-center gap-2.5 whitespace-nowrap" aria-label="Vercelab">
          <span className="vercelab-brand-mark" aria-hidden="true" />
          <span className="text-[11px] font-semibold tracking-[0.08em]">VERCELAB / LOCAL</span>
        </div>

        <nav
          aria-label="Workspace"
          className="max-[960px]:order-3 max-[960px]:col-span-2 max-[960px]:w-full max-[960px]:overflow-x-auto max-[960px]:pb-1.5"
        >
          <Tabs
            activateOnFocus
            className="w-max"
            onValueChange={(value) => onViewChangeAction(value as WorkspaceView)}
            size="sm"
            tabs={NAVIGATION_TABS}
            value={activeView}
            variant="segmented"
          />
        </nav>

        <div className="flex min-w-0 items-center justify-end gap-2">
          <span className="flex items-center gap-1.5 text-[9px] font-semibold tracking-[0.04em] text-[var(--green)] uppercase max-[760px]:[&>span:last-child]:hidden">
            <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
            <span>{statusLabel}</span>
          </span>
          <time className="max-w-28 truncate font-mono text-[9px] text-[var(--quiet)] max-[760px]:hidden">
            {updatedAtLabel}
          </time>

          {influxExplorerUrl ? (
            <Button
              aria-label="Influx Explorer"
              icon={ChartLineUp}
              onClick={onInfluxExplorerOpenAction}
              shape="square"
              size="sm"
              title="Influx Explorer"
              variant="ghost"
            />
          ) : null}

          <Popover open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
            <Popover.Trigger
              render={
                <Button
                  aria-label="Open settings"
                  icon={GearSix}
                  shape="square"
                  size="sm"
                  title="Settings"
                  variant="ghost"
                />
              }
            />
            <Popover.Content
              align="end"
              className="w-[min(calc(100vw-2rem),23rem)] rounded-[10px] border border-[var(--hairline)] bg-[var(--surface)] p-1 shadow-[0_20px_50px_rgb(16_24_40_/_0.13)]"
              positionMethod="fixed"
              side="bottom"
              sideOffset={8}
            >
              <Popover.Title className="sr-only">Workspace settings</Popover.Title>
              <form className="p-3" onSubmit={handleSaveGithubToken}>
                <div>
                  <div className="text-sm font-semibold">GitHub access</div>
                  <div className="mt-1 font-mono text-[9px] text-[var(--quiet)]">
                    Stored server-side in .env
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <Input
                    aria-label="GitHub token"
                    autoComplete="off"
                    className="min-w-0 flex-1 font-mono text-xs"
                    onChange={(event) => {
                      setGithubToken(event.target.value);
                      setGithubTokenError(null);
                    }}
                    placeholder="github_pat_..."
                    type="password"
                    value={githubToken}
                  />
                  <Button loading={isSavingGithubToken} size="sm" type="submit" variant="primary">
                    Save
                  </Button>
                </div>
                {githubTokenError ? (
                  <p className="mt-2 font-mono text-[9px] text-[var(--red)]">{githubTokenError}</p>
                ) : null}
              </form>

              {onTimeDisplayModeChangeAction ? (
                <div className="border-t border-[var(--hairline)] p-3">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold">Graph time</div>
                      <div className="mt-1 max-w-40 truncate font-mono text-[9px] text-[var(--quiet)]">
                        {timeDisplayMode === 'local' ? localTimeZoneLabel : 'Universal time'}
                      </div>
                    </div>
                    <Tabs
                      onValueChange={(value) =>
                        onTimeDisplayModeChangeAction(value as TimeDisplayMode)
                      }
                      size="sm"
                      tabs={[
                        { label: 'Local', value: 'local' },
                        { label: 'UTC', value: 'utc' },
                      ]}
                      value={timeDisplayMode}
                      variant="segmented"
                    />
                  </div>
                </div>
              ) : null}

              <div className="border-t border-[var(--hairline)] p-3">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold">Layout</div>
                    <div className="mt-1 font-mono text-[9px] text-[var(--quiet)]">
                      Reset page-specific panels
                    </div>
                  </div>
                  <Button onClick={onResetLayoutAction} size="sm" type="button" variant="secondary">
                    Reset
                  </Button>
                </div>
              </div>
            </Popover.Content>
          </Popover>
        </div>
      </div>
    </header>
  );
}
