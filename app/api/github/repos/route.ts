import { getAppConfig } from "@/lib/app-config";
import { listGitHubRepositories } from "@/lib/github";

export const dynamic = "force-dynamic";

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Unable to load repositories from GitHub.";
}

export async function GET() {
  try {
    const token = getAppConfig().security.githubToken;

    if (!token) {
      throw new Error("Set a GitHub token before loading repositories.");
    }

    const repositories = await listGitHubRepositories(token);

    return Response.json({
      repositories,
      tokenConfigured: true,
    });
  } catch (error) {
    return Response.json(
      {
        error: getErrorMessage(error),
        repositories: [],
        tokenConfigured: Boolean(getAppConfig().security.githubToken),
      },
      {
        status: 400,
      },
    );
  }
}
