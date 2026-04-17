"use client";

import {
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import * as echarts from "echarts";

import { Icon } from "@/components/dashboard-kit";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DASHBOARD_RANGE_OPTIONS,
  type DashboardRange,
} from "@/lib/metrics-range";

const POLL_INTERVAL_MS = 15_000;
const DOWNLOAD_COLOR = "#1f7aff";
const UPLOAD_COLOR = "#17c8a6";
const RUNNING_COLOR = "#17a96b";
const STOPPED_COLOR = "#94a3b8";
const UNHEALTHY_COLOR = "#f97316";
const EMPTY_CONTAINERS: ContainerDatum[] = [];
const EMPTY_HISTORY: AnalyticsHistoryPoint[] = [];
const EMPTY_WARNINGS: string[] = [];

type ContainerDatum = {
  cpuPercent: number;
  health: string;
  id: string;
  memoryBytes: number;
  memoryPercent: number;
  name: string;
  projectName: string | null;
  serviceName: string | null;
  status: string;
};

type AnalyticsHistoryPoint = {
  containersCpu: number;
  containersMemory: number;
  cpu: number;
  diskRead: number;
  diskWrite: number;
  memory: number;
  networkIn: number;
  networkOut: number;
  networkTotal: number;
  timestamp: string;
};

type AnalyticsData = {
  heatmap: {
    containers: string[];
    deploymentMarkers: Array<{
      appName: string;
      label: string;
      operationType: string;
      status: string;
      timestamp: string;
    }>;
    max: number;
    timestamps: string[];
    values: Array<[number, number, number]>;
  };
  history: AnalyticsHistoryPoint[];
  snapshot: {
    containers: {
      all: ContainerDatum[];
      cpuPercent: number;
      memoryPercent: number;
      memoryUsedBytes: number;
      running: number;
      statusBreakdown: {
        healthy: number;
        stopped: number;
        unhealthy: number;
      };
      top: ContainerDatum[];
      total: number;
    };
    hostIp: string;
    network: {
      interfaces: Array<{
        name: string;
        rxBytesPerSecond: number;
        txBytesPerSecond: number;
      }>;
      rxBytesPerSecond: number;
      txBytesPerSecond: number;
    };
    system: {
      cpuPercent: number;
      diskReadBytesPerSecond: number;
      diskWriteBytesPerSecond: number;
      loadAverage: [number, number, number];
      memoryPercent: number;
      memoryTotalBytes: number;
      memoryUsedBytes: number;
    };
    timestamp: string;
    warnings: string[];
  };
  stats: {
    failedDeployments: number;
    runningDeployments: number;
    totalDeployments: number;
    totalRepositories: number;
  };
};

type ChartCardProps = {
  children: ReactNode;
  controls?: ReactNode;
  description: string;
  title: string;
};

type TrendSeries = {
  areaEnd: string;
  areaStart: string;
  color: string;
  data: number[];
  name: string;
};

function formatClock(timestamp: string) {
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(timestamp));
}

function formatMetricBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(
    units.length - 1,
    Math.floor(Math.log(value) / Math.log(1024)),
  );
  const amount = value / 1024 ** exponent;
  const precision = amount >= 100 ? 0 : amount >= 10 ? 1 : 2;

  return `${amount.toFixed(precision)} ${units[exponent]}`;
}

function formatThroughput(value: number) {
  return `${formatMetricBytes(value)}/s`;
}

function getContainerTone(container: Pick<ContainerDatum, "health" | "status">) {
  if (container.health === "unhealthy") {
    return "unhealthy" as const;
  }

  return container.status === "running" ? ("running" as const) : ("stopped" as const);
}

function getContainerToneColor(container: Pick<ContainerDatum, "health" | "status">) {
  const tone = getContainerTone(container);

  if (tone === "running") {
    return RUNNING_COLOR;
  }

  if (tone === "unhealthy") {
    return UNHEALTHY_COLOR;
  }

  return STOPPED_COLOR;
}

