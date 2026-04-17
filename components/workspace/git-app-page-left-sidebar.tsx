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

import {
  HostMetricsSidebar,
  type HostMetricsSidebarProps,
} from "./host-metrics-sidebar";
import { ResizeHandle, SectionLabel, usePixelWidthRef } from "./workspace-ui";

type RepositoryOption = {
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
  draftApp: DraftAppState;
  hostMetricsProps: HostMetricsSidebarProps;
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
  repositoryOptions: RepositoryOption[];
  repositoryState: RepositoryState;
  selectedRepositoryValue: string;
  totalAppsCount: number;
};

export function GitAppPageLeftSidebar({
  appItems,
  appSearchQuery,
  baseDomain,
  draftApp,
  hostMetricsProps,
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
  selectedRepositoryValue,
  totalAppsCount,
}: GitAppPageLeftSidebarProps) {
  const listPanelRef = usePixelWidthRef<HTMLElement>(listWidth);

  return (
    <>
      <HostMetricsSidebar {...hostMetricsProps} />

      <aside
        className="flex shrink-0 flex-col border-r border-border/70 bg-linear-to-b from-background via-muted/10 to-background shadow-[18px_0_56px_-52px_rgba(15,23,42,0.24)] transition-[width] duration-300"
        ref={listPanelRef}
      >
        <div className="space-y-3 border-b border-border/60 px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-1">
              <SectionLabel icon="github" text="Git App Page" />
              <div className="text-xs text-muted-foreground">
                Compact create flow and live deployment inventory.
              </div>
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
            <div className="overflow-hidden rounded-[1.35rem] border border-border/70 bg-background/88 shadow-[0_20px_56px_-46px_rgba(15,23,42,0.28)]">
              <button
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                onClick={onToggleCreateAppAction}
                type="button"
              >
                <div>
                  <div className="text-sm font-semibold tracking-tight text-foreground">
                    New GitHub app
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Pick a repo, branch, port, and subdomain.
                  </div>
                </div>
                <Icon
                  className="h-4 w-4 text-muted-foreground"
                  name={isCreateAppExpanded ? "chevron-down" : "chevron-right"}
                />
              </button>

              {isCreateAppExpanded ? (
                <form
                  className="space-y-3 border-t border-border/60 px-4 py-4"
                  onSubmit={onCreateAppAction}
                >
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">
                      Repository
                    </Label>
                    <Combobox
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
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
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
                        Branch
                      </Label>
                      <Input
                        className="h-9 rounded-xl bg-background/80"
                        onChange={(event) =>
                          onDraftChangeAction("branch", event.target.value)
                        }
                        value={draftApp.branch}
                      />
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_7rem]">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground">
                        Subdomain
                      </Label>
                      <InputGroup>
                        <InputGroupInput
                          onChange={(event) =>
                            onDraftChangeAction("subdomain", event.target.value)
                          }
                          value={draftApp.subdomain}
                        />
                        {baseDomain ? (
                          <InputGroupSuffix>.{baseDomain}</InputGroupSuffix>
                        ) : null}
                      </InputGroup>
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

                  {repositoryState.error ? (
                    <div className="rounded-xl border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-xs text-amber-800">
                      {repositoryState.error}
                    </div>
                  ) : null}

                  {!repositoryState.tokenConfigured &&
                  repositoryState.hasLoaded ? (
                    <div className="rounded-xl border border-border/70 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                      Configure a GitHub token to browse repositories from the
                      sidebar.
                    </div>
                  ) : null}

                  <Button
                    className="h-8 w-full"
                    disabled={isCreateAppPending}
                    size="sm"
                    type="submit"
                  >
                    {isCreateAppPending ? "Creating..." : "Create app"}
                  </Button>
                </form>
              ) : null}
            </div>

            <div className="space-y-2">
              {appItems.length ? (
                appItems.map((deployment) => (
                  <button
                    className={cn(
                      "w-full rounded-[1.1rem] border px-3 py-2.5 text-left transition-all duration-200",
                      deployment.isActive
                        ? "border-emerald-200/80 bg-linear-to-r from-emerald-50/90 via-background to-background shadow-[0_18px_42px_-34px_rgba(16,185,129,0.24)]"
                        : "border-border/70 bg-background/85 hover:bg-background/95",
                    )}
                    key={deployment.id}
                    onClick={() => onSelectAppAction(deployment.id)}
                    type="button"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "h-2 w-2 rounded-full",
                              deployment.dotClassName,
                            )}
                          />
                          <span className="truncate text-sm font-semibold tracking-tight text-foreground">
                            {deployment.appName}
                          </span>
                        </div>
                      </div>
                      <Badge variant={deployment.statusVariant}>
                        {deployment.statusLabel}
                      </Badge>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
                      <span className="truncate">{deployment.domain}</span>
                      <span>{deployment.relativeUpdatedAt}</span>
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
