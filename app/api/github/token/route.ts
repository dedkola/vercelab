import { z } from "zod";

import { updateProcessEnvValue } from "@/lib/app-config";
import { upsertWorkspaceEnvValue } from "@/lib/env-file";
import { listGitHubRepositories } from "@/lib/github";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  token: z.string().trim().min(20, "GitHub token looks too short."),
});

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Unable to update the GitHub token.";
}

export async function POST(request: Request) {
  try {
    const payload = requestSchema.parse(await request.json());
    const repositories = await listGitHubRepositories(payload.token);

    await upsertWorkspaceEnvValue("VERCELAB_GITHUB_TOKEN", payload.token);
    updateProcessEnvValue("VERCELAB_GITHUB_TOKEN", payload.token);

    return Response.json({
      repositories,
      tokenConfigured: true,
    });
  } catch (error) {
    return Response.json(
      {
        error: getErrorMessage(error),
      },
      {
        status: 400,
      },
    );
  }
}
