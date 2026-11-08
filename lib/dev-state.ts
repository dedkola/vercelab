import 'server-only';

import { getAppConfig } from '@/lib/app-config';
import { readDevContainerStates } from '@/lib/dev-engine';
import { listDevDeployments, listDevProjects } from '@/lib/dev-persistence';
import { getProxyProtocol } from '@/lib/dev-preview';
import type { DevState } from '@/lib/dev-types';

export async function loadDevState(): Promise<DevState> {
  const config = getAppConfig();
  const [projects, deployments, containerStates] = await Promise.all([
    listDevProjects(),
    listDevDeployments(),
    readDevContainerStates().catch(() => ({})),
  ]);

  return {
    baseDomain: config.baseDomain,
    previewProtocol: getProxyProtocol(config.proxy.entrypoint),
    githubTokenConfigured: Boolean(config.security.githubToken),
    projects,
    deployments,
    containerStates,
    loadedAt: new Date().toISOString(),
  };
}
