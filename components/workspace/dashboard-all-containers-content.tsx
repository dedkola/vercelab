"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { DashboardRange } from "@/lib/metrics-range";
import type { MetricsSnapshot } from "@/lib/system-metrics";

type AggregateChartLine = {
  id: string;
  label: string;
  latestValue: string;
  points: Array<number | null>;
};

export type AllContainersMetricChart = {
  series: AggregateChartLine[];
  summaryLabel: string;
  summaryValue: string;
  title: string;
  variant: "cpu" | "memory" | "network" | "disk";
};

type DashboardAllContainersContentProps = {
  charts: AllContainersMetricChart[];
  onRangeChangeAction: (range: DashboardRange) => void;
  range: DashboardRange;
  rangeOptions: ReadonlyArray<{
    label: string;
    value: DashboardRange;
  }>;
  snapshot: MetricsSnapshot | null;
};

const LINE_COLORS = [
  "hsla(159, 72%, 38%, 0.62)",
  "hsla(214, 78%, 48%, 0.58)",
  "hsla(24, 84%, 54%, 0.56)",
  "hsla(333, 76%, 52%, 0.56)",
  "hsla(268, 62%, 56%, 0.54)",
  "hsla(48, 92%, 48%, 0.52)",
  "hsla(187, 78%, 40%, 0.58)",
  "hsla(352, 70%, 50%, 0.5)",
] as const;

function getChartClasses(variant: AllContainersMetricChart["variant"]) {
  switch (variant) {
    case "cpu":
      return {
        badge: "border-emerald-200/80 bg-emerald-50/90 text-emerald-700",
        border: "border-emerald-200/70",
        surface: "from-emerald-50/80 via-background to-background",
        grid: "rgba(5, 150, 105, 0.1)",
      };
    case "memory":
      return {
        badge: "border-amber-200/80 bg-amber-50/90 text-amber-700",
        border: "border-amber-200/70",
        surface: "from-amber-50/80 via-background to-background",
        grid: "rgba(217, 119, 6, 0.1)",
      };
    case "network":
      return {
        badge: "border-sky-200/80 bg-sky-50/90 text-sky-700",
        border: "border-sky-200/70",
        surface: "from-sky-50/80 via-background to-background",
        grid: "rgba(2, 132, 199, 0.1)",
      };
    case "disk":
      return {
        badge: "border-rose-200/80 bg-rose-50/90 text-rose-700",
        border: "border-rose-200/70",
        surface: "from-rose-50/80 via-background to-background",
        grid: "rgba(225, 29, 72, 0.1)",
      };
  }
}

function getLineColor(index: number) {
  return LINE_COLORS[index % LINE_COLORS.length] ?? LINE_COLORS[0];
}

function buildLinePath(
  points: Array<number | null>,
  width: number,
  height: number,
  paddingX: number,
  paddingY: number,
  minValue: number,
  maxValue: number,
) {
  const safeHeight = height - paddingY * 2;
  const safeWidth = width - paddingX * 2;
  const range = maxValue - minValue || 1;
  const step = points.length > 1 ? safeWidth / (points.length - 1) : safeWidth;
  let path = "";
  let hasOpenSegment = false;

  points.forEach((value, index) => {
    if (value === null || !Number.isFinite(value)) {
      hasOpenSegment = false;
      return;
    }

    const normalized = (value - minValue) / range;
    const x = Number((paddingX + index * step).toFixed(2));
    const y = Number((height - paddingY - normalized * safeHeight).toFixed(2));

    path += hasOpenSegment ? ` L ${x} ${y}` : ` M ${x} ${y}`;
    hasOpenSegment = true;
  });

  return path.trim();
}

