import 'server-only';

import { decryptSecret } from '@/lib/crypto';
import { queryRows } from '@/lib/persistence';
import type {
  DevDeployment,
  DevDeploymentStatus,
  DevProject,
  DevProjectDetail,
} from '@/lib/dev-types';

type DevProjectRow = {
  id: string;
  repository_url: string;
  repository_name: string;
  repository_owner: string;
  branch: string;
  app_name: string;
  app_slug: string;
  dockerfile_path: string;
  build_context: string;
  port: number;
  env_variables: string | null;
  build_args: string | null;
  auto_deploy: boolean;
  auto_deploy_pull_requests: boolean;
  retention_limit: number;
  encrypted_webhook_secret: string | null;
  last_seen_sha: string | null;
  last_polled_at: string | null;
  last_poll_error: string | null;
  created_at: string;
  updated_at: string;
};

type DevDeploymentRow = {
  id: string;
  project_id: string;
  commit_sha: string;
  short_sha: string;
  commit_message: string | null;
  commit_author: string | null;
  committed_at: string | null;
  commit_url: string | null;
  pull_request_number: number | null;
  pull_request_title: string | null;
  branch: string;
  status: DevDeploymentStatus;
  container_id: string | null;
  container_name: string;
  image_tag: string;
  subdomain: string;
  dockerfile_path: string;
  build_context: string;
  port: number;
  env_variables: string | null;
  build_args: string | null;
  build_log_path: string;
  last_output: string | null;
  created_at: string;
  updated_at: string;
  build_started_at: string | null;
  build_finished_at: string | null;
  deployed_at: string | null;
};

export type CreateDevProjectRecordInput = {
  appName: string;
  appSlug: string;
  autoDeploy: boolean;
  autoDeployPullRequests: boolean;
  branch: string;
  buildArgs: string | null;
  buildContext: string;
  dockerfilePath: string;
  encryptedWebhookSecret: string;
  envVariables: string | null;
  lastSeenSha: string | null;
  port: number;
  repositoryName: string;
  repositoryOwner: string;
  repositoryUrl: string;
  retentionLimit: number;
};

export type CreateDevDeploymentRecordInput = {
  branch: string;
  buildArgs: string | null;
  buildContext: string;
  buildLogPath: string;
  commitAuthor: string | null;
  commitMessage: string | null;
  commitSha: string;
  commitUrl: string | null;
  committedAt: string | null;
  containerName: string;
  dockerfilePath: string;
  envVariables: string | null;
  imageTag: string;
  port: number;
  projectId: string;
  pullRequestNumber: number | null;
  pullRequestTitle: string | null;
  shortSha: string;
  subdomain: string;
};

type DevProjectUpdate = Partial<{
  appName: string;
  appSlug: string;
  autoDeploy: boolean;
  autoDeployPullRequests: boolean;
  branch: string;
  buildArgs: string | null;
  buildContext: string;
  dockerfilePath: string;
  encryptedWebhookSecret: string;
  envVariables: string | null;
  lastPollError: string | null;
  lastPolledAt: string | null;
  lastSeenSha: string | null;
  port: number;
  retentionLimit: number;
}>;

type DevDeploymentUpdate = Partial<{
  buildFinishedAt: string | null;
  buildStartedAt: string | null;
  containerId: string | null;
  containerName: string;
  deployedAt: string | null;
  imageTag: string;
  lastOutput: string | null;
  status: DevDeploymentStatus;
  subdomain: string;
}>;

function serializeOutput(value: string | null) {
  if (!value) {
    return null;
  }

  return value.slice(-12000);
}

