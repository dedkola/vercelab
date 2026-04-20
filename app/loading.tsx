import { WorkspaceRouteLoadingShell } from "@/components/workspace/workspace-route-loading";

export default function Loading() {
  return (
    <WorkspaceRouteLoadingShell
      description="Loading live infrastructure signals and workspace panels."
      label="Dashboard"
      title="Preparing workspace"
    />
  );
}
