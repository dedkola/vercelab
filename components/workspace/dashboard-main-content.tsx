"use client";

import type { PreviewContainer } from "@/components/workspace-shell";
import type { ContainerStats } from "@/lib/system-metrics";
import type { DashboardRange } from "@/lib/metrics-range";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { getToneClasses, Sparkline, usePercentWidthRef } from "./workspace-ui";

type FocusedMetricLegend = {
  label: string;
  value: string;
};

export type FocusedMetricChart = {
  delta: string;
  legends: FocusedMetricLegend[];
  primaryPoints: number[];
  secondaryPoints?: number[];
  trendPoints: number[];
  title: string;
  value: string;
  variant: "cpu" | "memory" | "network" | "disk";
};

type DashboardMainContentProps = {
  focusedMetricCharts: FocusedMetricChart[];
  healthOrNodeLabel: string;
  onRangeChangeAction: (range: DashboardRange) => void;
  projectOrRegionLabel: string;
  range: DashboardRange;
  rangeOptions: ReadonlyArray<{
    label: string;
    value: DashboardRange;
  }>;
  runtimePillLabel: string;
  sampleContextLabel: string;
  selectedContainer: PreviewContainer;
  selectedRuntimeContainer: ContainerStats | null;
  selectedStatusLabel: string;
  selectedStatusVariant: "success" | "warning" | "default";
  serviceOrPortLabel: string;
};

function EndpointLoadBar({ load }: { load: number }) {
  const fillRef = usePercentWidthRef<HTMLDivElement>(load);

  return (
    <div className="mt-3 h-2 rounded-full bg-muted/70">
      <div
        className="h-2 rounded-full bg-linear-to-r from-emerald-400 to-amber-300"
        ref={fillRef}
      />
    </div>
  );
}

function getChartSeries(points: number[]) {
  const safePoints = points.length
    ? points
    : Array.from({ length: 12 }, () => 0);
  const width = 224;
  const height = 108;
  const paddingX = 10;
  const paddingY = 12;
  const max = Math.max(...safePoints);
  const min = Math.min(...safePoints);
  const range = max - min || 1;
  const step =
    safePoints.length > 1
      ? (width - paddingX * 2) / (safePoints.length - 1)
      : width - paddingX * 2;

  const pointsData = safePoints.map((value, index) => {
    const normalized = (value - min) / range;

    return {
      x: Number((paddingX + index * step).toFixed(2)),
      y: Number(
        (height - paddingY - normalized * (height - paddingY * 2)).toFixed(2),
      ),
    };
  });

  return {
    areaPoints: [
      `${paddingX},${height - paddingY}`,
      ...pointsData.map((point) => `${point.x},${point.y}`),
      `${width - paddingX},${height - paddingY}`,
    ].join(" "),
    height,
    linePoints: pointsData.map((point) => `${point.x},${point.y}`).join(" "),
    pointsData,
    width,
  };
}

function MetricChartEmptyState() {
  return (
    <div className="flex h-28 items-center justify-center rounded-[1.15rem] border border-dashed border-border/70 bg-background/70 px-3 text-center text-xs leading-5 text-muted-foreground">
      Waiting for recent InfluxDB samples for this container.
    </div>
  );
}

function CpuLoadChart({ points }: { points: number[] }) {
  if (!points.length) {
    return <MetricChartEmptyState />;
  }

  const series = getChartSeries(points);
  const lastPoint = series.pointsData[series.pointsData.length - 1];

  return (
    <div className="rounded-[1.2rem] border border-emerald-200/70 bg-linear-to-br from-emerald-100/60 via-background to-background px-3 py-3 shadow-[0_20px_48px_-40px_rgba(5,150,105,0.32)]">
      <svg
        aria-hidden="true"
        className="h-28 w-full"
        preserveAspectRatio="none"
        viewBox={`0 0 ${series.width} ${series.height}`}
      >
        <path
          d={`M10 ${series.height - 12} H${series.width - 10}`}
          stroke="rgba(5, 150, 105, 0.12)"
          strokeDasharray="4 5"
          strokeWidth="1"
        />
        <polygon fill="rgba(16, 185, 129, 0.18)" points={series.areaPoints} />
        <polyline
          fill="none"
          points={series.linePoints}
          stroke="rgba(5, 150, 105, 0.94)"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.75"
        />
        {lastPoint ? (
          <circle
            cx={lastPoint.x}
            cy={lastPoint.y}
            fill="white"
            r="4.5"
            stroke="rgba(5, 150, 105, 0.94)"
            strokeWidth="2"
          />
        ) : null}
      </svg>
    </div>
  );
}

