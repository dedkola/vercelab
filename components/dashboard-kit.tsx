type DashboardIconName =
  | "overview"
  | "deployments"
  | "activity"
  | "health"
  | "create"
  | "settings"
  | "external";

export type TrendPoint = {
  label: string;
  total: number;
  success: number;
  failed: number;
};

export type DonutSegment = {
  label: string;
  value: number;
  tone: string;
};

type DashboardIconProps = {
  name: DashboardIconName;
  title?: string;
};

type TrendChartProps = {
  data: TrendPoint[];
};

type DonutChartProps = {
  segments: DonutSegment[];
  totalLabel: string;
  totalValue: string;
};

type ChartPoint = {
  x: number;
  y: number;
};

function buildPolyline(points: ChartPoint[]): string {
  if (points.length === 0) {
    return "";
  }

  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
}

function buildArea(points: ChartPoint[], baseline: number): string {
  if (points.length === 0) {
    return "";
  }

  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];

  return `${buildPolyline(points)} L ${lastPoint.x} ${baseline} L ${firstPoint.x} ${baseline} Z`;
}

function formatCompact(value: number): string {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function DashboardIcon({ name, title }: DashboardIconProps) {
  const titleId = title
    ? `icon-${name}-${title.replace(/\s+/g, "-").toLowerCase()}`
    : undefined;

  const sharedProps = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.7,
  };

  const iconContent = (
    <>
      {title ? <title id={titleId}>{title}</title> : null}

      {name === "overview" ? (
        <>
          <rect
            x="3.5"
            y="3.5"
            width="7"
            height="7"
            rx="1.5"
            {...sharedProps}
          />
          <rect
            x="13.5"
            y="3.5"
            width="7"
            height="7"
            rx="1.5"
            {...sharedProps}
          />
          <rect
            x="3.5"
            y="13.5"
            width="7"
            height="7"
            rx="1.5"
            {...sharedProps}
          />
          <rect
            x="13.5"
            y="13.5"
            width="7"
            height="7"
            rx="1.5"
            {...sharedProps}
          />
        </>
      ) : null}

      {name === "deployments" ? (
        <>
          <path d="M4 7.5h16" {...sharedProps} />
          <path
            d="M7 4.5h10a1.5 1.5 0 0 1 1.5 1.5v12A1.5 1.5 0 0 1 17 19.5H7A1.5 1.5 0 0 1 5.5 18V6A1.5 1.5 0 0 1 7 4.5Z"
            {...sharedProps}
          />
          <path d="M8.5 11.5h7" {...sharedProps} />
          <path d="M8.5 15h5" {...sharedProps} />
        </>
      ) : null}

      {name === "activity" ? (
        <>
          <path d="M4 18.5h16" {...sharedProps} />
          <path d="M6 15.5 9.5 11l3 2.5 5.5-7" {...sharedProps} />
          <circle cx="6" cy="15.5" r="1" fill="currentColor" />
          <circle cx="9.5" cy="11" r="1" fill="currentColor" />
          <circle cx="12.5" cy="13.5" r="1" fill="currentColor" />
          <circle cx="18" cy="6.5" r="1" fill="currentColor" />
        </>
      ) : null}

      {name === "health" ? (
        <>
          <path
            d="M12 3.5 18.5 6v5.5c0 4-2.1 7.5-6.5 9-4.4-1.5-6.5-5-6.5-9V6L12 3.5Z"
            {...sharedProps}
          />
          <path d="m8.5 12.5 2.1 2.1 4.9-5.1" {...sharedProps} />
        </>
      ) : null}

      {name === "create" ? (
        <>
          <circle cx="12" cy="12" r="8" {...sharedProps} />
          <path d="M12 8v8" {...sharedProps} />
          <path d="M8 12h8" {...sharedProps} />
        </>
      ) : null}

      {name === "settings" ? (
        <>
          <circle cx="12" cy="12" r="2.7" {...sharedProps} />
          <path d="M12 3.5v2.3" {...sharedProps} />
          <path d="M12 18.2v2.3" {...sharedProps} />
          <path d="m5.9 5.9 1.7 1.7" {...sharedProps} />
          <path d="m16.4 16.4 1.7 1.7" {...sharedProps} />
          <path d="M3.5 12h2.3" {...sharedProps} />
          <path d="M18.2 12h2.3" {...sharedProps} />
          <path d="m5.9 18.1 1.7-1.7" {...sharedProps} />
          <path d="m16.4 7.6 1.7-1.7" {...sharedProps} />
        </>
      ) : null}

      {name === "external" ? (
        <>
          <path
            d="M10 6.5H6.5A1.5 1.5 0 0 0 5 8v9.5A1.5 1.5 0 0 0 6.5 19H16a1.5 1.5 0 0 0 1.5-1.5V14"
            {...sharedProps}
          />
          <path d="M13 5h6v6" {...sharedProps} />
          <path d="M11 13 19 5" {...sharedProps} />
        </>
      ) : null}
    </>
  );

  if (title) {
    return (
      <svg
        aria-labelledby={titleId}
        className="dashboard-icon"
        role="img"
        viewBox="0 0 24 24"
      >
        {iconContent}
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" className="dashboard-icon" viewBox="0 0 24 24">
      {iconContent}
    </svg>
  );
}

export function TrendChart({ data }: TrendChartProps) {
  const width = 780;
  const height = 290;
  const padding = {
    top: 20,
    right: 54,
    bottom: 42,
    left: 18,
  };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const baseline = height - padding.bottom;
  const maxValue = Math.max(
    ...data.flatMap((point) => [point.total, point.success, point.failed]),
    1,
  );
  const roundedMax = Math.max(4, Math.ceil(maxValue / 4) * 4);
  const xStep = data.length > 1 ? plotWidth / (data.length - 1) : plotWidth;
  const hasData = data.some(
    (point) => point.total > 0 || point.success > 0 || point.failed > 0,
  );

  const projectY = (value: number) => {
    const scaled = value / roundedMax;
    return padding.top + plotHeight - scaled * plotHeight;
  };

  const projectX = (index: number) => padding.left + index * xStep;

  const totalPoints = data.map((point, index) => ({
    x: projectX(index),
    y: projectY(point.total),
  }));
  const successPoints = data.map((point, index) => ({
    x: projectX(index),
    y: projectY(point.success),
  }));
  const failedPoints = data.map((point, index) => ({
    x: projectX(index),
    y: projectY(point.failed),
  }));
  const lastPoint = totalPoints[totalPoints.length - 1];

  return (
    <div className="trend-chart">
      <svg
        role="img"
        aria-label="Deployment activity chart"
        viewBox={`0 0 ${width} ${height}`}
      >
        {Array.from({ length: 5 }, (_, index) => {
          const value = roundedMax - (roundedMax / 4) * index;
          const y = padding.top + (plotHeight / 4) * index;

          return (
            <g key={`grid-${value}`}>
              <line
                className="chart-grid-line"
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
              />
              <text
                className="chart-axis-label"
                x={width - padding.right + 8}
                y={y + 4}
              >
                {formatCompact(value)}
              </text>
            </g>
          );
        })}

        {data.map((point, index) => {
          const x = projectX(index);
          const barHeight = plotHeight * (point.total / roundedMax);

          return (
            <g key={`point-${index}-${point.label}`}>
              <line
                className="chart-grid-column"
                x1={x}
                y1={padding.top}
                x2={x}
                y2={baseline}
              />
              {hasData ? (
                <rect
                  className="chart-bar"
                  x={x - 11}
                  y={baseline - barHeight}
                  width="22"
                  height={Math.max(barHeight, 2)}
                  rx="11"
                />
              ) : null}
              <text className="chart-label" x={x} y={height - 14}>
                {point.label}
              </text>
            </g>
          );
        })}

        {hasData ? (
          <>
            <path className="chart-area" d={buildArea(totalPoints, baseline)} />
            <path
              className="chart-line chart-line--primary"
              d={buildPolyline(totalPoints)}
            />
            <path
              className="chart-line chart-line--success"
              d={buildPolyline(successPoints)}
            />
            <path
              className="chart-line chart-line--danger"
              d={buildPolyline(failedPoints)}
            />
            {lastPoint ? (
              <g>
                <circle
                  className="chart-live-ping"
                  cx={lastPoint.x}
                  cy={lastPoint.y}
                  r="10"
                />
                <circle
                  className="chart-live-dot"
                  cx={lastPoint.x}
                  cy={lastPoint.y}
                  r="4.5"
                />
              </g>
            ) : null}
          </>
        ) : (
          <text className="chart-empty-label" x={width / 2} y={height / 2}>
            Waiting for deployment history
          </text>
        )}
      </svg>
    </div>
  );
}

export function DonutChart({
  segments,
  totalLabel,
  totalValue,
}: DonutChartProps) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);

  let offset = 0;

  return (
    <div className="donut-chart">
      <div className="donut-chart__visual">
        <svg viewBox="0 0 140 140" aria-hidden="true">
          <circle
            className="donut-chart__track"
            cx="70"
            cy="70"
            r={radius}
            fill="none"
            strokeWidth="14"
          />
          {total > 0
            ? segments.map((segment) => {
                const segmentLength = (segment.value / total) * circumference;
                const dashArray = `${segmentLength} ${circumference - segmentLength}`;
                const currentOffset = offset;

                offset += segmentLength;

                return (
                  <circle
                    className={`donut-chart__segment donut-chart__segment--${segment.tone}`}
                    key={segment.label}
                    cx="70"
                    cy="70"
                    r={radius}
                    fill="none"
                    strokeDasharray={dashArray}
                    strokeDashoffset={circumference / 4 - currentOffset}
                    strokeLinecap="round"
                    strokeWidth="14"
                    transform="rotate(-90 70 70)"
                  />
                );
              })
            : null}
        </svg>

        <div className="donut-chart__center">
          <strong>{totalValue}</strong>
          <span>{totalLabel}</span>
        </div>
      </div>

      <ul className="donut-legend">
        {segments.length > 0 ? (
          segments.map((segment) => (
            <li className="donut-legend__item" key={segment.label}>
              <span
                className={`donut-legend__swatch donut-legend__swatch--${segment.tone}`}
              />
              <span>{segment.label}</span>
              <strong>{segment.value}</strong>
            </li>
          ))
        ) : (
          <li className="donut-legend__item donut-legend__item--muted">
            <span className="donut-legend__swatch donut-legend__swatch--empty" />
            <span>No data yet</span>
            <strong>0</strong>
          </li>
        )}
      </ul>
    </div>
  );
}
