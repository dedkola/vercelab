"use client";

import type { MouseEvent as ReactMouseEvent } from "react";

import type { MetricCard } from "@/components/workspace-shell";
import { Icon } from "@/components/dashboard-kit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { SystemMetricPanel } from "@/lib/metrics-dashboard-metrics";
import { cn } from "@/lib/utils";

import { getToneClasses, ResizeHandle, Sparkline } from "./workspace-ui";
import { SystemMetricCard } from "./system-metric-card";

export type HostMetricsSidebarProps = {
  isCollapsed: boolean;
  metricCards: MetricCard[];
  onCollapseAction: () => void;
  onExpandAction: () => void;
  onResizeStartAction: (event: ReactMouseEvent<HTMLDivElement>) => void;
  systemPanels?: SystemMetricPanel[];
  width: number;
};

export function HostMetricsSidebar({
  isCollapsed,
  metricCards,
  onCollapseAction,
  onExpandAction,
  onResizeStartAction,
  systemPanels,
  width,
}: HostMetricsSidebarProps) {
  if (isCollapsed) {
    return (
      <aside className="flex w-11 shrink-0 items-start border-r border-border/70 bg-background px-1.5 py-2">
        <Button
          aria-label="Show server load sidebar"
          className="h-7 w-7"
          onClick={onExpandAction}
          size="icon"
          type="button"
          variant="ghost"
        >
          <Icon name="chevron-right" className="h-3.5 w-3.5" />
        </Button>
      </aside>
    );
  }

  return (
    <>
      <aside
        className="flex shrink-0 flex-col border-r border-border/70 bg-background transition-[width] duration-300"
        style={{ width: `${width}px` }}
      >
        <div className="flex items-center justify-between border-b border-border/70 px-3 py-2">
          <span className="text-xs font-semibold">Server load</span>
          <Button
            aria-label="Hide server load sidebar"
            className="h-6 w-6"
            onClick={onCollapseAction}
            size="icon"
            type="button"
            variant="ghost"
          >
            <Icon name="chevron-left" className="h-3.5 w-3.5" />
          </Button>
        </div>

        <ScrollArea className="h-full">
          <div className="space-y-3 p-3">
            {systemPanels?.length ? (
              <div className="space-y-4">
                {systemPanels.map((panel) => (
                  <SystemMetricCard key={panel.id} panel={panel} />
                ))}
              </div>
            )             : (
              metricCards.map((metric) => {
                const toneClasses = getToneClasses(metric.tone);

                return (
                  <Card
                    className="overflow-hidden rounded-xl border-border/70 shadow-sm"
                    key={metric.title}
                  >
                    <CardHeader className="gap-2 border-b border-border/60 pb-2 pt-3">
                      <div className="flex items-start justify-between gap-3">
                        <CardTitle>{metric.title}</CardTitle>
                        <Badge className={cn("shadow-none", toneClasses.badge)}>
                          {metric.delta}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2 py-3">
                      <div className="text-lg font-semibold tracking-tight text-foreground">
                        {metric.value}
                      </div>
                      <Sparkline points={metric.points} tone={metric.tone} />
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </ScrollArea>
      </aside>

      <ResizeHandle onMouseDown={onResizeStartAction} />
    </>
  );
}
