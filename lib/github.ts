export type GitHubRepository = {
  id: number;
  name: string;
  fullName: string;
  owner: string;
  cloneUrl: string;
  url: string;
  defaultBranch: string;
  branches?: string[];
  visibility: "public" | "private" | "internal";
  description: string | null;
  updatedAt: string;
};

export type GitHubCommit = {
  authorName: string | null;
  committedAt: string | null;
  message: string;
  sha: string;
  url: string;
};

export type GitHubRepositoryReference = {
  fullName: string;
  name: string;
  owner: string;
  webUrl: string;
};

type GitHubRepositoryResponse = {
  id: number;
  name: string;
  full_name: string;
  clone_url: string;
  default_branch: string;
  private: boolean;
  visibility?: "public" | "private" | "internal";
  description: string | null;
  updated_at: string;
  owner: {
    login: string;
  };
};

type GitHubCommitResponse = {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author?: {
      date?: string | null;
      name?: string | null;
    } | null;
  };
};

const GITHUB_API_BASE = "https://api.github.com";
const COMMITS_PAGE_SIZE = 25;
const PAGE_SIZE = 100;
const MAX_PAGES = 5;

function mapVisibility(
  repository: Pick<GitHubRepositoryResponse, "private" | "visibility">,
): GitHubRepository["visibility"] {
  if (repository.visibility === "internal") {
    return "internal";
  }

  return repository.private ? "private" : "public";
}

function getGitHubErrorMessage(status: number) {
  switch (status) {
    case 401:
      return "GitHub rejected the token. Check that it is valid and has repository access.";
    case 403:
      return "GitHub refused the request. The token may be missing scope or the rate limit was hit.";
    default:
      return `GitHub repository request failed with status ${status}.`;
  }
}

export function parseGitHubRepositoryReference(
  repositoryUrl: string,
): GitHubRepositoryReference | null {
  try {
    const parsed = new URL(repositoryUrl);
    const hostname = parsed.hostname.replace(/^www\./i, "").toLowerCase();

    if (hostname !== "github.com") {
      return null;
    }

    const pathSegments = parsed.pathname
      .replace(/\.git$/i, "")
      .split("/")
      .filter(Boolean);

    if (pathSegments.length < 2) {
      return null;
    }

    const [owner, name] = pathSegments;

    return {
      fullName: `${owner}/${name}`,
      name,
      owner,
      webUrl: `https://github.com/${owner}/${name}`,
    };
  } catch {
    return null;
  }
}

export async function listGitHubRepositories(
  token: string,
): Promise<GitHubRepository[]> {
  const repositories: GitHubRepository[] = [];

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const response = await fetch(
      `${GITHUB_API_BASE}/user/repos?affiliation=owner,collaborator,organization_member&sort=updated&per_page=${PAGE_SIZE}&page=${page}`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
        cache: "no-store",
      },
    );

    if (!response.ok) {
      throw new Error(getGitHubErrorMessage(response.status));
    }

    const pageRepositories =
      (await response.json()) as GitHubRepositoryResponse[];

    repositories.push(
      ...pageRepositories.map((repository) => ({
        id: repository.id,
        name: repository.name,
        fullName: repository.full_name,
        owner: repository.owner.login,
        cloneUrl: repository.clone_url,
        url: repository.clone_url,
        defaultBranch: repository.default_branch,
        visibility: mapVisibility(repository),
        description: repository.description,
        updatedAt: repository.updated_at,
      })),
    );

    if (pageRepositories.length < PAGE_SIZE) {
      break;
    }
  }

  return repositories;
}

export async function listGitHubBranches(
  token: string,
  owner: string,
  repo: string,
): Promise<string[]> {
  const branches: string[] = [];
  const pageSize = 100;
  let page = 1;
  const maxPages = 10;

  while (page <= maxPages) {
    const response = await fetch(
      `${GITHUB_API_BASE}/repos/${owner}/${repo}/branches?per_page=${pageSize}&page=${page}`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
        cache: "no-store",
      },
    );

    if (!response.ok) {
      throw new Error(getGitHubErrorMessage(response.status));
    }

    const pageBranches = (await response.json()) as Array<{ name: string }>;

    branches.push(...pageBranches.map((branch) => branch.name));

    if (pageBranches.length < pageSize) {
      break;
    }

    page += 1;
  }

  return branches;
}

export async function listGitHubCommits(
  token: string,
  owner: string,
  repo: string,
  refName?: string,
): Promise<GitHubCommit[]> {
  const searchParams = new URLSearchParams({
    per_page: String(COMMITS_PAGE_SIZE),
  });

  if (refName) {
    searchParams.set("sha", refName);
  }

  const response = await fetch(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/commits?${searchParams.toString()}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(getGitHubErrorMessage(response.status));
  }

  const commits = (await response.json()) as GitHubCommitResponse[];

  return commits.map((commit) => ({
    authorName: commit.commit.author?.name ?? null,
    committedAt: commit.commit.author?.date ?? null,
    message: commit.commit.message.split("\n")[0] ?? "Commit",
    sha: commit.sha,
    url: commit.html_url,
  }));
}
