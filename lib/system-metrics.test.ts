import { describe, expect, it } from "vitest";

import { parseLinuxDefaultRouteInterface } from "@/lib/system-metrics";

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
