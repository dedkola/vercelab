import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DashboardLeftSidebar } from "@/components/shell/dashboard-left-sidebar";

vi.mock("@/components/dashboard-kit", () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

describe("DashboardLeftSidebar", () => {
  it("navigates into the git workspace from the rail", async () => {
    const user = userEvent.setup();
    const onSectionChangeAction = vi.fn();

    render(
      <DashboardLeftSidebar
        activeSection="overview"
        isPanelCollapsed={false}
        panelAriaLabel="system metrics"
        onSectionChangeAction={onSectionChangeAction}
        onTogglePanelAction={vi.fn()}
      >
        <div>Sidebar body</div>
      </DashboardLeftSidebar>,
    );

    await user.click(screen.getByRole("button", { name: "Git apps" }));

    expect(onSectionChangeAction).toHaveBeenCalledWith("git");
  });
});
