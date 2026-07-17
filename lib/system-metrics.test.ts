import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseLinuxDefaultRouteInterface } from "@/lib/system-metrics";

const { accessMock, readFileMock, spawnMock, osMock, getAppConfigMock } =
  vi.hoisted(() => ({
    accessMock: vi.fn(),
    readFileMock: vi.fn(),
    spawnMock: vi.fn(),
    osMock: {
      cpus: vi.fn(),
      loadavg: vi.fn(),
      totalmem: vi.fn(),
      freemem: vi.fn(),
      networkInterfaces: vi.fn(),
    },
    getAppConfigMock: vi.fn(),
  }));

vi.mock("node:fs/promises", () => ({
  default: { access: accessMock, readFile: readFileMock },
  access: accessMock,
  readFile: readFileMock,
}));

vi.mock("node:child_process", () => ({
  default: { spawn: spawnMock },
  spawn: spawnMock,
}));

vi.mock("node:os", () => ({
  default: osMock,
}));

vi.mock("@/lib/app-config", () => ({
  getAppConfig: getAppConfigMock,
}));

vi.mock("@/lib/container-routing", () => ({
  extractTraefikHostFromLabels: vi.fn().mockReturnValue(null),
}));

describe("parseLinuxDefaultRouteInterface", () => {
  it("chooses the lowest metric default route interface", () => {
    const routeTable = [
      "Iface\tDestination\tGateway \tFlags\tRefCnt\tUse\tMetric\tMask\t\tMTU\tWindow\tIRTT",
      "docker0\t00000000\t00000000\t0001\t0\t0\t500\t00000000\t0\t0\t0",
      "enp4s0\t00000000\t0101A8C0\t0003\t0\t0\t100\t00000000\t0\t0\t0",
      "enp4s0\t0001A8C0\t00000000\t0001\t0\t0\t100\t00FFFFFF\t0\t0\t0",
    ].join("\n");

    expect(parseLinuxDefaultRouteInterface(routeTable)).toBe("enp4s0");
  });

  it("returns null when the route table has no default route", () => {
    const routeTable = [
      "Iface\tDestination\tGateway \tFlags\tRefCnt\tUse\tMetric\tMask\t\tMTU\tWindow\tIRTT",
      "enp4s0\t0001A8C0\t00000000\t0001\t0\t0\t100\t00FFFFFF\t0\t0\t0",
    ].join("\n");

    expect(parseLinuxDefaultRouteInterface(routeTable)).toBeNull();
  });
});

