"use client";

import type { MouseEvent as ReactMouseEvent } from "react";

import type { DashboardLogView, LogLine } from "@/components/workspace-shell";
import { Icon } from "@/components/dashboard-kit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

import { ResizeHandle, SectionLabel } from "./workspace-ui";

type DashboardLogOption = {
  label: string;
  value: DashboardLogView;
};

type DashboardRightSidebarProps = {
  activeLogView: DashboardLogView;
  isCollapsed: boolean;
  isAggregateSelection?: boolean;
  logOptions: DashboardLogOption[];
  logs: LogLine[];
  onCollapseAction: () => void;
  onExpandAction: () => void;
  onLogViewChangeAction: (view: DashboardLogView) => void;
  onResizeStartAction: (event: ReactMouseEvent<HTMLDivElement>) => void;
  selectedContainerName: string;
  selectedContainerStatusLabel: string;
  selectedContainerStatusVariant: "success" | "warning" | "default";
  selectedPreviewAvailable: boolean;
  width: number;
};

function getLogDotClassName(level: LogLine["level"]) {
  switch (level) {
    case "success":
      return "bg-emerald-500";
    case "warning":
      return "bg-amber-500";
    case "info":
      return "bg-slate-400";
  }
}

export function DashboardRightSidebar({
  activeLogView,
  isCollapsed,
  isAggregateSelection = false,
  logOptions,
  logs,
  onCollapseAction,
  onExpandAction,
  onLogViewChangeAction,
  onResizeStartAction,
  selectedContainerName,
  selectedContainerStatusLabel,
  selectedContainerStatusVariant,
  selectedPreviewAvailable,
  width,
}: DashboardRightSidebarProps) {
  if (isCollapsed) {
    return (
      <aside className="flex w-11 shrink-0 items-start border-l border-border/70 bg-linear-to-b from-background via-muted/26 to-background px-1.5 py-2 shadow-[-20px_0_54px_-44px_rgba(15,23,42,0.3)]">
        <Button
          aria-label="Show logs sidebar"
          className="h-7 w-7"
          onClick={onExpandAction}
          size="icon"
          type="button"
          variant="ghost"
        >
          <Icon name="chevron-left" className="h-3.5 w-3.5" />
        </Button>
      </aside>
    );
  }

  return (
    <>
      <ResizeHandle onMouseDown={onResizeStartAction} />

      <aside
        className="flex shrink-0 flex-col border-l border-border/70 bg-linear-to-b from-background via-muted/16 to-background shadow-[-22px_0_72px_-58px_rgba(15,23,42,0.34)] transition-[width] duration-300"
        style={{ width: `${width}px` }}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border/60 px-3 py-3">
          <div className="space-y-1">
            <SectionLabel icon="syslog" text="Logs" />
            <div className="text-xs text-muted-foreground">
              {isAggregateSelection
                ? "Grouped history context for the full container fleet."
                : "Quiet terminal framing for the selected container."}
            </div>
          </div>
          <Button
            aria-label="Hide logs sidebar"
            className="h-7 w-7"
            onClick={onCollapseAction}
            size="icon"
            type="button"
            variant="ghost"
          >
            <Icon name="chevron-right" className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="border-b border-border/60 px-3 py-3">
          <div className="flex flex-wrap gap-2">
            {logOptions.map((option) => (
              <button
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-semibold tracking-tight transition-all duration-200",
                  activeLogView === option.value
                    ? "border-emerald-200/80 bg-emerald-50/90 text-emerald-700 shadow-sm"
                    : "border-border/60 bg-background/80 text-muted-foreground hover:text-foreground",
                )}
                key={option.value}
                onClick={() => onLogViewChangeAction(option.value)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <ScrollArea className="h-full">
          <div className="space-y-4 p-3">
            <div className="rounded-[1.35rem] border border-border/70 bg-linear-to-br from-background/96 via-muted/14 to-background px-4 py-4 shadow-[0_20px_56px_-46px_rgba(15,23,42,0.32)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold tracking-tight text-foreground">
                    {selectedContainerName}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {isAggregateSelection
                      ? "Grouped Influx history and range-aware fleet context"
                      : `docker logs -f --tail 150 ${selectedContainerName}`}
                  </div>
                </div>
                <Badge variant={selectedContainerStatusVariant}>
                  {selectedContainerStatusLabel}
                </Badge>
              </div>
            </div>

            <div className="overflow-hidden rounded-[1.35rem] border border-border/70 bg-[#0f1720] shadow-[0_24px_70px_-50px_rgba(15,23,42,0.5)]">
              <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
                <div className="flex items-center gap-2 text-xs text-slate-300">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  Tail preview
                </div>
                <div className="font-mono text-[11px] text-slate-400">
                  {logs.length} lines
                </div>
              </div>

              <div className="space-y-2 px-4 py-4 font-mono text-[12px] leading-6 text-slate-200">
                {logs.length ? (
                  logs.map((line) => (
                    <div className="flex gap-3" key={line.id}>
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-500">
                        <span
                          className={cn(
                            "block h-1.5 w-1.5 rounded-full",
                            getLogDotClassName(line.level),
                          )}
                        />
                      </span>
                      <span className="shrink-0 text-slate-500">
                        {line.timestamp}
                      </span>
                      <span className="text-slate-100">{line.message}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-slate-400">
                    {isAggregateSelection
                      ? "Aggregate selection does not expose preview log lines. Pick a single container to inspect the log rail."
                      : selectedPreviewAvailable
                        ? "No lines in this preview view for the selected container."
                        : "Live container logs are not wired into this page yet."}
                  </div>
                )}
              </div>
            </div>
          </div>
        </ScrollArea>
      </aside>
    </>
  );
}
