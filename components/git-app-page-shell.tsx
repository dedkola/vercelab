'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { toast } from 'sonner';

import {
  fetchDeploymentFromGitAction,
  redeployDeploymentAction,
  removeDeploymentAction,
  stopDeploymentAction,
  updateDeploymentAction,
  type DeploymentActionResult,
} from '@/app/actions';
import type { LogTab } from '@/components/git-log-panel';
import {
  GitAppPageLeftSidebar,
  type AppStatusFilter,
} from '@/components/workspace/git-app-page-left-sidebar';
import { GitAppPageMainContent } from '@/components/workspace/git-app-page-main-content';
import { useWorkspaceChrome } from '@/components/workspace/workspace-chrome-shell';
import {
  readStoredContainerAliases,
  subscribeToStoredContainerAliases,
} from '@/lib/container-preferences';
import type { GitHubRepository } from '@/lib/github';
import type { DeploymentSummary } from '@/lib/persistence';
import type { MetricsSnapshot } from '@/lib/system-metrics';
import type { ExposureMode } from '@/lib/validation';
import type { DraftAppState } from '@/lib/workspace-types';

export type GitAppPageShellProps = {
  baseDomain?: string;
  initialDeployments?: DeploymentSummary[];
};

type BranchState = {
  branchesByRepositoryId: Record<string, string[]>;
  error: string | null;
  isLoading: boolean;
};

const EMPTY_DEPLOYMENTS: DeploymentSummary[] = [];

const RELATIVE_TIME_FORMATTER = new Intl.RelativeTimeFormat('en', {
  numeric: 'auto',
});

function toSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function formatRelativeTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
  }

  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const units = [
    ['year', 60 * 60 * 24 * 365],
    ['month', 60 * 60 * 24 * 30],
    ['week', 60 * 60 * 24 * 7],
    ['day', 60 * 60 * 24],
    ['hour', 60 * 60],
    ['minute', 60],
  ] as const;

  for (const [unit, divisor] of units) {
    if (Math.abs(seconds) >= divisor || unit === 'minute') {
      return RELATIVE_TIME_FORMATTER.format(Math.round(seconds / divisor), unit);
    }
  }

  return RELATIVE_TIME_FORMATTER.format(seconds, 'second');
}

function buildRepositoryOptions(repositories: GitHubRepository[]) {
  return repositories.map((repository) => ({
    value: String(repository.id),
    label: repository.fullName,
    description:
      repository.description ??
      `${repository.visibility} repo • updated ${formatRelativeTime(repository.updatedAt)}`,
  }));
}

function buildBranchOptions(branches: string[], defaultBranch: string) {
  return branches.map((branch) => ({
    value: branch,
    label: branch,
    description: branch === defaultBranch ? 'Default branch' : undefined,
  }));
}

function createEmptyDraftAppState(): DraftAppState {
  return {
    appName: '',
    branch: '',
    exposureMode: 'http',
    hostPort: '',
    port: '3000',
    repositoryUrl: '',
    subdomain: '',
  };
}

function createDraftFromRepository(repository: GitHubRepository): DraftAppState {
  const slug = toSlug(repository.name);

  return {
    appName: repository.name,
    branch: repository.defaultBranch,
    exposureMode: 'http',
    hostPort: '',
    port: '3000',
    repositoryUrl: repository.cloneUrl,
    subdomain: slug || repository.name.toLowerCase(),
  };
}

function normalizeGitHubBranches(branches: string[], defaultBranch: string) {
  const normalizedBranches = Array.from(
    new Set(branches.map((branch) => branch.trim()).filter((branch) => branch.length > 0))
  );

  if (!defaultBranch.trim()) {
    return normalizedBranches;
  }

  const defaultBranchIndex = normalizedBranches.indexOf(defaultBranch);

  if (defaultBranchIndex === 0) {
    return normalizedBranches;
  }

  if (defaultBranchIndex > 0) {
    normalizedBranches.splice(defaultBranchIndex, 1);
  }

  return [defaultBranch, ...normalizedBranches];
}

function getPreferredBranch(
  currentBranch: string,
  defaultBranch: string,
  availableBranches: string[]
) {
  if (currentBranch && availableBranches.includes(currentBranch)) {
    return currentBranch;
  }

  if (defaultBranch && availableBranches.includes(defaultBranch)) {
    return defaultBranch;
  }

  return availableBranches[0] ?? currentBranch;
}

