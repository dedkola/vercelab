import { describe, expect, it } from 'vitest';

import {
  createDevProjectSchema,
  deployDevCommitSchema,
  devDeploymentActionSchema,
  updateDevProjectSchema,
} from '@/lib/dev-validation';

const SHA = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';

const validProject = {
  appName: 'BladeVault',
  appSlug: 'blade',
  autoDeploy: true,
  branch: 'main',
  buildArgs: '',
  buildContext: '.',
  deployLatest: true,
  dockerfilePath: 'Dockerfile',
  envVariables: '',
  port: 3000,
  repositoryUrl: 'https://github.com/dedkola/bladevault.git',
  retentionLimit: 0,
};

describe('dev validation', () => {
  it('parses a valid project and applies defaults', () => {
    const parsed = createDevProjectSchema.parse(validProject);

    expect(parsed).toMatchObject({
      appName: 'BladeVault',
      appSlug: 'blade',
      autoDeploy: true,
      autoDeployPullRequests: false,
      branch: 'main',
      buildContext: '.',
      deployLatest: true,
      dockerfilePath: 'Dockerfile',
      port: 3000,
      retentionLimit: 0,
    });
    expect(parsed.envVariables).toBeUndefined();
    expect(parsed.buildArgs).toBeUndefined();
  });

  it('carries the pull request preview toggle', () => {
    expect(
      createDevProjectSchema.parse({ ...validProject, autoDeployPullRequests: true })
        .autoDeployPullRequests
    ).toBe(true);
    expect(
      updateDevProjectSchema.parse({ autoDeployPullRequests: true }).autoDeployPullRequests
    ).toBe(true);
    expect(updateDevProjectSchema.parse({}).autoDeployPullRequests).toBeUndefined();
  });

  it('rejects unsafe paths and non-GitHub URLs', () => {
    expect(() =>
      createDevProjectSchema.parse({
        ...validProject,
        repositoryUrl: 'https://gitlab.com/acme/app.git',
      })
    ).toThrow();

    expect(() =>
      createDevProjectSchema.parse({
        ...validProject,
        buildContext: '../outside',
      })
    ).toThrow(/inside the repository/);

    expect(() =>
      createDevProjectSchema.parse({
        ...validProject,
        dockerfilePath: '/etc/passwd',
      })
    ).toThrow(/inside the repository/);
  });

  it('allows clearing multiline values during updates', () => {
    expect(updateDevProjectSchema.parse({ envVariables: '' }).envVariables).toBeNull();
    expect(updateDevProjectSchema.parse({ buildArgs: '' }).buildArgs).toBeNull();
    expect(updateDevProjectSchema.parse({}).envVariables).toBeUndefined();
  });

  it('validates full commit shas and deployment actions', () => {
    expect(deployDevCommitSchema.parse({ commitSha: SHA })).toEqual({ commitSha: SHA });
    expect(deployDevCommitSchema.parse({})).toEqual({});
    expect(() => deployDevCommitSchema.parse({ commitSha: 'a1b2c3d' })).toThrow();
    expect(devDeploymentActionSchema.parse({ action: 'restart' })).toEqual({ action: 'restart' });
    expect(() => devDeploymentActionSchema.parse({ action: 'remove' })).toThrow();
  });
});
