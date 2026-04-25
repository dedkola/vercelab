import { z } from "zod";

const repositoryUrlPattern = /^https:\/\/[^\s/]+\/.+/;
const commitShaPattern = /^[0-9a-f]{7,40}$/i;
const slugPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const serviceNamePattern = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;

export const EXPOSURE_MODES = ["http", "tcp", "host", "internal"] as const;
export type ExposureMode = (typeof EXPOSURE_MODES)[number];

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeOptionalNumber(value: unknown): unknown {
  if (value === "" || value === null || value === undefined) {
    return undefined;
  }
  return value;
}

const hostPortSchema = z.preprocess(
  normalizeOptionalNumber,
  z.coerce
    .number()
    .int()
    .min(1, "Host port must be between 1 and 65535.")
    .max(65535, "Host port must be between 1 and 65535.")
    .optional(),
);

function requireHostPortForExternalModes<
  T extends { exposureMode: ExposureMode; hostPort?: number },
>(data: T, ctx: z.RefinementCtx) {
  if (
    (data.exposureMode === "tcp" || data.exposureMode === "host") &&
    !data.hostPort
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Host port is required for TCP and Host exposure modes.",
      path: ["hostPort"],
    });
  }
}

export const createDeploymentSchema = z
  .object({
    repositoryUrl: z
      .string()
      .trim()
      .regex(repositoryUrlPattern, "Use an HTTPS git repository URL."),
    githubToken: z.preprocess(
      normalizeOptionalString,
      z.string().min(20, "GitHub token looks too short.").optional(),
    ),
    branch: z.preprocess(
      normalizeOptionalString,
      z.string().min(1).max(120).optional(),
    ),
    serviceName: z.preprocess(
      normalizeOptionalString,
      z
        .string()
        .regex(
          serviceNamePattern,
          "Service name can only contain letters, numbers, dots, dashes, and underscores.",
        )
        .optional(),
    ),
    appName: z
      .string()
      .trim()
      .min(2, "App name is too short.")
      .max(60, "App name is too long."),
    subdomain: z
      .string()
      .trim()
      .toLowerCase()
      .regex(
        slugPattern,
        "Subdomain must be lowercase letters, numbers, or dashes.",
      ),
    port: z.coerce
      .number()
      .int()
      .min(1, "Port must be between 1 and 65535.")
      .max(65535, "Port must be between 1 and 65535."),
    exposureMode: z.enum(EXPOSURE_MODES).default("http"),
    hostPort: hostPortSchema,
    envVariables: z.preprocess(
      normalizeOptionalString,
      z
        .string()
        .max(12000, "Environment variables payload is too large.")
        .optional(),
    ),
  })
  .superRefine(requireHostPortForExternalModes);

export const deploymentActionSchema = z.object({
  deploymentId: z.string().uuid("Deployment id is invalid."),
});

export const updateDeploymentSettingsSchema = deploymentActionSchema
  .extend({
    appName: z
      .string()
      .trim()
      .min(2, "App name is too short.")
      .max(60, "App name is too long."),
    branch: z.preprocess(
      normalizeOptionalString,
      z.string().min(1).max(120).optional(),
    ),
    commitSha: z.preprocess(
      normalizeOptionalString,
      z
        .string()
        .regex(commitShaPattern, "Commit must be a valid git SHA.")
        .optional(),
    ),
    subdomain: z
      .string()
      .trim()
      .toLowerCase()
      .regex(
        slugPattern,
        "Subdomain must be lowercase letters, numbers, or dashes.",
      ),
    port: z.coerce
      .number()
      .int()
      .min(1, "Port must be between 1 and 65535.")
      .max(65535, "Port must be between 1 and 65535."),
    exposureMode: z.enum(EXPOSURE_MODES).default("http"),
    hostPort: hostPortSchema,
    envVariables: z.preprocess(
      normalizeOptionalString,
      z
        .string()
        .max(12000, "Environment variables payload is too large.")
        .optional(),
    ),
  })
  .superRefine(requireHostPortForExternalModes);

export type CreateDeploymentInput = z.infer<typeof createDeploymentSchema>;
export type UpdateDeploymentSettingsInput = z.infer<
  typeof updateDeploymentSettingsSchema
>;
