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
import { ResizeHandle, SectionLabel, usePixelWidthRef } from "./workspace-ui";

function getContainerAriaLabel(container: ContainerListEntry) {
  if (container.runtime?.health && container.runtime.health !== "none") {
    return `${container.display.name} ${container.runtime.health}`;
  }

  if (container.runtime) {
    return `${container.display.name} ${container.runtime.status}`;
  }

  return `${container.display.name} ${container.display.status}`;
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
              <SectionLabel icon="cloud" text="Containers" />
              <div className="text-xs text-muted-foreground">
                Live Docker runtime state for the current host.
              </div>
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
          <div className="space-y-3 p-3">
            <button
              aria-label="All containers"
              className={cn(
                "w-full rounded-[1.15rem] border px-3.5 py-3 text-left transition-all duration-200",
                "shadow-[0_16px_42px_-38px_rgba(15,23,42,0.22)] hover:-translate-y-px hover:bg-background/95",
                isAllContainersSelected ||
                  activeContainerId === "__all-containers__"
                  ? "border-emerald-200/80 bg-linear-to-br from-emerald-50/80 via-background to-background shadow-[0_26px_60px_-44px_rgba(16,185,129,0.26)]"
                  : "border-border/70 bg-background/85",
              )}
              onClick={onAllContainersSelectAction}
              type="button"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold tracking-tight text-foreground">
                    All containers
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Grouped load charts across the whole system.
                  </div>
                </div>
                <Badge className="border-border/60 bg-background/80 text-foreground">
                  {containers.length}
                </Badge>
              </div>
            </button>

            {containers.length ? (
              containers.map((container) => (
                <button
                  aria-label={getContainerAriaLabel(container)}
                  className={cn(
                    "w-full rounded-[1.15rem] border px-3.5 py-3 text-left transition-all duration-200",
                    "shadow-[0_16px_42px_-38px_rgba(15,23,42,0.22)] hover:-translate-y-px hover:bg-background/95",
                    activeContainerId === container.display.name
                      ? "border-emerald-200/80 bg-linear-to-br from-emerald-50/80 via-background to-background shadow-[0_26px_60px_-44px_rgba(16,185,129,0.26)]"
                      : "border-border/70 bg-background/85",
                  )}
                  key={container.display.id}
                  onClick={() =>
                    onContainerSelectAction(container.display.name)
                  }
                  type="button"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "h-2 w-2 shrink-0 rounded-full",
                        container.dotClassName,
                      )}
                    />
                    <div className="truncate text-sm font-semibold tracking-tight text-foreground">
                      {container.display.name}
                    </div>
                  </div>
                </button>
              ))
            ) : (
              <div className="rounded-[1.35rem] border border-dashed border-border/80 bg-background/70 px-4 py-10 text-center shadow-[0_18px_46px_-40px_rgba(15,23,42,0.2)]">
                <div className="text-sm font-semibold tracking-tight text-foreground">
                  No matching containers
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Try a broader search term to repopulate the preview list.
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </aside>

      <ResizeHandle onMouseDown={onListResizeStartAction} />
    </>
  );
}
