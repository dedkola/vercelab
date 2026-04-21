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

export type HostMetricsStatus = {
  badgeClassName: string;
  badgeLabel: string;
  helperText: string;
};

export type HostMetricsSidebarProps = {
  cpuHeadroomLabel: string;
  isCollapsed: boolean;
  memoryHeadroomLabel: string;
  metricCards: MetricCard[];
  metricsStatus: HostMetricsStatus;
  onCollapseAction: () => void;
  onExpandAction: () => void;
  onResizeStartAction: (event: ReactMouseEvent<HTMLDivElement>) => void;
  showStateWarning: boolean;
  summaryLabel: string;
  systemPanels?: SystemMetricPanel[];
  throughputLabel: string;
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
      <aside className="flex w-11 shrink-0 items-start border-r border-border/70 bg-linear-to-b from-background via-muted/26 to-background px-1.5 py-2 shadow-[20px_0_54px_-44px_rgba(15,23,42,0.3)]">
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
        className="relative flex shrink-0 flex-col border-r border-border/70 bg-linear-to-b from-background via-muted/14 to-background shadow-[22px_0_72px_-58px_rgba(15,23,42,0.34)] transition-[width] duration-300"
        style={{ width: `${width}px` }}
      >
        <Button
          aria-label="Hide server load sidebar"
          className="absolute right-3 top-3 z-10 h-7 w-7 bg-background/88 shadow-[0_12px_24px_-18px_rgba(15,23,42,0.45)]"
          onClick={onCollapseAction}
          size="icon"
          type="button"
          variant="ghost"
        >
          <Icon name="chevron-left" className="h-3.5 w-3.5" />
        </Button>

        <ScrollArea className="h-full">
          <div className="space-y-4 p-3 pt-12">
            {systemPanels?.length ? (
              <div className="space-y-4">
                {systemPanels.map((panel) => (
                  <SystemMetricCard key={panel.id} panel={panel} />
                ))}
              </div>
            ) : (
              metricCards.map((metric) => {
                const toneClasses = getToneClasses(metric.tone);

                return (
                  <Card
                    className="overflow-hidden border-border/70 bg-linear-to-br from-background/96 via-muted/16 to-background shadow-[0_20px_56px_-46px_rgba(15,23,42,0.32)]"
                    key={metric.title}
                  >
                    <CardHeader className="space-y-2 border-b border-border/60 pb-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <CardTitle>{metric.title}</CardTitle>
                        </div>
                        <Badge className={cn("shadow-none", toneClasses.badge)}>
                          {metric.delta}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3 pt-3">
                      <div className="text-xl font-semibold tracking-tight text-foreground">
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
