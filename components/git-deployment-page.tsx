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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupInput,
  InputGroupSuffix,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

function formatStatusDotColor(status: DashboardDeployment["status"]) {
  switch (status) {
    case "deploying":
      return "bg-blue-500";
    case "running":
      return "bg-green-500";
    case "failed":
      return "bg-red-500";
    case "stopped":
      return "bg-zinc-400";
    case "removing":
      return "bg-orange-500";
    default:
      return "bg-zinc-300";
  }
}

function formatStatusBadgeVariant(
  status: DashboardDeployment["status"],
): "default" | "success" | "destructive" | "warning" | "info" {
  switch (status) {
    case "deploying":
      return "info";
    case "running":
      return "success";
    case "failed":
      return "destructive";
    case "stopped":
      return "default";
    case "removing":
      return "warning";
    default:
      return "default";
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
        className="font-medium underline"
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
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardDescription>Git deployment page</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-6">
          <div className="text-center">
            <span className="block text-xs text-zinc-500">Deployments</span>
            <span className="text-lg font-semibold text-zinc-900">
              {stats.totalDeployments}
            </span>
          </div>
          <div className="text-center">
            <span className="block text-xs text-zinc-500">Running</span>
            <span className="text-lg font-semibold text-zinc-900">
              {stats.runningDeployments}
            </span>
          </div>
          <div className="text-center">
            <span className="block text-xs text-zinc-500">Repositories</span>
            <span className="text-lg font-semibold text-zinc-900">
              {stats.totalRepositories}
            </span>
          </div>
        </CardContent>
      </Card>

      {activeBanner?.message ? (
        <div
          className={`rounded-md border px-3 py-2 text-sm ${activeBanner.status === "success" ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-800"}`}
          role="status"
        >
          {renderMessageWithLink(activeBanner.message)}
        </div>
      ) : null}

      {showForm ? (
        <Card className="relative p-4" aria-label="Deployment draft">
          <Button
            className="absolute right-2 top-2"
            onClick={() => setShowForm(false)}
            type="button"
            aria-label="Close form"
            variant="ghost"
            size="icon"
          >
            <Icon name="x-close" className="h-3.5 w-3.5" />
          </Button>

          {repositoryDraft ? (
            <form className="space-y-4" onSubmit={handleCreateDeployment}>
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

              <div className="space-y-1 mb-4">
                <div>
                  <div className="text-xs text-zinc-500">
                    Selected repository
                  </div>
                  <div className="text-sm font-medium text-zinc-900">
                    {repositoryDraft.fullName}
                  </div>
                  <div className="flex gap-2 text-xs text-zinc-400">
                    <span>{repositoryDraft.visibility}</span>
                    <span>{repositoryDraft.defaultBranch}</span>
                    <span>
                      Updated {formatDeploymentTime(repositoryDraft.updatedAt)}
                    </span>
                  </div>
                </div>

                <a
                  className="text-xs text-zinc-500 hover:underline"
                  href={draftState.repositoryUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  {draftState.repositoryUrl}
                </a>
              </div>

              <div className="flex flex-wrap items-end gap-3">
                <div className="grid min-w-40 flex-1 gap-2">
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

                <div className="grid min-w-45 flex-1 gap-2">
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

                <div className="grid min-w-55 flex-[1.4] gap-2">
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

                <div className="grid w-27.5 gap-2">
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

                <div className="grid min-w-55 flex-1 gap-2">
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

              <div className="grid gap-2">
                <Label htmlFor="envVariables">Variables</Label>
                <textarea
                  className="min-h-27 w-full rounded-md border border-zinc-200 bg-transparent px-3 py-2 text-sm text-zinc-950 shadow-sm transition-[color,box-shadow] outline-none placeholder:text-zinc-500 focus-visible:border-zinc-300 focus-visible:ring-1 focus-visible:ring-zinc-950/20"
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
                <span className="text-xs text-zinc-500">
                  Optional. One variable per line in KEY=VALUE format. If the
                  repository is private, keep the token in the Git sidebar so it
                  can be stored with the deployment.
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center gap-2 text-xs text-zinc-500">
                  <Checkbox
                    checked={storeTokenWithDeployment}
                    disabled={!githubToken.trim()}
                    onCheckedChange={(checked) =>
                      setStoreTokenWithDeployment(checked === true)
                    }
                  />
                  Store Git token with deployment
                </label>
                <p className="text-xs text-zinc-500">
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
            <div className="py-6 text-center">
              <div className="text-sm text-zinc-500">
                Select a repository from the sidebar
              </div>
            </div>
          )}
        </Card>
      ) : null}

      {view === "list" ? (
        <Card aria-label="Deployed applications">
          <CardHeader className="flex-row items-center justify-between border-b border-zinc-100">
            <CardTitle>Deployed apps</CardTitle>
            <CardDescription>{deployments.length} total</CardDescription>
          </CardHeader>

          {deployments.length > 0 ? (
            <CardContent className="p-0">
              <div className="grid grid-cols-[auto_1fr_1fr_auto_auto_auto] gap-2 border-b border-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-500">
                <span>Status</span>
                <span>App name</span>
                <span>Domain</span>
                <span>Branch</span>
                <span>Updated</span>
                <span>Logs</span>
              </div>
              {deployments.map((deployment) => (
                <button
                  className={`grid grid-cols-[auto_1fr_1fr_auto_auto_auto] items-center gap-2 border-b border-zinc-50 px-3 py-2 text-left text-sm hover:bg-zinc-50 last:border-0 ${
                    deployment.id === selectedDeploymentId ? "bg-zinc-50" : ""
                  }`}
                  key={deployment.id}
                  onClick={() => handleSelectDeployment(deployment.id)}
                  type="button"
                >
                  <span
                    className={`h-2 w-2 rounded-full ${formatStatusDotColor(deployment.status)}`}
                    title={formatDeploymentStatus(deployment.status)}
                  />
                  <span className="truncate font-medium text-zinc-900">
                    {deployment.appName}
                  </span>
                  <span className="truncate text-zinc-500">
                    {formatDeploymentDomain(deployment, baseDomain)}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {deployment.branch ?? "default"}
                  </span>
                  <span className="text-xs text-zinc-400">
                    {formatDeploymentTime(
                      deployment.deployedAt ?? deployment.updatedAt,
                    )}
                  </span>
                  <span
                    className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-zinc-100"
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
                    <Icon name="syslog" className="h-3.5 w-3.5 text-zinc-400" />
                  </span>
                </button>
              ))}
            </CardContent>
          ) : (
            <CardContent className="py-8 text-center">
              <div className="text-sm text-zinc-500">No deployments yet</div>
            </CardContent>
          )}
        </Card>
      ) : null}

      {view === "detail" && selectedDeployment ? (
        <section className="space-y-4" aria-label="Deployment detail">
          <Button
            className="gap-1"
            onClick={handleBackToList}
            type="button"
            variant="secondary"
            size="sm"
          >
            <Icon name="chevron-left" className="h-3.5 w-3.5" />
            Back to deployments
          </Button>

          <Card className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{selectedDeployment.appName}</CardTitle>
                <CardDescription>
                  {formatRepositoryLabel(selectedDeployment.repositoryUrl)}
                </CardDescription>
              </div>

              <Badge
                variant={formatStatusBadgeVariant(selectedDeployment.status)}
              >
                {formatDeploymentStatus(selectedDeployment.status)}
              </Badge>
            </div>

            <Separator />

            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <span className="block text-xs text-zinc-500">Domain</span>
                <a
                  href={formatDeploymentHref(selectedDeployment, baseDomain)}
                  rel="noreferrer"
                  target="_blank"
                  className="text-zinc-900 hover:underline"
                >
                  {formatDeploymentDomain(selectedDeployment, baseDomain)}
                </a>
              </div>
              <div>
                <span className="block text-xs text-zinc-500">Branch</span>
                <span>{selectedDeployment.branch ?? "default"}</span>
              </div>
              <div>
                <span className="block text-xs text-zinc-500">Access</span>
                <span>
                  {selectedDeployment.tokenStored
                    ? "Git token saved"
                    : "Public clone only"}
                </span>
              </div>
            </div>

            <p className="text-xs text-zinc-500">
              {selectedDeployment.lastOperationSummary ??
                "No deployment summary captured yet."}
            </p>

            <div className="flex flex-wrap gap-2">
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
                <Icon name="syslog" className="h-3.5 w-3.5" />
                Logs
              </Button>
            </div>

            {pendingDeleteDeploymentId === selectedDeployment.id ? (
              <div
                className="rounded-md border border-red-200 bg-red-50 p-3"
                role="alert"
              >
                <div className="text-sm text-red-800">
                  Delete <strong>{selectedDeployment.appName}</strong> and
                  remove its deployment workspace?
                </div>

                <div className="mt-2 flex gap-2">
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
              <form action={updateDeploymentAction} className="space-y-3">
                <input
                  name="deploymentId"
                  type="hidden"
                  value={selectedDeployment.id}
                />

                <div className="grid gap-2">
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

                <div className="grid gap-2">
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

                <div className="grid gap-2">
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

                <div className="grid gap-2">
                  <Label htmlFor={`envVariables-${selectedDeployment.id}`}>
                    Variables
                  </Label>
                  <textarea
                    className="min-h-24 w-full rounded-md border border-zinc-200 bg-transparent px-3 py-2 text-sm text-zinc-950 shadow-sm transition-[color,box-shadow] outline-none placeholder:text-zinc-500 focus-visible:border-zinc-300 focus-visible:ring-1 focus-visible:ring-zinc-950/20"
                    defaultValue={selectedDeployment.envVariables ?? ""}
                    id={`envVariables-${selectedDeployment.id}`}
                    name="envVariables"
                    rows={4}
                  />
                </div>

                <div className="flex gap-2">
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
          </Card>
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
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-2">
        <CardTitle>Deployment logs</CardTitle>

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

      <div className="px-3 py-2">
        <Tabs
          value={activeLogTab}
          onValueChange={(value) => setActiveLogTab(value as LogTab)}
        >
          <TabsList>
            <TabsTrigger value="build">
              <Icon name="bars" className="h-3.5 w-3.5" />
              Build log
            </TabsTrigger>
            <TabsTrigger value="container">
              <Icon name="monitor" className="h-3.5 w-3.5" />
              Container log
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {deployment ? (
        <>
          <div className="space-y-1 px-3 py-2 text-xs">
            <div>
              <span className="text-zinc-400">App</span>{" "}
              <strong>{deployment.appName}</strong>
            </div>
            <div>
              <span className="text-zinc-400">Updated</span>{" "}
              <strong>
                {formatDeploymentTime(
                  logState.payload?.updatedAt ?? deployment.updatedAt,
                )}
              </strong>
            </div>
          </div>

          <CardDescription className="px-3">
            {logState.error ??
              logState.payload?.summary ??
              "Select a deployment to load logs."}
          </CardDescription>

          {logState.isLoading ? (
            <div className="p-3 text-center text-xs text-zinc-400">
              Loading logs...
            </div>
          ) : (
            <ScrollArea className="mx-3 mt-2 flex-1 rounded-md bg-zinc-950">
              <pre className="whitespace-pre-wrap p-3 font-mono text-xs text-zinc-300">
                {logState.payload?.output ??
                  "No logs available for this deployment yet."}
              </pre>
            </ScrollArea>
          )}
        </>
      ) : (
        <div className="p-3 text-center text-xs text-zinc-400">
          Select a deployment to view logs.
        </div>
      )}
    </div>
  );
}
