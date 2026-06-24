import { getAppConfig } from "@/lib/app-config";
import {
  getContainerMetricsHistoryFromInflux,
  getMetricsHistoryFromInflux,
  type ContainerMetricsHistoryPoint,
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

type WorkspaceView = "dashboard" | "git-app-page" | "containers";

type WorkspaceShellSearchParams = Promise<{
  page?: string | string[];
  range?: string | string[];
}>;

export type WorkspaceShellData = {
  baseDomain: string;
  influxExplorerUrl: string | null;
  initialContainerHistory: ContainerMetricsHistoryPoint[];
  initialDashboardRange: DashboardRange;
  initialDeployments: DeploymentSummary[];
  initialHistory: MetricsHistoryPoint[];
  initialView: WorkspaceView;
  initialSnapshot: MetricsSnapshot | null;
};

type WorkspaceShellDataOptions = {
  includeMetricsHistory?: boolean;
  includeMetricsSnapshot?: boolean;
};

function getSearchParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function getInitialView(
  pageValue: string | string[] | undefined,
  defaultView: WorkspaceView,
): WorkspaceView {
  switch (getSearchParamValue(pageValue)) {
    case "containers":
      return "containers";
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
  options?: WorkspaceShellDataOptions,
): Promise<WorkspaceShellData> {
  const params = searchParams ? await searchParams : undefined;
  const initialDashboardRange = normalizeDashboardRange(
    getSearchParamValue(params?.range),
  );
  const includeMetricsHistory = options?.includeMetricsHistory ?? true;
  const includeMetricsSnapshot = options?.includeMetricsSnapshot ?? true;

  // Start deployments fetch immediately — it doesn't need the snapshot
  const deploymentsPromise = listDeploymentSummaries().catch(
    () => [] as DeploymentSummary[],
  );

  const snapshotPromise = includeMetricsSnapshot ? getMetricsSnapshot().catch(() => null) : Promise.resolve(null);

  // Chain InfluxDB queries off the snapshot as soon as hostIp is known,
  // without waiting for deploymentsPromise
  const influxPromise: Promise<
    [MetricsHistoryPoint[], ContainerMetricsHistoryPoint[]]
  > = includeMetricsHistory
    ? snapshotPromise.then((snapshot) => {
        if (!snapshot) {
          return [[], []];
        }

        const initialFocusedContainer = snapshot.containers.all[0] ?? null;
        const { bucketSeconds, limit } =
          getDashboardHistorySettings(initialDashboardRange);

        return Promise.all([
          getMetricsHistoryFromInflux({
            hostIp: snapshot.hostIp,
            limit: 48,
            bucketSeconds: 5,
            ...(snapshot.network.interfaces[0]?.name
              ? { networkInterfaceName: snapshot.network.interfaces[0].name }
              : {}),
          }).catch(() => [] as MetricsHistoryPoint[]),
          initialFocusedContainer
            ? getContainerMetricsHistoryFromInflux({
                hostIp: snapshot.hostIp,
                containerId: initialFocusedContainer.id,
                containerName: initialFocusedContainer.name,
                limit,
                bucketSeconds,
              }).catch(() => [] as ContainerMetricsHistoryPoint[])
            : Promise.resolve([] as ContainerMetricsHistoryPoint[]),
        ]);
      })
    : Promise.resolve([[], []] as [
        MetricsHistoryPoint[],
        ContainerMetricsHistoryPoint[],
      ]);

  const [
    initialSnapshot,
    initialDeployments,
    [initialHistory, initialContainerHistory],
  ] = await Promise.all([snapshotPromise, deploymentsPromise, influxPromise]);

  return {
    baseDomain: getAppConfig().baseDomain,
    influxExplorerUrl: getAppConfig().metrics.influxExplorerUrl,
    initialContainerHistory,
    initialDashboardRange,
    initialDeployments,
    initialHistory,
    initialView: getInitialView(params?.page, defaultView),
    initialSnapshot,
  };
}
