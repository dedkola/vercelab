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
import { Icon } from "@/components/dashboard-kit";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupInput,
  InputGroupSuffix,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
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
  onDeploymentSelectAction?: (id: string | null) => void;
  onToggleLogsAction?: (id: string) => void;
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

type PageView = "list" | "detail";

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
  onDeploymentSelectAction,
  onToggleLogsAction,
  repositoryDraft,
  repositoryDraftSignal,
}: GitDeploymentPageProps) {
  const router = useRouter();
  const { deployments, stats } = dashboardData;

  const [view, setView] = useState<PageView>("list");
  const [showForm, setShowForm] = useState(false);

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
  const [storeTokenWithDeployment, setStoreTokenWithDeployment] = useState(
    Boolean(githubToken.trim()),
  );
  const [selectedDeploymentId, setSelectedDeploymentId] = useState<
    string | null
  >(null);
  const [preferredDeploymentId, setPreferredDeploymentId] = useState<
    string | null
  >(null);

  const activeBanner = localBanner ?? flashMessage;
  const selectedDeployment =
    deployments.find((deployment) => deployment.id === selectedDeploymentId) ??
    null;

  useEffect(() => {
    if (!repositoryDraft) {
      return;
    }

    setDraftState(buildDraftState(repositoryDraft));
    setStoreTokenWithDeployment(Boolean(githubToken.trim()));
    setLocalBanner(null);
    setShowForm(true);
  }, [githubToken, repositoryDraft, repositoryDraftSignal]);

  useEffect(() => {
    if (deployments.length === 0) {
      if (view === "detail") {
        setView("list");
      }
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

      return null;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deployments, preferredDeploymentId]);

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
      onDeploymentSelectAction?.(payload.deploymentId);
      setView("detail");
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

  function handleSelectDeployment(deploymentId: string) {
    setSelectedDeploymentId(deploymentId);
    setEditingDeploymentId(null);
    setPendingDeleteDeploymentId(null);
    setView("detail");
    onDeploymentSelectAction?.(deploymentId);
  }

  function handleBackToList() {
    setView("list");
    setSelectedDeploymentId(null);
    setEditingDeploymentId(null);
    setPendingDeleteDeploymentId(null);
    onDeploymentSelectAction?.(null);
  }

  return (
    <div className="git-page">
      <section className="git-hero unifi-card">
        <div>
          <div className="git-hero__eyebrow">Git deployment page</div>
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

      {showForm ? (
        <section
          className="unifi-card git-compose-card"
          aria-label="Deployment draft"
        >
          <Button
            className="git-compose-card__close"
            onClick={() => setShowForm(false)}
            type="button"
            aria-label="Close form"
            variant="ghost"
            size="icon"
          >
            <Icon name="x-close" className="git-compose-card__close-icon" />
          </Button>

          {repositoryDraft ? (
            <form
              className="git-form git-form--draft"
              onSubmit={handleCreateDeployment}
            >
              <input
                name="githubToken"
                type="hidden"
                value={storeTokenWithDeployment ? githubToken : ""}
              />
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
                      Updated {formatDeploymentTime(repositoryDraft.updatedAt)}
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

              <div className="git-form__grid flex flex-wrap items-end gap-3">
                <div className="field min-w-40 flex-1">
                  <Label htmlFor="branch">Branch</Label>
                  <Input
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
                </div>

                <div className="field min-w-45 flex-1">
                  <Label htmlFor="appName">App name</Label>
                  <Input
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
                </div>

                <div className="field min-w-55 flex-[1.4]">
                  <Label htmlFor="subdomain">Wildcard domain</Label>
                  <InputGroup>
                    <InputGroupInput
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
                    <InputGroupSuffix>.{baseDomain}</InputGroupSuffix>
                  </InputGroup>
                </div>

                <div className="field w-27.5">
                  <Label htmlFor="port">Port</Label>
                  <Input
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
                </div>

                <div className="field min-w-55 flex-1">
                  <Label htmlFor="serviceName">Service name</Label>
                  <Input
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
                </div>
              </div>

              <div className="field">
                <Label htmlFor="envVariables">Variables</Label>
                <textarea
                  className="min-h-27 w-full rounded-md border border-(--border) bg-(--surface) px-3 py-2 text-sm text-(--text) shadow-sm placeholder:text-(--text-muted) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)"
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
                  repository is private, keep the token in the Git sidebar so it
                  can be stored with the deployment.
                </span>
              </div>

              <div className="git-form__actions git-form__actions--inline flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center gap-2 text-xs text-(--text-secondary)">
                  <Checkbox
                    checked={storeTokenWithDeployment}
                    disabled={!githubToken.trim()}
                    onCheckedChange={(checked) =>
                      setStoreTokenWithDeployment(checked === true)
                    }
                  />
                  Store Git token with deployment
                </label>
                <p className="git-form__note">
                  Vercelab clones the selected repository, builds the app, and
                  exposes it at .{baseDomain}.
                </p>
                <Button
                  disabled={isCreatingDeployment}
                  size="sm"
                  type="submit"
                  variant="default"
                >
                  <Icon name="cloud" className="h-3.5 w-3.5" />
                  {isCreatingDeployment ? "Deploying..." : "Create deployment"}
                </Button>
              </div>
            </form>
          ) : (
            <div className="git-empty-state git-empty-state--draft">
              <div className="git-empty-state__title">
                Select a repository from the sidebar
              </div>
            </div>
          )}
        </section>
      ) : null}

      {view === "list" ? (
        <section
          className="unifi-card git-apps-table-card"
          aria-label="Deployed applications"
        >
          <div className="git-section-head">
            <div>
              <div className="git-section-head__title">Deployed apps</div>
            </div>
            <div className="git-list-card__count">
              {deployments.length} total
            </div>
          </div>

          {deployments.length > 0 ? (
            <div className="git-apps-table">
              <div className="git-apps-table__header">
                <span>Status</span>
                <span>App name</span>
                <span>Domain</span>
                <span>Branch</span>
                <span>Updated</span>
                <span>Logs</span>
              </div>
              {deployments.map((deployment) => (
                <button
                  className={`git-apps-table__row ${
                    deployment.id === selectedDeploymentId
                      ? "git-apps-table__row--active"
                      : ""
                  }`}
                  key={deployment.id}
                  onClick={() => handleSelectDeployment(deployment.id)}
                  type="button"
                >
                  <span
                    className={`git-apps-table__status-dot git-apps-table__status-dot--${deployment.status}`}
                    title={formatDeploymentStatus(deployment.status)}
                  />
                  <span className="git-apps-table__name">
                    {deployment.appName}
                  </span>
                  <span className="git-apps-table__domain">
                    {formatDeploymentDomain(deployment, baseDomain)}
                  </span>
                  <span className="git-apps-table__branch">
                    {deployment.branch ?? "default"}
                  </span>
                  <span className="git-apps-table__time">
                    {formatDeploymentTime(
                      deployment.deployedAt ?? deployment.updatedAt,
                    )}
                  </span>
                  <span
                    className="git-apps-table__logs-btn"
                    role="button"
                    tabIndex={0}
                    aria-label={`View logs for ${deployment.appName}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleLogsAction?.(deployment.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.stopPropagation();
                        e.preventDefault();
                        onToggleLogsAction?.(deployment.id);
                      }
                    }}
                  >
                    <Icon name="syslog" className="git-apps-table__logs-icon" />
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="git-empty-state">
              <div className="git-empty-state__title">No deployments yet</div>
            </div>
          )}
        </section>
      ) : null}

      {view === "detail" && selectedDeployment ? (
        <section className="git-detail" aria-label="Deployment detail">
          <Button
            className="git-detail__back"
            onClick={handleBackToList}
            type="button"
            variant="secondary"
            size="sm"
          >
            <Icon name="chevron-left" className="git-detail__back-icon" />
            Back to deployments
          </Button>

          <div className="unifi-card git-detail-info">
            <div className="git-section-head">
              <div>
                <div className="git-section-head__title">
                  {selectedDeployment.appName}
                </div>
                <div className="git-section-head__meta">
                  {formatRepositoryLabel(selectedDeployment.repositoryUrl)}
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
                <span className="git-active-card__meta-label">Domain</span>
                <a
                  href={formatDeploymentHref(selectedDeployment, baseDomain)}
                  rel="noreferrer"
                  target="_blank"
                >
                  {formatDeploymentDomain(selectedDeployment, baseDomain)}
                </a>
              </div>
              <div className="git-active-card__meta-item">
                <span className="git-active-card__meta-label">Branch</span>
                <span>{selectedDeployment.branch ?? "default"}</span>
              </div>
              <div className="git-active-card__meta-item">
                <span className="git-active-card__meta-label">Access</span>
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
                  iconName="cloud"
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
                  iconName="arrow-down"
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
                  iconName="x-close"
                />
              </form>

              <Button
                onClick={() => {
                  setPendingDeleteDeploymentId(null);
                  setEditingDeploymentId((current) =>
                    current === selectedDeployment.id
                      ? null
                      : selectedDeployment.id,
                  );
                }}
                type="button"
                variant="secondary"
                size="sm"
              >
                <Icon name="settings" className="h-3.5 w-3.5" />
                Edit
              </Button>

              <Button
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
                variant="danger"
                size="sm"
              >
                <Icon name="x-close" className="h-3.5 w-3.5" />
                Delete
              </Button>

              <Button
                onClick={() => onToggleLogsAction?.(selectedDeployment.id)}
                type="button"
                variant="secondary"
                size="sm"
              >
                <Icon name="syslog" className="git-detail__logs-icon" />
                Logs
              </Button>
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
                      iconName="x-close"
                    />
                  </form>

                  <Button
                    onClick={() => setPendingDeleteDeploymentId(null)}
                    type="button"
                    variant="secondary"
                    size="sm"
                  >
                    <Icon name="chevron-left" className="h-3.5 w-3.5" />
                    Cancel
                  </Button>
                </div>
              </div>
            ) : null}

            {editingDeploymentId === selectedDeployment.id ? (
              <form action={updateDeploymentAction} className="git-edit-form">
                <input
                  name="deploymentId"
                  type="hidden"
                  value={selectedDeployment.id}
                />

                <div className="field field--compact">
                  <Label htmlFor={`appName-${selectedDeployment.id}`}>
                    Name
                  </Label>
                  <Input
                    defaultValue={selectedDeployment.appName}
                    id={`appName-${selectedDeployment.id}`}
                    name="appName"
                    required
                    type="text"
                  />
                </div>

                <div className="field field--compact">
                  <Label htmlFor={`subdomain-${selectedDeployment.id}`}>
                    Url
                  </Label>
                  <InputGroup>
                    <InputGroupInput
                      defaultValue={selectedDeployment.subdomain}
                      id={`subdomain-${selectedDeployment.id}`}
                      name="subdomain"
                      required
                      type="text"
                    />
                    <InputGroupSuffix>.{baseDomain}</InputGroupSuffix>
                  </InputGroup>
                </div>

                <div className="field field--compact">
                  <Label htmlFor={`port-${selectedDeployment.id}`}>Port</Label>
                  <Input
                    defaultValue={String(selectedDeployment.port)}
                    id={`port-${selectedDeployment.id}`}
                    max="65535"
                    min="1"
                    name="port"
                    required
                    type="number"
                  />
                </div>

                <div className="field field--compact git-edit-form__textarea">
                  <Label htmlFor={`envVariables-${selectedDeployment.id}`}>
                    Variables
                  </Label>
                  <textarea
                    className="min-h-24 w-full rounded-md border border-(--border) bg-(--surface) px-3 py-2 text-sm text-(--text) shadow-sm placeholder:text-(--text-muted) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)"
                    defaultValue={selectedDeployment.envVariables ?? ""}
                    id={`envVariables-${selectedDeployment.id}`}
                    name="envVariables"
                    rows={4}
                  />
                </div>

                <div className="git-edit-form__actions">
                  <SubmitButton
                    idleLabel="Save"
                    pendingLabel="Saving..."
                    size="small"
                    variant="primary"
                    iconName="check"
                  />
                  <Button
                    onClick={() => setEditingDeploymentId(null)}
                    type="button"
                    variant="secondary"
                    size="sm"
                  >
                    <Icon name="chevron-left" className="h-3.5 w-3.5" />
                    Cancel
                  </Button>
                </div>
              </form>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}

type GitLogPanelProps = {
  deploymentId: string | null;
  deployments: DashboardDeployment[];
};

export function GitLogPanel({ deploymentId, deployments }: GitLogPanelProps) {
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

  const deployment = deployments.find((d) => d.id === deploymentId) ?? null;

  useEffect(() => {
    setActiveLogTab("build");
  }, [deploymentId]);

  useEffect(() => {
    let cancelled = false;

    if (!deploymentId) {
      setLogState({ isLoading: false, error: null, payload: null });
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
          `/api/deployments/${deploymentId}/logs?type=${activeLogTab}`,
          { cache: "no-store" },
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

        if (cancelled) return;

        setLogState({
          isLoading: false,
          error: null,
          payload: payload as DeploymentLogPayload,
        });
      } catch (error) {
        if (cancelled) return;

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
  }, [deploymentId, activeLogTab, logRefreshKey]);

  return (
    <div className="git-log-panel">
      <div className="git-section-head git-section-head--logs">
        <div>
          <div className="git-section-head__title">Deployment logs</div>
        </div>

        <Button
          onClick={() => setLogRefreshKey((current) => current + 1)}
          type="button"
          variant="secondary"
          size="sm"
        >
          <Icon name="arrow-down" className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      <div className="git-log-tabs" aria-label="Log types">
        <Button
          className={`git-log-tab ${activeLogTab === "build" ? "git-log-tab--active" : ""}`}
          onClick={() => setActiveLogTab("build")}
          type="button"
          variant={activeLogTab === "build" ? "default" : "secondary"}
          size="sm"
        >
          <Icon name="bars" className="h-3.5 w-3.5" />
          Build log
        </Button>
        <Button
          className={`git-log-tab ${activeLogTab === "container" ? "git-log-tab--active" : ""}`}
          onClick={() => setActiveLogTab("container")}
          type="button"
          variant={activeLogTab === "container" ? "default" : "secondary"}
          size="sm"
        >
          <Icon name="monitor" className="h-3.5 w-3.5" />
          Container log
        </Button>
      </div>

      {deployment ? (
        <>
          <div className="git-log-sidebar__meta">
            <div>
              <span className="git-log-sidebar__meta-label">App</span>
              <strong>{deployment.appName}</strong>
            </div>
            <div>
              <span className="git-log-sidebar__meta-label">Updated</span>
              <strong>
                {formatDeploymentTime(
                  logState.payload?.updatedAt ?? deployment.updatedAt,
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
          Select a deployment to view logs.
        </div>
      )}
    </div>
  );
}
