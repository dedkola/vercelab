import fs from 'node:fs/promises';

import { findDeploymentIcon } from '@/lib/deployment-icon';
import { getStoredDeploymentById } from '@/lib/persistence';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ deploymentId: string }> }
) {
  const { deploymentId } = await params;

  try {
    const deployment = await getStoredDeploymentById(deploymentId);
    const icon = await findDeploymentIcon(deployment.workspacePath);

    if (!icon) {
      return new Response(null, { status: 404 });
    }

    const contents = await fs.readFile(/*turbopackIgnore: true*/ icon.path);

    return new Response(new Uint8Array(contents), {
      headers: {
        'Cache-Control': 'private, max-age=3600, immutable',
        'Content-Length': String(icon.size),
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        'Content-Type': icon.contentType,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
