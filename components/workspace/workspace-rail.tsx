"use client";

import type { LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect } from "react";

import type { WorkspaceView } from "@/components/workspace-shell";
import { cn } from "@/lib/utils";

type WorkspaceRailItem = {
  description: string;
  external?: boolean;
  href?: string;
  iconComponent: LucideIcon;
  id: string;
  label: string;
  view?: WorkspaceView;
};

type WorkspaceRailProps = {
  activeView: WorkspaceView;
  items: WorkspaceRailItem[];
  onViewChangeAction: (view: WorkspaceView) => void;
  onViewPrefetchAction?: (view: WorkspaceView) => void;
};

function getWorkspaceRailHref(view: WorkspaceView) {
  const pathname =
    view === "dashboard"
      ? "/"
      : view === "terminal"
        ? "/terminal"
      : view === "git-app-page"
        ? "/git-app-page"
        : "/containers";

  if (typeof window === "undefined") {
    return pathname;
  }

  const searchParams = new URLSearchParams(window.location.search);
  const range = searchParams.get("range");

  if (!range) {
    return pathname;
  }

  const nextSearchParams = new URLSearchParams({
    range,
  });

  return `${pathname}?${nextSearchParams.toString()}`;
}

export function WorkspaceRail({
  activeView,
  items,
  onViewChangeAction,
  onViewPrefetchAction,
}: WorkspaceRailProps) {
  const router = useRouter();

  const prefetchView = useCallback(
    (view: WorkspaceView) => {
      if (view === activeView) {
        return;
      }

      void router.prefetch(getWorkspaceRailHref(view));
      onViewPrefetchAction?.(view);
    },
    [activeView, onViewPrefetchAction, router],
  );

  useEffect(() => {
    items.forEach((item) => {
      if (item.view) {
        prefetchView(item.view);
      }
    });
  }, [items, prefetchView]);

  return (
    <aside className="flex w-11 shrink-0 flex-col items-center gap-2 border-r border-border/70 bg-background px-1.5 py-2">
      <div className="flex w-full flex-col gap-1">
        {items.map((item) => {
          const isActive = item.view === activeView;
          const isExternal = item.external && item.href;
          const PageIcon = item.iconComponent;

          return (
            <button
              aria-label={item.label}
              className={cn(
                "group flex h-8 w-8 items-center justify-center rounded-lg border-0 bg-transparent transition-colors",
                isActive
                  ? "bg-emerald-50 text-emerald-700"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              )}
              key={item.id}
              onClick={() => {
                if (isExternal) {
                  window.open(item.href, "_blank", "noopener,noreferrer");
                  return;
                }

                if (item.view) {
                  onViewChangeAction(item.view);
                }
              }}
              onFocus={() => {
                if (item.view) {
                  prefetchView(item.view);
                }
              }}
              onMouseEnter={() => {
                if (item.view) {
                  prefetchView(item.view);
                }
              }}
              title={item.description}
              type="button"
            >
              <PageIcon
                className={cn(
                  "h-4 w-4",
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
