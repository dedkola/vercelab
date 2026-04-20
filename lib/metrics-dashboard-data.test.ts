import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  listDeploymentSummariesMock,
  getMetricsSnapshotMock,
  getMetricsHistoryFromInfluxMock,
  getAllContainersMetricsHistoryFromInfluxMock,
} = vi.hoisted(() => ({
  listDeploymentSummariesMock: vi.fn(),
  getMetricsSnapshotMock: vi.fn(),
  getMetricsHistoryFromInfluxMock: vi.fn(),
  getAllContainersMetricsHistoryFromInfluxMock: vi.fn(),
}));

vi.mock("@/lib/persistence", () => ({
  listDeploymentSummaries: listDeploymentSummariesMock,
}));

vi.mock("@/lib/system-metrics", () => ({
  getMetricsSnapshot: getMetricsSnapshotMock,
}));

vi.mock("@/lib/influx-metrics", () => ({
  getAllContainersMetricsHistoryFromInflux:
    getAllContainersMetricsHistoryFromInfluxMock,
  getMetricsHistoryFromInflux: getMetricsHistoryFromInfluxMock,
}));

import { loadMetricsDashboardData } from "@/lib/metrics-dashboard-data";

describe("loadMetricsDashboardData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads deployment summaries without requiring workspace analytics data", async () => {
    listDeploymentSummariesMock.mockResolvedValue([
      {
        id: "dep-1",
        repositoryName: "dedkola/marketing-site",
        repositoryUrl: "https://github.com/dedkola/marketing-site.git",
        branch: "main",
        commitSha: null,
        appName: "Marketing Site",
        subdomain: "marketing",
        port: 3000,
        envVariables: null,
        serviceName: "web",
        status: "running",
        composeMode: "compose",
        projectName: "vercelab-marketing-1234",
        lastOutput: null,
        lastOperationSummary: "Healthy",
        updatedAt: "2026-04-17T08:00:00.000Z",
        deployedAt: "2026-04-17T07:55:00.000Z",
        tokenStored: false,
      },
    ]);
    getMetricsSnapshotMock.mockResolvedValue(null);

    const result = await loadMetricsDashboardData();

    expect(listDeploymentSummariesMock).toHaveBeenCalledTimes(1);
    expect(getMetricsHistoryFromInfluxMock).not.toHaveBeenCalled();
    expect(getAllContainersMetricsHistoryFromInfluxMock).not.toHaveBeenCalled();
    expect(result.initialDeployments).toHaveLength(1);
    expect(result.initialHistory).toEqual([]);
    expect(result.initialAllContainerHistory).toEqual([]);
    expect(result.initialSnapshot).toBeNull();
  });
});
