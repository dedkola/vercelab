import MetricsDashboard from "@/components/metrics-dashboard";
import { getAppConfig } from "@/lib/app-config";
import { listDashboardData, type DashboardData } from "@/lib/persistence";

type HomeProps = {
  searchParams: Promise<{
    message?: string | string[];
    section?: string | string[];
    status?: string | string[];
  }>;
};

function getSearchParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function getEmptyDashboardData(): DashboardData {
  return {
    deployments: [],
    stats: {
      totalDeployments: 0,
      runningDeployments: 0,
      failedDeployments: 0,
      totalRepositories: 0,
    },
    trends: [],
    recentActivity: [],
    statusDistribution: [],
    modeDistribution: [],
  };
}

export default async function Home({ searchParams }: HomeProps) {
  const config = getAppConfig();
  const params = await searchParams;
  const dashboardData = await listDashboardData().catch((error) => {
    if (!config.runtime.uiDevMode) {
      throw error;
    }

    const message =
      error instanceof Error ? error.message : "Unknown database error.";

    console.warn(`[ui-dev-mode] Using empty dashboard data: ${message}`);
    return getEmptyDashboardData();
  });
  const activeSection =
    getSearchParamValue(params.section) === "git" ? "git" : "overview";
  const status = getSearchParamValue(params.status);
  const message = getSearchParamValue(params.message);

  return (
    <MetricsDashboard
      baseDomain={config.baseDomain}
      dashboardData={dashboardData}
      flashMessage={
        status === "success" || status === "error"
          ? {
              status,
              message: message ?? "",
            }
          : null
      }
      initialGithubToken={config.security.githubToken ?? ""}
      initialSection={activeSection}
    />
  );
}
