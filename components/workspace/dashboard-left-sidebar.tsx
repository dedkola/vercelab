"use client";

import type { MouseEvent as ReactMouseEvent } from "react";

import type { ContainerListEntry } from "@/components/workspace-shell";
import { Icon } from "@/components/dashboard-kit";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

import {
  HostMetricsSidebar,
  type HostMetricsSidebarProps,
} from "./host-metrics-sidebar";
import { ResizeHandle, SectionLabel } from "./workspace-ui";

function getContainerAriaLabel(container: ContainerListEntry) {
  if (container.runtime?.health && container.runtime.health !== "none") {
    return `${container.display.name} ${container.runtime.health}`;
  }

  if (container.runtime) {
    return `${container.display.name} ${container.runtime.status}`;
  }

  return `${container.display.name} ${container.display.status}`;
}

function formatContainerStatusLabel(container: ContainerListEntry) {
  if (container.runtime?.health === "unhealthy") {
    return "Unhealthy";
  }

  if (container.runtime?.health === "starting") {
    return "Starting";
  }

  if (container.runtime) {
    return (
      container.runtime.status.charAt(0).toUpperCase() +
      container.runtime.status.slice(1)
    );
  }

  return (
    container.display.status.charAt(0).toUpperCase() +
    container.display.status.slice(1)
  );
}

function getContainerStatusVariant(
  container: ContainerListEntry,
): "success" | "warning" | "default" {
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

function getContainerSecondaryLabel(container: ContainerListEntry) {
  return container.runtime?.projectName ?? container.display.stack;
}

type DashboardLeftSidebarProps = {
  activeContainerId: string;
  containers: ContainerListEntry[];
  hostMetricsProps: HostMetricsSidebarProps;
  isAllContainersSelected: boolean;
  listWidth: number;
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
  containers,
  hostMetricsProps,
  isAllContainersSelected,
  listWidth,
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
      <HostMetricsSidebar {...hostMetricsProps} />

      <aside
        className="flex shrink-0 flex-col border-r border-border/70 bg-linear-to-b from-background via-muted/10 to-background shadow-[18px_0_56px_-52px_rgba(15,23,42,0.24)] transition-[width] duration-300"
        style={{ width: `${listWidth}px` }}
      >
        <div className="space-y-3 border-b border-border/60 px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-1">
              <SectionLabel icon="cloud" text="Containers" />
            </div>
            <div className="flex flex-wrap gap-2">
              {runningContainersCount !== null ? (
                <Badge className="border-emerald-200/80 bg-emerald-50/90 text-emerald-700">
                  {runningContainersCount} running
                </Badge>
              ) : null}
              <Badge className="border-border/60 bg-background/80 text-foreground">
                {visibleCount} visible
              </Badge>
            </div>
          </div>
          <div className="relative">
            <Icon
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
              name="search"
            />
            <Input
              aria-label="Search containers"
              className="h-10 rounded-2xl bg-background/80 pl-9 shadow-[0_18px_42px_-30px_rgba(15,23,42,0.22)]"
              onChange={(event) =>
                onSearchQueryChangeAction(event.target.value)
              }
              placeholder="Search containers, stacks, images..."
              value={searchQuery}
            />
          </div>
        </div>

        <ScrollArea className="h-full">
          <div className="w-full space-y-3 p-3">
            <div className="space-y-2">
              <button
                aria-label="All containers"
                className={cn(
                  "w-full rounded-[1.1rem] border px-3 py-2.5 text-left transition-all duration-200",
                  isAllContainersSelected ||
                    activeContainerId === "__all-containers__"
                    ? "border-emerald-200/80 bg-linear-to-r from-emerald-50/90 via-background to-background shadow-[0_18px_42px_-34px_rgba(16,185,129,0.24)]"
                    : "border-border/70 bg-background/85 hover:bg-background/95",
                )}
                onClick={onAllContainersSelectAction}
                type="button"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold tracking-tight text-foreground">
                      All containers
                    </div>
                  </div>
                  <Badge className="border-border/60 bg-background/80 text-foreground">
                    {containers.length}
                  </Badge>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
                  <span className="truncate">Aggregate host view</span>
                  <span>
                    {runningContainersCount !== null
                      ? `${runningContainersCount} running`
                      : "Host view"}
                  </span>
                </div>
              </button>

              {containers.length ? (
                containers.map((container) => (
                  <button
                    aria-label={getContainerAriaLabel(container)}
                    className={cn(
                      "w-full rounded-[1.1rem] border px-3 py-2.5 text-left transition-all duration-200",
                      activeContainerId === container.display.name
                        ? "border-emerald-200/80 bg-linear-to-r from-emerald-50/90 via-background to-background shadow-[0_18px_42px_-34px_rgba(16,185,129,0.24)]"
                        : "border-border/70 bg-background/85 hover:bg-background/95",
                    )}
                    key={container.display.id}
                    onClick={() =>
                      onContainerSelectAction(container.display.name)
                    }
                    type="button"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "h-2 w-2 rounded-full",
                              container.dotClassName,
                            )}
                          />
                          <span className="truncate text-sm font-semibold tracking-tight text-foreground">
                            {container.display.name}
                          </span>
                        </div>
                      </div>
                      <Badge variant={getContainerStatusVariant(container)}>
                        {formatContainerStatusLabel(container)}
                      </Badge>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
                      <span className="truncate">
                        {getContainerSecondaryLabel(container)}
                      </span>
                      <span>{container.display.uptime}</span>
                    </div>
                  </button>
                ))
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
