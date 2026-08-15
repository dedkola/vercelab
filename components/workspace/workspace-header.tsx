'use client';

import { Clock3, Settings, ShieldCheck, Terminal } from 'lucide-react';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import type { GitHubRepository } from '@/lib/github';
import { getLocalTimeZoneLabel, type TimeDisplayMode } from '@/lib/time-display';

type WorkspaceHeaderProps = {
  onGithubTokenSavedAction?: (payload: {
    repositories: GitHubRepository[];
    tokenConfigured: boolean;
  }) => void;
  onResetLayoutAction: () => void;
  onTimeDisplayModeChangeAction?: (mode: TimeDisplayMode) => void;
  timeDisplayMode?: TimeDisplayMode;
  title: string;
};

export function WorkspaceHeader({
  onGithubTokenSavedAction,
  onResetLayoutAction,
  onTimeDisplayModeChangeAction,
  timeDisplayMode = 'local',
  title,
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
    <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-border/70 bg-background/95 px-4 backdrop-blur">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex items-center gap-2 rounded-full border border-border/70 bg-background px-3 py-1">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          <span className="text-sm font-semibold tracking-tight text-foreground">Vercelab</span>
        </div>
        <Separator orientation="vertical" className="hidden h-4 md:block" />
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold tracking-tight text-foreground">{title}</h1>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Button
          aria-label="Open terminal"
          asChild
          className="h-8 w-8 rounded-full px-0"
          size="icon"
          variant="ghost"
        >
          <Link href="/terminal">
            <Terminal className="h-4 w-4" aria-hidden="true" />
          </Link>
        </Button>
        <Popover open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
          <PopoverTrigger asChild>
            <Button
              aria-label="Open settings"
              className="h-8 w-8 rounded-full px-0"
              size="icon"
              type="button"
              variant="ghost"
            >
              <Settings className="h-4 w-4" aria-hidden="true" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="w-[min(calc(100vw-2rem),24rem)] rounded-2xl border-border/70 bg-background/95 p-4 shadow-[0_24px_70px_-38px_rgba(15,23,42,0.5)] backdrop-blur-xl"
          >
            <form className="space-y-4" onSubmit={handleSaveGithubToken}>
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-emerald-200/70 bg-emerald-50 text-emerald-700">
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 space-y-1">
                  <div className="text-sm font-semibold tracking-tight text-foreground">
                    GitHub access
                  </div>
                  <p className="text-xs leading-5 text-muted-foreground">
                    Update the personal access token used for repository browsing. It is validated,
                    then saved to{' '}
                    <span className="font-mono text-[11px] text-foreground">.env</span>.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground" htmlFor="workspace-github-token">
                  GitHub token
                </Label>
                <Input
                  autoComplete="off"
                  className="h-9 font-mono text-xs"
                  id="workspace-github-token"
                  onChange={(event) => {
                    setGithubToken(event.target.value);
                    setGithubTokenError(null);
                  }}
                  placeholder="github_pat_..."
                  type="password"
                  value={githubToken}
                />
              </div>

              {githubTokenError ? (
                <div className="rounded-xl border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-[11px] leading-4 text-amber-800">
                  {githubTokenError}
                </div>
              ) : null}

              <div className="flex items-center justify-between gap-3">
                <span className="text-[11px] text-muted-foreground">
                  Requires repo access for private repositories.
                </span>
                <Button
                  className="h-8 px-3 text-[11px]"
                  disabled={isSavingGithubToken}
                  size="sm"
                  type="submit"
                >
                  {isSavingGithubToken ? 'Saving...' : 'Save token'}
                </Button>
              </div>
            </form>

            {onTimeDisplayModeChangeAction ? (
              <>
                <Separator className="my-4" />
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-sky-200/70 bg-sky-50 text-sky-700">
                      <Clock3 className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 space-y-1">
                      <div className="text-sm font-semibold tracking-tight text-foreground">
                        Graph time
                      </div>
                      <p className="text-xs leading-5 text-muted-foreground">
                        Choose how graph axes, tooltips, and activity times are shown. Metrics stay
                        stored in UTC.
                      </p>
                    </div>
                  </div>

                  <div aria-label="Graph time" className="grid grid-cols-2 gap-2" role="radiogroup">
                    <button
                      aria-checked={timeDisplayMode === 'local'}
                      className={`rounded-xl border px-3 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                        timeDisplayMode === 'local'
                          ? 'border-sky-300 bg-sky-50 text-sky-950'
                          : 'border-border/70 bg-background text-foreground hover:bg-muted/40'
                      }`}
                      onClick={() => onTimeDisplayModeChangeAction('local')}
                      role="radio"
                      type="button"
                    >
                      <span className="block text-xs font-semibold">Local device</span>
                      <span
                        className="mt-0.5 block truncate text-[10px] text-muted-foreground"
                        suppressHydrationWarning
                      >
                        {localTimeZoneLabel}
                      </span>
                    </button>
                    <button
                      aria-checked={timeDisplayMode === 'utc'}
                      className={`rounded-xl border px-3 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                        timeDisplayMode === 'utc'
                          ? 'border-sky-300 bg-sky-50 text-sky-950'
                          : 'border-border/70 bg-background text-foreground hover:bg-muted/40'
                      }`}
                      onClick={() => onTimeDisplayModeChangeAction('utc')}
                      role="radio"
                      type="button"
                    >
                      <span className="block text-xs font-semibold">UTC</span>
                      <span className="mt-0.5 block text-[10px] text-muted-foreground">
                        Universal time
                      </span>
                    </button>
                  </div>
                </div>
              </>
            ) : null}
          </PopoverContent>
        </Popover>
        <Button
          className="h-8 px-3 text-[11px]"
          onClick={onResetLayoutAction}
          size="sm"
          type="button"
          variant="secondary"
        >
          Reset layout
        </Button>
      </div>
    </header>
  );
}
