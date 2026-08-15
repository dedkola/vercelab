import type { DashboardRange } from '@/lib/metrics-range';
import { getDashboardRangeSeconds } from '@/lib/metrics-range';

export type TimedMetricPoint = [timestampMs: number, value: number | null];

const AXIS_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();

function getAxisFormatter(range: DashboardRange, timeZone: string | null) {
  const key = `${range}:${timeZone ?? 'local'}`;
  const cached = AXIS_FORMATTER_CACHE.get(key);

  if (cached) {
    return cached;
  }

  const formatter = new Intl.DateTimeFormat('en', {
    ...(range === '1m' || range === '5m'
      ? { hour: '2-digit' as const, minute: '2-digit' as const, second: '2-digit' as const }
      : range === '15m' || range === '1h'
        ? { hour: '2-digit' as const, minute: '2-digit' as const }
        : range === '24h'
          ? {
              day: 'numeric' as const,
              hour: '2-digit' as const,
              minute: '2-digit' as const,
              month: 'short' as const,
            }
          : { day: 'numeric' as const, month: 'short' as const }),
    ...(timeZone ? { timeZone } : {}),
  });

  AXIS_FORMATTER_CACHE.set(key, formatter);
  return formatter;
}

export function formatChartAxisTimestamp(
  value: number,
  range: DashboardRange,
  timeZone: string | null
) {
  return getAxisFormatter(range, timeZone).format(new Date(value));
}

export function getChartTimeWindow(range: DashboardRange, nowMs = Date.now()) {
  return {
    max: nowMs,
    min: nowMs - getDashboardRangeSeconds(range) * 1000,
  };
}

export function buildTimedMetricSeries(
  timestamps: string[],
  values: Array<number | null>,
  expectedIntervalMs: number
): TimedMetricPoint[] {
  const points: TimedMetricPoint[] = [];
  const gapThresholdMs = Math.max(expectedIntervalMs * 2.5, expectedIntervalMs + 1);
  let previousTimestampMs: number | null = null;

  timestamps.forEach((timestamp, index) => {
    const timestampMs = Date.parse(timestamp);

    if (!Number.isFinite(timestampMs)) {
      return;
    }

    if (previousTimestampMs !== null && timestampMs - previousTimestampMs > gapThresholdMs) {
      points.push([previousTimestampMs + expectedIntervalMs, null]);
    }

    const value = values[index];
    points.push([timestampMs, typeof value === 'number' && Number.isFinite(value) ? value : null]);
    previousTimestampMs = timestampMs;
  });

  return points;
}

export function getTimedPointValue(value: unknown) {
  if (!Array.isArray(value)) {
    return null;
  }

  const metricValue = value[1];
  return typeof metricValue === 'number' && Number.isFinite(metricValue) ? metricValue : null;
}

export function getTimedPointTimestamp(value: unknown) {
  if (!Array.isArray(value)) {
    return null;
  }

  const timestamp = value[0];
  return typeof timestamp === 'number' && Number.isFinite(timestamp) ? timestamp : null;
}
