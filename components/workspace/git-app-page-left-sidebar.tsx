"use client";

import type { FormEvent, MouseEvent as ReactMouseEvent } from "react";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Search,
  type LucideIcon,
} from "lucide-react";

import type {
  DraftAppState,
  RepositoryState,
} from "@/components/workspace-shell";
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
import type { ExposureMode } from "@/lib/validation";

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
  exposureMode?: ExposureMode;
  hostPort: number | null;
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

function getStatusDotClassName(
  statusVariant: GitAppPageListItem["statusVariant"],
) {
  switch (statusVariant) {
    case "success":
      return "bg-emerald-500";
    case "warning":
      return "bg-amber-500";
    default:
      return "bg-slate-400";
  }
}

function getAppMetaLabel(deployment: GitAppPageListItem) {
  if (deployment.exposureMode === "internal") {
    return "No public route";
  }

  if (
    (deployment.exposureMode === "tcp" || deployment.exposureMode === "host") &&
    deployment.hostPort
  ) {
    return `Host port ${deployment.hostPort}`;
  }

  return deployment.domain || "No public route";
}

function getAppFreshnessLabel(deployment: GitAppPageListItem) {
  return deployment.relativeUpdatedAt === "Unknown"
    ? "Updated unknown"
    : `Updated ${deployment.relativeUpdatedAt}`;
}

function getAppExposureLabel(deployment: GitAppPageListItem) {
  switch (deployment.exposureMode) {
    case "tcp":
      return "tcp";
    case "host":
      return "host";
    case "internal":
      return null;
    case "http":
    default:
      return deployment.domain ? "routed" : null;
  }
}

