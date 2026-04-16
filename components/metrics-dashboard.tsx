"use client";

import {
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useState,
} from "react";
import { usePathname } from "next/navigation";

import { type IconName } from "@/components/dashboard-kit";
import {
  MainCpuChart,
  MainMemoryChart,
  MainNetworkChart,
} from "@/components/main-metric-charts";
import { DashboardFooter } from "@/components/shell/dashboard-footer";
import { DashboardHeader } from "@/components/shell/dashboard-header";
import { DashboardLeftSidebar } from "@/components/shell/dashboard-left-sidebar";
import { DashboardRightSidebar } from "@/components/shell/dashboard-right-sidebar";
import { SidebarMetricCharts } from "@/components/sidebar-metric-charts";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  GitDeploymentPage,
  GitLogPanel,
  type LogTab,
} from "./git-deployment-page";
import type { MetricsHistoryPoint } from "@/lib/influx-metrics";
import type { DashboardData } from "@/lib/persistence";
import type { MetricsSnapshot } from "@/lib/system-metrics";

const POLL_INTERVAL_MS = 5000;
const HISTORY_LIMIT = 240;
const SIDEBAR_HISTORY_LIMIT = 48;
const LEFT_SIDEBAR_WIDTH_STORAGE_KEY = "vercelab:left-sidebar-width";
const RIGHT_SIDEBAR_WIDTH_STORAGE_KEY = "vercelab:right-sidebar-width";

const MAIN_RANGE_OPTIONS = [
  { value: "1m", label: "1 min" },
  { value: "5m", label: "5 min" },
  { value: "15m", label: "15 min" },
  { value: "1h", label: "1 h" },
  { value: "24h", label: "24 h" },
  { value: "7d", label: "7 d" },
  { value: "30d", label: "30 d" },
  { value: "90d", label: "90 d" },
] as const;

type MainChartRange = (typeof MAIN_RANGE_OPTIONS)[number]["value"];

type DashboardSection = "overview" | "git";

type MetricsDashboardProps = {
  baseDomain: string;
  dashboardData: DashboardData;
  initialGitDeploymentId: string | null;
  initialLogTab: LogTab;
  initialRightPanelCollapsed: boolean;
  initialSection: DashboardSection;
};

const SECTION_META: Record<
  DashboardSection,
  { icon: IconName; label: string }
> = {
  overview: {
    icon: "network",
    label: "Overview",
  },
  git: {
    icon: "cloud",
    label: "Git",
  },
};

