const TRAFFIC_ROWS = [
  {
    name: "DelugeTorrent",
    badge: "D",
    color: "#1846b3",
    down: "1.61 GB",
    toneClass: "torrent",
    up: "57.3 GB",
    traffic: "58.9 GB",
  },
  {
    name: "BitTorrent Series",
    badge: "BT",
    color: "#2d6cf7",
    down: "1.00 GB",
    toneClass: "series",
    up: "22.4 GB",
    traffic: "23.4 GB",
  },
  {
    name: "SSL/TLS",
    badge: "S",
    color: "#48b8ea",
    down: "4.92 GB",
    toneClass: "ssl",
    up: "84.2 MB",
    traffic: "5.01 GB",
  },
  {
    name: "YouTube",
    badge: "YT",
    color: "#40c463",
    down: "3.34 GB",
    toneClass: "youtube",
    up: "20.5 MB",
    traffic: "3.36 GB",
  },
  {
    name: "Web Streaming",
    badge: "WS",
    color: "#bddb32",
    down: "2.92 GB",
    toneClass: "streaming",
    up: "14.4 MB",
    traffic: "2.94 GB",
  },
];

type TrafficCardProps = {
  statusMessage: string;
  timestampLabel: string;
};

function TrafficDonut({
  segments,
  centerValue,
  label,
}: {
  segments: Array<{ color: string; ratio: number }>;
  centerValue: string;
  label: string;
}) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="donut">
      <svg className="donut__ring" viewBox="0 0 140 140" aria-hidden="true">
        <circle
          cx="70"
          cy="70"
          r={radius}
          fill="none"
          stroke="#edf0f4"
          strokeWidth="12"
        />

        {segments.map((segment, index) => {
          const completedRatio = segments
            .slice(0, index)
            .reduce((sum, entry) => sum + entry.ratio, 0);
          const dash = circumference * segment.ratio;
          const dashOffset = circumference * (1 - completedRatio);

          return (
            <circle
              key={`${segment.color}-${segment.ratio}`}
              cx="70"
              cy="70"
              r={radius}
              fill="none"
              stroke={segment.color}
              strokeWidth="12"
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={dashOffset}
            />
          );
        })}
      </svg>

      <div className="donut__center">
        <div className="donut__value">{centerValue}</div>
        <div className="donut__label">{label}</div>
      </div>
    </div>
  );
}

export function TrafficCard({
  statusMessage,
  timestampLabel,
}: TrafficCardProps) {
  const donutSegments = TRAFFIC_ROWS.map((row) => {
    const numericValue =
      Number.parseFloat(row.traffic.replace(/[^\d.]/g, "")) || 1;
    const totalNumeric = 58.9 + 23.4 + 5.01 + 3.36 + 2.94 + 2.66;

    return {
      color: row.color,
      ratio: numericValue / totalNumeric,
    };
  });

  return (
    <article className="unifi-card unifi-card--traffic">
      <div className="overview-card__header">
        <div>
          <div className="overview-card__title">Traffic</div>
          <div className="overview-card__meta">{statusMessage}</div>
        </div>
        <div className="overview-card__stamp">{timestampLabel}</div>
      </div>

      <div className="traffic">
        <TrafficDonut
          segments={donutSegments}
          centerValue="102 GB"
          label="Total Traffic"
        />

        <table className="traffic-table">
          <thead>
            <tr>
              <th>Application</th>
              <th>Down</th>
              <th>Up</th>
              <th>Traffic</th>
            </tr>
          </thead>
          <tbody>
            {TRAFFIC_ROWS.map((row) => (
              <tr key={row.name}>
                <td>
                  <div className="traffic-app">
                    <span
                      className={`traffic-app__dot traffic-app__dot--${row.toneClass}`}
                    />
                    <span className="traffic-app__icon">{row.badge}</span>
                    {row.name}
                  </div>
                </td>
                <td>{row.down}</td>
                <td>{row.up}</td>
                <td>{row.traffic}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}