function useChart(
  containerRef: RefObject<HTMLDivElement | null>,
  option: echarts.EChartsOption,
) {
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const chart =
      echarts.getInstanceByDom(containerRef.current) ??
      echarts.init(containerRef.current);
    chartRef.current = chart;

    const resizeObserver = new ResizeObserver(() => {
      chart.resize();
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, [containerRef]);

  useEffect(() => {
    chartRef.current?.setOption(option, true);
  }, [option]);
}

function ChartCard({ children, controls, description, title }: ChartCardProps) {
  return (
    <Card className="overflow-hidden border-border/70 bg-card/92 shadow-[0_30px_90px_-60px_rgba(15,23,42,0.46)]">
      <CardHeader className="border-b border-border/70 bg-linear-to-r from-muted/55 via-background to-background px-5 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <CardTitle className="text-base tracking-tight">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          {controls}
        </div>
      </CardHeader>
      <CardContent className="p-4">{children}</CardContent>
    </Card>
  );
}

function HorizontalContainerBarChart({
  containers,
  metric,
}: {
  containers: ContainerDatum[];
  metric: "cpu" | "memory";
}) {
  const chartRef = useRef<HTMLDivElement>(null);
  const sortedContainers = useMemo(
    () =>
      containers
        .slice()
        .sort((left, right) =>
          metric === "cpu"
            ? right.cpuPercent - left.cpuPercent
            : right.memoryBytes - left.memoryBytes,
        )
        .slice(0, 12),
    [containers, metric],
  );

  const option = useMemo<echarts.EChartsOption>(() => {
    const labels = sortedContainers.map((container) => container.name);
    const values = sortedContainers.map((container) =>
      metric === "cpu" ? Number(container.cpuPercent.toFixed(2)) : container.memoryBytes,
    );

    return {
      animationDuration: 500,
      grid: {
        left: 120,
        right: 24,
        top: 20,
        bottom: 20,
      },
      tooltip: {
        trigger: "axis",
        axisPointer: {
          type: "shadow",
        },
        formatter: (params) => {
          const item = Array.isArray(params) ? params[0] : params;
          const container = sortedContainers[item.dataIndex ?? 0];
          const value = metric === "cpu"
            ? `${Number(item.value ?? 0).toFixed(1)}%`
            : formatMetricBytes(Number(item.value ?? 0));
          const tone = getContainerTone(container);
          return [
            `<strong>${container.name}</strong>`,
            `${item.marker ?? ""} ${metric === "cpu" ? "CPU" : "Memory"}: ${value}`,
            `Status: ${tone}`,
            container.projectName ? `Project: ${container.projectName}` : null,
          ]
            .filter(Boolean)
            .join("<br/>");
        },
      },
      xAxis: {
        type: "value",
        min: 0,
        max: metric === "cpu" ? 100 : undefined,
        axisLabel: {
          color: "#98a2b3",
          formatter: (value: number) =>
            metric === "cpu" ? `${value}%` : formatMetricBytes(value),
          fontSize: 10,
        },
        splitLine: {
          lineStyle: {
            color: "#edf1f5",
          },
        },
      },
      yAxis: {
        type: "category",
        inverse: true,
        data: labels,
        axisTick: {
          show: false,
        },
        axisLine: {
          show: false,
        },
        axisLabel: {
          color: "#334155",
          fontSize: 11,
        },
      },
      series: [
        {
          type: "bar",
          barWidth: 16,
          data: values.map((value, index) => ({
            value,
            itemStyle: {
              borderRadius: [0, 8, 8, 0],
              color: new echarts.graphic.LinearGradient(1, 0, 0, 0, [
                { offset: 0, color: getContainerToneColor(sortedContainers[index]) },
                {
                  offset: 1,
                  color:
                    metric === "cpu"
                      ? "rgba(31, 122, 255, 0.72)"
                      : "rgba(255, 159, 67, 0.78)",
                },
              ]),
            },
          })),
          label: {
            show: true,
            position: "right",
            color: "#0f172a",
            formatter: (params: unknown) => {
              const numericValue = Number(
                (params as { value?: unknown } | undefined)?.value ?? 0,
              );

              return metric === "cpu"
                ? `${numericValue.toFixed(1)}%`
                : formatMetricBytes(numericValue);
            },
            fontSize: 10,
          },
        },
      ],
    };
  }, [metric, sortedContainers]);

  useChart(chartRef, option);

  return <div ref={chartRef} className="h-[24rem]" />;
}

function ContainerTreemap({
  containers,
  metric,
}: {
  containers: ContainerDatum[];
  metric: "cpu" | "memory";
}) {
  const chartRef = useRef<HTMLDivElement>(null);

  const option = useMemo<echarts.EChartsOption>(() => {
    return {
      animationDuration: 500,
      tooltip: {
        formatter: (params: unknown) => {
          const container = (
            params as { data?: { container?: ContainerDatum } } | undefined
          )?.data?.container;

          if (!container) {
            return "";
          }

          const tone = getContainerTone(container);
          return [
            `<strong>${container.name}</strong>`,
            `${metric === "memory" ? "Memory" : "CPU"}: ${
              metric === "memory"
                ? formatMetricBytes(container.memoryBytes)
                : `${container.cpuPercent.toFixed(1)}%`
            }`,
            `Status: ${tone}`,
            container.serviceName ? `Service: ${container.serviceName}` : null,
          ]
            .filter(Boolean)
            .join("<br/>");
        },
      },
      series: [
        {
          type: "treemap",
          roam: false,
          breadcrumb: {
            show: false,
          },
          nodeClick: false,
          label: {
            show: true,
            formatter: (params: unknown) => {
              const container = (
                params as { data?: { container?: ContainerDatum } } | undefined
              )?.data?.container;

              if (!container) {
                return "";
              }

              return [
                container.name,
                metric === "memory"
                  ? formatMetricBytes(container.memoryBytes)
                  : `${container.cpuPercent.toFixed(1)}%`,
              ].join("\n");
            },
            color: "#0f172a",
            fontSize: 11,
            overflow: "breakAll",
          },
          upperLabel: {
            show: false,
          },
          itemStyle: {
            borderColor: "rgba(255,255,255,0.64)",
            borderWidth: 2,
            gapWidth: 2,
          },
          data: containers.map((container) => ({
            container,
            itemStyle: {
              color: getContainerToneColor(container),
            },
            name: container.name,
            value:
              metric === "memory"
                ? Math.max(container.memoryBytes, 1)
                : Math.max(container.cpuPercent, 0.25),
          })),
        },
      ],
    };
  }, [containers, metric]);

  useChart(chartRef, option);

  return <div ref={chartRef} className="h-[28rem]" />;
}

function TrendChart({
  history,
  series,
  valueFormatter,
  yAxisMax,
}: {
  history: AnalyticsHistoryPoint[];
  series: TrendSeries[];
  valueFormatter: (value: number) => string;
  yAxisMax?: number;
}) {
  const chartRef = useRef<HTMLDivElement>(null);
  const timestamps = useMemo(
    () => history.map((point) => point.timestamp),
    [history],
  );

  const option = useMemo<echarts.EChartsOption>(() => {
    return {
      animationDuration: 500,
      grid: {
        left: 52,
        right: 18,
        top: 28,
        bottom: 34,
      },
      tooltip: {
        trigger: "axis",
        formatter: (params) => {
          const items = Array.isArray(params) ? params : [params];
          const timestamp = (items[0] as { axisValue?: string } | undefined)
            ?.axisValue;

          return [
            timestamp ? `<strong>${formatClock(timestamp)}</strong>` : null,
            ...items.map((item) =>
              `${item.marker ?? ""} ${item.seriesName}: ${valueFormatter(Number(item.value ?? 0))}`,
            ),
          ]
            .filter(Boolean)
            .join("<br/>");
        },
      },
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: timestamps,
        axisLabel: {
          color: "#98a2b3",
          formatter: (value: string) => formatClock(value),
          fontSize: 10,
        },
        axisTick: {
          show: false,
        },
        axisLine: {
          lineStyle: {
            color: "#e6ebf1",
          },
        },
      },
      yAxis: {
        type: "value",
        max: yAxisMax,
        axisLabel: {
          color: "#98a2b3",
          formatter: (value: number) => valueFormatter(value),
          fontSize: 10,
        },
        splitLine: {
          lineStyle: {
            color: "#edf1f5",
          },
        },
      },
      series: series.map((item) => ({
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: item.areaStart },
            { offset: 1, color: item.areaEnd },
          ]),
        },
        data: item.data,
        lineStyle: {
          color: item.color,
          width: 3,
        },
        name: item.name,
        showSymbol: false,
        smooth: true,
        type: "line",
      })),
    };
  }, [series, timestamps, valueFormatter, yAxisMax]);

  useChart(chartRef, option);

  return <div ref={chartRef} className="h-[20rem]" />;
}

