'use client';

import { Badge, Button, Dialog, Input, Table, Tabs } from '@cloudflare/kumo';
import { ArrowSquareOut, MagnifyingGlass, X } from '@phosphor-icons/react';
import type { EChartsCoreOption } from 'echarts';
import Image from 'next/image';
import { memo, useMemo, useState } from 'react';

import { EChartSurface } from '@/components/ui/echart-surface';
import type {
  ContainerListEntry,
  DashboardLogView,
  PreviewContainerStatus,
} from '@/components/workspace-shell';
import type { AllContainersMetricsHistorySeries } from '@/lib/influx-metrics';
import {
  buildTimedMetricSeries,
  formatChartAxisTimestamp,
  getChartTimeWindow,
  getTimedPointTimestamp,
  getTimedPointValue,
} from '@/lib/metrics-chart-time';
import {
  buildContainerMetricPanels,
  formatAxisValue,
  formatBytes,
  formatDashboardRangeLabel,
  formatDetailedTimestamp,
  formatMetricValue,
  type ChartMetricFormat,
  type ContainerMetricPanel,
  type SystemMetricPanel,
} from '@/lib/metrics-dashboard-metrics';
import { getDashboardHistorySettings, type DashboardRange } from '@/lib/metrics-range';
import type { DeploymentSummary } from '@/lib/persistence';
import type { MetricsSnapshot } from '@/lib/system-metrics';
import { cn } from '@/lib/utils';

type MetricsDashboardMainContentProps = {
  activeContainerId: string;
  allContainerHistory: AllContainersMetricsHistorySeries[];
  containerHistoryStatusText?: string | null;
  containers: ContainerListEntry[];
  deployments: DeploymentSummary[];
  isAllContainerHistoryLoading?: boolean;
  isAllContainersSelected: boolean;
  onAllContainersSelectAction: () => void;
  onContainerSelectAction: (containerId: string) => void;
  onRangeChangeAction: (range: DashboardRange) => void;
  onSearchQueryChangeAction: (value: string) => void;
  range: DashboardRange;
  rangeOptions: ReadonlyArray<{ label: string; value: DashboardRange }>;
  runningContainersCount: number | null;
  searchQuery: string;
  selectedContainerId: string | null;
  snapshot: MetricsSnapshot | null;
  systemPanels: SystemMetricPanel[];
  timeZone: string | null;
};

type TooltipPoint = {
  data?: unknown;
  seriesName?: string;
  value?: unknown;
};

type ChartSeries = {
  color: string;
  format: ChartMetricFormat;
  label: string;
  values: Array<number | null>;
};

const CHART_SET_OPTION_OPTIONS = { lazyUpdate: true } as const;
const DETAIL_LOG_TABS = [
  { label: 'Live', value: 'live' },
  { label: 'Events', value: 'events' },
  { label: 'Alerts', value: 'alerts' },
] satisfies Array<{ label: string; value: DashboardLogView }>;

function createTooltipShell(title: string, rows: string) {
  return `<div style="min-width:176px;padding:10px 12px;border:1px solid #313338;border-radius:8px;background:#1a1a1d;color:#f7f7f8;box-shadow:0 16px 38px rgba(0,0,0,.18)"><div style="margin-bottom:8px;font:500 9px ui-monospace,monospace;letter-spacing:.05em;text-transform:uppercase;color:#a7a9af">${title}</div>${rows}</div>`;
}

function createTooltipRow(label: string, value: string, color: string) {
  return `<div style="display:flex;align-items:center;justify-content:space-between;gap:18px;font-size:11px;line-height:1.65"><span style="display:flex;align-items:center;gap:7px;color:#d7d8db"><span style="width:7px;height:7px;border-radius:50%;background:${color}"></span>${label}</span><strong style="font:600 11px ui-monospace,monospace;color:#fff">${value}</strong></div>`;
}

