"use client";

import { useDeferredValue, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ExternalLink,
  GitBranch,
  GitCommitHorizontal,
  Globe,
  LoaderCircle,
  Package,
  Play,
  Plus,
  RefreshCcw,
  RotateCcw,
  Save,
  Square,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { toast } from "sonner";

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
import type { DeploymentSummary } from "@/lib/persistence";
import { cn } from "@/lib/utils";

type DeploymentSourceCommit = {
  authorName: string | null;
  committedAt: string | null;
  message: string;
  sha: string;
  shortSha: string;
  url: string | null;
};

type DeploymentSourcePayload = {
  branches: string[];
  browserError: string | null;
  commits: DeploymentSourceCommit[];
  configuredBranch: string | null;
  configuredCommitSha: string | null;
  currentBranch: string | null;
  currentCommit: DeploymentSourceCommit | null;
  repository: {
    fullName: string;
    name: string;
    owner: string;
    url: string;
  } | null;
};

type EnvVariableDraft = {
  enabled: boolean;
  id: string;
  key: string;
  value: string;
};

type PendingAction =
  | "delete"
  | "fetch"
  | "recreate"
  | "save"
  | "start"
  | "stop"
  | null;

type GitAppPageMainContentProps = {
  baseDomain?: string;
  deployment: DeploymentSummary;
  deploymentHref: string | null;
  deploymentStatusLabel: string;
  deploymentStatusVariant: "success" | "warning" | "default";
  onDeleteAction: () => Promise<void>;
  onFetchAction: () => Promise<void>;
  onRefreshAction: () => void;
  onRecreateAction: () => Promise<void>;
  onSaveSettingsAction: (formData: FormData) => Promise<void>;
  onStartAction: () => Promise<void>;
  onStopAction: () => Promise<void>;
  publicDomainLabel: string;
};

type SnapshotRowProps = {
  label: string;
  value: React.ReactNode;
};

type SettingsRowProps = {
  currentValue: React.ReactNode;
  editor: React.ReactNode;
  label: string;
  onReset: () => void;
  resetDisabled?: boolean;
};

function createDraftId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createEnvVariableDraft(
  key = "",
  value = "",
  enabled = true,
): EnvVariableDraft {
  return {
    enabled,
    id: createDraftId(),
    key,
    value,
  };
}

function buildEnvVariableDrafts(envVariables: string | null) {
  if (!envVariables) {
    return [] as EnvVariableDraft[];
  }

  return envVariables
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((line) => {
      const separatorIndex = line.indexOf("=");

      if (separatorIndex === -1) {
        return createEnvVariableDraft(line, "", true);
      }

      return createEnvVariableDraft(
        line.slice(0, separatorIndex),
        line.slice(separatorIndex + 1),
        true,
      );
    });
}

function serializeEnvVariableDrafts(rows: EnvVariableDraft[]) {
  return rows
    .filter((row) => row.enabled && row.key.trim().length > 0)
    .map((row) => `${row.key.trim()}=${row.value}`)
    .join("\n");
}

function formatSourceDate(value: string | null) {
  if (!value) {
    return "Unknown date";
  }

  try {
    return new Intl.DateTimeFormat("en", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function getRepositoryDescriptor(repositoryUrl: string) {
  try {
    const parsed = new URL(repositoryUrl);
    const hostname = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    const pathSegments = parsed.pathname
      .replace(/\.git$/i, "")
      .split("/")
      .filter(Boolean);

    if (hostname === "github.com" && pathSegments.length >= 2) {
      const [owner, name] = pathSegments;

      return {
        fullName: `${owner}/${name}`,
        url: `https://github.com/${owner}/${name}`,
      };
    }

    return {
      fullName: pathSegments.join("/") || repositoryUrl,
      url: repositoryUrl,
    };
  } catch {
    return {
      fullName: repositoryUrl,
      url: repositoryUrl,
    };
  }
}

function SnapshotRow({ label, value }: SnapshotRowProps) {
  return (
    <div className="grid gap-1 border-b border-border/50 py-3 last:border-b-0 md:grid-cols-[9.5rem_minmax(0,1fr)] md:items-start md:gap-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
      <div className="min-w-0 text-sm leading-6 text-foreground">{value}</div>
    </div>
  );
}

function SettingsRow({
  currentValue,
  editor,
  label,
  onReset,
  resetDisabled = false,
}: SettingsRowProps) {
  return (
    <div className="grid gap-2.5 px-4 py-3 md:grid-cols-[10rem_minmax(0,0.9fr)_minmax(0,1.15fr)_5rem] md:items-center">
      <div>
        <div className="text-sm font-semibold tracking-tight text-foreground">
          {label}
        </div>
      </div>

      <div className="min-w-0 rounded-[0.95rem] border border-border/60 bg-muted/36 px-3 py-2">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground md:hidden">
          Current
        </div>
        <div className="min-w-0 text-sm leading-5 text-foreground">
          {currentValue}
        </div>
      </div>

      <div className="min-w-0">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground md:hidden">
          New value
        </div>
        {editor}
      </div>

      <div className="flex md:justify-end">
        <Button
          className="w-full md:w-auto"
          disabled={resetDisabled}
          onClick={onReset}
          size="xs"
          type="button"
          variant="ghost"
        >
          <Undo2 className="h-3.5 w-3.5" />
          Undo
        </Button>
      </div>
    </div>
  );
}

export function GitAppPageMainContent({
  baseDomain,
  deployment,
  deploymentHref,
  deploymentStatusLabel,
  deploymentStatusVariant,
  onDeleteAction,
  onFetchAction,
  onRefreshAction,
  onRecreateAction,
  onSaveSettingsAction,
  onStartAction,
  onStopAction,
  publicDomainLabel,
}: GitAppPageMainContentProps) {
  const [appName, setAppName] = useState(deployment.appName);
  const [branchValue, setBranchValue] = useState(deployment.branch ?? "");
  const [commitSha, setCommitSha] = useState(deployment.commitSha ?? "");
  const [envRows, setEnvRows] = useState<EnvVariableDraft[]>(() =>
    buildEnvVariableDrafts(deployment.envVariables),
  );
  const [isSourceLoading, setIsSourceLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [port, setPort] = useState(String(deployment.port));
  const [sourceData, setSourceData] = useState<DeploymentSourcePayload | null>(
    null,
  );
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [subdomain, setSubdomain] = useState(deployment.subdomain);
  const deferredBranch = useDeferredValue(branchValue);

  // Tracks whether the user has triggered the first source load.
  // We never auto-fetch on page load — the fetch only starts when the user
  // opens the branch combobox for the first time.
  const sourceRequestedRef = useRef(false);
  const [sourceRequested, setSourceRequested] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchSourceData = useCallback(
    (branch: string) => {
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const searchParams = new URLSearchParams();

      if (branch.trim().length > 0) {
        searchParams.set("branch", branch.trim());
      }

      const requestUrl = `/api/deployments/${deployment.id}/source${searchParams.size ? `?${searchParams.toString()}` : ""}`;

      async function run() {
        setIsSourceLoading(true);
        setSourceError(null);

        try {
          const response = await fetch(requestUrl, {
            signal: controller.signal,
          });
          const payload = (await response.json()) as
            | DeploymentSourcePayload
            | { error?: string };

          if (!response.ok) {
            const errorMessage =
              typeof payload === "object" &&
              payload !== null &&
              "error" in payload &&
              typeof payload.error === "string"
                ? payload.error
                : "Unable to load repository source details.";

            throw new Error(errorMessage);
          }

          setSourceData(payload as DeploymentSourcePayload);
        } catch (error) {
          if (controller.signal.aborted) {
            return;
          }

          setSourceData(null);
          setSourceError(
            error instanceof Error
              ? error.message
              : "Unable to load repository source details.",
          );
        } finally {
          if (!controller.signal.aborted) {
            setIsSourceLoading(false);
          }
        }
      }

      void run();
    },
    [deployment.id],
  );

  // Re-fetch when the selected branch changes — but only after the first
  // load has already been requested (i.e. the user opened the combobox once).
  useEffect(() => {
    if (!sourceRequestedRef.current) {
      return;
    }

    fetchSourceData(deferredBranch);
  }, [deferredBranch, deployment.updatedAt, fetchSourceData]);

  // Clean up any in-flight request when the deployment changes.
  useEffect(() => {
    return () => {
      sourceRequestedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, [deployment.id]);
  const repositoryDescriptor = sourceData?.repository
    ? {
        fullName: sourceData.repository.fullName,
        url: sourceData.repository.url,
      }
    : getRepositoryDescriptor(deployment.repositoryUrl);
  const activeCommit = sourceData?.currentCommit;
  const currentEnvPayload = deployment.envVariables ?? "";
  const envPayload = serializeEnvVariableDrafts(envRows);
  const liveHref = deploymentHref ?? `https://${publicDomainLabel}`;
  const branchBrowserError = sourceError ?? sourceData?.browserError ?? null;
  const isBusy = pendingAction !== null;
  const normalizedCurrentEnvPayload = useMemo(
    () => serializeEnvVariableDrafts(buildEnvVariableDrafts(currentEnvPayload)),
    [currentEnvPayload],
  );

  useEffect(() => {
    setAppName(deployment.appName);
    setBranchValue(deployment.branch ?? "");
    setCommitSha(deployment.commitSha ?? "");
    setEnvRows(buildEnvVariableDrafts(deployment.envVariables));
    setPort(String(deployment.port));
    setSubdomain(deployment.subdomain);
  }, [
    deployment.appName,
    deployment.branch,
    deployment.commitSha,
    deployment.envVariables,
    deployment.id,
    deployment.port,
    deployment.subdomain,
  ]);

  const branchOptions = useMemo(() => {
    const seen = new Set<string>();

    return [
      branchValue.trim(),
      deployment.branch ?? "",
      ...(sourceData?.branches ?? []),
    ]
      .filter((branch) => branch.length > 0)
      .filter((branch) => {
        if (seen.has(branch)) {
          return false;
        }

        seen.add(branch);
        return true;
      })
      .map((branch) => ({
        description:
          branch === deployment.branch
            ? "Current saved branch"
            : branch === sourceData?.currentBranch
              ? "Currently checked out"
              : undefined,
        label: branch,
        value: branch,
      }));
  }, [branchValue, deployment.branch, sourceData]);

  const commitOptions = useMemo(() => {
    const seen = new Set<string>([""]);
    const options = [
      {
        label: "Latest on selected branch",
        value: "",
      },
    ];

    if (commitSha.trim().length > 0 && !seen.has(commitSha.trim())) {
      seen.add(commitSha.trim());
      options.push({
        label: commitSha.trim().slice(0, 7),
        value: commitSha.trim(),
      });
    }

    for (const commit of sourceData?.commits ?? []) {
      if (seen.has(commit.sha)) {
        continue;
      }

      seen.add(commit.sha);
      options.push({
        label: commit.shortSha,
        value: commit.sha,
      });
    }

    return options;
  }, [branchValue, commitSha, deployment.branch, sourceData]);

  const hasAppNameChange = appName.trim() !== deployment.appName;
  const hasBranchChange = branchValue.trim() !== (deployment.branch ?? "");
  const hasCommitChange = commitSha.trim() !== (deployment.commitSha ?? "");
  const hasEnvChange = envPayload !== normalizedCurrentEnvPayload;
  const hasPortChange = port.trim() !== String(deployment.port);
  const hasSubdomainChange = subdomain.trim() !== deployment.subdomain;
  const changeCount = [
    hasAppNameChange,
    hasBranchChange,
    hasCommitChange,
    hasEnvChange,
    hasPortChange,
    hasSubdomainChange,
  ].filter(Boolean).length;

  async function runPendingAction(
    action: Exclude<PendingAction, "save" | null>,
    task: () => Promise<void>,
  ) {
    setPendingAction(action);

    try {
      await task();
    } finally {
      setPendingAction(null);
    }
  }

  async function handleSaveSettings() {
    if (changeCount === 0) {
      toast.error("Change at least one setting before saving.");
      return;
    }
    const formData = new FormData();

    formData.set("deploymentId", deployment.id);
    formData.set("appName", appName.trim());
    formData.set("branch", branchValue.trim());
    formData.set("commitSha", commitSha.trim());
    formData.set("envVariables", envPayload);
    formData.set("port", port.trim());
    formData.set("subdomain", subdomain.trim());

    setPendingAction("save");

    try {
      await onSaveSettingsAction(formData);
    } finally {
      setPendingAction(null);
    }
  }

  function handleBranchSelect(value: string) {
    setBranchValue(value);
    setCommitSha("");
  }

  function handleBranchComboboxOpen(open: boolean) {
    if (!open || sourceRequestedRef.current) {
      return;
    }

    // First time the user opens the branch dropdown — kick off the lazy fetch.
    sourceRequestedRef.current = true;
    setSourceRequested(true);
    fetchSourceData(branchValue);
  }

  function handleCommitSelect(value: string) {
    setCommitSha(value);
  }

  function resetEnvRows() {
    setEnvRows(buildEnvVariableDrafts(deployment.envVariables));
  }

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-[1.4rem] border border-border/70 bg-linear-to-r from-background via-muted/22 to-background shadow-[0_26px_80px_-62px_rgba(15,23,42,0.4)]">
        <div className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1.5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Active deployment
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl font-semibold tracking-tight text-foreground md:text-2xl">
                {deployment.appName}
              </h1>
              <Badge variant={deploymentStatusVariant}>
                {deploymentStatusLabel}
              </Badge>
              <Badge className="border-border/60 bg-background/80 text-foreground">
                {deployment.composeMode ?? "auto"}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>Deployment endpoint</span>
              <a
                className="inline-flex items-center gap-1 font-medium text-foreground underline underline-offset-4 transition-colors hover:text-foreground/80"
                href={liveHref}
                rel="noreferrer"
                target="_blank"
              >
                {publicDomainLabel}
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge className="border-border/60 bg-muted/45 text-foreground">
              Updated{" "}
              {new Date(deployment.updatedAt).toLocaleString("en", {
                hour: "2-digit",
                minute: "2-digit",
                month: "short",
                day: "numeric",
              })}
            </Badge>
            <Badge className="border-border/60 bg-muted/45 text-foreground">
              Port {deployment.port}
            </Badge>
          </div>
        </div>
      </section>

      <Card className="overflow-hidden border-border/70 bg-card/92">
        <CardHeader className="border-b border-border/60 bg-linear-to-r from-muted/52 via-background to-background">
          <CardTitle>Current app snapshot</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5 pt-4">
          <div className="rounded-[1.2rem] border border-border/60 bg-background/88 px-4 py-1">
            <SnapshotRow label="App name" value={deployment.appName} />
            <SnapshotRow
              label="Traefik URL"
              value={
                <a
                  className="inline-flex items-center gap-1 font-medium text-foreground underline underline-offset-4 transition-colors hover:text-foreground/80"
                  href={liveHref}
                  rel="noreferrer"
                  target="_blank"
                >
                  <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                  {publicDomainLabel}
                </a>
              }
            />
            <SnapshotRow
              label="Repository"
              value={
                <a
                  className="inline-flex items-center gap-1 font-medium text-foreground underline underline-offset-4 transition-colors hover:text-foreground/80"
                  href={repositoryDescriptor.url}
                  rel="noreferrer"
                  target="_blank"
                >
                  <Package className="h-3.5 w-3.5 text-muted-foreground" />
                  {repositoryDescriptor.fullName}
                </a>
              }
            />
            <SnapshotRow
              label="Branch"
              value={
                <div className="flex flex-wrap items-center gap-2">
                  <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>
                    {sourceData?.currentBranch ??
                      deployment.branch ??
                      "Default branch"}
                  </span>
                  {deployment.branch ? (
                    <Badge className="border-border/60 bg-muted/45 text-foreground">
                      Saved ref
                    </Badge>
                  ) : null}
                </div>
              }
            />
            <SnapshotRow
              label="Commit"
              value={
                activeCommit ? (
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {activeCommit.url ? (
                        <a
                          className="inline-flex items-center gap-1 font-medium text-foreground underline underline-offset-4 transition-colors hover:text-foreground/80"
                          href={activeCommit.url}
                          rel="noreferrer"
                          target="_blank"
                        >
                          <GitCommitHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                          {activeCommit.shortSha}
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-medium text-foreground">
                          <GitCommitHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                          {activeCommit.shortSha}
                        </span>
                      )}
                      {deployment.commitSha ? (
                        <Badge className="border-border/60 bg-muted/45 text-foreground">
                          Pinned
                        </Badge>
                      ) : (
                        <Badge className="border-border/60 bg-muted/45 text-foreground">
                          Tracking branch head
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs leading-5 text-muted-foreground">
                      {activeCommit.message}
                      {activeCommit.committedAt
                        ? ` • ${formatSourceDate(activeCommit.committedAt)}`
                        : ""}
                    </div>
                  </div>
                ) : (
                  <span className="text-muted-foreground">
                    Commit metadata loads after the repository source is
                    available.
                  </span>
                )
              }
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              disabled={isBusy || deployment.status !== "stopped"}
              onClick={() => void runPendingAction("start", onStartAction)}
              size="sm"
              type="button"
            >
              {pendingAction === "start" ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Start
            </Button>
            <Button
              disabled={isBusy || deployment.status === "stopped"}
              onClick={() => void runPendingAction("stop", onStopAction)}
              size="sm"
              type="button"
              variant="secondary"
            >
              {pendingAction === "stop" ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Square className="h-4 w-4" />
              )}
              Stop
            </Button>
            <Button
              disabled={isBusy}
              onClick={() => void runPendingAction("fetch", onFetchAction)}
              size="sm"
              type="button"
              variant="secondary"
            >
              {pendingAction === "fetch" ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCcw className="h-4 w-4" />
              )}
              Fetch
            </Button>
            <Button
              disabled={isBusy}
              onClick={() =>
                void runPendingAction("recreate", onRecreateAction)
              }
              size="sm"
              type="button"
            >
              {pendingAction === "recreate" ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              Recreate
            </Button>
            <Button
              disabled={isBusy}
              onClick={() => void runPendingAction("delete", onDeleteAction)}
              size="sm"
              type="button"
              variant="danger"
            >
              {pendingAction === "delete" ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Delete
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-border/70 bg-card/92">
        <CardHeader className="border-b border-border/60 bg-linear-to-r from-muted/52 via-background to-background">
          <CardTitle>Editable runtime settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          {branchBrowserError ? (
            <div className="rounded-[1rem] border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-sm leading-6 text-amber-900">
              {branchBrowserError}
            </div>
          ) : null}

          <div className="overflow-hidden rounded-[1.25rem] border border-border/60 bg-background/88">
            <div className="hidden border-b border-border/60 bg-muted/30 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground md:grid md:grid-cols-[11rem_minmax(0,0.9fr)_minmax(0,1.15fr)_5rem]">
              <div>Setting</div>
              <div>Current</div>
              <div>New value</div>
              <div className="text-right">Undo</div>
            </div>

            <div className="divide-y divide-border/60">
              <SettingsRow
                currentValue={deployment.appName}
                editor={
                  <Input
                    className="h-9 rounded-lg bg-background shadow-none"
                    onChange={(event) => setAppName(event.target.value)}
                    value={appName}
                  />
                }
                label="App name"
                onReset={() => setAppName(deployment.appName)}
                resetDisabled={!hasAppNameChange}
              />

              <SettingsRow
                currentValue={
                  <span className="font-medium text-foreground">
                    {publicDomainLabel}
                  </span>
                }
                editor={
                  <InputGroup className="h-9 rounded-lg bg-background shadow-none">
                    <InputGroupInput
                      className="px-3 text-sm"
                      onChange={(event) => setSubdomain(event.target.value)}
                      value={subdomain}
                    />
                    {baseDomain ? (
                      <InputGroupSuffix className="leading-9">
                        .{baseDomain}
                      </InputGroupSuffix>
                    ) : null}
                  </InputGroup>
                }
                label="Traefik URL"
                onReset={() => setSubdomain(deployment.subdomain)}
                resetDisabled={!hasSubdomainChange}
              />

              <SettingsRow
                currentValue={
                  sourceData?.currentBranch ??
                  deployment.branch ??
                  "Default branch"
                }
                editor={
                  <Combobox
                    ariaLabel="Saved branch"
                    buttonClassName="h-9 rounded-lg bg-background px-3 text-sm shadow-none"
                    disabled={isSourceLoading}
                    emptyText={branchBrowserError ?? "No branches available"}
                    onOpenChangeAction={handleBranchComboboxOpen}
                    onValueChangeAction={handleBranchSelect}
                    options={branchOptions}
                    placeholder={
                      isSourceLoading
                        ? "Loading branches..."
                        : sourceRequested
                          ? "Select a branch"
                          : "Click to load branches"
                    }
                    searchPlaceholder="Search branches"
                    value={branchValue}
                  />
                }
                label="Branch"
                onReset={() => {
                  setBranchValue(deployment.branch ?? "");
                  setCommitSha(deployment.commitSha ?? "");
                }}
                resetDisabled={!hasBranchChange}
              />

              <SettingsRow
                currentValue={
                  activeCommit ? (
                    <span className="font-medium text-foreground">
                      {activeCommit.shortSha}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">
                      Latest branch head
                    </span>
                  )
                }
                editor={
                  <Combobox
                    ariaLabel="Saved commit"
                    buttonClassName="h-9 rounded-lg bg-background px-3 text-sm shadow-none"
                    disabled={isSourceLoading || Boolean(branchBrowserError)}
                    emptyText={branchBrowserError ?? "No commits available"}
                    onValueChangeAction={handleCommitSelect}
                    options={commitOptions}
                    placeholder={
                      isSourceLoading ? "Loading commits..." : "Select a commit"
                    }
                    searchPlaceholder="Search commits"
                    value={commitSha}
                  />
                }
                label="Commit"
                onReset={() => setCommitSha(deployment.commitSha ?? "")}
                resetDisabled={!hasCommitChange}
              />

              <SettingsRow
                currentValue={`:${deployment.port}`}
                editor={
                  <Input
                    className="h-9 rounded-lg bg-background shadow-none"
                    inputMode="numeric"
                    onChange={(event) => setPort(event.target.value)}
                    value={port}
                  />
                }
                label="App port"
                onReset={() => setPort(String(deployment.port))}
                resetDisabled={!hasPortChange}
              />
            </div>
          </div>

          <div className="overflow-hidden rounded-[1.25rem] border border-border/60 bg-background/88">
            <div className="flex flex-col gap-3 border-b border-border/60 bg-muted/24 px-4 py-3 md:flex-row md:items-center md:justify-between">
              <div className="text-sm font-semibold tracking-tight text-foreground">
                Environment variables
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => {
                    setEnvRows((current) => [
                      ...current,
                      createEnvVariableDraft(),
                    ]);
                  }}
                  size="xs"
                  type="button"
                  variant="secondary"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add variable
                </Button>
                <Button
                  disabled={!hasEnvChange}
                  onClick={resetEnvRows}
                  size="xs"
                  type="button"
                  variant="ghost"
                >
                  <Undo2 className="h-3.5 w-3.5" />
                  Undo env edits
                </Button>
              </div>
            </div>

            <div className="hidden border-b border-border/60 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground md:grid md:grid-cols-[5.5rem_minmax(0,0.7fr)_minmax(0,1.3fr)_3rem]">
              <div>Use</div>
              <div>Key</div>
              <div>Value</div>
              <div className="text-right">Remove</div>
            </div>

            {envRows.length ? (
              <div className="divide-y divide-border/60">
                {envRows.map((row) => (
                  <div
                    className="grid gap-3 px-4 py-3 md:grid-cols-[5.5rem_minmax(0,0.7fr)_minmax(0,1.3fr)_3rem] md:items-center"
                    key={row.id}
                  >
                    <label className="inline-flex items-center gap-2 text-xs font-medium text-foreground">
                      <input
                        checked={row.enabled}
                        className="h-4 w-4 rounded border-border/70 text-foreground accent-foreground"
                        onChange={(event) => {
                          setEnvRows((current) =>
                            current.map((item) =>
                              item.id === row.id
                                ? {
                                    ...item,
                                    enabled: event.target.checked,
                                  }
                                : item,
                            ),
                          );
                        }}
                        type="checkbox"
                      />
                      Enable
                    </label>

                    <Input
                      className={cn(
                        "h-9 rounded-lg bg-background shadow-none",
                        !row.enabled && "opacity-65",
                      )}
                      onChange={(event) => {
                        setEnvRows((current) =>
                          current.map((item) =>
                            item.id === row.id
                              ? {
                                  ...item,
                                  key: event.target.value,
                                }
                              : item,
                          ),
                        );
                      }}
                      placeholder="KEY"
                      value={row.key}
                    />

                    <Input
                      className={cn(
                        "h-9 rounded-lg bg-background shadow-none",
                        !row.enabled && "opacity-65",
                      )}
                      onChange={(event) => {
                        setEnvRows((current) =>
                          current.map((item) =>
                            item.id === row.id
                              ? {
                                  ...item,
                                  value: event.target.value,
                                }
                              : item,
                          ),
                        );
                      }}
                      placeholder="VALUE"
                      value={row.value}
                    />

                    <div className="flex md:justify-end">
                      <Button
                        onClick={() => {
                          setEnvRows((current) =>
                            current.filter((item) => item.id !== row.id),
                          );
                        }}
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-4 py-6 text-sm leading-6 text-muted-foreground">
                No environment variables are configured yet. Add the ones you
                need and include the row in the next save.
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 rounded-[1.2rem] border border-border/60 bg-linear-to-r from-muted/34 via-background to-background px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-2">
              <div className="text-sm font-semibold tracking-tight text-foreground">
                Save changes
              </div>
              {changeCount > 0 ? (
                <Badge className="border-border/60 bg-background/80 text-foreground">
                  {changeCount} pending
                </Badge>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                disabled={isBusy || changeCount === 0}
                onClick={() => void handleSaveSettings()}
                size="sm"
                type="button"
              >
                {pendingAction === "save" ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save and recreate
              </Button>
              <Button
                disabled={isBusy}
                onClick={onRefreshAction}
                size="sm"
                type="button"
                variant="secondary"
              >
                <RefreshCcw className="h-4 w-4" />
                Refresh data
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
