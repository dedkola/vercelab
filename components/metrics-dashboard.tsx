"use client";

import {
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";

import { Icon, type IconName } from "@/components/dashboard-kit";
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
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  GitDeploymentPage,
  GitLogPanel,
  type GitView,
  type LogTab,
} from "./git-deployment-page";
import type { MetricsHistoryPoint } from "@/lib/influx-metrics";
import type { DashboardData, DashboardDeployment } from "@/lib/persistence";
import type { MetricsSnapshot } from "@/lib/system-metrics";

const POLL_INTERVAL_MS = 5000;
const HISTORY_LIMIT = 240;
const SIDEBAR_HISTORY_LIMIT = 48;
const LEFT_SIDEBAR_WIDTH_STORAGE_KEY = "vercelab:left-sidebar-width";
const RIGHT_SIDEBAR_WIDTH_STORAGE_KEY = "vercelab:right-sidebar-width";
const COLLAPSE_LEFT_SIDEBAR_WIDTH_PX = 1280;
const COLLAPSE_RIGHT_SIDEBAR_WIDTH_PX = 1536;

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
  initialGitView: GitView;
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

function formatLoadAverage(
  loadAverage: MetricsSnapshot["system"]["loadAverage"],
) {
  return loadAverage.map((value) => value.toFixed(2)).join(" / ");
}

