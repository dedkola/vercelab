"use client";

import { useMemo } from "react";

import { EChartSurface } from "@/components/ui/echart-surface";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { DashboardRange } from "@/lib/metrics-range";
import type {
  AllContainersMetricsHistorySeries,
  MetricsHistoryPoint,
} from "@/lib/influx-metrics";
import type { MetricsSnapshot } from "@/lib/system-metrics";
import {
  buildContainerMetricPanels,
  buildSystemMetricPanels,
  formatAxisValue,
  formatDashboardRangeLabel,
  formatDetailedTimestamp,
  formatLoadAverage,
  formatMetricValue,
  type ContainerMetricPanel,
  type SystemMetricPanel,
} from "@/lib/metrics-dashboard-metrics";

import { SectionLabel } from "./workspace-ui";
import type { EChartsCoreOption } from "echarts";

type MetricsDashboardMainContentProps = {
  allContainerHistory: AllContainersMetricsHistorySeries[];
  onRangeChangeAction: (range: DashboardRange) => void;
  range: DashboardRange;
  rangeOptions: ReadonlyArray<{
    label: string;
    value: DashboardRange;
  }>;
  selectedContainerId: string | null;
  selectedContainerName: string | null;
  snapshot: MetricsSnapshot | null;
  history: MetricsHistoryPoint[];
};

type TooltipPoint = {
  color?: string;
  data?: number | null;
  dataIndex?: number;
  marker?: string;
  seriesName?: string;
};

const SYSTEM_STYLES = {
  cpu: {
    badge: "border-emerald-200/80 bg-emerald-50/90 text-emerald-700",
    border: "border-emerald-200/70",
    chartTone: "rgba(15, 118, 110, 0.96)",
    grid: "rgba(15, 118, 110, 0.12)",
    surface: "from-emerald-50/88 via-background to-background",
    tooltipAccent: "#0f766e",
  },
  disk: {
    badge: "border-rose-200/80 bg-rose-50/90 text-rose-700",
    border: "border-rose-200/70",
    chartTone: "rgba(225, 29, 72, 0.94)",
    grid: "rgba(225, 29, 72, 0.12)",
    surface: "from-rose-50/88 via-background to-background",
    tooltipAccent: "#e11d48",
  },
  memory: {
    badge: "border-amber-200/80 bg-amber-50/90 text-amber-700",
    border: "border-amber-200/70",
    chartTone: "rgba(217, 119, 6, 0.96)",
    grid: "rgba(217, 119, 6, 0.12)",
    surface: "from-amber-50/88 via-background to-background",
    tooltipAccent: "#d97706",
  },
  network: {
    badge: "border-sky-200/80 bg-sky-50/90 text-sky-700",
    border: "border-sky-200/70",
    chartTone: "rgba(2, 132, 199, 0.96)",
    grid: "rgba(2, 132, 199, 0.12)",
    surface: "from-sky-50/88 via-background to-background",
    tooltipAccent: "#0284c7",
  },
} as const;

function getLabelInterval(length: number) {
  if (length <= 6) {
    return 0;
  }

  return Math.max(1, Math.ceil(length / 6) - 1);
}

function createTooltipShell(title: string, rows: string) {
  return `<div style="min-width: 180px; padding: 12px 14px; border-radius: 16px; background: rgba(15,23,42,0.96); color: #e2e8f0; box-shadow: 0 18px 48px -28px rgba(15,23,42,0.6);"><div style="margin-bottom: 10px; font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: #94a3b8;">${title}</div>${rows}</div>`;
}

function createTooltipRow(label: string, value: string, color?: string) {
  return `<div style="display:flex; align-items:center; justify-content:space-between; gap:16px; font-size:12px; line-height:1.5;"><span style="display:flex; align-items:center; gap:8px; color:#cbd5e1;"><span style="width:9px; height:9px; border-radius:999px; background:${color ?? "#94a3b8"};"></span>${label}</span><strong style="font-size:12px; color:#f8fafc;">${value}</strong></div>`;
}

function EmptyChartState({ message }: { message: string }) {
  return (
    <div className="flex h-44 items-center justify-center rounded-[1.2rem] border border-dashed border-border/70 bg-background/70 px-4 text-center text-sm leading-6 text-muted-foreground">
      {message}
    </div>
  );
}

