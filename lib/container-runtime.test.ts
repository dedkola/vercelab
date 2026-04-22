import { describe, expect, it } from "vitest";

import type { ContainerListEntry } from "@/components/workspace-shell";
import { getContainerInventoryMeta, isSystemContainer } from "@/lib/container-runtime";

function createEntry(overrides?: Partial<ContainerListEntry>): ContainerListEntry {
  return {
    deploymentStatus: null,
    display: {
      activity: [],
      cpu: "14%",
      deployedAt: "2026-04-22T11:10:00.000Z",
      endpoints: [],
      environment: [],
      id: "runtime-control-plane",
      image: "vercelab/control-plane",
      logs: {
        alerts: [],
        events: [],
        live: [],
      },
      memory: "512 MB",
      name: "Vercelab UI",
      node: "10.0.0.2",
      port: "3000",
      region: "10.0.0.2",
      requestRate: "52 KB/s",
      restarts: 0,
      signals: [],
      stack: "vercelab",
      status: "running",
      summary: "test",
      tags: [],
      timeline: [],
      uptime: "2h",
      volumes: [],
    },
    dotClassName: "bg-emerald-500",
    preview: null,
    runtime: {
      cpuPercent: 14,
      diskReadBytesPerSecond: 0,
      diskTotalBytesPerSecond: 12_000,
      diskWriteBytesPerSecond: 12_000,
      health: "healthy",
      id: "runtime-control-plane",
      memoryBytes: 512 * 1024 ** 2,
      memoryPercent: 1.2,
      name: "vercelab-ui",
      networkRxBytesPerSecond: 40_000,
      networkTotalBytesPerSecond: 52_000,
      networkTxBytesPerSecond: 12_000,
      projectName: "vercelab",
      serviceName: "control-plane",
      status: "running",
    },
    searchText: "vercelab ui control plane",
    sidebarName: "Vercelab UI",
    sidebarSecondaryLabel: "control-plane",
    ...overrides,
  };
}

describe("container runtime helpers", () => {
  it("detects protected system containers", () => {
    expect(isSystemContainer(createEntry().runtime)).toBe(true);
  });

  it("limits actions for protected system containers", () => {
    expect(getContainerInventoryMeta(createEntry())).toEqual({
      availableActions: ["restart"],
      canEditAlias: true,
      kind: "system",
      note: "Protected Vercelab service. Runtime actions stay intentionally minimal on this page.",
    });
  });

  it("enables full lifecycle actions for managed workloads", () => {
    const baseEntry = createEntry();
    const result = getContainerInventoryMeta({
      ...baseEntry,
      deploymentStatus: "running",
      runtime: {
        ...baseEntry.runtime!,
        name: "managed-api",
        projectName: "managed-api",
        serviceName: "web",
      },
    });

    expect(result.kind).toBe("managed");
    expect(result.availableActions).toEqual(["restart", "stop", "remove"]);
    expect(result.canEditAlias).toBe(true);
  });
});