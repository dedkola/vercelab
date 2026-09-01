'use client';

import { useDeferredValue, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  ExternalLink,
  GitBranch,
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
} from 'lucide-react';
import { toast } from 'sonner';

import { GitLogPanel, type LogTab } from '@/components/git-log-panel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupInput, InputGroupSuffix } from '@/components/ui/input-group';
import type { DeploymentSummary } from '@/lib/persistence';
import type { ExposureMode } from '@/lib/validation';
import { cn } from '@/lib/utils';

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

type PendingAction = 'delete' | 'fetch' | 'recreate' | 'save' | 'start' | 'stop' | null;

type GitAppPageMainContentProps = {
  activeLogTab: LogTab;
  baseDomain?: string;
  deployment: DeploymentSummary;
  deploymentHref: string | null;
  deploymentStatusLabel: string;
  deploymentStatusVariant: 'success' | 'warning' | 'default';
  deployments: DeploymentSummary[];
  onCloseAction: () => void;
  onDeleteAction: () => Promise<void>;
  onFetchAction: () => Promise<void>;
  onLogTabChangeAction: (tab: LogTab) => void;
  onRefreshAction: () => void;
  onRecreateAction: () => Promise<void>;
  onSaveSettingsAction: (formData: FormData) => Promise<void>;
  onStartAction: () => Promise<void>;
  onStopAction: () => Promise<void>;
  publicDomainLabel: string;
};

type ManagerTab = 'overview' | 'settings' | 'variables' | 'logs';

type ConfigurationFieldProps = {
  changed: boolean;
  children: React.ReactNode;
  description: string;
  label: string;
  onReset: () => void;
  savedValue: React.ReactNode;
};

function createDraftId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createEnvVariableDraft(key = '', value = '', enabled = true): EnvVariableDraft {
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
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map((line) => {
      const separatorIndex = line.indexOf('=');

      if (separatorIndex === -1) {
        return createEnvVariableDraft(line, '', true);
      }

      return createEnvVariableDraft(
        line.slice(0, separatorIndex),
        line.slice(separatorIndex + 1),
        true
      );
    });
}

function serializeEnvVariableDrafts(rows: EnvVariableDraft[]) {
  return rows
    .filter((row) => row.enabled && row.key.trim().length > 0)
    .map((row) => `${row.key.trim()}=${row.value}`)
    .join('\n');
}

function getRepositoryDescriptor(repositoryUrl: string) {
  try {
    const parsed = new URL(repositoryUrl);
    const hostname = parsed.hostname.replace(/^www\./i, '').toLowerCase();
    const pathSegments = parsed.pathname
      .replace(/\.git$/i, '')
      .split('/')
      .filter(Boolean);

    if (hostname === 'github.com' && pathSegments.length >= 2) {
      const [owner, name] = pathSegments;

      return {
        fullName: `${owner}/${name}`,
        url: `https://github.com/${owner}/${name}`,
      };
    }

    return {
      fullName: pathSegments.join('/') || repositoryUrl,
      url: repositoryUrl,
    };
  } catch {
    return {
      fullName: repositoryUrl,
      url: repositoryUrl,
    };
  }
}

