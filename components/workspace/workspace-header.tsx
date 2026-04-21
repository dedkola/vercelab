"use client";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

type WorkspaceHeaderStatusPill = {
  label: string;
};

type WorkspaceHeaderProps = {
  activeViewDescription: string;
  activeViewLabel: string;
  activeViewStatusLabel: string;
  onResetLayoutAction: () => void;
  statusPills?: WorkspaceHeaderStatusPill[];
  title: string;
};

export function WorkspaceHeader({
  activeViewLabel,
  activeViewStatusLabel,
  onResetLayoutAction,
  statusPills,
  title,
}: WorkspaceHeaderProps) {
  const headerItems = statusPills?.length
    ? statusPills
    : [
        { label: activeViewStatusLabel },
        { label: activeViewLabel },
        { label: "Shared shell" },
      ];

  return (
    <header className="flex h-15 shrink-0 items-center justify-between gap-4 border-b border-border/70 bg-linear-to-r from-background/98 via-muted/40 to-background/96 px-4 shadow-[0_20px_48px_-38px_rgba(15,23,42,0.45)] backdrop-blur-xl">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex items-center gap-2 rounded-full border border-border/70 bg-background/85 px-3.5 py-1.5 shadow-[0_16px_36px_-28px_rgba(15,23,42,0.35)]">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          <span className="text-sm font-semibold tracking-tight text-foreground">
            Vercelab
          </span>
        </div>
        <Separator orientation="vertical" className="hidden h-5 md:block" />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold tracking-tight text-foreground">
            {title}
          </div>
        </div>
      </div>

      <div className="hidden min-w-0 flex-1 items-center justify-center overflow-hidden xl:flex">
        <div className="flex min-w-0 flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs font-medium tracking-tight text-muted-foreground/85">
          {headerItems.map((item, index) => (
            <div className="flex min-w-0 items-center gap-3" key={item.label}>
              {index > 0 ? (
                <span
                  aria-hidden="true"
                  className="h-1 w-1 shrink-0 rounded-full bg-border/90"
                />
              ) : null}
              <span className="truncate whitespace-nowrap">{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Button
          className="h-8 px-3 text-[11px]"
          onClick={onResetLayoutAction}
          size="sm"
          type="button"
          variant="secondary"
        >
          Reset layout
        </Button>
      </div>
    </header>
  );
}
