import { WorkspaceRouteLoadingShell } from "@/components/workspace/workspace-route-loading";

export default function Loading() {
  return (
    <WorkspaceRouteLoadingShell
      description="Loading deployment controls, repository wiring, and live app details."
      label="Git App Page"
      title="Opening deployment workspace"
    />
  );
}
