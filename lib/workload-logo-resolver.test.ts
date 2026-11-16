import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  decryptSecret: vi.fn(),
  fetchRepositoryIcon: vi.fn(),
  findDeploymentIcon: vi.fn(),
  getAppConfig: vi.fn(),
  getDevDeploymentById: vi.fn(),
  getDevProjectById: vi.fn(),
  getStoredDeploymentById: vi.fn(),
  inspectContainer: vi.fn(),
  listDeploymentSummaries: vi.fn(),
}));

vi.mock('@/lib/app-config', () => ({ getAppConfig: mocks.getAppConfig }));
vi.mock('@/lib/container-inspect', () => ({ inspectContainer: mocks.inspectContainer }));
vi.mock('@/lib/crypto', () => ({ decryptSecret: mocks.decryptSecret }));
vi.mock('@/lib/deployment-icon', () => ({ findDeploymentIcon: mocks.findDeploymentIcon }));
vi.mock('@/lib/dev-persistence', () => ({
  getDevDeploymentById: mocks.getDevDeploymentById,
  getDevProjectById: mocks.getDevProjectById,
}));
vi.mock('@/lib/persistence', () => ({
  getStoredDeploymentById: mocks.getStoredDeploymentById,
  listDeploymentSummaries: mocks.listDeploymentSummaries,
}));
vi.mock('@/lib/repository-icon', () => ({ fetchRepositoryIcon: mocks.fetchRepositoryIcon }));

import type { ContainerInspectData } from '@/lib/container-inspect';
import { resolveWorkloadLogo } from '@/lib/workload-logo-resolver';

const workspaceIconPath = path.join(os.tmpdir(), `vercelab-workload-icon-${process.pid}.svg`);

function createContainer(overrides: Partial<ContainerInspectData> = {}): ContainerInspectData {
  return {
    appPort: null,
    envVars: [],
    id: 'container-id',
    image: 'acme/custom:latest',
    imageVersion: 'latest',
    labels: {},
    name: 'custom',
    portBindings: [],
    traefikMethod: null,
    traefikPort: null,
    traefikRouterName: null,
    ...overrides,
  };
}

function repositoryIcon(filePath = 'app/icon.svg') {
  return {
    body: new TextEncoder().encode('<svg id="repository" />'),
    contentType: 'image/svg+xml',
    path: filePath,
  };
}

function decodeLogoBody(body: Uint8Array) {
  return new TextDecoder().decode(body);
}

beforeAll(async () => {
  await fs.writeFile(workspaceIconPath, '<svg id="workspace" />');
});

afterAll(async () => {
  await fs.rm(workspaceIconPath, { force: true });
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.decryptSecret.mockReturnValue(null);
  mocks.fetchRepositoryIcon.mockResolvedValue(null);
  mocks.findDeploymentIcon.mockResolvedValue(null);
  mocks.getAppConfig.mockReturnValue({ security: { githubToken: null } });
  mocks.listDeploymentSummaries.mockResolvedValue([]);
});

