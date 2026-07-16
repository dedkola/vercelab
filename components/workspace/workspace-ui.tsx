"use client";

import {
  useEffect,
  useMemo,
  useRef,
  type MouseEvent as ReactMouseEvent,
} from "react";

import type { MetricTone } from "@/components/workspace-shell";
import { Icon } from "@/components/dashboard-kit";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function getToneClasses(tone: MetricTone) {
  switch (tone) {
    case "emerald":
      return {
        badge: "border-emerald-200/80 bg-emerald-50/90 text-emerald-700",
        border: "border-emerald-200/70",
        surface: "from-emerald-50/80 via-background to-background",
        delta: "text-emerald-700",
        stroke: "rgba(5, 150, 105, 0.95)",
        fill: "rgba(16, 185, 129, 0.16)",
        grid: "rgba(16, 185, 129, 0.10)",
      };
    case "amber":
      return {
        badge: "border-amber-200/80 bg-amber-50/90 text-amber-700",
        border: "border-amber-200/70",
        surface: "from-amber-50/80 via-background to-background",
        delta: "text-amber-700",
        stroke: "rgba(217, 119, 6, 0.95)",
        fill: "rgba(245, 158, 11, 0.16)",
        grid: "rgba(245, 158, 11, 0.10)",
      };
    case "slate":
      return {
        badge: "border-slate-200/80 bg-slate-50/90 text-slate-700",
        border: "border-slate-200/70",
        surface: "from-slate-50/80 via-background to-background",
        delta: "text-slate-700",
        stroke: "rgba(71, 85, 105, 0.95)",
        fill: "rgba(148, 163, 184, 0.16)",
        grid: "rgba(148, 163, 184, 0.10)",
      };
  }
}

export function Sparkline({
  className,
  height = 42,
  points,
  tone,
}: {
  className?: string;
  height?: number;
  points: number[];
  tone: MetricTone;
}) {
  const width = 180;
  const toneClasses = getToneClasses(tone);
  const coordinates = useMemo(() => {
    const safePoints = points.length ? points : [0, 0, 0, 0, 0, 0];
    const max = Math.max(...safePoints);
    const min = Math.min(...safePoints);
    const range = max - min || 1;
    const step =
      safePoints.length > 1 ? width / (safePoints.length - 1) : width;
    const safeHeight = Math.max(24, height);

    const linePoints = safePoints
      .map((value, index) => {
        const x = Number((index * step).toFixed(2));
        const normalized = (value - min) / range;
        const y = Number(
          (safeHeight - normalized * (safeHeight - 10) - 5).toFixed(2),
        );

        return `${x},${y}`;
      })
      .join(" ");

    return {
      areaPoints: `0,${safeHeight} ${linePoints} ${width},${safeHeight}`,
      linePoints,
      safeHeight,
    };
  }, [height, points]);

  return (
    <svg
      aria-hidden="true"
      className={cn("w-full", className)}
      preserveAspectRatio="none"
      viewBox={`0 0 ${width} ${coordinates.safeHeight}`}
    >
      <path
        d={`M0 ${coordinates.safeHeight - 1} H${width}`}
        stroke={toneClasses.grid}
        strokeDasharray="3 6"
        strokeWidth="1"
      />
      <polygon fill={toneClasses.fill} points={coordinates.areaPoints} />
      <polyline
        fill="none"
        points={coordinates.linePoints}
        stroke={toneClasses.stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.5"
      />
    </svg>
  );
}

export function ResizeHandle({
  className,
  onMouseDown,
}: {
  className?: string;
  onMouseDown: (event: ReactMouseEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "group relative z-10 w-2 shrink-0 cursor-col-resize",
        className,
      )}
      onMouseDown={onMouseDown}
    >
      <div className="absolute inset-y-2 left-1/2 w-px -translate-x-1/2 rounded-full bg-border transition-colors group-hover:bg-emerald-300" />
    </div>
  );
}

export function usePixelWidthRef<T extends HTMLElement>(width: number) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    if (!ref.current) {
      return;
    }

    ref.current.style.width = `${width}px`;
  }, [width]);

  return ref;
}

export function usePercentWidthRef<T extends HTMLElement>(width: number) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    if (!ref.current) {
      return;
    }

    ref.current.style.width = `${width}%`;
  }, [width]);

  return ref;
}

export function SectionLabel({
  icon,
  text,
}: {
  icon: "network" | "cloud" | "github" | "syslog" | "monitor";
  text: string;
}) {
  return (
    <Badge
      className="gap-1 rounded-md border border-border/60 bg-background px-2 py-0.5 text-xs font-medium text-foreground shadow-none"
      variant="outline"
    >
      <Icon name={icon} className="h-3.5 w-3.5" />
      {text}
    </Badge>
  );
}
