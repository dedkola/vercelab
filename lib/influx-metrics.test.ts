import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAppConfigMock } = vi.hoisted(() => ({
  getAppConfigMock: vi.fn(),
}));

vi.mock("@/lib/app-config", () => ({
  getAppConfig: getAppConfigMock,
}));

import { getMetricsHistoryFromInflux } from "@/lib/influx-metrics";

describe("getMetricsHistoryFromInflux", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAppConfigMock.mockReturnValue({
      metrics: {
        influxDatabase: "vercelab_metrics",
        influxToken: null,
        influxUrl: "http://influxdb:8181",
      },
    });
  });

  it("overrides aggregate host network history with the selected interface", async () => {
    const timestamp = Date.parse("2026-04-25T10:00:00.000Z");
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(input.toString());
      const query = url.searchParams.get("q") ?? "";

      if (query.includes("FROM network_interface")) {
        return Response.json({
          results: [
            {
              series: [
                {
                  columns: ["time", "network_in", "network_out"],
                  values: [[timestamp, 32_000, 12_000]],
                },
              ],
            },
          ],
        });
      }

      if (query.includes("FROM container_metrics")) {
        return Response.json({
          results: [
            {
              series: [
                {
                  columns: ["time", "containers_cpu", "containers_memory"],
                  values: [[timestamp, 4, 8]],
                },
              ],
            },
          ],
        });
      }

      return Response.json({
        results: [
          {
            series: [
              {
                columns: [
                  "time",
                  "cpu_percent",
                  "memory_percent",
                  "network_in",
                  "network_out",
                  "disk_read",
                  "disk_write",
                ],
                values: [[timestamp, 12, 24, 999_000, 888_000, 100, 200]],
              },
            ],
          },
        ],
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const history = await getMetricsHistoryFromInflux({
      bucketSeconds: 5,
      hostIp: "192.168.1.10",
      limit: 48,
      networkInterfaceName: "enp4s0",
    });

    expect(history[0]).toMatchObject({
      containersCpu: 4,
      containersMemory: 8,
      cpu: 12,
      diskRead: 100,
      diskWrite: 200,
      memory: 24,
      networkIn: 32_000,
      networkOut: 12_000,
      networkTotal: 44_000,
    });
    expect(
      fetchMock.mock.calls.some(([input]) =>
        new URL(input.toString()).searchParams
          .get("q")
          ?.includes("interface='enp4s0'"),
      ),
    ).toBe(true);
  });
});
