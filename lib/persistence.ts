import path from "node:path";

import { Pool, type PoolClient } from "pg";

import { getAppConfig } from "@/lib/app-config";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import type { CreateDeploymentInput } from "@/lib/validation";

export type DeploymentStatus =
  | "deploying"
  | "running"
  | "failed"
  | "stopped"
  | "removing";
export type DeploymentMode = "dockerfile" | "compose" | null;
export type OperationType = "deploy" | "redeploy" | "stop" | "remove";
export type OperationStatus = "pending" | "success" | "failed";

export type StoredDeployment = {
  id: string;
  repositoryId: string;
  repositoryName: string;
  repositoryUrl: string;
  encryptedToken: string | null;
  branch: string | null;
  commitSha: string | null;
  appName: string;
  appSlug: string;
  subdomain: string;
  port: number;
  envVariables: string | null;
  serviceName: string | null;
  status: DeploymentStatus;
  composeMode: DeploymentMode;
  composeFile: string | null;
  projectName: string;
  workspacePath: string;
  lastOutput: string | null;
  createdAt: string;
  updatedAt: string;
  deployedAt: string | null;
};

export type DeploymentSummary = {
  id: string;
  repositoryName: string;
  repositoryUrl: string;
  branch: string | null;
  commitSha: string | null;
  appName: string;
  subdomain: string;
  port: number;
  envVariables: string | null;
  serviceName: string | null;
  status: DeploymentStatus;
  composeMode: DeploymentMode;
  projectName: string;
  lastOutput: string | null;
  lastOperationSummary: string | null;
  updatedAt: string;
  deployedAt: string | null;
  tokenStored: boolean;
};

export type DeploymentOperationLog = {
  id: string;
  operationType: OperationType;
  status: OperationStatus;
  summary: string | null;
  output: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DashboardTrendPoint = {
  label: string;
  total: number;
  success: number;
  failed: number;
};

export type DashboardActivity = {
  id: string;
  appName: string;
  operationType: OperationType;
  status: OperationStatus;
  summary: string | null;
  createdAt: string;
};

export type DashboardStatusDistribution = {
  status: DeploymentStatus;
  count: number;
};

export type DashboardModeDistribution = {
  mode: "dockerfile" | "compose" | "unknown";
  count: number;
};

export type WorkspaceData = {
  deployments: DeploymentSummary[];
  stats: {
    totalDeployments: number;
    runningDeployments: number;
    failedDeployments: number;
    totalRepositories: number;
  };
  trends: DashboardTrendPoint[];
  recentActivity: DashboardActivity[];
  statusDistribution: DashboardStatusDistribution[];
  modeDistribution: DashboardModeDistribution[];
};

type StoredDeploymentRow = {
  id: string;
  repository_id: string;
  repository_name: string;
  repository_url: string;
  encrypted_token: string | null;
  branch: string | null;
  commit_sha: string | null;
  app_name: string;
  app_slug: string;
  subdomain: string;
  port: number;
  env_variables: string | null;
  service_name: string | null;
  status: DeploymentStatus;
  compose_mode: DeploymentMode;
  compose_file: string | null;
  project_name: string;
  workspace_path: string;
  last_output: string | null;
  created_at: string;
  updated_at: string;
  deployed_at: string | null;
};

type DeploymentSummaryRow = {
  id: string;
  repository_name: string;
  repository_url: string;
  branch: string | null;
  commit_sha: string | null;
  app_name: string;
  subdomain: string;
  port: number;
  env_variables: string | null;
  service_name: string | null;
  status: DeploymentStatus;
  compose_mode: DeploymentMode;
  project_name: string;
  last_output: string | null;
  last_operation_summary: string | null;
  updated_at: string;
  deployed_at: string | null;
  token_stored: boolean;
};

type DeploymentOperationRow = {
  id: string;
  operation_type: OperationType;
  status: OperationStatus;
  summary: string | null;
  output: string | null;
  created_at: string;
  updated_at: string;
};

type DashboardActivityRow = {
  id: string;
  app_name: string;
  operation_type: OperationType;
  status: OperationStatus;
  summary: string | null;
  created_at: string;
};

type DashboardTrendRow = {
  status: OperationStatus;
  created_at: string;
};

let pool: Pool | undefined;
let initPromise: Promise<void> | undefined;
const trendLabelFormatter = new Intl.DateTimeFormat("en", { weekday: "short" });
const deploymentSummarySelect = `
  SELECT
    d.id,
    r.name AS repository_name,
    r.repository_url,
    r.branch,
    r.commit_sha,
    d.app_name,
    d.subdomain,
    d.port,
    d.env_variables,
    d.service_name,
    d.status,
    d.compose_mode,
    d.project_name,
    d.last_output,
    d.updated_at,
    d.deployed_at,
    (r.encrypted_token IS NOT NULL) AS token_stored,
    (
      SELECT summary
      FROM operations o
      WHERE o.deployment_id = d.id
      ORDER BY o.created_at DESC
      LIMIT 1
    ) AS last_operation_summary
  FROM deployments d
  INNER JOIN repositories r ON r.id = d.repository_id
  ORDER BY d.updated_at DESC
`;

function toSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function serializeOutput(value: string | null): string | null {
  if (!value) {
    return null;
  }

  return value.slice(-12000);
}

function isUniqueViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}

