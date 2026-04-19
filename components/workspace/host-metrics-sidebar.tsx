"use client";

import type { MouseEvent as ReactMouseEvent } from "react";

import type { MetricCard } from "@/components/workspace-shell";
import { Icon } from "@/components/dashboard-kit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

import {
  getToneClasses,
  ResizeHandle,
  SectionLabel,
  Sparkline,
} from "./workspace-ui";

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
  throughputLabel: string;
  width: number;
};

export function HostMetricsSidebar({
  cpuHeadroomLabel,
  isCollapsed,
  memoryHeadroomLabel,
  metricCards,
  metricsStatus,
  onCollapseAction,
  onExpandAction,
  onResizeStartAction,
  showStateWarning,
  summaryLabel,
  throughputLabel,
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
        className="flex shrink-0 flex-col border-r border-border/70 bg-linear-to-b from-background via-muted/14 to-background shadow-[22px_0_72px_-58px_rgba(15,23,42,0.34)] transition-[width] duration-300"
        style={{ width: `${width}px` }}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border/60 px-3 py-3">
          <SectionLabel icon="network" text="Server load" />
          <Button
            aria-label="Hide server load sidebar"
            className="h-7 w-7"
            onClick={onCollapseAction}
            size="icon"
            type="button"
            variant="ghost"
          >
            <Icon name="chevron-left" className="h-3.5 w-3.5" />
          </Button>
        </div>

        <ScrollArea className="h-full">
          <div className="space-y-4 p-3">
            <div className="rounded-[1.35rem] border border-border/70 bg-linear-to-br from-background/96 via-muted/16 to-background px-4 py-4 shadow-[0_22px_54px_-44px_rgba(15,23,42,0.32)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold tracking-tight text-foreground">
                    Host summary
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {summaryLabel}
                  </div>
                </div>
                <Badge className={metricsStatus.badgeClassName}>
                  {metricsStatus.badgeLabel}
                </Badge>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-2xl border border-border/60 bg-background/80 px-3 py-2.5">
                  <div className="text-muted-foreground">CPU headroom</div>
                  <div className="mt-1 text-sm font-semibold text-foreground">
                    {cpuHeadroomLabel}
                  </div>
                </div>
                <div className="rounded-2xl border border-border/60 bg-background/80 px-3 py-2.5">
                  <div className="text-muted-foreground">Memory headroom</div>
                  <div className="mt-1 text-sm font-semibold text-foreground">
                    {memoryHeadroomLabel}
                  </div>
                </div>
              </div>
              <div className="mt-3 text-[11px] text-muted-foreground">
                {throughputLabel}
              </div>
            </div>

            {showStateWarning ? (
              <div className="rounded-[1.2rem] border border-amber-200/80 bg-amber-50/80 px-3.5 py-3 text-xs text-amber-800 shadow-[0_18px_44px_-40px_rgba(217,119,6,0.35)]">
                {metricsStatus.helperText}
              </div>
            ) : null}

            {metricCards.map((metric) => {
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
            })}
          </div>
        </ScrollArea>
      </aside>

      <ResizeHandle onMouseDown={onResizeStartAction} />
    </>
  );
}
