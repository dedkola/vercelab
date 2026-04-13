import path from "node:path";

import Database from "better-sqlite3";

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

type DatabaseHandle = Database.Database;

export type StoredDeployment = {
  id: string;
  repositoryId: string;
  repositoryName: string;
  repositoryUrl: string;
  encryptedToken: string | null;
  branch: string | null;
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

export type DashboardDeployment = {
  id: string;
  repositoryUrl: string;
  branch: string | null;
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
  tokenStored: boolean;
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

export type DashboardData = {
  deployments: DashboardDeployment[];
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

type DashboardDeploymentRow = {
  id: string;
  repository_url: string;
  branch: string | null;
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
  token_stored: number;
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

let database: DatabaseHandle | undefined;
const trendLabelFormatter = new Intl.DateTimeFormat("en", { weekday: "short" });

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

function mapStoredDeployment(row: StoredDeploymentRow): StoredDeployment {
  return {
    id: row.id,
    repositoryId: row.repository_id,
    repositoryName: row.repository_name,
    repositoryUrl: row.repository_url,
    encryptedToken: row.encrypted_token,
    branch: row.branch,
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

function getDatabase(): DatabaseHandle {
  const config = getAppConfig();

  if (config.database.provider !== "sqlite") {
    throw new Error(
      "Postgres provider is planned but not implemented yet. Use SQLite for this MVP build.",
    );
  }

  if (!database) {
    database = new Database(config.database.sqlitePath);
    database.pragma("journal_mode = WAL");
    database.pragma("foreign_keys = ON");
    initDatabase(database);
  }

  return database;
}

function initDatabase(db: DatabaseHandle) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS repositories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      repository_url TEXT NOT NULL,
      encrypted_token TEXT,
      branch TEXT,
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

  const deploymentColumns = db
    .prepare("PRAGMA table_info(deployments)")
    .all() as Array<{ name: string }>;
  const hasEnvVariablesColumn = deploymentColumns.some(
    (column) => column.name === "env_variables",
  );

  if (!hasEnvVariablesColumn) {
    db.exec("ALTER TABLE deployments ADD COLUMN env_variables TEXT");
  }
}

export function getDatabaseHealth() {
  const config = getAppConfig();
  const db = getDatabase();
  const result = db.prepare("SELECT sqlite_version() AS version").get() as {
    version: string;
  };

  return {
    provider: config.database.provider,
    sqlitePath: config.database.sqlitePath,
    version: result.version,
  };
}

export function listDashboardData(): DashboardData {
  const db = getDatabase();
  const rows = db
    .prepare(
      `
        SELECT
          d.id,
          r.repository_url,
          r.branch,
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
          CASE WHEN r.encrypted_token IS NULL THEN 0 ELSE 1 END AS token_stored,
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
      `,
    )
    .all() as DashboardDeploymentRow[];

  const activityRows = db
    .prepare(
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
    )
    .all() as DashboardActivityRow[];

  const sinceDate = new Date();
  sinceDate.setHours(0, 0, 0, 0);
  sinceDate.setDate(sinceDate.getDate() - 7);

  const trendRows = db
    .prepare(
      `
        SELECT
          status,
          created_at
        FROM operations
        WHERE created_at >= ?
        ORDER BY created_at ASC
      `,
    )
    .all(sinceDate.toISOString()) as DashboardTrendRow[];

  const repositoryCount = db
    .prepare("SELECT COUNT(*) AS count FROM repositories")
    .get() as { count: number };

  const stats = rows.reduce(
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
      count: rows.filter((row) => row.status === status).length,
    }))
    .filter((entry) => entry.count > 0);

  const modeDistribution = (["dockerfile", "compose", "unknown"] as const)
    .map((mode) => ({
      mode,
      count: rows.filter((row) => (row.compose_mode ?? "unknown") === mode)
        .length,
    }))
    .filter((entry) => entry.count > 0);

  return {
    deployments: rows.map((row) => ({
      id: row.id,
      repositoryUrl: row.repository_url,
      branch: row.branch,
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
      tokenStored: row.token_stored === 1,
    })),
    stats: {
      totalDeployments: stats.totalDeployments,
      runningDeployments: stats.runningDeployments,
      failedDeployments: stats.failedDeployments,
      totalRepositories: repositoryCount.count,
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

export function createDeploymentRecord(input: CreateDeploymentInput) {
  const db = getDatabase();
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

  const transaction = db.transaction(() => {
    db.prepare(
      `
        INSERT INTO repositories (
          id,
          name,
          repository_url,
          encrypted_token,
          branch,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
    ).run(
      repositoryId,
      repoName,
      input.repositoryUrl,
      input.githubToken ? encryptSecret(input.githubToken) : null,
      input.branch ?? null,
      now,
      now,
    );

    db.prepare(
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
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    ).run(
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
    );
  });

  try {
    transaction();
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE")) {
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

export function getStoredDeploymentById(
  deploymentId: string,
): StoredDeployment {
  const db = getDatabase();
  const row = db
    .prepare(
      `
        SELECT
          d.id,
          d.repository_id,
          r.name AS repository_name,
          r.repository_url,
          r.encrypted_token,
          r.branch,
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
        WHERE d.id = ?
      `,
    )
    .get(deploymentId) as StoredDeploymentRow | undefined;

  if (!row) {
    throw new Error("Deployment not found.");
  }

  return mapStoredDeployment(row);
}

export function readDeploymentSecretToken(deploymentId: string): string | null {
  return decryptSecret(getStoredDeploymentById(deploymentId).encryptedToken);
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

export function updateDeploymentRecord(
  deploymentId: string,
  update: DeploymentUpdate,
) {
  const db = getDatabase();
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

  const statement = entries
    .map(([key]) => `${columnMap[key]} = @${key}`)
    .concat("updated_at = @updatedAt")
    .join(", ");

  db.prepare(
    `UPDATE deployments SET ${statement} WHERE id = @deploymentId`,
  ).run({
    deploymentId,
    updatedAt: new Date().toISOString(),
    ...Object.fromEntries(
      entries.map(([key, value]) => [
        key,
        key === "lastOutput" ? serializeOutput(value as string | null) : value,
      ]),
    ),
  });
}

export function createOperation(
  deploymentId: string,
  operationType: OperationType,
  summary: string,
) {
  const db = getDatabase();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.prepare(
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
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(id, deploymentId, operationType, "pending", summary, null, now, now);

  return id;
}

export function completeOperation(
  operationId: string,
  status: OperationStatus,
  summary: string,
  output: string | null,
) {
  const db = getDatabase();
  const now = new Date().toISOString();

  db.prepare(
    `
      UPDATE operations
      SET status = ?, summary = ?, output = ?, updated_at = ?
      WHERE id = ?
    `,
  ).run(status, summary, serializeOutput(output), now, operationId);
}

export function deleteDeploymentRecord(deploymentId: string) {
  const db = getDatabase();
  const deployment = getStoredDeploymentById(deploymentId);

  const transaction = db.transaction(() => {
    db.prepare("DELETE FROM deployments WHERE id = ?").run(deploymentId);

    const remaining = db
      .prepare(
        "SELECT COUNT(*) AS count FROM deployments WHERE repository_id = ?",
      )
      .get(deployment.repositoryId) as { count: number };

    if (remaining.count === 0) {
      db.prepare("DELETE FROM repositories WHERE id = ?").run(
        deployment.repositoryId,
      );
    }
  });

  transaction();
}