export default function MetricsDashboard({
  baseDomain,
  dashboardData,
  initialGitDeploymentId,
  initialGitView,
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
  const [gitDeployments, setGitDeployments] = useState<DashboardDeployment[]>(
    dashboardData.deployments,
  );
  const [gitView, setGitView] = useState<GitView>(initialGitView);
  const [activeLogTab, setActiveLogTab] = useState<LogTab>(initialLogTab);
  const [mainHistory, setMainHistory] = useState<MetricsHistoryPoint[]>([]);
  const [sidebarSnapshot, setSidebarSnapshot] =
    useState<MetricsSnapshot | null>(null);
  const [sidebarHistory, setSidebarHistory] = useState<MetricsHistoryPoint[]>(
    [],
  );
  const [overviewRange, setOverviewRange] = useState<MainChartRange>("15m");
  const pathname = usePathname();
  const responsiveLayoutRef = useRef<{
    leftCollapsed: boolean | null;
    rightCollapsed: boolean | null;
    section: DashboardSection | null;
  }>({
    leftCollapsed: null,
    rightCollapsed: null,
    section: null,
  });

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
    setGitView(initialGitView);
  }, [initialGitView]);

  useEffect(() => {
    setGitDeployments(dashboardData.deployments);
  }, [dashboardData.deployments]);

  useEffect(() => {
    setActiveLogTab(initialLogTab);
  }, [initialLogTab]);

  useEffect(() => {
    setIsRightPanelCollapsed(initialRightPanelCollapsed);
  }, [initialRightPanelCollapsed]);

  useEffect(() => {
    function syncResponsivePanels() {
      const nextLeftCollapsed =
        window.innerWidth < COLLAPSE_LEFT_SIDEBAR_WIDTH_PX;
      const nextRightCollapsed =
        window.innerWidth < COLLAPSE_RIGHT_SIDEBAR_WIDTH_PX;
      const previous = responsiveLayoutRef.current;
      const leftChanged = previous.leftCollapsed !== nextLeftCollapsed;
      const rightChanged = previous.rightCollapsed !== nextRightCollapsed;
      const sectionChanged = previous.section !== activeSection;

      responsiveLayoutRef.current = {
        leftCollapsed: nextLeftCollapsed,
        rightCollapsed: nextRightCollapsed,
        section: activeSection,
      };

      if (nextLeftCollapsed && leftChanged) {
        setIsPanelCollapsed(true);
      }

      if (
        activeSection === "git" &&
        nextRightCollapsed &&
        (rightChanged || sectionChanged)
      ) {
        setIsRightPanelCollapsed(true);
      }
    }

    syncResponsivePanels();
    window.addEventListener("resize", syncResponsivePanels);

    return () => {
      window.removeEventListener("resize", syncResponsivePanels);
    };
  }, [activeSection]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    if (activeSection === "git") {
      params.set("section", "git");

      params.set("gitView", gitView);

      if (gitView === "detail" && logDeploymentId) {
        params.set("deployment", logDeploymentId);
      } else {
        params.delete("deployment");
      }

      params.set("logs", isRightPanelCollapsed ? "closed" : "open");
      params.set("logTab", activeLogTab);
    } else {
      params.delete("section");
      params.delete("gitView");
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
  }, [
    activeLogTab,
    activeSection,
    gitView,
    isRightPanelCollapsed,
    logDeploymentId,
    pathname,
  ]);

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
    <section
      className="flex h-screen flex-col bg-linear-to-b from-background via-muted/8 to-background"
      aria-label="Dashboard"
    >
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

      <div className="flex min-w-0 flex-1 overflow-hidden">
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

        <main className="min-w-0 flex-1 overflow-auto bg-linear-to-b from-background/70 via-muted/18 to-background p-4 md:p-5">
          {isOverviewSection ? (
            <div className="min-h-full rounded-[1.75rem] border border-border/70 bg-linear-to-b from-background via-muted/15 to-background p-4 shadow-[0_38px_100px_-64px_rgba(15,23,42,0.55)] md:p-5">
              <section className="overflow-hidden rounded-[1.5rem] border border-border/70 bg-linear-to-r from-muted/70 via-background to-background shadow-[0_28px_90px_-58px_rgba(15,23,42,0.45)]">
                <div className="flex flex-col gap-6 px-5 py-5 lg:flex-row lg:items-end lg:justify-between">
                  <div className="max-w-3xl space-y-3">
                    <Badge className="w-fit gap-1 rounded-full border border-border/60 bg-background/80 text-foreground shadow-sm">
                      <Icon name="network" className="h-3.5 w-3.5" />
                      Platform overview
                    </Badge>
                    <div className="space-y-2">
                      <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
                        Live host telemetry
                      </h1>
                      <p className="text-sm leading-6 text-muted-foreground">
                        Monitor network throughput, CPU pressure, and memory
                        usage across the control plane in the same polished
                        workspace language as the Git deployment surfaces.
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-border/60 bg-background/80 px-4 py-3 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.24)]">
                      <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                        Host IP
                      </div>
                      <div className="mt-1 text-sm font-semibold text-foreground">
                        {deferredSidebarSnapshot?.hostIp ??
                          "Waiting for metrics"}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-border/60 bg-background/80 px-4 py-3 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.24)]">
                      <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                        Traefik
                      </div>
                      <div className="mt-1 text-sm font-semibold text-foreground">
                        {baseDomain}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-border/60 bg-background/80 px-4 py-3 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.24)]">
                      <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                        Load average
                      </div>
                      <div className="mt-1 text-sm font-semibold text-foreground">
                        {deferredSidebarSnapshot
                          ? formatLoadAverage(
                              deferredSidebarSnapshot.system.loadAverage,
                            )
                          : "Waiting for metrics"}
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <Card className="mt-5 overflow-hidden border-border/70 bg-card/90 shadow-[0_26px_72px_-54px_rgba(15,23,42,0.45)]">
                <CardHeader className="border-b border-border/70 bg-linear-to-r from-muted/55 via-background to-background px-5 py-4">
                  <div
                    className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"
                    role="toolbar"
                    aria-label="Main charts range selector"
                  >
                    <div>
                      <CardTitle className="text-base">Main graphs</CardTitle>
                      <CardDescription>
                        Adjust the time horizon and compare host trends side by
                        side.
                      </CardDescription>
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
                </CardHeader>
                <CardContent className="p-5">
                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                    <MainNetworkChart history={deferredMainHistory} />
                    <MainCpuChart history={deferredMainHistory} />
                    <MainMemoryChart history={deferredMainHistory} />
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <GitDeploymentPage
              activeDeploymentId={logDeploymentId}
              baseDomain={baseDomain}
              currentLogTab={activeLogTab}
              currentView={gitView}
              deployments={gitDeployments}
              isLogsPanelCollapsed={isRightPanelCollapsed}
              onDeploymentsChangeAction={setGitDeployments}
              onDeploymentSelectAction={(id) => setLogDeploymentId(id)}
              onToggleLogsAction={(id) => {
                setLogDeploymentId(id);
                setIsRightPanelCollapsed(false);
              }}
              onViewChangeAction={setGitView}
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
              currentView={gitView}
              deploymentId={logDeploymentId}
              deployments={gitDeployments}
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
