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
  'public/images/logo.svg',
  'public/images/logo.png',
  'public/img/logo.svg',
  'public/img/logo.png',
  'public/assets/logo.svg',
  'public/assets/logo.png',
  'public/logo192.png',
  'public/logo512.png',
  'public/apple-touch-icon.png',
  'public/android-chrome-512x512.png',
  'public/android-chrome-192x192.png',
  'public/favicon.svg',
  'public/favicon.png',
  'public/favicon-32x32.png',
  'public/favicon.ico',
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
  'src/assets/logo.webp',
  'logo.svg',
  'logo.png',
] as const;

/**
 * Directories scanned for loosely named icons (`logo-dark.svg`, `favicon-16x16.png`, ...) when
 * none of the well-known candidates exist.
 */
const DEPLOYMENT_ICON_DIRECTORIES = [
  'app',
  'src/app',
  'public',
  'public/images',
  'public/img',
  'public/assets',
  'static',
  'assets',
  'src/assets',
] as const;

const ICON_FILE_NAME_PATTERN = /^(?:logo|icon|favicon|apple-touch-icon|apple-icon)\b[\w.-]*$/i;
const ICON_FILE_NAME_PRIORITY = ['logo', 'icon', 'apple', 'favicon'] as const;

function compareRanks(left: readonly number[], right: readonly number[]) {
  for (let index = 0; index < left.length; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);

    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
}

/**
 * Picks the most logo-like image among `filePaths` (relative, `/`-separated) that sits directly
 * in one of DEPLOYMENT_ICON_DIRECTORIES. Prefers `logo*` over `icon*` over `favicon*`, SVG over
 * raster images, then the directory order above.
 */
export function pickLooseIconPath(filePaths: Iterable<string>): string | null {
  let best: { filePath: string; rank: [number, number, number] } | null = null;

  for (const filePath of filePaths) {
    const fileName = path.posix.basename(filePath);
    const directoryRank = (DEPLOYMENT_ICON_DIRECTORIES as readonly string[]).indexOf(
      path.posix.dirname(filePath)
    );

    if (
      directoryRank < 0 ||
      !ICON_FILE_NAME_PATTERN.test(fileName) ||
      !getDeploymentIconContentType(fileName)
    ) {
      continue;
    }

    const lowerFileName = fileName.toLowerCase();
    const rank: [number, number, number] = [
      ICON_FILE_NAME_PRIORITY.findIndex((prefix) => lowerFileName.startsWith(prefix)),
      path.posix.extname(lowerFileName) === '.svg' ? 0 : 1,
      directoryRank,
    ];

    if (!best || compareRanks(rank, best.rank) < 0) {
      best = { filePath, rank };
    }
  }

  return best?.filePath ?? null;
}

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

async function listLooseIconCandidates(workspacePath: string): Promise<string[]> {
  const filePaths = await Promise.all(
    DEPLOYMENT_ICON_DIRECTORIES.map(async (directory) => {
      try {
        const entries = await fs.readdir(
          /*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ workspacePath, directory),
          { withFileTypes: true }
        );

        return entries
          .filter((entry) => entry.isFile() || entry.isSymbolicLink())
          .map((entry) => `${directory}/${entry.name}`);
      } catch {
        return [];
      }
    })
  );
  const looseIconPath = pickLooseIconPath(filePaths.flat());

  return looseIconPath ? [looseIconPath] : [];
}

export async function findDeploymentIcon(workspacePath: string): Promise<DeploymentIcon | null> {
  let resolvedWorkspacePath: string;

  try {
    resolvedWorkspacePath = await fs.realpath(/*turbopackIgnore: true*/ workspacePath);
  } catch {
    return null;
  }

  const icon = await findFirstIcon(resolvedWorkspacePath, DEPLOYMENT_ICON_CANDIDATES);

  if (icon) {
    return icon;
  }

  return await findFirstIcon(
    resolvedWorkspacePath,
    await listLooseIconCandidates(resolvedWorkspacePath)
  );
}

async function findFirstIcon(
  resolvedWorkspacePath: string,
  relativePaths: readonly string[]
): Promise<DeploymentIcon | null> {
  for (const relativePath of relativePaths) {
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
