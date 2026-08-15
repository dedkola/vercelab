import { describe, expect, it } from 'vitest';

import {
  buildTimedMetricSeries,
  formatChartAxisTimestamp,
  getChartTimeWindow,
} from '@/lib/metrics-chart-time';

describe('metrics chart time helpers', () => {
  it('keeps real timestamps and inserts a null point across collection gaps', () => {
    const points = buildTimedMetricSeries(
      ['2026-08-15T09:17:15.000Z', '2026-08-15T09:27:45.000Z', '2026-08-15T09:28:00.000Z'],
      [0.2, 0.8, 0.4],
      15_000
    );

    expect(points).toEqual([
      [Date.parse('2026-08-15T09:17:15.000Z'), 0.2],
      [Date.parse('2026-08-15T09:17:30.000Z'), null],
      [Date.parse('2026-08-15T09:27:45.000Z'), 0.8],
      [Date.parse('2026-08-15T09:28:00.000Z'), 0.4],
    ]);
  });

  it('anchors the selected range to the current time instead of the first sample', () => {
    const now = Date.parse('2026-08-15T10:00:00.000Z');

    expect(getChartTimeWindow('1h', now)).toEqual({
      min: Date.parse('2026-08-15T09:00:00.000Z'),
      max: now,
    });
    expect(getChartTimeWindow('24h', now)).toEqual({
      min: Date.parse('2026-08-14T10:00:00.000Z'),
      max: now,
    });
  });

  it('formats axis timestamps in the selected display timezone', () => {
    const timestamp = Date.parse('2026-08-15T09:30:00.000Z');

    expect(formatChartAxisTimestamp(timestamp, '1h', 'UTC')).toContain('09:30');
    expect(formatChartAxisTimestamp(timestamp, '1h', 'Europe/Athens')).toContain('12:30');
  });
});