function ConfigurationField({
  changed,
  children,
  description,
  label,
  onReset,
  savedValue,
}: ConfigurationFieldProps) {
  return (
    <div
      className={cn(
        'rounded-[8px] border bg-background p-3 transition-[border-color,box-shadow]',
        changed ? 'border-orange-200 shadow-[0_0_0_3px_rgb(244_129_32_/_0.07)]' : 'border-border/70'
      )}
    >
      <div className="mb-2.5 flex min-h-8 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="text-xs font-semibold tracking-tight text-foreground">{label}</div>
            {changed ? (
              <span className="font-mono text-[11px] font-semibold tracking-[0.05em] text-[var(--orange)] uppercase">
                Changed
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{description}</p>
        </div>
        {changed ? (
          <Button
            aria-label={`Undo ${label} change`}
            className="h-6 shrink-0 px-2 text-[12px]"
            onClick={onReset}
            size="xs"
            type="button"
            variant="ghost"
          >
            <Undo2 className="size-3" />
            Undo
          </Button>
        ) : null}
      </div>

      {children}

      <div className="mt-2 truncate font-mono text-[11px] text-[var(--quiet)]">
        Saved · {savedValue}
      </div>
    </div>
  );
}

export function GitAppPageMainContent({
  activeLogTab,
  baseDomain,
  deployment,
  deploymentHref,
  deploymentStatusLabel,
  deploymentStatusVariant,
  deployments,
  onCloseAction,
  onDeleteAction,
  onFetchAction,
  onLogTabChangeAction,
  onRefreshAction,
  onRecreateAction,
  onSaveSettingsAction,
  onStartAction,
  onStopAction,
  publicDomainLabel,
}: GitAppPageMainContentProps) {
  const [activeTab, setActiveTab] = useState<ManagerTab>('overview');
  const [appName, setAppName] = useState(deployment.appName);
  const [branchValue, setBranchValue] = useState(deployment.branch ?? '');
  const [commitSha, setCommitSha] = useState(deployment.commitSha ?? '');
  const [envRows, setEnvRows] = useState<EnvVariableDraft[]>(() =>
    buildEnvVariableDrafts(deployment.envVariables)
  );
  const [exposureMode, setExposureMode] = useState<ExposureMode>(deployment.exposureMode ?? 'http');
  const [hostPort, setHostPort] = useState(String(deployment.hostPort ?? ''));
  const [isSourceLoading, setIsSourceLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [port, setPort] = useState(String(deployment.port));
  const [sourceData, setSourceData] = useState<DeploymentSourcePayload | null>(null);
  const [sourceDataDeploymentId, setSourceDataDeploymentId] = useState<string | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [subdomain, setSubdomain] = useState(deployment.subdomain);
  const deferredBranch = useDeferredValue(branchValue);

  // Tracks whether source details have started loading. The first request runs
  // after hydration so the route render stays fast, then branch changes can
  // re-use the same background source fetch.
  const sourceRequestedRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchSourceData = useCallback(
    (branch: string) => {
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const searchParams = new URLSearchParams();

      if (branch.trim().length > 0) {
        searchParams.set('branch', branch.trim());
      }

      const requestUrl = `/api/deployments/${deployment.id}/source${searchParams.size ? `?${searchParams.toString()}` : ''}`;

      async function run() {
        setIsSourceLoading(true);
        setSourceError(null);

        try {
          const response = await fetch(requestUrl, {
            signal: controller.signal,
          });
          const payload = (await response.json()) as DeploymentSourcePayload | { error?: string };

          if (!response.ok) {
            const errorMessage =
              typeof payload === 'object' &&
              payload !== null &&
              'error' in payload &&
              typeof payload.error === 'string'
                ? payload.error
                : 'Unable to load repository source details.';

            throw new Error(errorMessage);
          }

          setSourceData(payload as DeploymentSourcePayload);
          setSourceDataDeploymentId(deployment.id);
        } catch (error) {
          if (controller.signal.aborted) {
            return;
          }

          setSourceData(null);
          setSourceDataDeploymentId(null);
          setSourceError(
            error instanceof Error ? error.message : 'Unable to load repository source details.'
          );
        } finally {
          if (!controller.signal.aborted) {
            setIsSourceLoading(false);
          }
        }
      }

      void run();
    },
    [deployment.id]
  );

  const requestSourceData = useCallback(
    (branch: string) => {
      sourceRequestedRef.current = true;
      fetchSourceData(branch);
    },
    [fetchSourceData]
  );

  // Clean up any in-flight request when the panel unmounts.
  useEffect(() => {
    return () => {
      sourceRequestedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  // Re-fetch when the selected branch changes — but only after the first
  // load has already been requested.
  useEffect(() => {
    if (!sourceRequestedRef.current) {
      return;
    }

    fetchSourceData(deferredBranch);
  }, [deferredBranch, deployment.updatedAt, fetchSourceData]);

  // Start loading source metadata after the page paints. This keeps navigation
  // quick while still filling in the current commit in the background.
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      if (sourceRequestedRef.current) {
        return;
      }

      requestSourceData(deployment.branch ?? '');
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [deployment.branch, deployment.id, requestSourceData]);

  const activeSourceData = sourceDataDeploymentId === deployment.id ? sourceData : null;
  const repositoryDescriptor = activeSourceData?.repository
    ? {
        fullName: activeSourceData.repository.fullName,
        url: activeSourceData.repository.url,
      }
    : getRepositoryDescriptor(deployment.repositoryUrl);
  const activeCommit = activeSourceData?.currentCommit;
  const currentEnvPayload = deployment.envVariables ?? '';
  const envPayload = serializeEnvVariableDrafts(envRows);
  const branchBrowserError = sourceError ?? activeSourceData?.browserError ?? null;
  const isBusy = pendingAction !== null;
  const normalizedCurrentEnvPayload = useMemo(
    () => serializeEnvVariableDrafts(buildEnvVariableDrafts(currentEnvPayload)),
    [currentEnvPayload]
  );

  const branchOptions = useMemo(() => {
    const seen = new Set<string>();

    return [branchValue.trim(), deployment.branch ?? '', ...(activeSourceData?.branches ?? [])]
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
            ? 'Current saved branch'
            : branch === activeSourceData?.currentBranch
              ? 'Currently checked out'
              : undefined,
        label: branch,
        value: branch,
      }));
  }, [branchValue, deployment.branch, activeSourceData]);

  const commitOptions = useMemo(() => {
    const seen = new Set<string>(['']);
    const options = [
      {
        label: 'Latest on selected branch',
        value: '',
      },
    ];

    if (commitSha.trim().length > 0 && !seen.has(commitSha.trim())) {
      seen.add(commitSha.trim());
      options.push({
        label: commitSha.trim().slice(0, 7),
        value: commitSha.trim(),
      });
    }

    for (const commit of activeSourceData?.commits ?? []) {
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
  }, [commitSha, activeSourceData]);

  const hasAppNameChange = appName.trim() !== deployment.appName;
  const hasBranchChange = branchValue.trim() !== (deployment.branch ?? '');
  const hasCommitChange = commitSha.trim() !== (deployment.commitSha ?? '');
  const hasEnvChange = envPayload !== normalizedCurrentEnvPayload;
  const hasExposureModeChange = exposureMode !== (deployment.exposureMode ?? 'http');
  const hasHostPortChange = hostPort.trim() !== String(deployment.hostPort ?? '');
  const hasPortChange = port.trim() !== String(deployment.port);
  const hasSubdomainChange = subdomain.trim() !== deployment.subdomain;
  const changeCount = [
    hasAppNameChange,
    hasBranchChange,
    hasCommitChange,
    hasEnvChange,
    hasExposureModeChange,
    hasHostPortChange,
    hasPortChange,
    hasSubdomainChange,
  ].filter(Boolean).length;

  async function runPendingAction(
    action: Exclude<PendingAction, 'save' | null>,
    task: () => Promise<void>
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
      toast.error('Change at least one setting before saving.');
      return;
    }
    const formData = new FormData();

    formData.set('deploymentId', deployment.id);
    formData.set('appName', appName.trim());
    formData.set('branch', branchValue.trim());
    formData.set('commitSha', commitSha.trim());
    formData.set('envVariables', envPayload);
    formData.set('exposureMode', exposureMode);
    if (hostPort.trim()) {
      formData.set('hostPort', hostPort.trim());
    }
    formData.set('port', port.trim());
    formData.set('subdomain', subdomain.trim());

    setPendingAction('save');

    try {
      await onSaveSettingsAction(formData);
    } finally {
      setPendingAction(null);
    }
  }

  function handleBranchSelect(value: string) {
    setBranchValue(value);
    setCommitSha('');
  }

  function handleBranchComboboxOpen(open: boolean) {
    if (!open || (sourceRequestedRef.current && !sourceError)) {
      return;
    }

    requestSourceData(branchValue);
  }

  function handleCommitSelect(value: string) {
    setCommitSha(value);
  }

  function resetEnvRows() {
    setEnvRows(buildEnvVariableDrafts(deployment.envVariables));
  }

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onCloseAction();
      }
    }

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onCloseAction]);

  const envVariableCount = envRows.filter((row) => row.enabled && row.key.trim()).length;
  const stateSummary =
    deployment.status === 'running'
      ? 'Healthy'
      : deployment.status === 'deploying'
        ? 'Building image'
        : deployment.status === 'failed'
          ? 'Needs attention'
          : 'Stopped';
  const managerTabs: Array<{ label: string; value: ManagerTab }> = [
    { label: 'Overview', value: 'overview' },
    { label: 'Settings', value: 'settings' },
    { label: 'Variables', value: 'variables' },
    { label: 'Logs', value: 'logs' },
  ];

  return (
    <>
      <button
        aria-label="Close app manager"
        className="fixed inset-0 z-50 cursor-default bg-[rgb(26_26_29_/_0.2)]"
        onClick={onCloseAction}
        type="button"
      />
      <aside
        aria-labelledby="app-manager-title"
        aria-modal="true"
        className="fixed inset-y-0 right-0 z-[60] flex w-[min(540px,calc(100vw-24px))] flex-col border-l border-[var(--hairline)] bg-white shadow-[-20px_0_60px_rgb(16_24_40_/_0.12)] max-[640px]:w-screen max-[640px]:border-l-0"
        role="dialog"
      >
        <header className="flex min-h-[58px] items-center justify-between gap-3 border-b border-[var(--hairline)] px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid size-[30px] shrink-0 place-items-center rounded-[7px] border border-orange-200 bg-[var(--orange-soft)] text-[var(--orange)]">
              <Package aria-hidden="true" className="size-4" />
            </span>
            <div className="min-w-0">
              <h2
                className="truncate text-[14px] font-semibold tracking-[-0.015em]"
                id="app-manager-title"
              >
                {deployment.appName}
              </h2>
              <p className="mt-0.5 truncate font-mono text-[10px] text-[var(--quiet)]">
                {repositoryDescriptor.fullName} · {deployment.branch ?? 'default'}
              </p>
            </div>
          </div>
          <Button
            aria-label="Close app manager"
            autoFocus
            className="size-7"
            onClick={onCloseAction}
            size="icon"
            type="button"
            variant="ghost"
          >
            <X aria-hidden="true" className="size-4" />
          </Button>
        </header>

        <div
          aria-label="Application management"
          className="flex min-h-[39px] shrink-0 gap-4 overflow-x-auto border-b border-[var(--hairline)] px-4"
          role="tablist"
        >
          {managerTabs.map((tab) => (
            <button
              aria-selected={activeTab === tab.value}
              className={cn(
                'relative shrink-0 px-0 text-[11px] font-semibold transition-colors after:absolute after:inset-x-0 after:bottom-[-1px] after:h-0.5',
                activeTab === tab.value
                  ? 'text-foreground after:bg-[var(--orange)]'
                  : 'text-[var(--quiet)] after:bg-transparent hover:text-foreground'
              )}
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              role="tab"
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--canvas)] p-4 max-[640px]:p-3">
          {activeTab === 'overview' ? (
            <div className="space-y-5">
              <section className="rounded-[10px] border border-[var(--hairline)] bg-white p-3.5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <span className="font-mono text-[10px] font-semibold tracking-[0.08em] text-[var(--quiet)] uppercase">
                      Current deployment
                    </span>
                    <h3 className="mt-1 text-lg font-semibold tracking-[-0.035em]">
                      {stateSummary}
                    </h3>
                  </div>
                  <Badge className="rounded-[6px] shadow-none" variant={deploymentStatusVariant}>
                    {deploymentStatusLabel}
                  </Badge>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3 font-mono text-[10px] text-[var(--quiet)]">
                  <span>{deployment.id}</span>
                  <span>{new Date(deployment.updatedAt).toLocaleString()}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {deploymentHref ? (
                    <Button asChild className="shadow-none" size="xs" variant="secondary">
                      <a href={deploymentHref} rel="noreferrer" target="_blank">
                        <ExternalLink aria-hidden="true" className="size-3.5" />
                        Open route
                      </a>
                    </Button>
                  ) : null}
                  <Button
                    disabled={isBusy}
                    onClick={() => void runPendingAction('recreate', onRecreateAction)}
                    size="xs"
                    type="button"
                    variant="secondary"
                  >
                    {pendingAction === 'recreate' ? (
                      <LoaderCircle className="size-3.5 animate-spin" />
                    ) : (
                      <RotateCcw className="size-3.5" />
                    )}
                    Redeploy
                  </Button>
                  <Button
                    disabled={isBusy}
                    onClick={() => void runPendingAction('fetch', onFetchAction)}
                    size="xs"
                    type="button"
                    variant="secondary"
                  >
                    {pendingAction === 'fetch' ? (
                      <LoaderCircle className="size-3.5 animate-spin" />
                    ) : (
                      <RefreshCcw className="size-3.5" />
                    )}
                    Pull source
                  </Button>
                  <Button
                    onClick={() => setActiveTab('logs')}
                    size="xs"
                    type="button"
                    variant="secondary"
                  >
                    View logs
                  </Button>
                  {deployment.status === 'stopped' ? (
                    <Button
                      disabled={isBusy}
                      onClick={() => void runPendingAction('start', onStartAction)}
                      size="xs"
                      type="button"
                    >
                      {pendingAction === 'start' ? (
                        <LoaderCircle className="size-3.5 animate-spin" />
                      ) : (
                        <Play className="size-3.5" />
                      )}
                      Start
                    </Button>
                  ) : (
                    <Button
                      disabled={isBusy}
                      onClick={() => void runPendingAction('stop', onStopAction)}
                      size="xs"
                      type="button"
                      variant="danger"
                    >
                      {pendingAction === 'stop' ? (
                        <LoaderCircle className="size-3.5 animate-spin" />
                      ) : (
                        <Square className="size-3.5" />
                      )}
                      Stop
                    </Button>
                  )}
                </div>
              </section>

              <section>
                <h3 className="mb-2 text-[12px] font-semibold">Deployment path</h3>
                <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-1.5 max-[640px]:grid-cols-1">
                  <div className="min-w-0 rounded-[8px] border border-[var(--hairline)] bg-white p-2.5">
                    <span className="grid size-4 place-items-center rounded-full bg-[var(--green-soft)] font-mono text-[10px] font-bold text-[var(--green)]">
                      ✓
                    </span>
                    <strong className="mt-1.5 block text-[11px]">Source</strong>
                    <span className="mt-0.5 block truncate font-mono text-[10px] text-[var(--quiet)]">
                      {deployment.branch ?? 'default'}@
                      {(activeCommit?.shortSha ?? deployment.commitSha?.slice(0, 7)) || 'head'}
                    </span>
                  </div>
                  <ArrowRight
                    aria-hidden="true"
                    className="size-3 text-[var(--quiet)] max-[640px]:mx-auto max-[640px]:rotate-90"
                  />
                  <div className="min-w-0 rounded-[8px] border border-[var(--hairline)] bg-white p-2.5">
                    <span
                      className={cn(
                        'grid size-4 place-items-center rounded-full font-mono text-[10px] font-bold',
                        deployment.status === 'deploying'
                          ? 'bg-[var(--blue-soft)] text-[var(--blue)]'
                          : 'bg-[var(--green-soft)] text-[var(--green)]'
                      )}
                    >
                      {deployment.status === 'deploying' ? '↻' : '✓'}
                    </span>
                    <strong className="mt-1.5 block text-[11px]">Build</strong>
                    <span className="mt-0.5 block truncate font-mono text-[10px] text-[var(--quiet)]">
                      {deployment.status === 'deploying'
                        ? 'in progress'
                        : (deployment.composeMode ?? 'auto') + ' ready'}
                    </span>
                  </div>
                  <ArrowRight
                    aria-hidden="true"
                    className="size-3 text-[var(--quiet)] max-[640px]:mx-auto max-[640px]:rotate-90"
                  />
                  <div className="min-w-0 rounded-[8px] border border-[var(--hairline)] bg-white p-2.5">
                    <span
                      className={cn(
                        'grid size-4 place-items-center rounded-full font-mono text-[10px] font-bold',
                        deploymentHref
                          ? 'bg-[var(--green-soft)] text-[var(--green)]'
                          : 'bg-[var(--surface-subtle)] text-[var(--quiet)]'
                      )}
                    >
                      {deploymentHref ? '✓' : '·'}
                    </span>
                    <strong className="mt-1.5 block text-[11px]">Route</strong>
                    <span className="mt-0.5 block truncate font-mono text-[10px] text-[var(--quiet)]">
                      {publicDomainLabel || 'not routed'}
                    </span>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="mb-2 text-[12px] font-semibold">Runtime</h3>
                <div className="border-t border-[var(--hairline)]">
                  {[
                    ['Build mode', deployment.composeMode ?? 'auto'],
                    ['Internal port', ':' + deployment.port],
                    [
                      'Exposure',
                      deployment.exposureMode === 'internal'
                        ? 'internal only'
                        : deployment.exposureMode === 'http'
                          ? 'reverse proxy'
                          : deployment.exposureMode + ' · :' + (deployment.hostPort ?? '—'),
                    ],
                    [
                      'Environment',
                      envVariableCount + ' variable' + (envVariableCount === 1 ? '' : 's'),
                    ],
                  ].map(([label, value]) => (
                    <div
                      className="flex min-h-[39px] items-center justify-between gap-4 border-b border-[var(--hairline)]"
                      key={label}
                    >
                      <span className="text-[11px] text-muted-foreground">{label}</span>
                      <span className="max-w-[65%] truncate font-mono text-[10px] text-foreground">
                        {value}
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <h3 className="mb-2 text-[12px] font-semibold">Recent activity</h3>
                <div className="border-t border-[var(--hairline)]">
                  <div className="grid grid-cols-[3.5rem_0.5rem_1fr] gap-2 border-b border-[var(--hairline)] py-2.5">
                    <span className="font-mono text-[10px] text-[var(--quiet)]">Latest</span>
                    <span className="mt-0.5 size-1.5 rounded-full bg-[var(--green)]" />
                    <span className="min-w-0">
                      <strong className="block text-[11px]">Deployment state updated</strong>
                      <span className="mt-0.5 block break-words font-mono text-[10px] leading-4 text-[var(--quiet)]">
                        {deployment.lastOperationSummary ??
                          deploymentStatusLabel + ' · no operation summary'}
                      </span>
                    </span>
                  </div>
                  <div className="grid grid-cols-[3.5rem_0.5rem_1fr] gap-2 border-b border-[var(--hairline)] py-2.5">
                    <span className="font-mono text-[10px] text-[var(--quiet)]">Output</span>
                    <span className="mt-0.5 size-1.5 rounded-full bg-[var(--orange)]" />
                    <details className="group min-w-0">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[11px] font-semibold marker:content-none">
                        <span>Last recorded output</span>
                        <span className="font-mono text-[10px] font-normal text-[var(--quiet)] group-open:hidden">
                          Show
                        </span>
                        <span className="hidden font-mono text-[10px] font-normal text-[var(--quiet)] group-open:inline">
                          Hide
                        </span>
                      </summary>
                      <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-[7px] bg-[var(--surface-subtle)] p-2 font-mono text-[10px] leading-4 break-words text-[var(--quiet)]">
                        {deployment.lastOutput ?? 'No output recorded for this deployment.'}
                      </pre>
                    </details>
                  </div>
                </div>
              </section>
            </div>
          ) : null}

          {activeTab === 'settings' ? (
            <div className="space-y-3">
              <section className="rounded-[10px] border border-[var(--hairline)] bg-white p-3.5">
                <span className="font-mono text-[10px] font-semibold tracking-[0.08em] text-[var(--quiet)] uppercase">
                  Application settings
                </span>
                <h3 className="mt-1 text-lg font-semibold tracking-[-0.035em]">Runtime & route</h3>
                <p className="mt-1 font-mono text-[10px] text-[var(--quiet)]">
                  Saved value → next deployment value
                </p>
              </section>

              {branchBrowserError ? (
                <div className="rounded-[8px] border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] leading-4 text-amber-900">
                  {branchBrowserError}
                </div>
              ) : null}

              <ConfigurationField
                changed={hasAppNameChange}
                description="Deployment and container project name."
                label="Application name"
                onReset={() => setAppName(deployment.appName)}
                savedValue={deployment.appName}
              >
                <Input
                  className="h-9 rounded-[7px] text-[12px] shadow-none"
                  onChange={(event) => setAppName(event.target.value)}
                  value={appName}
                />
              </ConfigurationField>

              <ConfigurationField
                changed={hasSubdomainChange}
                description="Public hostname used by the reverse proxy."
                label="Public URL"
                onReset={() => setSubdomain(deployment.subdomain)}
                savedValue={publicDomainLabel || 'Not routed'}
              >
                <InputGroup className="h-9 rounded-[7px] shadow-none">
                  <InputGroupInput
                    className="px-2.5 text-[12px]"
                    onChange={(event) => setSubdomain(event.target.value)}
                    value={subdomain}
                  />
                  {baseDomain ? (
                    <InputGroupSuffix className="font-mono text-[11px] leading-8">
                      .{baseDomain}
                    </InputGroupSuffix>
                  ) : null}
                </InputGroup>
              </ConfigurationField>

              <div className="grid grid-cols-2 gap-3 max-[640px]:grid-cols-1">
                <ConfigurationField
                  changed={hasExposureModeChange}
                  description="How traffic reaches the container."
                  label="Exposure"
                  onReset={() => setExposureMode(deployment.exposureMode ?? 'http')}
                  savedValue={deployment.exposureMode ?? 'http'}
                >
                  <select
                    className="h-9 w-full rounded-[7px] border border-input bg-white px-2.5 text-[12px]"
                    onChange={(event) => setExposureMode(event.target.value as ExposureMode)}
                    value={exposureMode}
                  >
                    <option value="http">HTTP — reverse proxy</option>
                    <option value="tcp">TCP passthrough</option>
                    <option value="host">Host port</option>
                    <option value="internal">Internal only</option>
                  </select>
                </ConfigurationField>
                <ConfigurationField
                  changed={hasPortChange}
                  description="Port used inside the container."
                  label="Internal port"
                  onReset={() => setPort(String(deployment.port))}
                  savedValue={':' + deployment.port}
                >
                  <Input
                    className="h-9 rounded-[7px] font-mono text-[12px] shadow-none"
                    inputMode="numeric"
                    onChange={(event) => setPort(event.target.value)}
                    value={port}
                  />
                </ConfigurationField>
              </div>

              {exposureMode === 'tcp' || exposureMode === 'host' ? (
                <ConfigurationField
                  changed={hasHostPortChange}
                  description="Port published directly on the host."
                  label="Host port"
                  onReset={() => setHostPort(String(deployment.hostPort ?? ''))}
                  savedValue={deployment.hostPort ? ':' + deployment.hostPort : 'Not configured'}
                >
                  <Input
                    className="h-9 rounded-[7px] font-mono text-[12px] shadow-none"
                    inputMode="numeric"
                    onChange={(event) => setHostPort(event.target.value)}
                    placeholder="e.g. 27017"
                    value={hostPort}
                  />
                </ConfigurationField>
              ) : null}

              <section className="rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-subtle)] p-3">
                <div className="mb-3 flex items-start gap-2.5">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-[6px] border border-orange-200 bg-[var(--orange-soft)] text-[var(--orange)]">
                    <GitBranch aria-hidden="true" className="size-3.5" />
                  </span>
                  <div>
                    <h3 className="text-[13px] font-semibold">Source and revision</h3>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      Follow a branch head or pin one commit.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 max-[640px]:grid-cols-1">
                  <ConfigurationField
                    changed={hasBranchChange}
                    description="Git branch used for future pulls."
                    label="Branch"
                    onReset={() => {
                      setBranchValue(deployment.branch ?? '');
                      setCommitSha(deployment.commitSha ?? '');
                    }}
                    savedValue={deployment.branch ?? 'Default branch'}
                  >
                    <Combobox
                      ariaLabel="Saved branch"
                      buttonClassName="h-9 rounded-[7px] border border-border bg-white px-2.5 text-[12px] shadow-none"
                      disabled={isSourceLoading}
                      emptyText={branchBrowserError ?? 'No branches available'}
                      onOpenChangeAction={handleBranchComboboxOpen}
                      onValueChangeAction={handleBranchSelect}
                      options={branchOptions}
                      placeholder={isSourceLoading ? 'Loading branches…' : 'Select branch'}
                      searchPlaceholder="Search branches"
                      value={branchValue}
                    />
                  </ConfigurationField>
                  <ConfigurationField
                    changed={hasCommitChange}
                    description="Leave latest selected to track the branch."
                    label="Revision"
                    onReset={() => setCommitSha(deployment.commitSha ?? '')}
                    savedValue={
                      activeCommit?.shortSha ??
                      deployment.commitSha?.slice(0, 7) ??
                      'Latest branch head'
                    }
                  >
                    <Combobox
                      ariaLabel="Saved commit"
                      buttonClassName="h-9 rounded-[7px] border border-border bg-white px-2.5 text-[12px] shadow-none"
                      disabled={isSourceLoading || Boolean(branchBrowserError)}
                      emptyText={branchBrowserError ?? 'No commits available'}
                      onValueChangeAction={handleCommitSelect}
                      options={commitOptions}
                      placeholder={isSourceLoading ? 'Loading commits…' : 'Select commit'}
                      searchPlaceholder="Search commits"
                      value={commitSha}
                    />
                  </ConfigurationField>
                </div>
              </section>

              <section className="flex items-center justify-between gap-4 rounded-[8px] border border-red-200 bg-red-50/60 p-3">
                <div>
                  <h3 className="text-[12px] font-semibold">Remove deployment</h3>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Stop the runtime and remove this app record.
                  </p>
                </div>
                <Button
                  disabled={isBusy}
                  onClick={() => void runPendingAction('delete', onDeleteAction)}
                  size="xs"
                  type="button"
                  variant="danger"
                >
                  {pendingAction === 'delete' ? (
                    <LoaderCircle className="size-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="size-3.5" />
                  )}
                  Remove
                </Button>
              </section>
            </div>
          ) : null}

          {activeTab === 'variables' ? (
            <div className="space-y-3">
              <section className="rounded-[10px] border border-[var(--hairline)] bg-white p-3.5">
                <span className="font-mono text-[10px] font-semibold tracking-[0.08em] text-[var(--quiet)] uppercase">
                  Environment
                </span>
                <h3 className="mt-1 text-lg font-semibold tracking-[-0.035em]">
                  {envVariableCount} variable{envVariableCount === 1 ? '' : 's'}
                </h3>
                <p className="mt-1 font-mono text-[10px] text-[var(--quiet)]">
                  Included during the next build
                </p>
              </section>

              <section className="overflow-hidden rounded-[8px] border border-[var(--hairline)] bg-white">
                <header className="flex items-center justify-between gap-3 border-b border-[var(--hairline)] bg-[var(--surface-subtle)] px-3 py-2.5">
                  <div>
                    <h3 className="text-[12px] font-semibold">Variables</h3>
                    <p className="mt-0.5 font-mono text-[10px] text-[var(--quiet)]">
                      Enable only rows that should be saved
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    <Button
                      onClick={() =>
                        setEnvRows((current) => [...current, createEnvVariableDraft('', '', true)])
                      }
                      size="xs"
                      type="button"
                      variant="secondary"
                    >
                      <Plus className="size-3.5" />
                      Add
                    </Button>
                    <Button onClick={resetEnvRows} size="xs" type="button" variant="ghost">
                      Reset
                    </Button>
                  </div>
                </header>

                {envRows.length ? (
                  <div className="divide-y divide-[var(--hairline)]">
                    {envRows.map((row) => (
                      <div
                        className="grid grid-cols-[auto_minmax(0,0.75fr)_minmax(0,1.25fr)_auto] items-center gap-2 px-3 py-2.5 max-[640px]:grid-cols-[auto_minmax(0,1fr)_auto]"
                        key={row.id}
                      >
                        <label className="inline-flex items-center gap-1.5 text-[11px]">
                          <input
                            checked={row.enabled}
                            onChange={(event) =>
                              setEnvRows((current) =>
                                current.map((candidate) =>
                                  candidate.id === row.id
                                    ? { ...candidate, enabled: event.target.checked }
                                    : candidate
                                )
                              )
                            }
                            type="checkbox"
                          />
                          <span className="max-[640px]:sr-only">Use</span>
                        </label>
                        <Input
                          aria-label="Environment key"
                          className="h-9 rounded-[7px] font-mono text-[11px] shadow-none"
                          onChange={(event) =>
                            setEnvRows((current) =>
                              current.map((candidate) =>
                                candidate.id === row.id
                                  ? { ...candidate, key: event.target.value }
                                  : candidate
                              )
                            )
                          }
                          placeholder="KEY"
                          value={row.key}
                        />
                        <Input
                          aria-label="Environment value"
                          className="h-9 rounded-[7px] font-mono text-[11px] shadow-none max-[640px]:col-start-2"
                          onChange={(event) =>
                            setEnvRows((current) =>
                              current.map((candidate) =>
                                candidate.id === row.id
                                  ? { ...candidate, value: event.target.value }
                                  : candidate
                              )
                            )
                          }
                          placeholder="value"
                          value={row.value}
                        />
                        <Button
                          aria-label={'Remove ' + (row.key || 'environment variable')}
                          className="size-7 max-[640px]:row-span-2 max-[640px]:row-start-1"
                          onClick={() =>
                            setEnvRows((current) =>
                              current.filter((candidate) => candidate.id !== row.id)
                            )
                          }
                          size="icon"
                          type="button"
                          variant="ghost"
                        >
                          <X className="size-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="px-3 py-8 text-center font-mono text-[11px] text-[var(--quiet)]">
                    No environment variables configured.
                  </div>
                )}
              </section>
            </div>
          ) : null}

          {activeTab === 'logs' ? (
            <section className="min-h-[32rem] overflow-hidden rounded-[10px] border border-[var(--hairline)] bg-white">
              <GitLogPanel
                currentView="detail"
                deploymentId={deployment.id}
                deployments={deployments}
                initialActiveLogTab={activeLogTab}
                onLogTabChangeAction={onLogTabChangeAction}
                showHeader
              />
            </section>
          ) : null}
        </div>

        {activeTab === 'settings' || activeTab === 'variables' ? (
          <footer className="flex min-h-[54px] shrink-0 items-center justify-between gap-3 border-t border-[var(--hairline)] bg-white px-4 py-3">
            <span className="font-mono text-[10px] text-[var(--quiet)]">
              {changeCount
                ? changeCount + ' pending change' + (changeCount === 1 ? '' : 's')
                : 'All changes saved'}
            </span>
            <div className="flex gap-1.5">
              <Button
                aria-label="Refresh deployment data"
                disabled={isBusy}
                onClick={onRefreshAction}
                size="icon"
                type="button"
                variant="ghost"
              >
                <RefreshCcw className="size-3.5" />
              </Button>
              <Button
                disabled={isBusy || changeCount === 0}
                onClick={() => void handleSaveSettings()}
                size="xs"
                type="button"
              >
                {pendingAction === 'save' ? (
                  <LoaderCircle className="size-3.5 animate-spin" />
                ) : (
                  <Save className="size-3.5" />
                )}
                Save and recreate
              </Button>
            </div>
          </footer>
        ) : null}
      </aside>
    </>
  );
}
