import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { MetricsDashboardShell } from "@/components/metrics-dashboard-shell";
import type { MetricsSnapshot } from "@/lib/system-metrics";

const pushMock = vi.fn();
const prefetchMock = vi.fn();
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

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
    prefetch: prefetchMock,
    refresh: refreshMock,
  }),
}));

vi.mock("@/components/ui/echart-surface", () => ({
  EChartSurface: ({
    ariaLabel,
    className,
  }: {
    ariaLabel: string;
    className?: string;
  }) => (
    <div
      aria-label={ariaLabel}
      className={className}
      data-testid="echart-surface"
    />
  ),
}));

describe("MetricsDashboardShell", () => {
  const fetchSpy = vi.spyOn(global, "fetch");

  const payload = {
    allContainerHistory: [
      {
        containerId: "runtime-control-plane",
        containerName: "control-plane",
        points: [
          {
            cpuPercent: 14,
            diskRead: 0,
            diskTotal: 18_000,
            diskWrite: 18_000,
            memoryPercent: 0.8,
            memoryUsedBytes: 560 * 1024 ** 2,
            networkIn: 32_000,
            networkOut: 11_000,
            networkTotal: 43_000,
            timestamp: "2026-04-17T07:59:45.000Z",
          },
          {
            cpuPercent: 16,
            diskRead: 0,
            diskTotal: 21_000,
            diskWrite: 21_000,
            memoryPercent: 0.8,
            memoryUsedBytes: 586 * 1024 ** 2,
            networkIn: 41_000,
            networkOut: 12_500,
            networkTotal: 53_500,
            timestamp: "2026-04-17T07:59:50.000Z",
          },
          {
            cpuPercent: 18,
            diskRead: 0,
            diskTotal: 24_000,
            diskWrite: 24_000,
            memoryPercent: 0.9,
            memoryUsedBytes: 612 * 1024 ** 2,
            networkIn: 48_000,
            networkOut: 14_000,
            networkTotal: 62_000,
            timestamp: "2026-04-17T07:59:55.000Z",
          },
        ],
      },
      {
        containerId: "runtime-edge-proxy",
        containerName: "edge-proxy",
        points: [
          {
            cpuPercent: 7,
            diskRead: 4_000,
            diskTotal: 22_000,
            diskWrite: 18_000,
            memoryPercent: 0.2,
            memoryUsedBytes: 170 * 1024 ** 2,
            networkIn: 35_000,
            networkOut: 120,
            networkTotal: 35_120,
            timestamp: "2026-04-17T07:59:45.000Z",
          },
          {
            cpuPercent: 8,
            diskRead: 4_500,
            diskTotal: 24_500,
            diskWrite: 20_000,
            memoryPercent: 0.2,
            memoryUsedBytes: 178 * 1024 ** 2,
            networkIn: 39_000,
            networkOut: 122,
            networkTotal: 39_122,
            timestamp: "2026-04-17T07:59:50.000Z",
          },
          {
            cpuPercent: 9,
            diskRead: 4_900,
            diskTotal: 27_800,
            diskWrite: 22_900,
            memoryPercent: 0.3,
            memoryUsedBytes: 186 * 1024 ** 2,
            networkIn: 43_000,
            networkOut: 126,
            networkTotal: 43_126,
            timestamp: "2026-04-17T07:59:55.000Z",
          },
        ],
      },
      {
        containerId: "runtime-postgres-primary",
        containerName: "postgres-primary",
        points: [
          {
            cpuPercent: 24,
            diskRead: 112_000,
            diskTotal: 338_000,
            diskWrite: 226_000,
            memoryPercent: 4.1,
            memoryUsedBytes: Math.round(2.5 * 1024 ** 3),
            networkIn: 10_000,
            networkOut: 8_000,
            networkTotal: 18_000,
            timestamp: "2026-04-17T07:59:45.000Z",
          },
          {
            cpuPercent: 28,
            diskRead: 120_000,
            diskTotal: 360_000,
            diskWrite: 240_000,
            memoryPercent: 4.2,
            memoryUsedBytes: Math.round(2.65 * 1024 ** 3),
            networkIn: 11_000,
            networkOut: 8_600,
            networkTotal: 19_600,
            timestamp: "2026-04-17T07:59:50.000Z",
          },
          {
            cpuPercent: 31,
            diskRead: 128_000,
            diskTotal: 384_000,
            diskWrite: 256_000,
            memoryPercent: 4.4,
            memoryUsedBytes: Math.round(2.8 * 1024 ** 3),
            networkIn: 12_000,
            networkOut: 9_000,
            networkTotal: 21_000,
            timestamp: "2026-04-17T07:59:55.000Z",
          },
        ],
      },
      {
        containerId: "runtime-worker-builds",
        containerName: "worker-builds",
        points: [
          {
            cpuPercent: 18,
            diskRead: 0,
            diskTotal: 3_000,
            diskWrite: 3_000,
            memoryPercent: 0.6,
            memoryUsedBytes: 396 * 1024 ** 2,
            networkIn: 5_000,
            networkOut: 9_000,
            networkTotal: 14_000,
            timestamp: "2026-04-17T07:59:45.000Z",
          },
          {
            cpuPercent: 21,
            diskRead: 0,
            diskTotal: 3_600,
            diskWrite: 3_600,
            memoryPercent: 0.7,
            memoryUsedBytes: 412 * 1024 ** 2,
            networkIn: 5_500,
            networkOut: 10_000,
            networkTotal: 15_500,
            timestamp: "2026-04-17T07:59:50.000Z",
          },
          {
            cpuPercent: 24,
            diskRead: 0,
            diskTotal: 4_100,
            diskWrite: 4_100,
            memoryPercent: 0.7,
            memoryUsedBytes: 428 * 1024 ** 2,
            networkIn: 6_000,
            networkOut: 11_000,
            networkTotal: 17_000,
            timestamp: "2026-04-17T07:59:55.000Z",
          },
        ],
      },
    ],
    history: [
      {
        containersCpu: 19,
        containersMemory: 35,
        cpu: 27,
        diskRead: 120_000,
        diskWrite: 180_000,
        memory: 65,
        networkIn: 150_000,
        networkOut: 88_000,
        networkTotal: 238_000,
        timestamp: "2026-04-17T07:59:45.000Z",
      },
      {
        containersCpu: 21,
        containersMemory: 36,
        cpu: 29,
        diskRead: 132_000,
        diskWrite: 194_000,
        memory: 66,
        networkIn: 162_000,
        networkOut: 91_000,
        networkTotal: 253_000,
        timestamp: "2026-04-17T07:59:50.000Z",
      },
      {
        containersCpu: 24,
        containersMemory: 38,
        cpu: 31,
        diskRead: 148_000,
        diskWrite: 212_000,
        memory: 68,
        networkIn: 180_000,
        networkOut: 96_000,
        networkTotal: 276_000,
        timestamp: "2026-04-17T07:59:55.000Z",
      },
    ],
    snapshot: {
      containers: {
        all: [
          {
            cpuPercent: 18,
            diskReadBytesPerSecond: 0,
            diskTotalBytesPerSecond: 24_000,
            diskWriteBytesPerSecond: 24_000,
            health: "healthy",
            id: "runtime-control-plane",
            memoryBytes: 612 * 1024 ** 2,
            memoryPercent: 0.9,
            name: "control-plane",
            networkRxBytesPerSecond: 48_000,
            networkTotalBytesPerSecond: 62_000,
            networkTxBytesPerSecond: 14_000,
            projectName: "vercelab",
            serviceName: "control-plane",
            status: "running",
          },
          {
            cpuPercent: 9,
            diskReadBytesPerSecond: 4_900,
            diskTotalBytesPerSecond: 27_800,
            diskWriteBytesPerSecond: 22_900,
            health: "healthy",
            id: "runtime-edge-proxy",
            memoryBytes: 186 * 1024 ** 2,
            memoryPercent: 0.3,
            name: "edge-proxy",
            networkRxBytesPerSecond: 43_000,
            networkTotalBytesPerSecond: 43_126,
            networkTxBytesPerSecond: 126,
            projectName: "traefik",
            serviceName: "proxy",
            status: "running",
          },
          {
            cpuPercent: 31,
            diskReadBytesPerSecond: 128_000,
            diskTotalBytesPerSecond: 384_000,
            diskWriteBytesPerSecond: 256_000,
            health: "unhealthy",
            id: "runtime-postgres-primary",
            memoryBytes: Math.round(2.8 * 1024 ** 3),
            memoryPercent: 4.4,
            name: "postgres-primary",
            networkRxBytesPerSecond: 12_000,
            networkTotalBytesPerSecond: 21_000,
            networkTxBytesPerSecond: 9_000,
            projectName: "database",
            serviceName: "postgres",
            status: "running",
          },
          {
            cpuPercent: 24,
            diskReadBytesPerSecond: 0,
            diskTotalBytesPerSecond: 4_100,
            diskWriteBytesPerSecond: 4_100,
            health: "healthy",
            id: "runtime-worker-builds",
            memoryBytes: 428 * 1024 ** 2,
            memoryPercent: 0.7,
            name: "worker-builds",
            networkRxBytesPerSecond: 6_000,
            networkTotalBytesPerSecond: 17_000,
            networkTxBytesPerSecond: 11_000,
            projectName: "jobs",
            serviceName: "worker",
            status: "running",
          },
        ],
        cpuPercent: 24,
        memoryPercent: 38,
        memoryUsedBytes: Math.round(3.8 * 1024 ** 3),
        running: 3,
        statusBreakdown: {
          healthy: 3,
          stopped: 0,
          unhealthy: 1,
        },
        top: [],
        total: 4,
      },
      hostIp: "192.168.1.10",
      network: {
        interfaces: [
          {
            name: "eth0",
            rxBytesPerSecond: 180_000,
            txBytesPerSecond: 96_000,
          },
        ],
        rxBytesPerSecond: 180_000,
        txBytesPerSecond: 96_000,
      },
      system: {
        cpuPercent: 31,
        diskReadBytesPerSecond: 148_000,
        diskWriteBytesPerSecond: 212_000,
        loadAverage: [0.48, 0.52, 0.56],
        memoryPercent: 68,
        memoryTotalBytes: 64 * 1024 ** 3,
        memoryUsedBytes: Math.round(43.8 * 1024 ** 3),
      },
      timestamp: "2026-04-17T08:00:00.000Z",
      warnings: [],
    },
  };

  beforeEach(() => {
    vi.useRealTimers();
    pushMock.mockReset();
    prefetchMock.mockReset();
    refreshMock.mockReset();
    window.history.replaceState(null, "", "/");
    window.localStorage.clear();

    fetchSpy.mockImplementation(async () => jsonResponse(payload));
  });

  afterEach(() => {
    vi.useRealTimers();
    fetchSpy.mockReset();
  });

  afterAll(() => {
    fetchSpy.mockRestore();
  });

  it("renders the permanent metrics dashboard with host and container sections", async () => {
    render(
      <MetricsDashboardShell
        initialAllContainerHistory={payload.allContainerHistory}
        initialDashboardRange="15m"
        initialDeployments={[]}
        initialHistory={payload.history}
        initialSnapshot={payload.snapshot as unknown as MetricsSnapshot}
      />,
    );

    expect(
      await screen.findByRole("heading", { name: /metrics dashboard/i }),
    ).toBeVisible();
    expect(
      screen.queryByText(
        /a denser operational view for host and container observability/i,
      ),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/container load explorer/i)).toBeVisible();
    expect(screen.getAllByText(/^host cpu$/i)[0]).toBeVisible();
    expect(screen.getAllByText(/^host memory$/i)[0]).toBeVisible();
    expect(screen.getAllByText(/^host network$/i)[0]).toBeVisible();
    expect(screen.getAllByText(/^host disk$/i)[0]).toBeVisible();
    expect(screen.getAllByText(/^cpu by container$/i)[0]).toBeVisible();
    expect(screen.getAllByText(/^memory by container$/i)[0]).toBeVisible();
    expect(screen.getAllByText(/^network by container$/i)[0]).toBeVisible();
    expect(screen.queryByText(/^fleet cpu$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^fleet memory$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^fleet network$/i)).not.toBeInTheDocument();
    expect(screen.getAllByTestId("echart-surface").length).toBe(7);
  });

  it("avoids an immediate duplicate fetch after hydration and polls the light payload", async () => {
    vi.useFakeTimers();

    render(
      <MetricsDashboardShell
        initialAllContainerHistory={payload.allContainerHistory}
        initialDashboardRange="15m"
        initialDeployments={[]}
        initialHistory={payload.history}
        initialSnapshot={payload.snapshot as unknown as MetricsSnapshot}
      />,
    );

    expect(fetchSpy).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(9999);
    });
    expect(fetchSpy).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const url = getRequestUrl(fetchSpy.mock.calls[0]![0]);
    expect(url).toContain("/api/metrics?");
    expect(url).toContain("mode=current");
    expect(url).not.toContain("range=");
    expect(url).not.toContain("allContainers=true");
  });

  it("fetches live and heavy history payloads separately when the user changes range", async () => {
    const user = userEvent.setup();

    render(
      <MetricsDashboardShell
        initialAllContainerHistory={payload.allContainerHistory}
        initialDashboardRange="15m"
        initialDeployments={[]}
        initialHistory={payload.history}
        initialSnapshot={payload.snapshot as unknown as MetricsSnapshot}
      />,
    );

    expect(fetchSpy).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /^24 h$/i }));

    expect(window.location.search).toBe("?range=24h");

    await waitFor(() =>
      expect(
        fetchSpy.mock.calls.some(([input]) => {
          const url = getRequestUrl(input);

          return (
            url.includes("/api/metrics?") &&
            url.includes("mode=current") &&
            !url.includes("range=") &&
            !url.includes("allContainers=true")
          );
        }),
      ).toBe(true),
    );

    await waitFor(() =>
      expect(
        fetchSpy.mock.calls.some(([input]) => {
          const url = getRequestUrl(input);

          return (
            url.includes("/api/metrics?") &&
            url.includes("allContainers=true") &&
            url.includes("range=24h") &&
            !url.includes("mode=current")
          );
        }),
      ).toBe(true),
    );
  });

  it("loads heavy container history on mount when SSR did not provide it", async () => {
    render(
      <MetricsDashboardShell
        initialAllContainerHistory={[]}
        initialDashboardRange="15m"
        initialDeployments={[]}
        initialHistory={payload.history}
        initialSnapshot={payload.snapshot as unknown as MetricsSnapshot}
      />,
    );

    await waitFor(() =>
      expect(
        fetchSpy.mock.calls.some(([input]) => {
          const url = getRequestUrl(input);

          return (
            url.includes("/api/metrics?") &&
            url.includes("allContainers=true") &&
            url.includes("range=15m") &&
            !url.includes("mode=current")
          );
        }),
      ).toBe(true),
    );

    expect(
      fetchSpy.mock.calls.some(([input]) =>
        getRequestUrl(input).includes("mode=current"),
      ),
    ).toBe(false);
  });

  it("keeps fleet charts visible when focusing a container and routes rail clicks back to linked pages", async () => {
    const user = userEvent.setup();

    render(
      <MetricsDashboardShell
        initialAllContainerHistory={payload.allContainerHistory}
        initialDashboardRange="15m"
        initialDeployments={[]}
        initialHistory={payload.history}
        initialSnapshot={payload.snapshot as unknown as MetricsSnapshot}
      />,
    );

    await user.click(
      await screen.findByRole("button", {
        name: /postgres-primary.*unhealthy/i,
      }),
    );

    expect(screen.getByText(/^focus postgres-primary$/i)).toBeVisible();
    expect(screen.getAllByText(/^cpu by container$/i)[0]).toBeVisible();

    await user.click(screen.getByRole("button", { name: /git app page/i }));

    expect(pushMock).toHaveBeenCalledWith("/git-app-page");
  });

  it("applies stored container aliases in the dashboard sidebar list", async () => {
    window.localStorage.setItem(
      "vercelab:containers-friendly-labels",
      JSON.stringify({
        "runtime-control-plane": "Platform UI",
      }),
    );

    render(
      <MetricsDashboardShell
        initialAllContainerHistory={payload.allContainerHistory}
        initialDashboardRange="15m"
        initialDeployments={[]}
        initialHistory={payload.history}
        initialSnapshot={payload.snapshot as unknown as MetricsSnapshot}
      />,
    );

    expect(
      await screen.findByRole("button", {
        name: /platform ui.*healthy/i,
      }),
    ).toBeVisible();
  });

  it("updates dashboard sidebar aliases live when alias storage changes after mount", async () => {
    render(
      <MetricsDashboardShell
        initialAllContainerHistory={payload.allContainerHistory}
        initialDashboardRange="15m"
        initialDeployments={[]}
        initialHistory={payload.history}
        initialSnapshot={payload.snapshot as unknown as MetricsSnapshot}
      />,
    );

    expect(
      await screen.findByRole("button", {
        name: /control-plane.*healthy/i,
      }),
    ).toBeVisible();

    const nextAliases = JSON.stringify({
      "runtime-control-plane": "Platform UI",
    });

    await act(async () => {
      window.localStorage.setItem(
        "vercelab:containers-friendly-labels",
        nextAliases,
      );
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "vercelab:containers-friendly-labels",
          newValue: nextAliases,
        }),
      );
    });

    expect(
      await screen.findByRole("button", {
        name: /platform ui.*healthy/i,
      }),
    ).toBeVisible();
  });

  it("shows deployment app names and friendly system names in sidebar and charts", async () => {
    const labelPayload = {
      allContainerHistory: [
        {
          containerId: "runtime-omnichat",
          containerName: "vercelab-omnichat-c6f86566-server-1",
          points: [
            {
              cpuPercent: 14,
              diskRead: 2_000,
              diskTotal: 8_000,
              diskWrite: 6_000,
              memoryPercent: 0.6,
              memoryUsedBytes: 420 * 1024 ** 2,
              networkIn: 14_000,
              networkOut: 7_000,
              networkTotal: 21_000,
              timestamp: "2026-04-19T10:00:00.000Z",
            },
          ],
        },
        {
          containerId: "runtime-traefik",
          containerName: "vercelab-traefik-1",
          points: [
            {
              cpuPercent: 5,
              diskRead: 0,
              diskTotal: 2_000,
              diskWrite: 2_000,
              memoryPercent: 0.2,
              memoryUsedBytes: 140 * 1024 ** 2,
              networkIn: 10_000,
              networkOut: 1_000,
              networkTotal: 11_000,
              timestamp: "2026-04-19T10:00:00.000Z",
            },
          ],
        },
      ],
      history: [
        {
          containersCpu: 19,
          containersMemory: 12,
          cpu: 24,
          diskRead: 70_000,
          diskWrite: 84_000,
          memory: 61,
          networkIn: 140_000,
          networkOut: 82_000,
          networkTotal: 222_000,
          timestamp: "2026-04-19T10:00:00.000Z",
        },
      ],
      snapshot: {
        containers: {
          all: [
            {
              cpuPercent: 14,
              diskReadBytesPerSecond: 2_000,
              diskTotalBytesPerSecond: 8_000,
              diskWriteBytesPerSecond: 6_000,
              health: "healthy",
              id: "runtime-omnichat",
              memoryBytes: 420 * 1024 ** 2,
              memoryPercent: 0.6,
              name: "vercelab-omnichat-c6f86566-server-1",
              networkRxBytesPerSecond: 14_000,
              networkTotalBytesPerSecond: 21_000,
              networkTxBytesPerSecond: 7_000,
              projectName: "vercelab-omnichat-c6f86566",
              serviceName: "server",
              status: "running",
            },
            {
              cpuPercent: 5,
              diskReadBytesPerSecond: 0,
              diskTotalBytesPerSecond: 2_000,
              diskWriteBytesPerSecond: 2_000,
              health: "healthy",
              id: "runtime-traefik",
              memoryBytes: 140 * 1024 ** 2,
              memoryPercent: 0.2,
              name: "vercelab-traefik-1",
              networkRxBytesPerSecond: 10_000,
              networkTotalBytesPerSecond: 11_000,
              networkTxBytesPerSecond: 1_000,
              projectName: "traefik",
              serviceName: "traefik",
              status: "running",
            },
          ],
          cpuPercent: 19,
          memoryPercent: 12,
          memoryUsedBytes: Math.round(560 * 1024 ** 2),
          running: 2,
          statusBreakdown: {
            healthy: 2,
            stopped: 0,
            unhealthy: 0,
          },
          top: [],
          total: 2,
        },
        hostIp: "192.168.1.10",
        network: {
          interfaces: [
            {
              name: "eth0",
              rxBytesPerSecond: 140_000,
              txBytesPerSecond: 82_000,
            },
          ],
          rxBytesPerSecond: 140_000,
          txBytesPerSecond: 82_000,
        },
        system: {
          cpuPercent: 24,
          diskReadBytesPerSecond: 70_000,
          diskWriteBytesPerSecond: 84_000,
          loadAverage: [0.42, 0.46, 0.5] as [number, number, number],
          memoryPercent: 61,
          memoryTotalBytes: 64 * 1024 ** 3,
          memoryUsedBytes: Math.round(39 * 1024 ** 3),
        },
        timestamp: "2026-04-19T10:00:00.000Z",
        warnings: [],
      },
    };

    fetchSpy.mockImplementation(async () => jsonResponse(labelPayload));

    render(
      <MetricsDashboardShell
        initialAllContainerHistory={labelPayload.allContainerHistory}
        initialDashboardRange="15m"
        initialDeployments={[
          {
            id: "dep-omnichat",
            repositoryName: "dedkola/omnichat",
            repositoryUrl: "https://github.com/dedkola/omnichat.git",
            branch: "main",
            commitSha: null,
            appName: "Omnichat",
            subdomain: "dash",
            port: 3000,
            envVariables: null,
            serviceName: "server",
            status: "running",
            composeMode: "compose",
            projectName: "vercelab-omnichat-c6f86566",
            lastOutput: null,
            lastOperationSummary: null,
            updatedAt: "2026-04-19T10:00:00.000Z",
            deployedAt: "2026-04-19T09:59:00.000Z",
            tokenStored: false,
          },
        ]}
        initialHistory={labelPayload.history}
        initialSnapshot={labelPayload.snapshot as unknown as MetricsSnapshot}
      />,
    );

    expect(
      await screen.findByRole("button", {
        name: /omnichat \/ server.*healthy/i,
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: /vercelab traefik.*healthy/i,
      }),
    ).toBeVisible();
    expect(
      screen.getByText(/hot now\s+omnichat \/ server\s+14\.0%/i),
    ).toBeVisible();
  });
});