function LogsHeatmap({
  containers,
  deploymentMarkers,
  max,
  timestamps,
  values,
}: AnalyticsData["heatmap"]) {
  const chartRef = useRef<HTMLDivElement>(null);

  const option = useMemo<echarts.EChartsOption>(() => {
    return {
      animationDuration: 450,
      grid: {
        left: 110,
        right: 80,
        top: 34,
        bottom: 48,
      },
      tooltip: {
        position: "top",
        formatter: (params: unknown) => {
          const value = (params as { value?: unknown } | undefined)?.value;
          const [xIndex, yIndex, intensity] = Array.isArray(value)
            ? value.map((entry) => Number(entry ?? 0))
            : [0, 0, 0];

          return [
            `<strong>${containers[yIndex] ?? "container"}</strong>`,
            `Time: ${timestamps[xIndex] ? formatClock(timestamps[xIndex]) : "-"}`,
            `Signal count: ${intensity}`,
          ].join("<br/>");
        },
      },
      xAxis: {
        type: "category",
        data: timestamps,
        splitArea: {
          show: false,
        },
        axisLabel: {
          color: "#98a2b3",
          formatter: (value: string) => formatClock(value),
          fontSize: 10,
        },
        axisTick: {
          show: false,
        },
        axisLine: {
          lineStyle: {
            color: "#e6ebf1",
          },
        },
      },
      yAxis: {
        type: "category",
        data: containers,
        splitArea: {
          show: true,
        },
        axisLabel: {
          color: "#334155",
          fontSize: 10,
        },
        axisTick: {
          show: false,
        },
        axisLine: {
          show: false,
        },
      },
      visualMap: {
        calculable: false,
        inRange: {
          color: ["#edf4ff", "#b9d7ff", "#5ea3ff", "#f97316", "#b91c1c"],
        },
        max,
        min: 0,
        orient: "vertical",
        right: 12,
        top: "middle",
        text: ["Hot", "Quiet"],
      },
      series: [
        {
          type: "heatmap",
          data: values,
          label: {
            show: false,
          },
          emphasis: {
            itemStyle: {
              borderColor: "#0f172a",
              borderWidth: 1,
            },
          },
          markLine:
            deploymentMarkers.length > 0
              ? {
                  animation: false,
                  symbol: ["none", "none"],
                  lineStyle: {
                    color: "rgba(15,23,42,0.24)",
                    type: "dashed",
                    width: 1,
                  },
                  label: {
                    formatter: (params: unknown) => {
                      const payload = params as
                        | { name?: string; value?: unknown }
                        | undefined;
                      const label = payload?.name;
                      const status =
                        typeof payload?.value === "string"
                          ? payload.value
                          : undefined;

                      return label && status ? `${label} (${status})` : "";
                    },
                    rotate: 90,
                    color: "#64748b",
                    fontSize: 10,
                  },
                  data: deploymentMarkers.map((marker) => ({
                    name: marker.label,
                    value: marker.status,
                    xAxis: marker.timestamp,
                  })),
                }
              : undefined,
        },
      ],
    };
  }, [containers, deploymentMarkers, max, timestamps, values]);

  useChart(chartRef, option);

  return <div ref={chartRef} className="h-[28rem]" />;
}

