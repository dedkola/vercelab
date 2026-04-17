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
import { cn } from "@/lib/utils";

type DashboardSection = "overview" | "charts" | "git";

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
  { icon: "network", label: "Home", section: "overview" },
  { icon: "cloud", label: "Git apps", section: "git" },
];

const DEFAULT_PANEL_WIDTH_PX = 224;
const MIN_PANEL_WIDTH_PX = 180;
const MAX_PANEL_WIDTH_PX = 520;
const STORAGE_KEY = "vercelab:left-sidebar-width";

function getStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  const storage = window.localStorage;

  if (
    !storage ||
    typeof storage.getItem !== "function" ||
    typeof storage.setItem !== "function"
  ) {
    return null;
  }

  return storage;
}

export function DashboardLeftSidebar({
  activeSection,
  isPanelCollapsed,
  panelAriaLabel,
  onSectionChangeAction,
  onTogglePanelAction,
  children,
}: DashboardLeftSidebarProps) {
  const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH_PX);
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
    const storedWidth = getStorage()?.getItem(STORAGE_KEY);

    if (!storedWidth) {
      return;
    }

    const parsedWidth = Number.parseInt(storedWidth, 10);

    if (!Number.isFinite(parsedWidth)) {
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPanelWidth(
      Math.min(MAX_PANEL_WIDTH_PX, Math.max(MIN_PANEL_WIDTH_PX, parsedWidth)),
    );
  }, []);

  useEffect(() => {
    getStorage()?.setItem(STORAGE_KEY, String(Math.round(panelWidth)));
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
        className="flex w-12 shrink-0 flex-col items-center gap-2 border-r border-border/70 bg-linear-to-b from-background via-muted/42 to-background px-1.5 py-3 shadow-[20px_0_54px_-46px_rgba(15,23,42,0.42)] backdrop-blur-sm"
        aria-label="Primary navigation"
      >
        {RAIL_PRIMARY.map((entry) => (
          <Button
            aria-label={entry.label}
            className={cn(
              "h-9 w-9 rounded-2xl border border-transparent text-muted-foreground shadow-none",
              entry.section === activeSection &&
                "border-border/70 bg-background/90 text-foreground shadow-[0_16px_34px_-24px_rgba(15,23,42,0.35)]",
            )}
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
        <aside className="flex w-10 shrink-0 items-start justify-end border-r border-border/70 bg-linear-to-b from-background via-muted/24 to-background px-1.5 py-2 shadow-[16px_0_40px_-34px_rgba(15,23,42,0.28)] backdrop-blur-sm">
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
          className="relative flex min-w-0 shrink-0 flex-col border-r border-border/70 bg-linear-to-b from-background via-muted/20 to-background shadow-[28px_0_72px_-58px_rgba(15,23,42,0.4)] backdrop-blur-sm"
          aria-label={panelAriaLabel}
          id="gateway-panel"
          style={{ width: panelWidth }}
        >
          <div
            aria-hidden="true"
            className="absolute inset-y-0 right-0 z-10 w-1 translate-x-1/2 cursor-col-resize bg-transparent hover:bg-border"
            onMouseDown={handleResizeStart}
          />

          <div className="flex items-center justify-end border-b border-border/60 px-2 py-2">
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
            className="h-[calc(100%-3rem)] min-w-0 [&>[data-radix-scroll-area-viewport]>div]:block! [&>[data-radix-scroll-area-viewport]>div]:w-full! [&>[data-radix-scroll-area-viewport]>div]:min-w-0"
            id="gateway-panel-content"
          >
            {children}
          </ScrollArea>
        </aside>
      )}
    </>
  );
}
