import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { getAppConfig } from '@/lib/app-config';
import { getStoredDeploymentById, type StoredDeployment } from '@/lib/persistence';

export const MAX_DEPLOYMENT_FILE_SIZE = 5 * 1024 * 1024;

const MANAGED_FILES_DIRECTORY = '.vercelab-files';
const RESERVED_FILE_NAMES = new Set([
  '.git',
  '.vercelab.base.compose.yml',
  '.vercelab.generated.compose.yml',
  '.vercelab.override.compose.yml',
]);

export type DeploymentFileSummary = {
  name: string;
  size: number;
  updatedAt: string;
};

function resolveRuntimePath(runtimePath: string) {
  return path.resolve(/*turbopackIgnore: true*/ runtimePath);
}

function assertPathWithin(parentPath: string, candidatePath: string, label: string) {
  const resolvedParent = resolveRuntimePath(parentPath);
  const resolvedCandidate = resolveRuntimePath(candidatePath);
  const relativePath = path.relative(resolvedParent, resolvedCandidate);
  const isWithinParent =
    relativePath.length > 0 && !relativePath.startsWith('..') && !path.isAbsolute(relativePath);

  if (!isWithinParent) {
    throw new Error(`Refusing to access ${label} outside its Vercelab directory.`);
  }
}

export function normalizeDeploymentFileName(value: string) {
  const normalized = value.trim();

  if (!normalized || normalized === '.' || normalized === '..') {
    throw new Error('Choose a file with a valid name.');
  }

  if (
    normalized.length > 180 ||
    normalized.includes('/') ||
    normalized.includes('\\') ||
    normalized.includes('\0') ||
    path.basename(normalized) !== normalized
  ) {
    throw new Error('Files must be uploaded to the app workspace root.');
  }

  if (RESERVED_FILE_NAMES.has(normalized.toLowerCase())) {
    throw new Error(`The file name "${normalized}" is reserved by Vercelab.`);
  }

  return normalized;
}

function getManagedFilesRoot(deploymentId: string) {
  const appsDirectory = getAppConfig().paths.appsDir;
  const managedRoot = path.join(
    /*turbopackIgnore: true*/ appsDirectory,
    MANAGED_FILES_DIRECTORY,
    deploymentId
  );

  assertPathWithin(appsDirectory, managedRoot, 'managed files');
  return managedRoot;
}

function getManagedFilePath(deploymentId: string, fileName: string) {
  const managedRoot = getManagedFilesRoot(deploymentId);
  const managedPath = path.join(/*turbopackIgnore: true*/ managedRoot, fileName);
  assertPathWithin(managedRoot, managedPath, 'managed file');
  return managedPath;
}

function assertWorkspacePath(deployment: StoredDeployment) {
  assertPathWithin(getAppConfig().paths.appsDir, deployment.workspacePath, 'deployment workspace');
}

async function pathExists(targetPath: string) {
  try {
    await fs.access(/*turbopackIgnore: true*/ targetPath);
    return true;
  } catch {
    return false;
  }
}

async function applyManagedFile(deployment: StoredDeployment, fileName: string) {
  assertWorkspacePath(deployment);

  if (!(await pathExists(deployment.workspacePath))) {
    return;
  }

  const managedPath = getManagedFilePath(deployment.id, fileName);
  const workspacePath = path.join(/*turbopackIgnore: true*/ deployment.workspacePath, fileName);
  assertPathWithin(deployment.workspacePath, workspacePath, 'workspace file');

  const existing = await fs.lstat(workspacePath).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') {
      return null;
    }

    throw error;
  });

  if (existing?.isDirectory()) {
    const directoryEntries = await fs.readdir(workspacePath);

    if (directoryEntries.length > 0) {
      throw new Error(
        `Cannot replace "${fileName}" because a non-empty directory exists there. Remove or rename that directory first.`
      );
    }

    try {
      await fs.rmdir(workspacePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOTEMPTY') {
        throw new Error(
          `Cannot replace "${fileName}" because a non-empty directory exists there. Remove or rename that directory first.`
        );
      }

      throw error;
    }
  }

  const temporaryPath = path.join(
    /*turbopackIgnore: true*/ deployment.workspacePath,
    `.vercelab-upload-${randomUUID()}`
  );

  try {
    await fs.copyFile(managedPath, temporaryPath);
    await fs.chmod(temporaryPath, 0o600);
    await fs.rename(temporaryPath, workspacePath);
  } finally {
    await fs.unlink(temporaryPath).catch(() => undefined);
  }
}