function LargeMultiLineChart({ chart }: { chart: AllContainersMetricChart }) {
  const chartClasses = getChartClasses(chart.variant);
  const width = 760;
  const height = 280;
  const paddingX = 18;
  const paddingY = 18;
  const allValues = chart.series.flatMap((line) =>
    line.points.filter((value): value is number => value !== null),
  );

  if (!allValues.length) {
    return (
      <div className="flex h-72 items-center justify-center rounded-[1.35rem] border border-dashed border-border/70 bg-background/70 px-4 text-center text-sm leading-6 text-muted-foreground">
        Waiting for InfluxDB buckets for the selected time window.
      </div>
    );
  }

  const minValue = Math.min(...allValues);
  const maxValue = Math.max(...allValues);
  const gridLines = Array.from({ length: 5 }, (_, index) => {
    const progress = index / 4;
    return height - paddingY - progress * (height - paddingY * 2);
  });

  return (
    <div
      className={cn(
        "overflow-hidden rounded-[1.45rem] border bg-linear-to-br px-4 py-4 shadow-[0_24px_64px_-48px_rgba(15,23,42,0.28)]",
        chartClasses.border,
        chartClasses.surface,
      )}
    >
      <svg
        aria-hidden="true"
        className="h-72 w-full"
        preserveAspectRatio="none"
        viewBox={`0 0 ${width} ${height}`}
      >
        {gridLines.map((y) => (
          <path
            d={`M${paddingX} ${y} H${width - paddingX}`}
            key={y}
            stroke={chartClasses.grid}
            strokeDasharray="4 8"
            strokeWidth="1"
          />
        ))}
        {chart.series.map((line, index) => {
          const path = buildLinePath(
            line.points,
            width,
            height,
            paddingX,
            paddingY,
            minValue,
            maxValue,
          );

          if (!path) {
            return null;
          }

          return (
            <path
              d={path}
              fill="none"
              key={line.id}
              stroke={getLineColor(index)}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
            />
          );
        })}
      </svg>
    </div>
  );
}

function AggregateChartCard({ chart }: { chart: AllContainersMetricChart }) {
  const chartClasses = getChartClasses(chart.variant);

  return (
    <Card className="overflow-hidden border-border/70 bg-card/92 shadow-[0_28px_76px_-56px_rgba(15,23,42,0.3)]">
      <CardHeader className="border-b border-border/60 bg-linear-to-r from-muted/52 via-background to-background">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <CardTitle>{chart.title}</CardTitle>
          </div>
          <Badge className={chartClasses.badge}>{chart.summaryLabel}</Badge>
        </div>
        <div className="text-3xl font-semibold tracking-tight text-foreground">
          {chart.summaryValue}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-5">
        <LargeMultiLineChart chart={chart} />
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          {chart.series.map((line, index) => (
            <div
              className="flex items-center gap-2 rounded-full border border-border/60 bg-background/80 px-3 py-1.5"
              key={`${chart.title}-${line.id}`}
            >
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: getLineColor(index) }}
              />
              <span className="font-medium text-foreground">{line.label}</span>
              <span>{line.latestValue}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function DashboardAllContainersContent({
  charts,
  onRangeChangeAction,
  range,
  rangeOptions,
  snapshot,
}: DashboardAllContainersContentProps) {
  const trackedContainers = snapshot?.containers.all.length ?? 0;
  const runningContainers = snapshot?.containers.running ?? 0;

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-[1.5rem] border border-border/70 bg-linear-to-r from-background via-muted/12 to-background shadow-[0_24px_72px_-56px_rgba(15,23,42,0.32)]">
        <div className="flex flex-col gap-4 px-4 py-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="secondary">{trackedContainers} tracked</Badge>
              <Badge variant="secondary">{runningContainers} running</Badge>
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-foreground md:text-2xl">
                All containers
              </h1>
            </div>
          </div>

          <div className="flex max-w-3xl flex-wrap gap-2 xl:justify-end">
            {rangeOptions.map((option) => (
              <Button
                aria-pressed={range === option.value}
                className={cn(
                  "rounded-full",
                  range === option.value
                    ? "border-emerald-200/80 bg-emerald-50/90 text-emerald-700 shadow-[0_18px_40px_-32px_rgba(16,185,129,0.3)] hover:bg-emerald-50"
                    : "border-border/60 bg-background/82 text-muted-foreground hover:text-foreground",
                )}
                key={option.value}
                onClick={() => onRangeChangeAction(option.value)}
                size="xs"
                type="button"
                variant="ghost"
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>
      </section>

      <div className="grid gap-4 2xl:grid-cols-2">
        {charts.map((chart) => (
          <AggregateChartCard chart={chart} key={chart.title} />
        ))}
      </div>
    </div>
  );
}
