import type { Metadata } from 'next';

import { WorkspaceShell } from './workspace-shell';
import { loadWorkspaceShellData } from '@/lib/workspace-shell-data';

export const metadata: Metadata = {
  title: 'Apps | Vercelab',
  description: 'Create, review, and update Git-backed app deployments.',
};

export const dynamic = 'force-dynamic';

type GitAppPageRouteProps = {
  searchParams?: Promise<{
    page?: string | string[];
    range?: string | string[];
  }>;
};

export default async function GitAppPageRoute({ searchParams }: GitAppPageRouteProps) {
  const pageData = await loadWorkspaceShellData(searchParams, 'git-app-page', {
    includeMetricsHistory: false,
    includeMetricsSnapshot: false,
  });

  return <WorkspaceShell {...pageData} embedded />;
}
