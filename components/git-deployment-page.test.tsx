import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { GitDeploymentPage } from "@/components/git-deployment-page";
import type { DashboardData } from "@/lib/persistence";
import { removeDeploymentAction } from "@/app/actions";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}));

vi.mock("@/components/dashboard-kit", () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

vi.mock("@/app/actions", () => ({
  fetchDeploymentFromGitAction: vi.fn(),
  redeployDeploymentAction: vi.fn(),
  removeDeploymentAction: vi.fn(),
  stopDeploymentAction: vi.fn(),
  updateDeploymentAction: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

function createDashboardData(): DashboardData {
  return {
    deployments: [
      {
        id: "dep-1",
        repositoryName: "my-repo",
        repositoryUrl: "https://github.com/ded/my-repo",
        branch: "main",
        appName: "My App",
        subdomain: "my-app",
        port: 3000,
        envVariables: null,
        serviceName: null,
        status: "running",
        composeMode: null,
        projectName: "my-app",
        lastOutput: null,
        lastOperationSummary: null,
        updatedAt: new Date().toISOString(),
        deployedAt: new Date().toISOString(),
        tokenStored: false,
      },
    ],
    stats: {
      totalDeployments: 1,
      runningDeployments: 1,
      failedDeployments: 0,
      totalRepositories: 1,
    },
    trends: [],
    recentActivity: [],
    statusDistribution: [],
    modeDistribution: [],
  };
}

describe("GitDeploymentPage delete flow", () => {
  it("optimistically shows removing state and removes app row without page reload", async () => {
    const user = userEvent.setup();
    const removeMock = vi.mocked(removeDeploymentAction);

    removeMock.mockResolvedValue({
      status: "success",
      message: "Removed My App.",
    });

    render(
      <GitDeploymentPage
        baseDomain="home.com"
        currentLogTab="build"
        dashboardData={createDashboardData()}
        initialDeploymentId={null}
        isLogsPanelCollapsed
      />,
    );

    const [deploymentToggleButton] = screen.getAllByRole("button", {
      name: /my app/i,
    });
    await user.click(deploymentToggleButton);
    await user.click(screen.getByRole("button", { name: /delete/i }));

    const confirmDeleteButton = screen.getByRole("button", {
      name: /confirm delete/i,
    });
    await user.click(confirmDeleteButton);

    await waitFor(() => {
      expect(removeMock).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("button", { name: /removing/i })).toBeVisible();
    });

    await waitFor(() => {
      expect(screen.queryByText("My App")).not.toBeInTheDocument();
      expect(
        screen.getByText("No deployments yet. Use Add app to create the first one."),
      ).toBeVisible();
      expect(screen.getByText("0 apps")).toBeVisible();
    });
  });
});