function MemoryLoadChart({ points }: { points: number[] }) {
  if (!points.length) {
    return <MetricChartEmptyState />;
  }

  const safePoints = points.length
    ? points
    : Array.from({ length: 12 }, () => 0);
  const max = Math.max(...safePoints, 1);
  const barWidth = Math.max(8, Math.floor(188 / safePoints.length));
  const gap = 5;
  const chartHeight = 92;

  return (
    <div className="rounded-[1.2rem] border border-amber-200/70 bg-linear-to-br from-amber-100/60 via-background to-background px-3 py-3 shadow-[0_20px_48px_-40px_rgba(217,119,6,0.28)]">
      <svg aria-hidden="true" className="h-28 w-full" viewBox="0 0 224 108">
        <path
          d="M12 96 H212"
          stroke="rgba(217, 119, 6, 0.12)"
          strokeDasharray="4 5"
          strokeWidth="1"
        />
        {safePoints.map((point, index) => {
          const normalized = point / max;
          const height = Math.max(6, normalized * chartHeight);
          const x = 12 + index * (barWidth + gap);
          const y = 96 - height;
          const isLast = index === safePoints.length - 1;

          return (
            <rect
              fill={
                isLast ? "rgba(217, 119, 6, 0.88)" : "rgba(245, 158, 11, 0.34)"
              }
              height={height}
              key={`${point}-${index}`}
              rx="6"
              width={barWidth}
              x={x}
              y={y}
            />
          );
        })}
      </svg>
    </div>
  );
}

function DualLineChart({
  primaryPoints,
  secondaryPoints,
}: {
  primaryPoints: number[];
  secondaryPoints: number[];
}) {
  if (!primaryPoints.length && !secondaryPoints.length) {
    return <MetricChartEmptyState />;
  }

  const primarySeries = getChartSeries(primaryPoints);
  const secondarySeries = getChartSeries(secondaryPoints);

  return (
    <div className="rounded-[1.2rem] border border-sky-200/70 bg-linear-to-br from-sky-100/55 via-background to-background px-3 py-3 shadow-[0_20px_48px_-40px_rgba(14,165,233,0.28)]">
      <svg
        aria-hidden="true"
        className="h-28 w-full"
        preserveAspectRatio="none"
        viewBox={`0 0 ${primarySeries.width} ${primarySeries.height}`}
      >
        <path
          d={`M10 ${primarySeries.height - 12} H${primarySeries.width - 10}`}
          stroke="rgba(14, 165, 233, 0.12)"
          strokeDasharray="4 5"
          strokeWidth="1"
        />
        <polygon
          fill="rgba(56, 189, 248, 0.14)"
          points={primarySeries.areaPoints}
        />
        <polyline
          fill="none"
          points={primarySeries.linePoints}
          stroke="rgba(2, 132, 199, 0.95)"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.4"
        />
        <polyline
          fill="none"
          points={secondarySeries.linePoints}
          stroke="rgba(71, 85, 105, 0.88)"
          strokeDasharray="5 4"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.2"
        />
      </svg>
    </div>
  );
}

