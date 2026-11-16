import type { Metadata } from 'next';

import { GitAppPageShell } from './git-app-page-shell';
import { getAppConfig } from '@/lib/app-config';
import { listDeploymentSummaries, type DeploymentSummary } from '@/lib/persistence';

export const metadata: Metadata = {
  title: 'Apps | Vercelab',
  description: 'Create, review, and update Git-backed app deployments.',
};

export const dynamic = 'force-dynamic';

export default async function GitAppPageRoute() {
  const initialDeployments = await listDeploymentSummaries().catch(() => [] as DeploymentSummary[]);

  return (
    <GitAppPageShell
      baseDomain={getAppConfig().baseDomain}
      initialDeployments={initialDeployments}
    />
  );
}
