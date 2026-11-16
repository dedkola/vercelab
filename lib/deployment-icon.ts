import fs from 'node:fs/promises';
import path from 'node:path';

export const MAX_DEPLOYMENT_ICON_BYTES = 2 * 1024 * 1024;

export const DEPLOYMENT_ICON_CANDIDATES = [
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
  'static/logo.svg',
  'static/logo.png',
  'static/logo.webp',
  'static/icon.svg',
  'static/icon.png',
  'static/favicon.ico',
  'static/favicon.svg',
  'static/favicon.png',
  'assets/logo.svg',
  'assets/logo.png',
  'src/images/logo.svg',
  'src/images/logo.png',
  'src/assets/logo.svg',
  'src/assets/logo.png',
  'logo.svg',
  'logo.png',
] as const;

const CONTENT_TYPES_BY_EXTENSION: Record<string, string> = {
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

export function getDeploymentIconContentType(filePath: string): string | null {
  return CONTENT_TYPES_BY_EXTENSION[path.extname(filePath).toLowerCase()] ?? null;
}

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

    const contentType = getDeploymentIconContentType(resolvedCandidatePath);

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