function DiskIoChart({
  primaryPoints,
  secondaryPoints,
}: {
  primaryPoints: number[];
  secondaryPoints: number[];
}) {
  if (!primaryPoints.length && !secondaryPoints.length) {
    return <MetricChartEmptyState />;
  }

  const safePrimary = primaryPoints.length
    ? primaryPoints
    : Array.from({ length: secondaryPoints.length || 12 }, () => 0);
  const safeSecondary = secondaryPoints.length
    ? secondaryPoints
    : Array.from({ length: safePrimary.length }, () => 0);
  const laneWidth = Math.max(8, Math.floor(188 / safePrimary.length));
  const gap = 5;
  const laneHeight = 34;
  const maxPrimary = Math.max(...safePrimary, 1);
  const maxSecondary = Math.max(...safeSecondary, 1);

  return (
    <div className="rounded-[1.2rem] border border-rose-200/70 bg-linear-to-br from-rose-100/55 via-background to-background px-3 py-3 shadow-[0_20px_48px_-40px_rgba(244,63,94,0.22)]">
      <svg aria-hidden="true" className="h-28 w-full" viewBox="0 0 224 108">
        <path
          d="M12 44 H212"
          stroke="rgba(244, 63, 94, 0.12)"
          strokeDasharray="4 5"
          strokeWidth="1"
        />
        <path
          d="M12 96 H212"
          stroke="rgba(251, 146, 60, 0.12)"
          strokeDasharray="4 5"
          strokeWidth="1"
        />
        {safePrimary.map((point, index) => {
          const x = 12 + index * (laneWidth + gap);
          const topHeight = Math.max(4, (point / maxPrimary) * laneHeight);
          const bottomHeight = Math.max(
            4,
            (safeSecondary[index] / maxSecondary) * laneHeight,
          );

          return (
            <g key={`${point}-${safeSecondary[index]}-${index}`}>
              <rect
                fill="rgba(244, 63, 94, 0.42)"
                height={topHeight}
                rx="5"
                width={laneWidth}
                x={x}
                y={44 - topHeight}
              />
              <rect
                fill="rgba(251, 146, 60, 0.42)"
                height={bottomHeight}
                rx="5"
                width={laneWidth}
                x={x}
                y={96 - bottomHeight}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function FocusedMetricChartCard({ chart }: { chart: FocusedMetricChart }) {
  const cardClassName =
    chart.variant === "cpu"
      ? "from-emerald-50/80 via-background to-background"
      : chart.variant === "memory"
        ? "from-amber-50/80 via-background to-background"
        : chart.variant === "network"
          ? "from-sky-50/80 via-background to-background"
          : "from-rose-50/80 via-background to-background";
  const badgeClassName =
    chart.variant === "cpu"
      ? "border-emerald-200/80 bg-emerald-50/90 text-emerald-700"
      : chart.variant === "memory"
        ? "border-amber-200/80 bg-amber-50/90 text-amber-700"
        : chart.variant === "network"
          ? "border-sky-200/80 bg-sky-50/90 text-sky-700"
          : "border-rose-200/80 bg-rose-50/90 text-rose-700";

  return (
    <Card
      className={cn(
        "overflow-hidden border-border/70 bg-linear-to-br shadow-[0_24px_64px_-48px_rgba(15,23,42,0.3)]",
        cardClassName,
      )}
    >
      <CardHeader className="border-b border-border/60">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>{chart.title}</CardTitle>
          </div>
          <Badge className={badgeClassName}>{chart.delta}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        <div className="text-2xl font-semibold tracking-tight text-foreground">
          {chart.value}
        </div>
        <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          {chart.legends.map((legend) => (
            <div
              className="rounded-full border border-border/60 bg-background/82 px-2.5 py-1"
              key={legend.label}
            >
              {legend.label} {legend.value}
            </div>
          ))}
        </div>
        {chart.variant === "cpu" ? (
          <CpuLoadChart points={chart.primaryPoints} />
        ) : chart.variant === "memory" ? (
          <MemoryLoadChart points={chart.primaryPoints} />
        ) : chart.variant === "network" ? (
          <DualLineChart
            primaryPoints={chart.primaryPoints}
            secondaryPoints={chart.secondaryPoints ?? []}
          />
        ) : (
          <DiskIoChart
            primaryPoints={chart.primaryPoints}
            secondaryPoints={chart.secondaryPoints ?? []}
          />
        )}
      </CardContent>
    </Card>
  );
}

function getFocusedMetricTone(variant: FocusedMetricChart["variant"]) {
  switch (variant) {
    case "cpu":
      return "emerald" as const;
    case "memory":
    case "disk":
      return "amber" as const;
    case "network":
      return "slate" as const;
  }
}

export function DashboardMainContent({
  focusedMetricCharts,
  healthOrNodeLabel,
  onRangeChangeAction,
  projectOrRegionLabel,
  range,
  rangeOptions,
  runtimePillLabel,
  sampleContextLabel,
  selectedContainer,
  selectedRuntimeContainer,
  selectedStatusLabel,
  selectedStatusVariant,
  serviceOrPortLabel,
}: DashboardMainContentProps) {
  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-[1.5rem] border border-border/70 bg-linear-to-r from-background via-muted/12 to-background shadow-[0_24px_72px_-56px_rgba(15,23,42,0.32)]">
        <div className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2.5">
            <h1 className="max-w-full truncate text-lg font-semibold tracking-tight text-foreground md:text-xl">
              {selectedContainer.name}
            </h1>
            <Badge variant={selectedStatusVariant}>{selectedStatusLabel}</Badge>
          </div>

          <div className="flex flex-wrap gap-2 lg:max-w-2xl lg:justify-end">
            <div className="min-w-34 rounded-full border border-border/60 bg-background/82 px-3 py-2 text-sm shadow-[0_18px_42px_-34px_rgba(15,23,42,0.22)]">
              <span className="mr-2 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                Runtime
              </span>
              <span className="font-semibold text-foreground">
                {runtimePillLabel}
              </span>
            </div>
            <div className="min-w-34 rounded-full border border-border/60 bg-background/82 px-3 py-2 text-sm shadow-[0_18px_42px_-34px_rgba(15,23,42,0.22)]">
              <span className="mr-2 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                {selectedRuntimeContainer ? "Health" : "Node"}
              </span>
              <span className="font-semibold text-foreground">
                {healthOrNodeLabel}
              </span>
            </div>
            <div className="min-w-34 rounded-full border border-border/60 bg-background/82 px-3 py-2 text-sm shadow-[0_18px_42px_-34px_rgba(15,23,42,0.22)]">
              <span className="mr-2 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                {selectedRuntimeContainer ? "Project" : "Region"}
              </span>
              <span className="font-semibold text-foreground">
                {projectOrRegionLabel}
              </span>
            </div>
            <div className="min-w-34 rounded-full border border-border/60 bg-background/82 px-3 py-2 text-sm shadow-[0_18px_42px_-34px_rgba(15,23,42,0.22)]">
              <span className="mr-2 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                {selectedRuntimeContainer ? "Service" : "Exposed port"}
              </span>
              <span className="font-semibold text-foreground">
                {serviceOrPortLabel}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[1.35rem] border border-border/70 bg-linear-to-r from-background via-muted/12 to-background shadow-[0_24px_64px_-52px_rgba(15,23,42,0.24)]">
        <div className="flex flex-col gap-4 px-4 py-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="text-sm font-semibold tracking-tight text-foreground">
              History window
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

      <div className="grid grid-cols-[repeat(auto-fit,minmax(15rem,1fr))] gap-4">
        {focusedMetricCharts.map((chart) => (
          <FocusedMetricChartCard chart={chart} key={chart.title} />
        ))}
      </div>

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card className="overflow-hidden border-border/70 bg-card/92">
          <CardHeader className="border-b border-border/60 bg-linear-to-r from-muted/52 via-background to-background">
            <CardTitle>Current container signals</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-[repeat(auto-fit,minmax(12rem,1fr))] gap-4 pt-4">
            {focusedMetricCharts.map((chart) => {
              const toneClasses = getToneClasses(
                getFocusedMetricTone(chart.variant),
              );

              return (
                <div
                  className={cn(
                    "rounded-[1.35rem] border bg-linear-to-br px-4 py-4 shadow-[0_20px_52px_-44px_rgba(15,23,42,0.22)]",
                    toneClasses.border,
                    toneClasses.surface,
                  )}
                  key={chart.title}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-sm font-semibold tracking-tight text-foreground">
                      {chart.title}
                    </div>
                    <div
                      className={cn("text-xs font-semibold", toneClasses.delta)}
                    >
                      {chart.delta}
                    </div>
                  </div>
                  <div className="mt-4 text-xl font-semibold tracking-tight text-foreground">
                    {chart.value}
                  </div>
                  <Sparkline
                    className="mt-4 h-16"
                    points={chart.trendPoints}
                    tone={getFocusedMetricTone(chart.variant)}
                  />
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                    {chart.legends.map((legend) => (
                      <div key={legend.label}>
                        {legend.label} {legend.value}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-border/70 bg-card/92">
          <CardHeader className="border-b border-border/60 bg-linear-to-r from-muted/52 via-background to-background">
            <CardTitle>Runtime overview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[1.25rem] border border-border/60 bg-background/80 px-4 py-3">
                <div className="text-xs text-muted-foreground">Image</div>
                <div className="mt-1 text-sm font-semibold text-foreground">
                  {selectedContainer.image}
                </div>
              </div>
              <div className="rounded-[1.25rem] border border-border/60 bg-background/80 px-4 py-3">
                <div className="text-xs text-muted-foreground">Stack</div>
                <div className="mt-1 text-sm font-semibold text-foreground">
                  {selectedContainer.stack}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {selectedContainer.endpoints.length ? (
                selectedContainer.endpoints.map((endpoint) => (
                  <div
                    className="rounded-[1.2rem] border border-border/60 bg-background/80 px-4 py-3"
                    key={endpoint.name}
                  >
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <a
                        className="truncate font-semibold text-emerald-700 underline decoration-emerald-300 underline-offset-2"
                        href={endpoint.url ?? endpoint.name}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {endpoint.url ?? endpoint.name}
                      </a>
                      <div className="text-xs text-muted-foreground">
                        {endpoint.latency} - {endpoint.uptime}
                      </div>
                    </div>
                    <EndpointLoadBar load={endpoint.load} />
                  </div>
                ))
              ) : (
                <div className="rounded-[1.2rem] border border-dashed border-border/70 bg-background/70 px-4 py-4 text-sm text-muted-foreground">
                  No Traefik route detected for this container yet.
                </div>
              )}
            </div>

            <div className="space-y-2 rounded-[1.2rem] border border-border/60 bg-background/80 px-4 py-3">
              {selectedContainer.timeline.length ? (
                selectedContainer.timeline.map((event) => (
                  <div className="flex gap-3 text-sm" key={event.label}>
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-500/80" />
                    <div>
                      <div className="font-semibold tracking-tight text-foreground">
                        {event.label}
                      </div>
                      <div className="text-xs leading-5 text-muted-foreground">
                        {event.detail}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-xs leading-5 text-muted-foreground">
                  Runtime notes will appear here when richer container
                  inspection data is connected.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden border-border/70 bg-card/92">
        <CardHeader className="border-b border-border/60 bg-linear-to-r from-muted/52 via-background to-background">
          <CardTitle>Environment and mounts</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 pt-4 lg:grid-cols-2">
          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Environment
            </div>
            {selectedContainer.environment.length ? (
              selectedContainer.environment.map((item) => (
                <div
                  className="rounded-[1.2rem] border border-border/60 bg-background/80 px-4 py-3"
                  key={item.key}
                >
                  <div className="text-xs text-muted-foreground">
                    {item.key}
                  </div>
                  <div className="mt-1 font-mono text-sm text-foreground">
                    {item.value}
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-[1.2rem] border border-dashed border-border/70 bg-background/70 px-4 py-4 text-sm text-muted-foreground">
                Environment inspection is not wired for this live runtime yet.
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Volumes
            </div>
            {selectedContainer.volumes.length ? (
              selectedContainer.volumes.map((volume) => (
                <div
                  className="rounded-[1.2rem] border border-border/60 bg-background/80 px-4 py-3"
                  key={volume}
                >
                  <div className="font-mono text-sm text-foreground">
                    {volume}
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-[1.2rem] border border-dashed border-border/70 bg-background/70 px-4 py-4 text-sm text-muted-foreground">
                Mount inspection is not wired for this live runtime yet.
              </div>
            )}
            {selectedContainer.tags.length ? (
              <div className="flex flex-wrap gap-2 pt-1">
                {selectedContainer.tags.map((tag) => (
                  <Badge
                    className="border-border/60 bg-muted/70 text-foreground"
                    key={tag}
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
            ) : null}
            <div className="rounded-[1.2rem] border border-border/60 bg-background/80 px-4 py-3 text-xs leading-5 text-muted-foreground">
              {sampleContextLabel}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
