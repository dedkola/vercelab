import { act, render, screen, waitFor, within } from "@testing-library/react";
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

import { WorkspaceShell } from "@/components/workspace-shell";

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

describe("WorkspaceShell", () => {
  const fetchSpy = vi.spyOn(global, "fetch");

  beforeEach(() => {
    pushMock.mockReset();
    prefetchMock.mockReset();
    refreshMock.mockReset();
    window.history.replaceState(null, "", "/");
    window.localStorage.clear();

    fetchSpy.mockImplementation(async (input) => {
      const url = getRequestUrl(input);

      if (url.includes("/api/deployments/dep-1/source")) {
        return jsonResponse({
          branches: ["main", "release", "preview"],
          browserError: null,
          commits: [
            {
              authorName: "Test User",
              committedAt: "2026-04-17T07:50:00.000Z",
              message: "Redesign Git app management surface",
              sha: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
              shortSha: "a1b2c3d",
              url: "https://github.com/dedkola/vercelab/commit/a1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
            },
          ],
          configuredBranch: "main",
          configuredCommitSha: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
          currentBranch: "main",
          currentCommit: {
            authorName: "Test User",
            committedAt: "2026-04-17T07:50:00.000Z",
            message: "Redesign Git app management surface",
            sha: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
            shortSha: "a1b2c3d",
            url: "https://github.com/dedkola/vercelab/commit/a1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
          },
          repository: {
            fullName: "dedkola/vercelab",
            name: "vercelab",
            owner: "dedkola",
            url: "https://github.com/dedkola/vercelab",
          },
        });
      }

      if (url.includes("/api/github/repos/dedkola/vercelab/branches")) {
        return jsonResponse({
          branches: ["main", "release", "preview"],
        });
      }

      if (url === "/api/github/repos") {
        return jsonResponse({
          repositories: [
            {
              id: 1,
              name: "vercelab",
              fullName: "dedkola/vercelab",
              owner: "dedkola",
              cloneUrl: "https://github.com/dedkola/vercelab.git",
              url: "https://github.com/dedkola/vercelab.git",
              defaultBranch: "main",
              visibility: "private",
              description: "Vercelab control plane",
              updatedAt: "2026-04-17T07:58:00.000Z",
            },
          ],
          tokenConfigured: true,
        });
      }

      return jsonResponse({
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
            total: 4,
            cpuPercent: 24,
            memoryPercent: 38,
            memoryUsedBytes: 3.8 * 1024 ** 3,
            statusBreakdown: {
              healthy: 3,
              unhealthy: 1,
              stopped: 0,
            },
            top: [],
            all: [
              {
                id: "runtime-control-plane",
                name: "control-plane",
                cpuPercent: 18,
                memoryBytes: 612 * 1024 ** 2,
                memoryPercent: 0.9,
                networkRxBytesPerSecond: 48_000,
                networkTxBytesPerSecond: 14_000,
                networkTotalBytesPerSecond: 62_000,
                diskReadBytesPerSecond: 0,
                diskWriteBytesPerSecond: 24_000,
                diskTotalBytesPerSecond: 24_000,
                status: "running",
                health: "healthy",
                projectName: "vercelab",
                routedHost: "control-plane.myhomelan.com",
                serviceName: "control-plane",
              },
              {
                id: "runtime-edge-proxy",
                name: "edge-proxy",
                cpuPercent: 9,
                memoryBytes: 186 * 1024 ** 2,
                memoryPercent: 0.3,
                networkRxBytesPerSecond: 43_000,
                networkTxBytesPerSecond: 126,
                networkTotalBytesPerSecond: 43_126,
                diskReadBytesPerSecond: 4_900,
                diskWriteBytesPerSecond: 22_900,
                diskTotalBytesPerSecond: 27_800,
                status: "running",
                health: "healthy",
                projectName: "traefik",
                serviceName: "proxy",
              },
              {
                id: "runtime-postgres-primary",
                name: "postgres-primary",
                cpuPercent: 31,
                memoryBytes: Math.round(2.8 * 1024 ** 3),
                memoryPercent: 4.4,
                networkRxBytesPerSecond: 12_000,
                networkTxBytesPerSecond: 9_000,
                networkTotalBytesPerSecond: 21_000,
                diskReadBytesPerSecond: 128_000,
                diskWriteBytesPerSecond: 256_000,
                diskTotalBytesPerSecond: 384_000,
                status: "running",
                health: "unhealthy",
                projectName: "database",
                serviceName: "postgres",
              },
              {
                id: "runtime-worker-builds",
                name: "worker-builds",
                cpuPercent: 24,
                memoryBytes: 428 * 1024 ** 2,
                memoryPercent: 0.7,
                networkRxBytesPerSecond: 6_000,
                networkTxBytesPerSecond: 11_000,
                networkTotalBytesPerSecond: 17_000,
                diskReadBytesPerSecond: 0,
                diskWriteBytesPerSecond: 4_100,
                diskTotalBytesPerSecond: 4_100,
                status: "running",
                health: "healthy",
                projectName: "jobs",
                serviceName: "worker",
              },
            ],
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
            diskRead: 120_000,
            diskWrite: 180_000,
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
            diskRead: 132_000,
            diskWrite: 194_000,
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
            diskRead: 148_000,
            diskWrite: 212_000,
            containersCpu: 24,
            containersMemory: 38,
          },
        ],
        containerHistory: [
          {
            timestamp: "2026-04-17T07:59:45.000Z",
            cpuPercent: 14,
            memoryPercent: 0.8,
            memoryUsedBytes: 560 * 1024 ** 2,
            networkIn: 32_000,
            networkOut: 11_000,
            networkTotal: 43_000,
            diskRead: 0,
            diskWrite: 18_000,
            diskTotal: 18_000,
          },
          {
            timestamp: "2026-04-17T07:59:50.000Z",
            cpuPercent: 16,
            memoryPercent: 0.8,
            memoryUsedBytes: 586 * 1024 ** 2,
            networkIn: 41_000,
            networkOut: 12_500,
            networkTotal: 53_500,
            diskRead: 0,
            diskWrite: 21_000,
            diskTotal: 21_000,
          },
          {
            timestamp: "2026-04-17T07:59:55.000Z",
            cpuPercent: 18,
            memoryPercent: 0.9,
            memoryUsedBytes: 612 * 1024 ** 2,
            networkIn: 48_000,
            networkOut: 14_000,
            networkTotal: 62_000,
            diskRead: 0,
            diskWrite: 24_000,
            diskTotal: 24_000,
          },
        ],
        allContainerHistory: [
          {
            containerId: "runtime-control-plane",
            containerName: "control-plane",
            points: [
              {
                timestamp: "2026-04-17T07:59:45.000Z",
                cpuPercent: 14,
                memoryPercent: 0.8,
                memoryUsedBytes: 560 * 1024 ** 2,
                networkIn: 32_000,
                networkOut: 11_000,
                networkTotal: 43_000,
                diskRead: 0,
                diskWrite: 18_000,
                diskTotal: 18_000,
              },
              {
                timestamp: "2026-04-17T07:59:50.000Z",
                cpuPercent: 16,
                memoryPercent: 0.8,
                memoryUsedBytes: 586 * 1024 ** 2,
                networkIn: 41_000,
                networkOut: 12_500,
                networkTotal: 53_500,
                diskRead: 0,
                diskWrite: 21_000,
                diskTotal: 21_000,
              },
              {
                timestamp: "2026-04-17T07:59:55.000Z",
                cpuPercent: 18,
                memoryPercent: 0.9,
                memoryUsedBytes: 612 * 1024 ** 2,
                networkIn: 48_000,
                networkOut: 14_000,
                networkTotal: 62_000,
                diskRead: 0,
                diskWrite: 24_000,
                diskTotal: 24_000,
              },
            ],
          },
          {
            containerId: "runtime-edge-proxy",
            containerName: "edge-proxy",
            points: [
              {
                timestamp: "2026-04-17T07:59:45.000Z",
                cpuPercent: 7,
                memoryPercent: 0.2,
                memoryUsedBytes: 170 * 1024 ** 2,
                networkIn: 35_000,
                networkOut: 120,
                networkTotal: 35_120,
                diskRead: 4_000,
                diskWrite: 18_000,
                diskTotal: 22_000,
              },
              {
                timestamp: "2026-04-17T07:59:50.000Z",
                cpuPercent: 8,
                memoryPercent: 0.2,
                memoryUsedBytes: 178 * 1024 ** 2,
                networkIn: 39_000,
                networkOut: 122,
                networkTotal: 39_122,
                diskRead: 4_500,
                diskWrite: 20_000,
                diskTotal: 24_500,
              },
              {
                timestamp: "2026-04-17T07:59:55.000Z",
                cpuPercent: 9,
                memoryPercent: 0.3,
                memoryUsedBytes: 186 * 1024 ** 2,
                networkIn: 43_000,
                networkOut: 126,
                networkTotal: 43_126,
                diskRead: 4_900,
                diskWrite: 22_900,
                diskTotal: 27_800,
              },
            ],
          },
          {
            containerId: "runtime-postgres-primary",
            containerName: "postgres-primary",
            points: [
              {
                timestamp: "2026-04-17T07:59:45.000Z",
                cpuPercent: 24,
                memoryPercent: 4.1,
                memoryUsedBytes: Math.round(2.5 * 1024 ** 3),
                networkIn: 10_000,
                networkOut: 8_000,
                networkTotal: 18_000,
                diskRead: 112_000,
                diskWrite: 226_000,
                diskTotal: 338_000,
              },
              {
                timestamp: "2026-04-17T07:59:50.000Z",
                cpuPercent: 28,
                memoryPercent: 4.2,
                memoryUsedBytes: Math.round(2.65 * 1024 ** 3),
                networkIn: 11_000,
                networkOut: 8_600,
                networkTotal: 19_600,
                diskRead: 120_000,
                diskWrite: 240_000,
                diskTotal: 360_000,
              },
              {
                timestamp: "2026-04-17T07:59:55.000Z",
                cpuPercent: 31,
                memoryPercent: 4.4,
                memoryUsedBytes: Math.round(2.8 * 1024 ** 3),
                networkIn: 12_000,
                networkOut: 9_000,
                networkTotal: 21_000,
                diskRead: 128_000,
                diskWrite: 256_000,
                diskTotal: 384_000,
              },
            ],
          },
          {
            containerId: "runtime-worker-builds",
            containerName: "worker-builds",
            points: [
              {
                timestamp: "2026-04-17T07:59:45.000Z",
                cpuPercent: 18,
                memoryPercent: 0.6,
                memoryUsedBytes: 396 * 1024 ** 2,
                networkIn: 5_000,
                networkOut: 9_000,
                networkTotal: 14_000,
                diskRead: 0,
                diskWrite: 3_000,
                diskTotal: 3_000,
              },
              {
                timestamp: "2026-04-17T07:59:50.000Z",
                cpuPercent: 21,
                memoryPercent: 0.7,
                memoryUsedBytes: 412 * 1024 ** 2,
                networkIn: 5_500,
                networkOut: 10_000,
                networkTotal: 15_500,
                diskRead: 0,
                diskWrite: 3_600,
                diskTotal: 3_600,
              },
              {
                timestamp: "2026-04-17T07:59:55.000Z",
                cpuPercent: 24,
                memoryPercent: 0.7,
                memoryUsedBytes: 428 * 1024 ** 2,
                networkIn: 6_000,
                networkOut: 11_000,
                networkTotal: 17_000,
                diskRead: 0,
                diskWrite: 4_100,
                diskTotal: 4_100,
              },
            ],
          },
        ],
      });
    });
  });

  afterEach(() => {
    fetchSpy.mockReset();
  });

  afterAll(() => {
    fetchSpy.mockRestore();
  });

  it("renders the workspace shell and default dashboard surfaces", async () => {
    const user = userEvent.setup();

    render(<WorkspaceShell />);

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
      await screen.findByRole("heading", { name: /all containers/i }),
    ).toBeVisible();
    expect(screen.getAllByText(/^dashboard$/i)[0]).toBeVisible();
    expect(screen.getByText(/tail preview/i)).toBeVisible();
    expect(
      await screen.findByText(/3 running containers on 192\.168\.1\.10\./i),
    ).toBeVisible();
    expect(screen.getAllByText(/3\s+running/i)[0]).toBeVisible();
  });

  it("shows live runtime status in the containers sidebar", async () => {
    const user = userEvent.setup();

    render(<WorkspaceShell />);

    expect(
      await screen.findByRole("button", {
        name: /postgres-primary.*unhealthy/i,
      }),
    ).toBeVisible();
    expect(screen.getByText(/4 visible/i)).toBeVisible();

    await user.click(
      screen.getByRole("button", {
        name: /control-plane.*healthy/i,
      }),
    );

    expect(
      screen.getByRole("link", {
        name: /https:\/\/control-plane\.myhomelan\.com/i,
      }),
    ).toBeVisible();
  });

  it("applies stored container aliases in the dashboard sidebar", async () => {
    window.localStorage.setItem(
      "vercelab:containers-friendly-labels",
      JSON.stringify({
        "runtime-control-plane": "Platform UI",
      }),
    );

    render(<WorkspaceShell />);

    expect(
      await screen.findByRole("button", {
        name: /platform ui.*healthy/i,
      }),
    ).toBeVisible();
  });

  it("updates dashboard aliases live when alias storage changes after mount", async () => {
    render(<WorkspaceShell />);

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

  it("shows app names for managed containers and raw names for docker containers in the sidebar", async () => {
    fetchSpy.mockImplementation(async (input) => {
      const url = getRequestUrl(input);

      if (url.includes("/api/metrics")) {
        return jsonResponse({
          snapshot: {
            timestamp: "2026-04-17T08:00:00.000Z",
            warnings: [],
            hostIp: "192.168.1.10",
            system: {
              cpuPercent: 18,
              loadAverage: [0.22, 0.3, 0.4],
              memoryPercent: 52,
              memoryUsedBytes: 33.2 * 1024 ** 3,
              memoryTotalBytes: 64 * 1024 ** 3,
            },
            network: {
              rxBytesPerSecond: 120_000,
              txBytesPerSecond: 72_000,
              interfaces: [
                {
                  name: "eth0",
                  rxBytesPerSecond: 120_000,
                  txBytesPerSecond: 72_000,
                },
              ],
            },
            containers: {
              running: 2,
              total: 2,
              cpuPercent: 12,
              memoryPercent: 9,
              memoryUsedBytes: 1.4 * 1024 ** 3,
              statusBreakdown: {
                healthy: 2,
                unhealthy: 0,
                stopped: 0,
              },
              top: [],
              all: [
                {
                  id: "runtime-marketing-web",
                  name: "vercelab-marketing-1234-web-1",
                  cpuPercent: 8,
                  memoryBytes: 512 * 1024 ** 2,
                  memoryPercent: 0.8,
                  networkRxBytesPerSecond: 18_000,
                  networkTxBytesPerSecond: 9_000,
                  networkTotalBytesPerSecond: 27_000,
                  diskReadBytesPerSecond: 0,
                  diskWriteBytesPerSecond: 6_000,
                  diskTotalBytesPerSecond: 6_000,
                  status: "running",
                  health: "healthy",
                  projectName: "vercelab-marketing-1234",
                  serviceName: "web",
                },
                {
                  id: "runtime-manual-redis",
                  name: "manual-redis",
                  cpuPercent: 4,
                  memoryBytes: 128 * 1024 ** 2,
                  memoryPercent: 0.2,
                  networkRxBytesPerSecond: 2_000,
                  networkTxBytesPerSecond: 1_000,
                  networkTotalBytesPerSecond: 3_000,
                  diskReadBytesPerSecond: 0,
                  diskWriteBytesPerSecond: 1_000,
                  diskTotalBytesPerSecond: 1_000,
                  status: "running",
                  health: "healthy",
                  projectName: null,
                  serviceName: null,
                },
              ],
            },
          },
          history: [],
          containerHistory: [],
          allContainerHistory: [],
        });
      }

      return jsonResponse({});
    });

    render(
      <WorkspaceShell
        initialDeployments={[
          {
            id: "dep-marketing",
            repositoryName: "dedkola/marketing-site",
            repositoryUrl: "https://github.com/dedkola/marketing-site.git",
            branch: "main",
            commitSha: null,
            appName: "Marketing Site",
            subdomain: "marketing",
            port: 3000,
            envVariables: null,
            serviceName: "web",
            status: "running",
            composeMode: "compose",
            projectName: "vercelab-marketing-1234",
            lastOutput: null,
            lastOperationSummary: null,
            updatedAt: "2026-04-17T08:00:00.000Z",
            deployedAt: "2026-04-17T07:55:00.000Z",
            tokenStored: false,
          },
        ]}
      />,
    );

    const managedAppRow = await screen.findByRole("button", {
      name: /marketing site \/ web.*healthy/i,
    });

    expect(managedAppRow).toBeVisible();
    expect(
      within(managedAppRow).getByText("vercelab-marketing-1234-web-1"),
    ).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: /manual-redis.*healthy/i,
      }),
    ).toBeVisible();
  });

  it("renders grouped all-container charts and lets the user change the range", async () => {
    const user = userEvent.setup();

    render(<WorkspaceShell />);

    expect(
      await screen.findByRole("heading", { name: /all containers/i }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: /^15 min$/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await waitFor(() =>
      expect(
        fetchSpy.mock.calls.some(([input]) => {
          const url = getRequestUrl(input);

          return (
            url.includes("/api/metrics?") &&
            url.includes("allContainers=true") &&
            url.includes("range=15m")
          );
        }),
      ).toBe(true),
    );

    await user.click(screen.getByRole("button", { name: /^24 h$/i }));

    expect(window.location.search).toBe("?range=24h");
    expect(screen.getByRole("button", { name: /^24 h$/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    expect(screen.getAllByText(/cpu load/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/memory load/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^network$/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/disk i\/o/i).length).toBeGreaterThan(0);
  });

  it("keeps the left sidebar live poll pinned to the current window", async () => {
    render(<WorkspaceShell initialDashboardRange="24h" />);

    await waitFor(() =>
      expect(
        fetchSpy.mock.calls.some(([input]) => {
          const url = getRequestUrl(input);

          return (
            url.includes("/api/metrics?") &&
            url.includes("mode=current") &&
            !url.includes("range=")
          );
        }),
      ).toBe(true),
    );
  });

  it("lets the user change the focused container history window and stores it in the URL", async () => {
    const user = userEvent.setup();

    render(<WorkspaceShell />);

    await user.click(
      await screen.findByRole("button", { name: /control-plane/i }),
    );

    expect(screen.getByRole("button", { name: /^15 min$/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await user.click(screen.getByRole("button", { name: /^24 h$/i }));

    expect(window.location.search).toBe("?range=24h");
    expect(screen.getByRole("button", { name: /^24 h$/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("pushes the matching route when the user switches workspace views", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<WorkspaceShell />);

    await user.click(
      screen.getByRole("button", {
        name: /git app page/i,
      }),
    );

    expect(pushMock).toHaveBeenCalledWith("/git-app-page");

    pushMock.mockReset();

    rerender(<WorkspaceShell initialView="git-app-page" />);

    await user.click(
      screen.getByRole("button", {
        name: /dashboard/i,
      }),
    );

    expect(pushMock).toHaveBeenCalledWith("/");
  });

  it("preserves the selected range when switching workspace views", async () => {
    const user = userEvent.setup();

    render(<WorkspaceShell initialDashboardRange="24h" />);

    await user.click(
      screen.getByRole("button", {
        name: /git app page/i,
      }),
    );

    expect(pushMock).toHaveBeenCalledWith("/git-app-page?range=24h");
  });

  it("prefetches the inactive workspace view and keeps the selected range", async () => {
    window.history.replaceState(null, "", "/?range=24h");

    render(<WorkspaceShell initialDashboardRange="24h" />);

    await waitFor(() => {
      expect(prefetchMock).toHaveBeenCalledWith("/git-app-page?range=24h");
    });
  });

  it("loads live sidebar history on the git app page first paint", async () => {
    const user = userEvent.setup();

    render(<WorkspaceShell initialView="git-app-page" />);

    const showMetricsButton = screen.queryByRole("button", {
      name: /show server load sidebar/i,
    });

    if (showMetricsButton) {
      await user.click(showMetricsButton);
    }

    expect(screen.getAllByText(/^host cpu$/i)[0]).toBeVisible();

    await waitFor(() => {
      expect(
        fetchSpy.mock.calls.some(
          ([input]) => getRequestUrl(input) === "/api/github/repos",
        ),
      ).toBe(true);
    });

    await waitFor(() => {
      expect(
        fetchSpy.mock.calls.some(([input]) => {
          const url = getRequestUrl(input);

          return (
            url.includes("/api/metrics?") &&
            url.includes("mode=current") &&
            url.includes("includeHistory=true") &&
            !url.includes("range=")
          );
        }),
      ).toBe(true);
    });
  });

  it("renders the git app page with editable deployment details", async () => {
    render(
      <WorkspaceShell
        baseDomain="example.com"
        initialDeployments={[
          {
            id: "dep-1",
            repositoryName: "dedkola/vercelab",
            repositoryUrl: "https://github.com/dedkola/vercelab.git",
            branch: "main",
            commitSha: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
            appName: "docs-app",
            subdomain: "docs",
            port: 3000,
            envVariables: "NODE_ENV=production",
            serviceName: "web",
            status: "running",
            composeMode: "dockerfile",
            projectName: "docs-app",
            lastOutput: "Deployment is healthy.",
            lastOperationSummary: "Redeployed from main successfully.",
            updatedAt: "2026-04-17T08:00:00.000Z",
            deployedAt: "2026-04-17T07:55:00.000Z",
            tokenStored: true,
          },
        ]}
        initialView="git-app-page"
      />,
    );

    expect(
      await screen.findByRole("heading", { name: /docs-app/i }),
    ).toBeVisible();
    expect(screen.queryByText(/focused app/i)).not.toBeInTheDocument();
    expect(screen.getByText(/current app snapshot/i)).toBeVisible();
    expect(screen.getByText(/editable runtime settings/i)).toBeVisible();
    expect(
      screen.getByRole("button", { name: /save and recreate/i }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: /^fetch$/i })).toBeVisible();
    expect(screen.getByDisplayValue("docs-app")).toBeVisible();
    expect(
      screen.getAllByRole("link", { name: "docs.example.com" })[0],
    ).toHaveAttribute("href", "https://docs.example.com");
    expect(screen.queryByText(/deploy mode/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /a1b2c3d/i })).toHaveAttribute(
      "href",
      "https://github.com/dedkola/vercelab/commit/a1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
    );

    const appRowButton = screen.getByRole("button", {
      name: /docs-app.*example\.com/i,
    });

    expect(
      within(appRowButton).queryByText("dedkola/vercelab"),
    ).not.toBeInTheDocument();
  });

  it("loads branches for the selected repository and lets the user choose one", async () => {
    const user = userEvent.setup();

    render(<WorkspaceShell initialView="git-app-page" />);

    await user.click(
      screen.getByRole("button", {
        name: /add git app/i,
      }),
    );

    const repositoryCombobox = await screen.findByRole("combobox", {
      name: /repository/i,
    });

    await user.click(repositoryCombobox);
    await user.click(await screen.findByText("dedkola/vercelab"));

    expect(
      await screen.findByText(/3 branches available for selection\./i),
    ).toBeVisible();

    const branchCombobox = screen.getByRole("combobox", {
      name: /branch/i,
    });

    expect(branchCombobox).toHaveTextContent("main");

    await user.click(branchCombobox);
    await user.click(await screen.findByText("release"));

    expect(branchCombobox).toHaveTextContent("release");
    expect(
      fetchSpy.mock.calls.some(([input]) =>
        getRequestUrl(input).includes(
          "/api/github/repos/dedkola/vercelab/branches",
        ),
      ),
    ).toBe(true);
  });
});
