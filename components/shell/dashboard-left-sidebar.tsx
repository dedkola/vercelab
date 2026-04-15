"use client";

import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";

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

const DEFAULT_PANEL_WIDTH_PX = 224;
const MIN_PANEL_WIDTH_PX = 180;
const MAX_PANEL_WIDTH_PX = 520;
const STORAGE_KEY = "vercelab:left-sidebar-width";

export function DashboardLeftSidebar({
  activeSection,
  isPanelCollapsed,
  panelAriaLabel,
  onSectionChangeAction,
  onTogglePanelAction,
  children,
}: DashboardLeftSidebarProps) {
  const [panelWidth, setPanelWidth] = useState(() => {
    if (typeof window === "undefined") {
      return DEFAULT_PANEL_WIDTH_PX;
    }

    const storedWidth = window.localStorage.getItem(STORAGE_KEY);

    if (!storedWidth) {
      return DEFAULT_PANEL_WIDTH_PX;
    }

    const parsedWidth = Number.parseInt(storedWidth, 10);

    if (!Number.isFinite(parsedWidth)) {
      return DEFAULT_PANEL_WIDTH_PX;
    }

    return Math.min(
      MAX_PANEL_WIDTH_PX,
      Math.max(MIN_PANEL_WIDTH_PX, parsedWidth),
    );
  });
  const dragStateRef = useRef<{
    isDragging: boolean;
    startWidth: number;
    startX: number;
  }>({
    isDragging: false,
    startWidth: DEFAULT_PANEL_WIDTH_PX,
    startX: 0,
  });

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, String(Math.round(panelWidth)));
  }, [panelWidth]);

  useEffect(() => {
    function handleMouseMove(event: MouseEvent) {
      if (!dragStateRef.current.isDragging) {
        return;
      }

      const deltaX = event.clientX - dragStateRef.current.startX;
      const nextWidth = Math.min(
        MAX_PANEL_WIDTH_PX,
        Math.max(MIN_PANEL_WIDTH_PX, dragStateRef.current.startWidth + deltaX),
      );

      setPanelWidth(nextWidth);
    }

    function handleMouseUp() {
      if (!dragStateRef.current.isDragging) {
        return;
      }

      dragStateRef.current.isDragging = false;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, []);

  function handleResizeStart(event: ReactMouseEvent<HTMLDivElement>) {
    dragStateRef.current = {
      isDragging: true,
      startWidth: panelWidth,
      startX: event.clientX,
    };

    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  }

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
          className="relative flex shrink-0 flex-col border-r"
          aria-label={panelAriaLabel}
          id="gateway-panel"
          style={{ width: panelWidth }}
        >
          <div
            aria-hidden="true"
            className="absolute inset-y-0 right-0 z-10 w-1 translate-x-1/2 cursor-col-resize bg-transparent hover:bg-border"
            onMouseDown={handleResizeStart}
          />

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
