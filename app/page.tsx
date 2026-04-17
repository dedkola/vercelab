import MetricsDashboard from "@/components/metrics-dashboard";
import { getAppConfig } from "@/lib/app-config";
import { listDashboardData } from "@/lib/persistence";
import type { GitView } from "@/components/git-deployment-page";

export const dynamic = "force-dynamic";

type HomeProps = {
  searchParams: Promise<{
    deployment?: string | string[];
    gitView?: string | string[];
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

function getInitialGitView(
  value: string | undefined,
  deploymentId: string | null,
): GitView {
  if (value === "create") {
    return "create";
  }

  if (value === "detail") {
    return deploymentId ? "detail" : "list";
  }

  if (deploymentId) {
    return "detail";
  }

  return "list";
}

export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;
  const dashboardData = await listDashboardData();
  const sectionParam = getSearchParamValue(params.section);
  const activeSection =
    sectionParam === "git"
      ? "git"
      : sectionParam === "charts"
        ? "charts"
        : "overview";
  const initialGitDeploymentId = getSearchParamValue(params.deployment) ?? null;
  const initialGitView = getInitialGitView(
    getSearchParamValue(params.gitView),
    initialGitDeploymentId,
  );
  const initialRightPanelCollapsed =
    getSearchParamValue(params.logs) === "closed";
  const initialLogTab =
    getSearchParamValue(params.logTab) === "container" ? "container" : "build";

  return (
    <MetricsDashboard
      baseDomain={getAppConfig().baseDomain}
      dashboardData={dashboardData}
      initialSection={activeSection}
      initialGitDeploymentId={initialGitDeploymentId}
      initialGitView={initialGitView}
      initialLogTab={initialLogTab}
      initialRightPanelCollapsed={initialRightPanelCollapsed}
    />
  );
}
