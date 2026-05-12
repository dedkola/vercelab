"use client";

import type { MouseEvent as ReactMouseEvent } from "react";
import { Box, Plus, Search, X } from "lucide-react";

import type { ContainerListEntry } from "@/components/workspace-shell";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

import { ResizeHandle, SectionLabel } from "./workspace-ui";

function getContainerAriaLabel(container: ContainerListEntry) {
  if (container.deploymentStatus) {
    if (container.runtime?.health && container.runtime.health !== "none") {
      return `${container.sidebarName} ${container.deploymentStatus} ${container.runtime.health}`;
    }

    return `${container.sidebarName} ${container.deploymentStatus}`;
  }

  if (container.runtime?.health && container.runtime.health !== "none") {
    return `${container.sidebarName} ${container.runtime.health}`;
  }

  if (container.runtime) {
    return `${container.sidebarName} ${container.runtime.status}`;
  }

  return `${container.sidebarName} ${container.display.status}`;
}

function formatContainerStatusLabel(container: ContainerListEntry) {
  if (container.deploymentStatus) {
    return container.deploymentStatus === "running" ? "Up" : "Dn";
  }

  if (container.runtime) {
    return container.runtime.status === "running" ? "Up" : "Dn";
  }

  return container.display.status === "running" ? "Up" : "Dn";
}

function getContainerStatusVariant(
  container: ContainerListEntry,
): "success" | "warning" | "default" {
  if (container.deploymentStatus) {
    switch (container.deploymentStatus) {
      case "running":
        return "success";
      case "failed":
      case "deploying":
        return "warning";
      default:
        return "default";
    }
  }

  if (container.runtime?.health === "unhealthy") {
    return "warning";
  }

  if (container.runtime?.health === "starting") {
    return "warning";
  }

  if (container.runtime) {
    return container.runtime.status === "running" ? "success" : "default";
  }

  switch (container.display.status) {
    case "running":
      return "success";
    case "degraded":
      return "warning";
    default:
      return "default";
  }
}

function getStatusDotClassName(variant: "success" | "warning" | "default") {
  switch (variant) {
    case "success":
      return "bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.14)]";
    case "warning":
      return "bg-amber-500 shadow-[0_0_0_3px_rgba(245,158,11,0.16)]";
    default:
      return "bg-slate-400 shadow-[0_0_0_3px_rgba(100,116,139,0.13)]";
  }
}

function getStatusTextClassName(variant: "success" | "warning" | "default") {
  switch (variant) {
    case "success":
      return "text-emerald-700";
    case "warning":
      return "text-amber-700";
    default:
      return "text-muted-foreground";
  }
}

function getContainerMetaLabel(container: ContainerListEntry) {
  if (container.sidebarSecondaryLabel) {
    return container.sidebarSecondaryLabel;
  }

  if (container.runtime?.projectName) {
    return container.runtime.projectName;
  }

  return container.display.stack;
}

function getContainerLoadLabel(container: ContainerListEntry) {
  const cpu = container.display.cpu;
  const memory = container.display.memory;

  if (cpu && memory) {
    return `${cpu} CPU / ${memory}`;
  }

  return cpu || memory || "No samples";
}

type DashboardLeftSidebarProps = {
  activeContainerId: string;
  addPanel?: React.ReactNode;
  containers: ContainerListEntry[];
  isAddPanelOpen?: boolean;
  isAllContainersSelected: boolean;
  listWidth: number;
  onAddContainerAction?: () => void;
  onAllContainersSelectAction: () => void;
  onContainerSelectAction: (containerName: string) => void;
  onListResizeStartAction: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onSearchQueryChangeAction: (value: string) => void;
  runningContainersCount: number | null;
  searchQuery: string;
  visibleCount: number;
};

