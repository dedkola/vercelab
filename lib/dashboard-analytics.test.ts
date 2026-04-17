import {
  buildHeatmapModel,
  countErrorSignals,
  parseContainerLogEvents,
} from "@/lib/dashboard-analytics";

describe("dashboard analytics helpers", () => {
  it("counts error-like signals from log output", () => {
    expect(
      countErrorSignals([
        "info startup complete",
        "error database connection dropped",
        "fatal could not bind socket",
      ].join("\n")),
    ).toBe(2);
  });

  it("parses timestamped container log lines into heatmap events", () => {
    const events = parseContainerLogEvents(
      [
        "web-1  | 2026-04-16T10:00:05.123456789Z ERROR request failed",
        "web-1  | 2026-04-16T10:00:08.123456789Z info request finished",
        "worker-1  | 2026-04-16T10:01:05.123456789Z exception while processing job",
      ].join("\n"),
      "fallback",
    );

    expect(events).toEqual([
      {
        intensity: 1,
        label: "web-1",
        timestamp: "2026-04-16T10:00:05.123Z",
      },
      {
        intensity: 1,
        label: "worker-1",
        timestamp: "2026-04-16T10:01:05.123Z",
      },
    ]);
  });

  it("buckets events and deployment markers into the nearest heatmap time slot", () => {
    const heatmap = buildHeatmapModel({
      events: [
        {
          intensity: 2,
          label: "web-1",
          timestamp: "2026-04-16T10:00:20.000Z",
        },
        {
          intensity: 1,
          label: "web-1",
          timestamp: "2026-04-16T10:00:40.000Z",
        },
        {
          intensity: 3,
          label: "api build",
          timestamp: "2026-04-16T10:05:05.000Z",
        },
      ],
      markers: [
        {
          appName: "api",
          label: "api deploy",
          operationType: "deploy",
          status: "success",
          timestamp: "2026-04-16T10:05:00.000Z",
        },
      ],
      timestamps: [
        "2026-04-16T10:00:00.000Z",
        "2026-04-16T10:05:00.000Z",
      ],
    });

    expect(heatmap.containers).toEqual(["web-1", "api build"]);
    expect(heatmap.values).toEqual([
      [0, 0, 3],
      [1, 1, 3],
    ]);
    expect(heatmap.deploymentMarkers).toEqual([
      {
        appName: "api",
        label: "api deploy",
        operationType: "deploy",
        status: "success",
        timestamp: "2026-04-16T10:05:00.000Z",
      },
    ]);
    expect(heatmap.max).toBe(3);
  });
});