import { listGitHubBranches } from "@/lib/github";
import { getAppConfig } from "@/lib/app-config";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      owner: string;
      name: string;
    }>;
  }
) {
  try {
    const { owner, name } = await params;
    const config = getAppConfig();

    if (!config.security.githubToken) {
      return Response.json(
        { error: "GitHub token not configured" },
        { status: 400 }
      );
    }

    const branches = await listGitHubBranches(
      config.security.githubToken,
      owner,
      name
    );

    return Response.json({ branches }, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch branches";
    return Response.json(
      { error: message },
      { status: 400 }
    );
  }
}
