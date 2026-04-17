"use client";

type DashboardFooterProps = {
  activeSection: "overview" | "charts" | "git";
  updatedAtLabel: string;
};

export function DashboardFooter({
  activeSection,
  updatedAtLabel,
}: DashboardFooterProps) {
  return (
    <footer
      className="flex h-10 shrink-0 items-center justify-between border-t border-border/70 bg-linear-to-r from-background/96 via-muted/34 to-background/94 px-4 text-xs text-muted-foreground shadow-[0_-18px_42px_-34px_rgba(15,23,42,0.32)] backdrop-blur-sm"
      aria-label="Dashboard footer"
    >
      <span className="rounded-full border border-border/60 bg-background/72 px-2.5 py-1 text-[11px] shadow-[0_12px_28px_-24px_rgba(15,23,42,0.24)]">
        Section: {activeSection}
      </span>
      <span className="rounded-full border border-border/60 bg-background/72 px-2.5 py-1 text-[11px] shadow-[0_12px_28px_-24px_rgba(15,23,42,0.24)]">
        Updated: {updatedAtLabel}
      </span>
    </footer>
  );
}
