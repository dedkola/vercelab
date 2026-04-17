import { render, screen, within } from "@testing-library/react";
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
    refresh: vi.fn(),
  }),
}));

describe("WorkspaceShell", () => {
  const fetchSpy = vi.spyOn(global, "fetch");

  beforeEach(() => {
    fetchSpy.mockImplementation(async (input) => {
      const url = getRequestUrl(input);

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
                status: "running",
                health: "healthy",
                projectName: "vercelab",
                serviceName: "control-plane",
              },
              {
                id: "runtime-edge-proxy",
                name: "edge-proxy",
                cpuPercent: 9,
                memoryBytes: 186 * 1024 ** 2,
                memoryPercent: 0.3,
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
      });
    });
  });

  afterEach(() => {
    fetchSpy.mockReset();
  });

  afterAll(() => {
    fetchSpy.mockRestore();
  });

  it("renders the workspace shell and selected container details", async () => {
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
      screen.getByRole("heading", { name: /control-plane/i }),
    ).toBeVisible();
    expect(screen.getAllByText(/^dashboard$/i)[0]).toBeVisible();
    expect(screen.getByText(/current container signals/i)).toBeVisible();
    expect(screen.getByText(/tail preview/i)).toBeVisible();
    expect(
      await screen.findByText(/3 running containers on 192\.168\.1\.10\./i),
    ).toBeVisible();
    expect(screen.getAllByText(/3\s+running/i)[0]).toBeVisible();
  });

  it("shows live runtime status in the containers sidebar", async () => {
    render(<WorkspaceShell />);

    expect(
      await screen.findByRole("button", {
        name: /postgres-primary.*unhealthy/i,
      }),
    ).toBeVisible();
    expect(screen.getByText(/4 visible/i)).toBeVisible();
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
    expect(screen.getByText(/current app signals/i)).toBeVisible();
    expect(screen.getAllByDisplayValue(/docs/i)[0]).toBeVisible();
    expect(screen.getByText(/settings and environment/i)).toBeVisible();
    expect(
      screen.getByRole("link", { name: "https://docs.example.com" }),
    ).toHaveAttribute("href", "https://docs.example.com");
    expect(screen.queryByText(/deploy mode/i)).not.toBeInTheDocument();

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
