import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getAppConfigMock,
  getMetricsHistoryFromInfluxMock,
  getMetricsSnapshotMock,
} = vi.hoisted(() => ({
  getAppConfigMock: vi.fn(),
  getMetricsHistoryFromInfluxMock: vi.fn(),
  getMetricsSnapshotMock: vi.fn(),
}));

vi.mock("@/lib/app-config", () => ({
  getAppConfig: getAppConfigMock,
}));

vi.mock("@/lib/influx-metrics", () => ({
  getMetricsHistoryFromInflux: getMetricsHistoryFromInfluxMock,
}));

vi.mock("@/lib/system-metrics", () => ({
  getMetricsSnapshot: getMetricsSnapshotMock,
}));

import { loadWorkspaceChromeData } from "@/lib/workspace-chrome-data";

describe("loadWorkspaceChromeData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAppConfigMock.mockReturnValue({
      metrics: {
        influxExplorerUrl: "https://influx.home.com",
      },
    });
  });

  it("includes the explorer URL when host metrics are unavailable", async () => {
    getMetricsSnapshotMock.mockResolvedValue(null);

    await expect(loadWorkspaceChromeData()).resolves.toEqual({
      influxExplorerUrl: "https://influx.home.com",
      initialHistory: [],
      initialSnapshot: null,
    });
    expect(getMetricsHistoryFromInfluxMock).not.toHaveBeenCalled();
  });
});