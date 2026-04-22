import {
  getAllContainersMetricsHistoryFromInflux,
  type AllContainersMetricsHistorySeries,
} from "@/lib/influx-metrics";
import {
  listDeploymentSummaries,
  type DeploymentSummary,
} from "@/lib/persistence";
import { getMetricsSnapshot, type MetricsSnapshot } from "@/lib/system-metrics";

export type ContainersData = {
  initialAllContainerHistory: AllContainersMetricsHistorySeries[];
  initialDeployments: DeploymentSummary[];
  initialSnapshot: MetricsSnapshot | null;
};

export async function loadContainersData(): Promise<ContainersData> {
  const [initialSnapshot, initialDeployments] = await Promise.all([
    getMetricsSnapshot().catch(() => null),
    listDeploymentSummaries().catch(() => [] as DeploymentSummary[]),
  ]);

  if (!initialSnapshot) {
    return {
      initialAllContainerHistory: [],
      initialDeployments,
      initialSnapshot,
    };
  }

  const initialAllContainerHistory = await getAllContainersMetricsHistoryFromInflux(
    {
      bucketSeconds: 5,
      hostIp: initialSnapshot.hostIp,
      limit: 48,
    },
  ).catch(() => [] as AllContainersMetricsHistorySeries[]);

  return {
    initialAllContainerHistory,
    initialDeployments,
    initialSnapshot,
  };
}