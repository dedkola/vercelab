"use client";

import {
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import * as echarts from "echarts";

import type { MetricsHistoryPoint } from "@/lib/influx-metrics";
import type { MetricsSnapshot } from "@/lib/system-metrics";

const DOWNLOAD_COLOR = "#1f7aff";
const UPLOAD_COLOR = "#17c8a6";

type NetworkTooltipParam = {
  marker?: string;
  seriesName?: string;
  name?: string;
  value?: unknown;
};

type MainChartCardProps = {
  title: string;
  children: ReactNode;
};

function formatTimeLabel(timestamp: string) {
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(timestamp));
}

function formatCompactNetworkLabel(value: number) {
  return `${Math.round((value * 8) / 1_000_000)} MB`;
}

function formatNetworkTooltip(
  params: NetworkTooltipParam | NetworkTooltipParam[],
) {
  const items = Array.isArray(params) ? params : [params];

  return items
    .map((item) => {
      const arrow = item.seriesName === "Upload" ? "↑" : "↓";
      return `${item.marker ?? ""} ${arrow} ${formatCompactNetworkLabel(Number(item.value ?? 0))}`;
    })
    .join("<br/>");
}

function formatCpuTooltip(params: NetworkTooltipParam | NetworkTooltipParam[]) {
  const item = Array.isArray(params) ? params[0] : params;

  if (!item) {
    return "";
  }

  return `${item.marker ?? ""} CPU ${Number(item.value ?? 0).toFixed(1)}%`;
}

function formatMemoryTooltip(param: NetworkTooltipParam) {
  return `${param.marker ?? ""} ${param.name ?? ""} ${Number(param.value ?? 0).toFixed(1)}%`.trim();
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

function MainChartCard({ title, children }: MainChartCardProps) {
  return (
    <section className="main-metric-chart-card" aria-label={`${title} chart`}>
      <div className="main-metric-chart-card__title-row">
        <h3>{title}</h3>
      </div>
      {children}
    </section>
  );
}

export function MainNetworkChart({
  history,
}: {
  history: MetricsHistoryPoint[];
}) {
  const networkRef = useRef<HTMLDivElement>(null);
  const labels = useMemo(
    () => history.map((point) => formatTimeLabel(point.timestamp)),
    [history],
  );

  const option = useMemo<echarts.EChartsOption>(() => {
    const download = history.map((point) => Number(point.networkIn.toFixed(2)));
    const upload = history.map((point) => Number(point.networkOut.toFixed(2)));

    return {
      animationDuration: 400,
      grid: {
        left: 48,
        right: 14,
        top: 28,
        bottom: 34,
      },
      tooltip: {
        trigger: "axis",
        formatter: (params) =>
          formatNetworkTooltip(params as NetworkTooltipParam[]),
      },
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: labels,
        axisLabel: {
          color: "#98a2b3",
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
        splitLine: {
          lineStyle: {
            color: "#eef2f6",
          },
        },
        axisLabel: {
          color: "#98a2b3",
          formatter: (value: number) => formatCompactNetworkLabel(value),
          fontSize: 10,
        },
      },
      series: [
        {
          name: "Download",
          type: "line",
          smooth: true,
          showSymbol: false,
          lineStyle: {
            width: 2,
            color: DOWNLOAD_COLOR,
          },
          areaStyle: {
            color: "rgba(31, 122, 255, 0.16)",
          },
          data: download,
        },
        {
          name: "Upload",
          type: "line",
          smooth: true,
          showSymbol: false,
          lineStyle: {
            width: 2,
            color: UPLOAD_COLOR,
          },
          areaStyle: {
            color: "rgba(23, 200, 166, 0.14)",
          },
          data: upload,
        },
      ],
    };
  }, [history, labels]);

  useChart(networkRef, option);

  return (
    <MainChartCard title="Network">
      <div ref={networkRef} className="main-metric-chart-card__plot" />
    </MainChartCard>
  );
}

export function MainCpuChart({ history }: { history: MetricsHistoryPoint[] }) {
  const cpuRef = useRef<HTMLDivElement>(null);
  const labels = useMemo(
    () => history.map((point) => formatTimeLabel(point.timestamp)),
    [history],
  );

  const option = useMemo<echarts.EChartsOption>(() => {
    const cpuValues = history.map((point) => Number(point.cpu.toFixed(2)));

    return {
      animationDuration: 400,
      grid: {
        left: 48,
        right: 14,
        top: 24,
        bottom: 34,
      },
      tooltip: {
        trigger: "axis",
        formatter: (params) =>
          formatCpuTooltip(params as NetworkTooltipParam[]),
      },
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: labels,
        axisLabel: {
          color: "#98a2b3",
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
        min: 0,
        max: 100,
        interval: 25,
        splitNumber: 4,
        axisLabel: {
          color: "#98a2b3",
          formatter: "{value}%",
          fontSize: 10,
        },
        splitLine: {
          lineStyle: {
            color: "#edf1f5",
          },
        },
      },
      series: [
        {
          name: "CPU",
          type: "line",
          smooth: true,
          symbol: "none",
          data: cpuValues,
          lineStyle: {
            width: 3,
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: "#1f7aff" },
              { offset: 1, color: "#0ec6ff" },
            ]),
          },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: "rgba(31, 122, 255, 0.26)" },
              { offset: 1, color: "rgba(14, 198, 255, 0.02)" },
            ]),
          },
        },
      ],
    };
  }, [history, labels]);

  useChart(cpuRef, option);

  return (
    <MainChartCard title="CPU">
      <div ref={cpuRef} className="main-metric-chart-card__plot" />
    </MainChartCard>
  );
}

export function MainMemoryChart({
  snapshot,
}: {
  snapshot: MetricsSnapshot | null;
}) {
  const memoryRef = useRef<HTMLDivElement>(null);

  const option = useMemo<echarts.EChartsOption>(() => {
    const latestMemory = snapshot?.system.memoryPercent ?? 0;
    const used = Math.min(100, Math.max(0, latestMemory));
    const free = Math.max(0, 100 - used);

    return {
      tooltip: {
        trigger: "item",
        formatter: (param) => formatMemoryTooltip(param as NetworkTooltipParam),
      },
      legend: {
        bottom: 0,
        left: "center",
        itemWidth: 12,
        itemHeight: 12,
        textStyle: {
          color: "#636e7b",
          fontSize: 12,
        },
      },
      series: [
        {
          name: "Memory",
          type: "pie",
          radius: ["56%", "78%"],
          center: ["50%", "46%"],
          padAngle: 4,
          itemStyle: {
            borderRadius: 8,
          },
          label: {
            show: false,
          },
          labelLine: {
            show: false,
          },
          data: [
            {
              value: used,
              name: "Used",
              itemStyle: {
                color: "#ff9f43",
              },
            },
            {
              value: free,
              name: "Free",
              itemStyle: {
                color: "#e4ecf5",
              },
            },
          ],
        },
      ],
    };
  }, [snapshot]);

  useChart(memoryRef, option);

  return (
    <MainChartCard title="Memory">
      <div
        ref={memoryRef}
        className="main-metric-chart-card__plot main-metric-chart-card__plot--pie"
      />
    </MainChartCard>
  );
}
