'use client';

import { Button } from '@/components/ui/button';
import { WorkspacePageState } from '@/components/workspace/workspace-page-state';

export default function WorkspaceError({ retry }: { retry: () => void }) {
  return (
    <WorkspacePageState
      code="Page unavailable"
      title="Unable to load this page"
      description="Try again to reload this view, or return to the overview."
    >
      <Button onClick={retry}>Try again</Button>
    </WorkspacePageState>
  );
}