function mapStoredDeployment(row: StoredDeploymentRow): StoredDeployment {
  return {
    id: row.id,
    repositoryId: row.repository_id,
    repositoryName: row.repository_name,
    repositoryUrl: row.repository_url,
    encryptedToken: row.encrypted_token,
    branch: row.branch,
    commitSha: row.commit_sha,
    appName: row.app_name,
    appSlug: row.app_slug,
    subdomain: row.subdomain,
    port: row.port,
    envVariables: row.env_variables,
    serviceName: row.service_name,
    status: row.status,
    composeMode: row.compose_mode,
    composeFile: row.compose_file,
    projectName: row.project_name,
    workspacePath: row.workspace_path,
    lastOutput: row.last_output,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deployedAt: row.deployed_at,
  };
}

function mapDeploymentSummary(row: DeploymentSummaryRow): DeploymentSummary {
  return {
    id: row.id,
    repositoryName: row.repository_name,
    repositoryUrl: row.repository_url,
    branch: row.branch,
    commitSha: row.commit_sha,
    appName: row.app_name,
    subdomain: row.subdomain,
    port: row.port,
    envVariables: row.env_variables,
    serviceName: row.service_name,
    status: row.status,
    composeMode: row.compose_mode,
    projectName: row.project_name,
    lastOutput: row.last_output,
    lastOperationSummary: row.last_operation_summary,
    updatedAt: row.updated_at,
    deployedAt: row.deployed_at,
    tokenStored: row.token_stored,
  };
}

function buildTrendPoints(
  rows: DashboardTrendRow[],
  days = 8,
): DashboardTrendPoint[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const buckets = Array.from({ length: days }, (_, index) => {
    const bucketDate = new Date(today);
    bucketDate.setDate(today.getDate() - (days - index - 1));

    return {
      dateKey: bucketDate.toISOString().slice(0, 10),
      label: trendLabelFormatter.format(bucketDate),
      total: 0,
      success: 0,
      failed: 0,
    };
  });

  const bucketMap = new Map(buckets.map((bucket) => [bucket.dateKey, bucket]));

  for (const row of rows) {
    const bucket = bucketMap.get(row.created_at.slice(0, 10));

    if (!bucket) {
      continue;
    }

    bucket.total += 1;

    if (row.status === "success") {
      bucket.success += 1;
    }

    if (row.status === "failed") {
      bucket.failed += 1;
    }
  }

  return buckets.map((bucket) => ({
    label: bucket.label,
    total: bucket.total,
    success: bucket.success,
    failed: bucket.failed,
  }));
}

function getPool() {
  if (!pool) {
    const config = getAppConfig();
    pool = new Pool({
      connectionString: config.database.postgresUrl,
      max: 20,
    });
  }

  return pool;
}

