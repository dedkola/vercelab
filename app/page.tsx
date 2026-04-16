import MetricsDashboard from "@/components/metrics-dashboard";
import { getAppConfig } from "@/lib/app-config";
import { listDashboardData } from "@/lib/persistence";

export const dynamic = "force-dynamic";

type HomeProps = {
  searchParams: Promise<{
    deployment?: string | string[];
    logs?: string | string[];
    logTab?: string | string[];
    message?: string | string[];
    section?: string | string[];
    status?: string | string[];
  }>;
};

function getSearchParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;
  const dashboardData = await listDashboardData();
  const activeSection =
    getSearchParamValue(params.section) === "git" ? "git" : "overview";
  const initialGitDeploymentId = getSearchParamValue(params.deployment) ?? null;
  const initialRightPanelCollapsed =
    getSearchParamValue(params.logs) === "closed";
  const initialLogTab =
    getSearchParamValue(params.logTab) === "container"
      ? "container"
      : "build";

  return (
    <MetricsDashboard
      baseDomain={getAppConfig().baseDomain}
      dashboardData={dashboardData}
      initialSection={activeSection}
      initialGitDeploymentId={initialGitDeploymentId}
      initialLogTab={initialLogTab}
      initialRightPanelCollapsed={initialRightPanelCollapsed}
    />
  );
}
