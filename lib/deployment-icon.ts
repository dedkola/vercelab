import fs from 'node:fs/promises';
import path from 'node:path';

const MAX_DEPLOYMENT_ICON_BYTES = 2 * 1024 * 1024;

const DEPLOYMENT_ICON_CANDIDATES = [
  'app/icon.svg',
  'src/app/icon.svg',
  'app/icon.png',
  'src/app/icon.png',
  'app/icon.webp',
  'src/app/icon.webp',
  'app/icon.jpg',
  'src/app/icon.jpg',
  'app/icon.jpeg',
  'src/app/icon.jpeg',
  'app/icon.ico',
  'src/app/icon.ico',
  'app/apple-icon.png',
  'src/app/apple-icon.png',
  'app/apple-icon.jpg',
  'src/app/apple-icon.jpg',
  'app/apple-icon.jpeg',
  'src/app/apple-icon.jpeg',
  'app/favicon.ico',
  'src/app/favicon.ico',
  'public/logo.svg',
  'public/logo.png',
  'public/logo.webp',
  'public/logo.jpg',
  'public/logo.jpeg',
  'public/icon.svg',
  'public/icon.png',
  'public/icon.webp',
  'public/icon.jpg',
  'public/icon.jpeg',
  'public/favicon.ico',
  'public/favicon.svg',
  'public/favicon.png',
] as const;

const CONTENT_TYPES_BY_EXTENSION: Record<string, string> = {
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

export type DeploymentIcon = {
  contentType: string;
  path: string;
  size: number;
};

function isWithinDirectory(directoryPath: string, candidatePath: string) {
  const relativePath = path.relative(directoryPath, candidatePath);

  return relativePath !== '' && !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
}

export async function findDeploymentIcon(workspacePath: string): Promise<DeploymentIcon | null> {
  let resolvedWorkspacePath: string;

  try {
    resolvedWorkspacePath = await fs.realpath(/*turbopackIgnore: true*/ workspacePath);
  } catch {
    return null;
  }

  for (const relativePath of DEPLOYMENT_ICON_CANDIDATES) {
    const candidatePath = path.join(/*turbopackIgnore: true*/ resolvedWorkspacePath, relativePath);
    let resolvedCandidatePath: string;

    try {
      resolvedCandidatePath = await fs.realpath(/*turbopackIgnore: true*/ candidatePath);
    } catch {
      continue;
    }

    if (!isWithinDirectory(resolvedWorkspacePath, resolvedCandidatePath)) {
      continue;
    }

    const contentType =
      CONTENT_TYPES_BY_EXTENSION[path.extname(resolvedCandidatePath).toLowerCase()];

    if (!contentType) {
      continue;
    }

    try {
      const stat = await fs.stat(/*turbopackIgnore: true*/ resolvedCandidatePath);

      if (!stat.isFile() || stat.size === 0 || stat.size > MAX_DEPLOYMENT_ICON_BYTES) {
        continue;
      }

      return {
        contentType,
        path: resolvedCandidatePath,
        size: stat.size,
      };
    } catch {
      continue;
    }
  }

  return null;
}