function buildChartOption({
  range,
  series,
  timeZone,
  timestamps,
}: {
  range: DashboardRange;
  series: ChartSeries[];
  timeZone: string | null;
  timestamps: string[];
}): EChartsCoreOption {
  const { bucketSeconds } = getDashboardHistorySettings(range);
  const timeWindow = getChartTimeWindow(range);

  return {
    animation: false,
    color: series.map((item) => item.color),
    grid: { bottom: 26, containLabel: true, left: 8, right: 10, top: 18 },
    tooltip: {
      axisPointer: { lineStyle: { color: 'rgba(26,26,29,.22)' }, type: 'line' },
      backgroundColor: 'transparent',
      borderWidth: 0,
      extraCssText: 'box-shadow:none;',
      formatter: (value: unknown) => {
        const points = (Array.isArray(value) ? value : [value]) as TooltipPoint[];
        const timestamp = getTimedPointTimestamp(points[0]?.data ?? points[0]?.value) ?? Date.now();
        const title = formatDetailedTimestamp(new Date(timestamp).toISOString(), timeZone);
        const rows = points
          .map((point) => {
            const definition = series.find((item) => item.label === point.seriesName);
            const metricValue = getTimedPointValue(point.data ?? point.value);

            if (!definition || metricValue === null) {
              return '';
            }

            return createTooltipRow(
              definition.label,
              formatMetricValue(metricValue, definition.format),
              definition.color
            );
          })
          .filter(Boolean)
          .join('');

        return createTooltipShell(title, rows || createTooltipRow('No sample', '--', '#92959b'));
      },
      padding: 0,
      trigger: 'axis',
    },
    xAxis: {
      axisLabel: {
        color: '#92959b',
        fontFamily: 'var(--font-geist-mono)',
        fontSize: 9,
        formatter: (value: number) => formatChartAxisTimestamp(value, range, timeZone),
        margin: 10,
      },
      axisLine: { lineStyle: { color: '#dfe1e5' } },
      axisTick: { show: false },
      boundaryGap: false,
      max: timeWindow.max,
      min: timeWindow.min,
      splitNumber: 5,
      type: 'time',
    },
    yAxis: {
      axisLabel: {
        color: '#92959b',
        fontFamily: 'var(--font-geist-mono)',
        fontSize: 9,
        formatter: (value: number) => formatAxisValue(value, series[0]?.format ?? 'percent'),
      },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: 'rgba(26,26,29,.07)', type: 'dashed' } },
      type: 'value',
    },
    series: series.map((item, index) => ({
      areaStyle:
        index === 0
          ? {
              color: {
                colorStops: [
                  { color: `${item.color}24`, offset: 0 },
                  { color: `${item.color}03`, offset: 1 },
                ],
                type: 'linear',
                x: 0,
                x2: 0,
                y: 0,
                y2: 1,
              },
            }
          : undefined,
      connectNulls: false,
      data: buildTimedMetricSeries(timestamps, item.values, bucketSeconds * 1000),
      emphasis: { focus: 'series' },
      lineStyle: { color: item.color, width: index === 0 ? 2.2 : 1.7 },
      name: item.label,
      sampling: 'lttb',
      showSymbol: false,
      smooth: 0.18,
      type: 'line',
    })),
  };
}

function getStatusBadge(status: PreviewContainerStatus, deploymentStatus: string | null) {
  const effectiveStatus = deploymentStatus ?? status;

  if (effectiveStatus === 'running' || effectiveStatus === 'ready') {
    return { label: 'Running', variant: 'success' as const };
  }

  if (effectiveStatus === 'failed' || effectiveStatus === 'degraded') {
    return { label: 'Attention', variant: 'error' as const };
  }

  if (effectiveStatus === 'deploying') {
    return { label: 'Deploying', variant: 'warning' as const };
  }

  return { label: 'Idle', variant: 'neutral' as const };
}

function getWorkloadGlyph(container: ContainerListEntry) {
  if (container.deploymentStatus) {
    return 'app';
  }

  const identity = `${container.display.image} ${container.sidebarName}`.toLowerCase();

  if (identity.includes('postgres') || identity.includes('influx')) {
    return 'db';
  }

  return 'ctr';
}