function SidebarIconBox({
  icon: IconComponent,
  isActive,
}: {
  icon: LucideIcon;
  isActive?: boolean;
}) {
  return (
    <span
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-md border transition-colors",
        isActive
          ? "border-emerald-200 bg-background text-emerald-700"
          : "border-border/70 bg-background text-muted-foreground group-hover:text-foreground",
      )}
    >
      <IconComponent aria-hidden="true" className="size-4" />
    </span>
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
  const needsHostPort =
    draftApp.exposureMode === "tcp" || draftApp.exposureMode === "host";
  const isCreateDisabled =
    isCreateAppPending ||
    repositoryState.isLoading ||
    (Boolean(draftApp.repositoryUrl) && isBranchLoading) ||
    !draftApp.repositoryUrl.trim() ||
    !draftApp.appName.trim() ||
    (draftApp.exposureMode === "http" && !draftApp.subdomain.trim()) ||
    !draftApp.port.trim() ||
    (needsHostPort && !draftApp.hostPort.trim());

  return (
    <>
      <aside
        className="flex shrink-0 flex-col border-r border-border/70 bg-background transition-[width] duration-300"
        style={{ width: `${listWidth}px` }}
      >
        <div className="flex flex-col gap-2 border-b border-border/70 px-3 py-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <SectionLabel icon="github" text="Git App Page" />
            </div>
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <Badge className="h-5 rounded-md border-emerald-200/80 bg-emerald-50/90 px-1.5 text-[11px] text-emerald-700">
                {liveAppsCount} live
              </Badge>
              <Badge className="h-5 rounded-md border-border/60 bg-background px-1.5 text-[11px] text-foreground">
                {totalAppsCount} apps
              </Badge>
            </div>
          </div>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              aria-label="Search apps"
              className="h-8 rounded-lg border-border/70 bg-background pl-8 text-xs"
              onChange={(event) =>
                onAppSearchQueryChangeAction(event.target.value)
              }
              placeholder="Search apps, repos, domains..."
              value={appSearchQuery}
            />
          </div>
        </div>

        <ScrollArea className="h-full">
          <div className="flex flex-col gap-2 p-2">
            <div
              className={cn(
                "overflow-hidden rounded-lg border transition-colors",
                isCreateAppExpanded
                  ? "border-emerald-200 bg-emerald-50/55"
                  : "border-transparent bg-transparent hover:border-border/70 hover:bg-muted/40",
              )}
            >
              <button
                className="group flex w-full items-center justify-between gap-3 py-2 pl-2.5 pr-3 text-left"
                onClick={onToggleCreateAppAction}
                type="button"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <SidebarIconBox icon={Plus} isActive={isCreateAppExpanded} />
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold tracking-tight text-foreground">
                      Add Git app
                    </div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      Deploy from repository
                    </div>
                  </div>
                </div>
                {isCreateAppExpanded ? (
                  <ChevronDown
                    aria-hidden="true"
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                ) : (
                  <ChevronRight
                    aria-hidden="true"
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                )}
              </button>

              {isCreateAppExpanded ? (
                <form
                  className="grid gap-2 border-t border-border/60 px-3 py-2.5"
                  onSubmit={onCreateAppAction}
                >
                  <div className="space-y-1">
                    <Combobox
                      ariaLabel="Repository"
                      buttonClassName="h-8 rounded-lg border border-border/70 bg-background text-xs"
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

                  <div className="space-y-1">
                    <Combobox
                      ariaLabel="Branch"
                      buttonClassName="h-8 rounded-lg border border-border/70 bg-background text-xs"
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

                  <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs font-medium text-muted-foreground">
                        App name
                      </Label>
                      <Input
                        className="h-8 rounded-lg border-border/70 bg-background text-xs"
                        onChange={(event) =>
                          onDraftChangeAction("appName", event.target.value)
                        }
                        value={draftApp.appName}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-medium text-muted-foreground">
                        Container port
                      </Label>
                      <Input
                        className="h-8 rounded-lg border-border/70 bg-background text-xs"
                        inputMode="numeric"
                        onChange={(event) =>
                          onDraftChangeAction("port", event.target.value)
                        }
                        value={draftApp.port}
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-muted-foreground">
                      Exposure mode
                    </Label>
                    <select
                      className="h-8 w-full rounded-lg border border-input bg-background px-3 text-xs"
                      onChange={(event) =>
                        onDraftChangeAction(
                          "exposureMode",
                          event.target.value,
                        )
                      }
                      value={draftApp.exposureMode}
                    >
                      <option value="http">HTTP — Traefik reverse proxy</option>
                      <option value="tcp">
                        TCP — Traefik TCP passthrough (pre-configure entrypoint)
                      </option>
                      <option value="host">
                        Host port — bind directly to host
                      </option>
                      <option value="internal">
                        Internal — no external exposure
                      </option>
                    </select>
                  </div>

                  {(draftApp.exposureMode === "tcp" ||
                    draftApp.exposureMode === "host") && (
                    <div className="space-y-1">
                      <Label className="text-xs font-medium text-muted-foreground">
                        Host port
                      </Label>
                      <Input
                        className="h-8 rounded-lg border-border/70 bg-background text-xs"
                        inputMode="numeric"
                        onChange={(event) =>
                          onDraftChangeAction("hostPort", event.target.value)
                        }
                        placeholder={
                          draftApp.exposureMode === "tcp"
                            ? "e.g. 27017 (TCP entrypoint)"
                            : "e.g. 27017"
                        }
                        value={draftApp.hostPort}
                      />
                    </div>
                  )}

                  {draftApp.exposureMode === "http" && (
                    <div className="space-y-1">
                      <Label className="text-xs font-medium text-muted-foreground">
                        Subdomain
                      </Label>
                      <InputGroup className="h-8">
                        <InputGroupInput
                          className="text-xs"
                          onChange={(event) =>
                            onDraftChangeAction("subdomain", event.target.value)
                          }
                          value={draftApp.subdomain}
                        />
                        {baseDomain ? (
                          <InputGroupSuffix className="text-xs leading-8">
                            .{baseDomain}
                          </InputGroupSuffix>
                        ) : null}
                      </InputGroup>
                    </div>
                  )}

                  {repositoryState.error ? (
                    <div className="rounded-lg border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-[11px] text-amber-800">
                      {repositoryState.error}
                    </div>
                  ) : null}

                  {branchError ? (
                    <div className="rounded-lg border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-[11px] text-amber-800">
                      {branchError}
                    </div>
                  ) : null}

                  {!repositoryState.tokenConfigured &&
                  repositoryState.hasLoaded ? (
                    <div className="rounded-lg border border-border/70 bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
                      Configure a GitHub token to browse repositories from the
                      sidebar.
                    </div>
                  ) : null}

                  <Button
                    className="h-8 w-full rounded-lg text-xs"
                    disabled={isCreateDisabled}
                    type="submit"
                  >
                    {isCreateAppPending ? "Creating..." : "Create app"}
                  </Button>
                </form>
              ) : null}
            </div>

            <div className="flex flex-col gap-1">
              {appItems.length ? (
                appItems.map((deployment) => {
                  const exposureLabel = getAppExposureLabel(deployment);

                  return (
                    <button
                      aria-label={`${deployment.appName} ${deployment.domain} ${deployment.statusLabel} ${deployment.relativeUpdatedAt}`}
                      className={cn(
                        "group w-full overflow-hidden rounded-lg border px-2.5 py-2 text-left transition-colors",
                        deployment.isActive
                          ? "border-emerald-200 bg-emerald-50/60"
                          : "border-transparent bg-transparent hover:border-border/70 hover:bg-muted/40",
                      )}
                      key={deployment.id}
                      onClick={() => onSelectAppAction(deployment.id)}
                      type="button"
                    >
                      <div className="flex items-start gap-2.5">
                        <span
                          className={cn(
                            "mt-1.5 size-1.5 shrink-0 rounded-full",
                            getStatusDotClassName(deployment.statusVariant),
                          )}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="min-w-0 truncate text-xs font-medium tracking-tight text-foreground">
                              {deployment.appName}
                            </span>
                          </span>
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {getAppMetaLabel(deployment)}
                          </span>
                          <span className="mt-1 flex min-w-0 flex-wrap items-center gap-1">
                            <span className="truncate rounded-md border border-border/60 bg-background px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                              {getAppFreshnessLabel(deployment)}
                            </span>
                            <span
                              className={cn(
                                "truncate rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
                                deployment.statusVariant === "success"
                                  ? "border-emerald-200/80 bg-emerald-50/80 text-emerald-700"
                                  : deployment.statusVariant === "warning"
                                    ? "border-amber-200/80 bg-amber-50/80 text-amber-700"
                                    : "border-border/60 bg-background text-muted-foreground",
                              )}
                            >
                              {deployment.statusLabel}
                            </span>
                            {exposureLabel ? (
                              <span className="truncate rounded-md border border-sky-200/70 bg-sky-50/80 px-1.5 py-0.5 text-[11px] font-medium text-sky-700">
                                {exposureLabel}
                              </span>
                            ) : null}
                          </span>
                        </span>
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="rounded-lg border border-dashed border-border/70 bg-background px-3 py-5 text-xs text-muted-foreground">
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