function buildSystemChartOption(panel: SystemMetricPanel): EChartsCoreOption {
  const style = SYSTEM_STYLES[panel.id];
  const axisInterval = getLabelInterval(panel.labels.length);

  const common = {
    animation: false,
    grid: {
      bottom: 26,
      containLabel: true,
      left: 8,
      right: 8,
      top: 16,
    },
    tooltip: {
      backgroundColor: "transparent",
      borderWidth: 0,
      extraCssText: "box-shadow:none;",
      formatter: (value: unknown) => {
        const params = Array.isArray(value)
          ? (value as TooltipPoint[])
          : [value as TooltipPoint];
        const index = params[0]?.dataIndex ?? 0;
        const title = formatDetailedTimestamp(
          panel.timestamps[index] ??
            panel.labels[index] ??
            new Date().toISOString(),
        );
        const rows = [
          createTooltipRow(
            panel.title,
            formatMetricValue(panel.primaryValues[index] ?? 0, panel.format),
            style.tooltipAccent,
          ),
        ];

        if (panel.secondaryValues?.length) {
          rows.push(
            createTooltipRow(
              panel.id === "network" ? "Egress" : "Write",
              formatMetricValue(
                panel.secondaryValues[index] ?? 0,
                panel.format,
              ),
              panel.id === "network" ? "#475569" : "#fb7185",
            ),
          );
        }

        return createTooltipShell(title, rows.join(""));
      },
      padding: 0,
      trigger: "axis",
      axisPointer: {
        lineStyle: {
          color: style.chartTone,
          width: 1,
        },
        type: "line",
      },
    },
    xAxis: {
      axisLabel: {
        color: "rgba(71,85,105,0.88)",
        fontSize: 10,
        interval: axisInterval,
        margin: 12,
      },
      axisLine: {
        lineStyle: {
          color: "rgba(148,163,184,0.24)",
        },
      },
      axisTick: {
        show: false,
      },
      boundaryGap: panel.variant === "bars" || panel.variant === "banded",
      data: panel.labels,
      type: "category",
    },
    yAxis: {
      axisLabel: {
        color: "rgba(100,116,139,0.82)",
        fontSize: 10,
        formatter: (value: number) => formatAxisValue(value, panel.format),
      },
      axisLine: {
        show: false,
      },
      axisTick: {
        show: false,
      },
      splitLine: {
        lineStyle: {
          color: style.grid,
          type: "dashed",
        },
      },
      type: "value",
    },
  } satisfies EChartsCoreOption;

  if (panel.variant === "area") {
    return {
      ...common,
      series: [
        {
          areaStyle: {
            color: {
              colorStops: [
                {
                  color: "rgba(16,185,129,0.34)",
                  offset: 0,
                },
                {
                  color: "rgba(16,185,129,0.03)",
                  offset: 1,
                },
              ],
              type: "linear",
              x: 0,
              x2: 0,
              y: 0,
              y2: 1,
            },
          },
          data: panel.primaryValues,
          itemStyle: {
            color: "#0f766e",
          },
          lineStyle: {
            color: "#0f766e",
            width: 3,
          },
          showSymbol: false,
          smooth: true,
          type: "line",
        },
      ],
    };
  }

  if (panel.variant === "bars") {
    return {
      ...common,
      series: [
        {
          barWidth: "56%",
          data: panel.primaryValues,
          itemStyle: {
            borderRadius: [8, 8, 0, 0],
            color: "rgba(245, 158, 11, 0.78)",
          },
          type: "bar",
        },
      ],
    };
  }

  if (panel.variant === "dual-line") {
    return {
      ...common,
      series: [
        {
          data: panel.primaryValues,
          itemStyle: {
            color: "#0284c7",
          },
          lineStyle: {
            color: "#0284c7",
            width: 2.8,
          },
          showSymbol: false,
          smooth: true,
          type: "line",
        },
        {
          data: panel.secondaryValues ?? [],
          itemStyle: {
            color: "#475569",
          },
          lineStyle: {
            color: "#475569",
            type: "dashed",
            width: 2.2,
          },
          showSymbol: false,
          smooth: true,
          type: "line",
        },
      ],
    };
  }

  return {
    ...common,
    series: [
      {
        barGap: "30%",
        barWidth: "34%",
        data: panel.primaryValues,
        itemStyle: {
          borderRadius: [8, 8, 0, 0],
          color: "rgba(244, 63, 94, 0.72)",
        },
        type: "bar",
      },
      {
        barGap: "30%",
        barWidth: "34%",
        data: panel.secondaryValues ?? [],
        itemStyle: {
          borderRadius: [8, 8, 0, 0],
          color: "rgba(251, 146, 60, 0.58)",
        },
        type: "bar",
      },
    ],
  };
}