function mapDevProject(row: DevProjectRow): DevProject {
  return {
    id: row.id,
    repositoryUrl: row.repository_url,
    repositoryName: row.repository_name,
    repositoryOwner: row.repository_owner,
    branch: row.branch,
    appName: row.app_name,
    appSlug: row.app_slug,
    dockerfilePath: row.dockerfile_path,
    buildContext: row.build_context,
    port: row.port,
    envVariables: row.env_variables,
    buildArgs: row.build_args,
    autoDeploy: row.auto_deploy,
    autoDeployPullRequests: row.auto_deploy_pull_requests,
    retentionLimit: row.retention_limit,
    lastSeenSha: row.last_seen_sha,
    lastPolledAt: row.last_polled_at,
    lastPollError: row.last_poll_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapDevDeployment(row: DevDeploymentRow): DevDeployment {
  return {
    id: row.id,
    projectId: row.project_id,
    commitSha: row.commit_sha,
    shortSha: row.short_sha,
    commitMessage: row.commit_message,
    commitAuthor: row.commit_author,
    committedAt: row.committed_at,
    commitUrl: row.commit_url,
    pullRequestNumber: row.pull_request_number,
    pullRequestTitle: row.pull_request_title,
    branch: row.branch,
    status: row.status,
    containerId: row.container_id,
    containerName: row.container_name,
    imageTag: row.image_tag,
    subdomain: row.subdomain,
    dockerfilePath: row.dockerfile_path,
    buildContext: row.build_context,
    port: row.port,
    envVariables: row.env_variables,
    buildArgs: row.build_args,
    buildLogPath: row.build_log_path,
    lastOutput: row.last_output,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    buildStartedAt: row.build_started_at,
    buildFinishedAt: row.build_finished_at,
    deployedAt: row.deployed_at,
  };
}

export async function listDevProjects(): Promise<DevProject[]> {
  const rows = await queryRows<DevProjectRow>(
    'SELECT * FROM dev_projects ORDER BY created_at DESC'
  );

  return rows.map(mapDevProject);
}

export async function getDevProjectById(projectId: string): Promise<DevProject> {
  const rows = await queryRows<DevProjectRow>('SELECT * FROM dev_projects WHERE id = $1', [
    projectId,
  ]);
  const row = rows[0];

  if (!row) {
    throw new Error('Dev project not found.');
  }

  return mapDevProject(row);
}

export async function getDevProjectDetailById(projectId: string): Promise<DevProjectDetail> {
  const rows = await queryRows<DevProjectRow>('SELECT * FROM dev_projects WHERE id = $1', [
    projectId,
  ]);
  const row = rows[0];

  if (!row) {
    throw new Error('Dev project not found.');
  }

  return {
    ...mapDevProject(row),
    webhookSecret: decryptSecret(row.encrypted_webhook_secret) ?? '',
  };
}

export async function getDevProjectByRepositoryAndBranch(
  repositoryUrl: string,
  branch: string
): Promise<DevProject | null> {
  const rows = await queryRows<DevProjectRow>(
    'SELECT * FROM dev_projects WHERE repository_url = $1 AND branch = $2 LIMIT 1',
    [repositoryUrl, branch]
  );

  return rows[0] ? mapDevProject(rows[0]) : null;
}

export async function createDevProjectRecord(
  input: CreateDevProjectRecordInput
): Promise<DevProject> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const rows = await queryRows<DevProjectRow>(
    `
      INSERT INTO dev_projects (
        id,
        repository_url,
        repository_name,
        repository_owner,
        branch,
        app_name,
        app_slug,
        dockerfile_path,
        build_context,
        port,
        env_variables,
        build_args,
        auto_deploy,
        auto_deploy_pull_requests,
        retention_limit,
        encrypted_webhook_secret,
        last_seen_sha,
        last_polled_at,
        last_poll_error,
        created_at,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
        $21
      )
      RETURNING *
    `,
    [
      id,
      input.repositoryUrl,
      input.repositoryName,
      input.repositoryOwner,
      input.branch,
      input.appName,
      input.appSlug,
      input.dockerfilePath,
      input.buildContext,
      input.port,
      input.envVariables,
      input.buildArgs,
      input.autoDeploy,
      input.autoDeployPullRequests,
      input.retentionLimit,
      input.encryptedWebhookSecret,
      input.lastSeenSha,
      null,
      null,
      now,
      now,
    ]
  );

  return mapDevProject(rows[0]!);
}

export async function updateDevProjectRecord(projectId: string, update: DevProjectUpdate) {
  const entries = Object.entries(update).filter(([, value]) => value !== undefined);

  if (entries.length === 0) {
    return;
  }

  const columnMap: Record<string, string> = {
    appName: 'app_name',
    appSlug: 'app_slug',
    autoDeploy: 'auto_deploy',
    autoDeployPullRequests: 'auto_deploy_pull_requests',
    branch: 'branch',
    buildArgs: 'build_args',
    buildContext: 'build_context',
    dockerfilePath: 'dockerfile_path',
    encryptedWebhookSecret: 'encrypted_webhook_secret',
    envVariables: 'env_variables',
    lastPollError: 'last_poll_error',
    lastPolledAt: 'last_polled_at',
    lastSeenSha: 'last_seen_sha',
    port: 'port',
    retentionLimit: 'retention_limit',
  };

  const values = entries.map(([, value]) => value);
  const assignments = entries.map(([key], index) => `${columnMap[key]} = $${index + 1}`);

  values.push(new Date().toISOString());
  assignments.push(`updated_at = $${values.length}`);
  values.push(projectId);

  await queryRows(
    `UPDATE dev_projects SET ${assignments.join(', ')} WHERE id = $${values.length}`,
    values
  );
}

export async function deleteDevProjectRecord(projectId: string) {
  await queryRows('DELETE FROM dev_projects WHERE id = $1', [projectId]);
}

export async function updateDevProjectPollState(
  projectId: string,
  update: {
    lastPollError: string | null;
    lastPolledAt: string;
    lastSeenSha?: string | null;
  }
) {
  await updateDevProjectRecord(projectId, {
    lastPollError: update.lastPollError,
    lastPolledAt: update.lastPolledAt,
    ...(update.lastSeenSha !== undefined ? { lastSeenSha: update.lastSeenSha } : {}),
  });
}

export async function listDevDeployments(projectId?: string): Promise<DevDeployment[]> {
  const rows = projectId
    ? await queryRows<DevDeploymentRow>(
        'SELECT * FROM dev_deployments WHERE project_id = $1 ORDER BY created_at DESC',
        [projectId]
      )
    : await queryRows<DevDeploymentRow>('SELECT * FROM dev_deployments ORDER BY created_at DESC');

  return rows.map(mapDevDeployment);
}

export async function getDevDeploymentById(deploymentId: string): Promise<DevDeployment> {
  const rows = await queryRows<DevDeploymentRow>('SELECT * FROM dev_deployments WHERE id = $1', [
    deploymentId,
  ]);
  const row = rows[0];

  if (!row) {
    throw new Error('Dev deployment not found.');
  }

  return mapDevDeployment(row);
}

export async function getDevDeploymentByCommit(
  projectId: string,
  commitSha: string
): Promise<DevDeployment | null> {
  const rows = await queryRows<DevDeploymentRow>(
    'SELECT * FROM dev_deployments WHERE project_id = $1 AND commit_sha = $2 LIMIT 1',
    [projectId, commitSha]
  );

  return rows[0] ? mapDevDeployment(rows[0]) : null;
}

export async function createDevDeploymentRecord(
  input: CreateDevDeploymentRecordInput
): Promise<{ created: boolean; deployment: DevDeployment }> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const rows = await queryRows<DevDeploymentRow>(
    `
      INSERT INTO dev_deployments (
        id,
        project_id,
        commit_sha,
        short_sha,
        commit_message,
        commit_author,
        committed_at,
        commit_url,
        pull_request_number,
        pull_request_title,
        branch,
        status,
        container_id,
        container_name,
        image_tag,
        subdomain,
        dockerfile_path,
        build_context,
        port,
        env_variables,
        build_args,
        build_log_path,
        last_output,
        created_at,
        updated_at,
        build_started_at,
        build_finished_at,
        deployed_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
        $21, $22, $23, $24, $25, $26, $27, $28
      )
      ON CONFLICT (project_id, commit_sha) DO NOTHING
      RETURNING *
    `,
    [
      id,
      input.projectId,
      input.commitSha,
      input.shortSha,
      input.commitMessage,
      input.commitAuthor,
      input.committedAt,
      input.commitUrl,
      input.pullRequestNumber,
      input.pullRequestTitle,
      input.branch,
      'queued',
      null,
      input.containerName,
      input.imageTag,
      input.subdomain,
      input.dockerfilePath,
      input.buildContext,
      input.port,
      input.envVariables,
      input.buildArgs,
      input.buildLogPath,
      null,
      now,
      now,
      null,
      null,
      null,
    ]
  );

  if (rows[0]) {
    return {
      created: true,
      deployment: mapDevDeployment(rows[0]),
    };
  }

  const existing = await getDevDeploymentByCommit(input.projectId, input.commitSha);

  if (!existing) {
    throw new Error('Unable to queue preview deployment.');
  }

  return {
    created: false,
    deployment: existing,
  };
}

