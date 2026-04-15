"use client";

import type { ReactNode } from "react";

import { Icon } from "@/components/dashboard-kit";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

type DashboardSection = "overview" | "git";

type DashboardLeftSidebarProps = {
  activeSection: DashboardSection;
  isPanelCollapsed: boolean;
  panelAriaLabel: string;
  onSectionChangeAction: (section: DashboardSection) => void;
  onTogglePanelAction: () => void;
  children: ReactNode;
};

const RAIL_PRIMARY: Array<{
  icon: "network" | "cloud";
  label: string;
  section: DashboardSection;
}> = [
  { icon: "network", label: "Overview", section: "overview" },
  { icon: "cloud", label: "Git", section: "git" },
];

export function DashboardLeftSidebar({
  activeSection,
  isPanelCollapsed,
  panelAriaLabel,
  onSectionChangeAction,
  onTogglePanelAction,
  children,
}: DashboardLeftSidebarProps) {
  return (
    <>
      <aside
        className="flex w-10 shrink-0 flex-col items-center gap-1 border-r border-zinc-200 py-2"
        aria-label="Primary navigation"
      >
        {RAIL_PRIMARY.map((entry) => (
          <Button
            aria-label={entry.label}
            className={entry.section === activeSection ? "bg-zinc-100" : ""}
            key={entry.icon}
            onClick={() => onSectionChangeAction(entry.section)}
            type="button"
            variant="ghost"
            size="icon"
          >
            <Icon name={entry.icon} className="h-4 w-4" />
          </Button>
        ))}
      </aside>

      <aside
        className={`shrink-0 border-r border-zinc-200 transition-all ${isPanelCollapsed ? "w-0 overflow-hidden border-0" : "w-56"}`}
        aria-label={panelAriaLabel}
        id="gateway-panel"
      >
        <div className="flex items-center justify-end px-1 py-1">
          <Button
            type="button"
            aria-controls="gateway-panel"
            aria-label={
              isPanelCollapsed
                ? `Show ${panelAriaLabel} panel`
                : `Hide ${panelAriaLabel} panel`
            }
            onClick={onTogglePanelAction}
            variant="ghost"
            size="icon"
            className="h-6 w-6"
          >
            <Icon
              name={isPanelCollapsed ? "chevron-right" : "chevron-left"}
              className="h-3.5 w-3.5"
            />
          </Button>
        </div>

        {!isPanelCollapsed ? (
          <ScrollArea
            className="h-[calc(100%-2rem)]"
            id="gateway-panel-content"
          >
            {children}
          </ScrollArea>
        ) : null}
      </aside>
    </>
  );
}
