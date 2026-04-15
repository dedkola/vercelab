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
    <footer className="shell-footer" aria-label="Dashboard footer">
      <span className="shell-footer__section">Section: {activeSection}</span>
      <span className="shell-footer__updated">Updated: {updatedAtLabel}</span>
    </footer>
  );
}
