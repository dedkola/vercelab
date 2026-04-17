import { WorkspaceShell } from "@/components/workspace-shell";
import { loadWorkspaceShellData } from "@/lib/workspace-shell-data";

export const dynamic = "force-dynamic";

type HomeProps = {
  searchParams?: Promise<{
    page?: string | string[];
    range?: string | string[];
  }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const pageData = await loadWorkspaceShellData(searchParams, "dashboard");

  return <WorkspaceShell {...pageData} />;
}
