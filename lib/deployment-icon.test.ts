import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { findDeploymentIcon, pickLooseIconPath } from '@/lib/deployment-icon';

const temporaryDirectories: string[] = [];

async function createWorkspace() {
  const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'vercelab-icon-'));
  temporaryDirectories.push(workspacePath);
  return workspacePath;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directoryPath) => fs.rm(directoryPath, { force: true, recursive: true }))
  );
});

describe('findDeploymentIcon', () => {
  it('prefers a Next.js App Router icon over favicon and public logo assets', async () => {
    const workspacePath = await createWorkspace();
    const resolvedWorkspacePath = await fs.realpath(workspacePath);
    await fs.mkdir(path.join(workspacePath, 'app'), { recursive: true });
    await fs.mkdir(path.join(workspacePath, 'public'), { recursive: true });
    await fs.writeFile(path.join(workspacePath, 'app', 'icon.svg'), '<svg />');
    await fs.writeFile(path.join(workspacePath, 'app', 'favicon.ico'), 'favicon');
    await fs.writeFile(path.join(workspacePath, 'public', 'logo.svg'), '<svg />');

    await expect(findDeploymentIcon(workspacePath)).resolves.toMatchObject({
      contentType: 'image/svg+xml',
      path: path.join(resolvedWorkspacePath, 'app', 'icon.svg'),
    });
  });

  it('finds icons in src/app and common public locations', async () => {
    const workspacePath = await createWorkspace();
    const resolvedWorkspacePath = await fs.realpath(workspacePath);
    await fs.mkdir(path.join(workspacePath, 'src', 'app'), { recursive: true });
    await fs.writeFile(path.join(workspacePath, 'src', 'app', 'icon.png'), 'png');

    await expect(findDeploymentIcon(workspacePath)).resolves.toMatchObject({
      contentType: 'image/png',
      path: path.join(resolvedWorkspacePath, 'src', 'app', 'icon.png'),
    });
  });

  it('ignores icon symlinks that escape the deployment workspace', async () => {
    const workspacePath = await createWorkspace();
    const outsidePath = path.join(os.tmpdir(), `vercelab-outside-${crypto.randomUUID()}.svg`);

    try {
      await fs.writeFile(outsidePath, '<svg />');
      await fs.mkdir(path.join(workspacePath, 'public'), { recursive: true });
      await fs.symlink(outsidePath, path.join(workspacePath, 'public', 'logo.svg'));

      await expect(findDeploymentIcon(workspacePath)).resolves.toBeNull();
    } finally {
      await fs.rm(outsidePath, { force: true });
    }
  });

  it('falls back to loosely named logo files in public', async () => {
    const workspacePath = await createWorkspace();
    const resolvedWorkspacePath = await fs.realpath(workspacePath);
    await fs.mkdir(path.join(workspacePath, 'public'), { recursive: true });
    await fs.writeFile(path.join(workspacePath, 'public', 'favicon-16x16.png'), 'png');
    await fs.writeFile(path.join(workspacePath, 'public', 'logo-dark.svg'), '<svg />');
    await fs.writeFile(path.join(workspacePath, 'public', 'robots.txt'), 'txt');

    await expect(findDeploymentIcon(workspacePath)).resolves.toMatchObject({
      contentType: 'image/svg+xml',
      path: path.join(resolvedWorkspacePath, 'public', 'logo-dark.svg'),
    });
  });

  it('returns null when the workspace has no icon-like files', async () => {
    const workspacePath = await createWorkspace();
    await fs.mkdir(path.join(workspacePath, 'public'), { recursive: true });
    await fs.writeFile(path.join(workspacePath, 'public', 'hero.png'), 'png');

    await expect(findDeploymentIcon(workspacePath)).resolves.toBeNull();
  });
});

describe('pickLooseIconPath', () => {
  it('prefers logos, then SVG, then directory order, and ignores unknown directories', () => {
    expect(
      pickLooseIconPath([
        'docs/logo.svg',
        'public/favicon-32x32.png',
        'public/icon-512.png',
        'public/images/logo-light.png',
        'static/logo-mark.svg',
        'logo.svg.bak',
      ])
    ).toBe('static/logo-mark.svg');
    expect(pickLooseIconPath(['public/favicon-32x32.png', 'public/icon-512.png'])).toBe(
      'public/icon-512.png'
    );
    expect(pickLooseIconPath(['docs/logo.svg', 'public/logo.txt'])).toBeNull();
  });
});
