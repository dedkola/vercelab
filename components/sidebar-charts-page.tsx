"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import * as echarts from "echarts";

import { Icon } from "@/components/dashboard-kit";
import type { MetricsHistoryPoint } from "@/lib/influx-metrics";
import type { MetricsSnapshot } from "@/lib/system-metrics";

const POLL_INTERVAL_MS = 5000;
const DOWNLOAD_COLOR = "#1f7aff";
const UPLOAD_COLOR = "#17c8a6";

type MetricsPayload = {
  snapshot: MetricsSnapshot;
  history: MetricsHistoryPoint[];
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

export default function SidebarChartsPage() {
  const [snapshot, setSnapshot] = useState<MetricsSnapshot | null>(null);
  const [history, setHistory] = useState<MetricsHistoryPoint[]>([]);
  const [error, setError] = useState<string | null>(null);

  const networkRef = useRef<HTMLDivElement>(null);
  const cpuRef = useRef<HTMLDivElement>(null);
  const memoryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;

    const poll = async () => {
      try {
        const response = await fetch("/api/metrics", { cache: "no-store" });

        if (!response.ok) {
          throw new Error(`Metrics request failed with ${response.status}`);
        }

        const payload = (await response.json()) as MetricsPayload;

        if (!active) {
          return;
        }

        setSnapshot(payload.snapshot);
        setHistory(payload.history ?? []);
        setError(null);
      } catch (fetchError) {
        if (!active) {
          return;
        }

        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "Unable to load metrics data.",
        );
      }
    };

    void poll();
    const intervalId = window.setInterval(() => {
      void poll();
    }, POLL_INTERVAL_MS);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, []);

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
      legend: {
        top: 0,
        right: 0,
        itemWidth: 10,
        itemHeight: 10,
        textStyle: {
          color: "#636e7b",
          fontSize: 11,
        },
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
          formatter: (value: number) => `${(value / 1024).toFixed(0)} KB/s`,
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

  return (
    <section
      className="shell shell--compact sidebar-chart-page"
      aria-label="Sidebar charts dashboard"
    >
      <header className="topbar">
        <div className="topbar__left">
          <button className="site-switch" type="button">
            <span className="site-switch__dot" />
            <span className="site-switch__name">Vercelab</span>
          </button>

          <span className="app-pill">
            <Icon name="network" />
            Sidebar Charts
          </span>
        </div>

        <div className="topbar__center">
          InfluxDB telemetry in sidebar widgets
        </div>

        <div className="topbar__right">
          <button className="topbar-btn" type="button" aria-label="Theme">
            <Icon name="theme" />
          </button>
          <button className="topbar-avatar" type="button" aria-label="Profile">
            <Icon name="profile" />
          </button>
        </div>
      </header>

      <div className="body">
        <aside className="rail" aria-label="Primary navigation">
          <div className="rail__group">
            <button
              className="rail__link rail__link--active"
              type="button"
              aria-label="Network"
            >
              <Icon name="network" />
            </button>
            <button className="rail__link" type="button" aria-label="Insights">
              <Icon name="insights" />
            </button>
            <button className="rail__link" type="button" aria-label="Settings">
              <Icon name="settings" />
            </button>
          </div>
        </aside>

        <aside
          className="panel sidebar-chart-page__panel"
          aria-label="Sidebar charts"
        >
          <div className="panel__content">
            <section className="sidebar-chart-card" aria-label="Network chart">
              <div className="sidebar-chart-card__title-row">
                <h3>Network</h3>
                <span className="sidebar-chart-card__meta">
                  Download / Upload
                </span>
              </div>
              <div ref={networkRef} className="sidebar-chart-card__plot" />
            </section>

            <section className="sidebar-chart-card" aria-label="CPU chart">
              <div className="sidebar-chart-card__title-row">
                <h3>CPU</h3>
                <span className="sidebar-chart-card__meta">
                  Gradient Y-axis line
                </span>
              </div>
              <div ref={cpuRef} className="sidebar-chart-card__plot" />
            </section>

            <section className="sidebar-chart-card" aria-label="Memory chart">
              <div className="sidebar-chart-card__title-row">
                <h3>Memory</h3>
                <span className="sidebar-chart-card__meta">
                  Pie with padAngle
                </span>
              </div>
              <div
                ref={memoryRef}
                className="sidebar-chart-card__plot sidebar-chart-card__plot--pie"
              />
            </section>
          </div>
        </aside>

        <main className="main sidebar-chart-page__main">
          <section className="sidebar-chart-page__hero">
            <h1>Sidebar Chart Playground</h1>
            <p>
              The three charts in the left panel are powered by the same
              InfluxDB-backed feed used by the metrics endpoint.
            </p>
            <div className="sidebar-chart-page__stats">
              <article>
                <span>Host CPU</span>
                <strong>
                  {snapshot
                    ? `${snapshot.system.cpuPercent.toFixed(1)}%`
                    : "--"}
                </strong>
              </article>
              <article>
                <span>Host Memory</span>
                <strong>
                  {snapshot
                    ? `${snapshot.system.memoryPercent.toFixed(1)}%`
                    : "--"}
                </strong>
              </article>
              <article>
                <span>Interfaces</span>
                <strong>
                  {snapshot ? String(snapshot.network.interfaces.length) : "--"}
                </strong>
              </article>
            </div>
            {error ? (
              <p className="sidebar-chart-page__error">{error}</p>
            ) : null}
          </section>
        </main>
      </div>
    </section>
  );
}
