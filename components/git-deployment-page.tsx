"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupInput,
  InputGroupSuffix,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { GitHubRepository } from "@/lib/github";
import type { DashboardData, DashboardDeployment } from "@/lib/persistence";

type GitDeploymentPageProps = {
  baseDomain: string;
  currentLogTab: LogTab;
  dashboardData: DashboardData;
  initialDeploymentId: string | null;
  isLogsPanelCollapsed: boolean;
  onDeploymentSelectAction?: (id: string | null) => void;
  onToggleLogsAction?: (id: string) => void;
};

type DraftFormState = {
  repositoryUrl: string;
  appName: string;
  subdomain: string;
  port: string;
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

export type LogTab = "build" | "container";

type RepositoryState = {
  error: string | null;
  hasLoaded: boolean;
  isLoading: boolean;
  repositories: GitHubRepository[];
  tokenConfigured: boolean;
};

const deploymentTimeFormatter = new Intl.DateTimeFormat("en", {
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  month: "short",
});

const relativeTimeFormatter = new Intl.RelativeTimeFormat("en", {
  numeric: "auto",
});
const LOG_REFRESH_INTERVAL_MS = 2000;

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
      return "bg-muted-foreground";
    case "removing":
      return "bg-orange-500";
    default:
      return "bg-muted-foreground/60";
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

function formatRelativeTime(value: string | null) {
  if (!value) {
    return "--";
  }

  const deltaSeconds = Math.round(
    (new Date(value).getTime() - Date.now()) / 1000,
  );
  const absoluteSeconds = Math.abs(deltaSeconds);

  if (absoluteSeconds < 60) {
    return relativeTimeFormatter.format(deltaSeconds, "second");
  }

  const deltaMinutes = Math.round(deltaSeconds / 60);

  if (Math.abs(deltaMinutes) < 60) {
    return relativeTimeFormatter.format(deltaMinutes, "minute");
  }

  const deltaHours = Math.round(deltaMinutes / 60);

  if (Math.abs(deltaHours) < 24) {
    return relativeTimeFormatter.format(deltaHours, "hour");
  }

  const deltaDays = Math.round(deltaHours / 24);

  if (Math.abs(deltaDays) < 30) {
    return relativeTimeFormatter.format(deltaDays, "day");
  }

  const deltaMonths = Math.round(deltaDays / 30);

  if (Math.abs(deltaMonths) < 12) {
    return relativeTimeFormatter.format(deltaMonths, "month");
  }

  const deltaYears = Math.round(deltaMonths / 12);
  return relativeTimeFormatter.format(deltaYears, "year");
}

function formatUptimeLabel(deployment: DashboardDeployment) {
  if (deployment.status !== "running") {
    return "Inactive";
  }

  if (!deployment.deployedAt) {
    return "Active";
  }

  return `Up ${formatRelativeTime(deployment.deployedAt)}`;
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

function getRepositoryNameFromUrl(repositoryUrl: string) {
  try {
    const pathname = new URL(repositoryUrl).pathname;
    return (
      pathname
        .split("/")
        .filter(Boolean)
        .pop()
        ?.replace(/\.git$/i, "") ?? "app"
    );
  } catch {
    return "app";
  }
}

function getEmptyDraftState(): DraftFormState {
  return {
    repositoryUrl: "",
    appName: "",
    subdomain: "",
    port: "3000",
  };
}

function buildRepositoryOptions(repositories: GitHubRepository[]) {
  return repositories.map((repository) => ({
    value: String(repository.id),
    label: repository.fullName,
    description: `${repository.visibility} · ${repository.defaultBranch}`,
  }));
}

function normalizeGitHubRepositoryUrl(value: string) {
  const trimmedValue = value.trim();

  if (trimmedValue.length === 0) {
    throw new Error("Enter a GitHub repository URL.");
  }

  let parsed: URL;

  try {
    parsed = new URL(trimmedValue);
  } catch {
    throw new Error("Enter a valid GitHub repository URL.");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("Use an HTTPS GitHub repository URL.");
  }

  if (parsed.hostname !== "github.com") {
    throw new Error("Use a github.com repository URL.");
  }

  const segments = parsed.pathname.split("/").filter(Boolean);

  if (segments.length < 2) {
    throw new Error("GitHub URL must include both owner and repository name.");
  }

  parsed.pathname = `/${segments[0]}/${segments[1]}`;
  parsed.search = "";
  parsed.hash = "";

  return parsed.toString();
}

function DeploymentActionStateFields({
  activeLogTab,
  deploymentId,
  isLogsPanelCollapsed,
}: {
  activeLogTab: LogTab;
  deploymentId: string;
  isLogsPanelCollapsed: boolean;
}) {
  return (
    <>
      <input name="uiDeploymentId" type="hidden" value={deploymentId} />
      <input
        name="uiLogsPanel"
        type="hidden"
        value={isLogsPanelCollapsed ? "closed" : "open"}
      />
      <input name="uiLogTab" type="hidden" value={activeLogTab} />
    </>
  );
}

export function GitDeploymentPage({
  baseDomain,
  currentLogTab,
  dashboardData,
  initialDeploymentId,
  isLogsPanelCollapsed,
  onDeploymentSelectAction,
  onToggleLogsAction,
}: GitDeploymentPageProps) {
  const router = useRouter();
  const { deployments, stats } = dashboardData;

  const [expandedDeploymentId, setExpandedDeploymentId] = useState<
    string | null
  >(initialDeploymentId);
  const [selectedDeploymentId, setSelectedDeploymentId] = useState<
    string | null
  >(initialDeploymentId);
  const [preferredDeploymentId, setPreferredDeploymentId] = useState<
    string | null
  >(null);
  const [editingDeploymentId, setEditingDeploymentId] = useState<string | null>(
    null,
  );
  const [pendingDeleteDeploymentId, setPendingDeleteDeploymentId] = useState<
    string | null
  >(null);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [draftState, setDraftState] =
    useState<DraftFormState>(getEmptyDraftState);
  const [selectedRepositoryId, setSelectedRepositoryId] = useState("");
  const [isCreatingDeployment, setIsCreatingDeployment] = useState(false);

  const [repositoryState, setRepositoryState] = useState<RepositoryState>({
    error: null,
    hasLoaded: false,
    isLoading: false,
    repositories: [],
    tokenConfigured: false,
  });

  const selectedDeployment =
    deployments.find((deployment) => deployment.id === selectedDeploymentId) ??
    null;

  const selectedRepository =
    repositoryState.repositories.find(
      (repository) => String(repository.id) === selectedRepositoryId,
    ) ?? null;

  useEffect(() => {
    setExpandedDeploymentId(initialDeploymentId);
    setSelectedDeploymentId(initialDeploymentId);
    setEditingDeploymentId(null);
    setPendingDeleteDeploymentId(null);
  }, [initialDeploymentId]);

  useEffect(() => {
    if (deployments.length === 0) {
      setExpandedDeploymentId(null);
      setSelectedDeploymentId(null);
      onDeploymentSelectAction?.(null);
      return;
    }

    if (
      preferredDeploymentId &&
      deployments.some((deployment) => deployment.id === preferredDeploymentId)
    ) {
      setExpandedDeploymentId(preferredDeploymentId);
      setSelectedDeploymentId(preferredDeploymentId);
      onDeploymentSelectAction?.(preferredDeploymentId);
      setPreferredDeploymentId(null);
      return;
    }

    setExpandedDeploymentId((current) => {
      if (
        current &&
        deployments.some((deployment) => deployment.id === current)
      ) {
        return current;
      }

      return null;
    });

    setSelectedDeploymentId((current) => {
      if (
        current &&
        deployments.some((deployment) => deployment.id === current)
      ) {
        return current;
      }

      onDeploymentSelectAction?.(null);
      return null;
    });
  }, [deployments, onDeploymentSelectAction, preferredDeploymentId]);

  useEffect(() => {
    if (
      !showAddPanel ||
      repositoryState.isLoading ||
      repositoryState.hasLoaded
    ) {
      return;
    }

    void loadRepositories();
  }, [showAddPanel, repositoryState.isLoading, repositoryState.hasLoaded]);

  async function loadRepositories() {
    setRepositoryState((current) => ({
      ...current,
      error: null,
      hasLoaded: true,
      isLoading: true,
    }));

    try {
      const response = await fetch("/api/github/repos", { cache: "no-store" });
      const payload = (await response.json()) as {
        error?: string;
        repositories?: GitHubRepository[];
        tokenConfigured?: boolean;
      };

      if (!response.ok) {
        throw new Error(
          payload.error ?? "Unable to load repositories from GitHub.",
        );
      }

      setRepositoryState({
        error: null,
        hasLoaded: true,
        isLoading: false,
        repositories: payload.repositories ?? [],
        tokenConfigured: Boolean(payload.tokenConfigured),
      });
    } catch (error) {
      setRepositoryState({
        error:
          error instanceof Error
            ? error.message
            : "Unable to load repositories from GitHub.",
        hasLoaded: true,
        isLoading: false,
        repositories: [],
        tokenConfigured: false,
      });
    }
  }

  function handleSelectRepository(repositoryId: string) {
    const repository = repositoryState.repositories.find(
      (entry) => String(entry.id) === repositoryId,
    );

    if (!repository) {
      return;
    }

    const repositoryName = getRepositoryNameFromUrl(repository.cloneUrl);

    setSelectedRepositoryId(repositoryId);
    setDraftState((current) => ({
      ...current,
      repositoryUrl: repository.cloneUrl,
      appName:
        current.appName.trim().length > 0
          ? current.appName
          : toAppName(repositoryName),
      subdomain:
        current.subdomain.trim().length > 0
          ? current.subdomain
          : toSlug(repositoryName),
    }));
  }

  async function handleCreateDeployment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setIsCreatingDeployment(true);

    try {
      const normalizedRepositoryUrl = normalizeGitHubRepositoryUrl(
        draftState.repositoryUrl,
      );
      const formData = new FormData();
      formData.set("repositoryUrl", normalizedRepositoryUrl);
      formData.set("appName", draftState.appName);
      formData.set("subdomain", draftState.subdomain);
      formData.set("port", draftState.port);

      const response = await fetch("/api/deployments", {
        method: "POST",
        body: formData,
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
      setExpandedDeploymentId(payload.deploymentId);
      setSelectedDeploymentId(payload.deploymentId);
      onToggleLogsAction?.(payload.deploymentId);
      setShowAddPanel(false);
      setDraftState(getEmptyDraftState());
      setSelectedRepositoryId("");
      toast.success(`Deployment live at https://${payload.domain}`);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to create deployment.",
      );
    } finally {
      setIsCreatingDeployment(false);
    }
  }

  function handleDeploymentToggle(deploymentId: string) {
    const isSameDeployment = expandedDeploymentId === deploymentId;

    if (isSameDeployment) {
      setExpandedDeploymentId(null);
      setSelectedDeploymentId(null);
      setEditingDeploymentId(null);
      setPendingDeleteDeploymentId(null);
      onDeploymentSelectAction?.(null);
      return;
    }

    setExpandedDeploymentId(deploymentId);
    setSelectedDeploymentId(deploymentId);
    setEditingDeploymentId(null);
    setPendingDeleteDeploymentId(null);
    onDeploymentSelectAction?.(deploymentId);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="gap-2 border-b py-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Git apps</CardTitle>
            </div>

            <div
              className="flex flex-wrap items-center gap-2"
              role="toolbar"
              aria-label="Git actions"
            >
              <Button
                size="xs"
                onClick={() => {
                  const nextValue = !showAddPanel;

                  setShowAddPanel(nextValue);

                  if (nextValue) {
                    setRepositoryState((current) => ({
                      ...current,
                      hasLoaded: false,
                    }));
                  }

                  if (!nextValue && !draftState.repositoryUrl) {
                    setDraftState(getEmptyDraftState());
                    setSelectedRepositoryId("");
                  }
                }}
                type="button"
                variant="secondary"
              >
                <Icon name="cloud" className="h-3 w-3" />
                {showAddPanel ? "Close add app" : "Add app"}
              </Button>
              <Badge variant="default">{stats.totalDeployments} apps</Badge>
              <Badge variant="success">
                {stats.runningDeployments} running
              </Badge>
              <Badge variant="destructive">
                {stats.failedDeployments} failed
              </Badge>
            </div>
          </div>
        </CardHeader>

        {showAddPanel ? (
          <CardContent className="p-4">
            <form
              className="flex flex-wrap items-end gap-3"
              onSubmit={handleCreateDeployment}
            >
              <div className="min-w-72 flex-1 space-y-2">
                <Label htmlFor="repositoryPicker">Git repo</Label>
                <div id="repositoryPicker">
                  <Combobox
                    disabled={
                      !repositoryState.tokenConfigured ||
                      repositoryState.isLoading
                    }
                    emptyText={
                      repositoryState.isLoading
                        ? "Loading repositories..."
                        : "No repositories available"
                    }
                    onValueChangeAction={handleSelectRepository}
                    options={buildRepositoryOptions(
                      repositoryState.repositories,
                    )}
                    placeholder={
                      repositoryState.tokenConfigured
                        ? "Select repository"
                        : "Token missing in .env"
                    }
                    searchPlaceholder="Search repositories"
                    value={selectedRepositoryId}
                  />
                </div>
              </div>

              <div className="min-w-44 flex-1 space-y-2">
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

              <div className="w-28 space-y-2">
                <Label htmlFor="port">App port</Label>
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

              <div className="min-w-52 flex-1 space-y-2">
                <Label htmlFor="subdomain">URL</Label>
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

              <Button disabled={isCreatingDeployment} type="submit">
                <Icon name="cloud" className="h-3.5 w-3.5" />
                {isCreatingDeployment ? "Deploying..." : "Deploy app"}
              </Button>
            </form>

            <div className="mt-2 text-xs text-muted-foreground">
              {selectedRepository
                ? `Selected: ${selectedRepository.fullName}`
                : (repositoryState.error ?? "")}
            </div>
          </CardContent>
        ) : null}
      </Card>



      <Card aria-label="Installed applications">
        <CardHeader className="border-b">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <CardTitle>Installed apps</CardTitle>
            </div>
            <div className="text-xs text-muted-foreground">
              {deployments.length} total deployments
            </div>
          </div>
        </CardHeader>

        {deployments.length > 0 ? (
          <CardContent className="p-0">
            {deployments.map((deployment) => {
              const isExpanded = expandedDeploymentId === deployment.id;
              const isEditing = editingDeploymentId === deployment.id;
              const isPendingDelete =
                pendingDeleteDeploymentId === deployment.id;

              return (
                <div className="border-b last:border-0" key={deployment.id}>
                  <button
                    className={`grid w-full grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)_auto_auto_auto] items-center gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-accent/60 ${isExpanded ? "bg-accent/40" : "bg-background"}`}
                    onClick={() => handleDeploymentToggle(deployment.id)}
                    type="button"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${formatStatusDotColor(deployment.status)}`}
                        title={formatDeploymentStatus(deployment.status)}
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-foreground">
                          {deployment.appName}
                        </span>
                      </span>
                    </span>

                    <span className="truncate text-muted-foreground">
                      {formatDeploymentDomain(deployment, baseDomain)}
                    </span>

                    <span>
                      <Badge
                        variant={formatStatusBadgeVariant(deployment.status)}
                      >
                        {formatDeploymentStatus(deployment.status)}
                      </Badge>
                    </span>

                    <span className="text-xs text-muted-foreground">
                      {formatUptimeLabel(deployment)}
                    </span>

                    <span className="flex justify-end">
                      <span
                        className="inline-flex h-7 w-7 items-center justify-center rounded hover:bg-accent"
                        role="button"
                        tabIndex={0}
                        aria-label={`Open logs for ${deployment.appName}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          setExpandedDeploymentId(deployment.id);
                          setSelectedDeploymentId(deployment.id);
                          onToggleLogsAction?.(deployment.id);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            event.stopPropagation();
                            setExpandedDeploymentId(deployment.id);
                            setSelectedDeploymentId(deployment.id);
                            onToggleLogsAction?.(deployment.id);
                          }
                        }}
                      >
                        <Icon
                          name="syslog"
                          className="h-3.5 w-3.5 text-muted-foreground"
                        />
                      </span>
                    </span>
                  </button>

                  {isExpanded ? (
                    <div className="space-y-4 bg-muted/20 px-4 py-4">
                      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        <div>
                          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                            Name
                          </div>
                          <div className="mt-1 text-sm font-medium text-foreground">
                            {deployment.appName}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                            Repository
                          </div>
                          <a
                            className="mt-1 block truncate text-sm text-foreground hover:underline"
                            href={deployment.repositoryUrl}
                            rel="noreferrer"
                            target="_blank"
                          >
                            {formatRepositoryLabel(deployment.repositoryUrl)}
                          </a>
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                            URL
                          </div>
                          <a
                            className="mt-1 block truncate text-sm text-foreground hover:underline"
                            href={formatDeploymentHref(deployment, baseDomain)}
                            rel="noreferrer"
                            target="_blank"
                          >
                            {formatDeploymentDomain(deployment, baseDomain)}
                          </a>
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                            Active
                          </div>
                          <div className="mt-1 text-sm text-foreground">
                            {deployment.status === "running" ? "Yes" : "No"}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                            Updated
                          </div>
                          <div className="mt-1 text-sm text-foreground">
                            {formatDeploymentTime(deployment.updatedAt)}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                            Uptime
                          </div>
                          <div className="mt-1 text-sm text-foreground">
                            {formatUptimeLabel(deployment)}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                            Port
                          </div>
                          <div className="mt-1 text-sm text-foreground">
                            {deployment.port}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <form action={redeployDeploymentAction}>
                          <input
                            name="deploymentId"
                            type="hidden"
                            value={deployment.id}
                          />
                          <DeploymentActionStateFields
                            activeLogTab={currentLogTab}
                            deploymentId={deployment.id}
                            isLogsPanelCollapsed={isLogsPanelCollapsed}
                          />
                          <SubmitButton
                            iconName="cloud"
                            idleLabel="Restart"
                            pendingLabel="Restarting..."
                            size="compact"
                            variant="secondary"
                          />
                        </form>

                        <form action={fetchDeploymentFromGitAction}>
                          <input
                            name="deploymentId"
                            type="hidden"
                            value={deployment.id}
                          />
                          <DeploymentActionStateFields
                            activeLogTab={currentLogTab}
                            deploymentId={deployment.id}
                            isLogsPanelCollapsed={isLogsPanelCollapsed}
                          />
                          <SubmitButton
                            iconName="arrow-down"
                            idleLabel="Fetch latest"
                            pendingLabel="Fetching..."
                            size="compact"
                            variant="secondary"
                          />
                        </form>

                        <form action={stopDeploymentAction}>
                          <input
                            name="deploymentId"
                            type="hidden"
                            value={deployment.id}
                          />
                          <DeploymentActionStateFields
                            activeLogTab={currentLogTab}
                            deploymentId={deployment.id}
                            isLogsPanelCollapsed={isLogsPanelCollapsed}
                          />
                          <SubmitButton
                            iconName="x-close"
                            idleLabel="Stop"
                            pendingLabel="Stopping..."
                            size="compact"
                            variant="secondary"
                          />
                        </form>

                        <Button
                          className="h-7 rounded-sm px-2.5 text-xs"
                          onClick={() => {
                            setPendingDeleteDeploymentId(null);
                            setEditingDeploymentId((current) =>
                              current === deployment.id ? null : deployment.id,
                            );
                          }}
                          size="xs"
                          type="button"
                          variant="secondary"
                        >
                          <Icon name="settings" className="h-3.5 w-3.5" />
                          Edit
                        </Button>

                        <Button
                          className="h-7 rounded-sm px-2.5 text-xs"
                          onClick={() => {
                            setEditingDeploymentId((current) =>
                              current === deployment.id ? null : current,
                            );
                            setPendingDeleteDeploymentId((current) =>
                              current === deployment.id ? null : deployment.id,
                            );
                          }}
                          size="xs"
                          type="button"
                          variant="danger"
                        >
                          <Icon name="x-close" className="h-3.5 w-3.5" />
                          Delete
                        </Button>

                        <Button
                          className="h-7 rounded-sm px-2.5 text-xs"
                          onClick={() => onToggleLogsAction?.(deployment.id)}
                          size="xs"
                          type="button"
                          variant="secondary"
                        >
                          <Icon name="syslog" className="h-3.5 w-3.5" />
                          Logs
                        </Button>
                      </div>

                      {isPendingDelete ? (
                        <div
                          className="rounded-md border border-red-200 bg-red-50 p-3"
                          role="alert"
                        >
                          <div className="text-sm text-red-800">
                            Delete <strong>{deployment.appName}</strong> and
                            remove its deployment workspace?
                          </div>

                          <div className="mt-2 flex gap-2">
                            <form action={removeDeploymentAction}>
                              <input
                                name="deploymentId"
                                type="hidden"
                                value={deployment.id}
                              />
                              <DeploymentActionStateFields
                                activeLogTab={currentLogTab}
                                deploymentId={deployment.id}
                                isLogsPanelCollapsed={isLogsPanelCollapsed}
                              />
                              <SubmitButton
                                iconName="x-close"
                                idleLabel="Confirm delete"
                                pendingLabel="Deleting..."
                                size="small"
                                variant="danger"
                              />
                            </form>

                            <Button
                              onClick={() => setPendingDeleteDeploymentId(null)}
                              type="button"
                              variant="secondary"
                            >
                              <Icon
                                name="chevron-left"
                                className="h-3.5 w-3.5"
                              />
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : null}

                      {isEditing ? (
                        <form
                          action={updateDeploymentAction}
                          className="space-y-3"
                        >
                          <input
                            name="deploymentId"
                            type="hidden"
                            value={deployment.id}
                          />
                          <DeploymentActionStateFields
                            activeLogTab={currentLogTab}
                            deploymentId={deployment.id}
                            isLogsPanelCollapsed={isLogsPanelCollapsed}
                          />

                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="grid gap-2">
                              <Label htmlFor={`appName-${deployment.id}`}>
                                Name
                              </Label>
                              <Input
                                defaultValue={deployment.appName}
                                id={`appName-${deployment.id}`}
                                name="appName"
                                required
                                type="text"
                              />
                            </div>

                            <div className="grid gap-2">
                              <Label htmlFor={`subdomain-${deployment.id}`}>
                                URL
                              </Label>
                              <InputGroup>
                                <InputGroupInput
                                  defaultValue={deployment.subdomain}
                                  id={`subdomain-${deployment.id}`}
                                  name="subdomain"
                                  required
                                  type="text"
                                />
                                <InputGroupSuffix>
                                  .{baseDomain}
                                </InputGroupSuffix>
                              </InputGroup>
                            </div>

                            <div className="grid gap-2">
                              <Label htmlFor={`port-${deployment.id}`}>
                                Port
                              </Label>
                              <Input
                                defaultValue={String(deployment.port)}
                                id={`port-${deployment.id}`}
                                max="65535"
                                min="1"
                                name="port"
                                required
                                type="number"
                              />
                            </div>

                            <div className="grid gap-2 md:col-span-2">
                              <Label htmlFor={`envVariables-${deployment.id}`}>
                                Environment variables
                              </Label>
                              <textarea
                                className="min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground shadow-sm transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50"
                                defaultValue={deployment.envVariables ?? ""}
                                id={`envVariables-${deployment.id}`}
                                name="envVariables"
                                rows={4}
                              />
                            </div>
                          </div>

                          <div className="flex gap-2">
                            <SubmitButton
                              iconName="check"
                              idleLabel="Save changes"
                              pendingLabel="Saving..."
                              size="small"
                              variant="primary"
                            />
                            <Button
                              onClick={() => setEditingDeploymentId(null)}
                              type="button"
                              variant="secondary"
                            >
                              <Icon
                                name="chevron-left"
                                className="h-3.5 w-3.5"
                              />
                              Cancel
                            </Button>
                          </div>
                        </form>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </CardContent>
        ) : (
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No deployments yet. Use Add app to create the first one.
          </CardContent>
        )}
      </Card>

      {selectedDeployment ? (
        <div className="text-xs text-muted-foreground">
          Active app:{" "}
          <span className="font-medium text-foreground">
            {selectedDeployment.appName}
          </span>
          {" · "}
          {formatDeploymentDomain(selectedDeployment, baseDomain)}
        </div>
      ) : null}
    </div>
  );
}

type GitLogPanelProps = {
  deploymentId: string | null;
  deployments: DashboardDeployment[];
  initialActiveLogTab: LogTab;
  onLogTabChangeAction?: (tab: LogTab) => void;
};

export function GitLogPanel({
  deploymentId,
  deployments,
  initialActiveLogTab,
  onLogTabChangeAction,
}: GitLogPanelProps) {
  const [activeLogTab, setActiveLogTab] = useState<LogTab>(initialActiveLogTab);
  const [logRefreshKey, setLogRefreshKey] = useState(0);
  const [logState, setLogState] = useState<{
    isLoading: boolean;
    isRefreshing: boolean;
    error: string | null;
    payload: DeploymentLogPayload | null;
  }>({
    isLoading: false,
    isRefreshing: false,
    error: null,
    payload: null,
  });

  const deployment = deployments.find((d) => d.id === deploymentId) ?? null;

  useEffect(() => {
    setActiveLogTab(initialActiveLogTab);
  }, [initialActiveLogTab]);

  useEffect(() => {
    if (!deploymentId) {
      setLogState({
        isLoading: false,
        isRefreshing: false,
        error: null,
        payload: null,
      });
      return;
    }

    setLogState({
      isLoading: true,
      isRefreshing: false,
      error: null,
      payload: null,
    });
  }, [activeLogTab, deploymentId]);

  useEffect(() => {
    let cancelled = false;

    if (!deploymentId) {
      return;
    }

    const loadLogs = async () => {
      setLogState((current) => ({
        ...current,
        isLoading: current.payload === null,
        isRefreshing: current.payload !== null,
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

        if (cancelled) {
          return;
        }

        setLogState({
          isLoading: false,
          isRefreshing: false,
          error: null,
          payload: payload as DeploymentLogPayload,
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        setLogState((current) => ({
          ...current,
          isLoading: false,
          isRefreshing: false,
          error:
            error instanceof Error
              ? error.message
              : "Unable to load deployment logs.",
        }));
      }
    };

    void loadLogs();

    return () => {
      cancelled = true;
    };
  }, [deploymentId, activeLogTab, logRefreshKey]);

  useEffect(() => {
    if (!deploymentId || activeLogTab !== "build") {
      return;
    }

    const intervalId = window.setInterval(() => {
      setLogRefreshKey((current) => current + 1);
    }, LOG_REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [activeLogTab, deploymentId]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-end border-b px-3 py-2 pl-12">
        <CardTitle className="text-right">Deployment logs</CardTitle>
      </div>

      <div className="px-3 py-2">
        <Tabs
          value={activeLogTab}
          onValueChange={(value) => {
            const nextTab = value as LogTab;

            setActiveLogTab(nextTab);
            onLogTabChangeAction?.(nextTab);
          }}
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
          {logState.error ? (
            <div className="px-3 pt-2 text-xs text-destructive">
              {logState.error}
            </div>
          ) : null}

          {logState.isLoading ? (
            <div className="p-3 text-center text-xs text-muted-foreground">
              Loading logs...
            </div>
          ) : (
            <ScrollArea className="mx-3 mt-2 flex-1 rounded-md bg-primary">
              <pre className="whitespace-pre-wrap p-3 font-mono text-xs text-primary-foreground">
                {logState.payload?.output ??
                  "No logs available for this deployment yet."}
              </pre>
            </ScrollArea>
          )}
        </>
      ) : (
        <div className="p-3 text-center text-xs text-muted-foreground">
          Select a deployment to view logs.
        </div>
      )}
    </div>
  );
}
