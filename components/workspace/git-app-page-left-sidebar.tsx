"use client";

import type { FormEvent, MouseEvent as ReactMouseEvent } from "react";

import type {
  DraftAppState,
  RepositoryState,
} from "@/components/workspace-shell";
import { Icon } from "@/components/dashboard-kit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupInput,
  InputGroupSuffix,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

import { ResizeHandle, SectionLabel } from "./workspace-ui";

type SelectOption = {
  description?: string;
  label: string;
  value: string;
};

type GitAppPageListItem = {
  appName: string;
  domain: string;
  dotClassName: string;
  id: string;
  isActive: boolean;
  relativeUpdatedAt: string;
  statusLabel: string;
  statusVariant: "success" | "warning" | "default";
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
  listWidth: number;
  liveAppsCount: number;
  onAppSearchQueryChangeAction: (value: string) => void;
  onCreateAppAction: (
    event: FormEvent<HTMLFormElement>,
  ) => void | Promise<void>;
  onDraftChangeAction: (field: keyof DraftAppState, value: string) => void;
  onListResizeStartAction: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onRepositorySelectAction: (value: string) => void;
  onSelectAppAction: (id: string) => void;
  onToggleCreateAppAction: () => void;
  repositoryOptions: SelectOption[];
  repositoryState: RepositoryState;
  selectedRepositorySummary: string | null;
  selectedRepositoryValue: string;
  totalAppsCount: number;
};

