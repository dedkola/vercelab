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

type DashboardRightSidebarProps = {
  isCollapsed: boolean;
  onToggleAction: () => void;
  children: ReactNode;
};

const DEFAULT_WIDTH_PX = 576;
const MIN_WIDTH_PX = 320;
const MAX_WIDTH_PX = 900;
const STORAGE_KEY = "vercelab:right-sidebar-width";

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

export function DashboardRightSidebar({
  isCollapsed,
  onToggleAction,
  children,
}: DashboardRightSidebarProps) {
  const [panelWidth, setPanelWidth] = useState(DEFAULT_WIDTH_PX);
  const dragStateRef = useRef<{
    isDragging: boolean;
    startWidth: number;
    startX: number;
  }>({
    isDragging: false,
    startWidth: DEFAULT_WIDTH_PX,
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
    setPanelWidth(Math.min(MAX_WIDTH_PX, Math.max(MIN_WIDTH_PX, parsedWidth)));
  }, []);

  useEffect(() => {
    getStorage()?.setItem(STORAGE_KEY, String(Math.round(panelWidth)));
  }, [panelWidth]);

  useEffect(() => {
    function handleMouseMove(event: MouseEvent) {
      if (!dragStateRef.current.isDragging) {
        return;
      }

      const deltaX = dragStateRef.current.startX - event.clientX;
      const nextWidth = Math.min(
        MAX_WIDTH_PX,
        Math.max(MIN_WIDTH_PX, dragStateRef.current.startWidth + deltaX),
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
      {isCollapsed ? (
        <aside className="flex w-10 shrink-0 items-start border-l border-border/70 bg-linear-to-b from-background via-muted/20 to-background px-1.5 py-2 shadow-[-16px_0_40px_-34px_rgba(15,23,42,0.28)] backdrop-blur-sm">
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
          className="relative flex shrink-0 flex-col border-l border-border/70 bg-linear-to-b from-background via-muted/20 to-background shadow-[-28px_0_72px_-58px_rgba(15,23,42,0.4)] backdrop-blur-sm transition-all"
          aria-label="Deployment logs sidebar"
          id="logs-panel"
          style={{ width: panelWidth }}
        >
          <div
            aria-hidden="true"
            className="absolute inset-y-0 left-0 z-10 w-1 -translate-x-1/2 cursor-col-resize bg-transparent hover:bg-border"
            onMouseDown={handleResizeStart}
          />

          <div className="absolute left-1 top-1 z-20 flex items-center justify-start rounded-full bg-background/85 shadow-sm">
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

          <ScrollArea className="h-full">{children}</ScrollArea>
        </aside>
      )}
    </>
  );
}
