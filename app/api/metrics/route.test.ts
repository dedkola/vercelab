import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getMetricsSnapshotMock,
  getMetricsHistoryFromInfluxMock,
  getContainerMetricsHistoryFromInfluxMock,
  getAllContainersMetricsHistoryFromInfluxMock,
} = vi.hoisted(() => ({
  getMetricsSnapshotMock: vi.fn(),
  getMetricsHistoryFromInfluxMock: vi.fn(),
  getContainerMetricsHistoryFromInfluxMock: vi.fn(),
  getAllContainersMetricsHistoryFromInfluxMock: vi.fn(),
}));

vi.mock("@/lib/system-metrics", () => ({
  getMetricsSnapshot: getMetricsSnapshotMock,
}));

vi.mock("@/lib/influx-metrics", () => ({
  getAllContainersMetricsHistoryFromInflux:
    getAllContainersMetricsHistoryFromInfluxMock,
  getContainerMetricsHistoryFromInflux: getContainerMetricsHistoryFromInfluxMock,
  getMetricsHistoryFromInflux: getMetricsHistoryFromInfluxMock,
}));

import { GET } from "@/app/api/metrics/route";

describe("GET /api/metrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
        all: [],
      },
    });
  });

  it("uses the lightweight current window for live polling history", async () => {
    getMetricsHistoryFromInfluxMock.mockResolvedValue([
      { timestamp: "2026-04-17T08:00:00.000Z", cpu: 12 },
    ]);

    const response = await GET(
      new Request(
        "http://localhost/api/metrics?mode=current&range=24h&includeHistory=true",
      ),
    );
    const payload = await response.json();

    expect(getMetricsHistoryFromInfluxMock).toHaveBeenCalledWith({
      hostIp: "10.0.0.7",
      limit: 48,
      bucketSeconds: 5,
    });
    expect(getContainerMetricsHistoryFromInfluxMock).not.toHaveBeenCalled();
    expect(getAllContainersMetricsHistoryFromInfluxMock).not.toHaveBeenCalled();
    expect(payload).toMatchObject({
      snapshot: expect.any(Object),
      history: [{ timestamp: "2026-04-17T08:00:00.000Z", cpu: 12 }],
    });
    expect("containerHistory" in payload).toBe(false);
    expect("allContainerHistory" in payload).toBe(false);
  });

  it("supports snapshot-only live polling when host history is disabled", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/metrics?mode=current&includeHistory=false",
      ),
    );
    const payload = await response.json();

    expect(getMetricsHistoryFromInfluxMock).not.toHaveBeenCalled();
    expect(getContainerMetricsHistoryFromInfluxMock).not.toHaveBeenCalled();
    expect(getAllContainersMetricsHistoryFromInfluxMock).not.toHaveBeenCalled();
    expect(payload).toEqual({
      snapshot: expect.objectContaining({
        hostIp: "10.0.0.7",
      }),
    });
    expect("history" in payload).toBe(false);
    expect("containerHistory" in payload).toBe(false);
    expect("allContainerHistory" in payload).toBe(false);
  });

  it("keeps detailed live container polling on the lightweight current window", async () => {
    getMetricsHistoryFromInfluxMock.mockResolvedValue([
      { timestamp: "2026-04-17T08:00:00.000Z", cpu: 12 },
    ]);
    getContainerMetricsHistoryFromInfluxMock.mockResolvedValue([
      { timestamp: "2026-04-17T08:00:00.000Z", cpuPercent: 8 },
    ]);
    getAllContainersMetricsHistoryFromInfluxMock.mockResolvedValue([
      {
        containerId: "runtime-control-plane",
        containerName: "control-plane",
        points: [{ timestamp: "2026-04-17T08:00:00.000Z", cpuPercent: 8 }],
      },
    ]);

    const response = await GET(
      new Request(
        "http://localhost/api/metrics?mode=current&range=24h&containerId=runtime-control-plane&containerName=control-plane&allContainers=true",
      ),
    );
    const payload = await response.json();

    expect(getMetricsHistoryFromInfluxMock).toHaveBeenCalledWith({
      hostIp: "10.0.0.7",
      limit: 48,
      bucketSeconds: 5,
    });
    expect(getContainerMetricsHistoryFromInfluxMock).toHaveBeenCalledWith({
      hostIp: "10.0.0.7",
      containerId: "runtime-control-plane",
      containerName: "control-plane",
      limit: 48,
      bucketSeconds: 5,
    });
    expect(getAllContainersMetricsHistoryFromInfluxMock).toHaveBeenCalledWith({
      hostIp: "10.0.0.7",
      limit: 48,
      bucketSeconds: 5,
    });
    expect(payload).toMatchObject({
      snapshot: expect.any(Object),
      history: [{ timestamp: "2026-04-17T08:00:00.000Z", cpu: 12 }],
      containerHistory: [
        { timestamp: "2026-04-17T08:00:00.000Z", cpuPercent: 8 },
      ],
      allContainerHistory: [
        {
          containerId: "runtime-control-plane",
          containerName: "control-plane",
        },
      ],
    });
  });

  it("loads range history only when detailed history is explicitly requested", async () => {
    getMetricsHistoryFromInfluxMock.mockResolvedValue([
      { timestamp: "2026-04-17T08:00:00.000Z", cpu: 12 },
    ]);
    getContainerMetricsHistoryFromInfluxMock.mockResolvedValue([
      { timestamp: "2026-04-17T08:00:00.000Z", cpuPercent: 8 },
    ]);
    getAllContainersMetricsHistoryFromInfluxMock.mockResolvedValue([
      {
        containerId: "runtime-control-plane",
        containerName: "control-plane",
        points: [{ timestamp: "2026-04-17T08:00:00.000Z", cpuPercent: 8 }],
      },
    ]);

    const response = await GET(
      new Request(
        "http://localhost/api/metrics?range=24h&containerId=runtime-control-plane&containerName=control-plane&allContainers=true",
      ),
    );
    const payload = await response.json();

    expect(getMetricsHistoryFromInfluxMock).toHaveBeenCalledWith({
      hostIp: "10.0.0.7",
      limit: 240,
      bucketSeconds: 360,
    });
    expect(getContainerMetricsHistoryFromInfluxMock).toHaveBeenCalledWith({
      hostIp: "10.0.0.7",
      containerId: "runtime-control-plane",
      containerName: "control-plane",
      limit: 240,
      bucketSeconds: 360,
    });
    expect(getAllContainersMetricsHistoryFromInfluxMock).toHaveBeenCalledWith({
      hostIp: "10.0.0.7",
      limit: 240,
      bucketSeconds: 360,
    });
    expect(payload).toMatchObject({
      snapshot: expect.any(Object),
      history: [{ timestamp: "2026-04-17T08:00:00.000Z", cpu: 12 }],
      containerHistory: [
        { timestamp: "2026-04-17T08:00:00.000Z", cpuPercent: 8 },
      ],
      allContainerHistory: [
        {
          containerId: "runtime-control-plane",
          containerName: "control-plane",
        },
      ],
    });
  });
});
