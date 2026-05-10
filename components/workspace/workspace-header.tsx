"use client";

import { Settings, ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import type { GitHubRepository } from "@/lib/github";

type WorkspaceHeaderStatusPill = {
  label: string;
};

type WorkspaceHeaderProps = {
  activeViewDescription: string;
  activeViewLabel: string;
  activeViewStatusLabel: string;
  onGithubTokenSavedAction?: (payload: {
    repositories: GitHubRepository[];
    tokenConfigured: boolean;
  }) => void;
  onResetLayoutAction: () => void;
  statusPills?: WorkspaceHeaderStatusPill[];
  title: string;
};

export function WorkspaceHeader({
  activeViewLabel,
  activeViewStatusLabel,
  onGithubTokenSavedAction,
  onResetLayoutAction,
  statusPills,
  title,
}: WorkspaceHeaderProps) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [githubToken, setGithubToken] = useState("");
  const [githubTokenError, setGithubTokenError] = useState<string | null>(null);
  const [isSavingGithubToken, setIsSavingGithubToken] = useState(false);

  const headerItems = statusPills?.length
    ? statusPills
    : [
        { label: activeViewStatusLabel },
        { label: activeViewLabel },
        { label: "Shared shell" },
      ];

  async function handleSaveGithubToken(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const token = githubToken.trim();

    if (token.length < 20) {
      setGithubTokenError("GitHub token looks too short.");
      return;
    }

    setGithubTokenError(null);
    setIsSavingGithubToken(true);

    try {
      const response = await fetch("/api/github/token", {
        body: JSON.stringify({ token }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const payload = (await response.json()) as {
        error?: string;
        repositories?: GitHubRepository[];
        tokenConfigured?: boolean;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to update GitHub token.");
      }

      onGithubTokenSavedAction?.({
        repositories: payload.repositories ?? [],
        tokenConfigured: Boolean(payload.tokenConfigured),
      });
      setGithubToken("");
      setIsSettingsOpen(false);
      toast.success("GitHub token saved to .env");
    } catch (error) {
      setGithubTokenError(
        error instanceof Error
          ? error.message
          : "Unable to update GitHub token.",
      );
    } finally {
      setIsSavingGithubToken(false);
    }
  }

  return (
    <header className="flex h-15 shrink-0 items-center justify-between gap-4 border-b border-border/70 bg-linear-to-r from-background/98 via-muted/40 to-background/96 px-4 shadow-[0_20px_48px_-38px_rgba(15,23,42,0.45)] backdrop-blur-xl">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex items-center gap-2 rounded-full border border-border/70 bg-background/85 px-3.5 py-1.5 shadow-[0_16px_36px_-28px_rgba(15,23,42,0.35)]">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          <span className="text-sm font-semibold tracking-tight text-foreground">
            Vercelab
          </span>
        </div>
        <Separator orientation="vertical" className="hidden h-5 md:block" />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold tracking-tight text-foreground">
            {title}
          </div>
        </div>
      </div>

      <div className="hidden min-w-0 flex-1 items-center justify-center overflow-hidden xl:flex">
        <div className="flex min-w-0 flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs font-medium tracking-tight text-muted-foreground/85">
          {headerItems.map((item, index) => (
            <div className="flex min-w-0 items-center gap-3" key={item.label}>
              {index > 0 ? (
                <span
                  aria-hidden="true"
                  className="h-1 w-1 shrink-0 rounded-full bg-border/90"
                />
              ) : null}
              <span className="truncate whitespace-nowrap">{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
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
                    Update the personal access token used for repository
                    browsing. It is validated, then saved to{" "}
                    <span className="font-mono text-[11px] text-foreground">
                      .env
                    </span>
                    .
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label
                  className="text-xs text-muted-foreground"
                  htmlFor="workspace-github-token"
                >
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
                  {isSavingGithubToken ? "Saving..." : "Save token"}
                </Button>
              </div>
            </form>
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
