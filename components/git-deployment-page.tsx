"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import {
  fetchDeploymentFromGitAction,
  redeployDeploymentAction,
  removeDeploymentAction,
  stopDeploymentAction,
  updateDeploymentAction,
} from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";
import type { GitHubRepository } from "@/lib/github";
import type { DashboardData, DashboardDeployment } from "@/lib/persistence";

type GitDeploymentPageProps = {
  baseDomain: string;
  dashboardData: DashboardData;
  flashMessage: {
    message: string;
    status: "success" | "error";
  } | null;
  githubToken: string;
  repositoryDraft: GitHubRepository | null;
  repositoryDraftSignal: number;
};

type DraftFormState = {
  repositoryUrl: string;
  branch: string;
  appName: string;
  subdomain: string;
  port: string;
  serviceName: string;
  envVariables: string;
};

type DeploymentLogPayload = {
  type: "build" | "container";
  deploymentId: string;
  appName: string;
  summary: string;
  output: string;
  status: string;
  updatedAt: string;
};

type LogTab = "build" | "container";

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

function toSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

function toAppName(value: string) {
  return value
    .split(/[-_]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function buildDraftState(repository: GitHubRepository | null): DraftFormState {
  if (!repository) {
    return {
      repositoryUrl: "",
      branch: "main",
      appName: "",
      subdomain: "",
      port: "3000",
      serviceName: "",
      envVariables: "",
    };
  }

  return {
    repositoryUrl: repository.cloneUrl,
    branch: repository.defaultBranch,
    appName: toAppName(repository.name),
    subdomain: toSlug(repository.name),
    port: "3000",
    serviceName: "",
    envVariables: "",
  };
}

export function GitDeploymentPage({
  baseDomain,
  dashboardData,
  flashMessage,
  githubToken,
  repositoryDraft,
  repositoryDraftSignal,
}: GitDeploymentPageProps) {
  const router = useRouter();
  const { deployments, stats } = dashboardData;
  const [editingDeploymentId, setEditingDeploymentId] = useState<string | null>(
    null,
  );
  const [pendingDeleteDeploymentId, setPendingDeleteDeploymentId] = useState<
    string | null
  >(null);
  const [draftState, setDraftState] = useState<DraftFormState>(() =>
    buildDraftState(repositoryDraft),
  );
  const [localBanner, setLocalBanner] =
    useState<GitDeploymentPageProps["flashMessage"]>(null);
  const [isCreatingDeployment, setIsCreatingDeployment] = useState(false);
  const [selectedDeploymentId, setSelectedDeploymentId] = useState<
    string | null
  >(deployments[0]?.id ?? null);
  const [preferredDeploymentId, setPreferredDeploymentId] = useState<
    string | null
  >(null);
  const [activeLogTab, setActiveLogTab] = useState<LogTab>("build");
  const [logRefreshKey, setLogRefreshKey] = useState(0);
  const [logState, setLogState] = useState<{
    isLoading: boolean;
    error: string | null;
    payload: DeploymentLogPayload | null;
  }>({
    isLoading: false,
    error: null,
    payload: null,
  });

  const activeBanner = localBanner ?? flashMessage;
  const selectedDeployment =
    deployments.find((deployment) => deployment.id === selectedDeploymentId) ??
    null;

  useEffect(() => {
    if (!repositoryDraft) {
      return;
    }

    setDraftState(buildDraftState(repositoryDraft));
    setLocalBanner(null);
  }, [repositoryDraft, repositoryDraftSignal]);

  useEffect(() => {
    if (deployments.length === 0) {
      setSelectedDeploymentId(null);
      return;
    }

    if (
      preferredDeploymentId &&
      deployments.some((deployment) => deployment.id === preferredDeploymentId)
    ) {
      setSelectedDeploymentId(preferredDeploymentId);
      setPreferredDeploymentId(null);
      return;
    }

    setSelectedDeploymentId((current) => {
      if (
        current &&
        deployments.some((deployment) => deployment.id === current)
      ) {
        return current;
      }

      return deployments[0]?.id ?? null;
    });
  }, [deployments, preferredDeploymentId]);

  useEffect(() => {
    let cancelled = false;

    if (!selectedDeploymentId) {
      setLogState({
        isLoading: false,
        error: null,
        payload: null,
      });
      return;
    }

    const loadLogs = async () => {
      setLogState((current) => ({
        ...current,
        isLoading: true,
        error: null,
      }));

      try {
        const response = await fetch(
          `/api/deployments/${selectedDeploymentId}/logs?type=${activeLogTab}`,
          {
            cache: "no-store",
          },
        );
        const payload = (await response.json()) as
          | DeploymentLogPayload
          | { error?: string };

        if (!response.ok) {
          throw new Error(
            "error" in payload && payload.error
              ? payload.error
              : "Unable to load deployment logs.",
          );
        }

        if (cancelled) {
          return;
        }

        setLogState({
          isLoading: false,
          error: null,
          payload: payload as DeploymentLogPayload,
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        setLogState({
          isLoading: false,
          error:
            error instanceof Error
              ? error.message
              : "Unable to load deployment logs.",
          payload: null,
        });
      }
    };

    void loadLogs();

    return () => {
      cancelled = true;
    };
  }, [selectedDeploymentId, activeLogTab, logRefreshKey]);

  async function handleCreateDeployment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setIsCreatingDeployment(true);
    setLocalBanner(null);

    try {
      const response = await fetch("/api/deployments", {
        method: "POST",
        body: new FormData(event.currentTarget),
      });
      const payload = (await response.json()) as
        | { deploymentId: string; domain: string }
        | { error?: string };

      if (!response.ok) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Unable to create deployment.",
        );
      }

      if (!("deploymentId" in payload)) {
        throw new Error("Deployment response was incomplete.");
      }

      setPreferredDeploymentId(payload.deploymentId);
      setSelectedDeploymentId(payload.deploymentId);
      setActiveLogTab("build");
      setLocalBanner({
        status: "success",
        message: `Deployment live at https://${payload.domain}`,
      });
      router.refresh();
    } catch (error) {
      setLocalBanner({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Unable to create deployment.",
      });
    } finally {
      setIsCreatingDeployment(false);
    }
  }

  return (
    <div className="git-page">
      <section className="git-hero unifi-card">
        <div>
          <div className="git-hero__eyebrow">Git deployment page</div>
          <h1 className="git-hero__title">Deploy selected repositories.</h1>
          <p className="git-hero__copy">
            Use the Git sidebar to load your repositories by token, seed a
            deployment draft, and inspect each app from build output to
            container runtime logs.
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

      {activeBanner?.message ? (
        <div
          className={`flash-banner flash-banner--${activeBanner.status}`}
          role="status"
        >
          {renderMessageWithLink(activeBanner.message)}
        </div>
      ) : null}

      <div className="git-shell">
        <div className="git-main-column">
          <section
            className="unifi-card git-compose-card"
            aria-label="Deployment draft"
          >
            <div className="git-section-head">
              <div>
                <div className="git-section-head__title">Deploy repository</div>
                <div className="git-section-head__meta">
                  A selected repository becomes a deployment draft here. Review
                  the app name, branch, subdomain, and port before creating the
                  deployment.
                </div>
              </div>
            </div>

            {repositoryDraft ? (
              <form
                className="git-form git-form--draft"
                onSubmit={handleCreateDeployment}
              >
                <input name="githubToken" type="hidden" value={githubToken} />
                <input
                  name="repositoryUrl"
                  type="hidden"
                  value={draftState.repositoryUrl}
                />

                <div className="git-draft">
                  <div>
                    <div className="git-draft__label">Selected repository</div>
                    <div className="git-draft__name">
                      {repositoryDraft.fullName}
                    </div>
                    <div className="git-draft__meta">
                      <span>{repositoryDraft.visibility}</span>
                      <span>{repositoryDraft.defaultBranch}</span>
                      <span>
                        Updated{" "}
                        {formatDeploymentTime(repositoryDraft.updatedAt)}
                      </span>
                    </div>
                  </div>

                  <a
                    className="git-draft__link"
                    href={draftState.repositoryUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {draftState.repositoryUrl}
                  </a>
                </div>

                <div className="git-form__grid">
                  <label className="field" htmlFor="branch">
                    <span className="field__label">Branch</span>
                    <input
                      id="branch"
                      name="branch"
                      onChange={(event) =>
                        setDraftState((current) => ({
                          ...current,
                          branch: event.target.value,
                        }))
                      }
                      required
                      type="text"
                      value={draftState.branch}
                    />
                  </label>

                  <label className="field" htmlFor="appName">
                    <span className="field__label">App name</span>
                    <input
                      id="appName"
                      name="appName"
                      onChange={(event) =>
                        setDraftState((current) => ({
                          ...current,
                          appName: event.target.value,
                        }))
                      }
                      required
                      type="text"
                      value={draftState.appName}
                    />
                  </label>

                  <label className="field" htmlFor="subdomain">
                    <span className="field__label">Wildcard domain</span>
                    <div className="field-combo">
                      <input
                        id="subdomain"
                        name="subdomain"
                        onChange={(event) =>
                          setDraftState((current) => ({
                            ...current,
                            subdomain: event.target.value,
                          }))
                        }
                        required
                        type="text"
                        value={draftState.subdomain}
                      />
                      <span className="field-combo__suffix">.{baseDomain}</span>
                    </div>
                  </label>

                  <label className="field" htmlFor="port">
                    <span className="field__label">Port</span>
                    <input
                      id="port"
                      max="65535"
                      min="1"
                      name="port"
                      onChange={(event) =>
                        setDraftState((current) => ({
                          ...current,
                          port: event.target.value,
                        }))
                      }
                      required
                      type="number"
                      value={draftState.port}
                    />
                  </label>

                  <label className="field" htmlFor="serviceName">
                    <span className="field__label">Service name</span>
                    <input
                      id="serviceName"
                      name="serviceName"
                      onChange={(event) =>
                        setDraftState((current) => ({
                          ...current,
                          serviceName: event.target.value,
                        }))
                      }
                      placeholder="Optional for multi-service compose repos"
                      type="text"
                      value={draftState.serviceName}
                    />
                  </label>
                </div>

                <label className="field" htmlFor="envVariables">
                  <span className="field__label">Variables</span>
                  <textarea
                    id="envVariables"
                    name="envVariables"
                    onChange={(event) =>
                      setDraftState((current) => ({
                        ...current,
                        envVariables: event.target.value,
                      }))
                    }
                    placeholder={
                      "MONGO_URI=mongodb://user:pass@host/db\nNEXTAUTH_SECRET=..."
                    }
                    rows={5}
                    value={draftState.envVariables}
                  />
                  <span className="field__hint">
                    Optional. One variable per line in KEY=VALUE format. If the
                    repository is private, keep the token in the Git sidebar so
                    it can be stored with the deployment.
                  </span>
                </label>

                <div className="git-form__actions git-form__actions--inline">
                  <p className="git-form__note">
                    Vercelab clones the selected repository, builds the app, and
                    exposes it at .{baseDomain}.
                  </p>
                  <button
                    className="button button--primary"
                    disabled={isCreatingDeployment}
                    type="submit"
                  >
                    {isCreatingDeployment
                      ? "Deploying..."
                      : "Create deployment"}
                  </button>
                </div>
              </form>
            ) : (
              <div className="git-empty-state git-empty-state--draft">
                <div className="git-empty-state__title">
                  Select a repository from the sidebar
                </div>
                <p className="git-empty-state__copy">
                  Load repositories with your GitHub token, choose one from the
                  dropdown, and press Add to seed the deployment form here.
                </p>
              </div>
            )}
          </section>

          <div className="git-application-grid">
            <section
              className="unifi-card git-apps-card"
              aria-label="Deployed applications"
            >
              <div className="git-section-head">
                <div>
                  <div className="git-section-head__title">Deployed apps</div>
                  <div className="git-section-head__meta">
                    Select an app to inspect its settings and switch the right
                    sidebar between build and container logs.
                  </div>
                </div>
                <div className="git-list-card__count">
                  {deployments.length} total
                </div>
              </div>

              {deployments.length > 0 ? (
                <div className="git-app-grid">
                  {deployments.map((deployment) => (
                    <article
                      className={`git-deployment-card ${
                        deployment.id === selectedDeploymentId
                          ? "git-deployment-card--active"
                          : ""
                      }`}
                      key={deployment.id}
                    >
                      <button
                        className="git-deployment-card__select"
                        onClick={() => setSelectedDeploymentId(deployment.id)}
                        type="button"
                      >
                        <div className="git-deployment-card__header">
                          <div>
                            <div className="git-line__app">
                              {deployment.appName}
                            </div>
                            <div className="git-deployment-card__repo">
                              {formatRepositoryLabel(deployment.repositoryUrl)}
                            </div>
                          </div>
                          <span
                            className={`git-status git-status--${deployment.status}`}
                          >
                            {formatDeploymentStatus(deployment.status)}
                          </span>
                        </div>

                        <div className="git-deployment-card__chips">
                          <span>{deployment.branch ?? "default branch"}</span>
                          <span>Port {deployment.port}</span>
                          <span>
                            {formatDeploymentTime(
                              deployment.deployedAt ?? deployment.updatedAt,
                            )}
                          </span>
                        </div>

                        <p className="git-deployment-card__summary">
                          {deployment.lastOperationSummary ??
                            "Waiting for first operation update."}
                        </p>
                      </button>

                      <a
                        className="git-line__host"
                        href={formatDeploymentHref(deployment, baseDomain)}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {formatDeploymentDomain(deployment, baseDomain)}
                      </a>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="git-empty-state">
                  <div className="git-empty-state__title">
                    No deployments yet
                  </div>
                  <p className="git-empty-state__copy">
                    Once you deploy a selected repository, it will show up here
                    as an app card with build and container logs.
                  </p>
                </div>
              )}
            </section>

            <section
              className="unifi-card git-active-card"
              aria-label="Selected application"
            >
              {selectedDeployment ? (
                <>
                  <div className="git-section-head">
                    <div>
                      <div className="git-section-head__title">
                        {selectedDeployment.appName}
                      </div>
                      <div className="git-section-head__meta">
                        {formatRepositoryLabel(
                          selectedDeployment.repositoryUrl,
                        )}
                      </div>
                    </div>

                    <span
                      className={`git-status git-status--${selectedDeployment.status}`}
                    >
                      {formatDeploymentStatus(selectedDeployment.status)}
                    </span>
                  </div>

                  <div className="git-active-card__meta-grid">
                    <div className="git-active-card__meta-item">
                      <span className="git-active-card__meta-label">
                        Domain
                      </span>
                      <a
                        href={formatDeploymentHref(
                          selectedDeployment,
                          baseDomain,
                        )}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {formatDeploymentDomain(selectedDeployment, baseDomain)}
                      </a>
                    </div>
                    <div className="git-active-card__meta-item">
                      <span className="git-active-card__meta-label">
                        Branch
                      </span>
                      <span>{selectedDeployment.branch ?? "default"}</span>
                    </div>
                    <div className="git-active-card__meta-item">
                      <span className="git-active-card__meta-label">
                        Access
                      </span>
                      <span>
                        {selectedDeployment.tokenStored
                          ? "Git token saved"
                          : "Public clone only"}
                      </span>
                    </div>
                  </div>

                  <p className="git-active-card__summary">
                    {selectedDeployment.lastOperationSummary ??
                      "No deployment summary captured yet."}
                  </p>

                  <div className="git-line__actions git-line__actions--left">
                    <form action={redeployDeploymentAction}>
                      <input
                        name="deploymentId"
                        type="hidden"
                        value={selectedDeployment.id}
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
                        value={selectedDeployment.id}
                      />
                      <SubmitButton
                        idleLabel="Fetch from Git"
                        pendingLabel="Fetching..."
                        size="small"
                        variant="secondary"
                      />
                    </form>

                    <form action={stopDeploymentAction}>
                      <input
                        name="deploymentId"
                        type="hidden"
                        value={selectedDeployment.id}
                      />
                      <SubmitButton
                        idleLabel="Stop"
                        pendingLabel="Stopping..."
                        size="small"
                        variant="secondary"
                      />
                    </form>

                    <button
                      className="button button--secondary button--small"
                      onClick={() => {
                        setPendingDeleteDeploymentId(null);
                        setEditingDeploymentId((current) =>
                          current === selectedDeployment.id
                            ? null
                            : selectedDeployment.id,
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
                          current === selectedDeployment.id ? null : current,
                        );
                        setPendingDeleteDeploymentId((current) =>
                          current === selectedDeployment.id
                            ? null
                            : selectedDeployment.id,
                        );
                      }}
                      type="button"
                    >
                      Delete
                    </button>
                  </div>

                  {pendingDeleteDeploymentId === selectedDeployment.id ? (
                    <div className="git-delete-confirm" role="alert">
                      <div className="git-delete-confirm__copy">
                        Delete <strong>{selectedDeployment.appName}</strong> and
                        remove its deployment workspace?
                      </div>

                      <div className="git-delete-confirm__actions">
                        <form action={removeDeploymentAction}>
                          <input
                            name="deploymentId"
                            type="hidden"
                            value={selectedDeployment.id}
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

                  {editingDeploymentId === selectedDeployment.id ? (
                    <form
                      action={updateDeploymentAction}
                      className="git-edit-form"
                    >
                      <input
                        name="deploymentId"
                        type="hidden"
                        value={selectedDeployment.id}
                      />

                      <label
                        className="field field--compact"
                        htmlFor={`appName-${selectedDeployment.id}`}
                      >
                        <span className="field__label">Name</span>
                        <input
                          defaultValue={selectedDeployment.appName}
                          id={`appName-${selectedDeployment.id}`}
                          name="appName"
                          required
                          type="text"
                        />
                      </label>

                      <label
                        className="field field--compact"
                        htmlFor={`subdomain-${selectedDeployment.id}`}
                      >
                        <span className="field__label">Url</span>
                        <div className="field-combo">
                          <input
                            defaultValue={selectedDeployment.subdomain}
                            id={`subdomain-${selectedDeployment.id}`}
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
                        htmlFor={`port-${selectedDeployment.id}`}
                      >
                        <span className="field__label">Port</span>
                        <input
                          defaultValue={String(selectedDeployment.port)}
                          id={`port-${selectedDeployment.id}`}
                          max="65535"
                          min="1"
                          name="port"
                          required
                          type="number"
                        />
                      </label>

                      <label
                        className="field field--compact git-edit-form__textarea"
                        htmlFor={`envVariables-${selectedDeployment.id}`}
                      >
                        <span className="field__label">Variables</span>
                        <textarea
                          defaultValue={selectedDeployment.envVariables ?? ""}
                          id={`envVariables-${selectedDeployment.id}`}
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
                </>
              ) : (
                <div className="git-empty-state">
                  <div className="git-empty-state__title">No app selected</div>
                  <p className="git-empty-state__copy">
                    Deploy a repository or select an existing app card to manage
                    it here.
                  </p>
                </div>
              )}
            </section>
          </div>
        </div>

        <aside
          className="unifi-card git-log-sidebar"
          aria-label="Deployment logs"
        >
          <div className="git-section-head git-section-head--logs">
            <div>
              <div className="git-section-head__title">Deployment logs</div>
              <div className="git-section-head__meta">
                Build logs come from the latest deployment operation. Container
                logs read the active runtime output for the selected app.
              </div>
            </div>

            <button
              className="button button--secondary button--small"
              onClick={() => setLogRefreshKey((current) => current + 1)}
              type="button"
            >
              Refresh
            </button>
          </div>

          <div className="git-log-tabs" aria-label="Log types">
            <button
              className={`git-log-tab ${
                activeLogTab === "build" ? "git-log-tab--active" : ""
              }`}
              onClick={() => setActiveLogTab("build")}
              type="button"
            >
              Build log
            </button>
            <button
              className={`git-log-tab ${
                activeLogTab === "container" ? "git-log-tab--active" : ""
              }`}
              onClick={() => setActiveLogTab("container")}
              type="button"
            >
              Container log
            </button>
          </div>

          {selectedDeployment ? (
            <>
              <div className="git-log-sidebar__meta">
                <div>
                  <span className="git-log-sidebar__meta-label">App</span>
                  <strong>{selectedDeployment.appName}</strong>
                </div>
                <div>
                  <span className="git-log-sidebar__meta-label">Updated</span>
                  <strong>
                    {formatDeploymentTime(
                      logState.payload?.updatedAt ??
                        selectedDeployment.updatedAt,
                    )}
                  </strong>
                </div>
              </div>

              <div className="git-log-sidebar__summary">
                {logState.error ??
                  logState.payload?.summary ??
                  "Select a deployment to load logs."}
              </div>

              {logState.isLoading ? (
                <div className="git-log-sidebar__empty">Loading logs...</div>
              ) : (
                <pre className="git-log-output">
                  {logState.payload?.output ??
                    "No logs available for this deployment yet."}
                </pre>
              )}
            </>
          ) : (
            <div className="git-log-sidebar__empty">
              Select an app to inspect its build log or container log.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