async function initDatabase() {
  if (!initPromise) {
    initPromise = (async () => {
      const client = await getPool().connect();

      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS repositories (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            repository_url TEXT NOT NULL,
            encrypted_token TEXT,
            branch TEXT,
            commit_sha TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );

          CREATE TABLE IF NOT EXISTS deployments (
            id TEXT PRIMARY KEY,
            repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
            app_name TEXT NOT NULL,
            app_slug TEXT NOT NULL,
            subdomain TEXT NOT NULL UNIQUE,
            port INTEGER NOT NULL,
            env_variables TEXT,
            service_name TEXT,
            status TEXT NOT NULL,
            compose_mode TEXT,
            compose_file TEXT,
            project_name TEXT NOT NULL UNIQUE,
            workspace_path TEXT NOT NULL,
            last_output TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            deployed_at TEXT
          );

          CREATE TABLE IF NOT EXISTS operations (
            id TEXT PRIMARY KEY,
            deployment_id TEXT NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
            operation_type TEXT NOT NULL,
            status TEXT NOT NULL,
            summary TEXT,
            output TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );

          CREATE INDEX IF NOT EXISTS idx_deployments_repository_id ON deployments(repository_id);
          CREATE INDEX IF NOT EXISTS idx_operations_deployment_id ON operations(deployment_id);
          CREATE INDEX IF NOT EXISTS idx_operations_created_at ON operations(created_at DESC);
        `);
        await client.query(
          "ALTER TABLE repositories ADD COLUMN IF NOT EXISTS commit_sha TEXT",
        );
      } finally {
        client.release();
      }
    })();
  }

  await initPromise;
}

async function queryRows<T>(
  statement: string,
  values: unknown[] = [],
  client?: PoolClient,
): Promise<T[]> {
  await initDatabase();
  const result = client
    ? await client.query(statement, values)
    : await getPool().query(statement, values);

  return result.rows as T[];
}

async function withTransaction<T>(task: (client: PoolClient) => Promise<T>) {
  await initDatabase();
  const client = await getPool().connect();

  try {
    await client.query("BEGIN");
    const result = await task(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getDatabaseHealth() {
  const config = getAppConfig();
  await initDatabase();
  const rows = await queryRows<{ version: string }>(
    "SELECT version() AS version",
  );

  return {
    provider: config.database.provider,
    postgresUrl: config.database.postgresUrl,
    version: rows[0]?.version ?? "unknown",
  };
}

async function queryDeploymentSummaryRows() {
  return queryRows<DeploymentSummaryRow>(deploymentSummarySelect);
}

export async function listDeploymentSummaries(): Promise<DeploymentSummary[]> {
  return (await queryDeploymentSummaryRows()).map(mapDeploymentSummary);
}

export async function listWorkspaceData(): Promise<WorkspaceData> {
  const deployments = (await queryDeploymentSummaryRows()).map(
    mapDeploymentSummary,
  );

  const activityRows = await queryRows<DashboardActivityRow>(
    `
      SELECT
        o.id,
        d.app_name,
        o.operation_type,
        o.status,
        o.summary,
        o.created_at
      FROM operations o
      INNER JOIN deployments d ON d.id = o.deployment_id
      ORDER BY o.created_at DESC
      LIMIT 7
    `,
  );

  const sinceDate = new Date();
  sinceDate.setHours(0, 0, 0, 0);
  sinceDate.setDate(sinceDate.getDate() - 7);

  const trendRows = await queryRows<DashboardTrendRow>(
    `
      SELECT
        status,
        created_at
      FROM operations
      WHERE created_at >= $1
      ORDER BY created_at ASC
    `,
    [sinceDate.toISOString()],
  );

  const repositoryCountRows = await queryRows<{ count: string }>(
    "SELECT COUNT(*) AS count FROM repositories",
  );
  const repositoryCount = Number.parseInt(
    repositoryCountRows[0]?.count ?? "0",
    10,
  );

  const stats = deployments.reduce(
    (accumulator, deployment) => {
      accumulator.totalDeployments += 1;

      if (deployment.status === "running") {
        accumulator.runningDeployments += 1;
      }

      if (deployment.status === "failed") {
        accumulator.failedDeployments += 1;
      }

      return accumulator;
    },
    {
      totalDeployments: 0,
      runningDeployments: 0,
      failedDeployments: 0,
    },
  );

  const statusDistribution = (
    ["running", "deploying", "failed", "stopped", "removing"] as const
  )
    .map((status) => ({
      status,
      count: deployments.filter((deployment) => deployment.status === status)
        .length,
    }))
    .filter((entry) => entry.count > 0);

  const modeDistribution = (["dockerfile", "compose", "unknown"] as const)
    .map((mode) => ({
      mode,
      count: deployments.filter(
        (deployment) => (deployment.composeMode ?? "unknown") === mode,
      ).length,
    }))
    .filter((entry) => entry.count > 0);

  return {
    deployments,
    stats: {
      totalDeployments: stats.totalDeployments,
      runningDeployments: stats.runningDeployments,
      failedDeployments: stats.failedDeployments,
      totalRepositories: Number.isFinite(repositoryCount) ? repositoryCount : 0,
    },
    trends: buildTrendPoints(trendRows),
    recentActivity: activityRows.map((row) => ({
      id: row.id,
      appName: row.app_name,
      operationType: row.operation_type,
      status: row.status,
      summary: row.summary,
      createdAt: row.created_at,
    })),
    statusDistribution,
    modeDistribution,
  };
}

export async function createDeploymentRecord(input: CreateDeploymentInput) {
  const now = new Date().toISOString();
  const repositoryId = crypto.randomUUID();
  const deploymentId = crypto.randomUUID();
  const repoName =
    input.repositoryUrl
      .split("/")
      .pop()
      ?.replace(/\.git$/, "") ?? "repo";
  const appSlug = toSlug(input.appName);
  const workspacePath = path.join(getAppConfig().paths.appsDir, deploymentId);
  const projectName = `vercelab-${appSlug}-${deploymentId.slice(0, 8)}`;

  try {
    await withTransaction(async (client) => {
      await queryRows(
        `
          INSERT INTO repositories (
            id,
            name,
            repository_url,
            encrypted_token,
            branch,
            commit_sha,
            created_at,
            updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
        [
          repositoryId,
          repoName,
          input.repositoryUrl,
          input.githubToken ? encryptSecret(input.githubToken) : null,
          input.branch ?? null,
          null,
          now,
          now,
        ],
        client,
      );

      await queryRows(
        `
          INSERT INTO deployments (
            id,
            repository_id,
            app_name,
            app_slug,
            subdomain,
            port,
            env_variables,
            service_name,
            status,
            compose_mode,
            compose_file,
            project_name,
            workspace_path,
            last_output,
            created_at,
            updated_at,
            deployed_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        `,
        [
          deploymentId,
          repositoryId,
          input.appName,
          appSlug,
          input.subdomain,
          input.port,
          input.envVariables ?? null,
          input.serviceName ?? null,
          "deploying",
          null,
          null,
          projectName,
          workspacePath,
          null,
          now,
          now,
          null,
        ],
        client,
      );
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new Error(
        "That subdomain is already reserved by another deployment.",
      );
    }

    throw error;
  }

  return {
    deploymentId,
    projectName,
    domain: `${input.subdomain}.${getAppConfig().baseDomain}`,
  };
}

export async function getStoredDeploymentById(
  deploymentId: string,
): Promise<StoredDeployment> {
  const rows = await queryRows<StoredDeploymentRow>(
    `
      SELECT
        d.id,
        d.repository_id,
        r.name AS repository_name,
        r.repository_url,
        r.encrypted_token,
        r.branch,
        r.commit_sha,
        d.app_name,
        d.app_slug,
        d.subdomain,
        d.port,
        d.env_variables,
        d.service_name,
        d.status,
        d.compose_mode,
        d.compose_file,
        d.project_name,
        d.workspace_path,
        d.last_output,
        d.created_at,
        d.updated_at,
        d.deployed_at
      FROM deployments d
      INNER JOIN repositories r ON r.id = d.repository_id
      WHERE d.id = $1
    `,
    [deploymentId],
  );

  const row = rows[0];

  if (!row) {
    throw new Error("Deployment not found.");
  }

  return mapStoredDeployment(row);
}

export async function readDeploymentSecretToken(
  deploymentId: string,
): Promise<string | null> {
  return decryptSecret(
    (await getStoredDeploymentById(deploymentId)).encryptedToken,
  );
}

export async function getLatestDeploymentOperation(
  deploymentId: string,
): Promise<DeploymentOperationLog | null> {
  const rows = await queryRows<DeploymentOperationRow>(
    `
      SELECT
        id,
        operation_type,
        status,
        summary,
        output,
        created_at,
        updated_at
      FROM operations
      WHERE deployment_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [deploymentId],
  );

  const row = rows[0];

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    operationType: row.operation_type,
    status: row.status,
    summary: row.summary,
    output: row.output,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

type DeploymentUpdate = Partial<{
  appName: string;
  appSlug: string;
  subdomain: string;
  port: number;
  envVariables: string | null;
  serviceName: string | null;
  status: DeploymentStatus;
  composeMode: DeploymentMode;
  composeFile: string | null;
  projectName: string;
  workspacePath: string;
  lastOutput: string | null;
  deployedAt: string | null;
}>;

type DeploymentRepositoryUpdate = Partial<{
  branch: string | null;
  commitSha: string | null;
}>;

export async function updateDeploymentRecord(
  deploymentId: string,
  update: DeploymentUpdate,
) {
  const entries = Object.entries(update).filter(
    ([, value]) => value !== undefined,
  );

  if (entries.length === 0) {
    return;
  }

  const columnMap: Record<string, string> = {
    appName: "app_name",
    appSlug: "app_slug",
    subdomain: "subdomain",
    port: "port",
    envVariables: "env_variables",
    serviceName: "service_name",
    status: "status",
    composeMode: "compose_mode",
    composeFile: "compose_file",
    projectName: "project_name",
    workspacePath: "workspace_path",
    lastOutput: "last_output",
    deployedAt: "deployed_at",
  };

  const values = entries.map(([key, value]) =>
    key === "lastOutput" ? serializeOutput(value as string | null) : value,
  );
  const assignments = entries.map(
    ([key], index) => `${columnMap[key]} = $${index + 1}`,
  );

  values.push(new Date().toISOString());
  assignments.push(`updated_at = $${values.length}`);
  values.push(deploymentId);

  await queryRows(
    `UPDATE deployments SET ${assignments.join(", ")} WHERE id = $${values.length}`,
    values,
  );
}

export async function updateDeploymentRepositorySettingsById(
  deploymentId: string,
  update: DeploymentRepositoryUpdate,
) {
  const entries = Object.entries(update).filter(
    ([, value]) => value !== undefined,
  );

  if (entries.length === 0) {
    return;
  }

  const columnMap: Record<string, string> = {
    branch: "branch",
    commitSha: "commit_sha",
  };
  const values = entries.map(([, value]) => value);
  const assignments = entries.map(
    ([key], index) => `${columnMap[key]} = $${index + 1}`,
  );

  values.push(new Date().toISOString());
  assignments.push(`updated_at = $${values.length}`);
  values.push(deploymentId);

  await queryRows(
    `
      UPDATE repositories AS r
      SET ${assignments.join(", ")}
      FROM deployments AS d
      WHERE d.repository_id = r.id AND d.id = $${values.length}
    `,
    values,
  );
}

export async function createOperation(
  deploymentId: string,
  operationType: OperationType,
  summary: string,
) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await queryRows(
    `
      INSERT INTO operations (
        id,
        deployment_id,
        operation_type,
        status,
        summary,
        output,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
    [id, deploymentId, operationType, "pending", summary, null, now, now],
  );

  return id;
}

export async function completeOperation(
  operationId: string,
  status: OperationStatus,
  summary: string,
  output: string | null,
) {
  const now = new Date().toISOString();

  await queryRows(
    `
      UPDATE operations
      SET status = $1, summary = $2, output = $3, updated_at = $4
      WHERE id = $5
    `,
    [status, summary, serializeOutput(output), now, operationId],
  );
}

export async function deleteDeploymentRecord(deploymentId: string) {
  await withTransaction(async (client) => {
    const deploymentRows = await queryRows<{ repository_id: string }>(
      "SELECT repository_id FROM deployments WHERE id = $1",
      [deploymentId],
      client,
    );

    const deployment = deploymentRows[0];

    if (!deployment) {
      throw new Error("Deployment not found.");
    }

    await queryRows(
      "DELETE FROM deployments WHERE id = $1",
      [deploymentId],
      client,
    );

    const remainingRows = await queryRows<{ count: string }>(
      "SELECT COUNT(*) AS count FROM deployments WHERE repository_id = $1",
      [deployment.repository_id],
      client,
    );

    const remaining = Number.parseInt(remainingRows[0]?.count ?? "0", 10);

    if (remaining === 0) {
      await queryRows(
        "DELETE FROM repositories WHERE id = $1",
        [deployment.repository_id],
        client,
      );
    }
  });
}
