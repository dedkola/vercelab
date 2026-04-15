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
    <aside
      className={`shrink-0 border-l transition-all ${isCollapsed ? "w-0 overflow-hidden border-0" : "w-72"}`}
      aria-label="Deployment logs sidebar"
      id="logs-panel"
    >
      <div className="flex items-center justify-start px-1 py-1">
        <Button
          type="button"
          aria-controls="logs-panel"
          aria-label={isCollapsed ? "Show logs panel" : "Hide logs panel"}
          onClick={onToggleAction}
          variant="ghost"
          size="icon"
          className="h-6 w-6"
        >
          <Icon
            name={isCollapsed ? "chevron-left" : "chevron-right"}
            className="h-3.5 w-3.5"
          />
        </Button>
      </div>

      {!isCollapsed ? (
        <ScrollArea className="h-[calc(100%-2rem)]">{children}</ScrollArea>
      ) : null}
    </aside>
  );
}
