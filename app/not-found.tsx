import { WorkspacePageState } from '@/components/workspace/workspace-page-state';

export default function NotFound() {
  return (
    <WorkspacePageState
      code="404 / Page not found"
      title="This page is unavailable"
      description="The address may have changed. Return to the overview to find your apps and containers."
      standalone
    />
  );
}