function WorkloadIcon({
  container,
  deployment,
}: {
  container: ContainerListEntry;
  deployment: DeploymentSummary | null;
}) {
  const iconUrl = deployment
    ? `/api/deployments/${encodeURIComponent(deployment.id)}/icon?v=${encodeURIComponent(deployment.updatedAt)}`
    : null;
  const [failedIconUrl, setFailedIconUrl] = useState<string | null>(null);
  const showRepositoryIcon = iconUrl !== null && failedIconUrl !== iconUrl;

  return (
    <span className="relative grid size-7 shrink-0 place-items-center overflow-hidden rounded-[6px] border border-[var(--hairline)] bg-[var(--surface-subtle)] font-mono text-[8px] font-bold text-[var(--muted-ink)] uppercase transition-colors group-hover:border-[var(--hairline-strong)] group-hover:bg-white">
      {getWorkloadGlyph(container)}
      {showRepositoryIcon ? (
        <Image
          alt=""
          className="absolute inset-0 size-full bg-white object-contain p-1"
          height={28}
          onError={() => setFailedIconUrl(iconUrl)}
          src={iconUrl}
          unoptimized
          width={28}
        />
      ) : null}
    </span>
  );
}

function getWorkloadStateClassName(variant: ReturnType<typeof getStatusBadge>['variant']) {
  switch (variant) {
    case 'success':
      return 'text-[var(--green)]';
    case 'warning':
      return 'text-[var(--orange)]';
    case 'error':
      return 'text-[var(--red)]';
    default:
      return 'text-[var(--quiet)]';
  }
}

function EmptyChartState({ compact, message }: { compact?: boolean; message: string }) {
  return (
    <div
      className={cn(
        'flex items-center justify-center border-t border-dashed border-[var(--hairline)] px-5 text-center font-mono text-[10px] text-[var(--quiet)]',
        compact ? 'h-36' : 'h-48'
      )}
    >
      {message}
    </div>
  );
}

const TelemetryChart = memo(function TelemetryChart({
  caption,
  compact = false,
  currentValue,
  emptyMessage,
  range,
  series,
  timeZone,
  timestamps,
  title,
}: {
  caption: string;
  compact?: boolean;
  currentValue: string;
  emptyMessage: string;
  range: DashboardRange;
  series: ChartSeries[];
  timeZone: string | null;
  timestamps: string[];
  title: string;
}) {
  const option = useMemo(
    () => buildChartOption({ range, series, timeZone, timestamps }),
    [range, series, timeZone, timestamps]
  );
  const hasValues = series.some((item) => item.values.some((value) => value !== null));

  return (
    <article className="min-w-0 overflow-hidden rounded-[10px] border border-[var(--hairline)] bg-[var(--surface)] shadow-[var(--shadow)] transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-px hover:border-[var(--hairline-strong)] hover:shadow-[0_16px_38px_rgb(16_24_40_/_0.07)]">
      <header className="flex min-h-14 items-start justify-between gap-4 border-b border-[var(--hairline)] px-4 py-3">
        <div className="min-w-0">
          <h3 className="truncate whitespace-nowrap text-[11px] font-semibold tracking-[0.02em]">
            {title}
          </h3>
          <p className="mt-1 truncate font-mono text-[9px] text-[var(--quiet)]">{caption}</p>
        </div>
        <div className="text-right">
          <strong className="font-mono text-sm font-semibold tabular-nums">{currentValue}</strong>
          <div className="mt-1 flex justify-end gap-2">
            {series.map((item) => (
              <span
                className="flex items-center gap-1 text-[9px] text-[var(--muted-ink)]"
                key={item.label}
              >
                <span className="size-1.5 rounded-full" style={{ backgroundColor: item.color }} />
                {item.label}
              </span>
            ))}
          </div>
        </div>
      </header>
      {hasValues ? (
        <EChartSurface
          ariaLabel={`${title} chart`}
          className={cn('px-2 pb-1 pt-2', compact ? 'h-36' : 'h-52')}
          option={option}
          setOptionOptions={CHART_SET_OPTION_OPTIONS}
        />
      ) : (
        <EmptyChartState compact={compact} message={emptyMessage} />
      )}
    </article>
  );
});

