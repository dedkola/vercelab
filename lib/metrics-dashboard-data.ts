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
import { getMetricsSnapshot, type MetricsSnapshot } from "@/lib/system-metrics";

type MetricsDashboardSearchParams = Promise<{
  range?: string | string[];
}>;

export type MetricsDashboardData = {
  initialAllContainerHistory: AllContainersMetricsHistorySeries[];
  initialDashboardRange: DashboardRange;
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
  const initialSnapshot = await getMetricsSnapshot().catch(() => null);

  if (!initialSnapshot) {
    return {
      initialAllContainerHistory: [],
      initialDashboardRange,
      initialHistory: [],
      initialSnapshot,
    };
  }

  const [initialHistory, initialAllContainerHistory] = await Promise.all([
    getMetricsHistoryFromInflux({
      hostIp: initialSnapshot.hostIp,
      limit,
      bucketSeconds,
    }).catch(() => [] as MetricsHistoryPoint[]),
    getAllContainersMetricsHistoryFromInflux({
      hostIp: initialSnapshot.hostIp,
      limit,
      bucketSeconds,
    }).catch(() => [] as AllContainersMetricsHistorySeries[]),
  ]);

  return {
    initialAllContainerHistory,
    initialDashboardRange,
    initialHistory,
    initialSnapshot,
  };
}
