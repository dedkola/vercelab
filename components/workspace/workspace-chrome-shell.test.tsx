import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WorkspaceChromeShell } from "@/components/workspace/workspace-chrome-shell";

const pushMock = vi.fn();
const prefetchMock = vi.fn();

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
    ...init,
  });
}

function getRequestUrl(input: Parameters<typeof fetch>[0]) {
  if (typeof input === "string") {
    return input;
  }

  if (input instanceof URL) {
    return input.toString();
  }

  return input.url;
}

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({
    push: pushMock,
    prefetch: prefetchMock,
  }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/components/workspace/host-metrics-sidebar", () => ({
  HostMetricsSidebar: () => <div data-testid="host-metrics-sidebar" />,
}));

vi.mock("@/components/workspace/workspace-footer", () => ({
  WorkspaceFooter: () => <div data-testid="workspace-footer" />,
}));

vi.mock("@/components/workspace/workspace-header", () => ({
  WorkspaceHeader: () => <div data-testid="workspace-header" />,
}));

describe("WorkspaceChromeShell", () => {
  const fetchSpy = vi.spyOn(global, "fetch");

  beforeEach(() => {
    pushMock.mockReset();
    prefetchMock.mockReset();
    fetchSpy.mockImplementation(async (input) => {
      const url = getRequestUrl(input);

      if (url === "/api/github/repos") {
        return jsonResponse({
          repositories: [],
          tokenConfigured: false,
        });
      }

      if (url.startsWith("/api/metrics?")) {
        return jsonResponse({
          history: [],
          snapshot: null,
        });
      }

      return jsonResponse({});
    });
    vi.spyOn(window, "open").mockImplementation(() => null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders view-aware rail items and opens the explorer from shared chrome", async () => {
    const user = userEvent.setup();

    render(
      <WorkspaceChromeShell
        influxExplorerUrl="https://influx.home.com"
        initialHistory={[]}
        initialSnapshot={null}
      >
        <div>Embedded content</div>
      </WorkspaceChromeShell>,
    );

    await waitFor(() => {
      expect(prefetchMock).toHaveBeenCalledWith("/git-app-page");
      expect(prefetchMock).toHaveBeenCalledWith("/containers");
    });

    await user.click(screen.getByRole("button", { name: "Git App Page" }));
    expect(pushMock).toHaveBeenCalledWith("/git-app-page");

    await user.click(screen.getByRole("button", { name: "Containers" }));
    expect(pushMock).toHaveBeenCalledWith("/containers");

    await user.click(
      screen.getByRole("button", { name: "Influx Explorer" }),
    );
    expect(window.open).toHaveBeenCalledWith(
      "https://influx.home.com",
      "_blank",
      "noopener,noreferrer",
    );
  });
});