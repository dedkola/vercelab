import * as echarts from "echarts/core";
import { BarChart, LineChart } from "echarts/charts";
import {
  AxisPointerComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

/**
 * Tree-shaken ECharts setup used by EChartSurface.
 *
 * Only the chart types and components actually rendered in the app are
 * registered, keeping the dynamically-loaded chart bundle as small as possible.
 */
echarts.use([
  BarChart,
  LineChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  AxisPointerComponent,
  CanvasRenderer,
]);

export default echarts;
