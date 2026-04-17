"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

type WorkspaceHeaderProps = {
  activePageDescription: string;
  activePageLabel: string;
  activePageStatusLabel: string;
  onResetLayoutAction: () => void;
  title: string;
};

export function WorkspaceHeader({
  activePageDescription,
  activePageLabel,
  activePageStatusLabel,
  onResetLayoutAction,
  title,
}: WorkspaceHeaderProps) {
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
          <div className="truncate text-xs text-muted-foreground">
            {activePageDescription}
          </div>
        </div>
      </div>

      <div className="hidden min-w-0 flex-1 items-center justify-center gap-2 xl:flex">
        <Badge className="border-emerald-200/80 bg-emerald-50/90 text-emerald-700">
          {activePageStatusLabel}
        </Badge>
        <Badge className="border-amber-200/80 bg-amber-50/90 text-amber-700">
          {activePageLabel}
        </Badge>
        <Badge className="border-border/60 bg-background/80 text-foreground">
          Shared shell
        </Badge>
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
