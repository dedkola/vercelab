import type { Metadata } from "next";

import { ContainerObservabilityPage } from "@/components/container-observability-page";
import { getAppConfig } from "@/lib/app-config";
import { getMetricsHistoryFromInflux } from "@/lib/influx-metrics";
import { listDashboardData } from "@/lib/persistence";
import { getMetricsSnapshot } from "@/lib/system-metrics";

export const metadata: Metadata = {
  title: "Workspace | Vercelab",
  description:
    "Unified control-plane workspace with live container metrics and GitHub apps.",
};

export const dynamic = "force-dynamic";

type ContainersPageProps = {
  searchParams?: Promise<{
    page?: string | string[];
  }>;
};

function getSearchParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ContainersPage({
  searchParams,
}: ContainersPageProps) {
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

  return (
    <ContainerObservabilityPage
      baseDomain={getAppConfig().baseDomain}
      initialDeployments={dashboardData.deployments}
      initialHistory={initialHistory}
      initialPage={getSearchParamValue(params?.page) === "apps" ? "apps" : "overview"}
      initialSnapshot={initialSnapshot}
    />
  );
}