export function ChartsDashboard() {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<DashboardRange>("15m");
  const [treemapMetric, setTreemapMetric] = useState<"cpu" | "memory">(
    "memory",
  );

  const commitAnalytics = useEffectEvent((nextAnalytics: AnalyticsData) => {
    startTransition(() => {
      setAnalytics(nextAnalytics);
    });
  });

  useEffect(() => {
    let active = true;

    const poll = async () => {
      try {
        const response = await fetch(`/api/analytics?range=${range}`, {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`Analytics request failed with ${response.status}.`);
        }

        const payload = (await response.json()) as AnalyticsData;

        if (!active) {
          return;
        }

        setError(null);
        commitAnalytics(payload);
      } catch (requestError) {
        if (!active) {
          return;
        }

        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to load analytics.",
        );
      }
    };

    void poll();
    const intervalId = window.setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [range]);

  const deferredAnalytics = useDeferredValue(analytics);
  const containers = deferredAnalytics?.snapshot.containers.all ?? EMPTY_CONTAINERS;
  const history = deferredAnalytics?.history ?? EMPTY_HISTORY;
  const warnings = deferredAnalytics?.snapshot.warnings ?? EMPTY_WARNINGS;
  const statBreakdown = deferredAnalytics?.snapshot.containers.statusBreakdown;
  const diskThroughput = deferredAnalytics
    ? deferredAnalytics.snapshot.system.diskReadBytesPerSecond +
      deferredAnalytics.snapshot.system.diskWriteBytesPerSecond
    : 0;

  const networkSeries = useMemo<TrendSeries[]>(
    () => [
      {
        areaEnd: "rgba(31, 122, 255, 0.02)",
        areaStart: "rgba(31, 122, 255, 0.24)",
        color: DOWNLOAD_COLOR,
        data: history.map((point) => Number(point.networkIn.toFixed(2))),
        name: "Network in",
      },
      {
        areaEnd: "rgba(23, 200, 166, 0.02)",
        areaStart: "rgba(23, 200, 166, 0.2)",
        color: UPLOAD_COLOR,
        data: history.map((point) => Number(point.networkOut.toFixed(2))),
        name: "Network out",
      },
    ],
    [history],
  );

  const diskSeries = useMemo<TrendSeries[]>(
    () => [
      {
        areaEnd: "rgba(251, 146, 60, 0.04)",
        areaStart: "rgba(251, 146, 60, 0.24)",
        color: "#fb923c",
        data: history.map((point) => Number(point.diskRead.toFixed(2))),
        name: "Disk read",
      },
      {
        areaEnd: "rgba(14, 165, 233, 0.04)",
        areaStart: "rgba(14, 165, 233, 0.22)",
        color: "#0ea5e9",
        data: history.map((point) => Number(point.diskWrite.toFixed(2))),
        name: "Disk write",
      },
    ],
    [history],
  );

  return (
    <div className="min-h-full rounded-[1.75rem] border border-border/70 bg-linear-to-b from-background via-muted/15 to-background p-4 shadow-[0_38px_100px_-64px_rgba(15,23,42,0.55)] md:p-5">
      <section className="overflow-hidden rounded-[1.5rem] border border-border/70 bg-linear-to-r from-[#f7fbff] via-background to-[#fff7ef] shadow-[0_28px_90px_-58px_rgba(15,23,42,0.45)]">
        <div className="flex flex-col gap-6 px-5 py-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl space-y-3">
            <Badge className="w-fit gap-1 rounded-full border border-border/60 bg-background/80 text-foreground shadow-sm">
              <Icon name="dashboard" className="h-3.5 w-3.5" />
              Charts analytics
            </Badge>
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
                Big telemetry surfaces for the Docker fleet
              </h1>
              <p className="text-sm leading-6 text-muted-foreground">
                Compare container pressure, scan fleet shape at a glance, follow
                host trends, and spot error bursts against deployment activity.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-border/60 bg-background/80 px-4 py-3 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.24)]">
              <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Containers
              </div>
              <div className="mt-1 text-lg font-semibold text-foreground">
                {deferredAnalytics?.snapshot.containers.total ?? 0}
              </div>
              <div className="text-xs text-muted-foreground">
                {deferredAnalytics?.snapshot.containers.running ?? 0} running
              </div>
            </div>
            <div className="rounded-2xl border border-border/60 bg-background/80 px-4 py-3 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.24)]">
              <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Health split
              </div>
              <div className="mt-1 text-lg font-semibold text-foreground">
                {statBreakdown?.unhealthy ?? 0}
              </div>
              <div className="text-xs text-muted-foreground">
                unhealthy, {statBreakdown?.healthy ?? 0} healthy
              </div>
            </div>
            <div className="rounded-2xl border border-border/60 bg-background/80 px-4 py-3 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.24)]">
              <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Deployments
              </div>
              <div className="mt-1 text-lg font-semibold text-foreground">
                {deferredAnalytics?.stats.runningDeployments ?? 0}
              </div>
              <div className="text-xs text-muted-foreground">
                of {deferredAnalytics?.stats.totalDeployments ?? 0} active
              </div>
            </div>
            <div className="rounded-2xl border border-border/60 bg-background/80 px-4 py-3 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.24)]">
              <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Disk I/O now
              </div>
              <div className="mt-1 text-lg font-semibold text-foreground">
                {formatThroughput(diskThroughput)}
              </div>
              <div className="text-xs text-muted-foreground">
                read + write throughput
              </div>
            </div>
          </div>
        </div>
      </section>

      <Card className="mt-5 overflow-hidden border-border/70 bg-card/90 shadow-[0_26px_72px_-54px_rgba(15,23,42,0.45)]">
        <CardHeader className="border-b border-border/70 bg-linear-to-r from-muted/55 via-background to-background px-5 py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <CardTitle className="text-base">Analytics controls</CardTitle>
              <CardDescription>
                Tune the time horizon and choose how the treemap sizes each
                container.
              </CardDescription>
            </div>
            <div className="flex flex-col gap-3 lg:items-end">
              <Tabs value={range} onValueChange={(value) => setRange(value as DashboardRange)}>
                <TabsList>
                  {DASHBOARD_RANGE_OPTIONS.map((option) => (
                    <TabsTrigger key={option.value} value={option.value}>
                      {option.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
              <Tabs value={treemapMetric} onValueChange={(value) => setTreemapMetric(value as "cpu" | "memory")}>
                <TabsList>
                  <TabsTrigger value="memory">Treemap by memory</TabsTrigger>
                  <TabsTrigger value="cpu">Treemap by CPU</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>
        </CardHeader>
        {(error || warnings.length > 0) && (
          <CardContent className="border-b border-border/60 bg-muted/28 px-5 py-3 text-sm text-muted-foreground">
            {error ? `Analytics warning: ${error}` : warnings.join(" ")}
          </CardContent>
        )}
      </Card>

      <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard
          title="CPU per container"
          description="Horizontal ranking for live CPU pressure across the fleet."
        >
          <HorizontalContainerBarChart containers={containers} metric="cpu" />
        </ChartCard>
        <ChartCard
          title="Memory per container"
          description="Memory footprint by container, useful for spotting noisy neighbors."
        >
          <HorizontalContainerBarChart containers={containers} metric="memory" />
        </ChartCard>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[1.02fr_1.3fr]">
        <ChartCard
          controls={
            <Badge className="border border-border/60 bg-background/80 text-foreground">
              {treemapMetric === "memory" ? "Sized by memory" : "Sized by CPU"}
            </Badge>
          }
          title="Container treemap"
          description="Rectangle size shows pressure, color shows running, stopped, or unhealthy state."
        >
          <ContainerTreemap containers={containers} metric={treemapMetric} />
        </ChartCard>
        <ChartCard
          title="Logs and events heatmap"
          description="Time on X, container or build row on Y, color intensity from error signals in current logs."
        >
          <LogsHeatmap {...(deferredAnalytics?.heatmap ?? { containers: [], deploymentMarkers: [], max: 1, timestamps: [], values: [] })} />
        </ChartCard>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard
          title="CPU usage over time"
          description="Smooth host CPU trend with a soft area fill."
        >
          <TrendChart
            history={history}
            series={[
              {
                areaEnd: "rgba(14, 198, 255, 0.02)",
                areaStart: "rgba(31, 122, 255, 0.28)",
                color: DOWNLOAD_COLOR,
                data: history.map((point) => Number(point.cpu.toFixed(2))),
                name: "CPU",
              },
            ]}
            valueFormatter={(value) => `${value.toFixed(0)}%`}
            yAxisMax={100}
          />
        </ChartCard>
        <ChartCard
          title="Memory usage over time"
          description="Host memory utilization with the same visual cadence as CPU."
        >
          <TrendChart
            history={history}
            series={[
              {
                areaEnd: "rgba(255, 159, 67, 0.04)",
                areaStart: "rgba(255, 159, 67, 0.28)",
                color: "#ff9f43",
                data: history.map((point) => Number(point.memory.toFixed(2))),
                name: "Memory",
              },
            ]}
            valueFormatter={(value) => `${value.toFixed(0)}%`}
            yAxisMax={100}
          />
        </ChartCard>
        <ChartCard
          title="Network in and out"
          description="Ingress and egress throughput in one shared trend surface."
        >
          <TrendChart
            history={history}
            series={networkSeries}
            valueFormatter={(value) => formatThroughput(value)}
          />
        </ChartCard>
        <ChartCard
          title="Disk I/O"
          description="Read and write throughput over time from host disk activity."
        >
          <TrendChart
            history={history}
            series={diskSeries}
            valueFormatter={(value) => formatThroughput(value)}
          />
        </ChartCard>
      </div>
    </div>
  );
}