describe('resolveWorkloadLogo', () => {
  it('reads the icon from the dev project repository', async () => {
    mocks.inspectContainer.mockResolvedValue(
      createContainer({ labels: { 'vercelab.dev.deployment-id': 'dev-deployment-1' } })
    );
    mocks.getDevDeploymentById.mockResolvedValue({ projectId: 'dev-project-1' });
    mocks.getDevProjectById.mockResolvedValue({
      buildContext: 'apps/web',
      repositoryUrl: 'https://github.com/acme/bladevault.git',
    });
    mocks.fetchRepositoryIcon.mockResolvedValue(repositoryIcon('apps/web/app/icon.svg'));

    const logo = await resolveWorkloadLogo('ctr-dev-1');

    expect(logo).toMatchObject({ contentType: 'image/svg+xml', source: 'dev-deployment' });
    expect(decodeLogoBody(logo?.body ?? new Uint8Array())).toBe('<svg id="repository" />');
    expect(mocks.fetchRepositoryIcon).toHaveBeenCalledWith(
      'https://github.com/acme/bladevault.git',
      expect.objectContaining({ directory: 'apps/web' })
    );
  });

  it('prefers the stored deployment workspace icon over repository fetch', async () => {
    mocks.inspectContainer.mockResolvedValue(
      createContainer({ labels: { 'com.docker.compose.project': 'acme-app' } })
    );
    mocks.listDeploymentSummaries.mockResolvedValue([
      { id: 'deployment-1', projectName: 'acme-app' },
      { id: 'deployment-2', projectName: 'other-app' },
    ]);
    mocks.getStoredDeploymentById.mockResolvedValue({
      encryptedToken: null,
      repositoryUrl: 'https://github.com/acme/app.git',
      workspacePath: '/virtual/workspace',
    });
    mocks.findDeploymentIcon.mockResolvedValue({
      contentType: 'image/svg+xml',
      path: workspaceIconPath,
      size: 20,
    });

    const logo = await resolveWorkloadLogo('ctr-deployment-1');

    expect(logo).toMatchObject({ source: 'deployment' });
    expect(decodeLogoBody(logo?.body ?? new Uint8Array())).toBe('<svg id="workspace" />');
    expect(mocks.fetchRepositoryIcon).not.toHaveBeenCalled();
  });

  it('prefers the official brand mark over a shared compose working directory', async () => {
    mocks.inspectContainer.mockResolvedValue(
      createContainer({
        image: 'postgres:16-alpine',
        labels: { 'com.docker.compose.project.working_dir': '/Users/me/code/vercelab' },
        name: 'vercelab-postgres',
      })
    );
    mocks.findDeploymentIcon.mockResolvedValue({
      contentType: 'image/svg+xml',
      path: workspaceIconPath,
      size: 20,
    });

    const logo = await resolveWorkloadLogo('ctr-official-compose');

    expect(logo).toMatchObject({ source: 'official' });
    expect(mocks.findDeploymentIcon).not.toHaveBeenCalled();
  });

  it('falls back to a local compose working directory', async () => {
    mocks.inspectContainer.mockResolvedValue(
      createContainer({
        labels: { 'com.docker.compose.project.working_dir': '/Users/me/code/bladevault' },
      })
    );
    mocks.findDeploymentIcon.mockResolvedValue({
      contentType: 'image/svg+xml',
      path: workspaceIconPath,
      size: 20,
    });

    const logo = await resolveWorkloadLogo('ctr-working-dir');

    expect(logo).toMatchObject({ source: 'local-workspace' });
    expect(mocks.findDeploymentIcon).toHaveBeenCalledWith('/Users/me/code/bladevault');
  });

  it('renders a bundled brand mark for official images', async () => {
    mocks.inspectContainer.mockResolvedValue(
      createContainer({ image: 'postgres:16-alpine', name: 'vercelab-postgres' })
    );

    const logo = await resolveWorkloadLogo('ctr-official');

    expect(logo).toMatchObject({ contentType: 'image/svg+xml', source: 'official' });
    expect(decodeLogoBody(logo?.body ?? new Uint8Array())).toContain('<title>PostgreSQL</title>');
  });

  it('uses the image source label for third-party images', async () => {
    mocks.inspectContainer.mockResolvedValue(
      createContainer({
        image: 'fnsys/dockhand:latest',
        labels: { 'org.opencontainers.image.source': 'https://github.com/Finsys/dockhand' },
        name: 'dockhand',
      })
    );
    mocks.fetchRepositoryIcon.mockResolvedValue(repositoryIcon('static/logo.svg'));

    const logo = await resolveWorkloadLogo('ctr-source-label');

    expect(logo).toMatchObject({ source: 'repository' });
    expect(mocks.fetchRepositoryIcon).toHaveBeenCalledWith(
      'https://github.com/Finsys/dockhand',
      expect.any(Object)
    );
  });

  it('returns null when no logo can be resolved', async () => {
    mocks.inspectContainer.mockResolvedValue(createContainer());

    await expect(resolveWorkloadLogo('ctr-without-logo')).resolves.toBeNull();
  });

  it('rejects malformed container identifiers before inspecting Docker', async () => {
    await expect(resolveWorkloadLogo('not a container id')).resolves.toBeNull();
    expect(mocks.inspectContainer).not.toHaveBeenCalled();
  });
});
