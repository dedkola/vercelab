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

type WorkspaceView = "dashboard" | "git-app-page";

type WorkspaceShellSearchParams = Promise<{
  page?: string | string[];
  range?: string | string[];
}>;

export type WorkspaceShellData = {
  baseDomain: string;
  initialContainerHistory: ContainerMetricsHistoryPoint[];
  initialDashboardRange: DashboardRange;
  initialDeployments: DeploymentSummary[];
  initialHistory: MetricsHistoryPoint[];
  initialView: WorkspaceView;
  initialSnapshot: MetricsSnapshot | null;
};

type WorkspaceShellDataOptions = {
  includeMetricsHistory?: boolean;
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
  options?: WorkspaceShellDataOptions,
): Promise<WorkspaceShellData> {
  const params = searchParams ? await searchParams : undefined;
  const initialDashboardRange = normalizeDashboardRange(
    getSearchParamValue(params?.range),
  );
  const includeMetricsHistory = options?.includeMetricsHistory ?? true;
  const [initialSnapshot, initialDeployments] = await Promise.all([
    getMetricsSnapshot().catch(() => null),
    listDeploymentSummaries().catch(() => [] as DeploymentSummary[]),
  ]);
  const initialFocusedContainer = initialSnapshot?.containers.all[0] ?? null;
  const [initialHistory, initialContainerHistory] =
    includeMetricsHistory && initialSnapshot
      ? await Promise.all([
          getMetricsHistoryFromInflux({
            hostIp: initialSnapshot.hostIp,
            limit: 48,
            bucketSeconds: 5,
          }).catch(() => [] as MetricsHistoryPoint[]),
          initialFocusedContainer
            ? (() => {
                const { bucketSeconds, limit } = getDashboardHistorySettings(
                  initialDashboardRange,
                );

                return getContainerMetricsHistoryFromInflux({
                  hostIp: initialSnapshot.hostIp,
                  containerId: initialFocusedContainer.id,
                  containerName: initialFocusedContainer.name,
                  limit,
                  bucketSeconds,
                }).catch(() => [] as ContainerMetricsHistoryPoint[]);
              })()
            : Promise.resolve([] as ContainerMetricsHistoryPoint[]),
        ])
      : ([[], []] as [MetricsHistoryPoint[], ContainerMetricsHistoryPoint[]]);

  return {
    baseDomain: getAppConfig().baseDomain,
    initialContainerHistory,
    initialDashboardRange,
    initialDeployments,
    initialHistory,
    initialView: getInitialView(params?.page, defaultView),
    initialSnapshot,
  };
}
