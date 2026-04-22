import { getAppConfig } from "@/lib/app-config";
import {
  getMetricsHistoryFromInflux,
  type MetricsHistoryPoint,
} from "@/lib/influx-metrics";
import { getMetricsSnapshot, type MetricsSnapshot } from "@/lib/system-metrics";

export type WorkspaceChromeData = {
  influxExplorerUrl: string | null;
  initialHistory: MetricsHistoryPoint[];
  initialSnapshot: MetricsSnapshot | null;
};

type WorkspaceChromeDataOptions = {
  includeMetricsSnapshot?: boolean;
};

export async function loadWorkspaceChromeData(
  options?: WorkspaceChromeDataOptions,
): Promise<WorkspaceChromeData> {
  const includeMetricsSnapshot = options?.includeMetricsSnapshot ?? true;
  const influxExplorerUrl = getAppConfig().metrics.influxExplorerUrl;
  const initialSnapshot = includeMetricsSnapshot ? await getMetricsSnapshot().catch(() => null) : null;

  if (!initialSnapshot) {
    return {
      influxExplorerUrl,
      initialHistory: [],
      initialSnapshot,
    };
  }

  const initialHistory = await getMetricsHistoryFromInflux({
    hostIp: initialSnapshot.hostIp,
    limit: 48,
    bucketSeconds: 5,
  }).catch(() => [] as MetricsHistoryPoint[]);

  return {
    influxExplorerUrl,
    initialHistory,
    initialSnapshot,
  };
}
