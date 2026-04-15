"use client";

import type { ReactNode } from "react";

import { Icon } from "@/components/dashboard-kit";

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
      className={`panel-right ${isCollapsed ? "panel-right--collapsed" : ""}`}
      aria-label="Deployment logs sidebar"
      id="logs-panel"
    >
      <button
        className="panel-right__collapse"
        type="button"
        aria-controls="logs-panel"
        aria-label={isCollapsed ? "Show logs panel" : "Hide logs panel"}
        onClick={onToggleAction}
      >
        <Icon name={isCollapsed ? "chevron-left" : "chevron-right"} />
      </button>

      {!isCollapsed ? (
        <div className="panel-right__content">{children}</div>
      ) : null}
    </aside>
  );
}
