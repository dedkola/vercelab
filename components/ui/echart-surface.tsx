"use client";

import { memo, useEffect, useRef } from "react";

import { cn } from "@/lib/utils";
import type { EChartsCoreOption, EChartsType, SetOptionOpts } from "echarts";

type EChartSurfaceProps = {
  ariaLabel: string;
  className?: string;
  option: EChartsCoreOption;
  setOptionOptions?: SetOptionOpts;
};

let echartsModulePromise: Promise<typeof import("echarts")> | null = null;

function loadECharts() {
  if (!echartsModulePromise) {
    echartsModulePromise = import("echarts");
  }

  return echartsModulePromise;
}

export const EChartSurface = memo(function EChartSurface({
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
    if (typeof window === "undefined") {
      return;
    }

    const warmCharts = () => {
      void loadECharts();
    };

    if ("requestIdleCallback" in window) {
      const handle = window.requestIdleCallback(warmCharts, {
        timeout: 1500,
      });

      return () => {
        window.cancelIdleCallback(handle);
      };
    }

    const timeoutId = globalThis.setTimeout(warmCharts, 250);

    return () => {
      globalThis.clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    const element = elementRef.current;

    if (!element) {
      return;
    }

    let active = true;
    let resizeObserver: ResizeObserver | null = null;
    let intersectionObserver: IntersectionObserver | null = null;

    const initializeChart = async () => {
      if (!active || chartRef.current) {
        return;
      }

      const echarts = await loadECharts();

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
    };

    if (typeof IntersectionObserver !== "function") {
      void initializeChart();
    } else {
      intersectionObserver = new IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) {
            return;
          }

          intersectionObserver?.disconnect();
          intersectionObserver = null;
          void initializeChart();
        },
        { rootMargin: "240px 0px" },
      );

      intersectionObserver.observe(element);
    }

    return () => {
      active = false;
      intersectionObserver?.disconnect();
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
});
