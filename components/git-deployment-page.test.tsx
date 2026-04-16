import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  GitDeploymentPage,
  type GitView,
} from "@/components/git-deployment-page";
import type { DashboardData, DashboardDeployment } from "@/lib/persistence";
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

function GitDeploymentHarness({
  initialDeploymentId = null,
  initialView = "list",
}: {
  initialDeploymentId?: string | null;
  initialView?: GitView;
}) {
  const [deployments, setDeployments] = useState<DashboardDeployment[]>(
    createDashboardData().deployments,
  );
  const [activeDeploymentId, setActiveDeploymentId] = useState<string | null>(
    initialDeploymentId,
  );
  const [view, setView] = useState<GitView>(initialView);

  return (
    <GitDeploymentPage
      activeDeploymentId={activeDeploymentId}
      baseDomain="home.com"
      currentLogTab="build"
      currentView={view}
      deployments={deployments}
      isLogsPanelCollapsed
      onDeploymentSelectAction={setActiveDeploymentId}
      onDeploymentsChangeAction={setDeployments}
      onToggleLogsAction={setActiveDeploymentId}
      onViewChangeAction={setView}
    />
  );
}

describe("GitDeploymentPage workspace flow", () => {
  it("optimistically removes the app and returns to the list workspace", async () => {
    const user = userEvent.setup();
    const removeMock = vi.mocked(removeDeploymentAction);

    removeMock.mockResolvedValue({
      status: "success",
      message: "Removed My App.",
    });

    render(
      <GitDeploymentHarness initialDeploymentId="dep-1" initialView="detail" />,
    );

    await user.click(screen.getAllByRole("button", { name: /delete app/i })[0]);
    await user.click(screen.getByRole("button", { name: /confirm delete/i }));

    await waitFor(() => {
      expect(removeMock).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(
        screen.getByText(
          "Create the first app to open a dedicated management workspace.",
        ),
      ).toBeVisible();
      expect(screen.getByText("0 total deployments")).toBeVisible();
    });
  });

  it("navigates from the app list into the dedicated create workspace", async () => {
    const user = userEvent.setup();

    render(<GitDeploymentHarness />);

    await user.click(screen.getByRole("button", { name: /create app/i }));

    expect(screen.getByText("Create a new app workspace")).toBeVisible();
    expect(screen.getByText("Deployment settings")).toBeVisible();
    expect(screen.getByRole("button", { name: /^apps$/i })).toBeVisible();
  });
});
