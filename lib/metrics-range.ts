export const DASHBOARD_RANGE_OPTIONS = [
  { value: "1m", label: "1 min" },
  { value: "5m", label: "5 min" },
  { value: "15m", label: "15 min" },
  { value: "1h", label: "1 h" },
  { value: "24h", label: "24 h" },
  { value: "7d", label: "7 d" },
  { value: "30d", label: "30 d" },
  { value: "90d", label: "90 d" },
] as const;

export type DashboardRange =
  (typeof DASHBOARD_RANGE_OPTIONS)[number]["value"];

const RANGE_TO_SECONDS: Record<DashboardRange, number> = {
  "1m": 60,
  "5m": 5 * 60,
  "15m": 15 * 60,
  "1h": 60 * 60,
  "24h": 24 * 60 * 60,
  "7d": 7 * 24 * 60 * 60,
  "30d": 30 * 24 * 60 * 60,
  "90d": 90 * 24 * 60 * 60,
};

export function normalizeDashboardRange(
  value: string | null | undefined,
): DashboardRange {
  if (!value) {
    return "15m";
  }

  return value in RANGE_TO_SECONDS ? (value as DashboardRange) : "15m";
}

export function getDashboardRangeSeconds(range: DashboardRange) {
  return RANGE_TO_SECONDS[range];
}