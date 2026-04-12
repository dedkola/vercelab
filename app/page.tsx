import { connection } from "next/server";

import {
  createDeploymentAction,
  redeployDeploymentAction,
  removeDeploymentAction,
  stopDeploymentAction,
} from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";
import { getAppConfig } from "@/lib/app-config";
import { listDashboardData, type DashboardDeployment } from "@/lib/persistence";

export const dynamic = "force-dynamic";

type HomePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function readParam(
  value: string | string[] | undefined,
): string | undefined {
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

function formatVisibility(tokenStored: boolean): string {
  return tokenStored ? "Private ready" : "Public only";
}

export default async function Home({ searchParams }: HomePageProps) {
  await connection();

  const [dashboard, params] = await Promise.all([
    listDashboardData(),
    searchParams,
  ]);
  const config = getAppConfig();

  const noticeMessage = readParam(params.message);
  const noticeStatus = readParam(params.status) === "error" ? "error" : "success";
  const notice =
    noticeMessage && noticeMessage.length > 0
      ? { message: noticeMessage, status: noticeStatus }
      : null;

  return (
    <div className="page-shell">
      <main className="page-content">
        <header className="topbar" aria-label="Workspace header">
          <div className="brand">
            <div className="brand-mark" aria-hidden="true">
              VL
            </div>
            <div className="brand-copy">
              <h1>Vercelab</h1>
              <p>Private homelab deploy control plane</p>
            </div>
          </div>

          <div className="status-row" aria-label="Environment summary">
            <span className="stack-pill">Latest Next.js 16 control plane</span>
            <span className="stack-pill">Traefik + self-signed TLS</span>
            <span className="stack-pill">SQLite now, Postgres later</span>
          </div>
        </header>

        {notice ? (
          <div
            className={`notice notice--${notice.status}`}
            role={notice.status === "error" ? "alert" : "status"}
          >
            {notice.message}
          </div>
        ) : null}

        <section className="hero" aria-labelledby="hero-title">
          <div className="surface hero-card hero-copy">
            <span className="eyebrow">Internal Vercel-style homelab hosting</span>
            <h2 id="hero-title">Clone private GitHub repos and route them on your LAN.</h2>
            <p>
              Vercelab keeps the operator flow simple: add a GitHub repo, choose a
              subdomain, point Traefik at the right container port, and let the
              platform build and run it behind self-signed HTTPS.
            </p>

            <div className="hero-actions">
              <a className="button button--primary" href="#deploy-form">
                Add deployment
              </a>
              <a className="button button--secondary" href="#deployments">
                View active apps
              </a>
            </div>

            <div className="stack-badges" aria-label="Platform capabilities">
              <span className="stack-pill">Dockerfile or docker-compose.yml</span>
              <span className="stack-pill">GitHub PAT for private repos</span>
              <span className="stack-pill">Wildcard LAN domain routing</span>
            </div>
          </div>

          <aside className="surface hero-card hero-side" aria-labelledby="stack-title">
            <div className="section-copy">
              <h3 id="stack-title" className="section-title">
                Stack snapshot
              </h3>
              <p className="muted">
                The control plane runs with a small self-hosted footprint and keeps
                the deployable app logic in Docker where Traefik can discover it.
              </p>
            </div>

            <div className="stat-grid" aria-label="Platform stats">
              <div className="stat-card">
                <span>Total deployments</span>
                <strong>{dashboard.stats.totalDeployments}</strong>
              </div>
              <div className="stat-card">
                <span>Running now</span>
                <strong>{dashboard.stats.runningDeployments}</strong>
              </div>
              <div className="stat-card">
                <span>Failed runs</span>
                <strong>{dashboard.stats.failedDeployments}</strong>
              </div>
              <div className="stat-card">
                <span>Saved repos</span>
                <strong>{dashboard.stats.totalRepositories}</strong>
              </div>
            </div>

            <ul className="helper-list" aria-label="Platform notes">
              <li>
                Base domain: <strong>{config.baseDomain}</strong>
              </li>
              <li>
                Proxy network: <strong>{config.proxy.network}</strong>
              </li>
              <li>
                SQLite path: <strong>{config.database.sqlitePath}</strong>
              </li>
            </ul>
          </aside>
        </section>

        <section className="surface panel" id="deploy-form" aria-labelledby="deploy-form-title">
          <div className="panel-header">
            <div className="section-copy">
              <h3 id="deploy-form-title">Create a deployment</h3>
              <p>
                MVP accepts repositories that already include a root-level
                <code> Dockerfile </code>
                or
                <code> docker-compose.yml </code>
                compatible with Docker Compose.
              </p>
            </div>
          </div>

          <form action={createDeploymentAction} className="form-grid">
            <div className="section-block field--full">
              <div className="section-copy">
                <h4>Repository source</h4>
                <p className="muted">
                  Use an HTTPS GitHub URL. Add a PAT if the repository is private.
                </p>
              </div>

              <div className="field">
                <label htmlFor="repositoryUrl">Repository URL</label>
                <input
                  id="repositoryUrl"
                  name="repositoryUrl"
                  type="url"
                  placeholder="https://github.com/owner/repo.git"
                  required
                />
              </div>

              <div className="field-grid">
                <div className="field">
                  <label htmlFor="githubToken">GitHub token</label>
                  <input
                    id="githubToken"
                    name="githubToken"
                    type="password"
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                    autoComplete="off"
                  />
                  <small>Stored encrypted so redeploys can re-clone private repositories.</small>
                </div>

                <div className="field">
                  <label htmlFor="branch">Branch</label>
                  <input
                    id="branch"
                    name="branch"
                    type="text"
                    placeholder="main"
                    autoComplete="off"
                  />
                  <small>Leave blank to use the repository default branch.</small>
                </div>

                <div className="field">
                  <label htmlFor="serviceName">Compose service name</label>
                  <input
                    id="serviceName"
                    name="serviceName"
                    type="text"
                    placeholder="web"
                    autoComplete="off"
                  />
                  <small>Required when your compose file defines multiple app services.</small>
                </div>
              </div>
            </div>

            <div className="section-block field--full">
              <div className="section-copy">
                <h4>Routing and runtime</h4>
                <p className="muted">
                  Container port is the internal app port Traefik should forward to.
                </p>
              </div>

              <div className="field-grid">
                <div className="field">
                  <label htmlFor="appName">App name</label>
                  <input
                    id="appName"
                    name="appName"
                    type="text"
                    placeholder="Production API"
                    required
                  />
                </div>

                <div className="field">
                  <label htmlFor="subdomain">Subdomain</label>
                  <input
                    id="subdomain"
                    name="subdomain"
                    type="text"
                    placeholder="prod1"
                    required
                  />
                  <small>{`Will route to https://<subdomain>.${config.baseDomain}`}</small>
                </div>

                <div className="field">
                  <label htmlFor="port">Container port</label>
                  <input
                    id="port"
                    name="port"
                    type="number"
                    min="1"
                    max="65535"
                    placeholder="3000"
                    required
                  />
                </div>
              </div>
            </div>

            <div className="field--full">
              <SubmitButton
                idleLabel="Clone, build, and deploy"
                pendingLabel="Deploying..."
                variant="primary"
              />
            </div>
          </form>
        </section>

        <section
          className="surface panel"
          id="deployments"
          aria-labelledby="deployments-title"
        >
          <div className="panel-header">
            <div className="section-copy">
              <h3 id="deployments-title">Deployed apps</h3>
              <p>
                Every card tracks the repo source, routing target, latest operation,
                and quick lifecycle actions.
              </p>
            </div>
          </div>

          {dashboard.deployments.length === 0 ? (
            <div className="empty-state">
              <h4>No deployments yet</h4>
              <p className="muted">
                Start with a Docker-ready GitHub repository and Vercelab will create
                the workspace, build it, and attach it to Traefik.
              </p>
            </div>
          ) : (
            <div className="deployment-list">
              {dashboard.deployments.map((deployment) => {
                const href = `https://${deployment.subdomain}.${config.baseDomain}`;

                return (
                  <article className="surface deployment-card" key={deployment.id}>
                    <div className="deployment-header">
                      <div className="deployment-title">
                        <div className="status-row">
                          <span className={`badge badge--${deployment.status}`}>
                            {formatStatusLabel(deployment.status)}
                          </span>
                          <span className="mini-badge">
                            {deployment.composeMode === "compose"
                              ? "docker-compose"
                              : "Dockerfile"}
                          </span>
                          <span className="mini-badge">
                            {formatVisibility(deployment.tokenStored)}
                          </span>
                        </div>
                        <h4>{deployment.appName}</h4>
                        <a
                          className="deployment-link"
                          href={href}
                          rel="noreferrer"
                          target="_blank"
                        >
                          {href}
                        </a>
                      </div>

                      <div className="section-copy">
                        <span className="muted">Last updated</span>
                        <strong>{formatTimestamp(deployment.updatedAt)}</strong>
                      </div>
                    </div>

                    <div className="deployment-meta">
                      <div className="meta-card">
                        <span>Repository</span>
                        <strong>{deployment.repositoryUrl}</strong>
                      </div>
                      <div className="meta-card">
                        <span>Branch / service</span>
                        <strong>
                          {deployment.branch ?? "default"} / {deployment.serviceName ?? "auto"}
                        </strong>
                      </div>
                      <div className="meta-card">
                        <span>Traefik target</span>
                        <strong>
                          {deployment.subdomain}.{config.baseDomain}:{deployment.port}
                        </strong>
                      </div>
                      <div className="meta-card">
                        <span>Compose project</span>
                        <strong>{deployment.projectName}</strong>
                      </div>
                    </div>

                    <div className="log-block">
                      <div className="section-copy">
                        <h4>Latest operation</h4>
                        <p className="muted">
                          {deployment.lastOperationSummary ?? "No operations recorded yet."}
                        </p>
                      </div>
                      <pre>{deployment.lastOutput ?? "No deployment logs yet."}</pre>
                    </div>

                    <div className="card-actions">
                      <form action={redeployDeploymentAction}>
                        <input name="deploymentId" type="hidden" value={deployment.id} />
                        <SubmitButton
                          idleLabel="Redeploy"
                          pendingLabel="Redeploying..."
                          variant="secondary"
                        />
                      </form>

                      <form action={stopDeploymentAction}>
                        <input name="deploymentId" type="hidden" value={deployment.id} />
                        <SubmitButton
                          idleLabel="Stop"
                          pendingLabel="Stopping..."
                          variant="secondary"
                        />
                      </form>

                      <form action={removeDeploymentAction}>
                        <input name="deploymentId" type="hidden" value={deployment.id} />
                        <SubmitButton
                          idleLabel="Remove"
                          pendingLabel="Removing..."
                          variant="danger"
                        />
                      </form>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
