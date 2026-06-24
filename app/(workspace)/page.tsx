import type { Metadata } from "next";

import { MetricsDashboardShell } from "@/components/metrics-dashboard-shell";
import { loadMetricsDashboardData } from "@/lib/metrics-dashboard-data";

export const metadata: Metadata = {
  title: "Dashboard | Vercelab",
  description:
    "Live dashboard for host load, container activity, and infrastructure metrics.",
};

export const dynamic = "force-dynamic";

type HomeProps = {
  searchParams?: Promise<{
    page?: string | string[];
    range?: string | string[];
  }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const pageData = await loadMetricsDashboardData(searchParams, {
    includeMetricsSnapshot: false,
  });

  return <MetricsDashboardShell {...pageData} embedded />;
}
