"use client";

import { useState } from "react";

import {
  createDeploymentAction,
  fetchDeploymentFromGitAction,
  redeployDeploymentAction,
  removeDeploymentAction,
  updateDeploymentAction,
} from "@/app/actions";
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

function formatDeploymentHref(
  deployment: DashboardDeployment,
  baseDomain: string,
) {
  return `https://${formatDeploymentDomain(deployment, baseDomain)}`;
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

function renderMessageWithLink(message: string) {
  const match = message.match(/https?:\/\/\S+/i);

  if (!match) {
    return message;
  }

  const rawUrl = match[0];
  const normalizedUrl = rawUrl.replace(/[.,!?]+$/, "");
  const start = match.index ?? 0;
  const urlEnd = start + normalizedUrl.length;

  return (
    <>
      {message.slice(0, start)}
      <a
        className="flash-banner__link"
        href={normalizedUrl}
        rel="noreferrer"
        target="_blank"
      >
        {normalizedUrl}
      </a>
      {message.slice(urlEnd)}
    </>
  );
}

export function GitDeploymentPage({
  baseDomain,
  dashboardData,
  flashMessage,
}: GitDeploymentPageProps) {
  const { deployments, stats } = dashboardData;
  const [editingDeploymentId, setEditingDeploymentId] = useState<string | null>(
    null,
  );
  const [pendingDeleteDeploymentId, setPendingDeleteDeploymentId] = useState<
    string | null
  >(null);

  return (
    <div className="git-page">
      <section className="git-hero unifi-card">
        <div>
          <div className="git-hero__eyebrow">Git deployment page</div>
          <h1 className="git-hero__title">Ship containerized apps from git.</h1>
          <p className="git-hero__copy">
            Add a repository, branch, URL prefix, app name, and port. Vercelab
            will clone it, create containers, and route the app through Traefik
            under <strong>{baseDomain}</strong>.
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
          {renderMessageWithLink(flashMessage.message)}
        </div>
      ) : null}

      <div className="git-workspace">
        <section
          className="unifi-card git-form-card"
          aria-label="Add git repository"
        >
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
              <input
                id="branch"
                name="branch"
                placeholder="main"
                required
                type="text"
              />
            </label>

            <label className="field" htmlFor="subdomain">
              <span className="field__label">Wildcard Domain</span>
              <div className="field-combo">
                <input
                  id="subdomain"
                  name="subdomain"
                  placeholder="my-app"
                  required
                  type="text"
                />
                <span className="field-combo__suffix">.{baseDomain}</span>
              </div>
              <span className="field__hint">
                Only enter the wildcard prefix. Vercelab appends .{baseDomain}
                automatically.
              </span>
            </label>

            <label className="field" htmlFor="appName">
              <span className="field__label">App Name</span>
              <input
                id="appName"
                name="appName"
                placeholder="My App"
                required
                type="text"
              />
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

            <label className="field" htmlFor="envVariables">
              <span className="field__label">Variables</span>
              <textarea
                id="envVariables"
                name="envVariables"
                placeholder={
                  "MONGO_URI=mongodb://user:pass@host/db\nNEXTAUTH_SECRET=..."
                }
                rows={5}
              />
              <span className="field__hint">
                Optional. One variable per line in KEY=VALUE format. These are
                passed to container environment and Docker build args.
              </span>
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

        <section
          className="unifi-card git-list-card"
          aria-label="Created deployments"
        >
          <div className="git-section-head">
            <div>
              <div className="git-section-head__title">Created deployments</div>
              <div className="git-section-head__meta">
                Every deployment is persisted, so you can repeat this flow as
                many times as you need.
              </div>
            </div>
            <div className="git-list-card__count">
              {deployments.length} total
            </div>
          </div>

          {deployments.length > 0 ? (
            <div className="git-list">
              {deployments.map((deployment) => (
                <article className="git-line" key={deployment.id}>
                  <div className="git-line__main">
                    <div className="git-line__identity">
                      <div className="git-line__app">{deployment.appName}</div>
                      <a
                        className="git-line__host"
                        href={formatDeploymentHref(deployment, baseDomain)}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {formatDeploymentDomain(deployment, baseDomain)}
                      </a>
                    </div>

                    <div className="git-line__details">
                      <a
                        href={deployment.repositoryUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {formatRepositoryLabel(deployment.repositoryUrl)}
                      </a>
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
                        {deployment.lastOperationSummary ??
                          "Waiting for first operation update."}
                      </span>
                    </div>
                  </div>

                  <div className="git-line__actions">
                    <form action={redeployDeploymentAction}>
                      <input
                        name="deploymentId"
                        type="hidden"
                        value={deployment.id}
                      />
                      <SubmitButton
                        idleLabel="Redeploy"
                        pendingLabel="Redeploying..."
                        size="small"
                        variant="secondary"
                      />
                    </form>

                    <form action={fetchDeploymentFromGitAction}>
                      <input
                        name="deploymentId"
                        type="hidden"
                        value={deployment.id}
                      />
                      <SubmitButton
                        idleLabel="Fetch from Git"
                        pendingLabel="Fetching..."
                        size="small"
                        variant="secondary"
                      />
                    </form>

                    <button
                      className="button button--secondary button--small"
                      onClick={() => {
                        setPendingDeleteDeploymentId(null);
                        setEditingDeploymentId((current) =>
                          current === deployment.id ? null : deployment.id,
                        );
                      }}
                      type="button"
                    >
                      Edit
                    </button>

                    <button
                      className="button button--danger button--small"
                      onClick={() => {
                        setEditingDeploymentId((current) =>
                          current === deployment.id ? null : current,
                        );
                        setPendingDeleteDeploymentId((current) =>
                          current === deployment.id ? null : deployment.id,
                        );
                      }}
                      type="button"
                    >
                      Delete
                    </button>
                  </div>

                  {pendingDeleteDeploymentId === deployment.id ? (
                    <div className="git-delete-confirm" role="alert">
                      <div className="git-delete-confirm__copy">
                        Delete <strong>{deployment.appName}</strong> and remove
                        its deployment workspace?
                      </div>

                      <div className="git-delete-confirm__actions">
                        <form action={removeDeploymentAction}>
                          <input
                            name="deploymentId"
                            type="hidden"
                            value={deployment.id}
                          />
                          <SubmitButton
                            idleLabel="Confirm Delete"
                            pendingLabel="Deleting..."
                            size="small"
                            variant="danger"
                          />
                        </form>

                        <button
                          className="button button--secondary button--small"
                          onClick={() => setPendingDeleteDeploymentId(null)}
                          type="button"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {editingDeploymentId === deployment.id ? (
                    <form
                      action={updateDeploymentAction}
                      className="git-edit-form"
                    >
                      <input
                        name="deploymentId"
                        type="hidden"
                        value={deployment.id}
                      />

                      <label
                        className="field field--compact"
                        htmlFor={`appName-${deployment.id}`}
                      >
                        <span className="field__label">Name</span>
                        <input
                          defaultValue={deployment.appName}
                          id={`appName-${deployment.id}`}
                          name="appName"
                          required
                          type="text"
                        />
                      </label>

                      <label
                        className="field field--compact"
                        htmlFor={`subdomain-${deployment.id}`}
                      >
                        <span className="field__label">Url</span>
                        <div className="field-combo">
                          <input
                            defaultValue={deployment.subdomain}
                            id={`subdomain-${deployment.id}`}
                            name="subdomain"
                            required
                            type="text"
                          />
                          <span className="field-combo__suffix">
                            .{baseDomain}
                          </span>
                        </div>
                      </label>

                      <label
                        className="field field--compact"
                        htmlFor={`port-${deployment.id}`}
                      >
                        <span className="field__label">Port</span>
                        <input
                          defaultValue={String(deployment.port)}
                          id={`port-${deployment.id}`}
                          max="65535"
                          min="1"
                          name="port"
                          required
                          type="number"
                        />
                      </label>

                      <label
                        className="field field--compact"
                        htmlFor={`envVariables-${deployment.id}`}
                      >
                        <span className="field__label">Variables</span>
                        <textarea
                          defaultValue={deployment.envVariables ?? ""}
                          id={`envVariables-${deployment.id}`}
                          name="envVariables"
                          rows={4}
                        />
                      </label>

                      <div className="git-edit-form__actions">
                        <SubmitButton
                          idleLabel="Save"
                          pendingLabel="Saving..."
                          size="small"
                          variant="primary"
                        />
                        <button
                          className="button button--secondary button--small"
                          onClick={() => setEditingDeploymentId(null)}
                          type="button"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <div className="git-empty-state">
              <div className="git-empty-state__title">No deployments yet</div>
              <p className="git-empty-state__copy">
                Add your first git repository and the created container will
                show up here as a new line.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
