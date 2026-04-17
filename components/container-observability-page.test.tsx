import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ContainerObservabilityPage } from "@/components/container-observability-page";

describe("ContainerObservabilityPage", () => {
  const fetchSpy = vi.spyOn(global, "fetch");

  beforeEach(() => {
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          snapshot: {
            timestamp: "2026-04-17T08:00:00.000Z",
            warnings: [],
            hostIp: "192.168.1.10",
            system: {
              cpuPercent: 31,
              loadAverage: [0.48, 0.52, 0.56],
              memoryPercent: 68,
              memoryUsedBytes: 43.8 * 1024 ** 3,
              memoryTotalBytes: 64 * 1024 ** 3,
            },
            network: {
              rxBytesPerSecond: 180_000,
              txBytesPerSecond: 96_000,
              interfaces: [
                {
                  name: "eth0",
                  rxBytesPerSecond: 180_000,
                  txBytesPerSecond: 96_000,
                },
              ],
            },
            containers: {
              running: 3,
              cpuPercent: 24,
              memoryPercent: 38,
              memoryUsedBytes: 3.8 * 1024 ** 3,
              top: [],
            },
          },
          history: [
            {
              timestamp: "2026-04-17T07:59:45.000Z",
              cpu: 27,
              memory: 65,
              networkIn: 150_000,
              networkOut: 88_000,
              networkTotal: 238_000,
              containersCpu: 19,
              containersMemory: 35,
            },
            {
              timestamp: "2026-04-17T07:59:50.000Z",
              cpu: 29,
              memory: 66,
              networkIn: 162_000,
              networkOut: 91_000,
              networkTotal: 253_000,
              containersCpu: 21,
              containersMemory: 36,
            },
            {
              timestamp: "2026-04-17T07:59:55.000Z",
              cpu: 31,
              memory: 68,
              networkIn: 180_000,
              networkOut: 96_000,
              networkTotal: 276_000,
              containersCpu: 24,
              containersMemory: 38,
            },
          ],
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );
  });

  afterEach(() => {
    fetchSpy.mockReset();
  });

  afterAll(() => {
    fetchSpy.mockRestore();
  });

  it("renders the workspace shell and selected container details", async () => {
    const user = userEvent.setup();

    render(<ContainerObservabilityPage />);

    const showMetricsButton = screen.queryByRole("button", {
      name: /show server load sidebar/i,
    });

    if (showMetricsButton) {
      await user.click(showMetricsButton);
    }

    const showLogsButton = screen.queryByRole("button", {
      name: /show logs sidebar/i,
    });

    if (showLogsButton) {
      await user.click(showLogsButton);
    }

    expect(
      screen.getByRole("heading", { name: /control-plane/i }),
    ).toBeVisible();
    expect(screen.getByText(/container operations workspace/i)).toBeVisible();
    expect(screen.getByText(/current container signals/i)).toBeVisible();
    expect(screen.getByText(/tail preview/i)).toBeVisible();
    expect(
      await screen.findByText(/3 running containers on 192\.168\.1\.10/i),
    ).toBeVisible();
  });

  it("updates the focused details when a different container is selected", async () => {
    const user = userEvent.setup();

    render(<ContainerObservabilityPage />);

    await user.click(screen.getByRole("button", { name: /postgres-primary/i }));

    expect(
      screen.getByRole("heading", { name: /postgres-primary/i }),
    ).toBeVisible();
    expect(screen.getByText(/main relational store/i)).toBeVisible();
    expect(screen.getAllByText(/replica lag/i)[0]).toBeVisible();
  });
});
