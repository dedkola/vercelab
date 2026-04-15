"use client";

type DashboardFooterProps = {
  activeSection: "overview" | "git";
  updatedAtLabel: string;
};

export function DashboardFooter({
  activeSection,
  updatedAtLabel,
}: DashboardFooterProps) {
  return (
    <footer
      className="flex h-7 shrink-0 items-center justify-between border-t border-zinc-200 px-3 text-xs text-zinc-500"
      aria-label="Dashboard footer"
    >
      <span>Section: {activeSection}</span>
      <span>Updated: {updatedAtLabel}</span>
    </footer>
  );
}
