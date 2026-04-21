import {
  getMetricsHistoryFromInflux,
  type MetricsHistoryPoint,
} from "@/lib/influx-metrics";
import { getMetricsSnapshot, type MetricsSnapshot } from "@/lib/system-metrics";

export type WorkspaceChromeData = {
  initialHistory: MetricsHistoryPoint[];
  initialSnapshot: MetricsSnapshot | null;
};

export async function loadWorkspaceChromeData(): Promise<WorkspaceChromeData> {
  const initialSnapshot = await getMetricsSnapshot().catch(() => null);

  if (!initialSnapshot) {
    return {
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
    initialHistory,
    initialSnapshot,
  };
}
