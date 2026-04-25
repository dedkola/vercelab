import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

function parseImageName(image: string): {
  registry: string | null;
  namespace: string | null;
  name: string;
} {
  const trimmed = image.split(":")[0] ?? image;
  const parts = trimmed.split("/");

  if (parts.length === 1) {
    return { registry: null, namespace: null, name: parts[0] ?? "" };
  }

  const maybeRegistry = parts[0] ?? "";
  const hasRegistryPrefix =
    maybeRegistry.includes(".") || maybeRegistry.includes(":");

  if (hasRegistryPrefix) {
    return {
      registry: maybeRegistry,
      namespace: parts[1] ?? null,
      name: parts[2] ?? parts[1] ?? "",
    };
  }

  if (parts.length === 2) {
    return { registry: null, namespace: parts[0] ?? null, name: parts[1] ?? "" };
  }

  return { registry: null, namespace: parts[0] ?? null, name: parts.slice(1).join("/") };
}

async function fetchDockerHubTags(
  namespace: string | null,
  name: string,
): Promise<string[]> {
  const repo = namespace ? `${namespace}/${name}` : `library/${name}`;
  const url = `https://hub.docker.com/v2/repositories/${repo}/tags?page_size=25&ordering=last_updated`;

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    next: { revalidate: 300 },
  });

  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as {
    results?: Array<{ name?: string }>;
  };

  return (payload.results ?? [])
    .map((r) => r.name ?? "")
    .filter((tag) => tag.length > 0)
    .slice(0, 25);
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Unable to fetch image tags.";
}

export async function GET(request: NextRequest) {
  const image = request.nextUrl.searchParams.get("image")?.trim() ?? "";

  if (!image) {
    return Response.json({ tags: [] });
  }

  try {
    const { registry, namespace, name } = parseImageName(image);

    if (registry) {
      // Non-Docker-Hub registry (e.g. ghcr.io, quay.io) — tag API not available
      return Response.json({ tags: [] });
    }

    const tags = await fetchDockerHubTags(namespace, name);
    return Response.json({ tags });
  } catch (error) {
    return Response.json(
      { error: getErrorMessage(error), tags: [] },
      { status: 200 },
    );
  }
}