export function DashboardLeftSidebar({
  activeContainerId,
  addPanel,
  containers,
  isAddPanelOpen = false,
  isAllContainersSelected,
  listWidth,
  onAddContainerAction,
  onAllContainersSelectAction,
  onContainerSelectAction,
  onListResizeStartAction,
  onSearchQueryChangeAction,
  runningContainersCount,
  searchQuery,
  visibleCount,
}: DashboardLeftSidebarProps) {
  return (
    <>
      <aside
        className="flex shrink-0 flex-col border-r border-border/70 bg-linear-to-b from-background via-muted/10 to-background shadow-[18px_0_56px_-52px_rgba(15,23,42,0.24)] transition-[width] duration-300"
        style={{ width: `${listWidth}px` }}
      >
        <div className="flex flex-col gap-3 border-b border-border/60 px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <SectionLabel icon="cloud" text="Containers" />
            </div>
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              {runningContainersCount !== null ? (
                <Badge className="h-6 border-emerald-200/80 bg-emerald-50/90 px-2 text-[11px] text-emerald-700">
                  {runningContainersCount} running
                </Badge>
              ) : null}
              <Badge className="h-6 border-border/60 bg-background/80 px-2 text-[11px] text-foreground">
                {visibleCount} visible
              </Badge>
              {onAddContainerAction ? (
                <button
                  aria-label={
                    isAddPanelOpen
                      ? "Close add container panel"
                      : "Add new container"
                  }
                  className={cn(
                    "flex size-6 items-center justify-center rounded-md border transition",
                    isAddPanelOpen
                      ? "border-emerald-300/80 bg-emerald-50/90 text-emerald-700 hover:bg-emerald-100/80"
                      : "border-border/60 bg-background/80 text-muted-foreground hover:border-emerald-300/70 hover:bg-emerald-50/70 hover:text-emerald-700",
                  )}
                  onClick={onAddContainerAction}
                  type="button"
                >
                  {isAddPanelOpen ? (
                    <X aria-hidden="true" className="size-3.5" />
                  ) : (
                    <Plus aria-hidden="true" className="size-3.5" />
                  )}
                </button>
              ) : null}
            </div>
          </div>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              aria-label="Search containers"
              className="h-9 rounded-lg border-border/70 bg-background/90 pl-9 text-sm shadow-[0_18px_42px_-34px_rgba(15,23,42,0.24)]"
              onChange={(event) =>
                onSearchQueryChangeAction(event.target.value)
              }
              placeholder="Search containers, stacks, images..."
              value={searchQuery}
            />
          </div>
        </div>

        <ScrollArea className="h-full">
          <div className="flex w-full flex-col gap-3 p-3">
            {isAddPanelOpen && addPanel ? (
              <div className="overflow-hidden rounded-xl border border-emerald-200/80 bg-emerald-50/60 p-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-800">
                  New Container
                </div>
                {addPanel}
              </div>
            ) : null}
            <div className="flex flex-col gap-1.5">
              <button
                aria-label="All containers"
                className={cn(
                  "group w-full rounded-lg border px-3 py-2.5 text-left transition-all duration-200",
                  isAllContainersSelected ||
                    activeContainerId === "__all-containers__"
                    ? "border-emerald-300/80 bg-emerald-50/80 shadow-[0_18px_44px_-36px_rgba(5,150,105,0.35)]"
                    : "border-transparent bg-transparent hover:border-border/70 hover:bg-background/80",
                )}
                onClick={onAllContainersSelectAction}
                type="button"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-lg border transition-colors",
                      isAllContainersSelected ||
                        activeContainerId === "__all-containers__"
                        ? "border-emerald-200/90 bg-background/90 text-emerald-700"
                        : "border-border/70 bg-background/70 text-muted-foreground group-hover:text-foreground",
                    )}
                  >
                    <Box aria-hidden="true" className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold tracking-tight text-foreground">
                      All containers
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      Fleet overview
                    </span>
                  </span>
                  <span className="inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md border border-border/70 bg-background px-1.5 text-xs font-semibold text-foreground">
                    {containers.length}
                  </span>
                </div>
              </button>

              {containers.length ? (
                containers.map((container) => {
                  const statusVariant = getContainerStatusVariant(container);
                  const statusDotClassName =
                    getStatusDotClassName(statusVariant);
                  const isActive = activeContainerId === container.display.id;

                  return (
                    <button
                      aria-label={getContainerAriaLabel(container)}
                      className={cn(
                        "group w-full overflow-hidden rounded-lg border px-3 py-2.5 text-left transition-all duration-200",
                        isActive
                          ? "border-emerald-300/80 bg-emerald-50/80 shadow-[0_18px_44px_-36px_rgba(5,150,105,0.38)]"
                          : "border-transparent bg-transparent hover:border-border/70 hover:bg-background/80",
                      )}
                      key={container.display.id}
                      onClick={() =>
                        onContainerSelectAction(container.display.id)
                      }
                      type="button"
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className={cn(
                            "mt-1.5 size-2 shrink-0 rounded-full",
                            statusDotClassName,
                          )}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex min-w-0 items-center justify-between gap-2">
                            <span className="min-w-0 truncate text-sm font-medium tracking-tight text-foreground">
                              {container.sidebarName}
                            </span>
                            <span
                              className={cn(
                                "shrink-0 text-[10px] font-semibold uppercase tracking-[0.08em]",
                                getStatusTextClassName(statusVariant),
                              )}
                            >
                              {formatContainerStatusLabel(container)}
                            </span>
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                            {getContainerMetaLabel(container)}
                          </span>
                          <span className="mt-2 flex min-w-0 items-center gap-1.5">
                            <span className="truncate rounded-md border border-border/60 bg-background/75 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                              {getContainerLoadLabel(container)}
                            </span>
                            {container.runtime?.routedHost ? (
                              <span className="truncate rounded-md border border-sky-200/70 bg-sky-50/80 px-1.5 py-0.5 text-[11px] font-medium text-sky-700">
                                routed
                              </span>
                            ) : null}
                          </span>
                        </span>
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="rounded-[1.2rem] border border-dashed border-border/70 bg-background/70 px-4 py-6 text-sm text-muted-foreground">
                  No matching containers
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
