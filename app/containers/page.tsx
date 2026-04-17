import type { Metadata } from "next";

import { ContainerObservabilityPage } from "@/components/container-observability-page";
import { loadContainerObservabilityPageData } from "@/lib/container-observability-page-data";

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

export default async function ContainersPage({
  searchParams,
}: ContainersPageProps) {
  const pageData = await loadContainerObservabilityPageData(searchParams);

  return <ContainerObservabilityPage {...pageData} />;
}
