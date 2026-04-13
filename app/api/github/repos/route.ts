import { z } from "zod";

import { listGitHubRepositories } from "@/lib/github";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  token: z.string().trim().min(20, "GitHub token looks too short."),
});

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Unable to load repositories from GitHub.";
}

export async function POST(request: Request) {
  try {
    const payload = requestSchema.parse(await request.json());
    const repositories = await listGitHubRepositories(payload.token);

    return Response.json({ repositories });
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
