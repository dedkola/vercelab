import fs from 'node:fs/promises';

import { getAppConfig } from '@/lib/app-config';
import { decryptSecret } from '@/lib/crypto';
import { findDeploymentIcon } from '@/lib/deployment-icon';
import { getStoredDeploymentById } from '@/lib/persistence';
import { fetchRepositoryIcon } from '@/lib/repository-icon';

export const dynamic = 'force-dynamic';

function createIconResponse(
  body: Uint8Array<ArrayBuffer>,
  contentType: string,
  maxAge: number,
  immutable = false
) {
  return new Response(body, {
    headers: {
      'Cache-Control': `private, max-age=${maxAge}${immutable ? ', immutable' : ''}`,
      'Content-Length': String(body.byteLength),
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      'Content-Type': contentType,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function getConfiguredGitHubToken() {
  try {
    return getAppConfig().security.githubToken;
  } catch {
    return null;
  }
}

function readDeploymentToken(encryptedToken: string | null) {
  try {
    return decryptSecret(encryptedToken);
  } catch {
    return null;
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ deploymentId: string }> }
) {
  const { deploymentId } = await params;

  try {
    const deployment = await getStoredDeploymentById(deploymentId);
    const icon = await findDeploymentIcon(deployment.workspacePath);

    if (icon) {
      const contents = await fs.readFile(/*turbopackIgnore: true*/ icon.path);

      return createIconResponse(new Uint8Array(contents), icon.contentType, 3600, true);
    }

    const repositoryIcon = await fetchRepositoryIcon(deployment.repositoryUrl, {
      token: readDeploymentToken(deployment.encryptedToken) ?? getConfiguredGitHubToken(),
    });

    if (!repositoryIcon) {
      return new Response(null, { status: 404 });
    }

    return createIconResponse(repositoryIcon.body, repositoryIcon.contentType, 600);
  } catch {
    return new Response(null, { status: 404 });
  }
}
