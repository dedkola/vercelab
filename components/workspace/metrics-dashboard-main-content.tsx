"use client";

import { memo, useMemo } from "react";

import { EChartSurface } from "@/components/ui/echart-surface";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { DashboardRange } from "@/lib/metrics-range";
import type { AllContainersMetricsHistorySeries } from "@/lib/influx-metrics";
import type { DeploymentSummary } from "@/lib/persistence";
import type { MetricsSnapshot } from "@/lib/system-metrics";
import {
  buildContainerMetricPanels,
  formatAxisValue,
  formatDashboardRangeLabel,
  formatDetailedTimestamp,
  formatLoadAverage,
  formatMetricValue,
  type ContainerMetricPanel,
} from "@/lib/metrics-dashboard-metrics";

import { SectionLabel } from "./workspace-ui";
import type { EChartsCoreOption } from "echarts";

type MetricsDashboardMainContentProps = {
  allContainerHistory: AllContainersMetricsHistorySeries[];
  containerHistoryStatusText?: string | null;
  deployments: DeploymentSummary[];
  isAllContainerHistoryLoading?: boolean;
  onRangeChangeAction: (range: DashboardRange) => void;
  range: DashboardRange;
  rangeOptions: ReadonlyArray<{
    label: string;
    value: DashboardRange;
  }>;
  selectedContainerId: string | null;
  selectedContainerName: string | null;
  snapshot: MetricsSnapshot | null;
};

type TooltipPoint = {
  color?: string;
  data?: number | null;
  dataIndex?: number;
  marker?: string;
  seriesName?: string;
};

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

const CHART_SET_OPTION_OPTIONS = { lazyUpdate: true } as const;

function EmptyChartState({ message }: { message: string }) {
  return (
    <div className="flex h-44 items-center justify-center rounded-[1.2rem] border border-dashed border-border/70 bg-background/70 px-4 text-center text-sm leading-6 text-muted-foreground">
      {message}
    </div>
  );
}

function buildContainerChartOption(
  panel: ContainerMetricPanel,
): EChartsCoreOption {
  const axisInterval = getLabelInterval(panel.labels.length);
  const hasSelectedSeries = panel.series.some((series) => series.isSelected);

  return {
    animation: false,
    color: panel.series.map((series) => series.color),
    grid: {
      bottom: 34,
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

const ContainerMetricCard = memo(function ContainerMetricCard({
  panel,
  loadingMessage,
}: {
  loadingMessage: string;
  panel: ContainerMetricPanel;
}) {
  const option = useMemo(() => buildContainerChartOption(panel), [panel]);

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
            option={option}
            setOptionOptions={CHART_SET_OPTION_OPTIONS}
          />
        ) : (
          <EmptyChartState message={loadingMessage} />
        )}
      </CardContent>
    </Card>
  );
});

export function MetricsDashboardMainContent({
  allContainerHistory,
  containerHistoryStatusText,
  deployments,
  isAllContainerHistoryLoading = false,
  onRangeChangeAction,
  range,
  rangeOptions,
  selectedContainerId,
  selectedContainerName,
  snapshot,
}: MetricsDashboardMainContentProps) {
  const containerPanels = useMemo(
    () =>
      buildContainerMetricPanels(
        snapshot,
        allContainerHistory,
        selectedContainerId,
        deployments,
      ),
    [allContainerHistory, deployments, selectedContainerId, snapshot],
  );
  const rangeLabel = formatDashboardRangeLabel(range);
  const containerEmptyStateMessage = containerHistoryStatusText
    ? containerHistoryStatusText
    : isAllContainerHistoryLoading
      ? "Refreshing container history for the selected range."
      : "Waiting for InfluxDB buckets for the selected range.";
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-semibold tracking-tight text-foreground">
            Container load explorer
          </div>

          {isAllContainerHistoryLoading || containerHistoryStatusText ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {isAllContainerHistoryLoading ? (
                <Badge variant="secondary">Refreshing history…</Badge>
              ) : null}
              {containerHistoryStatusText ? (
                <span>{containerHistoryStatusText}</span>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="space-y-4">
          {containerPanels.map((panel) => (
            <ContainerMetricCard
              key={panel.id}
              loadingMessage={containerEmptyStateMessage}
              panel={panel}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
