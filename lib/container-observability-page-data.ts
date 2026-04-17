import { getAppConfig } from "@/lib/app-config";
import {
  getMetricsHistoryFromInflux,
  type MetricsHistoryPoint,
} from "@/lib/influx-metrics";
import { listDashboardData, type DashboardDeployment } from "@/lib/persistence";
import { getMetricsSnapshot, type MetricsSnapshot } from "@/lib/system-metrics";

type ContainerObservabilitySearchParams = Promise<{
  page?: string | string[];
}>;

export type ContainerObservabilityPageData = {
  baseDomain: string;
  initialDeployments: DashboardDeployment[];
  initialHistory: MetricsHistoryPoint[];
  initialPage: "overview" | "apps";
  initialSnapshot: MetricsSnapshot | null;
};

function getSearchParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export async function loadContainerObservabilityPageData(
  searchParams?: ContainerObservabilitySearchParams,
): Promise<ContainerObservabilityPageData> {
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
    initialPage:
      getSearchParamValue(params?.page) === "apps" ? "apps" : "overview",
    initialSnapshot,
  };
}
