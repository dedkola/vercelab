"use client";

import type { ReactNode } from "react";

import { Icon } from "@/components/dashboard-kit";

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
      <aside className="rail" aria-label="Primary navigation">
        <div className="rail__group">
          {RAIL_PRIMARY.map((entry) => (
            <button
              aria-label={entry.label}
              className={`rail__link ${
                entry.section === activeSection ? "rail__link--active" : ""
              }`}
              key={entry.icon}
              onClick={() => onSectionChangeAction(entry.section)}
              type="button"
            >
              <Icon name={entry.icon} />
            </button>
          ))}
        </div>
      </aside>

      <aside
        className={`panel ${isPanelCollapsed ? "panel--collapsed" : ""}`}
        aria-label={panelAriaLabel}
        id="gateway-panel"
      >
        <button
          className="panel__collapse"
          type="button"
          aria-controls="gateway-panel"
          aria-label={
            isPanelCollapsed
              ? `Show ${panelAriaLabel} panel`
              : `Hide ${panelAriaLabel} panel`
          }
          onClick={onTogglePanelAction}
        >
          <Icon name={isPanelCollapsed ? "chevron-right" : "chevron-left"} />
        </button>

        {!isPanelCollapsed ? (
          <div className="panel__content" id="gateway-panel-content">
            {children}
          </div>
        ) : null}
      </aside>
    </>
  );
}