function buildContainerChartOption(
  panel: ContainerMetricPanel,
): EChartsCoreOption {
  const axisInterval = getLabelInterval(panel.labels.length);
  const hasSelectedSeries = panel.series.some((series) => series.isSelected);

  return {
    animation: false,
    color: panel.series.map((series) => series.color),
    dataZoom: [
      {
        filterMode: "none",
        moveHandleSize: 0,
        throttle: 30,
        type: "inside",
      },
      {
        backgroundColor: "rgba(226,232,240,0.58)",
        borderColor: "transparent",
        bottom: 18,
        fillerColor: "rgba(16,185,129,0.16)",
        handleSize: "80%",
        height: 18,
        moveHandleSize: 0,
        type: "slider",
      },
    ],
    grid: {
      bottom: 66,
      containLabel: true,
      left: 14,
      right: 18,
      top: 60,
    },
    legend: {
      icon: "roundRect",
      itemHeight: 8,
      itemWidth: 12,
      left: 0,
      pageIconColor: "#0f766e",
      pageTextStyle: {
        color: "rgba(71,85,105,0.88)",
      },
      right: 0,
      textStyle: {
        color: "rgba(71,85,105,0.9)",
        fontSize: 11,
      },
      top: 8,
      type: "scroll",
    },
    tooltip: {
      backgroundColor: "transparent",
      borderWidth: 0,
      extraCssText: "box-shadow:none;",
      formatter: (value: unknown) => {
        const params = (
          Array.isArray(value) ? value : [value]
        ) as TooltipPoint[];
        const safeParams = params
          .filter((item) => typeof item.data === "number")
          .sort(
            (left, right) => Number(right.data ?? 0) - Number(left.data ?? 0),
          );
        const index = safeParams[0]?.dataIndex ?? params[0]?.dataIndex ?? 0;
        const title = formatDetailedTimestamp(
          panel.timestamps[index] ??
            panel.labels[index] ??
            new Date().toISOString(),
        );

        const rows = safeParams.length
          ? safeParams
              .map((item) =>
                createTooltipRow(
                  item.seriesName ?? "Series",
                  formatMetricValue(Number(item.data ?? 0), panel.format),
                  item.color,
                ),
              )
              .join("")
          : createTooltipRow("No sample", "--");

        return createTooltipShell(title, rows);
      },
      padding: 0,
      trigger: "axis",
      axisPointer: {
        label: {
          backgroundColor: "#0f172a",
          borderRadius: 8,
          color: "#f8fafc",
        },
        lineStyle: {
          color: "rgba(15,23,42,0.26)",
        },
        type: "cross",
      },
    },
    xAxis: {
      axisLabel: {
        color: "rgba(71,85,105,0.88)",
        fontSize: 11,
        interval: axisInterval,
        margin: 14,
      },
      axisLine: {
        lineStyle: {
          color: "rgba(148,163,184,0.24)",
        },
      },
      axisTick: {
        show: false,
      },
      boundaryGap: false,
      data: panel.labels,
      type: "category",
    },
    yAxis: {
      axisLabel: {
        color: "rgba(100,116,139,0.82)",
        fontSize: 11,
        formatter: (value: number) => formatAxisValue(value, panel.format),
      },
      axisLine: {
        show: false,
      },
      axisTick: {
        show: false,
      },
      splitLine: {
        lineStyle: {
          color: "rgba(15,23,42,0.08)",
          type: "dashed",
        },
      },
      type: "value",
    },
    series: panel.series.map((series) => ({
      areaStyle: series.isSelected
        ? {
            color: {
              colorStops: [
                {
                  color: `${series.color}33`,
                  offset: 0,
                },
                {
                  color: `${series.color}05`,
                  offset: 1,
                },
              ],
              type: "linear",
              x: 0,
              x2: 0,
              y: 0,
              y2: 1,
            },
          }
        : undefined,
      connectNulls: false,
      data: series.values,
      emphasis: {
        focus: "series",
      },
      itemStyle: {
        color: series.color,
      },
      lineStyle: {
        color: series.color,
        opacity: hasSelectedSeries ? (series.isSelected ? 1 : 0.22) : 0.92,
        width: series.isSelected ? 3.1 : 1.8,
      },
      name: series.label,
      sampling: "lttb",
      showSymbol: false,
      smooth: panel.id !== "memory",
      symbol: "circle",
      symbolSize: series.isSelected ? 7 : 5,
      type: "line",
      z: series.isSelected ? 3 : 1,
    })),
  };
}

