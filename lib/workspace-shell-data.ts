import { getAppConfig } from "@/lib/app-config";
import {
  getMetricsHistoryFromInflux,
  type MetricsHistoryPoint,
} from "@/lib/influx-metrics";
import { listDashboardData, type DashboardDeployment } from "@/lib/persistence";
import { getMetricsSnapshot, type MetricsSnapshot } from "@/lib/system-metrics";

type WorkspaceView = "dashboard" | "git-app-page";

type WorkspaceShellSearchParams = Promise<{
  page?: string | string[];
}>;

export type WorkspaceShellData = {
  baseDomain: string;
  initialDeployments: DashboardDeployment[];
  initialHistory: MetricsHistoryPoint[];
  initialView: WorkspaceView;
  initialSnapshot: MetricsSnapshot | null;
};

function getSearchParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function getInitialView(
  pageValue: string | string[] | undefined,
  defaultView: WorkspaceView,
): WorkspaceView {
  switch (getSearchParamValue(pageValue)) {
    case "git-app-page":
    case "apps":
      return "git-app-page";
    case "dashboard":
    case "overview":
      return "dashboard";
    default:
      return defaultView;
  }
}

export async function loadWorkspaceShellData(
  searchParams?: WorkspaceShellSearchParams,
  defaultView: WorkspaceView = "dashboard",
): Promise<WorkspaceShellData> {
  const params = searchParams ? await searchParams : undefined;
  const initialSnapshot = await getMetricsSnapshot().catch(() => null);
  const initialHistory = initialSnapshot
    ? await getMetricsHistoryFromInflux({
        hostIp: initialSnapshot.hostIp,
        limit: 48,
        bucketSeconds: 5,
      }).catch(() => [])
    : [];
  const dashboardData = await listDashboardData();

  return {
    baseDomain: getAppConfig().baseDomain,
    initialDeployments: dashboardData.deployments,
    initialHistory,
    initialView: getInitialView(params?.page, defaultView),
    initialSnapshot,
  };
}