describe("getMetricsSnapshot", () => {
  function makeSpawnChild(exitCode = 1) {
    const child = new EventEmitter() as NodeJS.EventEmitter & {
      stdout: NodeJS.EventEmitter;
      stderr: NodeJS.EventEmitter;
    };

    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();

    Promise.resolve().then(() => child.emit("close", exitCode));

    return child;
  }

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    accessMock.mockRejectedValue(
      Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
    );
    readFileMock.mockRejectedValue(
      Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
    );
    spawnMock.mockImplementation(() => makeSpawnChild(1));

    osMock.cpus.mockReturnValue([
      { times: { user: 100, nice: 0, sys: 100, idle: 800, irq: 0 } },
    ]);
    osMock.loadavg.mockReturnValue([0.5, 0.5, 0.5]);
    osMock.totalmem.mockReturnValue(8 * 1024 ** 3);
    osMock.freemem.mockReturnValue(4 * 1024 ** 3);
    osMock.networkInterfaces.mockReturnValue({});

    getAppConfigMock.mockReturnValue({
      baseDomain: "apps.example.com",
      runtime: {
        hostProcPath: "/nonexistent/proc",
        hostLanIp: null,
      },
      metrics: {
        influxUrl: null,
        influxDatabase: null,
        influxToken: null,
      },
    });
  });

  it("returns the cached snapshot on repeated calls within the TTL window", async () => {
    const { getMetricsSnapshot } = await import("@/lib/system-metrics");

    const snapshot1 = await getMetricsSnapshot();
    const callsAfterFirstBuild = accessMock.mock.calls.length;

    const snapshot2 = await getMetricsSnapshot();

    expect(snapshot2).toBe(snapshot1);
    expect(accessMock.mock.calls.length).toBe(callsAfterFirstBuild);
  });

  it("builds a new snapshot after the TTL expires", async () => {
    const dateSpy = vi.spyOn(Date, "now").mockReturnValue(0);

    const { getMetricsSnapshot } = await import("@/lib/system-metrics");

    await getMetricsSnapshot();
    const callsAfterFirstBuild = accessMock.mock.calls.length;

    dateSpy.mockReturnValue(2600);

    await getMetricsSnapshot();

    expect(accessMock.mock.calls.length).toBeGreaterThan(callsAfterFirstBuild);

    dateSpy.mockRestore();
  });

  it("deduplicates concurrent in-flight builds", async () => {
    const { getMetricsSnapshot } = await import("@/lib/system-metrics");

    let releasePsCommand!: () => void;
    const psPending = new Promise<void>((resolve) => {
      releasePsCommand = resolve;
    });

    spawnMock.mockImplementation((_command: string, args: string[]) => {
      const child = new EventEmitter() as NodeJS.EventEmitter & {
        stdout: NodeJS.EventEmitter;
        stderr: NodeJS.EventEmitter;
      };
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();

      if (args[0] === "ps") {
        psPending.then(() => child.emit("close", 1));
      } else {
        Promise.resolve().then(() => child.emit("close", 1));
      }

      return child;
    });

    const promise1 = getMetricsSnapshot();
    const promise2 = getMetricsSnapshot();

    releasePsCommand();

    const [snapshot1, snapshot2] = await Promise.all([promise1, promise2]);

    // Both concurrent callers must receive the exact same snapshot object,
    // proving they shared a single in-flight build rather than running two.
    expect(snapshot1).toBe(snapshot2);
  });

  it("clears the in-flight promise on failure so the next call retries", async () => {
    const { getMetricsSnapshot } = await import("@/lib/system-metrics");

    osMock.cpus.mockImplementation(() => {
      throw new Error("cpu unavailable");
    });

    await expect(getMetricsSnapshot()).rejects.toThrow("cpu unavailable");

    osMock.cpus.mockReturnValue([
      { times: { user: 100, nice: 0, sys: 100, idle: 800, irq: 0 } },
    ]);

    const snapshot = await getMetricsSnapshot();

    expect(snapshot).toBeDefined();
  });

  it("records capturedAt from build completion, not build start", async () => {
    const dateSpy = vi.spyOn(Date, "now").mockReturnValue(0);

    const { getMetricsSnapshot } = await import("@/lib/system-metrics");

    // Advance Date.now() to 1000ms inside the spawn calls, which happen
    // after buildSystemMetrics and buildNetworkMetrics (i.e. late in the build).
    spawnMock.mockImplementation((_command: string, _args: string[]) => {
      dateSpy.mockReturnValue(1000);

      const child = new EventEmitter() as NodeJS.EventEmitter & {
        stdout: NodeJS.EventEmitter;
        stderr: NodeJS.EventEmitter;
      };
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      Promise.resolve().then(() => child.emit("close", 1));

      return child;
    });

    await getMetricsSnapshot();
    // capturedAt is 1000 (completion time); if it were 0 (start time),
    // the assertions below would fail.

    const callsBeforeSecondRequest = accessMock.mock.calls.length;

    // 3400ms is within the 2500ms TTL from capturedAt=1000 → cache hit
    dateSpy.mockReturnValue(3400);
    await getMetricsSnapshot();
    expect(accessMock.mock.calls.length).toBe(callsBeforeSecondRequest);

    // 3600ms exceeds the 2500ms TTL from capturedAt=1000 → cache miss
    dateSpy.mockReturnValue(3600);
    await getMetricsSnapshot();
    expect(accessMock.mock.calls.length).toBeGreaterThan(callsBeforeSecondRequest);

    dateSpy.mockRestore();
  });
});