function formatSidebarAppStatusLabel(
  statusVariant: GitAppPageListItem["statusVariant"],
) {
  return statusVariant === "success" ? "Up" : "Dn";
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
  listWidth,
  liveAppsCount,
  onAppSearchQueryChangeAction,
  onCreateAppAction,
  onDraftChangeAction,
  onListResizeStartAction,
  onRepositorySelectAction,
  onSelectAppAction,
  onToggleCreateAppAction,
  repositoryOptions,
  repositoryState,
  selectedRepositorySummary,
  selectedRepositoryValue,
  totalAppsCount,
}: GitAppPageLeftSidebarProps) {
  const isCreateDisabled =
    isCreateAppPending ||
    repositoryState.isLoading ||
    (Boolean(draftApp.repositoryUrl) && isBranchLoading) ||
    !draftApp.repositoryUrl.trim() ||
    !draftApp.appName.trim() ||
    !draftApp.subdomain.trim() ||
    !draftApp.port.trim();

  return (
    <>
      <aside
        className="flex shrink-0 flex-col border-r border-border/70 bg-linear-to-b from-background via-muted/10 to-background shadow-[18px_0_56px_-52px_rgba(15,23,42,0.24)] transition-[width] duration-300"
        style={{ width: `${listWidth}px` }}
      >
        <div className="space-y-3 border-b border-border/60 px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-1">
              <SectionLabel icon="github" text="Git App Page" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge className="border-emerald-200/80 bg-emerald-50/90 text-emerald-700">
                {liveAppsCount} live
              </Badge>
              <Badge className="border-border/60 bg-background/80 text-foreground">
                {totalAppsCount} apps
              </Badge>
            </div>
          </div>
          <div className="relative">
            <Icon
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
              name="search"
            />
            <Input
              aria-label="Search apps"
              className="h-10 rounded-2xl bg-background/80 pl-9 shadow-[0_18px_42px_-30px_rgba(15,23,42,0.22)]"
              onChange={(event) =>
                onAppSearchQueryChangeAction(event.target.value)
              }
              placeholder="Search apps, repos, domains..."
              value={appSearchQuery}
            />
          </div>
        </div>

        <ScrollArea className="h-full">
          <div className="space-y-3 p-3">
            <div className="overflow-hidden rounded-[1.2rem] border border-border/70 bg-background/92 shadow-[0_18px_46px_-40px_rgba(15,23,42,0.24)]">
              <button
                className="flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left"
                onClick={onToggleCreateAppAction}
                type="button"
              >
                <div>
                  <div className="text-sm font-semibold tracking-tight text-foreground">
                    Add Git app
                  </div>
                </div>
                <Icon
                  className="h-4 w-4 text-muted-foreground"
                  name={isCreateAppExpanded ? "chevron-down" : "chevron-right"}
                />
              </button>

              {isCreateAppExpanded ? (
                <form
                  className="grid gap-3 border-t border-border/60 px-3.5 py-3.5"
                  onSubmit={onCreateAppAction}
                >
                  <div className="space-y-1.5">
                    <Combobox
                      ariaLabel="Repository"
                      buttonClassName="h-9 rounded-xl bg-background/80 text-sm shadow-[0_14px_34px_-28px_rgba(15,23,42,0.24)]"
                      disabled={repositoryState.isLoading}
                      emptyText="No repositories found"
                      onValueChangeAction={onRepositorySelectAction}
                      options={repositoryOptions}
                      placeholder={
                        repositoryState.isLoading
                          ? "Loading repositories..."
                          : "Select a repository"
                      }
                      searchPlaceholder="Search repositories"
                      value={selectedRepositoryValue}
                    />
                    {selectedRepositorySummary ? (
                      <div className="text-[11px] text-muted-foreground">
                        {selectedRepositorySummary}
                      </div>
                    ) : null}
                  </div>

                  <div className="space-y-1.5">
                    <Combobox
                      ariaLabel="Branch"
                      buttonClassName="h-9 rounded-xl bg-background/80 text-sm shadow-[0_14px_34px_-28px_rgba(15,23,42,0.24)]"
                      disabled={
                        !selectedRepositoryValue ||
                        isBranchLoading ||
                        branchOptions.length === 0
                      }
                      emptyText={
                        selectedRepositoryValue
                          ? (branchError ?? "No branches found")
                          : "Select a repository first"
                      }
                      onValueChangeAction={(value) =>
                        onDraftChangeAction("branch", value)
                      }
                      options={branchOptions}
                      placeholder={
                        !selectedRepositoryValue
                          ? "Select a repository first"
                          : isBranchLoading
                            ? "Loading branches..."
                            : "Select a branch"
                      }
                      searchPlaceholder="Search branches"
                      value={draftApp.branch}
                    />
                    {branchHelperText ? (
                      <div className="text-[11px] text-muted-foreground">
                        {branchHelperText}
                      </div>
                    ) : null}
                  </div>

                  <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground">
                        App name
                      </Label>
                      <Input
                        className="h-9 rounded-xl bg-background/80"
                        onChange={(event) =>
                          onDraftChangeAction("appName", event.target.value)
                        }
                        value={draftApp.appName}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground">
                        Port
                      </Label>
                      <Input
                        className="h-9 rounded-xl bg-background/80"
                        inputMode="numeric"
                        onChange={(event) =>
                          onDraftChangeAction("port", event.target.value)
                        }
                        value={draftApp.port}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">
                      Subdomain
                    </Label>
                    <InputGroup className="h-9">
                      <InputGroupInput
                        onChange={(event) =>
                          onDraftChangeAction("subdomain", event.target.value)
                        }
                        value={draftApp.subdomain}
                      />
                      {baseDomain ? (
                        <InputGroupSuffix className="leading-9">
                          .{baseDomain}
                        </InputGroupSuffix>
                      ) : null}
                    </InputGroup>
                  </div>

                  {repositoryState.error ? (
                    <div className="rounded-xl border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-[11px] text-amber-800">
                      {repositoryState.error}
                    </div>
                  ) : null}

                  {branchError ? (
                    <div className="rounded-xl border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-[11px] text-amber-800">
                      {branchError}
                    </div>
                  ) : null}

                  {!repositoryState.tokenConfigured &&
                  repositoryState.hasLoaded ? (
                    <div className="rounded-xl border border-border/70 bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
                      Configure a GitHub token to browse repositories from the
                      sidebar.
                    </div>
                  ) : null}

                  <Button
                    className="h-9 w-full rounded-xl"
                    disabled={isCreateDisabled}
                    type="submit"
                  >
                    {isCreateAppPending ? "Creating..." : "Create app"}
                  </Button>
                </form>
              ) : null}
            </div>

            <div className="space-y-1.5">
              {appItems.length ? (
                appItems.map((deployment) => (
                  <button
                    aria-label={`${deployment.appName} ${deployment.domain} ${deployment.statusLabel}`}
                    className={cn(
                      "w-full rounded-md border px-2.5 py-1.5 text-left transition-colors duration-200",
                      deployment.isActive
                        ? "border-emerald-300/80 bg-emerald-50/75"
                        : "border-border/70 bg-background/85 hover:bg-muted/55",
                    )}
                    key={deployment.id}
                    onClick={() => onSelectAppAction(deployment.id)}
                    type="button"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-xs font-medium tracking-tight text-foreground">
                        {deployment.appName}
                      </span>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.08em]",
                          deployment.statusVariant === "success"
                            ? "text-emerald-700"
                            : deployment.statusVariant === "warning"
                              ? "text-amber-700"
                              : "text-muted-foreground",
                        )}
                      >
                        <span
                          className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            deployment.dotClassName,
                          )}
                        />
                        {formatSidebarAppStatusLabel(deployment.statusVariant)}
                      </span>
                    </div>
                  </button>
                ))
              ) : (
                <div className="rounded-[1.2rem] border border-dashed border-border/70 bg-background/70 px-4 py-6 text-sm text-muted-foreground">
                  No apps match the current filter.
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </aside>

      <ResizeHandle onMouseDown={onListResizeStartAction} />
    </>
  );
}
