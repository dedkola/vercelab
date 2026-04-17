"use client";

import type { LucideIcon } from "lucide-react";

import type { WorkspaceView } from "@/components/workspace-shell";
import { cn } from "@/lib/utils";

type WorkspaceRailItem = {
  description: string;
  iconComponent: LucideIcon;
  id: WorkspaceView;
  label: string;
};

type WorkspaceRailProps = {
  activeView: WorkspaceView;
  items: WorkspaceRailItem[];
  onViewChangeAction: (view: WorkspaceView) => void;
};

export function WorkspaceRail({
  activeView,
  items,
  onViewChangeAction,
}: WorkspaceRailProps) {
  return (
    <aside className="flex w-14 shrink-0 flex-col items-center gap-3 border-r border-border/70 bg-linear-to-b from-background via-muted/22 to-background px-2 py-3 shadow-[16px_0_48px_-44px_rgba(15,23,42,0.26)]">
      <div className="flex w-full flex-col gap-2 pt-1">
        {items.map((item) => {
          const isActive = item.id === activeView;
          const PageIcon = item.iconComponent;

          return (
            <button
              aria-label={item.label}
              className={cn(
                "group flex w-full items-center justify-center border-0 bg-transparent p-2.5 transition-all duration-200",
                isActive
                  ? "text-emerald-700"
                  : "text-muted-foreground hover:text-foreground",
              )}
              key={item.id}
              onClick={() => onViewChangeAction(item.id)}
              title={item.description}
              type="button"
            >
              <PageIcon
                className={cn(
                  "h-4 w-4 transition-transform duration-200 group-hover:-translate-y-px",
                  isActive ? "text-emerald-700" : "text-current",
                )}
              />
            </button>
          );
        })}
      </div>
    </aside>
  );
}
