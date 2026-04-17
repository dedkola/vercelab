import { render, screen } from "@testing-library/react";

import { DashboardRightSidebar } from "@/components/shell/dashboard-right-sidebar";

vi.mock("@/components/dashboard-kit", () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

describe("DashboardRightSidebar", () => {
  it("keeps the scroll viewport width constrained to the sidebar", () => {
    const { container } = render(
      <DashboardRightSidebar isCollapsed={false} onToggleAction={vi.fn()}>
        <div>Sidebar body</div>
      </DashboardRightSidebar>,
    );

    expect(
      screen.getByRole("complementary", { name: "Deployment logs sidebar" }),
    ).toHaveClass("min-w-0", "overflow-hidden");

    const scrollRoot = container.querySelector(
      "[data-radix-scroll-area-viewport]",
    )?.parentElement;

    expect(scrollRoot).toHaveClass("min-w-0");
    expect(scrollRoot?.className).toContain(
      "[&>[data-radix-scroll-area-viewport]>div]:w-full!",
    );
  });
});
