'use client';

import * as echarts from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import {
  AxisPointerComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

/**
 * Tree-shaken ECharts instance that only registers the chart types and
 * components actually used by the dashboard. This keeps the dynamically
 * imported chart chunk much smaller than importing the full `echarts` entry.
 */
echarts.use([
  BarChart,
  LineChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  AxisPointerComponent,
  CanvasRenderer,
]);

export { echarts };
