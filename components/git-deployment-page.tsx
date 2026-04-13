"use client";

import { createDeploymentAction } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";
import type { DashboardData, DashboardDeployment } from "@/lib/persistence";

type GitDeploymentPageProps = {
  baseDomain: string;
  dashboardData: DashboardData;
  flashMessage: {
    message: string;
    status: "success" | "error";
  } | null;
};

const deploymentTimeFormatter = new Intl.DateTimeFormat("en", {
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  month: "short",
});

function formatRepositoryLabel(repositoryUrl: string) {
  const trimmedUrl = repositoryUrl.replace(/\.git$/i, "");
  const segments = trimmedUrl.split("/").filter(Boolean);
  const tail = segments.slice(-2);

  return tail.length === 2 ? tail.join("/") : repositoryUrl;
}


function formatDeploymentDomain(
  deployment: DashboardDeployment,
  baseDomain: string,
) {
  return `${deployment.subdomain}.${baseDomain}`;
}

function formatDeploymentStatus(status: DashboardDeployment["status"]) {
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

function formatDeploymentTime(updatedAt: string) {
  return deploymentTimeFormatter.format(new Date(updatedAt));
}

export function GitDeploymentPage({
  baseDomain,
  dashboardData,
  flashMessage,
}: GitDeploymentPageProps) {
  const { deployments, stats } = dashboardData;

  return (
    <div className="git-page">
      <section className="git-hero unifi-card">
        <div>
          <div className="git-hero__eyebrow">Git deployment page</div>
          <h1 className="git-hero__title">Ship containerized apps from git.</h1>
          <p className="git-hero__copy">
            Add a repository, branch, domain, app name, and port. Vercelab will
            clone it, create containers, and route the app through Traefik under
            {" "}
            <strong>{baseDomain}</strong>.
          </p>
        </div>

        <div className="git-hero__stats">
          <div className="git-stat">
            <span className="git-stat__label">Deployments</span>
            <span className="git-stat__value">{stats.totalDeployments}</span>
          </div>
          <div className="git-stat">
            <span className="git-stat__label">Running</span>
            <span className="git-stat__value">{stats.runningDeployments}</span>
          </div>
          <div className="git-stat">
            <span className="git-stat__label">Repositories</span>
            <span className="git-stat__value">{stats.totalRepositories}</span>
          </div>
        </div>
      </section>

      {flashMessage?.message ? (
        <div
          className={`flash-banner flash-banner--${flashMessage.status}`}
          role="status"
        >
          {flashMessage.message}
        </div>
      ) : null}

      <div className="git-workspace">
        <section className="unifi-card git-form-card" aria-label="Add git repository">
          <div className="git-section-head">
            <div>
              <div className="git-section-head__title">Add Git Repo</div>
              <div className="git-section-head__meta">
                A Dockerfile or compose file is required inside the repository.
              </div>
            </div>
          </div>

          <form action={createDeploymentAction} className="git-form">
            <label className="field" htmlFor="repositoryUrl">
              <span className="field__label">Git URL</span>
              <input
                id="repositoryUrl"
                name="repositoryUrl"
                placeholder="https://github.com/owner/repo.git"
                required
                type="url"
              />
            </label>

            <label className="field" htmlFor="branch">
              <span className="field__label">Branch Name</span>
              <input id="branch" name="branch" placeholder="main" required type="text" />
            </label>

            <label className="field" htmlFor="domain">
              <span className="field__label">Domain</span>
              <input
                id="domain"
                name="domain"
                placeholder={`my-app.${baseDomain}`}
                required
                type="text"
              />
              <span className="field__hint">
                Use a subdomain or full host under {baseDomain}.
              </span>
            </label>

            <label className="field" htmlFor="appName">
              <span className="field__label">App Name</span>
              <input id="appName" name="appName" placeholder="My App" required type="text" />
            </label>

            <label className="field" htmlFor="port">
              <span className="field__label">Port</span>
              <input
                defaultValue="3000"
                id="port"
                max="65535"
                min="1"
                name="port"
                required
                type="number"
              />
            </label>

            <div className="git-form__actions">
              <p className="git-form__note">
                When all fields are filled, Vercelab creates the deployment and
                adds it to the list below.
              </p>
              <SubmitButton
                idleLabel="Add"
                pendingLabel="Creating..."
                variant="primary"
              />
            </div>
          </form>
        </section>

        <section className="unifi-card git-list-card" aria-label="Created deployments">
          <div className="git-section-head">
            <div>
              <div className="git-section-head__title">Created deployments</div>
              <div className="git-section-head__meta">
                Every deployment is persisted, so you can repeat this flow as
                many times as you need.
              </div>
            </div>
            <div className="git-list-card__count">{deployments.length} total</div>
          </div>

          {deployments.length > 0 ? (
            <div className="git-list">
              {deployments.map((deployment) => (
                <article className="git-line" key={deployment.id}>
                  <div className="git-line__identity">
                    <div className="git-line__app">{deployment.appName}</div>
                    <div className="git-line__host">
                      {formatDeploymentDomain(deployment, baseDomain)}
                    </div>
                  </div>

                  <div className="git-line__details">
                    <span>{formatRepositoryLabel(deployment.repositoryUrl)}</span>
                    <span>{deployment.branch ?? "default branch"}</span>
                    <span>Port {deployment.port}</span>
                    <span>{formatDeploymentTime(deployment.updatedAt)}</span>
                  </div>

                  <div className="git-line__status-wrap">
                    <span
                      className={`git-status git-status--${deployment.status}`}
                    >
                      {formatDeploymentStatus(deployment.status)}
                    </span>
                    <span className="git-line__summary">
                      {deployment.lastOperationSummary ?? "Waiting for first operation update."}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="git-empty-state">
              <div className="git-empty-state__title">No deployments yet</div>
              <p className="git-empty-state__copy">
                Add your first git repository and the created container will show
                up here as a new line.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}