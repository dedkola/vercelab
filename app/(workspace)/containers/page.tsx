import type { Metadata } from "next";

import { ContainersShell } from "@/components/containers-shell";
import { loadContainersData } from "@/lib/containers-data";

export const metadata: Metadata = {
  title: "Containers | Vercelab",
  description:
    "Container inventory and runtime management surface for system services and managed workloads.",
};

export const dynamic = "force-dynamic";

export default async function ContainersPage() {
  const pageData = await loadContainersData({
    includeMetricsSnapshot: false,
  });

  return <ContainersShell {...pageData} />;
}