import { describe, expect, it } from "vitest";

import { buildSystemMetricPanels } from "@/lib/metrics-dashboard-metrics";
import type { MetricsSnapshot } from "@/lib/system-metrics";

describe("buildSystemMetricPanels", () => {
  it("labels the host default network panel as download and upload", () => {
    const snapshot = {
      containers: {
        all: [],
        cpuPercent: 0,
        memoryPercent: 0,
        memoryUsedBytes: 0,
        running: 0,
        statusBreakdown: {
          healthy: 0,
          stopped: 0,
          unhealthy: 0,
        },
        top: [],
        total: 0,
      },
      hostIp: "192.168.1.10",
      network: {
        interfaces: [
          {
            name: "enp4s0",
            rxBytesPerSecond: 32_000,
            txBytesPerSecond: 12_000,
          },
        ],
        rxBytesPerSecond: 32_000,
        txBytesPerSecond: 12_000,
      },
      system: {
        cpuPercent: 10,
        diskReadBytesPerSecond: 0,
        diskWriteBytesPerSecond: 0,
        loadAverage: [0.1, 0.2, 0.3],
        memoryPercent: 20,
        memoryTotalBytes: 1_000,
        memoryUsedBytes: 200,
      },
      timestamp: "2026-04-25T10:00:00.000Z",
      warnings: [],
    } satisfies MetricsSnapshot;

    const panels = buildSystemMetricPanels(snapshot, [
      {
        containersCpu: 0,
        containersMemory: 0,
        cpu: 10,
        diskRead: 0,
        diskWrite: 0,
        memory: 20,
        networkIn: 32_000,
        networkOut: 12_000,
        networkTotal: 44_000,
        timestamp: "2026-04-25T10:00:00.000Z",
      },
    ]);
    const networkPanel = panels.find((panel) => panel.id === "network");

    expect(networkPanel).toMatchObject({
      currentCaption: "enp4s0 default interface",
      primaryLabel: "Download",
      secondaryLabel: "Upload",
      title: "Default host",
    });
    expect(networkPanel?.stats.map((stat) => stat.label)).toEqual([
      "Download",
      "Upload",
      "Peak",
    ]);
  });

  it("labels the host disk panel as host read and host write", () => {
    const snapshot = {
      containers: {
        all: [],
        cpuPercent: 0,
        memoryPercent: 0,
        memoryUsedBytes: 0,
        running: 0,
        statusBreakdown: {
          healthy: 0,
          stopped: 0,
          unhealthy: 0,
        },
        top: [],
        total: 0,
      },
      hostIp: "192.168.1.10",
      network: {
        interfaces: [],
        rxBytesPerSecond: 0,
        txBytesPerSecond: 0,
      },
      system: {
        cpuPercent: 10,
        diskReadBytesPerSecond: 40_000,
        diskWriteBytesPerSecond: 12_000,
        loadAverage: [0.1, 0.2, 0.3],
        memoryPercent: 20,
        memoryTotalBytes: 1_000,
        memoryUsedBytes: 200,
      },
      timestamp: "2026-04-25T10:00:00.000Z",
      warnings: [],
    } satisfies MetricsSnapshot;

    const panels = buildSystemMetricPanels(snapshot, [
      {
        containersCpu: 0,
        containersMemory: 0,
        cpu: 10,
        diskRead: 40_000,
        diskWrite: 12_000,
        memory: 20,
        networkIn: 0,
        networkOut: 0,
        networkTotal: 0,
        timestamp: "2026-04-25T10:00:00.000Z",
      },
    ]);
    const diskPanel = panels.find((panel) => panel.id === "disk");

    expect(diskPanel).toMatchObject({
      primaryLabel: "Host read",
      secondaryLabel: "Host write",
      title: "Host disk",
    });
    expect(diskPanel?.primaryValues).toEqual([40_000]);
    expect(diskPanel?.secondaryValues).toEqual([12_000]);
  });
});
