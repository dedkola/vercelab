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
        className="flex w-10 shrink-0 flex-col items-center gap-1 border-r py-2"
        aria-label="Primary navigation"
      >
        {RAIL_PRIMARY.map((entry) => (
          <Button
            aria-label={entry.label}
            className={entry.section === activeSection ? "bg-accent" : ""}
            key={entry.icon}
            onClick={() => {
              if (entry.section === activeSection) {
                onTogglePanelAction();
              } else {
                onSectionChangeAction(entry.section);
                if (isPanelCollapsed) {
                  onTogglePanelAction();
                }
              }
            }}
            type="button"
            variant="ghost"
            size="icon"
          >
            <Icon name={entry.icon} className="h-4 w-4" />
          </Button>
        ))}
      </aside>

      {isPanelCollapsed ? (
        <aside className="flex w-8 shrink-0 items-start justify-end border-r py-1">
          <Button
            type="button"
            aria-controls="gateway-panel"
            aria-label={`Show ${panelAriaLabel} panel`}
            onClick={onTogglePanelAction}
            variant="ghost"
            size="icon"
            className="h-6 w-6"
          >
            <Icon name="chevron-right" className="h-3.5 w-3.5" />
          </Button>
        </aside>
      ) : (
        <aside
          className="flex w-56 shrink-0 flex-col border-r"
          aria-label={panelAriaLabel}
          id="gateway-panel"
        >
          <div className="flex items-center justify-end px-1 py-1">
            <Button
              type="button"
              aria-controls="gateway-panel"
              aria-label={`Hide ${panelAriaLabel} panel`}
              onClick={onTogglePanelAction}
              variant="ghost"
              size="icon"
              className="h-6 w-6"
            >
              <Icon name="chevron-left" className="h-3.5 w-3.5" />
            </Button>
          </div>

          <ScrollArea
            className="h-[calc(100%-2rem)]"
            id="gateway-panel-content"
          >
            {children}
          </ScrollArea>
        </aside>
      )}
    </>
  );
}
