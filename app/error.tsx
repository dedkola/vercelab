'use client';

import { Button } from '@/components/ui/button';
import { WorkspacePageState } from '@/components/workspace/workspace-page-state';

export default function ErrorPage({ retry }: { retry: () => void }) {
  return (
    <WorkspacePageState
      code="Workspace unavailable"
      title="Unable to load the workspace"
      description="Try again to reload the workspace. If it still fails, check the server connection."
      standalone
    >
      <Button onClick={retry}>Try again</Button>
    </WorkspacePageState>
  );
}
