"use client";

import {
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useState,
} from "react";

import { Icon, type IconName } from "@/components/dashboard-kit";
import type { MetricsSnapshot } from "@/lib/system-metrics";

const POLL_INTERVAL_MS = 5000;
const HISTORY_LIMIT = 48;

const RAIL_PRIMARY: Array<{ icon: IconName; active?: boolean }> = [
  { icon: "network", active: true },
  { icon: "topology" },
  { icon: "dashboard" },
  { icon: "ports" },
  { icon: "clients" },
  { icon: "airview" },
  { icon: "alarm" },
];

const RAIL_SECONDARY: IconName[] = [
  "settings",
  "syslog",
  "integrations",
  "theme",
  "innerspace",
];

const WIFI_SPEED_ROWS = [
  { band: "5 GHz", values: ["20", "40", "80", "160", "DFS"] },
  { band: "6 GHz", values: ["20", "40", "80", "160", "320"] },
];

const TRAFFIC_ROWS = [
  {
    name: "DelugeTorrent",
    dot: "#1846b3",
    badge: "D",
    down: "1.61 GB",
    up: "57.3 GB",
    traffic: "58.9 GB",
  },
  {
    name: "BitTorrent Series",
    dot: "#2d6cf7",
    badge: "BT",
    down: "1.00 GB",
    up: "22.4 GB",
    traffic: "23.4 GB",
  },
  {
    name: "SSL/TLS",
    dot: "#48b8ea",
    badge: "S",
    down: "4.92 GB",
    up: "84.2 MB",
    traffic: "5.01 GB",
  },
  {
    name: "YouTube",
    dot: "#40c463",
    badge: "YT",
    down: "3.34 GB",
    up: "20.5 MB",
    traffic: "3.36 GB",
  },
  {
    name: "Web Streaming",
    dot: "#bddb32",
    badge: "WS",
    down: "2.92 GB",
    up: "14.4 MB",
    traffic: "2.94 GB",
  },
];

const CONNECTION_ROWS = [
  {
    label: "WiFi 6",
    band: "5 GHz",
    activity: 0.86,
    experience: "Excellent",
    connections: 5,
    dot: "#6a35db",
  },
  {
    label: "WiFi 5",
    band: "5 GHz",
    activity: 0.19,
    experience: "Excellent",
    connections: 1,
    dot: "#1d74f4",
  },
  {
    label: "WiFi 6",
    band: "6 GHz",
    activity: 0.04,
    experience: "Excellent",
    connections: 2,
    dot: "#1746af",
  },
  {
    label: "WiFi 4",
    band: "2.4 GHz",
    activity: 0.06,
    experience: "Excellent",
    connections: 3,
    dot: "#4ec0f0",
  },
  {
    label: "WiFi 4",
    band: "5 GHz",
    activity: 0.03,
    experience: "Excellent",
    connections: 2,
    dot: "#5a93f3",
  },
  {
    label: "WiFi 6",
    band: "2.4 GHz",
    activity: 0.02,
    experience: "Excellent",
    connections: 1,
    dot: "#245cc7",
  },
];

type HistoryPoint = {
  timestamp: string;
  cpu: number;
  memory: number;
  networkIn: number;
  networkOut: number;
  containersCpu: number;
  containersMemory: number;
};

