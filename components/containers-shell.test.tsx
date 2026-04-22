import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MockInstance } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ContainersShell } from "@/components/containers-shell";

const refreshMock = vi.fn();

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
    ...init,
  });
}

function getRequestUrl(input: Parameters<typeof fetch>[0]) {
  if (typeof input === "string") {
    return input;
  }

  if (input instanceof URL) {
    return input.toString();
  }

  return input.url;
}

const runtimeSnapshot = {
  containers: {
    all: [
      {
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
        routedHost: "control-plane.myhomelan.com",
        serviceName: "control-plane",
        status: "running",
      },
    ],
    cpuPercent: 14,
    memoryPercent: 1.2,
    memoryUsedBytes: 512 * 1024 ** 2,
    running: 1,
    statusBreakdown: {
      healthy: 1,
      stopped: 0,
      unhealthy: 0,
    },
    top: [],
    total: 1,
  },
  hostIp: "10.0.0.2",
  network: {
    interfaces: [],
    rxBytesPerSecond: 40_000,
    txBytesPerSecond: 12_000,
  },
  system: {
    cpuPercent: 22,
    diskReadBytesPerSecond: 0,
    diskWriteBytesPerSecond: 16_000,
    loadAverage: [0.2, 0.3, 0.4],
    memoryPercent: 52,
    memoryTotalBytes: 8 * 1024 ** 3,
    memoryUsedBytes: 4 * 1024 ** 3,
  },
  timestamp: "2026-04-22T11:10:00.000Z",
  warnings: [],
} as const;

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: refreshMock,
  }),
}));

describe("ContainersShell", () => {
  let fetchSpy: MockInstance<typeof fetch>;

  beforeEach(() => {
    refreshMock.mockReset();
    fetchSpy = vi.spyOn(global, "fetch");
    fetchSpy.mockImplementation(async (input, init) => {
      const url = getRequestUrl(input);

      if (url.startsWith("/api/containers/runtime-control-plane/logs")) {
        return jsonResponse({
          output:
            "2026-04-22T11:10:00.000Z server booted\n2026-04-22T11:10:05.000Z listening on 3000",
        });
      }

      if (url === "/api/metrics?mode=current") {
        return jsonResponse({
          snapshot: runtimeSnapshot,
        });
      }

      if (
        url === "/api/containers/runtime-control-plane/actions" &&
        init?.method === "POST"
      ) {
        return jsonResponse({ updatedAt: "2026-04-22T11:11:00.000Z" });
      }

      if (url.startsWith("/api/containers/catalog?query=") && !init?.method) {
        return jsonResponse({
          results: [
            {
              description: "Official NGINX image",
              isOfficial: true,
              name: "nginx",
              pullCount: 1200000,
              starCount: 9000,
            },
          ],
        });
      }

      if (url === "/api/containers/create" && init?.method === "POST") {
        return jsonResponse({ message: "Started web-app." }, { status: 201 });
      }

      return jsonResponse({});
    });
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the new containers control surface and loads real runtime logs", async () => {
    render(
      <ContainersShell
        initialAllContainerHistory={[]}
        initialDeployments={[]}
        initialSnapshot={runtimeSnapshot}
      />,
    );

    expect(
      screen.getByRole("heading", { name: /vercelab ui/i }),
    ).toBeVisible();

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/containers/runtime-control-plane/logs?tail=150",
        expect.objectContaining({ cache: "no-store", signal: expect.any(Object) }),
      );
    });

    expect(await screen.findByText(/server booted/i)).toBeVisible();
    expect(screen.getByText(/protected system service/i)).toBeVisible();
    expect(
      screen.getByRole("link", {
        name: /https:\/\/control-plane\.myhomelan\.com/i,
      }),
    ).toBeVisible();
  });

  it("stores friendly labels locally for protected containers", async () => {
    const user = userEvent.setup();

    render(
      <ContainersShell
        initialAllContainerHistory={[]}
        initialDeployments={[]}
        initialSnapshot={runtimeSnapshot}
      />,
    );

    const aliasInput = await screen.findByLabelText(/^label$/i);
    await user.clear(aliasInput);
    await user.type(aliasInput, "Platform UI");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    expect(
      window.localStorage.getItem("vercelab:containers-friendly-labels"),
    ).toContain("Platform UI");
    expect(screen.getAllByText(/platform ui/i)[0]).toBeVisible();
  });

  it("runs allowed lifecycle actions and refreshes the route", async () => {
    const user = userEvent.setup();

    render(
      <ContainersShell
        initialAllContainerHistory={[]}
        initialDeployments={[]}
        initialSnapshot={runtimeSnapshot}
      />,
    );

    await user.click(screen.getByRole("button", { name: /^restart$/i }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/containers/runtime-control-plane/actions",
        expect.objectContaining({
          body: JSON.stringify({ action: "restart" }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        }),
      );
    });

    expect(refreshMock).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /^stop$/i })).toBeNull();
  });

  it("creates a new container from the add panel", async () => {
    const user = userEvent.setup();

    render(
      <ContainersShell
        initialAllContainerHistory={[]}
        initialDeployments={[]}
        initialSnapshot={runtimeSnapshot}
      />,
    );

    await user.click(screen.getByRole("button", { name: /^add$/i }));
    await user.clear(screen.getByLabelText(/container image reference/i));
    await user.type(
      screen.getByLabelText(/container image reference/i),
      "nginx:latest",
    );
    await user.type(screen.getByLabelText(/container name/i), "web-app");
    await user.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/containers/create",
        expect.objectContaining({
          headers: { "Content-Type": "application/json" },
          method: "POST",
        }),
      );
    });

    expect(refreshMock).toHaveBeenCalled();
  });
});