const ContainerMetricCard = memo(function ContainerMetricCard({
  emptyMessage,
  panel,
  range,
}: {
  emptyMessage: string;
  panel: ContainerMetricPanel;
  range: DashboardRange;
}) {
  const series = useMemo<ChartSeries[]>(() => {
    const hasSelectedSeries = panel.series.some((item) => item.isSelected);
    const visibleSeries = hasSelectedSeries
      ? panel.series.filter((item) => item.isSelected)
      : panel.series.slice(0, 1);

    return visibleSeries.map((item) => ({
      color: item.color,
      format: panel.format,
      label: item.label,
      values: item.values,
    }));
  }, [panel]);

  return (
    <TelemetryChart
      caption={panel.stats.map((stat) => `${stat.label} ${stat.value}`).join(' · ')}
      compact
      currentValue={panel.series.find((item) => item.isSelected)?.latestValue ?? '--'}
      emptyMessage={emptyMessage}
      range={range}
      series={series}
      timeZone={panel.timeZone}
      timestamps={panel.timestamps}
      title={panel.title.replace(' by container', '')}
    />
  );
});

function PulseMetric({
  accentClassName,
  caption,
  className,
  label,
  value,
}: {
  accentClassName: string;
  caption: string;
  className?: string;
  label: string;
  value: string;
}) {
  return (
    <div
      className={cn(
        'group relative min-w-0 bg-[var(--surface)] px-4 py-3 transition-colors duration-200 hover:bg-[var(--surface-subtle)]',
        className
      )}
    >
      <span
        aria-hidden="true"
        className={cn('absolute inset-x-0 top-0 h-px opacity-85', accentClassName)}
      />
      <div className="font-mono text-[8px] font-medium tracking-[0.08em] text-[var(--quiet)] uppercase">
        {label}
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-2">
        <strong className="truncate font-mono text-[15px] font-semibold tracking-[-0.025em] tabular-nums">
          {value}
        </strong>
        <span className="truncate text-[9px] text-[var(--quiet)]">{caption}</span>
      </div>
    </div>
  );
}

function DetailMetric({
  caption,
  label,
  value,
}: {
  caption: string;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 border-r border-[var(--hairline)] px-4 py-3 last:border-r-0 max-[640px]:border-b max-[640px]:odd:border-r max-[640px]:even:border-r-0 max-[640px]:nth-last-[-n+2]:border-b-0">
      <div className="font-mono text-[8px] font-medium tracking-[0.08em] text-[var(--quiet)] uppercase">
        {label}
      </div>
      <strong className="mt-1 block truncate font-mono text-[13px] font-semibold tabular-nums">
        {value}
      </strong>
      <span className="mt-0.5 block truncate text-[9px] text-[var(--quiet)]">{caption}</span>
    </div>
  );
}

