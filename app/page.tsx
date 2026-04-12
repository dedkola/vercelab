import { connection } from "next/server";

import {
  createDeploymentAction,
  redeployDeploymentAction,
  removeDeploymentAction,
  stopDeploymentAction,
} from "@/app/actions";
import {
  DashboardIcon,
  DonutChart,
  TrendChart,
} from "@/components/dashboard-kit";
import { SubmitButton } from "@/components/submit-button";
import { getAppConfig } from "@/lib/app-config";
import { getPlatformHealth } from "@/lib/platform-health";
import {
  getDatabaseHealth,
  listDashboardData,
  type DashboardDeployment,
} from "@/lib/persistence";

export const dynamic = "force-dynamic";

type HomePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const railItems = [
  { href: "#overview", label: "Overview", icon: "overview" as const },
  { href: "#deployments", label: "Deployments", icon: "deployments" as const },
  { href: "#activity", label: "Activity", icon: "activity" as const },
  { href: "#health", label: "Health", icon: "health" as const },
  { href: "#deploy-form", label: "Create", icon: "create" as const },
];

function readParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function formatTimestamp(value: string | null): string {
  if (!value) {
    return "No runs yet";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatRelativeTime(value: string): string {
  const timestamp = new Date(value).getTime();
  const now = Date.now();
  const diffInMinutes = Math.round((timestamp - now) / (1000 * 60));
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  if (Math.abs(diffInMinutes) < 60) {
    return formatter.format(diffInMinutes, "minute");
  }

  const diffInHours = Math.round(diffInMinutes / 60);

  if (Math.abs(diffInHours) < 48) {
    return formatter.format(diffInHours, "hour");
  }

  return formatter.format(Math.round(diffInHours / 24), "day");
}

function formatStatusLabel(status: DashboardDeployment["status"]): string {
  switch (status) {
    case "deploying":
      return "Deploying";
    case "running":
      return "Running";
    case "failed":
      return "Failed";
    case "stopped":
      return "Stopped";
    case "removing":
      return "Removing";
    default:
      return status;
  }
}

function formatOperationLabel(value: string): string {
  switch (value) {
    case "redeploy":
      return "Redeploy";
    default:
      return value.charAt(0).toUpperCase() + value.slice(1);
  }
}

function formatModeLabel(mode: "dockerfile" | "compose" | "unknown"): string {
  switch (mode) {
    case "dockerfile":
      return "Dockerfile";
    case "compose":
      return "Docker Compose";
    default:
      return "Undetected";
  }
}

function formatVisibility(tokenStored: boolean): string {
  return tokenStored ? "Private ready" : "Public only";
}

function formatLogPreview(value: string | null): string {
  if (!value) {
    return "No deployment logs yet.";
  }

  return value.trim().slice(-640);
}

function getActivityTone(status: "pending" | "success" | "failed"): string {
  switch (status) {
    case "success":
      return "positive";
    case "failed":
      return "danger";
    default:
      return "neutral";
  }
}

function getSeverityTone(severity: "error" | "warning", ok: boolean): string {
  if (ok) {
    return "positive";
  }

  return severity === "error" ? "danger" : "warning";
}

export default async function Home({ searchParams }: HomePageProps) {
  await connection();

  const [dashboard, params, platform] = await Promise.all([
    listDashboardData(),
    searchParams,
    getPlatformHealth(),
  ]);
  const config = getAppConfig();
  const database = getDatabaseHealth();

  const noticeMessage = readParam(params.message);
  const noticeStatus =
    readParam(params.status) === "error" ? "error" : "success";
  const notice =
    noticeMessage && noticeMessage.length > 0
      ? { message: noticeMessage, status: noticeStatus }
      : null;

  const totalChecks = platform.checks.length;
  const readyChecks = platform.checks.filter((check) => check.ok).length;
  const blockingChecks = platform.checks.filter(
    (check) => !check.ok && check.severity === "error",
  ).length;
  const warningChecks = platform.checks.filter(
    (check) => !check.ok && check.severity === "warning",
  ).length;
  const healthScore =
    totalChecks > 0 ? Math.round((readyChecks / totalChecks) * 100) : 0;
  const runningShare =
    dashboard.stats.totalDeployments > 0
      ? Math.round(
          (dashboard.stats.runningDeployments /
            dashboard.stats.totalDeployments) *
            100,
        )
      : 0;
  const windowTotals = dashboard.trends.reduce(
    (totals, point) => ({
      total: totals.total + point.total,
      success: totals.success + point.success,
      failed: totals.failed + point.failed,
    }),
    {
      total: 0,
      success: 0,
      failed: 0,
    },
  );

  const statusSegments = dashboard.statusDistribution.map((segment) => ({
    label: formatStatusLabel(segment.status),
    value: segment.count,
    tone: segment.status,
  }));

  const modeSegments = dashboard.modeDistribution.map((segment) => ({
    label: formatModeLabel(segment.mode),
    value: segment.count,
    tone: segment.mode,
  }));

  return (
    <div className="dashboard-shell">
      <aside className="dashboard-rail" aria-label="Feature sections">
        <a className="rail-brand" href="#overview" aria-label="Go to overview">
          <span className="rail-brand__mark">VL</span>
        </a>

        <nav className="rail-nav">
          {railItems.map((item, index) => (
            <a
              aria-current={index === 0 ? "page" : undefined}
              className={`rail-link ${index === 0 ? "rail-link--active" : ""}`}
              href={item.href}
              key={item.label}
              title={item.label}
            >
              <DashboardIcon name={item.icon} title={item.label} />
            </a>
          ))}
        </nav>

        <a
          className="rail-link rail-link--utility"
          href="#health"
          title="Health checks"
        >
          <DashboardIcon name="settings" title="Health checks" />
        </a>
      </aside>

      <main className="workspace-shell">
        <header className="workspace-header">
          <div className="workspace-copy">
            <span className="eyebrow">Operator dashboard</span>
            <h1>Feature dashboard</h1>
            <p>
              UniFi-inspired control surface for deployments, runtime signals,
              and platform readiness.
            </p>
          </div>

          <div className="workspace-actions">
            <div className="header-chip-row" aria-label="Environment summary">
              <span className="header-chip">Domain {config.baseDomain}</span>
              <span className="header-chip">Proxy {config.proxy.network}</span>
              <span className="header-chip">SQLite {database.version}</span>
            </div>

            <div className="header-button-row">
              <a className="button button--secondary" href="#activity">
                Review activity
              </a>
              <a className="button button--primary" href="#deploy-form">
                Add deployment
              </a>
            </div>
          </div>
        </header>

        {notice ? (
          notice.status === "error" ? (
            <div className="notice notice--error" role="alert">
              {notice.message}
            </div>
          ) : (
            <div className="notice notice--success" role="status">
              {notice.message}
            </div>
          )
        ) : null}

        <div className="workspace-grid">
          <aside className="summary-column">
            <section className="module module--summary" id="overview">
              <div className="summary-topline">
                <div>
                  <span className="eyebrow eyebrow--muted">Deploy fabric</span>
                  <h2>{config.baseDomain}</h2>
                </div>
                <span
                  className={`status-pill ${platform.ok ? "status-pill--positive" : "status-pill--warning"}`}
                >
                  {platform.ok ? "Online" : "Attention"}
                </span>
              </div>

              <div className="topology-strip" aria-label="Platform footprint">
                <div className="topology-node">
                  <strong>{dashboard.stats.totalDeployments}</strong>
                  <span>Apps</span>
                </div>
                <div className="topology-node">
                  <strong>{dashboard.stats.runningDeployments}</strong>
                  <span>Running</span>
                </div>
                <div className="topology-node">
                  <strong>{dashboard.stats.totalRepositories}</strong>
                  <span>Repos</span>
                </div>
                <div className="topology-node">
                  <strong>{healthScore}%</strong>
                  <span>Ready</span>
                </div>
              </div>

              <div className="summary-grid">
                <div>
                  <span>Proxy network</span>
                  <strong>{config.proxy.network}</strong>
                </div>
                <div>
                  <span>Database</span>
                  <strong>{database.provider}</strong>
                </div>
                <div>
                  <span>Running share</span>
                  <strong>{runningShare}%</strong>
                </div>
                <div>
                  <span>Action volume</span>
                  <strong>{windowTotals.total}</strong>
                </div>
              </div>

              <div className="status-track" aria-hidden="true">
                {statusSegments.length > 0 ? (
                  statusSegments.map((segment) =>
                    Array.from({ length: segment.value }, (_, index) => (
                      <span
                        className={`status-track__segment status-track__segment--${segment.label.toLowerCase().replace(/\s+/g, "-")}`}
                        key={`${segment.label}-${index}`}
                      />
                    )),
                  )
                ) : (
                  <span className="status-track__segment status-track__segment--idle" />
                )}
              </div>

              <p className="module-note">
                {dashboard.stats.runningDeployments} active routes across{" "}
                {dashboard.stats.totalRepositories} repository sources.
              </p>
            </section>

            <section className="module module--compact">
              <div className="module-header">
                <div>
                  <span className="eyebrow eyebrow--muted">Quick access</span>
                  <h3>Routing shortcuts</h3>
                </div>
              </div>

              <div className="link-stack">
                <a
                  className="shortcut-link"
                  href="/api/health"
                  target="_blank"
                  rel="noreferrer"
                >
                  <span>Health JSON</span>
                  <DashboardIcon name="external" title="Open health JSON" />
                </a>
                <a className="shortcut-link" href="#deploy-form">
                  <span>Create deployment</span>
                  <DashboardIcon name="create" title="Create deployment" />
                </a>
                <a className="shortcut-link" href="#deployments">
                  <span>Manage deployments</span>
                  <DashboardIcon
                    name="deployments"
                    title="Manage deployments"
                  />
                </a>
              </div>
            </section>

            <section className="module module--compact">
              <div className="module-header">
                <div>
                  <span className="eyebrow eyebrow--muted">
                    Feature pattern
                  </span>
                  <h3>Default controls</h3>
                </div>
              </div>

              <div className="chip-stack">
                <span className="ui-chip ui-chip--active">Overview</span>
                <span className="ui-chip">Signals</span>
                <span className="ui-chip">Health</span>
                <span className="ui-chip">Forms</span>
              </div>

              <p className="module-note">
                White surfaces, compact rails, chart-led headers, and dense
                action rows now define the default dashboard language.
              </p>
            </section>
          </aside>

          <div className="content-column">
            <section
              className="kpi-grid"
              aria-label="Deployment overview metrics"
            >
              <article className="kpi-card">
                <span>Running apps</span>
                <strong>{dashboard.stats.runningDeployments}</strong>
                <small>{runningShare}% of tracked deployments are live.</small>
              </article>
              <article className="kpi-card">
                <span>Failures in window</span>
                <strong>{windowTotals.failed}</strong>
                <small>Historical failures across the last eight days.</small>
              </article>
              <article className="kpi-card">
                <span>Health score</span>
                <strong>{healthScore}%</strong>
                <small>
                  {blockingChecks} blocking checks require attention.
                </small>
              </article>
              <article className="kpi-card">
                <span>Tracked repos</span>
                <strong>{dashboard.stats.totalRepositories}</strong>
                <small>
                  {modeSegments.find(
                    (segment) => segment.label === "Docker Compose",
                  )?.value ?? 0}{" "}
                  compose stacks currently mapped.
                </small>
              </article>
            </section>

            <section className="module module--hero-chart">
              <div className="module-header module-header--split">
                <div>
                  <span className="eyebrow eyebrow--muted">
                    Historical traffic
                  </span>
                  <h2>Deployment activity</h2>
                  <p className="module-note">
                    Trend line built from real operation history in the existing
                    SQLite store.
                  </p>
                </div>

                <div
                  className="toolbar-row"
                  aria-label="Dashboard time controls"
                >
                  <span className="ui-chip ui-chip--active">1W</span>
                  <span className="ui-chip">1M</span>
                  <span className="ui-chip ui-chip--live">Live window</span>
                </div>
              </div>

              <TrendChart data={dashboard.trends} />

              <div className="legend-row">
                <span className="legend-item">
                  <span className="legend-swatch legend-swatch--primary" />
                  Total activity
                </span>
                <span className="legend-item">
                  <span className="legend-swatch legend-swatch--success" />
                  Successful runs
                </span>
                <span className="legend-item">
                  <span className="legend-swatch legend-swatch--danger" />
                  Failed runs
                </span>
                <span className="legend-meta">
                  {windowTotals.total} operations in the current window
                </span>
              </div>
            </section>

            <section className="insight-grid">
              <article className="module">
                <div className="module-header">
                  <div>
                    <span className="eyebrow eyebrow--muted">Current mix</span>
                    <h3>Deployment status</h3>
                  </div>
                </div>

                <DonutChart
                  segments={statusSegments}
                  totalLabel="Tracked deployments"
                  totalValue={String(dashboard.stats.totalDeployments)}
                />
              </article>

              <article className="module">
                <div className="module-header">
                  <div>
                    <span className="eyebrow eyebrow--muted">
                      Runtime pattern
                    </span>
                    <h3>Build modes</h3>
                  </div>
                </div>

                <DonutChart
                  segments={modeSegments}
                  totalLabel="Build targets"
                  totalValue={String(
                    modeSegments.reduce(
                      (sum, segment) => sum + segment.value,
                      0,
                    ),
                  )}
                />
              </article>

              <article className="module" id="activity">
                <div className="module-header module-header--split">
                  <div>
                    <span className="eyebrow eyebrow--muted">
                      Activity feed
                    </span>
                    <h3>Recent operations</h3>
                  </div>
                  <span className="module-note">
                    {dashboard.recentActivity.length} recent events
                  </span>
                </div>

                {dashboard.recentActivity.length > 0 ? (
                  <ul className="activity-list">
                    {dashboard.recentActivity.map((item) => (
                      <li className="activity-row" key={item.id}>
                        <div>
                          <div className="activity-heading">
                            <strong>{item.appName}</strong>
                            <span
                              className={`status-pill status-pill--${getActivityTone(item.status)}`}
                            >
                              {item.status}
                            </span>
                          </div>
                          <p>
                            {item.summary ??
                              `${formatOperationLabel(item.operationType)} recorded.`}
                          </p>
                        </div>
                        <div className="activity-meta">
                          <span>
                            {formatOperationLabel(item.operationType)}
                          </span>
                          <strong>{formatRelativeTime(item.createdAt)}</strong>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="empty-state empty-state--tight">
                    <h4>No activity yet</h4>
                    <p className="muted">
                      Operations will appear here after the first deployment
                      workflow completes.
                    </p>
                  </div>
                )}
              </article>
            </section>

            <section className="feature-grid">
              <article className="module" id="deploy-form">
                <div className="module-header module-header--split">
                  <div>
                    <span className="eyebrow eyebrow--muted">Quick action</span>
                    <h3>Create deployment</h3>
                    <p className="module-note">
                      Compact feature form with the same backend workflow as the
                      original page.
                    </p>
                  </div>
                  <span className="status-pill">Secure PAT supported</span>
                </div>

                <form
                  action={createDeploymentAction}
                  className="deploy-form-grid"
                >
                  <div className="field field--full">
                    <label htmlFor="repositoryUrl">Repository URL</label>
                    <input
                      autoComplete="off"
                      id="repositoryUrl"
                      name="repositoryUrl"
                      placeholder="https://github.com/owner/repo.git"
                      required
                      type="url"
                    />
                  </div>

                  <div className="field">
                    <label htmlFor="appName">App name</label>
                    <input
                      id="appName"
                      name="appName"
                      placeholder="Production API"
                      required
                      type="text"
                    />
                  </div>

                  <div className="field">
                    <label htmlFor="subdomain">Subdomain</label>
                    <input
                      id="subdomain"
                      name="subdomain"
                      placeholder="prod1"
                      required
                      type="text"
                    />
                    <small>{`Will route to https://<subdomain>.${config.baseDomain}`}</small>
                  </div>

                  <div className="field">
                    <label htmlFor="port">Container port</label>
                    <input
                      id="port"
                      max="65535"
                      min="1"
                      name="port"
                      placeholder="3000"
                      required
                      type="number"
                    />
                  </div>

                  <div className="field">
                    <label htmlFor="branch">Branch</label>
                    <input
                      autoComplete="off"
                      id="branch"
                      name="branch"
                      placeholder="main"
                      type="text"
                    />
                  </div>

                  <div className="field">
                    <label htmlFor="serviceName">Compose service</label>
                    <input
                      autoComplete="off"
                      id="serviceName"
                      name="serviceName"
                      placeholder="web"
                      type="text"
                    />
                  </div>

                  <div className="field field--full">
                    <label htmlFor="githubToken">GitHub token</label>
                    <input
                      autoComplete="off"
                      id="githubToken"
                      name="githubToken"
                      placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                      type="password"
                    />
                    <small>
                      Encrypted at rest for private repository redeploys.
                    </small>
                  </div>

                  <div className="submit-row field--full">
                    <SubmitButton
                      idleLabel="Clone, build, and deploy"
                      pendingLabel="Deploying..."
                      variant="primary"
                    />
                  </div>
                </form>
              </article>

              <article className="module" id="health">
                <div className="module-header module-header--split">
                  <div>
                    <span className="eyebrow eyebrow--muted">Readiness</span>
                    <h3>Platform health</h3>
                    <p className="module-note">
                      Checks sourced from the same readiness logic used by the
                      health API.
                    </p>
                  </div>
                  <span
                    className={`status-pill ${platform.ok ? "status-pill--positive" : "status-pill--warning"}`}
                  >
                    {platform.ok ? "Ready" : "Review required"}
                  </span>
                </div>

                <div className="health-overview-grid">
                  <div className="health-overview-card">
                    <span>Passing</span>
                    <strong>{readyChecks}</strong>
                  </div>
                  <div className="health-overview-card">
                    <span>Warnings</span>
                    <strong>{warningChecks}</strong>
                  </div>
                  <div className="health-overview-card">
                    <span>Blocking</span>
                    <strong>{blockingChecks}</strong>
                  </div>
                </div>

                <ul className="health-list">
                  {platform.checks.map((check) => (
                    <li className="health-row" key={check.id}>
                      <div>
                        <div className="activity-heading">
                          <strong>{check.label}</strong>
                          <span
                            className={`status-pill status-pill--${getSeverityTone(check.severity, check.ok)}`}
                          >
                            {check.ok ? "ok" : check.severity}
                          </span>
                        </div>
                        <p>{check.message}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </article>
            </section>

            <section className="module module--deployments" id="deployments">
              <div className="module-header module-header--split">
                <div>
                  <span className="eyebrow eyebrow--muted">
                    Runtime inventory
                  </span>
                  <h2>Deployed apps</h2>
                  <p className="module-note">
                    Compact operator rows with lifecycle actions, route targets,
                    and expandable log tails.
                  </p>
                </div>
                <div className="toolbar-row">
                  <span className="ui-chip ui-chip--active">All</span>
                  <span className="ui-chip">Running</span>
                  <span className="ui-chip">Failed</span>
                </div>
              </div>

              {dashboard.deployments.length === 0 ? (
                <div className="empty-state">
                  <h4>No deployments yet</h4>
                  <p className="muted">
                    Start with a Docker-ready GitHub repository and Vercelab
                    will build, route, and track it here.
                  </p>
                </div>
              ) : (
                <div className="deployment-rows">
                  {dashboard.deployments.map((deployment) => {
                    const href = `https://${deployment.subdomain}.${config.baseDomain}`;

                    return (
                      <article
                        className="deployment-row-card"
                        key={deployment.id}
                      >
                        <div className="deployment-row-card__grid">
                          <div className="deployment-primary">
                            <div className="deployment-heading-row">
                              <span
                                className={`status-pill status-pill--${deployment.status}`}
                              >
                                {formatStatusLabel(deployment.status)}
                              </span>
                              <span className="mini-pill">
                                {formatModeLabel(
                                  deployment.composeMode ?? "unknown",
                                )}
                              </span>
                              <span className="mini-pill">
                                {formatVisibility(deployment.tokenStored)}
                              </span>
                            </div>
                            <h3>{deployment.appName}</h3>
                            <p>{deployment.repositoryUrl}</p>
                          </div>

                          <div className="deployment-cell">
                            <span>Route</span>
                            <a
                              className="deployment-link"
                              href={href}
                              rel="noreferrer"
                              target="_blank"
                            >
                              {href}
                              <DashboardIcon
                                name="external"
                                title="Open deployment"
                              />
                            </a>
                            <small>
                              {deployment.subdomain}.{config.baseDomain}:
                              {deployment.port}
                            </small>
                          </div>

                          <div className="deployment-cell">
                            <span>Build target</span>
                            <strong>
                              {deployment.branch ?? "default"} /{" "}
                              {deployment.serviceName ?? "auto"}
                            </strong>
                            <small>{deployment.projectName}</small>
                          </div>

                          <div className="deployment-cell">
                            <span>Latest operation</span>
                            <strong>
                              {deployment.lastOperationSummary ??
                                "No operations recorded yet."}
                            </strong>
                            <small>
                              {formatTimestamp(deployment.updatedAt)}
                            </small>
                          </div>

                          <div className="deployment-actions">
                            <form action={redeployDeploymentAction}>
                              <input
                                name="deploymentId"
                                type="hidden"
                                value={deployment.id}
                              />
                              <SubmitButton
                                idleLabel="Redeploy"
                                pendingLabel="Redeploying..."
                                variant="secondary"
                              />
                            </form>

                            <form action={stopDeploymentAction}>
                              <input
                                name="deploymentId"
                                type="hidden"
                                value={deployment.id}
                              />
                              <SubmitButton
                                idleLabel="Stop"
                                pendingLabel="Stopping..."
                                variant="secondary"
                              />
                            </form>

                            <form action={removeDeploymentAction}>
                              <input
                                name="deploymentId"
                                type="hidden"
                                value={deployment.id}
                              />
                              <SubmitButton
                                idleLabel="Remove"
                                pendingLabel="Removing..."
                                variant="danger"
                              />
                            </form>
                          </div>
                        </div>

                        <details className="log-disclosure">
                          <summary>Inspect latest log tail</summary>
                          <pre>{formatLogPreview(deployment.lastOutput)}</pre>
                        </details>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
