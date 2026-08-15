import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getAppConfigMock, getMetricsSnapshotMock } = vi.hoisted(() => ({
  getAppConfigMock: vi.fn(),
  getMetricsSnapshotMock: vi.fn(),
}));

vi.mock('@/lib/app-config', () => ({
  getAppConfig: getAppConfigMock,
}));

vi.mock('@/lib/system-metrics', () => ({
  getMetricsSnapshot: getMetricsSnapshotMock,
}));

describe('metrics sampler', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    const { stopMetricsSampler } = await import('@/lib/metrics-sampler');
    stopMetricsSampler();
    getMetricsSnapshotMock.mockResolvedValue({});
    getAppConfigMock.mockReturnValue({
      metrics: {
        influxDatabase: 'vercelab',
        influxUrl: 'http://influxdb:8086',
      },
    });
  });

  it('collects immediately and keeps sampling without browser requests', async () => {
    const { startMetricsSampler, stopMetricsSampler } = await import('@/lib/metrics-sampler');

    expect(startMetricsSampler()).toBe(true);
    await vi.runAllTicks();
    expect(getMetricsSnapshotMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(20_000);
    expect(getMetricsSnapshotMock).toHaveBeenCalledTimes(3);
    expect(stopMetricsSampler()).toBe(true);
  });

  it('starts only one timer for a server process', async () => {
    const { startMetricsSampler, stopMetricsSampler } = await import('@/lib/metrics-sampler');

    expect(startMetricsSampler()).toBe(true);
    expect(startMetricsSampler()).toBe(false);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(getMetricsSnapshotMock).toHaveBeenCalledTimes(2);
    stopMetricsSampler();
  });

  it('stays disabled when persistent metrics storage is not configured', async () => {
    getAppConfigMock.mockReturnValue({
      metrics: {
        influxDatabase: null,
        influxUrl: null,
      },
    });
    const { startMetricsSampler } = await import('@/lib/metrics-sampler');

    expect(startMetricsSampler()).toBe(false);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(getMetricsSnapshotMock).not.toHaveBeenCalled();
  });
});
