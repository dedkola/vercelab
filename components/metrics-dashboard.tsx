"use client";

import {
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useState,
} from "react";

import type { MetricsSnapshot } from "@/lib/system-metrics";

const POLL_INTERVAL_MS = 5000;
const HISTORY_LIMIT = 36;

type HistoryPoint = {
  timestamp: string;
  cpu: number;
  memory: number;
  networkIn: number;
  networkOut: number;
  containersCpu: number;
  containersMemory: number;
};

type ChartSeries = {
  label: string;
  values: number[];
  tone: "accent" | "cyan" | "green" | "amber";
  fill?: boolean;
};

type MetricCardProps = {
  title: string;
  value: string;
  meta: string;
  labels: string[];
  series: ChartSeries[];
  stamp: string;
  maxValue?: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size >= 100 ? size.toFixed(0) : size.toFixed(1)} ${units[unitIndex]}`;
}

function formatRate(value: number) {
  return `${formatBytes(value)}/s`;
}

function formatPercent(value: number) {
  return `${value.toFixed(value >= 100 ? 0 : 1)}%`;
}

function formatClock(value: string) {
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function appendHistory(history: HistoryPoint[], snapshot: MetricsSnapshot) {
  if (history.at(-1)?.timestamp === snapshot.timestamp) {
    return history;
  }

  return [
    ...history,
    {
      timestamp: snapshot.timestamp,
      cpu: snapshot.system.cpuPercent,
      memory: snapshot.system.memoryPercent,
      networkIn: snapshot.network.rxBytesPerSecond,
      networkOut: snapshot.network.txBytesPerSecond,
      containersCpu: snapshot.containers.cpuPercent,
      containersMemory: snapshot.containers.memoryPercent,
    },
  ].slice(-HISTORY_LIMIT);
}

function buildCardLabels(history: HistoryPoint[]) {
  if (history.length === 0) {
    return [];
  }

  const indexes = Array.from(
    new Set([
      0,
      Math.floor((history.length - 1) / 3),
      Math.floor(((history.length - 1) * 2) / 3),
      history.length - 1,
    ]),
  );

  return indexes.map((index) => formatClock(history[index].timestamp));
}

function buildPath(
  values: number[],
  width: number,
  height: number,
  maxValue: number,
) {
  if (values.length === 0) {
    return "";
  }

  const safeMax = Math.max(maxValue, 1);
  const stepX = values.length > 1 ? width / (values.length - 1) : width;

  return values
    .map((value, index) => {
      const x = index * stepX;
      const y = height - (clamp(value, 0, safeMax) / safeMax) * height;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function buildArea(
  values: number[],
  width: number,
  height: number,
  maxValue: number,
) {
  if (values.length === 0) {
    return "";
  }

  const line = buildPath(values, width, height, maxValue);
  const stepX = values.length > 1 ? width / (values.length - 1) : width;
  const endX = (values.length - 1) * stepX;

  return `${line} L${endX.toFixed(2)} ${height} L0 ${height} Z`;
}

function getNiceMaxValue(series: ChartSeries[], forcedMax?: number) {
  if (forcedMax) {
    return forcedMax;
  }

  const peak = Math.max(...series.flatMap((entry) => entry.values), 1);
  const scaled = peak * 1.15;
  const power = 10 ** Math.floor(Math.log10(scaled));
  const normalized = scaled / power;

  if (normalized <= 1) {
    return power;
  }

  if (normalized <= 2) {
    return 2 * power;
  }

  if (normalized <= 5) {
    return 5 * power;
  }

  return 10 * power;
}

function getToneColor(tone: ChartSeries["tone"]) {
  switch (tone) {
    case "cyan":
      return "var(--cyan)";
    case "green":
      return "var(--green)";
    case "amber":
      return "var(--amber)";
    default:
      return "var(--accent)";
  }
}

function getToneClassName(tone: ChartSeries["tone"]) {
  switch (tone) {
    case "cyan":
      return "metric-card__legend-dot--cyan";
    case "green":
      return "metric-card__legend-dot--green";
    case "amber":
      return "metric-card__legend-dot--amber";
    default:
      return "metric-card__legend-dot--accent";
  }
}

function MetricCard({
  title,
  value,
  meta,
  labels,
  series,
  stamp,
  maxValue,
}: MetricCardProps) {
  const width = 520;
  const height = 220;
  const resolvedMax = getNiceMaxValue(series, maxValue);
  const yTicks = Array.from(
    { length: 5 },
    (_, index) => resolvedMax - (resolvedMax / 4) * index,
  );

  return (
    <article className="metric-card">
      <div className="metric-card__header">
        <p className="metric-card__eyebrow">Live metric</p>
        <h2>{title}</h2>
        <div className="metric-card__value">{value}</div>
        <p className="metric-card__meta">{meta}</p>
      </div>

      <div className="metric-card__chart">
        <svg
          className="metric-card__svg"
          viewBox={`0 0 ${width} ${height + 34}`}
          role="img"
          aria-label={title}
        >
          {yTicks.map((tick) => {
            const y =
              (height / 4) *
              (resolvedMax === 0
                ? 0
                : (resolvedMax - tick) / (resolvedMax / 4));

            return (
              <g key={`${title}-${tick}`}>
                <line
                  className="metric-card__grid-line"
                  x1="0"
                  y1={y}
                  x2={width}
                  y2={y}
                />
                <text
                  className="metric-card__axis"
                  x={width}
                  y={Math.max(14, y - 8)}
                >
                  {Math.round(tick)}
                </text>
              </g>
            );
          })}

          {series.map((entry) => {
            const color = getToneColor(entry.tone);
            const linePath = buildPath(
              entry.values,
              width,
              height,
              resolvedMax,
            );
            const areaPath = entry.fill
              ? buildArea(entry.values, width, height, resolvedMax)
              : "";

            return (
              <g key={`${title}-${entry.label}`}>
                {areaPath ? (
                  <path
                    d={areaPath}
                    fill={color}
                    fillOpacity="0.12"
                    stroke="none"
                  />
                ) : null}
                <path
                  d={linePath}
                  fill="none"
                  stroke={color}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="3"
                />
              </g>
            );
          })}

          {labels.length > 0 ? (
            labels.map((label, index) => {
              const x =
                labels.length > 1
                  ? (width / (labels.length - 1)) * index
                  : width / 2;

              return (
                <text
                  key={`${title}-${label}-${index}`}
                  className="metric-card__label"
                  x={x}
                  y={height + 24}
                >
                  {label}
                </text>
              );
            })
          ) : (
            <text className="metric-card__label" x={width / 2} y={height + 24}>
              Waiting for telemetry
            </text>
          )}
        </svg>
      </div>

      <div className="metric-card__footer">
        <div className="metric-card__legend">
          {series.map((entry) => (
            <span
              className="metric-card__legend-item"
              key={`${title}-${entry.label}-legend`}
            >
              <span
                className={`metric-card__legend-dot ${getToneClassName(entry.tone)}`}
              />
              {entry.label}
            </span>
          ))}
        </div>
        <span className="metric-card__stamp">{stamp}</span>
      </div>
    </article>
  );
}

export default function MetricsDashboard() {
  const [snapshot, setSnapshot] = useState<MetricsSnapshot | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const deferredSnapshot = useDeferredValue(snapshot);
  const deferredHistory = useDeferredValue(history);

  const commitSnapshot = useEffectEvent((nextSnapshot: MetricsSnapshot) => {
    startTransition(() => {
      setSnapshot(nextSnapshot);
      setHistory((previous) => appendHistory(previous, nextSnapshot));
      setErrorMessage(null);
    });
  });

  const commitError = useEffectEvent((message: string) => {
    startTransition(() => {
      setErrorMessage(message);
    });
  });

  useEffect(() => {
    let active = true;

    const poll = async () => {
      try {
        const response = await fetch("/api/metrics", {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`Metrics request failed with ${response.status}.`);
        }

        const nextSnapshot = (await response.json()) as MetricsSnapshot;

        if (!active) {
          return;
        }

        commitSnapshot(nextSnapshot);
      } catch (error) {
        if (!active) {
          return;
        }

        commitError(
          error instanceof Error
            ? error.message
            : "Unable to load live metrics.",
        );
      }
    };

    poll();
    const intervalId = window.setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, []);

  const labels = buildCardLabels(deferredHistory);
  const lastStamp = deferredSnapshot
    ? formatClock(deferredSnapshot.timestamp)
    : "Connecting";
  const warnings = deferredSnapshot?.warnings ?? [];
  const topInterfaces = deferredSnapshot?.network.interfaces
    .map((entry) => entry.name)
    .join(" · ");
  const topContainer = deferredSnapshot?.containers.top[0]?.name;
  const loadAverage = deferredSnapshot?.system.loadAverage ?? [0, 0, 0];

  const cards: MetricCardProps[] = [
    {
      title: "Ubuntu System CPU Load",
      value: deferredSnapshot
        ? formatPercent(deferredSnapshot.system.cpuPercent)
        : "--",
      meta: deferredSnapshot
        ? `Load average ${loadAverage[0].toFixed(2)} / ${loadAverage[1].toFixed(2)} / ${loadAverage[2].toFixed(2)}`
        : (errorMessage ?? "Collecting live host CPU telemetry."),
      labels,
      series: [
        {
          label: "CPU",
          values: deferredHistory.map((entry) => entry.cpu),
          tone: "accent",
          fill: true,
        },
      ],
      stamp: lastStamp,
      maxValue: 100,
    },
    {
      title: "Ubuntu Memory Load",
      value: deferredSnapshot
        ? formatPercent(deferredSnapshot.system.memoryPercent)
        : "--",
      meta: deferredSnapshot
        ? `${formatBytes(deferredSnapshot.system.memoryUsedBytes)} used of ${formatBytes(deferredSnapshot.system.memoryTotalBytes)}`
        : (errorMessage ?? "Collecting live host memory telemetry."),
      labels,
      series: [
        {
          label: "Memory",
          values: deferredHistory.map((entry) => entry.memory),
          tone: "green",
          fill: true,
        },
      ],
      stamp: lastStamp,
      maxValue: 100,
    },
    {
      title: "Network Interfaces",
      value: deferredSnapshot
        ? formatRate(
            deferredSnapshot.network.rxBytesPerSecond +
              deferredSnapshot.network.txBytesPerSecond,
          )
        : "--",
      meta: deferredSnapshot
        ? `${formatRate(deferredSnapshot.network.rxBytesPerSecond)} in · ${formatRate(deferredSnapshot.network.txBytesPerSecond)} out${topInterfaces ? ` · ${topInterfaces}` : ""}`
        : (errorMessage ?? "Collecting interface throughput."),
      labels,
      series: [
        {
          label: "Inbound",
          values: deferredHistory.map((entry) => entry.networkIn),
          tone: "cyan",
          fill: true,
        },
        {
          label: "Outbound",
          values: deferredHistory.map((entry) => entry.networkOut),
          tone: "amber",
        },
      ],
      stamp: lastStamp,
    },
    {
      title: "Containers Load",
      value: deferredSnapshot
        ? formatPercent(deferredSnapshot.containers.cpuPercent)
        : "--",
      meta: deferredSnapshot
        ? `${deferredSnapshot.containers.running} running · ${formatBytes(deferredSnapshot.containers.memoryUsedBytes)} in use${topContainer ? ` · top ${topContainer}` : ""}`
        : (errorMessage ?? "Collecting live container load."),
      labels,
      series: [
        {
          label: "CPU",
          values: deferredHistory.map((entry) => entry.containersCpu),
          tone: "accent",
          fill: true,
        },
        {
          label: "Memory",
          values: deferredHistory.map((entry) => entry.containersMemory),
          tone: "green",
        },
      ],
      stamp: warnings.length > 0 ? `${lastStamp} · limited` : lastStamp,
      maxValue: 100,
    },
  ];

  return (
    <section className="metrics-dashboard" aria-label="Live metrics dashboard">
      <div className="metric-grid">
        {cards.map((card) => (
          <MetricCard key={card.title} {...card} />
        ))}
      </div>
    </section>
  );
}