export async function updateDevDeploymentRecord(deploymentId: string, update: DevDeploymentUpdate) {
  const entries = Object.entries(update).filter(([, value]) => value !== undefined);

  if (entries.length === 0) {
    return;
  }

  const columnMap: Record<string, string> = {
    buildFinishedAt: 'build_finished_at',
    buildStartedAt: 'build_started_at',
    containerId: 'container_id',
    containerName: 'container_name',
    deployedAt: 'deployed_at',
    imageTag: 'image_tag',
    lastOutput: 'last_output',
    status: 'status',
    subdomain: 'subdomain',
  };

  const values = entries.map(([key, value]) =>
    key === 'lastOutput' ? serializeOutput(value as string | null) : value
  );
  const assignments = entries.map(([key], index) => `${columnMap[key]} = $${index + 1}`);

  values.push(new Date().toISOString());
  assignments.push(`updated_at = $${values.length}`);
  values.push(deploymentId);

  await queryRows(
    `UPDATE dev_deployments SET ${assignments.join(', ')} WHERE id = $${values.length}`,
    values
  );
}

export async function deleteDevDeploymentRecord(deploymentId: string) {
  await queryRows('DELETE FROM dev_deployments WHERE id = $1', [deploymentId]);
}

export async function claimNextQueuedDevDeployment(): Promise<DevDeployment | null> {
  const now = new Date().toISOString();
  const rows = await queryRows<DevDeploymentRow>(
    `
      UPDATE dev_deployments
      SET
        status = 'building',
        build_started_at = $1,
        build_finished_at = NULL,
        deployed_at = NULL,
        last_output = NULL,
        updated_at = $1
      WHERE id = (
        SELECT id
        FROM dev_deployments
        WHERE status = 'queued'
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *
    `,
    [now]
  );

  return rows[0] ? mapDevDeployment(rows[0]) : null;
}

export async function recoverInterruptedDevDeployments() {
  const now = new Date().toISOString();
  const message =
    'Build was interrupted when the Vercelab control plane restarted. Use Retry to rebuild this commit.';

  await queryRows(
    `
      UPDATE dev_deployments
      SET
        status = 'failed',
        build_finished_at = $1,
        updated_at = $1,
        last_output = $2
      WHERE status = 'building'
    `,
    [now, message]
  );
}

export async function resetDevDeploymentForRetry(deploymentId: string) {
  const now = new Date().toISOString();

  await queryRows(
    `
      UPDATE dev_deployments
      SET
        status = 'queued',
        container_id = NULL,
        build_started_at = NULL,
        build_finished_at = NULL,
        deployed_at = NULL,
        last_output = NULL,
        updated_at = $1
      WHERE id = $2
    `,
    [now, deploymentId]
  );
}

export async function isDevSubdomainReserved(subdomain: string) {
  const rows = await queryRows<{ reserved: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1 FROM dev_deployments WHERE subdomain = $1
        UNION ALL
        SELECT 1 FROM deployments WHERE subdomain = $1
      ) AS reserved
    `,
    [subdomain]
  );

  return Boolean(rows[0]?.reserved);
}