function SystemMetricCard({ panel }: { panel: SystemMetricPanel }) {
  const style = SYSTEM_STYLES[panel.id];

  return (
    <Card
      className={cn(
        "overflow-hidden border bg-linear-to-br shadow-[0_26px_68px_-54px_rgba(15,23,42,0.3)]",
        style.border,
        style.surface,
      )}
    >
      <CardHeader className="space-y-3 border-b border-border/60 pb-4">
        <div className="flex items-start justify-between gap-3">
          <CardTitle>{panel.title}</CardTitle>
          <Badge className={style.badge}>{panel.currentCaption}</Badge>
        </div>
        <div className="text-3xl font-semibold tracking-tight text-foreground">
          {panel.currentValue}
        </div>
        <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          {panel.stats.map((stat) => (
            <div
              className="rounded-full border border-border/60 bg-background/84 px-2.5 py-1"
              key={`${panel.id}-${stat.label}`}
            >
              {stat.label} {stat.value}
            </div>
          ))}
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        {panel.primaryValues.length ? (
          <EChartSurface
            ariaLabel={`${panel.title} chart`}
            className="h-44"
            option={buildSystemChartOption(panel)}
            setOptionOptions={{ lazyUpdate: true }}
          />
        ) : (
          <EmptyChartState message="Waiting for recent samples for this metric." />
        )}
      </CardContent>
    </Card>
  );
}

function ContainerMetricCard({ panel }: { panel: ContainerMetricPanel }) {
  return (
    <Card className="overflow-hidden border-border/70 bg-card/94 shadow-[0_30px_80px_-62px_rgba(15,23,42,0.34)]">
      <CardHeader className="gap-4 border-b border-border/60 bg-linear-to-r from-muted/44 via-background to-background pb-4">
        <CardTitle>{panel.title}</CardTitle>

        <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          {panel.stats.map((stat) => (
            <div
              className="rounded-full border border-border/60 bg-background/82 px-3 py-1.5"
              key={`${panel.id}-${stat.label}`}
            >
              {stat.label} {stat.value}
            </div>
          ))}
        </div>
      </CardHeader>
      <CardContent className="pt-5">
        {panel.series.some((series) =>
          series.values.some((value) => value !== null),
        ) ? (
          <EChartSurface
            ariaLabel={`${panel.title} chart`}
            className="h-96"
            option={buildContainerChartOption(panel)}
            setOptionOptions={{ lazyUpdate: true }}
          />
        ) : (
          <EmptyChartState message="Waiting for InfluxDB buckets for the selected range." />
        )}
      </CardContent>
    </Card>
  );
}

export function MetricsDashboardMainContent({
  allContainerHistory,
  onRangeChangeAction,
  range,
  rangeOptions,
  selectedContainerId,
  selectedContainerName,
  snapshot,
  history,
}: MetricsDashboardMainContentProps) {
  const systemPanels = useMemo(
    () => buildSystemMetricPanels(snapshot, history),
    [history, snapshot],
  );
  const containerPanels = useMemo(
    () =>
      buildContainerMetricPanels(
        snapshot,
        allContainerHistory,
        selectedContainerId,
      ),
    [allContainerHistory, selectedContainerId, snapshot],
  );
  const rangeLabel = formatDashboardRangeLabel(range);
  const trackedContainers =
    snapshot?.containers.all.length ?? allContainerHistory.length;
  const runningContainers = snapshot?.containers.running ?? trackedContainers;
  const loadAverageLabel = snapshot
    ? formatLoadAverage(snapshot.system.loadAverage)
    : "Waiting for load average";

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-[1.6rem] border border-border/70 bg-linear-to-r from-background via-muted/16 to-background shadow-[0_26px_76px_-56px_rgba(15,23,42,0.32)]">
        <div className="flex flex-col gap-5 px-4 py-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <SectionLabel icon="monitor" text="Infrastructure view" />
              <Badge variant="secondary">{trackedContainers} tracked</Badge>
              <Badge variant="secondary">{runningContainers} running</Badge>
              {selectedContainerName ? (
                <Badge className="border-emerald-200/80 bg-emerald-50/90 text-emerald-700">
                  Focus {selectedContainerName}
                </Badge>
              ) : (
                <Badge className="border-border/60 bg-background/82 text-foreground">
                  Fleet compare
                </Badge>
              )}
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-foreground md:text-2xl">
                Metrics dashboard
              </h1>
            </div>
            <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              <div className="rounded-full border border-border/60 bg-background/80 px-3 py-1.5">
                Window {rangeLabel}
              </div>
              <div className="rounded-full border border-border/60 bg-background/80 px-3 py-1.5">
                Load avg {loadAverageLabel}
              </div>
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

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold tracking-tight text-foreground">
            Host overview
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
          {systemPanels.map((panel) => (
            <SystemMetricCard key={panel.id} panel={panel} />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold tracking-tight text-foreground">
            Container load explorer
          </div>
        </div>

        <div className="space-y-4">
          {containerPanels.map((panel) => (
            <ContainerMetricCard key={panel.id} panel={panel} />
          ))}
        </div>
      </section>
    </div>
  );
}