function getDeploymentStatusBadgeVariant(
  status: DeploymentSummary['status']
): 'success' | 'warning' | 'default' {
  switch (status) {
    case 'running':
      return 'success';
    case 'failed':
    case 'deploying':
      return 'warning';
    default:
      return 'default';
  }
}

function formatDeploymentStatus(status: DeploymentSummary['status']) {
  switch (status) {
    case 'deploying':
      return 'Deploying';
    case 'running':
      return 'Running';
    case 'failed':
      return 'Failed';
    case 'stopped':
      return 'Stopped';
    case 'removing':
      return 'Removing';
  }
}

function formatDeploymentDomain(
  deployment: Pick<DeploymentSummary, 'subdomain'>,
  baseDomain?: string
) {
  if (!baseDomain) {
    return deployment.subdomain;
  }

  return `${deployment.subdomain}.${baseDomain}`;
}

function formatDeploymentHref(
  deployment: Pick<DeploymentSummary, 'subdomain'>,
  baseDomain?: string
) {
  return `https://${formatDeploymentDomain(deployment, baseDomain)}`;
}

function resolveDeploymentDisplayName(
  deployment: DeploymentSummary,
  snapshot: MetricsSnapshot | null,
  aliases: Record<string, string>
) {
  const matchingRuntimes = (snapshot?.containers.all ?? []).filter(
    (runtime) => runtime.projectName === deployment.projectName
  );

  if (!matchingRuntimes.length) {
    return deployment.appName;
  }

  const deploymentServiceName = deployment.serviceName?.trim() ?? '';
  const preferredRuntime = deploymentServiceName
    ? (matchingRuntimes.find(
        (runtime) => (runtime.serviceName?.trim() ?? '') === deploymentServiceName
      ) ?? null)
    : matchingRuntimes.length === 1
      ? matchingRuntimes[0]
      : null;

  if (!preferredRuntime) {
    return deployment.appName;
  }

  const alias = aliases[preferredRuntime.id]?.trim();

  return alias || deployment.appName;
}

