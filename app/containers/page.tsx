import type { Metadata } from "next";

import { ContainerObservabilityPage } from "@/components/container-observability-page";
import { getMetricsHistoryFromInflux } from "@/lib/influx-metrics";
import { getMetricsSnapshot } from "@/lib/system-metrics";

export const metadata: Metadata = {
  title: "Containers | Vercelab",
  description: "Live container operations workspace with realtime host metrics.",
};

export const dynamic = "force-dynamic";

export default async function ContainersPage() {
  const initialSnapshot = await getMetricsSnapshot().catch(() => null);
  const initialHistory = initialSnapshot
    ? await getMetricsHistoryFromInflux({
        hostIp: initialSnapshot.hostIp,
        limit: 48,
        bucketSeconds: 5,
      }).catch(() => [])
    : [];

  return (
    <ContainerObservabilityPage
      initialHistory={initialHistory}
      initialSnapshot={initialSnapshot}
    />
  );
}
