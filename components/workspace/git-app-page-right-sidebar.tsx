'use client';

import type { MouseEvent as ReactMouseEvent } from 'react';

import { Icon } from '@/components/dashboard-kit';
import { GitLogPanel, type LogTab } from '@/components/git-log-panel';
import { Button } from '@/components/ui/button';
import type { DeploymentSummary } from '@/lib/persistence';

import { ResizeHandle } from './workspace-ui';

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
  if (isCollapsed) {
    return (
      <aside className="vercelab-context-rail flex w-11 shrink-0 items-start border-l border-border/70 bg-[var(--surface-subtle)] px-1.5 py-2">
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
        className="vercelab-context-rail flex shrink-0 flex-col border-l border-border/70 bg-background transition-[width] duration-300"
        style={{ width: `${width}px` }}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border/70 px-3 py-3">
          <div className="min-w-0">
            <div className="font-mono text-[10px] font-semibold tracking-[0.1em] text-foreground uppercase">
              Logs
            </div>
            <div className="mt-0.5 truncate font-mono text-[9px] text-[var(--quiet)]">
              Build + runtime output
            </div>
          </div>
          <Button
            aria-label="Hide logs sidebar"
            className="h-6 w-6"
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
            currentView={deploymentId ? 'detail' : 'list'}
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
