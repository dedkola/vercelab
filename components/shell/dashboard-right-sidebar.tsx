"use client";

import type { ReactNode } from "react";

import { Icon } from "@/components/dashboard-kit";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

type DashboardRightSidebarProps = {
  isCollapsed: boolean;
  onToggleAction: () => void;
  children: ReactNode;
};

export function DashboardRightSidebar({
  isCollapsed,
  onToggleAction,
  children,
}: DashboardRightSidebarProps) {
  return (
    <>
      {isCollapsed ? (
        <aside className="flex w-8 shrink-0 items-start border-l py-1">
          <Button
            type="button"
            aria-controls="logs-panel"
            aria-label="Show logs panel"
            onClick={onToggleAction}
            variant="ghost"
            size="icon"
            className="h-6 w-6"
          >
            <Icon name="chevron-left" className="h-3.5 w-3.5" />
          </Button>
        </aside>
      ) : (
        <aside
          className="flex w-72 shrink-0 flex-col border-l transition-all"
          aria-label="Deployment logs sidebar"
          id="logs-panel"
        >
          <div className="flex items-center justify-start px-1 py-1">
            <Button
              type="button"
              aria-controls="logs-panel"
              aria-label="Hide logs panel"
              onClick={onToggleAction}
              variant="ghost"
              size="icon"
              className="h-6 w-6"
            >
              <Icon name="chevron-right" className="h-3.5 w-3.5" />
            </Button>
          </div>

          <ScrollArea className="h-[calc(100%-2rem)]">{children}</ScrollArea>
        </aside>
      )}
    </>
  );
}
