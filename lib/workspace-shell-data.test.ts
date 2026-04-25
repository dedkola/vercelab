import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getAppConfigMock,
  listDeploymentSummariesMock,
  getMetricsSnapshotMock,
  getMetricsHistoryFromInfluxMock,
  getContainerMetricsHistoryFromInfluxMock,
} = vi.hoisted(() => ({
  getAppConfigMock: vi.fn(),
  listDeploymentSummariesMock: vi.fn(),
  getMetricsSnapshotMock: vi.fn(),
  getMetricsHistoryFromInfluxMock: vi.fn(),
  getContainerMetricsHistoryFromInfluxMock: vi.fn(),
}));

vi.mock("@/lib/app-config", () => ({
  getAppConfig: getAppConfigMock,
}));

vi.mock("@/lib/persistence", () => ({
  listDeploymentSummaries: listDeploymentSummariesMock,
}));

vi.mock("@/lib/system-metrics", () => ({
  getMetricsSnapshot: getMetricsSnapshotMock,
}));

vi.mock("@/lib/influx-metrics", () => ({
  getContainerMetricsHistoryFromInflux:
    getContainerMetricsHistoryFromInfluxMock,
  getMetricsHistoryFromInflux: getMetricsHistoryFromInfluxMock,
}));

import { loadWorkspaceShellData } from "@/lib/workspace-shell-data";

describe("loadWorkspaceShellData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAppConfigMock.mockReturnValue({
      baseDomain: "apps.example.com",
      metrics: {
        influxExplorerUrl: null,
      },
    });
  });

  it("loads initial metrics history for git app page first paint by default", async () => {
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
    getMetricsSnapshotMock.mockResolvedValue({
      hostIp: "10.0.0.7",
      timestamp: "2026-04-17T08:00:00.000Z",
      warnings: [],
      system: {
        cpuPercent: 12,
        loadAverage: [0.4, 0.5, 0.6],
        memoryPercent: 31,
        memoryUsedBytes: 4_000,
        memoryTotalBytes: 8_000,
        diskReadBytesPerSecond: 120,
        diskWriteBytesPerSecond: 88,
      },
      network: {
        rxBytesPerSecond: 240,
        txBytesPerSecond: 120,
        interfaces: [],
      },
      containers: {
        running: 1,
        total: 1,
        cpuPercent: 8,
        memoryPercent: 16,
        memoryUsedBytes: 512,
        statusBreakdown: {
          healthy: 1,
          unhealthy: 0,
          stopped: 0,
        },
        top: [],
        all: [
          {
            id: "runtime-control-plane",
            name: "control-plane",
            cpuPercent: 8,
            memoryBytes: 512,
            memoryPercent: 16,
            networkRxBytesPerSecond: 120,
            networkTxBytesPerSecond: 80,
            networkTotalBytesPerSecond: 200,
            diskReadBytesPerSecond: 0,
            diskWriteBytesPerSecond: 0,
            diskTotalBytesPerSecond: 0,
            status: "running",
            health: "healthy",
            projectName: "vercelab-control-plane",
            serviceName: "web",
          },
        ],
      },
    });
    getMetricsHistoryFromInfluxMock.mockResolvedValue([
      {
        containersCpu: 8,
        containersMemory: 16,
        cpu: 12,
        diskRead: 120,
        diskWrite: 88,
        memory: 31,
        networkIn: 240,
        networkOut: 120,
        networkTotal: 360,
        timestamp: "2026-04-17T08:00:00.000Z",
      },
    ]);
    getContainerMetricsHistoryFromInfluxMock.mockResolvedValue([
      {
        cpuPercent: 8,
        diskRead: 0,
        diskTotal: 0,
        diskWrite: 0,
        memoryPercent: 16,
        memoryUsedBytes: 512,
        networkIn: 120,
        networkOut: 80,
        networkTotal: 200,
        timestamp: "2026-04-17T08:00:00.000Z",
      },
    ]);

    const result = await loadWorkspaceShellData(undefined, "git-app-page");

    expect(listDeploymentSummariesMock).toHaveBeenCalledTimes(1);
    expect(getMetricsHistoryFromInfluxMock).toHaveBeenCalledTimes(1);
    expect(getContainerMetricsHistoryFromInfluxMock).toHaveBeenCalledTimes(1);
    expect(result.baseDomain).toBe("apps.example.com");
    expect(result.initialView).toBe("git-app-page");
    expect(result.initialHistory).toHaveLength(1);
    expect(result.initialContainerHistory).toHaveLength(1);
    expect(result.initialDeployments).toHaveLength(1);
  });
});
