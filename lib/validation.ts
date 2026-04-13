import { z } from "zod";

const repositoryUrlPattern = /^https:\/\/[^\s/]+\/.+/;
const slugPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const serviceNamePattern = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

export const createDeploymentSchema = z.object({
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
});

export const deploymentActionSchema = z.object({
  deploymentId: z.string().uuid("Deployment id is invalid."),
});

export type CreateDeploymentInput = z.infer<typeof createDeploymentSchema>;
