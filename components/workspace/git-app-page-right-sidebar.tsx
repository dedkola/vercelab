"use client";

import type { MouseEvent as ReactMouseEvent } from "react";

import { Icon } from "@/components/dashboard-kit";
import { GitLogPanel, type LogTab } from "@/components/git-log-panel";
import { Button } from "@/components/ui/button";
import type { DeploymentSummary } from "@/lib/persistence";

import { ResizeHandle, SectionLabel, usePixelWidthRef } from "./workspace-ui";

type GitAppPageRightSidebarProps = {
  activeLogTab: LogTab;
  deploymentId: string | null;
  deployments: DeploymentSummary[];
  isCollapsed: boolean;
  onCollapseAction: () => void;
  onExpandAction: () => void;
  onLogTabChangeAction: (tab: LogTab) => void;
  onResizeStartAction: (event: ReactMouseEvent<HTMLDivElement>) => void;
  width: number;
};

export function GitAppPageRightSidebar({
  activeLogTab,
  deploymentId,
  deployments,
  isCollapsed,
  onCollapseAction,
  onExpandAction,
  onLogTabChangeAction,
  onResizeStartAction,
  width,
}: GitAppPageRightSidebarProps) {
  const panelRef = usePixelWidthRef<HTMLElement>(width);

  if (isCollapsed) {
    return (
      <aside className="flex w-11 shrink-0 items-start border-l border-border/70 bg-linear-to-b from-background via-muted/26 to-background px-1.5 py-2 shadow-[-20px_0_54px_-44px_rgba(15,23,42,0.3)]">
        <Button
          aria-label="Show logs sidebar"
          className="h-7 w-7"
          onClick={onExpandAction}
          size="icon"
          type="button"
          variant="ghost"
        >
          <Icon name="chevron-left" className="h-3.5 w-3.5" />
        </Button>
      </aside>
    );
  }

  return (
    <>
      <ResizeHandle onMouseDown={onResizeStartAction} />

      <aside
        className="flex shrink-0 flex-col border-l border-border/70 bg-linear-to-b from-background via-muted/16 to-background shadow-[-22px_0_72px_-58px_rgba(15,23,42,0.34)] transition-[width] duration-300"
        ref={panelRef}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border/60 px-3 py-3">
          <div className="space-y-1">
            <SectionLabel icon="syslog" text="Logs" />
            <div className="text-xs text-muted-foreground">
              Build and container output for the selected deployment.
            </div>
          </div>
          <Button
            aria-label="Hide logs sidebar"
            className="h-7 w-7"
            onClick={onCollapseAction}
            size="icon"
            type="button"
            variant="ghost"
          >
            <Icon name="chevron-right" className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="min-h-0 flex-1">
          <GitLogPanel
            currentView={deploymentId ? "detail" : "list"}
            deploymentId={deploymentId}
            deployments={deployments}
            initialActiveLogTab={activeLogTab}
            onLogTabChangeAction={onLogTabChangeAction}
            showHeader={false}
          />
        </div>
      </aside>
    </>
  );
}
