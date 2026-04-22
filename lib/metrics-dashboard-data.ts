import { getAppConfig } from "@/lib/app-config";
import {
  getAllContainersMetricsHistoryFromInflux,
  getMetricsHistoryFromInflux,
  type AllContainersMetricsHistorySeries,
  type MetricsHistoryPoint,
} from "@/lib/influx-metrics";
import {
  getDashboardHistorySettings,
  normalizeDashboardRange,
  type DashboardRange,
} from "@/lib/metrics-range";
import {
  listDeploymentSummaries,
  type DeploymentSummary,
} from "@/lib/persistence";
import { getMetricsSnapshot, type MetricsSnapshot } from "@/lib/system-metrics";

type MetricsDashboardSearchParams = Promise<{
  range?: string | string[];
}>;

export type MetricsDashboardData = {
  influxExplorerUrl: string | null;
  initialAllContainerHistory: AllContainersMetricsHistorySeries[];
  initialDashboardRange: DashboardRange;
  initialDeployments: DeploymentSummary[];
  initialHistory: MetricsHistoryPoint[];
  initialSnapshot: MetricsSnapshot | null;
};

function getSearchParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export async function loadMetricsDashboardData(
  searchParams?: MetricsDashboardSearchParams,
): Promise<MetricsDashboardData> {
  const params = searchParams ? await searchParams : undefined;
  const initialDashboardRange = normalizeDashboardRange(
    getSearchParamValue(params?.range),
  );
  const { bucketSeconds, limit } = getDashboardHistorySettings(
    initialDashboardRange,
  );

  // Start deployments fetch immediately — it doesn't depend on the snapshot
  const deploymentsPromise = listDeploymentSummaries().catch(
    () => [] as DeploymentSummary[],
  );

  // Start snapshot fetch, then chain InfluxDB queries off it without waiting for deployments
  const snapshotPromise = getMetricsSnapshot().catch(() => null);

  const influxPromise = snapshotPromise.then((snapshot) => {
    if (!snapshot) {
      return [[], []] as [MetricsHistoryPoint[], AllContainersMetricsHistorySeries[]];
    }

    return Promise.all([
      getMetricsHistoryFromInflux({
        hostIp: snapshot.hostIp,
        limit,
        bucketSeconds,
      }).catch(() => [] as MetricsHistoryPoint[]),
      getAllContainersMetricsHistoryFromInflux({
        hostIp: snapshot.hostIp,
        limit,
        bucketSeconds,
      }).catch(() => [] as AllContainersMetricsHistorySeries[]),
    ]);
  });

  const [initialSnapshot, initialDeployments, [initialHistory, initialAllContainerHistory]] =
    await Promise.all([snapshotPromise, deploymentsPromise, influxPromise]);

  return {
    influxExplorerUrl: getAppConfig().metrics.influxExplorerUrl,
    initialAllContainerHistory,
    initialDashboardRange,
    initialDeployments,
    initialHistory,
    initialSnapshot,
  };
}
