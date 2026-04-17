import type { Metadata } from "next";

import { WorkspaceShell } from "@/components/workspace-shell";
import { loadWorkspaceShellData } from "@/lib/workspace-shell-data";

export const metadata: Metadata = {
  title: "Dashboard | Vercelab",
  description:
    "Dashboard view for live container metrics, host load, and deployment health.",
};

export const dynamic = "force-dynamic";

type DashboardPageProps = {
  searchParams?: Promise<{
    page?: string | string[];
    range?: string | string[];
  }>;
};

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  const pageData = await loadWorkspaceShellData(searchParams, "dashboard");

  return <WorkspaceShell {...pageData} />;
}
