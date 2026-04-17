"use client";

import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  fetchDeploymentFromGitAction,
  redeployDeploymentAction,
  removeDeploymentAction,
  stopDeploymentAction,
  updateDeploymentAction,
  type DeploymentActionResult,
} from "@/app/actions";
import { Icon } from "@/components/dashboard-kit";
import { SubmitButton } from "@/components/submit-button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupInput,
  InputGroupSuffix,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { GitHubRepository } from "@/lib/github";
import type { DashboardDeployment } from "@/lib/persistence";
import { cn } from "@/lib/utils";

export type LogTab = "build" | "container";
export type GitView = "list" | "detail" | "create";

type GitDeploymentPageProps = {
  activeDeploymentId: string | null;
  baseDomain: string;
  currentLogTab: LogTab;
  currentView: GitView;
  deployments: DashboardDeployment[];
  isLogsPanelCollapsed: boolean;
  onDeploymentSelectAction?: (id: string | null) => void;
  onDeploymentsChangeAction?: Dispatch<SetStateAction<DashboardDeployment[]>>;
  onToggleLogsAction?: (id: string) => void;
  onViewChangeAction?: (view: GitView) => void;
};

type DraftFormState = {
  repositoryUrl: string;
  appName: string;
  branch: string;
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

function getEmptyDraftState(): DraftFormState {
  return {
    repositoryUrl: "",
    appName: "",
    branch: "",
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

function buildBranchOptions(branches: string[]) {
  return branches.map((branch) => ({
    value: branch,
    label: branch,
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

function SummaryBlock({
  label,
  suppressHydrationWarning = false,
  value,
}: {
  label: string;
  suppressHydrationWarning?: boolean;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/70 px-3 py-3 shadow-sm">
      <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
      <div
        suppressHydrationWarning={suppressHydrationWarning}
        className="mt-1 wrap-break-word text-sm font-medium text-foreground"
      >
        {value}
      </div>
    </div>
  );
}

function GitStatCard({
  iconName,
  label,
  value,
}: {
  iconName: "cloud" | "check" | "x-close";
  label: string;
  value: string;
}) {
  return (
    <Card className="overflow-hidden border-border/70 bg-card/90 shadow-[0_24px_64px_-50px_rgba(15,23,42,0.45)]">
      <CardContent className="flex items-center gap-4 p-4">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border/60 bg-linear-to-br from-background to-muted text-foreground shadow-sm">
          <Icon name={iconName} className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            {label}
          </div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
            {value}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function GitDeploymentPage({
  activeDeploymentId,
  baseDomain,
  currentLogTab,
  currentView,
  deployments: serverDeployments,
  isLogsPanelCollapsed,
  onDeploymentSelectAction,
  onDeploymentsChangeAction,
  onToggleLogsAction,
  onViewChangeAction,
}: GitDeploymentPageProps) {
  const router = useRouter();
  const [internalDeployments, setInternalDeployments] =
    useState<DashboardDeployment[]>(serverDeployments);
  const [pendingDeleteDeploymentId, setPendingDeleteDeploymentId] = useState<
    string | null
  >(null);
  const [removingDeploymentIds, setRemovingDeploymentIds] = useState<string[]>(
    [],
  );
  const [pendingCreatedDeploymentId, setPendingCreatedDeploymentId] = useState<
    string | null
  >(null);
  const [draftState, setDraftState] =
    useState<DraftFormState>(getEmptyDraftState);
  const [selectedRepositoryId, setSelectedRepositoryId] = useState("");
  const [isCreatingDeployment, setIsCreatingDeployment] = useState(false);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [repositoryState, setRepositoryState] = useState<RepositoryState>({
    error: null,
    hasLoaded: false,
    isLoading: false,
    repositories: [],
    tokenConfigured: false,
  });

  const deployments = onDeploymentsChangeAction
    ? serverDeployments
    : internalDeployments;

  const stats = useMemo(
    () =>
      deployments.reduce(
        (accumulator, deployment) => {
          accumulator.totalDeployments += 1;

          if (deployment.status === "running") {
            accumulator.runningDeployments += 1;
          }

          if (deployment.status === "failed") {
            accumulator.failedDeployments += 1;
          }

          return accumulator;
        },
        {
          failedDeployments: 0,
          runningDeployments: 0,
          totalDeployments: 0,
        },
      ),
    [deployments],
  );

  const selectedDeployment =
    deployments.find((deployment) => deployment.id === activeDeploymentId) ??
    null;
  const selectedRepository =
    repositoryState.repositories.find(
      (repository) => String(repository.id) === selectedRepositoryId,
    ) ?? null;

  useEffect(() => {
    if (!onDeploymentsChangeAction) {
      setInternalDeployments(serverDeployments);
    }
  }, [onDeploymentsChangeAction, serverDeployments]);

  useEffect(() => {
    if (pendingCreatedDeploymentId) {
      const deploymentExists = deployments.some(
        (deployment) => deployment.id === pendingCreatedDeploymentId,
      );

      if (deploymentExists) {
        setPendingCreatedDeploymentId(null);
      }
    }
  }, [deployments, pendingCreatedDeploymentId]);

  useEffect(() => {
    if (currentView !== "create") {
      return;
    }

    if (repositoryState.isLoading || repositoryState.hasLoaded) {
      return;
    }

    void loadRepositories();
  }, [currentView, repositoryState.hasLoaded, repositoryState.isLoading]);

  useEffect(() => {
    if (currentView !== "detail") {
      return;
    }

    if (!activeDeploymentId) {
      onViewChangeAction?.("list");
      return;
    }

    if (selectedDeployment) {
      return;
    }

    if (pendingCreatedDeploymentId === activeDeploymentId) {
      return;
    }

    onDeploymentSelectAction?.(null);
    onViewChangeAction?.("list");
  }, [
    activeDeploymentId,
    currentView,
    onDeploymentSelectAction,
    onViewChangeAction,
    pendingCreatedDeploymentId,
    selectedDeployment,
  ]);

  function updateDeployments(updater: SetStateAction<DashboardDeployment[]>) {
    if (onDeploymentsChangeAction) {
      onDeploymentsChangeAction(updater);
      return;
    }

    setInternalDeployments(updater);
  }

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

  async function loadBranchesForRepository(repository: GitHubRepository) {
    if (repository.branches && repository.branches.length > 0) {
      return;
    }

    setLoadingBranches(true);

    try {
      const response = await fetch(
        `/api/github/repos/${repository.owner}/${repository.name}/branches`,
        { cache: "no-store" },
      );

      if (!response.ok) {
        throw new Error("Failed to load branches.");
      }

      const { branches } = (await response.json()) as { branches: string[] };

      setRepositoryState((current) => ({
        ...current,
        repositories: current.repositories.map((entry) =>
          entry.id === repository.id ? { ...entry, branches } : entry,
        ),
      }));

      setDraftState((current) => ({
        ...current,
        branch: current.branch || branches[0] || repository.defaultBranch,
      }));
    } catch (error) {
      console.error(
        error instanceof Error ? error.message : "Failed to load branches.",
      );
    } finally {
      setLoadingBranches(false);
    }
  }

  function handleSelectRepository(repositoryId: string) {
    const repository = repositoryState.repositories.find(
      (entry) => String(entry.id) === repositoryId,
    );

    setSelectedRepositoryId(repositoryId);

    if (!repository) {
      return;
    }

    setDraftState((current) => ({
      ...current,
      repositoryUrl: repository.cloneUrl,
      appName:
        current.appName.trim().length > 0
          ? current.appName
          : toAppName(repository.name),
      branch: repository.defaultBranch || current.branch,
      subdomain:
        current.subdomain.trim().length > 0
          ? current.subdomain
          : toSlug(repository.name),
    }));

    void loadBranchesForRepository(repository);
  }

  function handleBackToList() {
    setPendingDeleteDeploymentId(null);
    setSelectedRepositoryId("");
    setDraftState(getEmptyDraftState());
    onDeploymentSelectAction?.(null);
    onViewChangeAction?.("list");
  }

  function handleOpenCreateView() {
    setPendingDeleteDeploymentId(null);
    setSelectedRepositoryId("");
    setDraftState(getEmptyDraftState());
    onDeploymentSelectAction?.(null);
    onViewChangeAction?.("create");
  }

  function handleOpenDeploymentDetail(
    deploymentId: string,
    options?: { openLogs?: boolean },
  ) {
    setPendingDeleteDeploymentId(null);

    if (options?.openLogs) {
      if (onToggleLogsAction) {
        onToggleLogsAction(deploymentId);
      } else {
        onDeploymentSelectAction?.(deploymentId);
      }
    } else {
      onDeploymentSelectAction?.(deploymentId);
    }

    onViewChangeAction?.("detail");
  }

  async function runDeploymentAction(
    actionPromise: Promise<DeploymentActionResult>,
    options?: { openLogsForDeploymentId?: string },
  ) {
    const result = await actionPromise;

    if (result.status === "success") {
      if (options?.openLogsForDeploymentId) {
        handleOpenDeploymentDetail(options.openLogsForDeploymentId, {
          openLogs: true,
        });
      }

      toast.success(result.message);
      router.refresh();
      return;
    }

    toast.error(result.message);
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
      formData.set("appName", draftState.appName.trim());
      formData.set("subdomain", draftState.subdomain.trim());
      formData.set("port", draftState.port.trim());

      if (draftState.branch.trim().length > 0) {
        formData.set("branch", draftState.branch.trim());
      }

      const response = await fetch("/api/deployments", {
        body: formData,
        method: "POST",
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

      setPendingCreatedDeploymentId(payload.deploymentId);
      setDraftState(getEmptyDraftState());
      setSelectedRepositoryId("");
      onViewChangeAction?.("detail");

      if (onToggleLogsAction) {
        onToggleLogsAction(payload.deploymentId);
      } else {
        onDeploymentSelectAction?.(payload.deploymentId);
      }

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

  async function handleRedeployAction(formData: FormData) {
    const deploymentId = String(formData.get("deploymentId") ?? "");

    await runDeploymentAction(redeployDeploymentAction(formData), {
      openLogsForDeploymentId: deploymentId,
    });
  }

  async function handleFetchLatestAction(formData: FormData) {
    const deploymentId = String(formData.get("deploymentId") ?? "");

    await runDeploymentAction(fetchDeploymentFromGitAction(formData), {
      openLogsForDeploymentId: deploymentId,
    });
  }

  async function handleStopAction(formData: FormData) {
    await runDeploymentAction(stopDeploymentAction(formData));
  }

  async function handleUpdateAction(formData: FormData) {
    await runDeploymentAction(updateDeploymentAction(formData));
  }

  async function handleRemoveAction(formData: FormData) {
    const deploymentIdValue = formData.get("deploymentId");
    const deploymentId =
      typeof deploymentIdValue === "string" ? deploymentIdValue : null;
    const result = await removeDeploymentAction(formData);

    if (result.status === "success" && deploymentId) {
      setRemovingDeploymentIds((current) =>
        current.includes(deploymentId) ? current : [...current, deploymentId],
      );
      updateDeployments((current) =>
        current.map((deployment) =>
          deployment.id === deploymentId
            ? { ...deployment, status: "removing" }
            : deployment,
        ),
      );
      setPendingDeleteDeploymentId(null);
      onDeploymentSelectAction?.(null);
      onViewChangeAction?.("list");
      toast.success(result.message);

      window.setTimeout(() => {
        updateDeployments((current) =>
          current.filter((deployment) => deployment.id !== deploymentId),
        );
        setRemovingDeploymentIds((current) =>
          current.filter((id) => id !== deploymentId),
        );
      }, 220);
      return;
    }

    toast.error(result.message);
  }

  const viewShellClassName =
    "animate-in fade-in-0 slide-in-from-bottom-2 duration-300";

  return (
    <div className="min-h-full rounded-[1.75rem] border border-border/70 bg-linear-to-b from-background via-muted/15 to-background p-3 shadow-[0_38px_100px_-64px_rgba(15,23,42,0.55)] sm:p-4 md:p-5">
      {currentView === "detail" ? (
        <div
          key={`detail-${activeDeploymentId ?? "empty"}`}
          className={cn("space-y-5", viewShellClassName)}
        >
          {selectedDeployment ? (
            <>
              <section className="overflow-hidden rounded-[1.5rem] border border-border/70 bg-linear-to-r from-muted/70 via-background to-background shadow-[0_28px_90px_-58px_rgba(15,23,42,0.45)]">
                <div className="space-y-5 px-5 py-5">
                  <Breadcrumb>
                    <BreadcrumbList>
                      <BreadcrumbItem>
                        <BreadcrumbLink asChild>
                          <button type="button" onClick={handleBackToList}>
                            Apps
                          </button>
                        </BreadcrumbLink>
                      </BreadcrumbItem>
                      <BreadcrumbSeparator />
                      <BreadcrumbItem>
                        <BreadcrumbPage>
                          {selectedDeployment.appName}
                        </BreadcrumbPage>
                      </BreadcrumbItem>
                    </BreadcrumbList>
                  </Breadcrumb>

                  <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                    <div className="max-w-3xl space-y-3">
                      <Badge className="w-fit gap-1 rounded-full border border-border/60 bg-background/80 text-foreground shadow-sm">
                        <Icon name="settings" className="h-3.5 w-3.5" />
                        App workspace
                      </Badge>
                      <div className="flex flex-wrap items-center gap-3">
                        <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
                          {selectedDeployment.appName}
                        </h1>
                        <Badge
                          variant={formatStatusBadgeVariant(
                            selectedDeployment.status,
                          )}
                        >
                          {formatDeploymentStatus(selectedDeployment.status)}
                        </Badge>
                      </div>
                      <p className="wrap-break-word text-sm leading-6 text-muted-foreground">
                        {formatRepositoryLabel(
                          selectedDeployment.repositoryUrl,
                        )}
                        {" · "}
                        {formatDeploymentDomain(selectedDeployment, baseDomain)}
                      </p>
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                      <Button asChild size="sm" className="w-full sm:w-auto">
                        <a
                          href={formatDeploymentHref(
                            selectedDeployment,
                            baseDomain,
                          )}
                          rel="noreferrer"
                          target="_blank"
                        >
                          <Icon name="globe" className="h-3.5 w-3.5" />
                          Open app
                        </a>
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="w-full sm:w-auto"
                        onClick={() =>
                          handleOpenDeploymentDetail(selectedDeployment.id, {
                            openLogs: true,
                          })
                        }
                      >
                        <Icon name="syslog" className="h-3.5 w-3.5" />
                        View logs
                      </Button>
                    </div>
                  </div>
                </div>
              </section>

              <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.9fr)]">
                <div className="space-y-5">
                  <Card className="overflow-hidden border-border/70 bg-card/90 shadow-[0_26px_72px_-54px_rgba(15,23,42,0.45)]">
                    <CardHeader className="border-b border-border/70 bg-linear-to-r from-muted/55 via-background to-background px-5 py-4">
                      <CardTitle className="text-base">Operations</CardTitle>
                      <CardDescription>
                        Trigger deployment lifecycle actions without leaving
                        this workspace.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-2 p-5 sm:flex sm:flex-wrap">
                      <form
                        action={handleRedeployAction}
                        className="w-full sm:w-auto"
                      >
                        <input
                          name="deploymentId"
                          type="hidden"
                          value={selectedDeployment.id}
                        />
                        <SubmitButton
                          className="w-full justify-center sm:w-auto"
                          iconName="cloud"
                          idleLabel="Restart"
                          pendingLabel="Restarting..."
                          size="compact"
                          variant="secondary"
                        />
                      </form>

                      <form
                        action={handleFetchLatestAction}
                        className="w-full sm:w-auto"
                      >
                        <input
                          name="deploymentId"
                          type="hidden"
                          value={selectedDeployment.id}
                        />
                        <SubmitButton
                          className="w-full justify-center sm:w-auto"
                          iconName="arrow-down"
                          idleLabel="Fetch latest"
                          pendingLabel="Fetching..."
                          size="compact"
                          variant="secondary"
                        />
                      </form>

                      <form
                        action={handleStopAction}
                        className="w-full sm:w-auto"
                      >
                        <input
                          name="deploymentId"
                          type="hidden"
                          value={selectedDeployment.id}
                        />
                        <SubmitButton
                          className="w-full justify-center sm:w-auto"
                          iconName="x-close"
                          idleLabel="Stop"
                          pendingLabel="Stopping..."
                          size="compact"
                          variant="secondary"
                        />
                      </form>

                      <Button
                        type="button"
                        size="xs"
                        variant="danger"
                        className="w-full sm:w-auto"
                        onClick={() =>
                          setPendingDeleteDeploymentId(selectedDeployment.id)
                        }
                      >
                        <Icon name="x-close" className="h-3.5 w-3.5" />
                        Delete app
                      </Button>
                    </CardContent>
                  </Card>

                  <Card className="overflow-hidden border-border/70 bg-card/90 shadow-[0_26px_72px_-54px_rgba(15,23,42,0.45)]">
                    <CardHeader className="border-b border-border/70 bg-linear-to-r from-muted/55 via-background to-background px-5 py-4">
                      <CardTitle className="text-base">Configuration</CardTitle>
                      <CardDescription>
                        Update public routing, app metadata, and runtime
                        environment variables.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="p-5">
                      <form action={handleUpdateAction} className="space-y-5">
                        <input
                          name="deploymentId"
                          type="hidden"
                          value={selectedDeployment.id}
                        />

                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="grid gap-2">
                            <Label htmlFor={`appName-${selectedDeployment.id}`}>
                              App name
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
                            <Label
                              htmlFor={`subdomain-${selectedDeployment.id}`}
                            >
                              Public URL
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
                            <Label htmlFor={`port-${selectedDeployment.id}`}>
                              App port
                            </Label>
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

                          <div className="grid gap-2 md:col-span-2">
                            <Label
                              htmlFor={`envVariables-${selectedDeployment.id}`}
                            >
                              Environment variables
                            </Label>
                            <textarea
                              className="min-h-28 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground shadow-sm transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50"
                              defaultValue={
                                selectedDeployment.envVariables ?? ""
                              }
                              id={`envVariables-${selectedDeployment.id}`}
                              name="envVariables"
                              rows={5}
                            />
                          </div>
                        </div>

                        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                          <Button
                            type="reset"
                            variant="secondary"
                            size="sm"
                            className="w-full sm:w-auto"
                          >
                            Reset
                          </Button>
                          <SubmitButton
                            className="w-full justify-center sm:w-auto"
                            iconName="check"
                            idleLabel="Save changes"
                            pendingLabel="Saving..."
                            size="small"
                            variant="primary"
                          />
                        </div>
                      </form>
                    </CardContent>
                  </Card>

                  {pendingDeleteDeploymentId === selectedDeployment.id ? (
                    <Card
                      className="border-destructive/20 bg-destructive/5 shadow-none"
                      role="alert"
                    >
                      <CardHeader className="px-5 py-4">
                        <CardTitle className="text-base text-destructive">
                          Confirm deletion
                        </CardTitle>
                        <CardDescription className="text-destructive/90">
                          Remove {selectedDeployment.appName} and delete its
                          deployment workspace.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="flex flex-col gap-2 px-5 pb-5 pt-0 sm:flex-row sm:flex-wrap">
                        <form
                          action={handleRemoveAction}
                          className="w-full sm:w-auto"
                        >
                          <input
                            name="deploymentId"
                            type="hidden"
                            value={selectedDeployment.id}
                          />
                          <SubmitButton
                            className="w-full justify-center sm:w-auto"
                            iconName="x-close"
                            idleLabel="Confirm delete"
                            pendingLabel="Deleting..."
                            size="small"
                            variant="danger"
                          />
                        </form>
                        <Button
                          type="button"
                          variant="secondary"
                          className="w-full sm:w-auto"
                          onClick={() => setPendingDeleteDeploymentId(null)}
                        >
                          Cancel
                        </Button>
                      </CardContent>
                    </Card>
                  ) : (
                    <Card className="overflow-hidden border-border/70 bg-card/90 shadow-[0_26px_72px_-54px_rgba(15,23,42,0.45)]">
                      <CardHeader className="border-b border-border/70 bg-linear-to-r from-muted/55 via-background to-background px-5 py-4">
                        <CardTitle className="text-base">Danger zone</CardTitle>
                        <CardDescription>
                          Delete the deployment and remove its managed workspace
                          from disk.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="flex flex-col gap-3 p-5 md:flex-row md:items-center md:justify-between">
                        <p className="text-sm text-muted-foreground">
                          Use this only when you want to retire the app
                          completely.
                        </p>
                        <Button
                          type="button"
                          variant="danger"
                          size="sm"
                          className="w-full sm:w-auto md:w-auto"
                          onClick={() =>
                            setPendingDeleteDeploymentId(selectedDeployment.id)
                          }
                        >
                          <Icon name="x-close" className="h-3.5 w-3.5" />
                          Delete app
                        </Button>
                      </CardContent>
                    </Card>
                  )}
                </div>

                <div className="space-y-5">
                  <Card className="overflow-hidden border-border/70 bg-card/90 shadow-[0_26px_72px_-54px_rgba(15,23,42,0.45)]">
                    <CardHeader className="border-b border-border/70 bg-linear-to-r from-muted/55 via-background to-background px-5 py-4">
                      <CardTitle className="text-base">
                        Deployment summary
                      </CardTitle>
                      <CardDescription>
                        Core routing and lifecycle data for this deployment.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-1">
                      <SummaryBlock
                        label="Repository"
                        value={formatRepositoryLabel(
                          selectedDeployment.repositoryUrl,
                        )}
                      />
                      <SummaryBlock
                        label="Domain"
                        value={formatDeploymentDomain(
                          selectedDeployment,
                          baseDomain,
                        )}
                      />
                      <SummaryBlock
                        label="Updated"
                        suppressHydrationWarning
                        value={formatDeploymentTime(
                          selectedDeployment.updatedAt,
                        )}
                      />
                      <SummaryBlock
                        label="Uptime"
                        suppressHydrationWarning
                        value={formatUptimeLabel(selectedDeployment)}
                      />
                      <SummaryBlock
                        label="Port"
                        value={String(selectedDeployment.port)}
                      />
                      <SummaryBlock
                        label="Branch"
                        value={selectedDeployment.branch || "Default branch"}
                      />
                    </CardContent>
                  </Card>

                  <Card className="overflow-hidden border-border/70 bg-card/90 shadow-[0_26px_72px_-54px_rgba(15,23,42,0.45)]">
                    <CardHeader className="border-b border-border/70 bg-linear-to-r from-muted/55 via-background to-background px-5 py-4">
                      <CardTitle className="text-base">Observability</CardTitle>
                      <CardDescription>
                        Keep the live logs pinned in the right sidebar while
                        managing the app.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 p-5">
                      <SummaryBlock
                        label="Logs panel"
                        value={isLogsPanelCollapsed ? "Hidden" : "Visible"}
                      />
                      <SummaryBlock
                        label="Active log tab"
                        value={
                          currentLogTab === "build"
                            ? "Build log"
                            : "Container log"
                        }
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="w-full sm:w-auto"
                        onClick={() =>
                          handleOpenDeploymentDetail(selectedDeployment.id, {
                            openLogs: true,
                          })
                        }
                      >
                        <Icon name="syslog" className="h-3.5 w-3.5" />
                        Focus logs
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </>
          ) : (
            <Card className="border-border/70 bg-card/90 shadow-[0_26px_72px_-54px_rgba(15,23,42,0.45)]">
              <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-full border border-border/70 bg-muted/60">
                  <Icon
                    name="cloud"
                    className="h-5 w-5 text-muted-foreground"
                  />
                </span>
                <div className="space-y-1">
                  <div className="text-base font-semibold text-foreground">
                    Preparing deployment workspace
                  </div>
                  <div className="text-sm text-muted-foreground">
                    The deployment is being synced. This view will fill in as
                    soon as the refresh completes.
                  </div>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleBackToList}
                >
                  Back to apps
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      ) : currentView === "create" ? (
        <div key="create" className={cn("space-y-5", viewShellClassName)}>
          <section className="overflow-hidden rounded-[1.5rem] border border-border/70 bg-linear-to-r from-muted/70 via-background to-background shadow-[0_28px_90px_-58px_rgba(15,23,42,0.45)]">
            <div className="space-y-5 px-5 py-5">
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                      <button type="button" onClick={handleBackToList}>
                        Apps
                      </button>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>Create app</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>

              <div className="max-w-3xl space-y-3">
                <Badge className="w-fit gap-1 rounded-full border border-border/60 bg-background/80 text-foreground shadow-sm">
                  <Icon name="cloud" className="h-3.5 w-3.5" />
                  New deployment
                </Badge>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
                  Create a new app workspace
                </h1>
                <p className="text-sm leading-6 text-muted-foreground">
                  Connect a repository, pick the branch, and define the public
                  URL for a dedicated deployment workspace.
                </p>
              </div>
            </div>
          </section>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.9fr)]">
            <Card className="overflow-hidden border-border/70 bg-card/90 shadow-[0_26px_72px_-54px_rgba(15,23,42,0.45)]">
              <CardHeader className="border-b border-border/70 bg-linear-to-r from-muted/55 via-background to-background px-5 py-4">
                <CardTitle className="text-base">Deployment settings</CardTitle>
                <CardDescription>
                  This view replaces the old modal so deployment setup feels
                  like part of the control plane.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-5">
                <form onSubmit={handleCreateDeployment} className="space-y-5">
                  {repositoryState.error ? (
                    <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                      {repositoryState.error}
                    </div>
                  ) : null}

                  <div className="grid gap-4 rounded-2xl border border-border/60 bg-muted/25 p-4 md:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor="repositoryPicker">Git repository</Label>
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

                    <div className="grid gap-2">
                      <Label htmlFor="branch">Branch</Label>
                      <div id="branch">
                        <Combobox
                          disabled={!selectedRepository || loadingBranches}
                          emptyText="No branches available"
                          onValueChangeAction={(branch) =>
                            setDraftState((current) => ({
                              ...current,
                              branch,
                            }))
                          }
                          options={buildBranchOptions(
                            selectedRepository?.branches ?? [],
                          )}
                          placeholder={
                            loadingBranches
                              ? "Loading branches..."
                              : "Select branch"
                          }
                          searchPlaceholder="Search branches"
                          value={draftState.branch}
                        />
                      </div>
                    </div>

                    <div className="grid gap-2">
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
                        placeholder="e.g., My App"
                        required
                        type="text"
                        value={draftState.appName}
                      />
                    </div>

                    <div className="grid gap-2">
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

                    <div className="grid gap-2 md:col-span-2">
                      <Label htmlFor="subdomain">Public URL</Label>
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
                          placeholder="app-name"
                          required
                          type="text"
                          value={draftState.subdomain}
                        />
                        <InputGroupSuffix>.{baseDomain}</InputGroupSuffix>
                      </InputGroup>
                    </div>
                  </div>

                  <input
                    name="repositoryUrl"
                    type="hidden"
                    value={draftState.repositoryUrl}
                  />
                  <input
                    name="branch"
                    type="hidden"
                    value={draftState.branch}
                  />

                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                    <Button
                      type="button"
                      variant="secondary"
                      className="w-full sm:w-auto"
                      onClick={handleBackToList}
                      disabled={isCreatingDeployment}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      size="sm"
                      className="w-full sm:w-auto"
                      disabled={
                        isCreatingDeployment ||
                        repositoryState.isLoading ||
                        loadingBranches ||
                        !selectedRepository ||
                        !draftState.appName.trim() ||
                        !draftState.branch.trim() ||
                        !draftState.subdomain.trim()
                      }
                    >
                      <Icon name="cloud" className="h-3.5 w-3.5" />
                      {isCreatingDeployment ? "Deploying..." : "Deploy app"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            <div className="space-y-5">
              <Card className="overflow-hidden border-border/70 bg-card/90 shadow-[0_26px_72px_-54px_rgba(15,23,42,0.45)]">
                <CardHeader className="border-b border-border/70 bg-linear-to-r from-muted/55 via-background to-background px-5 py-4">
                  <CardTitle className="text-base">Preview</CardTitle>
                  <CardDescription>
                    Sanity-check the public address and deployment target before
                    launching.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 p-5">
                  <SummaryBlock
                    label="Repository"
                    value={
                      selectedRepository?.fullName ?? "Select a repository"
                    }
                  />
                  <SummaryBlock
                    label="Branch"
                    value={draftState.branch || "Choose a branch"}
                  />
                  <SummaryBlock
                    label="Public URL"
                    value={
                      draftState.subdomain.trim().length > 0
                        ? `${draftState.subdomain}.${baseDomain}`
                        : `your-app.${baseDomain}`
                    }
                  />
                  <SummaryBlock
                    label="Port"
                    value={draftState.port || "3000"}
                  />
                </CardContent>
              </Card>

              <Card className="overflow-hidden border-border/70 bg-card/90 shadow-[0_26px_72px_-54px_rgba(15,23,42,0.45)]">
                <CardHeader className="border-b border-border/70 bg-linear-to-r from-muted/55 via-background to-background px-5 py-4">
                  <CardTitle className="text-base">What happens next</CardTitle>
                  <CardDescription>
                    Vercelab will clone the repository, build the app, wire
                    Traefik labels, and attach the new deployment to the proxy
                    network.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 p-5 text-sm text-muted-foreground">
                  <p>
                    The right sidebar stays available, but logs will begin
                    streaming only after the deployment has been created.
                  </p>
                  <p>
                    After launch, this view moves directly into the app
                    workspace so you can manage configuration and monitor logs
                    without collapsing cards.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      ) : (
        <div key="list" className={cn("space-y-5", viewShellClassName)}>
          <section className="overflow-hidden rounded-[1.5rem] border border-border/70 bg-linear-to-r from-muted/70 via-background to-background shadow-[0_28px_90px_-58px_rgba(15,23,42,0.45)]">
            <div className="flex flex-col gap-6 px-5 py-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl space-y-3">
                <Badge className="w-fit gap-1 rounded-full border border-border/60 bg-background/80 text-foreground shadow-sm">
                  <Icon name="layout-grid" className="h-3.5 w-3.5" />
                  Git applications
                </Badge>
                <div className="space-y-2">
                  <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
                    App-first deployment control
                  </h1>
                  <p className="text-sm leading-6 text-muted-foreground">
                    Browse every deployment as a dedicated app workspace. When
                    you open one, the entire middle pane becomes its management
                    surface.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <Button
                  type="button"
                  size="sm"
                  className="w-full sm:w-auto"
                  onClick={handleOpenCreateView}
                >
                  <Icon name="cloud" className="h-3.5 w-3.5" />
                  Create app
                </Button>
                {deployments[0] ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="w-full sm:w-auto"
                    onClick={() =>
                      handleOpenDeploymentDetail(deployments[0].id, {
                        openLogs: true,
                      })
                    }
                  >
                    <Icon name="syslog" className="h-3.5 w-3.5" />
                    Open latest logs
                  </Button>
                ) : null}
              </div>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-3">
            <GitStatCard
              iconName="cloud"
              label="Apps"
              value={String(stats.totalDeployments)}
            />
            <GitStatCard
              iconName="check"
              label="Running"
              value={String(stats.runningDeployments)}
            />
            <GitStatCard
              iconName="x-close"
              label="Failed"
              value={String(stats.failedDeployments)}
            />
          </section>

          <Card className="overflow-hidden border-border/70 bg-card/90 shadow-[0_26px_72px_-54px_rgba(15,23,42,0.45)]">
            <CardHeader className="border-b border-border/70 bg-linear-to-r from-muted/55 via-background to-background px-5 py-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                  <CardTitle className="text-base">Installed apps</CardTitle>
                  <CardDescription>
                    Select an app to open its management workspace with actions,
                    configuration, and logs.
                  </CardDescription>
                </div>
                <Badge variant="secondary" className="w-fit">
                  {stats.totalDeployments} total deployments
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-5">
              {deployments.length > 0 ? (
                <div className="grid gap-4 xl:grid-cols-2">
                  {deployments.map((deployment) => {
                    const isActive = activeDeploymentId === deployment.id;
                    const isRemoving = removingDeploymentIds.includes(
                      deployment.id,
                    );

                    return (
                      <article
                        key={deployment.id}
                        className={cn(
                          "group flex h-full flex-col rounded-2xl border border-border/70 bg-linear-to-b from-background to-muted/25 p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-border hover:shadow-[0_24px_60px_-44px_rgba(15,23,42,0.45)]",
                          isActive &&
                            "border-foreground/15 shadow-[0_24px_60px_-44px_rgba(15,23,42,0.45)]",
                          isRemoving &&
                            "pointer-events-none scale-[0.99] opacity-55",
                        )}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 space-y-2">
                            <div className="flex items-center gap-2">
                              <span
                                className={cn(
                                  "h-2.5 w-2.5 rounded-full",
                                  formatStatusDotColor(deployment.status),
                                )}
                                title={formatDeploymentStatus(
                                  deployment.status,
                                )}
                              />
                              <h2 className="truncate text-base font-semibold text-foreground">
                                {deployment.appName}
                              </h2>
                            </div>
                            <a
                              className="inline-flex items-center gap-1 truncate text-sm font-medium text-foreground transition-colors hover:text-foreground/80"
                              href={formatDeploymentHref(
                                deployment,
                                baseDomain,
                              )}
                              rel="noreferrer"
                              target="_blank"
                            >
                              {formatDeploymentDomain(deployment, baseDomain)}
                              <Icon name="arrow-up" className="h-3.5 w-3.5" />
                            </a>
                          </div>

                          <Badge
                            variant={formatStatusBadgeVariant(
                              deployment.status,
                            )}
                          >
                            {formatDeploymentStatus(deployment.status)}
                          </Badge>
                        </div>

                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          <SummaryBlock
                            label="Updated"
                            suppressHydrationWarning
                            value={formatDeploymentTime(deployment.updatedAt)}
                          />
                          <SummaryBlock
                            label="Uptime"
                            suppressHydrationWarning
                            value={formatUptimeLabel(deployment)}
                          />
                          <SummaryBlock
                            label="Branch"
                            value={deployment.branch || "Default branch"}
                          />
                          <SummaryBlock
                            label="Port"
                            value={String(deployment.port)}
                          />
                        </div>

                        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                          <Button
                            type="button"
                            size="sm"
                            className="w-full sm:w-auto"
                            onClick={() =>
                              handleOpenDeploymentDetail(deployment.id)
                            }
                          >
                            <Icon name="settings" className="h-3.5 w-3.5" />
                            Manage
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="w-full sm:w-auto"
                            onClick={() =>
                              handleOpenDeploymentDetail(deployment.id, {
                                openLogs: true,
                              })
                            }
                          >
                            <Icon name="syslog" className="h-3.5 w-3.5" />
                            Logs
                          </Button>
                          <Button
                            asChild
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="w-full sm:w-auto"
                          >
                            <a
                              href={formatDeploymentHref(
                                deployment,
                                baseDomain,
                              )}
                              rel="noreferrer"
                              target="_blank"
                            >
                              <Icon name="globe" className="h-3.5 w-3.5" />
                              Open app
                            </a>
                          </Button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border/70 bg-muted/15 px-6 py-16 text-center">
                  <span className="flex h-14 w-14 items-center justify-center rounded-full border border-border/70 bg-background shadow-sm">
                    <Icon
                      name="cloud"
                      className="h-5 w-5 text-muted-foreground"
                    />
                  </span>
                  <div className="space-y-1">
                    <div className="text-base font-semibold text-foreground">
                      No deployments yet
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Create the first app to open a dedicated management
                      workspace.
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    className="w-full sm:w-auto"
                    onClick={handleOpenCreateView}
                  >
                    <Icon name="cloud" className="h-3.5 w-3.5" />
                    Create app
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

type GitLogPanelProps = {
  currentView: GitView;
  deploymentId: string | null;
  deployments: DashboardDeployment[];
  initialActiveLogTab: LogTab;
  onLogTabChangeAction?: (tab: LogTab) => void;
  showHeader?: boolean;
};

function getLogPanelEmptyState(
  currentView: GitView,
  hasPendingDeployment: boolean,
) {
  if (hasPendingDeployment) {
    return {
      description:
        "The selected deployment is still being resolved. Logs will appear here as soon as the workspace is ready.",
      title: "Preparing logs",
    };
  }

  if (currentView === "create") {
    return {
      description:
        "Deploy an app to start streaming build and container output in this sidebar.",
      title: "Logs are idle",
    };
  }

  return {
    description:
      "Select an app from the list to inspect build and container logs without leaving the dashboard shell.",
    title: "No app selected",
  };
}

export function GitLogPanel({
  currentView,
  deploymentId,
  deployments,
  initialActiveLogTab,
  onLogTabChangeAction,
  showHeader = true,
}: GitLogPanelProps) {
  const [activeLogTab, setActiveLogTab] = useState<LogTab>(initialActiveLogTab);
  const [logRefreshKey, setLogRefreshKey] = useState(0);
  const [logState, setLogState] = useState<{
    isLoading: boolean;
    isRefreshing: boolean;
    error: string | null;
    payload: DeploymentLogPayload | null;
  }>({
    error: null,
    isLoading: false,
    isRefreshing: false,
    payload: null,
  });

  const deployment =
    deployments.find((entry) => entry.id === deploymentId) ?? null;
  const emptyState = getLogPanelEmptyState(currentView, Boolean(deploymentId));

  useEffect(() => {
    setActiveLogTab(initialActiveLogTab);
  }, [initialActiveLogTab]);

  useEffect(() => {
    if (!deploymentId) {
      setLogState({
        error: null,
        isLoading: false,
        isRefreshing: false,
        payload: null,
      });
      return;
    }

    setLogState({
      error: null,
      isLoading: true,
      isRefreshing: false,
      payload: null,
    });
  }, [activeLogTab, deploymentId]);

  useEffect(() => {
    let cancelled = false;

    if (!deploymentId || !deployment) {
      return;
    }

    const loadLogs = async () => {
      setLogState((current) => ({
        ...current,
        error: null,
        isLoading: current.payload === null,
        isRefreshing: current.payload !== null,
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
          error: null,
          isLoading: false,
          isRefreshing: false,
          payload: payload as DeploymentLogPayload,
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        setLogState((current) => ({
          ...current,
          error:
            error instanceof Error
              ? error.message
              : "Unable to load deployment logs.",
          isLoading: false,
          isRefreshing: false,
        }));
      }
    };

    void loadLogs();

    return () => {
      cancelled = true;
    };
  }, [activeLogTab, deployment, deploymentId, logRefreshKey]);

  useEffect(() => {
    if (!deploymentId || !deployment || activeLogTab !== "build") {
      return;
    }

    const intervalId = window.setInterval(() => {
      setLogRefreshKey((current) => current + 1);
    }, LOG_REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [activeLogTab, deployment, deploymentId]);

  const logOutput =
    logState.payload?.output ?? "No logs available for this deployment yet.";
  const logLineCount = logOutput.split("\n").length;
  const activeLogLabel =
    activeLogTab === "build" ? "Build tail" : "Container tail";
  const activeLogCommand =
    activeLogTab === "build"
      ? `deployment build output --follow ${deployment?.appName ?? ""}`.trim()
      : `docker logs -f --tail 150 ${deployment?.appName ?? ""}`.trim();

  return (
    <div className="flex h-full min-w-0 flex-col bg-linear-to-b from-background via-muted/10 to-background">
      {showHeader ? (
        <div className="sticky top-0 z-10 border-b border-border/70 bg-linear-to-r from-background via-muted/40 to-background px-3 py-3 shadow-[0_18px_42px_-34px_rgba(15,23,42,0.45)]">
          <div className="flex items-center justify-between gap-3 pl-10">
            <div className="min-w-0">
              <CardTitle className="truncate text-right text-sm sm:text-base">
                Deployment logs
              </CardTitle>
              <div className="text-xs text-muted-foreground">
                {deployment ? deployment.appName : emptyState.title}
              </div>
            </div>

            {deployment ? (
              <Badge variant={formatStatusBadgeVariant(deployment.status)}>
                {formatDeploymentStatus(deployment.status)}
              </Badge>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="shrink-0 border-b border-border/60 px-3 py-3">
        <div className="flex flex-wrap gap-2">
          {[
            {
              icon: "bars" as const,
              label: "Build log",
              value: "build" as const,
            },
            {
              icon: "monitor" as const,
              label: "Container log",
              value: "container" as const,
            },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold tracking-tight transition-all duration-200",
                activeLogTab === option.value
                  ? "border-emerald-200/80 bg-emerald-50/90 text-emerald-700 shadow-sm"
                  : "border-border/60 bg-background/80 text-muted-foreground hover:text-foreground",
              )}
              onClick={() => {
                setActiveLogTab(option.value);
                onLogTabChangeAction?.(option.value);
              }}
            >
              <Icon name={option.icon} className="h-3.5 w-3.5" />
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1 min-w-0 [&>[data-radix-scroll-area-viewport]>div]:block! [&>[data-radix-scroll-area-viewport]>div]:w-full! [&>[data-radix-scroll-area-viewport]>div]:min-w-0">
        <div className="flex min-w-0 flex-col space-y-4 p-3">
          {deployment ? (
            <>
              <div className="w-full rounded-[1.35rem] border border-border/70 bg-linear-to-br from-background/96 via-muted/14 to-background px-4 py-4 shadow-[0_20px_56px_-46px_rgba(15,23,42,0.32)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold tracking-tight text-foreground">
                      {deployment.appName}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {activeLogCommand}
                    </div>
                  </div>
                  <Badge variant={formatStatusBadgeVariant(deployment.status)}>
                    {formatDeploymentStatus(deployment.status)}
                  </Badge>
                </div>
              </div>

              {logState.error ? (
                <div className="w-full rounded-[1.2rem] border border-amber-200/80 bg-amber-50/80 px-3.5 py-3 text-xs text-amber-800 shadow-[0_18px_44px_-40px_rgba(217,119,6,0.35)]">
                  {logState.error}
                </div>
              ) : null}

              <div className="min-w-0 overflow-hidden rounded-[1.35rem] border border-border/70 bg-[#0f1720] shadow-[0_24px_70px_-50px_rgba(15,23,42,0.5)]">
                <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
                  <div className="flex items-center gap-2 text-xs text-slate-300">
                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                    {activeLogLabel}
                  </div>
                  <div className="font-mono text-[11px] text-slate-400">
                    {logState.isLoading
                      ? "Loading..."
                      : `${logLineCount} lines`}
                  </div>
                </div>

                <div className="max-h-[52vh] min-w-0 overflow-y-auto overflow-x-hidden px-4 py-4 font-mono text-[12px] leading-6 text-slate-200">
                  {logState.isLoading ? (
                    <div className="text-slate-400">Loading logs...</div>
                  ) : (
                    <pre className="max-w-full whitespace-pre-wrap wrap-break-word text-slate-100">
                      {logOutput}
                    </pre>
                  )}
                </div>
              </div>

              <div className="w-full space-y-3 rounded-[1.35rem] border border-border/70 bg-background/88 px-4 py-4 shadow-[0_20px_52px_-44px_rgba(15,23,42,0.24)]">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Active context
                </div>
                <div className="grid gap-3">
                  <div className="rounded-[1.2rem] border border-border/60 bg-background/80 px-3 py-3">
                    <div className="text-xs text-muted-foreground">
                      Current view
                    </div>
                    <div className="mt-1 text-sm font-semibold text-foreground">
                      {activeLogTab === "build" ? "Build log" : "Container log"}
                    </div>
                  </div>
                  <div className="rounded-[1.2rem] border border-border/60 bg-background/80 px-3 py-3">
                    <div className="text-xs text-muted-foreground">
                      Last refresh
                    </div>
                    <div className="mt-1 text-sm font-semibold text-foreground">
                      {logState.payload?.updatedAt
                        ? formatRelativeTime(logState.payload.updatedAt)
                        : "Waiting for logs"}
                    </div>
                  </div>
                  <div className="rounded-[1.2rem] border border-border/60 bg-background/80 px-3 py-3">
                    <div className="text-xs text-muted-foreground">
                      Repository
                    </div>
                    <div className="mt-1 text-sm font-semibold text-foreground">
                      {deployment.repositoryName}
                    </div>
                  </div>
                  <div className="rounded-[1.2rem] border border-border/60 bg-background/80 px-3 py-3">
                    <div className="text-xs text-muted-foreground">
                      Updated at
                    </div>
                    <div className="mt-1 text-sm font-semibold text-foreground">
                      {logState.payload?.updatedAt
                        ? formatDeploymentTime(logState.payload.updatedAt)
                        : formatDeploymentTime(deployment.updatedAt)}
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex min-w-0 flex-col space-y-4">
              <div className="w-full rounded-[1.35rem] border border-border/70 bg-linear-to-br from-background/96 via-muted/14 to-background px-4 py-4 shadow-[0_20px_56px_-46px_rgba(15,23,42,0.32)]">
                <div className="text-sm font-semibold tracking-tight text-foreground">
                  {emptyState.title}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Deployment logs will appear here when an app is selected.
                </div>
              </div>

              <div className="min-w-0 overflow-hidden rounded-[1.35rem] border border-border/70 bg-[#0f1720] shadow-[0_24px_70px_-50px_rgba(15,23,42,0.5)]">
                <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
                  <div className="flex items-center gap-2 text-xs text-slate-300">
                    <span className="h-2 w-2 rounded-full bg-slate-400" />
                    Tail preview
                  </div>
                  <div className="font-mono text-[11px] text-slate-400">
                    Idle
                  </div>
                </div>
                <div className="px-4 py-4 font-mono text-[12px] leading-6 text-slate-400">
                  {emptyState.description}
                </div>
              </div>

              <div className="w-full space-y-3 rounded-[1.35rem] border border-border/70 bg-background/88 px-4 py-4 shadow-[0_20px_52px_-44px_rgba(15,23,42,0.24)]">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Active context
                </div>
                <div className="grid gap-3">
                  <div className="rounded-[1.2rem] border border-border/60 bg-background/80 px-3 py-3">
                    <div className="text-xs text-muted-foreground">
                      Current view
                    </div>
                    <div className="mt-1 text-sm font-semibold text-foreground">
                      {currentView === "create" ? "Create app" : "App list"}
                    </div>
                  </div>
                  <div className="rounded-[1.2rem] border border-border/60 bg-background/80 px-3 py-3">
                    <div className="text-xs text-muted-foreground">
                      Selected app
                    </div>
                    <div className="mt-1 text-sm font-semibold text-foreground">
                      None
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
