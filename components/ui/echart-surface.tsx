"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";
import type { EChartsCoreOption, EChartsType, SetOptionOpts } from "echarts";

type EChartSurfaceProps = {
  ariaLabel: string;
  className?: string;
  option: EChartsCoreOption;
  setOptionOptions?: SetOptionOpts;
};

export function EChartSurface({
  ariaLabel,
  className,
  option,
  setOptionOptions,
}: EChartSurfaceProps) {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<EChartsType | null>(null);
  const optionRef = useRef(option);
  const setOptionOptionsRef = useRef(setOptionOptions);

  useEffect(() => {
    const element = elementRef.current;

    if (!element) {
      return;
    }

    let active = true;
    let resizeObserver: ResizeObserver | null = null;

    async function mountChart() {
      const echarts = await import("echarts");

      if (!active || !element) {
        return;
      }

      const instance =
        echarts.getInstanceByDom(element) ?? echarts.init(element);

      chartRef.current = instance;
      instance.setOption(optionRef.current, setOptionOptionsRef.current);
      resizeObserver = new ResizeObserver(() => {
        instance.resize();
      });
      resizeObserver.observe(element);
    }

    void mountChart();

    return () => {
      active = false;
      resizeObserver?.disconnect();
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    optionRef.current = option;
    setOptionOptionsRef.current = setOptionOptions;
    chartRef.current?.setOption(option, setOptionOptions);
  }, [option, setOptionOptions]);

  return (
    <div
      aria-label={ariaLabel}
      className={cn("min-h-44 w-full", className)}
      ref={elementRef}
      role="img"
    />
  );
}
