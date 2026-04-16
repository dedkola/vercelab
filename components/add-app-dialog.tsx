"use client";

import { useEffect, useState, type FormEvent } from "react";

import { Icon } from "@/components/dashboard-kit";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupInput,
  InputGroupSuffix,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import type { GitHubRepository } from "@/lib/github";

type AddAppDialogProps = {
  baseDomain: string;
  isOpen: boolean;
  isLoading: boolean;
  isCreating: boolean;
  repositories: GitHubRepository[];
  tokenConfigured: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onRepositorySelect: (repositoryId: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  selectedRepositoryId: string;
  selectedRepository: GitHubRepository | null;
};

type DraftFormState = {
  repositoryUrl: string;
  appName: string;
  branch: string;
  subdomain: string;
  port: string;
};

const defaultDraftState: DraftFormState = {
  repositoryUrl: "",
  appName: "",
  branch: "",
  subdomain: "",
  port: "3000",
};

function toAppName(value: string) {
  return value
    .split(/[-_]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function toSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

function buildRepositoryOptions(repositories: GitHubRepository[]) {
  return repositories.map((repository) => ({
    value: String(repository.id),
    label: repository.fullName,
    description: `${repository.visibility} · ${repository.defaultBranch}`,
  }));
}

function buildBranchOptions(branches: string[]) {
  return branches.map((branch) => ({
    value: branch,
    label: branch,
  }));
}

export function AddAppDialog({
  baseDomain,
  isOpen,
  isLoading,
  isCreating,
  repositories,
  tokenConfigured,
  error,
  onOpenChange,
  onRepositorySelect,
  onSubmit,
  selectedRepositoryId,
  selectedRepository,
}: AddAppDialogProps) {
  const [draftState, setDraftState] = useState<DraftFormState>(defaultDraftState);

  useEffect(() => {
    if (!selectedRepository) return;

    const repoName = selectedRepository.name;
    const appName = toAppName(repoName);
    const subdomain = toSlug(repoName);
    const defaultBranch = selectedRepository.defaultBranch || "main";

    setDraftState((current) => ({
      ...current,
      repositoryUrl: selectedRepository.url,
      appName: current.appName || appName,
      branch: current.branch || defaultBranch,
      subdomain: current.subdomain || subdomain,
    }));
  }, [selectedRepository]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit(event);
  };

  const branchOptions = selectedRepository?.branches
    ? buildBranchOptions(selectedRepository.branches)
    : [];

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl border-border/70 bg-card/95 p-0 shadow-2xl backdrop-blur-sm">
        <DialogHeader className="border-b border-border/60 px-6 py-5">
          <DialogTitle className="flex items-center gap-2">
            <Icon name="cloud" className="h-5 w-5" />
            Deploy New App
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Connect a repository, pick a branch, and launch a new deployment.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 px-6 py-5">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="grid gap-4 rounded-xl border border-border/60 bg-muted/20 p-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="repositoryPicker" className="text-sm font-medium">
                Git Repository
              </Label>
              <div id="repositoryPicker">
                <Combobox
                  disabled={!tokenConfigured || isLoading}
                  emptyText={
                    isLoading
                      ? "Loading repositories..."
                      : "No repositories available"
                  }
                  onValueChangeAction={(id) => {
                    onRepositorySelect(id);
                    setDraftState((current) => ({
                      ...current,
                      branch: "",
                    }));
                  }}
                  options={buildRepositoryOptions(repositories)}
                  placeholder={
                    tokenConfigured
                      ? "Select repository"
                      : "Token missing in .env"
                  }
                  searchPlaceholder="Search repositories"
                  value={selectedRepositoryId}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="branch" className="text-sm font-medium">
                Branch
              </Label>
              <div id="branch">
                <Combobox
                  disabled={!selectedRepository || isLoading}
                  emptyText="No branches available"
                  onValueChangeAction={(branch) =>
                    setDraftState((current) => ({
                      ...current,
                      branch,
                    }))
                  }
                  options={branchOptions}
                  placeholder="Select branch"
                  searchPlaceholder="Search branches"
                  value={draftState.branch}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="appName" className="text-sm font-medium">
                App Name
              </Label>
              <Input
                id="appName"
                name="appName"
                onChange={(event) =>
                  setDraftState((current) => ({
                    ...current,
                    appName: event.target.value,
                  }))
                }
                placeholder="e.g., My App"
                required
                type="text"
                value={draftState.appName}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="port" className="text-sm font-medium">
                App Port
              </Label>
              <Input
                id="port"
                max="65535"
                min="1"
                name="port"
                onChange={(event) =>
                  setDraftState((current) => ({
                    ...current,
                    port: event.target.value,
                  }))
                }
                required
                type="number"
                value={draftState.port}
              />
            </div>

            <div className="grid gap-2 md:col-span-2">
              <Label htmlFor="subdomain" className="text-sm font-medium">
                URL
              </Label>
              <InputGroup>
                <InputGroupInput
                  id="subdomain"
                  name="subdomain"
                  onChange={(event) =>
                    setDraftState((current) => ({
                      ...current,
                      subdomain: event.target.value,
                    }))
                  }
                  placeholder="app-name"
                  required
                  type="text"
                  value={draftState.subdomain}
                />
                <InputGroupSuffix className="text-xs">
                  .{baseDomain}
                </InputGroupSuffix>
              </InputGroup>
            </div>
          </div>

          {/* Hidden inputs to pass form data */}
          <input name="repositoryUrl" type="hidden" value={draftState.repositoryUrl} />
          <input name="branch" type="hidden" value={draftState.branch} />

          <div className="flex justify-end gap-2 border-t border-border/60 pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOpenChange(false)}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="default"
              disabled={
                isCreating ||
                isLoading ||
                !selectedRepository ||
                !draftState.appName ||
                !draftState.branch ||
                !draftState.subdomain
              }
            >
              <Icon name="cloud" className="h-3.5 w-3.5" />
              {isCreating ? "Deploying..." : "Deploy App"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
