import { WorkspaceChromeShell } from "@/components/workspace/workspace-chrome-shell";
import { loadWorkspaceChromeData } from "@/lib/workspace-chrome-data";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const chromeData = await loadWorkspaceChromeData({
    includeMetricsSnapshot: false,
  });

  return (
    <WorkspaceChromeShell {...chromeData}>{children}</WorkspaceChromeShell>
  );
}