export function GitAppPageShell({ baseDomain, initialDeployments }: GitAppPageShellProps) {
  const router = useRouter();
  const { loadRepositories, repositoryState, sidebarSnapshot } = useWorkspaceChrome();
  const deploymentSeed = initialDeployments ?? EMPTY_DEPLOYMENTS;
  const [deployments, setDeployments] = useState<DeploymentSummary[]>(deploymentSeed);
  const [selectedAppId, setSelectedAppId] = useState(deploymentSeed[0]?.id ?? '');
  const [appSearchQuery, setAppSearchQuery] = useState('');
  const [appStatusFilter, setAppStatusFilter] = useState<AppStatusFilter>('all');
  const [appLogTab, setAppLogTab] = useState<LogTab>('build');
  const [isAppManagerOpen, setIsAppManagerOpen] = useState(false);
  const [isCreateAppExpanded, setIsCreateAppExpanded] = useState(false);
  const [isCreateAppPending, setIsCreateAppPending] = useState(false);
  const [draftApp, setDraftApp] = useState<DraftAppState>(createEmptyDraftAppState);
  const [branchState, setBranchState] = useState<BranchState>({
    branchesByRepositoryId: {},
    error: null,
    isLoading: false,
  });
  const [aliases, setAliases] = useState<Record<string, string>>({});
  const branchCacheRef = useRef<Record<string, string[]>>({});
  const branchRequestIdRef = useRef(0);

  useEffect(() => {
    setAliases(readStoredContainerAliases());

    return subscribeToStoredContainerAliases(setAliases);
  }, []);

  const repositoryOptions = useMemo(
    () => buildRepositoryOptions(repositoryState.repositories),
    [repositoryState.repositories]
  );
  const selectedRepository = useMemo(
    () =>
      repositoryState.repositories.find(
        (repository) => repository.cloneUrl === draftApp.repositoryUrl
      ) ?? null,
    [draftApp.repositoryUrl, repositoryState.repositories]
  );
  const branchOptions = useMemo(
    () =>
      selectedRepository
        ? buildBranchOptions(
            branchState.branchesByRepositoryId[String(selectedRepository.id)] ?? [],
            selectedRepository.defaultBranch
          )
        : [],
    [branchState.branchesByRepositoryId, selectedRepository]
  );
  const deploymentDisplayNames = useMemo(
    () =>
      new Map(
        deployments.map((deployment) => [
          deployment.id,
          resolveDeploymentDisplayName(deployment, sidebarSnapshot, aliases),
        ])
      ),
    [aliases, deployments, sidebarSnapshot]
  );
  const filteredDeployments = useMemo(() => {
    const normalizedQuery = appSearchQuery.trim().toLowerCase();

    return deployments.filter((deployment) => {
      const matchesStatus =
        appStatusFilter === 'all' ||
        (appStatusFilter === 'running' && deployment.status === 'running') ||
        (appStatusFilter === 'attention' && deployment.status !== 'running');
      const matchesQuery =
        !normalizedQuery ||
        [
          deploymentDisplayNames.get(deployment.id) ?? deployment.appName,
          deployment.appName,
          deployment.repositoryName,
          deployment.repositoryUrl,
          deployment.subdomain,
          deployment.serviceName ?? '',
        ]
          .join(' ')
          .toLowerCase()
          .includes(normalizedQuery);

      return matchesStatus && matchesQuery;
    });
  }, [appSearchQuery, appStatusFilter, deploymentDisplayNames, deployments]);
  const selectedDeployment =
    filteredDeployments.find((deployment) => deployment.id === selectedAppId) ??
    deployments.find((deployment) => deployment.id === selectedAppId) ??
    deployments[0] ??
    null;
  const selectedDeploymentHref = selectedDeployment
    ? formatDeploymentHref(selectedDeployment, baseDomain)
    : null;
  const selectedRepositoryValue = selectedRepository ? String(selectedRepository.id) : '';
  const selectedRepositorySummary = selectedRepository
    ? `${selectedRepository.visibility} repo • default ${selectedRepository.defaultBranch} • updated ${formatRelativeTime(selectedRepository.updatedAt)}`
    : null;
  const branchHelperText = selectedRepository
    ? branchState.isLoading
      ? 'Loading branches from GitHub.'
      : branchOptions.length
        ? `${branchOptions.length} branches available for selection.`
        : branchState.error
          ? null
          : 'No branches returned for this repository.'
    : null;

  useEffect(() => {
    setDeployments(deploymentSeed);
  }, [deploymentSeed]);

  useEffect(() => {
    if (!deployments.length) {
      setSelectedAppId('');
      setIsAppManagerOpen(false);
      return;
    }

    if (!deployments.some((deployment) => deployment.id === selectedAppId)) {
      setSelectedAppId(deployments[0]?.id ?? '');
    }
  }, [deployments, selectedAppId]);

  useEffect(() => {
    if (repositoryState.hasLoaded || repositoryState.isLoading) {
      return;
    }

    void loadRepositories();
  }, [loadRepositories, repositoryState.hasLoaded, repositoryState.isLoading]);

  const loadBranches = useCallback(async (repository: GitHubRepository) => {
    const repositoryId = String(repository.id);
    const requestId = branchRequestIdRef.current + 1;

    branchRequestIdRef.current = requestId;

    const cachedBranches = branchCacheRef.current[repositoryId];

    if (cachedBranches) {
      setBranchState((current) =>
        current.error === null && !current.isLoading
          ? current
          : {
              ...current,
              error: null,
              isLoading: false,
            }
      );
      setDraftApp((current) => {
        if (current.repositoryUrl !== repository.cloneUrl) {
          return current;
        }

        const nextBranch = getPreferredBranch(
          current.branch,
          repository.defaultBranch,
          cachedBranches
        );

        return current.branch === nextBranch
          ? current
          : {
              ...current,
              branch: nextBranch,
            };
      });
      return;
    }

    setBranchState((current) =>
      current.isLoading && current.error === null
        ? current
        : {
            ...current,
            error: null,
            isLoading: true,
          }
    );

    try {
      const response = await fetch(
        `/api/github/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}/branches`,
        {
          cache: 'no-store',
        }
      );
      const payload = (await response.json()) as {
        branches?: string[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Unable to load branches from GitHub.');
      }

      if (branchRequestIdRef.current !== requestId) {
        return;
      }

      const branches = normalizeGitHubBranches(payload.branches ?? [], repository.defaultBranch);

      setBranchState((current) => {
        const branchesByRepositoryId = {
          ...current.branchesByRepositoryId,
          [repositoryId]: branches,
        };

        branchCacheRef.current = branchesByRepositoryId;

        return {
          branchesByRepositoryId,
          error: null,
          isLoading: false,
        };
      });
      setDraftApp((current) => {
        if (current.repositoryUrl !== repository.cloneUrl) {
          return current;
        }

        const nextBranch = getPreferredBranch(current.branch, repository.defaultBranch, branches);

        return current.branch === nextBranch
          ? current
          : {
              ...current,
              branch: nextBranch,
            };
      });
    } catch (error) {
      if (branchRequestIdRef.current !== requestId) {
        return;
      }

      setBranchState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : 'Unable to load branches from GitHub.',
        isLoading: false,
      }));
    }
  }, []);

  useEffect(() => {
    return () => {
      branchRequestIdRef.current += 1;
    };
  }, []);

  useEffect(() => {
    if (!selectedRepository) {
      branchRequestIdRef.current += 1;
      setBranchState((current) =>
        current.error === null && !current.isLoading
          ? current
          : {
              ...current,
              error: null,
              isLoading: false,
            }
      );
      return;
    }

    void loadBranches(selectedRepository);
  }, [loadBranches, selectedRepository]);

  function handleDeploymentActionResult(result: DeploymentActionResult) {
    if (result.status === 'success') {
      toast.success(result.message);
      router.refresh();
      return;
    }

    toast.error(result.message);
  }

  async function handleCreateApp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const repositoryUrl = draftApp.repositoryUrl.trim();
    const appName = draftApp.appName.trim();
    const subdomain = draftApp.subdomain.trim();
    const port = draftApp.port.trim();
    const needsHostPort = draftApp.exposureMode === 'tcp' || draftApp.exposureMode === 'host';

    if (!repositoryUrl || !appName || !port) {
      toast.error('Select a repository and complete the app name and port.');
      return;
    }

    if (draftApp.exposureMode === 'http' && !subdomain) {
      toast.error('Enter a subdomain for HTTP deployments.');
      return;
    }

    if (needsHostPort && !draftApp.hostPort.trim()) {
      toast.error('Enter a host port for TCP and Host exposure modes.');
      return;
    }

    setIsCreateAppPending(true);

    try {
      const formData = new FormData();
      formData.set('repositoryUrl', repositoryUrl);
      formData.set('appName', appName);
      formData.set('subdomain', subdomain);
      formData.set('port', port);
      formData.set('exposureMode', draftApp.exposureMode);

      if (draftApp.hostPort.trim()) {
        formData.set('hostPort', draftApp.hostPort.trim());
      }

      if (draftApp.branch.trim()) {
        formData.set('branch', draftApp.branch.trim());
      }

      const response = await fetch('/api/deployments', {
        method: 'POST',
        body: formData,
      });
      const payload = (await response.json()) as {
        deploymentId?: string;
        domain?: string;
        exposureMode?: ExposureMode;
        hostPort?: number;
        error?: string;
      };

      if (!response.ok || !payload.deploymentId) {
        throw new Error(payload.error ?? 'Unable to create deployment.');
      }

      let toastMessage = 'Deployment created.';
      if (payload.exposureMode === 'http' && payload.domain) {
        toastMessage = `Deployment queued for https://${payload.domain}`;
      } else if (payload.exposureMode === 'tcp' && payload.hostPort) {
        toastMessage = `TCP service queued on port ${payload.hostPort}`;
      } else if (payload.exposureMode === 'host' && payload.hostPort) {
        toastMessage = `Deployment queued with host port ${payload.hostPort}`;
      }
      toast.success(toastMessage);
      setSelectedAppId(payload.deploymentId);
      setDraftApp(createEmptyDraftAppState());
      setIsCreateAppExpanded(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to create deployment.');
    } finally {
      setIsCreateAppPending(false);
    }
  }

  async function handleSaveApp(formData: FormData) {
    if (!selectedDeployment) {
      return;
    }

    const result = await updateDeploymentAction(formData);
    handleDeploymentActionResult(result);
  }

  async function runDeploymentAction(
    action: (formData: FormData) => Promise<DeploymentActionResult>
  ) {
    if (!selectedDeployment) {
      return;
    }

    const formData = new FormData();
    formData.set('deploymentId', selectedDeployment.id);

    const result = await action(formData);
    handleDeploymentActionResult(result);
  }

  function handleToggleCreateAppPanel() {
    const next = !isCreateAppExpanded;

    setIsCreateAppExpanded(next);

    if (next && !repositoryState.hasLoaded && !repositoryState.isLoading) {
      void loadRepositories();
    }
  }

  function handleSelectApp(id: string) {
    setSelectedAppId(id);
    setIsAppManagerOpen(true);
  }

  function handleRepositorySelect(value: string) {
    const repository = repositoryState.repositories.find((item) => String(item.id) === value);

    if (!repository) {
      return;
    }

    setDraftApp(createDraftFromRepository(repository));
  }

  function handleDraftAppChange(field: keyof DraftAppState, value: string) {
    setDraftApp((current) => ({
      ...current,
      [field]: value,
    }));
  }

  const liveAppsCount = filteredDeployments.filter(
    (deployment) => deployment.status === 'running'
  ).length;
  const gitSidebarAppItems = filteredDeployments.map((deployment) => ({
    appName: deploymentDisplayNames.get(deployment.id) ?? deployment.appName,
    branchLabel: deployment.branch ?? 'default',
    composeMode: deployment.composeMode ?? 'auto',
    domain: formatDeploymentDomain(deployment, baseDomain),
    exposureMode: deployment.exposureMode ?? 'http',
    hostPort: deployment.hostPort ?? null,
    id: deployment.id,
    isActive: isAppManagerOpen && deployment.id === selectedAppId,
    port: deployment.port,
    relativeUpdatedAt: formatRelativeTime(deployment.updatedAt),
    repositoryName: deployment.repositoryName,
    revisionLabel: deployment.commitSha?.slice(0, 7) ?? 'head',
    statusLabel: formatDeploymentStatus(deployment.status),
    statusVariant: getDeploymentStatusBadgeVariant(deployment.status),
  }));
  const selectedDeploymentSettingsKey = selectedDeployment
    ? JSON.stringify([
        selectedDeployment.id,
        selectedDeployment.appName,
        selectedDeployment.branch ?? '',
        selectedDeployment.commitSha ?? '',
        selectedDeployment.envVariables ?? '',
        selectedDeployment.port,
        selectedDeployment.subdomain,
      ])
    : '';

  return (
    <div className="relative flex min-w-0 flex-1 overflow-hidden bg-[var(--canvas)]">
      <main className="min-w-0 flex-1 overflow-auto">
        <GitAppPageLeftSidebar
          appItems={gitSidebarAppItems}
          appSearchQuery={appSearchQuery}
          baseDomain={baseDomain}
          branchError={branchState.error}
          branchHelperText={branchHelperText}
          branchOptions={branchOptions}
          draftApp={draftApp}
          isBranchLoading={branchState.isLoading}
          isCreateAppExpanded={isCreateAppExpanded}
          isCreateAppPending={isCreateAppPending}
          liveAppsCount={liveAppsCount}
          onAppSearchQueryChangeAction={setAppSearchQuery}
          onCreateAppAction={handleCreateApp}
          onDraftChangeAction={handleDraftAppChange}
          onRepositorySelectAction={handleRepositorySelect}
          onSelectAppAction={handleSelectApp}
          onStatusFilterChangeAction={setAppStatusFilter}
          onToggleCreateAppAction={handleToggleCreateAppPanel}
          repositoryOptions={repositoryOptions}
          repositoryState={repositoryState}
          selectedRepositorySummary={selectedRepositorySummary}
          selectedRepositoryValue={selectedRepositoryValue}
          statusFilter={appStatusFilter}
          totalAppsCount={deployments.length}
        />
      </main>

      {isAppManagerOpen && selectedDeployment ? (
        <GitAppPageMainContent
          activeLogTab={appLogTab}
          baseDomain={baseDomain}
          deployment={selectedDeployment}
          deploymentHref={selectedDeploymentHref}
          deploymentStatusLabel={formatDeploymentStatus(selectedDeployment.status)}
          deploymentStatusVariant={getDeploymentStatusBadgeVariant(selectedDeployment.status)}
          deployments={deployments}
          key={selectedDeploymentSettingsKey}
          onCloseAction={() => setIsAppManagerOpen(false)}
          onDeleteAction={() => runDeploymentAction(removeDeploymentAction)}
          onFetchAction={() => runDeploymentAction(fetchDeploymentFromGitAction)}
          onLogTabChangeAction={setAppLogTab}
          onRefreshAction={() => router.refresh()}
          onRecreateAction={() => runDeploymentAction(redeployDeploymentAction)}
          onSaveSettingsAction={handleSaveApp}
          onStartAction={() => runDeploymentAction(redeployDeploymentAction)}
          onStopAction={() => runDeploymentAction(stopDeploymentAction)}
          publicDomainLabel={formatDeploymentDomain(selectedDeployment, baseDomain)}
        />
      ) : null}
    </div>
  );
}
