export type DevDeploymentStatus = 'queued' | 'building' | 'failed' | 'running' | 'stopped';

export type DevContainerStatus =
  'running' | 'exited' | 'created' | 'restarting' | 'paused' | 'dead' | 'missing' | 'unknown';

export type DevContainerState = {
  containerId: string | null;
  containerName: string | null;
  status: DevContainerStatus;
  statusText: string | null;
  updatedAt: string;
};

export type DevProject = {
  id: string;
  repositoryUrl: string;
  repositoryName: string;
  repositoryOwner: string;
  branch: string;
  appName: string;
  appSlug: string;
  dockerfilePath: string;
  buildContext: string;
  port: number;
  envVariables: string | null;
  buildArgs: string | null;
  autoDeploy: boolean;
  autoDeployPullRequests: boolean;
  retentionLimit: number;
  lastSeenSha: string | null;
  lastPolledAt: string | null;
  lastPollError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DevProjectDetail = DevProject & {
  webhookSecret: string;
};

export type DevDeployment = {
  id: string;
  projectId: string;
  commitSha: string;
  shortSha: string;
  commitMessage: string | null;
  commitAuthor: string | null;
  committedAt: string | null;
  commitUrl: string | null;
  pullRequestNumber: number | null;
  pullRequestTitle: string | null;
  branch: string;
  status: DevDeploymentStatus;
  containerId: string | null;
  containerName: string;
  imageTag: string;
  subdomain: string;
  dockerfilePath: string;
  buildContext: string;
  port: number;
  envVariables: string | null;
  buildArgs: string | null;
  buildLogPath: string;
  lastOutput: string | null;
  createdAt: string;
  updatedAt: string;
  buildStartedAt: string | null;
  buildFinishedAt: string | null;
  deployedAt: string | null;
};

export type DevState = {
  baseDomain: string;
  previewProtocol: 'http' | 'https';
  githubTokenConfigured: boolean;
  projects: DevProject[];
  deployments: DevDeployment[];
  containerStates: Record<string, DevContainerState>;
  loadedAt: string;
};

export type DevProjectCommits = {
  branches: string[];
  commits: Array<{
    authorName: string | null;
    committedAt: string | null;
    deployed: boolean;
    message: string;
    sha: string;
    shortSha: string;
    url: string | null;
  }>;
  deployedShas: string[];
};

export type DevDeploymentLogPayload = {
  type: 'build' | 'container';
  deploymentId: string;
  commitSha: string;
  appName: string;
  summary: string;
  output: string;
  status: DevDeploymentStatus;
  updatedAt: string;
};
