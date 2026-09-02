import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  applyDeploymentFiles,
  deleteDeploymentFile,
  listDeploymentFiles,
  MAX_DEPLOYMENT_FILE_SIZE,
  normalizeDeploymentFileName,
  saveDeploymentFile,
} from '@/lib/deployment-files';
import type { StoredDeployment } from '@/lib/persistence';

const testState = vi.hoisted(() => ({
  appsDirectory: '',
  deployment: null as unknown,
}));

vi.mock('@/lib/app-config', () => ({
  getAppConfig: () => ({
    paths: {
      appsDir: testState.appsDirectory,
    },
  }),
}));

vi.mock('@/lib/persistence', () => ({
  getStoredDeploymentById: vi.fn(async () => testState.deployment),
}));

describe('deployment files', () => {
  let temporaryDirectory: string;
  let workspacePath: string;

  beforeEach(async () => {
    temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'vercelab-files-'));
    testState.appsDirectory = path.join(temporaryDirectory, 'apps');
    workspacePath = path.join(testState.appsDirectory, 'deployment-1');
    await fs.mkdir(workspacePath, { recursive: true });
    testState.deployment = {
      id: 'deployment-1',
      workspacePath,
    } satisfies Pick<StoredDeployment, 'id' | 'workspacePath'>;
  });

  afterEach(async () => {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  });

  it('accepts root dotfiles but rejects traversal and Vercelab runtime files', () => {
    expect(normalizeDeploymentFileName('.env')).toBe('.env');
    expect(normalizeDeploymentFileName('k3s.config')).toBe('k3s.config');
    expect(() => normalizeDeploymentFileName('../.env')).toThrow(/workspace root/i);
    expect(() => normalizeDeploymentFileName('config/.env')).toThrow(/workspace root/i);
    expect(() => normalizeDeploymentFileName('.vercelab.base.compose.yml')).toThrow(/reserved/i);
  });

  it('persists an uploaded file and reapplies it after the workspace is recreated', async () => {
    const contents = new TextEncoder().encode('API_TOKEN=secret\n');

    await saveDeploymentFile('deployment-1', '.env', contents);

    expect(await fs.readFile(path.join(workspacePath, '.env'), 'utf8')).toBe('API_TOKEN=secret\n');
    expect(await listDeploymentFiles('deployment-1')).toEqual([
      expect.objectContaining({
        name: '.env',
        size: contents.byteLength,
      }),
    ]);

    await fs.rm(workspacePath, { recursive: true, force: true });
    await fs.mkdir(workspacePath, { recursive: true });
    await applyDeploymentFiles(testState.deployment as StoredDeployment);

    expect(await fs.readFile(path.join(workspacePath, '.env'), 'utf8')).toBe('API_TOKEN=secret\n');
  });

  it('removes the workspace copy only when it still matches the managed file', async () => {
    await saveDeploymentFile('deployment-1', '.env', new TextEncoder().encode('FIRST=1\n'));
    await deleteDeploymentFile('deployment-1', '.env');

    await expect(fs.access(path.join(workspacePath, '.env'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect(await listDeploymentFiles('deployment-1')).toEqual([]);

    await saveDeploymentFile('deployment-1', '.env', new TextEncoder().encode('FIRST=1\n'));
    await fs.writeFile(path.join(workspacePath, '.env'), 'REPOSITORY=changed\n', 'utf8');
    await deleteDeploymentFile('deployment-1', '.env');

    expect(await fs.readFile(path.join(workspacePath, '.env'), 'utf8')).toBe(
      'REPOSITORY=changed\n'
    );
  });

  it('rejects files larger than the configured limit', async () => {
    await expect(
      saveDeploymentFile('deployment-1', 'large.bin', new Uint8Array(MAX_DEPLOYMENT_FILE_SIZE + 1))
    ).rejects.toThrow(/maximum upload size is 5 MB/i);
  });
});