type AxisTick = {
  label: string;
  position: number;
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

  const precision = size >= 100 ? 0 : size >= 10 ? 1 : 2;
  return `${size.toFixed(precision)} ${units[unitIndex]}`;
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

function formatMegabitsPerSecond(value: number) {
  const mbps = (value * 8) / 1_000_000;

  if (!Number.isFinite(mbps) || mbps <= 0) {
    return "0.0";
  }

  if (mbps >= 100) {
    return mbps.toFixed(0);
  }

  return mbps.toFixed(1);
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

function getNiceMaxValue(values: number[], fallback: number) {
  const peak = Math.max(...values, fallback, 1);
  const scaled = peak * 1.1;
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

function buildAxisTicks(history: HistoryPoint[], count: number): AxisTick[] {
  if (history.length === 0) {
    return ["18:00", "22:04", "02:08", "06:13", "10:17", "14:21", "Now"].map(
      (label, index, all) => ({
        label,
        position: index / (all.length - 1),
      }),
    );
  }

  return Array.from({ length: count }, (_, index) => {
    const historyIndex =
      count === 1
        ? history.length - 1
        : Math.round(((history.length - 1) * index) / (count - 1));

    return {
      label:
        index === count - 1
          ? "Now"
          : formatClock(history[historyIndex].timestamp),
      position: count === 1 ? 0.5 : index / (count - 1),
    };
  });
}

function getMiniBarHeights(history: HistoryPoint[]) {
  const values = history.slice(-18).map((entry) => entry.networkOut);
  const maxValue = Math.max(...values, 1);

  return values.map((value) => (value / maxValue) * 52);
}

function TrafficDonut({
  segments,
  centerValue,
  label,
}: {
  segments: Array<{ color: string; ratio: number }>;
  centerValue: string;
  label: string;
}) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="donut">
      <svg className="donut__ring" viewBox="0 0 140 140" aria-hidden="true">
        <circle
          cx="70"
          cy="70"
          r={radius}
          fill="none"
          stroke="#edf0f4"
          strokeWidth="12"
        />

        {segments.map((segment, index) => {
          const completedRatio = segments
            .slice(0, index)
            .reduce((sum, entry) => sum + entry.ratio, 0);
          const dash = circumference * segment.ratio;
          const dashOffset = circumference * (1 - completedRatio);

          return (
            <circle
              key={`${segment.color}-${segment.ratio}`}
              cx="70"
              cy="70"
              r={radius}
              fill="none"
              stroke={segment.color}
              strokeWidth="12"
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={dashOffset}
            />
          );
        })}
      </svg>

      <div className="donut__center">
        <div className="donut__value">{centerValue}</div>
        <div className="donut__label">{label}</div>
      </div>
    </div>
  );
}

function MainTrafficChart({ history }: { history: HistoryPoint[] }) {
  const width = 1160;
  const height = 262;
  const lineInset = 56;
  const graphWidth = width - lineInset * 2;
  const graphHeight = height - 38;
  const inbound = history.map((entry) => entry.networkIn);
  const outbound = history.map((entry) => entry.networkOut);
  const latency = history.map(
    (entry) => 1 + entry.cpu / 14 + entry.memory / 35,
  );
  const networkPeak = getNiceMaxValue([...inbound, ...outbound], 84_600_000);
  const latencyPeak = 120;
  const xTicks = buildAxisTicks(history, 7);
  const yTicks = Array.from({ length: 5 }, (_, index) => index / 4);
  const inboundPath = buildPath(inbound, graphWidth, graphHeight, networkPeak);
  const outboundPath = buildPath(
    outbound,
    graphWidth,
    graphHeight,
    networkPeak,
  );
  const inboundArea = buildArea(inbound, graphWidth, graphHeight, networkPeak);
  const outboundArea = buildArea(
    outbound,
    graphWidth,
    graphHeight,
    networkPeak,
  );
  const latencyPath = buildPath(latency, graphWidth, graphHeight, latencyPeak);

  return (
    <div className="chart-placeholder">
      <svg
        className="main-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Network activity chart"
      >
        <text className="main-chart__unit main-chart__unit--left" x="10" y="16">
          ms
        </text>
        <text
          className="main-chart__unit main-chart__unit--right"
          x={width - 10}
          y="16"
        >
          Mbps
        </text>

        {yTicks.map((tick) => {
          const y = 24 + graphHeight * tick;
          const latencyValue = Math.round(latencyPeak - latencyPeak * tick);
          const networkValue = formatMegabitsPerSecond(
            networkPeak - networkPeak * tick,
          );

          return (
            <g key={`tick-${tick}`}>
              <line
                className="main-chart__grid"
                x1={lineInset}
                y1={y}
                x2={width - lineInset}
                y2={y}
              />
              <text
                className="main-chart__axis main-chart__axis--left"
                x={lineInset - 12}
                y={y + 4}
              >
                {latencyValue}
              </text>
              <text
                className="main-chart__axis main-chart__axis--right"
                x={width - lineInset + 16}
                y={y + 4}
              >
                {networkValue}
              </text>
            </g>
          );
        })}

        {xTicks.map((tick) => {
          const x = lineInset + graphWidth * tick.position;

          return (
            <g key={`x-${tick.label}-${tick.position}`}>
              <line
                className="main-chart__grid main-chart__grid--vertical"
                x1={x}
                y1="24"
                x2={x}
                y2={24 + graphHeight}
              />
              <text className="main-chart__time" x={x} y={height - 8}>
                {tick.label}
              </text>
            </g>
          );
        })}

        <g transform={`translate(${lineInset} 24)`}>
          {inboundArea ? (
            <path
              className="main-chart__area main-chart__area--blue"
              d={inboundArea}
            />
          ) : null}
          {outboundArea ? (
            <path
              className="main-chart__area main-chart__area--violet"
              d={outboundArea}
            />
          ) : null}
          {inboundPath ? (
            <path
              className="main-chart__line main-chart__line--blue"
              d={inboundPath}
            />
          ) : null}
          {outboundPath ? (
            <path
              className="main-chart__line main-chart__line--violet"
              d={outboundPath}
            />
          ) : null}
          {latencyPath ? (
            <path
              className="main-chart__line main-chart__line--amber"
              d={latencyPath}
            />
          ) : null}
        </g>
      </svg>
    </div>
  );
}

function MiniSparkline({ history }: { history: HistoryPoint[] }) {
  const width = 226;
  const height = 64;
  const purpleBars = getMiniBarHeights(history);
  const blueLine = history.slice(-18).map((entry) => entry.networkIn);
  const bluePath = buildPath(blueLine, width, height, Math.max(...blueLine, 1));

  return (
    <div className="panel-sparkline">
      <svg viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
        {purpleBars.map((value, index) => {
          const x = 8 + index * 12;

          return (
            <rect
              key={`bar-${index}`}
              className="panel-sparkline__bar"
              x={x}
              y={height - value}
              width="8"
              height={value}
              rx="2"
            />
          );
        })}

        {bluePath ? (
          <path
            className="panel-sparkline__line"
            d={bluePath}
            transform="translate(0 0)"
          />
        ) : null}
      </svg>
    </div>
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

  const totalRate = deferredSnapshot
    ? deferredSnapshot.network.rxBytesPerSecond +
      deferredSnapshot.network.txBytesPerSecond
    : 0;
  const primaryInterface = deferredSnapshot?.network.interfaces[0];
  const topContainers = deferredSnapshot?.containers.top ?? [];
  const statusMessage = deferredSnapshot
    ? `Live traffic on ${primaryInterface?.name ?? "main uplink"}`
    : (errorMessage ?? "Connecting to metrics feed");
  const donutSegments = TRAFFIC_ROWS.map((row) => {
    const numericValue =
      Number.parseFloat(row.traffic.replace(/[^\d.]/g, "")) || 1;
    const totalNumeric = 58.9 + 23.4 + 5.01 + 3.36 + 2.94 + 2.66;

    return {
      color: row.dot,
      ratio: numericValue / totalNumeric,
    };
  });
  const connectionSegments = CONNECTION_ROWS.map((row) => ({
    color: row.dot,
    ratio: row.connections / 14,
  }));
  const panelMeta = deferredSnapshot
    ? `${formatPercent(deferredSnapshot.system.cpuPercent)} CPU · ${formatPercent(
        deferredSnapshot.system.memoryPercent,
      )} memory`
    : "Collecting system metrics";
  const uplinkLabel = deferredSnapshot
    ? `${formatRate(deferredSnapshot.network.rxBytesPerSecond)} down · ${formatRate(
        deferredSnapshot.network.txBytesPerSecond,
      )} up`
    : "Waiting for uplink counters";
  const timestampLabel = deferredSnapshot
    ? formatClock(deferredSnapshot.timestamp)
    : "--:--";

  return (
    <section className="shell" aria-label="UniFi styled dashboard">
      <header className="topbar">
        <div className="topbar__left">
          <button className="site-switch" type="button">
            <span className="site-switch__dot" />
            <span className="site-switch__name">tk</span>
          </button>

          <span className="app-pill">
            <Icon name="network" />
            Network
          </span>
        </div>

        <div className="topbar__center">UniFi</div>

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
            {RAIL_PRIMARY.map((entry) => (
              <button
                className={`rail__link ${entry.active ? "rail__link--active" : ""}`}
                key={entry.icon}
                type="button"
                aria-label={entry.icon}
              >
                <Icon name={entry.icon} />
              </button>
            ))}
          </div>

          <div className="rail__spacer" />
          <div className="rail__sep" />

          <div className="rail__group">
            {RAIL_SECONDARY.map((entry) => (
              <button
                className="rail__link"
                key={entry}
                type="button"
                aria-label={entry}
              >
                <Icon name={entry} />
              </button>
            ))}
          </div>
        </aside>

        <aside className="panel" aria-label="Gateway details">
          <button
            className="panel__collapse"
            type="button"
            aria-label="Collapse"
          >
            <Icon name="chevron-left" />
          </button>

          <div className="device-header">
            <div className="device-hero">
              <div className="device-hero__body">
                <div className="device-hero__plate" />
                <div className="device-hero__badge">UCG</div>
              </div>
            </div>

            <div className="device-name">tk</div>

            <button
              className="device-header__end"
              type="button"
              aria-label="Device settings"
            >
              <Icon name="settings" />
            </button>
          </div>

          <div className="device-counts">
            <div className="device-count">
              <Icon name="gateway" />
              <span className="device-count__num">1</span>
            </div>
            <span className="device-count__line device-count__line--solid" />
            <div className="device-count">
              <Icon name="switch-device" />
              <span className="device-count__num">3</span>
            </div>
            <span className="device-count__line device-count__line--dashed" />
            <div className="device-count">
              <Icon name="ap" />
              <span className="device-count__num">1</span>
            </div>
            <span className="device-count__line device-count__line--dotted" />
            <div className="device-count">
              <Icon name="client-device" />
              <span className="device-count__num">20</span>
            </div>
          </div>

          <div className="info-row">
            <span className="info-row__label">Gateway IP</span>
            <span className="info-row__value">192.168.0.1</span>
          </div>
          <div className="info-row">
            <span className="info-row__label">System Uptime</span>
            <span className="info-row__value">3w 2d 13h 37m</span>
          </div>

          <div className="version-bar">
            <span className="version-item">
              Network 10.2.105
              <Icon name="copy" />
            </span>
            <span className="version-item">
              UniFi OS 5.0.16
              <Icon name="copy" />
            </span>
          </div>

          <hr className="panel__hr" />

          <div className="isp-header">
            <Icon name="globe" />
            <div className="isp-header__name">Private Joint-stock Comp...</div>
            <div className="isp-header__status">100%</div>
          </div>

          <div className="info-row">
            <span className="info-row__label">WAN IP</span>
            <span className="info-row__value">93.127.118.68</span>
          </div>
          <div className="info-row">
            <span className="info-row__label">Monthly Data Usage</span>
            <span className="info-row__value">1.66 TB</span>
          </div>
          <div className="info-row">
            <span className="info-row__label">Throughput</span>
            <div className="throughput-row">
              <span className="throughput-item throughput-item--down">
                <Icon name="arrow-down" />
                {deferredSnapshot
                  ? formatRate(deferredSnapshot.network.rxBytesPerSecond)
                  : "122 Kbps"}
              </span>
              <span className="throughput-item throughput-item--up">
                <Icon name="arrow-up" />
                {deferredSnapshot
                  ? formatRate(deferredSnapshot.network.txBytesPerSecond)
                  : "453 Kbps"}
              </span>
            </div>
          </div>

          <MiniSparkline history={deferredHistory} />

          <div className="latency-dots">
            <span className="latency-dot">
              <span className="latency-dot__swatch latency-dot__swatch--windows" />
              15ms
            </span>
            <span className="latency-dot">
              <span className="latency-dot__swatch latency-dot__swatch--google" />
              15ms
            </span>
            <span className="latency-dot">
              <span className="latency-dot__swatch latency-dot__swatch--cloud" />
              1ms
            </span>
          </div>

          <div className="action-buttons">
            <button className="action-btn" type="button">
              <Icon name="speed-test" />
              ISP Speed Test
            </button>
            <button className="action-btn" type="button">
              <Icon name="wifi-doctor" />
              WiFi Doctor
            </button>
          </div>

          <section className="panel__section">
            <div className="panel-card">
              <div className="panel-card__header">
                <span className="panel-card__title">Default WiFi Speeds</span>
                <button className="panel-card__action" type="button">
                  Max. Speed
                  <Icon name="chevron-right" />
                </button>
              </div>

              <div className="channel-grid">
                <div className="channel-grid__label">Channel Widths (MHz)</div>
                {WIFI_SPEED_ROWS.map((row) => (
                  <div className="channel-row" key={row.band}>
                    <span className="channel-row__band">{row.band}</span>
                    {row.values.map((value) => (
                      <span
                        className={`channel-row__val ${
                          value === "80" || value === "320"
                            ? "channel-row__val--active"
                            : value === "DFS"
                              ? "channel-row__val--label"
                              : ""
                        }`}
                        key={`${row.band}-${value}`}
                      >
                        {value}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="panel__section">
            <div className="panel-card">
              <div className="panel-card__header">
                <span className="panel-card__title">
                  Critical Traffic Prioritization
                </span>
                <button className="panel-card__action" type="button">
                  Configure
                </button>
              </div>

              <div className="category-icons">
                {[
                  "syslog",
                  "shield",
                  "notifications",
                  "theme",
                  "layout-grid",
                  "monitor",
                ].map((icon) => (
                  <div className="category-icon" key={icon}>
                    <Icon name={icon as IconName} />
                  </div>
                ))}
              </div>
            </div>
          </section>

          <div className="cyber-card">
            <div className="cyber-card__header">
              <Icon name="shield" />
              <div className="cyber-card__title">CyberSecure Enhanced</div>
              <button className="cyber-card__action" type="button">
                Activate
              </button>
            </div>

            <ul className="cyber-card__list">
              <li>Up to 55K signatures updated real-time.</li>
              <li>100+ content filters.</li>
            </ul>

            <div className="cyber-card__footer">
              Powered by proofpoint and cloudflare
            </div>
          </div>

          <button className="widgets-btn" type="button">
            Dashboard Widgets
          </button>
        </aside>

        <main className="main">
          <div className="main__header">
            <div className="header-tabs">
              <button className="header-tab header-tab--active" type="button">
                Internet
              </button>
              <button className="header-tab" type="button">
                WiFi
              </button>
            </div>

            <button className="header-dropdown" type="button">
              All WANs
              <Icon name="chevron-down" />
            </button>

            <div className="main__header-spacer" />

            <button className="header-dropdown" type="button">
              <span className="header-check__dot header-check__dot--violet" />
              Internet Activity
              <Icon name="chevron-down" />
            </button>

            <button className="header-check" type="button">
              <span className="header-check__box header-check__box--checked">
                <Icon name="check" />
              </span>
              <span className="header-check__dot header-check__dot--amber" />
              Avg. Latency
            </button>

            <button className="header-check" type="button">
              <span className="header-check__box header-check__box--checked">
                <Icon name="check" />
              </span>
              <span className="header-check__dot header-check__dot--red" />
              Packet Loss
            </button>

            <button className="header-check" type="button">
              <span className="header-check__box" />
              <span className="header-check__dot header-check__dot--gray" />
              Connections
            </button>

            <div className="time-selector">
              {["1h", "1D", "1W", "1M"].map((entry) => (
                <button
                  className={`time-btn ${entry === "1D" ? "time-btn--active" : ""}`}
                  key={entry}
                  type="button"
                >
                  {entry}
                </button>
              ))}
            </div>
          </div>

          <section className="chart-area">
            <MainTrafficChart history={deferredHistory} />
          </section>

          <div className="scrubber">
            <Icon className="icon scrubber__globe" name="globe" />
            <div className="scrubber__bar">
              <div className="scrubber__fill" />
            </div>
            <Icon className="icon scrubber__chevron" name="chevron-right" />
          </div>

          <section className="dashboard-overview">
            <div className="dashboard-overview__main">
              <div className="overview-grid">
                <article className="unifi-card unifi-card--traffic">
                  <div className="overview-card__header">
                    <div>
                      <div className="overview-card__title">Traffic</div>
                      <div className="overview-card__meta">{statusMessage}</div>
                    </div>
                    <div className="overview-card__stamp">{timestampLabel}</div>
                  </div>

                  <div className="traffic">
                    <TrafficDonut
                      segments={donutSegments}
                      centerValue="102 GB"
                      label="Total Traffic"
                    />

                    <table className="traffic-table">
                      <thead>
                        <tr>
                          <th>Application</th>
                          <th>Down</th>
                          <th>Up</th>
                          <th>Traffic</th>
                        </tr>
                      </thead>
                      <tbody>
                        {TRAFFIC_ROWS.map((row) => (
                          <tr key={row.name}>
                            <td>
                              <div className="traffic-app">
                                <span
                                  className="traffic-app__dot"
                                  style={{ backgroundColor: row.dot }}
                                />
                                <span className="traffic-app__icon">
                                  {row.badge}
                                </span>
                                {row.name}
                              </div>
                            </td>
                            <td>{row.down}</td>
                            <td>{row.up}</td>
                            <td>{row.traffic}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </article>

                <article className="unifi-card unifi-card--connections">
                  <div className="overview-card__header">
                    <div>
                      <div className="overview-card__title">Connections</div>
                      <div className="overview-card__meta">{uplinkLabel}</div>
                    </div>
                    <div className="overview-card__stamp">{panelMeta}</div>
                  </div>

                  <div className="connections-card">
                    <TrafficDonut
                      segments={connectionSegments}
                      centerValue="14"
                      label="Total Connections"
                    />

                    <div className="connections-table">
                      <div className="connections-table__head">
                        <span>Type</span>
                        <span>Activity</span>
                        <span>Experience</span>
                        <span>Connections</span>
                      </div>

                      {CONNECTION_ROWS.map((row) => (
                        <div
                          className="connections-table__row"
                          key={`${row.label}-${row.band}`}
                        >
                          <div className="connections-type">
                            <span
                              className="connections-type__dot"
                              style={{ backgroundColor: row.dot }}
                            />
                            <span>{row.label}</span>
                            <span className="connections-type__band">
                              {row.band}
                            </span>
                          </div>

                          <div className="connections-bar">
                            <span
                              className="connections-bar__fill"
                              style={{
                                width: `${Math.max(row.activity * 100, 6)}%`,
                              }}
                            />
                          </div>

                          <div className="connections-table__excellent">
                            {row.experience}
                          </div>
                          <div className="connections-table__count">
                            {row.connections}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </article>
              </div>

            </div>

            <div className="dashboard-overview__side">
              <div className="unifi-card side-note">
                <div className="overview-card__title">Gateway Summary</div>
                <div className="side-note__value">
                  {deferredSnapshot ? formatRate(totalRate) : "0 B/s"}
                </div>
                <div className="side-note__meta">
                  {topContainers.length > 0
                    ? `Top container ${topContainers[0].name}`
                    : "Container telemetry will appear here"}
                </div>
                <div className="side-note__list">
                  {topContainers.length > 0 ? (
                    topContainers.map((container) => (
                      <div className="side-note__row" key={container.name}>
                        <span>{container.name}</span>
                        <span>{formatPercent(container.cpuPercent)}</span>
                      </div>
                    ))
                  ) : (
                    <div className="side-note__row">
                      <span>Metrics feed</span>
                      <span>Online</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>
    </section>
  );
}
