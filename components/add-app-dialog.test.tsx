import { render, screen, waitFor } from "@testing-library/react";

import { AddAppDialog } from "@/components/add-app-dialog";
import type { GitHubRepository } from "@/lib/github";

vi.mock("@/components/dashboard-kit", () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

const repository: GitHubRepository = {
  id: 1,
  name: "my-repo",
  fullName: "ded/my-repo",
  owner: "ded",
  cloneUrl: "https://github.com/ded/my-repo.git",
  url: "https://github.com/ded/my-repo.git",
  defaultBranch: "main",
  visibility: "private",
  description: null,
  updatedAt: new Date().toISOString(),
  branches: ["main", "dev"],
};

describe("AddAppDialog", () => {
  it("renders two-column grouped layout and hydrates values from selected repository", async () => {
    const onSubmit = vi.fn();
    const onOpenChange = vi.fn();
    const onRepositorySelect = vi.fn();

    const { rerender } = render(
      <AddAppDialog
        baseDomain="home.com"
        isOpen
        isLoading={false}
        isCreating={false}
        repositories={[repository]}
        tokenConfigured
        error={null}
        onOpenChange={onOpenChange}
        onRepositorySelect={onRepositorySelect}
        onSubmit={onSubmit}
        selectedRepositoryId=""
        selectedRepository={null}
      />,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveClass("max-w-3xl");
    expect(
      screen.getByText(
        "Connect a repository, pick a branch, and launch a new deployment.",
      ),
    ).toBeInTheDocument();

    const fieldGrid = screen
      .getByLabelText("App Name")
      .closest("div")
      ?.parentElement;
    expect(fieldGrid).toHaveClass("md:grid-cols-2");

    const urlFieldWrapper = screen.getByText("URL").closest("div");
    expect(urlFieldWrapper).toHaveClass("md:col-span-2");

    rerender(
      <AddAppDialog
        baseDomain="home.com"
        isOpen
        isLoading={false}
        isCreating={false}
        repositories={[repository]}
        tokenConfigured
        error={null}
        onOpenChange={onOpenChange}
        onRepositorySelect={onRepositorySelect}
        onSubmit={onSubmit}
        selectedRepositoryId="1"
        selectedRepository={repository}
      />,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("App Name")).toHaveValue("My Repo");
      expect(screen.getByLabelText("URL")).toHaveValue("my-repo");
    });

    const branchHiddenInput = document.querySelector(
      'input[type="hidden"][name="branch"]',
    ) as HTMLInputElement | null;

    expect(branchHiddenInput?.value).toBe("main");
  });
});