function formatClock(value: string) {
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatLoadAverage(loadAverage: MetricsSnapshot["system"]["loadAverage"]) {
  return loadAverage.map((value) => value.toFixed(2)).join(" / ");
}

export default function MetricsDashboard({
  baseDomain,
  dashboardData,
  initialGitDeploymentId,
  initialLogTab,
  initialRightPanelCollapsed,
  initialSection,
}: MetricsDashboardProps) {
  const [activeSection, setActiveSection] =
    useState<DashboardSection>(initialSection);
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
  const [isRightPanelCollapsed, setIsRightPanelCollapsed] = useState(
    initialRightPanelCollapsed,
  );
  const [sidebarInstanceVersion, setSidebarInstanceVersion] = useState(0);
  const [logDeploymentId, setLogDeploymentId] = useState<string | null>(
    initialGitDeploymentId,
  );
  const [activeLogTab, setActiveLogTab] = useState<LogTab>(initialLogTab);
  const [mainHistory, setMainHistory] = useState<MetricsHistoryPoint[]>([]);
  const [sidebarSnapshot, setSidebarSnapshot] =
    useState<MetricsSnapshot | null>(null);
  const [sidebarHistory, setSidebarHistory] = useState<MetricsHistoryPoint[]>(
    [],
  );
  const [overviewRange, setOverviewRange] = useState<MainChartRange>("15m");
  const pathname = usePathname();

  const deferredMainHistory = useDeferredValue(mainHistory);
  const deferredSidebarSnapshot = useDeferredValue(sidebarSnapshot);
  const deferredSidebarHistory = useDeferredValue(sidebarHistory);

  const commitMainSnapshot = useEffectEvent(
    (_nextSnapshot: MetricsSnapshot, nextHistory: MetricsHistoryPoint[]) => {
      startTransition(() => {
        setMainHistory(nextHistory.slice(-HISTORY_LIMIT));
      });
    },
  );

  const commitSidebarSnapshot = useEffectEvent(
    (nextSnapshot: MetricsSnapshot, nextHistory: MetricsHistoryPoint[]) => {
      startTransition(() => {
        setSidebarSnapshot(nextSnapshot);
        setSidebarHistory(nextHistory.slice(-SIDEBAR_HISTORY_LIMIT));
      });
    },
  );

  useEffect(() => {
    setActiveSection(initialSection);
  }, [initialSection]);

  useEffect(() => {
    setLogDeploymentId(initialGitDeploymentId);
  }, [initialGitDeploymentId]);

  useEffect(() => {
    setActiveLogTab(initialLogTab);
  }, [initialLogTab]);

  useEffect(() => {
    setIsRightPanelCollapsed(initialRightPanelCollapsed);
  }, [initialRightPanelCollapsed]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    if (activeSection === "git") {
      params.set("section", "git");

      if (logDeploymentId) {
        params.set("deployment", logDeploymentId);
      } else {
        params.delete("deployment");
      }

      params.set("logs", isRightPanelCollapsed ? "closed" : "open");
      params.set("logTab", activeLogTab);
    } else {
      params.delete("section");
      params.delete("deployment");
      params.delete("logs");
      params.delete("logTab");
    }

    const query = params.toString();
    const nextUrl = query ? `${pathname}?${query}` : pathname;
    const currentUrl = `${window.location.pathname}${window.location.search}`;

    if (currentUrl !== nextUrl) {
      window.history.replaceState(null, "", nextUrl);
    }
  }, [activeLogTab, activeSection, isRightPanelCollapsed, logDeploymentId, pathname]);

  useEffect(() => {
    let active = true;

    const poll = async () => {
      try {
        const response = await fetch(`/api/metrics?range=${overviewRange}`, {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`Metrics request failed with ${response.status}.`);
        }

        const payload = (await response.json()) as {
          snapshot: MetricsSnapshot;
          history: MetricsHistoryPoint[];
        };

        if (!active) {
          return;
        }

        commitMainSnapshot(payload.snapshot, payload.history ?? []);
      } catch (error) {
        if (!active) {
          return;
        }

        console.error(
          error instanceof Error
            ? error.message
            : "Unable to load live metrics.",
        );
      }
    };

    poll();
    const intervalId = window.setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [overviewRange]);

  useEffect(() => {
    let active = true;

    const poll = async () => {
      try {
        const response = await fetch("/api/metrics?mode=current", {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`Metrics request failed with ${response.status}.`);
        }

        const payload = (await response.json()) as {
          snapshot: MetricsSnapshot;
          history: MetricsHistoryPoint[];
        };

        if (!active) {
          return;
        }

        commitSidebarSnapshot(payload.snapshot, payload.history ?? []);
      } catch (error) {
        if (!active) {
          return;
        }

        console.error(
          error instanceof Error
            ? error.message
            : "Unable to load live metrics.",
        );
      }
    };

    poll();
    const intervalId = window.setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, []);

  function handleSectionChange(section: DashboardSection) {
    setActiveSection(section);

    const params = new URLSearchParams(window.location.search);

    if (section === "git") {
      params.set("section", "git");
    } else {
      params.delete("section");
    }

    const query = params.toString();
    const nextUrl = query ? `${pathname}?${query}` : pathname;

    window.history.pushState(null, "", nextUrl);
  }

  function handleResetPanelSizes() {
    window.localStorage.removeItem(LEFT_SIDEBAR_WIDTH_STORAGE_KEY);
    window.localStorage.removeItem(RIGHT_SIDEBAR_WIDTH_STORAGE_KEY);
    setSidebarInstanceVersion((current) => current + 1);
  }

  const timestampLabel = deferredSidebarSnapshot
    ? formatClock(deferredSidebarSnapshot.timestamp)
    : "--:--";
  const isOverviewSection = activeSection === "overview";
  const isGitSection = activeSection === "git";
  const activeRailEntry = SECTION_META[activeSection];

  return (
    <section className="flex h-screen flex-col" aria-label="Dashboard">
      <DashboardHeader
        activeIcon={activeRailEntry.icon}
        activeLabel={activeRailEntry.label}
        baseDomain={baseDomain}
        hostIp={deferredSidebarSnapshot?.hostIp}
        loadAverageLabel={
          deferredSidebarSnapshot
            ? formatLoadAverage(deferredSidebarSnapshot.system.loadAverage)
            : "-"
        }
        onCopyHostIpAction={() =>
          void navigator.clipboard.writeText(
            deferredSidebarSnapshot?.hostIp ?? "",
          )
        }
        onCopyBaseDomainAction={() =>
          void navigator.clipboard.writeText(baseDomain)
        }
        onResetPanelSizesAction={handleResetPanelSizes}
      />

      <div className="flex flex-1 overflow-hidden">
        <DashboardLeftSidebar
          key={`left-${sidebarInstanceVersion}`}
          activeSection={activeSection}
          isPanelCollapsed={isPanelCollapsed}
          panelAriaLabel="system metrics"
          onSectionChangeAction={handleSectionChange}
          onTogglePanelAction={() => setIsPanelCollapsed((current) => !current)}
        >
          <SidebarMetricCharts
            history={deferredSidebarHistory}
            snapshot={deferredSidebarSnapshot}
          />
        </DashboardLeftSidebar>

        <main className="flex-1 overflow-auto p-4">
          {isOverviewSection ? (
            <section className="space-y-4">
              <div
                className="flex items-center justify-between"
                role="toolbar"
                aria-label="Main charts range selector"
              >
                <div className="text-xs font-medium text-muted-foreground">
                  Main graphs
                </div>
                <Tabs
                  value={overviewRange}
                  onValueChange={(value) =>
                    setOverviewRange(value as MainChartRange)
                  }
                >
                  <TabsList>
                    {MAIN_RANGE_OPTIONS.map((option) => (
                      <TabsTrigger key={option.value} value={option.value}>
                        {option.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              </div>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <MainNetworkChart history={deferredMainHistory} />
                <MainCpuChart history={deferredMainHistory} />
                <MainMemoryChart history={deferredMainHistory} />
              </div>
            </section>
          ) : (
            <GitDeploymentPage
              baseDomain={baseDomain}
              currentLogTab={activeLogTab}
              dashboardData={dashboardData}
              initialDeploymentId={logDeploymentId}
              isLogsPanelCollapsed={isRightPanelCollapsed}
              onDeploymentSelectAction={(id) => setLogDeploymentId(id)}
              onToggleLogsAction={(id) => {
                setLogDeploymentId(id);
                setIsRightPanelCollapsed(false);
              }}
            />
          )}
        </main>

        {isGitSection ? (
          <DashboardRightSidebar
            key={`right-${sidebarInstanceVersion}`}
            isCollapsed={isRightPanelCollapsed}
            onToggleAction={() =>
              setIsRightPanelCollapsed((current) => !current)
            }
          >
            <GitLogPanel
              deploymentId={logDeploymentId}
              deployments={dashboardData.deployments}
                initialActiveLogTab={activeLogTab}
                onLogTabChangeAction={setActiveLogTab}
            />
          </DashboardRightSidebar>
        ) : null}
      </div>

      <DashboardFooter
        activeSection={activeSection}
        updatedAtLabel={timestampLabel}
      />
    </section>
  );
}