export function MetricsDashboardMainContent({
  activeContainerId,
  allContainerHistory,
  containerHistoryStatusText,
  containers,
  deployments,
  isAllContainerHistoryLoading = false,
  isAllContainersSelected,
  onAllContainersSelectAction,
  onContainerSelectAction,
  onRangeChangeAction,
  onSearchQueryChangeAction,
  range,
  rangeOptions,
  runningContainersCount,
  searchQuery,
  selectedContainerId,
  snapshot,
  systemPanels,
  timeZone,
}: MetricsDashboardMainContentProps) {
  const [detailContainerId, setDetailContainerId] = useState<string | null>(null);
  const [detailLogView, setDetailLogView] = useState<DashboardLogView>('live');
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const panelsById = useMemo(
    () => new Map(systemPanels.map((panel) => [panel.id, panel])),
    [systemPanels]
  );
  const cpuPanel = panelsById.get('cpu');
  const memoryPanel = panelsById.get('memory');
  const networkPanel = panelsById.get('network');
  const diskPanel = panelsById.get('disk');
  const detailContainer =
    containers.find((container) => container.display.id === detailContainerId) ?? null;
  const deploymentsByProjectName = useMemo(
    () => new Map(deployments.map((deployment) => [deployment.projectName, deployment])),
    [deployments]
  );
  const containerPanels = useMemo(
    () =>
      buildContainerMetricPanels(
        snapshot,
        allContainerHistory,
        detailContainer?.runtime?.id ?? selectedContainerId,
        deployments,
        timeZone
      ),
    [
      allContainerHistory,
      deployments,
      detailContainer?.runtime?.id,
      selectedContainerId,
      snapshot,
      timeZone,
    ]
  );
  const rangeLabel = formatDashboardRangeLabel(range);
  const chartEmptyMessage = 'Waiting for complete metrics buckets in this range.';
  const containerEmptyMessage =
    containerHistoryStatusText ??
    (isAllContainerHistoryLoading
      ? 'Refreshing container history for this range.'
      : 'Waiting for InfluxDB container buckets.');
  const trackedContainers = snapshot?.containers.all.length ?? containers.length;
  const runningContainers = runningContainersCount ?? snapshot?.containers.running ?? 0;
  const hostStateLabel = snapshot ? 'Online' : 'Waiting';
  const hostStateCaption = snapshot ? 'live sample' : 'for metrics';
  const memoryUsedLabel = snapshot ? formatBytes(snapshot.system.memoryUsedBytes) : '--';
  const memoryTotalLabel = snapshot
    ? `of ${formatBytes(snapshot.system.memoryTotalBytes)}`
    : 'Host memory';
  const computeSeries = useMemo<ChartSeries[]>(() => {
    const series: ChartSeries[] = [];

    if (cpuPanel) {
      series.push({
        color: '#0f61d8',
        format: cpuPanel.format,
        label: 'CPU',
        values: cpuPanel.primaryValues,
      });
    }

    if (memoryPanel) {
      series.push({
        color: '#f48120',
        format: memoryPanel.format,
        label: 'Memory',
        values: memoryPanel.primaryValues,
      });
    }

    return series;
  }, [cpuPanel, memoryPanel]);
  const throughputSeries = useMemo<ChartSeries[]>(() => {
    const series: ChartSeries[] = [];

    if (networkPanel) {
      series.push({
        color: '#0f61d8',
        format: networkPanel.format,
        label: 'In',
        values: networkPanel.primaryValues,
      });
      series.push({
        color: '#7259c9',
        format: networkPanel.format,
        label: 'Out',
        values: networkPanel.secondaryValues ?? [],
      });
    }

    if (diskPanel) {
      series.push({
        color: '#92959b',
        format: diskPanel.format,
        label: 'Disk',
        values: diskPanel.primaryValues.map(
          (value, index) => value + (diskPanel.secondaryValues?.[index] ?? 0)
        ),
      });
    }

    return series;
  }, [diskPanel, networkPanel]);

  function openContainerDetail(container: ContainerListEntry) {
    setDetailContainerId(container.display.id);
    setDetailLogView('live');
    setIsDetailOpen(true);
    onContainerSelectAction(container.display.id);
  }

  return (
    <div className="mx-auto w-full max-w-[1680px] space-y-4 px-6 py-5 max-[760px]:px-3 max-[760px]:py-3">
      <section className="space-y-2" aria-labelledby="system-pulse-title">
        <div className="flex flex-wrap items-center justify-between gap-3 px-0.5">
          <h1
            className="text-[11px] font-semibold tracking-[0.08em] uppercase"
            id="system-pulse-title"
          >
            System pulse{' '}
            <span className="ml-1 font-mono text-[8px] font-normal tracking-[0.04em] text-[var(--quiet)] normal-case">
              All workloads
            </span>
          </h1>

          <div className="flex min-w-0 items-center gap-2 max-[760px]:w-full max-[760px]:items-stretch">
            <div className="relative w-56 max-w-[38vw] max-[760px]:max-w-none max-[760px]:flex-1">
              <MagnifyingGlass
                aria-hidden="true"
                className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--quiet)]"
              />
              <Input
                aria-label="Search workloads"
                className="h-8 rounded-[7px] pl-8 text-[10px]"
                onChange={(event) => onSearchQueryChangeAction(event.target.value)}
                placeholder="Find workload"
                value={searchQuery}
              />
            </div>
            <div className="max-w-[min(60vw,36rem)] overflow-x-auto">
              <Tabs
                onValueChange={(value) => onRangeChangeAction(value as DashboardRange)}
                size="sm"
                tabs={[...rangeOptions]}
                value={range}
                variant="segmented"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-5 gap-px overflow-hidden rounded-[10px] border border-[var(--hairline)] bg-[var(--hairline)] shadow-[var(--shadow)] max-[960px]:grid-cols-3 max-[720px]:grid-cols-2">
          <PulseMetric
            accentClassName="bg-[var(--green)]"
            caption={hostStateCaption}
            label="Host state"
            value={hostStateLabel}
          />
          <PulseMetric
            accentClassName="bg-[var(--orange)]"
            caption="1 min"
            label="Load average"
            value={snapshot ? snapshot.system.loadAverage[0].toFixed(2) : '--'}
          />
          <PulseMetric
            accentClassName="bg-[var(--blue)]"
            caption={memoryTotalLabel}
            label="Memory"
            value={memoryUsedLabel}
          />
          <PulseMetric
            accentClassName="bg-[var(--purple)]"
            caption={`${trackedContainers} tracked`}
            label="Workloads"
            value={`${runningContainers} up`}
          />
          <PulseMetric
            accentClassName="bg-[var(--blue)]"
            caption={networkPanel?.currentCaption ?? 'Network total'}
            className="max-[960px]:col-span-2 max-[720px]:col-span-2"
            label="Traffic"
            value={networkPanel?.currentValue ?? '--'}
          />
        </div>
      </section>

      <section
        className="grid grid-cols-2 gap-4 max-[760px]:grid-cols-1"
        aria-label="Host telemetry"
      >
        <TelemetryChart
          caption={`CPU and memory · ${rangeLabel}`}
          currentValue={cpuPanel?.currentValue ?? '--'}
          emptyMessage={chartEmptyMessage}
          range={range}
          series={computeSeries}
          timeZone={timeZone}
          timestamps={cpuPanel?.timestamps ?? memoryPanel?.timestamps ?? []}
          title="Compute load"
        />
        <TelemetryChart
          caption={`Network in/out and disk · ${rangeLabel}`}
          currentValue={networkPanel?.currentValue ?? '--'}
          emptyMessage={chartEmptyMessage}
          range={range}
          series={throughputSeries}
          timeZone={timeZone}
          timestamps={networkPanel?.timestamps ?? diskPanel?.timestamps ?? []}
          title="Throughput"
        />
      </section>

      <section
        aria-labelledby="workloads-title"
        className="overflow-hidden rounded-[10px] border border-[var(--hairline)] bg-[var(--surface)] shadow-[var(--shadow)]"
      >
        <header className="flex min-h-12 flex-wrap items-center justify-between gap-3 border-b border-[var(--hairline)] px-4 py-2.5">
          <div>
            <h2 className="text-[11px] font-semibold tracking-[0.02em]" id="workloads-title">
              Workloads
            </h2>
            <p className="mt-1 font-mono text-[9px] text-[var(--quiet)]">
              {containers.length} visible · select a row for telemetry and logs
            </p>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            {!isAllContainersSelected ? (
              <Button onClick={onAllContainersSelectAction} size="sm" variant="ghost">
                Fleet view
              </Button>
            ) : null}
          </div>
        </header>

        <div className="overflow-x-auto">
          <Table className="min-w-[860px]" layout="fixed">
            <colgroup>
              <col className="w-[30%]" />
              <col className="w-[12%]" />
              <col className="w-[10%]" />
              <col className="w-[12%]" />
              <col className="w-[13%]" />
              <col className="w-[23%]" />
            </colgroup>
            <Table.Header className="bg-[var(--surface-subtle)]" variant="compact">
              <Table.Row>
                <Table.Head className="h-8 px-3 font-mono text-[8px] font-semibold tracking-[0.08em] text-[var(--quiet)] uppercase">
                  Workload
                </Table.Head>
                <Table.Head className="h-8 px-3 font-mono text-[8px] font-semibold tracking-[0.08em] text-[var(--quiet)] uppercase">
                  State
                </Table.Head>
                <Table.Head className="h-8 px-3 font-mono text-[8px] font-semibold tracking-[0.08em] text-[var(--quiet)] uppercase">
                  CPU
                </Table.Head>
                <Table.Head className="h-8 px-3 font-mono text-[8px] font-semibold tracking-[0.08em] text-[var(--quiet)] uppercase">
                  Memory
                </Table.Head>
                <Table.Head className="h-8 px-3 font-mono text-[8px] font-semibold tracking-[0.08em] text-[var(--quiet)] uppercase">
                  Network
                </Table.Head>
                <Table.Head className="h-8 px-3 font-mono text-[8px] font-semibold tracking-[0.08em] text-[var(--quiet)] uppercase">
                  Endpoint
                </Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {containers.map((container) => {
                const status = getStatusBadge(container.display.status, container.deploymentStatus);
                const deployment = container.runtime?.projectName
                  ? (deploymentsByProjectName.get(container.runtime.projectName) ?? null)
                  : null;

                return (
                  <Table.Row
                    className="group h-[46px] cursor-pointer outline-none transition-colors duration-150 hover:bg-[#f8fafc] focus-visible:ring-2 focus-visible:ring-[var(--blue)] focus-visible:ring-inset"
                    key={container.display.id}
                    onClick={() => openContainerDetail(container)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openContainerDetail(container);
                      }
                    }}
                    tabIndex={0}
                    variant={activeContainerId === container.display.id ? 'selected' : 'default'}
                  >
                    <Table.Cell className="px-3 py-1.5">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <WorkloadIcon container={container} deployment={deployment} />
                        <span className="min-w-0">
                          <span className="block truncate text-[11px] font-semibold tracking-[-0.01em]">
                            {container.sidebarName}
                          </span>
                          <span className="mt-0.5 block truncate font-mono text-[8px] text-[var(--quiet)]">
                            {container.sidebarSecondaryLabel || container.display.image}
                          </span>
                        </span>
                      </div>
                    </Table.Cell>
                    <Table.Cell className="px-3 py-1.5">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1.5 text-[9px] font-semibold tracking-[0.04em] uppercase',
                          getWorkloadStateClassName(status.variant)
                        )}
                      >
                        <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
                        {status.label}
                      </span>
                    </Table.Cell>
                    <Table.Cell className="px-3 py-1.5 font-mono text-[9px] text-[var(--muted-ink)] tabular-nums">
                      {container.display.cpu || '--'}
                    </Table.Cell>
                    <Table.Cell className="px-3 py-1.5 font-mono text-[9px] text-[var(--muted-ink)] tabular-nums">
                      {container.display.memory || '--'}
                    </Table.Cell>
                    <Table.Cell className="px-3 py-1.5 font-mono text-[9px] text-[var(--muted-ink)] tabular-nums">
                      {container.display.requestRate || '--'}
                    </Table.Cell>
                    <Table.Cell className="px-3 py-1.5">
                      {container.runtime?.routedHost ? (
                        <a
                          className="inline-flex max-w-full items-center gap-1 truncate font-mono text-[9px] text-[var(--blue)] underline-offset-2 hover:underline"
                          href={`https://${container.runtime.routedHost}`}
                          onClick={(event) => event.stopPropagation()}
                          rel="noreferrer"
                          target="_blank"
                        >
                          <span className="truncate">{container.runtime.routedHost}</span>
                          <ArrowSquareOut className="size-3 shrink-0" aria-hidden="true" />
                        </a>
                      ) : (
                        <span className="font-mono text-[9px] text-[var(--quiet)]">not routed</span>
                      )}
                    </Table.Cell>
                  </Table.Row>
                );
              })}
            </Table.Body>
          </Table>
          {containers.length === 0 ? (
            <div className="border-t border-[var(--hairline)] px-4 py-10 text-center font-mono text-[10px] text-[var(--quiet)]">
              No workloads match this search.
            </div>
          ) : null}
        </div>
      </section>

      <Dialog.Root open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <Dialog className="max-h-[min(90dvh,900px)] overflow-hidden p-0" size="xl">
          {detailContainer ? (
            <div className="flex max-h-[min(90dvh,900px)] min-h-0 flex-col">
              <header className="flex items-start justify-between gap-4 border-b border-[var(--hairline)] px-5 py-4">
                <div className="min-w-0">
                  <Dialog.Title className="truncate text-base font-semibold tracking-[-0.02em]">
                    {detailContainer.sidebarName}
                  </Dialog.Title>
                  <Dialog.Description className="mt-1 truncate font-mono text-[9px] text-[var(--quiet)]">
                    {detailContainer.display.image} · {detailContainer.display.node}
                  </Dialog.Description>
                </div>
                <Dialog.Close
                  render={
                    <Button
                      aria-label="Close workload details"
                      icon={X}
                      shape="square"
                      size="sm"
                      variant="ghost"
                    />
                  }
                />
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--canvas)] p-4">
                <div className="grid grid-cols-4 overflow-hidden rounded-[8px] border border-[var(--hairline)] bg-white max-[640px]:grid-cols-2">
                  <DetailMetric
                    caption="current"
                    label="CPU"
                    value={detailContainer.display.cpu || '--'}
                  />
                  <DetailMetric
                    caption="current"
                    label="Memory"
                    value={detailContainer.display.memory || '--'}
                  />
                  <DetailMetric
                    caption="runtime"
                    label="Restarts"
                    value={`${detailContainer.display.restarts}`}
                  />
                  <DetailMetric
                    caption="current sample"
                    label="Uptime"
                    value={detailContainer.display.uptime || '--'}
                  />
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 max-[760px]:grid-cols-1">
                  {containerPanels.map((panel) => (
                    <ContainerMetricCard
                      emptyMessage={containerEmptyMessage}
                      key={panel.id}
                      panel={panel}
                      range={range}
                    />
                  ))}
                </div>

                <section className="mt-4 overflow-hidden rounded-[10px] border border-[var(--hairline)] bg-white">
                  <header className="flex items-center justify-between gap-3 border-b border-[var(--hairline)] px-4 py-3">
                    <div>
                      <h3 className="text-[11px] font-semibold">Runtime log</h3>
                      <p className="mt-1 font-mono text-[9px] text-[var(--quiet)]">
                        Context only — opens when requested
                      </p>
                    </div>
                    <Tabs
                      onValueChange={(value) => setDetailLogView(value as DashboardLogView)}
                      size="sm"
                      tabs={DETAIL_LOG_TABS}
                      value={detailLogView}
                      variant="segmented"
                    />
                  </header>
                  <div className="max-h-64 overflow-auto bg-[#1a1a1d] px-4 py-3 font-mono text-[10px] leading-5 text-[#d7d8db]">
                    {detailContainer.display.logs[detailLogView].length ? (
                      detailContainer.display.logs[detailLogView].map((line) => (
                        <div className="grid grid-cols-[5.5rem_4rem_1fr] gap-3" key={line.id}>
                          <span className="text-[#92959b]">{line.timestamp}</span>
                          <span
                            className={cn(
                              'uppercase',
                              line.level === 'success' && 'text-[#64c58a]',
                              line.level === 'warning' && 'text-[#f5a65d]',
                              line.level === 'info' && 'text-[#7ca9ed]'
                            )}
                          >
                            {line.level}
                          </span>
                          <span className="min-w-0 break-words">{line.message}</span>
                        </div>
                      ))
                    ) : (
                      <div className="text-[#92959b]">No {detailLogView} entries available.</div>
                    )}
                  </div>
                </section>
              </div>

              <footer className="flex items-center justify-between gap-3 border-t border-[var(--hairline)] px-5 py-3">
                <span className="font-mono text-[9px] text-[var(--quiet)]">
                  {detailContainer.display.summary}
                </span>
                {detailContainer.display.endpoints[0]?.url ? (
                  <Button
                    icon={ArrowSquareOut}
                    onClick={() =>
                      window.open(
                        detailContainer.display.endpoints[0]?.url,
                        '_blank',
                        'noopener,noreferrer'
                      )
                    }
                    size="sm"
                    variant="secondary"
                  >
                    Open service
                  </Button>
                ) : null}
              </footer>
            </div>
          ) : null}
        </Dialog>
      </Dialog.Root>
    </div>
  );
}
