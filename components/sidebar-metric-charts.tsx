"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";
import * as echarts from "echarts";

import type { MetricsHistoryPoint } from "@/lib/influx-metrics";
import type { MetricsSnapshot } from "@/lib/system-metrics";

const DOWNLOAD_COLOR = "#1f7aff";
const UPLOAD_COLOR = "#17c8a6";

type SidebarMetricChartsProps = {
  history: MetricsHistoryPoint[];
  snapshot: MetricsSnapshot | null;
  className?: string;
};

function formatTimeLabel(timestamp: string) {
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
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

export function SidebarMetricCharts({
  history,
  snapshot,
  className,
}: SidebarMetricChartsProps) {
  const networkRef = useRef<HTMLDivElement>(null);
  const cpuRef = useRef<HTMLDivElement>(null);
  const memoryRef = useRef<HTMLDivElement>(null);

  const labels = useMemo(
    () => history.map((point) => formatTimeLabel(point.timestamp)),
    [history],
  );

  const networkOption = useMemo<echarts.EChartsOption>(() => {
    const download = history.map((point) => Number(point.networkIn.toFixed(2)));
    const upload = history.map((point) => Number(point.networkOut.toFixed(2)));

    return {
      animationDuration: 400,
      grid: {
        left: 46,
        right: 14,
        top: 30,
        bottom: 28,
      },
      tooltip: {
        trigger: "axis",
      },
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: labels,
        axisLabel: {
          color: "#98a2b3",
          fontSize: 10,
        },
        axisLine: {
          lineStyle: {
            color: "#edf1f5",
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
          formatter: (value: number) => `${((value * 8) / 1_000_000).toFixed(1)} Mbps`,
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

  const cpuOption = useMemo<echarts.EChartsOption>(() => {
    const cpuValues = history.map((point) => Number(point.cpu.toFixed(2)));

    return {
      animationDuration: 400,
      grid: {
        left: 40,
        right: 10,
        top: 22,
        bottom: 24,
      },
      tooltip: {
        trigger: "axis",
        valueFormatter: (value) => `${Number(value).toFixed(1)}%`,
      },
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: labels,
        axisLabel: {
          show: false,
        },
        axisTick: {
          show: false,
        },
        axisLine: {
          show: false,
        },
      },
      yAxis: {
        type: "value",
        min: 0,
        max: 100,
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

  const memoryOption = useMemo<echarts.EChartsOption>(() => {
    const latestMemory = snapshot?.system.memoryPercent ?? 0;
    const used = Math.min(100, Math.max(0, latestMemory));
    const free = Math.max(0, 100 - used);

    return {
      tooltip: {
        trigger: "item",
        valueFormatter: (value) => `${Number(value).toFixed(1)}%`,
      },
      legend: {
        bottom: 0,
        left: "center",
        itemWidth: 10,
        itemHeight: 10,
        textStyle: {
          color: "#636e7b",
          fontSize: 11,
        },
      },
      series: [
        {
          name: "Memory",
          type: "pie",
          radius: ["54%", "76%"],
          center: ["50%", "46%"],
          padAngle: 4,
          itemStyle: {
            borderRadius: 7,
          },
          label: {
            show: true,
            formatter: "{d}%",
            color: "#435064",
            fontSize: 10,
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

  useChart(networkRef, networkOption);
  useChart(cpuRef, cpuOption);
  useChart(memoryRef, memoryOption);

  const classes = className
    ? `sidebar-chart-stack ${className}`
    : "sidebar-chart-stack";

  return (
    <div className={classes}>
      <section className="sidebar-chart-card" aria-label="Network chart">
        <div className="sidebar-chart-card__title-row">
          <h3>Network</h3>
        </div>
        <div ref={networkRef} className="sidebar-chart-card__plot" />
      </section>

      <section className="sidebar-chart-card" aria-label="CPU chart">
        <div className="sidebar-chart-card__title-row">
          <h3>CPU</h3>
        </div>
        <div ref={cpuRef} className="sidebar-chart-card__plot" />
      </section>

      <section className="sidebar-chart-card" aria-label="Memory chart">
        <div className="sidebar-chart-card__title-row">
          <h3>Memory</h3>
        </div>
        <div
          ref={memoryRef}
          className="sidebar-chart-card__plot sidebar-chart-card__plot--pie"
        />
      </section>
    </div>
  );
}