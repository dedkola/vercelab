"use client";

import { memo, useMemo } from "react";
import type { EChartsCoreOption } from "echarts";

import { EChartSurface } from "@/components/ui/echart-surface";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SystemMetricPanel } from "@/lib/metrics-dashboard-metrics";
import {
  formatAxisValue,
  formatDetailedTimestamp,
  formatMetricValue,
} from "@/lib/metrics-dashboard-metrics";
import { cn } from "@/lib/utils";

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

const CHART_SET_OPTION_OPTIONS = { lazyUpdate: true } as const;

function stripMeridiem(label: string) {
  return label.replace(/\s?(AM|PM)$/i, "");
}

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
        formatter: (value: string) => stripMeridiem(value),
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

function arePanelDataEqual(prev: SystemMetricPanel, next: SystemMetricPanel) {
  if (prev.id !== next.id || prev.currentValue !== next.currentValue) {
    return false;
  }

  if (prev.primaryValues.length !== next.primaryValues.length) {
    return false;
  }

  for (let i = 0; i < prev.primaryValues.length; i++) {
    if (prev.primaryValues[i] !== next.primaryValues[i]) {
      return false;
    }
  }

  const prevSecLen = prev.secondaryValues?.length ?? 0;
  const nextSecLen = next.secondaryValues?.length ?? 0;

  if (prevSecLen !== nextSecLen) {
    return false;
  }

  return !prev.secondaryValues?.some((v, i) => v !== next.secondaryValues![i]);
}

export const SystemMetricCard = memo(
  function SystemMetricCard({ panel }: { panel: SystemMetricPanel }) {
    const style = SYSTEM_STYLES[panel.id];
    const option = useMemo(() => buildSystemChartOption(panel), [panel]);

    return (
      <Card
        className={cn(
          "overflow-hidden border bg-linear-to-br shadow-[0_26px_68px_-54px_rgba(15,23,42,0.3)]",
          style.border,
          style.surface,
        )}
      >
        <CardHeader className="space-y-2 border-b border-border/60 pb-3">
          <CardTitle>{panel.title}</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {panel.primaryValues.length ? (
            <EChartSurface
              ariaLabel={`${panel.title} chart`}
              className="h-44"
              option={option}
              setOptionOptions={CHART_SET_OPTION_OPTIONS}
            />
          ) : (
            <EmptyChartState message="Waiting for recent samples for this metric." />
          )}
        </CardContent>
      </Card>
    );
  },
  (prev, next) => arePanelDataEqual(prev.panel, next.panel),
);