async function toDeploymentFileSummary(filePath: string, name: string) {
  const stats = await fs.stat(filePath);

  return {
    name,
    size: stats.size,
    updatedAt: stats.mtime.toISOString(),
  } satisfies DeploymentFileSummary;
}

export async function listDeploymentFiles(deploymentId: string) {
  await getStoredDeploymentById(deploymentId);
  const managedRoot = getManagedFilesRoot(deploymentId);
  const entries = await fs.readdir(managedRoot, { withFileTypes: true }).catch((error) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }

    throw error;
  });

  const files = await Promise.all(
    entries
      .filter((entry) => entry.isFile())
      .map((entry) =>
        toDeploymentFileSummary(
          path.join(/*turbopackIgnore: true*/ managedRoot, entry.name),
          entry.name
        )
      )
  );

  return files.sort((left, right) => left.name.localeCompare(right.name));
}

export async function saveDeploymentFile(
  deploymentId: string,
  originalFileName: string,
  contents: Uint8Array
) {
  const fileName = normalizeDeploymentFileName(originalFileName);

  if (contents.byteLength > MAX_DEPLOYMENT_FILE_SIZE) {
    throw new Error('File is too large. The maximum upload size is 5 MB.');
  }

  const deployment = await getStoredDeploymentById(deploymentId);
  const managedRoot = getManagedFilesRoot(deployment.id);
  const managedPath = getManagedFilePath(deployment.id, fileName);
  const temporaryPath = path.join(/*turbopackIgnore: true*/ managedRoot, `.upload-${randomUUID()}`);
  const previousContents = await fs.readFile(managedPath).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') {
      return null;
    }

    throw error;
  });
  let didStoreUpload = false;

  await fs.mkdir(managedRoot, { recursive: true, mode: 0o700 });

  try {
    await fs.writeFile(temporaryPath, contents, { flag: 'wx', mode: 0o600 });
    await fs.rename(temporaryPath, managedPath);
    didStoreUpload = true;
    await fs.chmod(managedPath, 0o600);
    await applyManagedFile(deployment, fileName);
    return await toDeploymentFileSummary(managedPath, fileName);
  } catch (error) {
    if (didStoreUpload) {
      if (previousContents) {
        await fs.writeFile(managedPath, previousContents, { mode: 0o600 });
      } else {
        await fs.unlink(managedPath).catch(() => undefined);
      }
    }

    throw error;
  } finally {
    await fs.unlink(temporaryPath).catch(() => undefined);
  }
}

export async function deleteDeploymentFile(deploymentId: string, originalFileName: string) {
  const fileName = normalizeDeploymentFileName(originalFileName);
  const deployment = await getStoredDeploymentById(deploymentId);
  const managedPath = getManagedFilePath(deployment.id, fileName);

  if (!(await pathExists(managedPath))) {
    throw new Error(`Managed file "${fileName}" was not found.`);
  }

  assertWorkspacePath(deployment);
  const workspacePath = path.join(/*turbopackIgnore: true*/ deployment.workspacePath, fileName);
  assertPathWithin(deployment.workspacePath, workspacePath, 'workspace file');

  const workspaceStats = await fs.lstat(workspacePath).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') {
      return null;
    }

    throw error;
  });
  const [managedContents, workspaceContents] = await Promise.all([
    fs.readFile(managedPath),
    workspaceStats?.isFile() ? fs.readFile(workspacePath) : Promise.resolve(null),
  ]);

  await fs.unlink(managedPath);

  if (workspaceContents?.equals(managedContents)) {
    await fs.unlink(workspacePath).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    });
  }

  await fs.rmdir(getManagedFilesRoot(deployment.id)).catch(() => undefined);
  return { name: fileName };
}

export async function applyDeploymentFiles(deployment: StoredDeployment) {
  const files = await listDeploymentFiles(deployment.id);

  for (const file of files) {
    await applyManagedFile(deployment, file.name);
  }

  return files;
}

export async function removeDeploymentFiles(deploymentId: string) {
  const managedRoot = getManagedFilesRoot(deploymentId);
  await fs.rm(managedRoot, { recursive: true, force: true });
}
