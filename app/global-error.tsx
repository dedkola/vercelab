'use client';

import './globals.css';

import { Button } from '@/components/ui/button';
import { WorkspacePageState } from '@/components/workspace/workspace-page-state';

export default function GlobalError({ retry }: { retry: () => void }) {
  return (
    <html lang="en">
      <body>
        <WorkspacePageState
          code="Workspace unavailable"
          title="Unable to open Vercelab"
          description="Try again to reload the workspace. If it still fails, check the server connection."
          standalone
        >
          <Button onClick={retry}>Try again</Button>
        </WorkspacePageState>
      </body>
    </html>
  );
}
