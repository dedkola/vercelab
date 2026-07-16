"use client";

type WorkspaceFooterProps = {
  activeViewLabel: string;
  updatedAtLabel: string;
};

export function WorkspaceFooter({
  activeViewLabel,
  updatedAtLabel,
}: WorkspaceFooterProps) {
  return (
    <footer
      aria-label="Workspace footer"
      className="flex h-8 shrink-0 items-center justify-between border-t border-border/70 bg-background/95 px-4 text-[11px] text-muted-foreground backdrop-blur"
    >
      <span className="rounded-md border border-border/60 bg-background px-2 py-0.5">
        Page: {activeViewLabel}
      </span>
      <span className="rounded-md border border-border/60 bg-background px-2 py-0.5">
        Updated: {updatedAtLabel}
      </span>
    </footer>
  );
}
