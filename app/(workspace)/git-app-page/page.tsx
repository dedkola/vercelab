import type { Metadata } from "next";

import { WorkspaceShell } from "@/components/workspace-shell";
import { loadWorkspaceShellData } from "@/lib/workspace-shell-data";

export const metadata: Metadata = {
  title: "Git App Page | Vercelab",
  description:
    "Git app page for creating, reviewing, and updating repository deployments.",
};

export const dynamic = "force-dynamic";

type GitAppPageRouteProps = {
  searchParams?: Promise<{
    page?: string | string[];
    range?: string | string[];
  }>;
};

export default async function GitAppPageRoute({
  searchParams,
}: GitAppPageRouteProps) {
  const pageData = await loadWorkspaceShellData(searchParams, "git-app-page", {
    includeMetricsHistory: false,
  });

  return <WorkspaceShell {...pageData} embedded />;
}
