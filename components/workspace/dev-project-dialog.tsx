'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowsClockwise, Copy, SpinnerGap, Trash, WarningCircle } from '@phosphor-icons/react';
import { toast } from 'sonner';

import { WorkspaceDialog } from '@/components/workspace/workspace-dialog';
import { WorkspaceNotice } from '@/components/workspace/workspace-notice';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { normalizeDevAppSlug } from '@/lib/dev-preview';
import type { DevProject, DevProjectDetail } from '@/lib/dev-types';
import { parseGitHubRepositoryReference, type GitHubRepository } from '@/lib/github';

type DevProjectDialogProps = {
  baseDomain: string;
  mode: 'create' | 'edit';
  onCloseAction: () => void;
  onDeletedAction: () => void;
  onSavedAction: (projectId: string) => void;
  previewProtocol: 'http' | 'https';
  project?: DevProject | null;
};

type BranchState = {
  error: string | null;
  isLoading: boolean;
  options: string[];
};

type RepositoryState = {
  error: string | null;
  isLoading: boolean;
  repositories: GitHubRepository[];
  tokenConfigured: boolean;
};

function buildPreviewExample(protocol: 'http' | 'https', slug: string, baseDomain: string) {
  return `${protocol}://${slug || 'preview'}-a1b2c3d.${baseDomain}`;
}

export function DevProjectDialog({
  baseDomain,
  mode,
  onCloseAction,
  onDeletedAction,
  onSavedAction,
  previewProtocol,
  project,
}: DevProjectDialogProps) {
  const [repositoryState, setRepositoryState] = useState<RepositoryState>({
    error: null,
    isLoading: mode === 'create',
    repositories: [],
    tokenConfigured: false,
  });
  const [branchState, setBranchState] = useState<BranchState>({
    error: null,
    isLoading: false,
    options: [],
  });
  const [repositoryUrl, setRepositoryUrl] = useState(project?.repositoryUrl ?? '');
  const [branch, setBranch] = useState(project?.branch ?? 'main');
  const [appName, setAppName] = useState(project?.appName ?? '');
  const [appSlug, setAppSlug] = useState(project?.appSlug ?? '');
  const [dockerfilePath, setDockerfilePath] = useState(project?.dockerfilePath ?? 'Dockerfile');
  const [buildContext, setBuildContext] = useState(project?.buildContext ?? '.');
  const [port, setPort] = useState(String(project?.port ?? 3000));
  const [envVariables, setEnvVariables] = useState(project?.envVariables ?? '');
  const [buildArgs, setBuildArgs] = useState(project?.buildArgs ?? '');
  const [autoDeploy, setAutoDeploy] = useState(project?.autoDeploy ?? true);
  const [retentionLimit, setRetentionLimit] = useState(String(project?.retentionLimit ?? 0));
  const [deployLatest, setDeployLatest] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [webhookSecret, setWebhookSecret] = useState<string | null>(null);
  const [isRotatingSecret, setIsRotatingSecret] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(mode === 'edit');
  const [isDeletePending, setIsDeletePending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [origin, setOrigin] = useState('');
  const branchRequestIdRef = useRef(0);

  const selectedRepository = useMemo(
    () =>
      repositoryState.repositories.find((repository) => repository.cloneUrl === repositoryUrl) ??
      null,
    [repositoryState.repositories, repositoryUrl]
  );
  const repositoryOptions = useMemo(
    () =>
      repositoryState.repositories.map((repository) => ({
        description:
          repository.description ??
          `${repository.visibility} repo · default ${repository.defaultBranch}`,
        label: repository.fullName,
        value: String(repository.id),
      })),
    [repositoryState.repositories]
  );
  const branchOptions = useMemo(() => {
    const options = [...branchState.options];

    if (branch && !options.includes(branch)) {
      options.unshift(branch);
    }

    return options.map((option) => ({
      description:
        option === (selectedRepository?.defaultBranch ?? 'main') ? 'Default branch' : undefined,
      label: option,
      value: option,
    }));
  }, [branch, branchState.options, selectedRepository?.defaultBranch]);
  const previewExample = buildPreviewExample(previewProtocol, appSlug, baseDomain);
  const selectedRepositoryValue = selectedRepository ? String(selectedRepository.id) : '';
  const publishModeLabel = autoDeploy ? 'Automatic' : 'Manual';
  const projectId = project?.id ?? null;

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    return () => {
      branchRequestIdRef.current += 1;
    };
  }, []);

  useEffect(() => {
    if (mode !== 'create') {
      return;
    }

    let cancelled = false;

    const loadRepositories = async () => {
      try {
        const response = await fetch('/api/github/repos', { cache: 'no-store' });
        const payload = (await response.json()) as {
          error?: string;
          repositories?: GitHubRepository[];
          tokenConfigured?: boolean;
        };

        if (!response.ok) {
          throw new Error(payload.error ?? 'Unable to load repositories from GitHub.');
        }

        if (!cancelled) {
          setRepositoryState({
            error: null,
            isLoading: false,
            repositories: payload.repositories ?? [],
            tokenConfigured: Boolean(payload.tokenConfigured),
          });
        }
      } catch (error) {
        if (!cancelled) {
          setRepositoryState((current) => ({
            ...current,
            error: error instanceof Error ? error.message : 'Unable to load repositories.',
            isLoading: false,
          }));
        }
      }
    };

    void loadRepositories();

    return () => {
      cancelled = true;
    };
  }, [mode]);

  useEffect(() => {
    if (mode !== 'edit' || !projectId) {
      return;
    }

    let cancelled = false;

    const loadDetail = async () => {
      try {
        const response = await fetch(`/api/dev/projects/${projectId}`, { cache: 'no-store' });
        const payload = (await response.json()) as DevProjectDetail | { error?: string };

        if (!response.ok) {
          throw new Error(
            'error' in payload && payload.error ? payload.error : 'Unable to load project settings.'
          );
        }

        if (!cancelled) {
          setWebhookSecret((payload as DevProjectDetail).webhookSecret);
        }
      } catch (error) {
        if (!cancelled) {
          setFormError(error instanceof Error ? error.message : 'Unable to load project settings.');
        }
      } finally {
        if (!cancelled) {
          setIsDetailLoading(false);
        }
      }
    };

    void loadDetail();

    return () => {
      cancelled = true;
    };
  }, [mode, projectId]);

  const loadBranches = useCallback(async (url: string) => {
    const reference = parseGitHubRepositoryReference(url);
    const requestId = branchRequestIdRef.current + 1;
    branchRequestIdRef.current = requestId;

    if (!reference) {
      setBranchState({ error: null, isLoading: false, options: [] });
      return;
    }

    setBranchState((current) => ({
      ...current,
      error: null,
      isLoading: true,
    }));

    try {
      const response = await fetch(
        `/api/github/repos/${encodeURIComponent(reference.owner)}/${encodeURIComponent(reference.name)}/branches`,
        { cache: 'no-store' }
      );
      const payload = (await response.json()) as { branches?: string[]; error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Unable to load branches from GitHub.');
      }

      if (branchRequestIdRef.current !== requestId) {
        return;
      }

      setBranchState({
        error: null,
        isLoading: false,
        options: payload.branches ?? [],
      });
    } catch (error) {
      if (branchRequestIdRef.current !== requestId) {
        return;
      }

      setBranchState({
        error: error instanceof Error ? error.message : 'Unable to load branches.',
        isLoading: false,
        options: [],
      });
    }
  }, []);

  useEffect(() => {
    if (!repositoryUrl) {
      return;
    }

    void loadBranches(repositoryUrl);
  }, [loadBranches, repositoryUrl]);

  function handleRepositorySelect(value: string) {
    const repository = repositoryState.repositories.find((item) => String(item.id) === value);

    if (!repository) {
      return;
    }

    setRepositoryUrl(repository.cloneUrl);
    setAppName(repository.name);
    setAppSlug(normalizeDevAppSlug(repository.name));
    setBranch(repository.defaultBranch || 'main');
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (!repositoryUrl.trim() || !appName.trim() || !appSlug.trim()) {
      setFormError('Repository, app name, and preview prefix are required.');
      return;
    }

    if (!branch.trim()) {
      setFormError('Choose a branch to monitor.');
      return;
    }

    const parsedPort = Number.parseInt(port, 10);
    const parsedRetention = Number.parseInt(retentionLimit, 10);

    if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
      setFormError('Port must be between 1 and 65535.');
      return;
    }

    if (!Number.isInteger(parsedRetention) || parsedRetention < 0 || parsedRetention > 1000) {
      setFormError('Retention must be between 0 and 1000. Use 0 to keep every preview.');
      return;
    }

    setIsSaving(true);

    try {
      const body =
        mode === 'create'
          ? {
              appName: appName.trim(),
              appSlug: appSlug.trim(),
              autoDeploy,
              branch: branch.trim(),
              buildArgs,
              buildContext: buildContext.trim(),
              deployLatest,
              dockerfilePath: dockerfilePath.trim(),
              envVariables,
              port: parsedPort,
              repositoryUrl: repositoryUrl.trim(),
              retentionLimit: parsedRetention,
            }
          : {
              appName: appName.trim(),
              appSlug: appSlug.trim(),
              autoDeploy,
              branch: branch.trim(),
              buildArgs,
              buildContext: buildContext.trim(),
              dockerfilePath: dockerfilePath.trim(),
              envVariables,
              port: parsedPort,
              retentionLimit: parsedRetention,
            };

      const response = await fetch(
        mode === 'create' ? '/api/dev/projects' : `/api/dev/projects/${project?.id}`,
        {
          body: JSON.stringify(body),
          headers: {
            'Content-Type': 'application/json',
          },
          method: mode === 'create' ? 'POST' : 'PATCH',
        }
      );
      const payload = (await response.json()) as {
        error?: string;
        initialDeploymentError?: string | null;
        project?: DevProject;
        webhookSecret?: string;
      } & Partial<DevProject>;

      if (!response.ok) {
        throw new Error(payload.error ?? 'Unable to save Dev project.');
      }

      const savedProjectId = payload.project?.id ?? payload.id ?? project?.id;

      if (!savedProjectId) {
        throw new Error('Dev project was saved but its id was missing.');
      }

      if (payload.webhookSecret) {
        setWebhookSecret(payload.webhookSecret);
      }

      if (payload.initialDeploymentError) {
        toast.warning(payload.initialDeploymentError);
      } else {
        toast.success(mode === 'create' ? 'Repository connected.' : 'Preview settings saved.');
      }

      onSavedAction(savedProjectId);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Unable to save Dev project.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRotateSecret() {
    if (!project) {
      return;
    }

    setIsRotatingSecret(true);

    try {
      const response = await fetch(`/api/dev/projects/${project.id}`, {
        body: JSON.stringify({ rotateWebhookSecret: true }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'PATCH',
      });
      const payload = (await response.json()) as DevProjectDetail | { error?: string };

      if (!response.ok) {
        throw new Error(
          'error' in payload && payload.error
            ? payload.error
            : 'Unable to rotate the webhook secret.'
        );
      }

      setWebhookSecret((payload as DevProjectDetail).webhookSecret);
      toast.success('Webhook secret rotated. Update the GitHub webhook to match.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to rotate the webhook secret.');
    } finally {
      setIsRotatingSecret(false);
    }
  }

  async function handleDelete() {
    if (!project) {
      return;
    }

    setIsDeletePending(true);

    try {
      const response = await fetch(`/api/dev/projects/${project.id}`, {
        method: 'DELETE',
      });
      const payload = (await response.json()) as { error?: string; warnings?: string[] };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Unable to delete the Dev project.');
      }

      if (payload.warnings?.length) {
        toast.warning(`Project removed with ${payload.warnings.length} cleanup warning(s).`);
      } else {
        toast.success('Dev project and previews removed.');
      }

      onDeletedAction();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to delete the Dev project.');
    } finally {
      setIsDeletePending(false);
      setConfirmDelete(false);
    }
  }

  async function copyToClipboard(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied.`);
    } catch {
      toast.error('Unable to copy to the clipboard.');
    }
  }

  const webhookUrl = project ? `${origin}/api/dev/webhooks/github/${project.id}` : '';
  const isSubmitDisabled =
    isSaving ||
    repositoryState.isLoading ||
    !repositoryUrl.trim() ||
    !appName.trim() ||
    !appSlug.trim() ||
    !branch.trim() ||
    !port.trim();

  return (
    <WorkspaceDialog
      className="max-w-[820px]"
      onCloseAction={onCloseAction}
      title={mode === 'create' ? 'Connect GitHub repository' : 'Preview settings'}
    >
      <form className="flex min-h-0 flex-col" onSubmit={handleSubmit}>
        <header className="flex items-start justify-between gap-4 border-b border-[var(--hairline)] px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-[16px] font-semibold tracking-tight">
                {mode === 'create' ? 'Connect a repository' : project?.appName}
              </h2>
              <Badge variant={autoDeploy ? 'success' : 'outline'}>{publishModeLabel}</Badge>
            </div>
            <p className="mt-1 text-[11px] leading-5 text-[var(--quiet)]">
              {mode === 'create'
                ? 'Vercelab will build every commit on the selected branch into its own Docker container.'
                : 'Build settings apply to future commits. Existing preview containers stay untouched.'}
            </p>
          </div>
          <button
            aria-label="Close project dialog"
            className="text-[var(--quiet)] hover:text-foreground"
            onClick={onCloseAction}
            type="button"
          >
            ×
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {repositoryState.error || formError ? (
            <div className="mb-4">
              <WorkspaceNotice>{formError ?? repositoryState.error}</WorkspaceNotice>
            </div>
          ) : null}

          {mode === 'create' &&
          !repositoryState.tokenConfigured &&
          !repositoryState.isLoading &&
          !repositoryState.error ? (
            <div className="mb-4">
              <WorkspaceNotice>
                Add a GitHub token in the Vercelab settings popover before connecting a repository.
              </WorkspaceNotice>
            </div>
          ) : null}

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--quiet)]">
                Repository
              </h3>
              <span className="font-mono text-[10px] text-[var(--quiet)]">
                {publishModeLabel} previews
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {mode === 'create' ? (
                <div>
                  <Label htmlFor="dev-project-repository">Repository</Label>
                  <Combobox
                    ariaLabel="Repository"
                    buttonClassName="h-9 rounded-[7px] bg-white text-[12px] shadow-none"
                    disabled={repositoryState.isLoading}
                    emptyText={repositoryState.error ?? 'No repositories found'}
                    onValueChangeAction={handleRepositorySelect}
                    options={repositoryOptions}
                    placeholder={
                      repositoryState.isLoading ? 'Loading repositories…' : 'Select repository'
                    }
                    searchPlaceholder="Search repositories"
                    value={selectedRepositoryValue}
                  />
                </div>
              ) : (
                <div>
                  <Label>Repository</Label>
                  <div className="mt-1.5 rounded-[7px] border border-border bg-[var(--surface-subtle)] px-3 py-2 font-mono text-[11px]">
                    {project?.repositoryOwner}/{project?.repositoryName}
                  </div>
                </div>
              )}

              <div>
                <Label htmlFor="dev-project-branch">Branch</Label>
                <Combobox
                  ariaLabel="Branch"
                  buttonClassName="h-9 rounded-[7px] bg-white text-[12px] shadow-none"
                  disabled={!repositoryUrl || branchState.isLoading}
                  emptyText={
                    !repositoryUrl
                      ? 'Select a repository first'
                      : (branchState.error ?? 'No branches found')
                  }
                  onValueChangeAction={setBranch}
                  options={branchOptions}
                  placeholder={branchState.isLoading ? 'Loading branches…' : 'Select branch'}
                  searchPlaceholder="Search branches"
                  value={branch}
                />
              </div>

              <div>
                <Label htmlFor="dev-project-app-name">App name</Label>
                <Input
                  id="dev-project-app-name"
                  onChange={(event) => setAppName(event.target.value)}
                  placeholder="BladeVault"
                  value={appName}
                />
              </div>

              <div>
                <Label htmlFor="dev-project-prefix">Preview URL prefix</Label>
                <Input
                  id="dev-project-prefix"
                  onChange={(event) => setAppSlug(event.target.value.toLowerCase())}
                  placeholder="blade"
                  value={appSlug}
                />
                <p className="mt-1.5 truncate font-mono text-[10px] text-[var(--quiet)]">
                  {previewExample}
                </p>
              </div>
            </div>

            {branchState.error ? (
              <div className="mt-3">
                <WorkspaceNotice>{branchState.error}</WorkspaceNotice>
              </div>
            ) : null}
          </section>

          <section className="mt-5 space-y-3 border-t border-[var(--hairline)] pt-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--quiet)]">
                Docker build
              </h3>
              <span className="font-mono text-[10px] text-[var(--quiet)]">
                {dockerfilePath}:{port}
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="dev-project-dockerfile">Dockerfile path</Label>
                <Input
                  id="dev-project-dockerfile"
                  onChange={(event) => setDockerfilePath(event.target.value)}
                  placeholder="Dockerfile"
                  value={dockerfilePath}
                />
              </div>
              <div>
                <Label htmlFor="dev-project-context">Build context</Label>
                <Input
                  id="dev-project-context"
                  onChange={(event) => setBuildContext(event.target.value)}
                  placeholder="."
                  value={buildContext}
                />
              </div>
              <div>
                <Label htmlFor="dev-project-port">Container port</Label>
                <Input
                  id="dev-project-port"
                  inputMode="numeric"
                  onChange={(event) => setPort(event.target.value)}
                  value={port}
                />
              </div>
              <div>
                <Label htmlFor="dev-project-retention">Retention limit</Label>
                <Input
                  id="dev-project-retention"
                  inputMode="numeric"
                  onChange={(event) => setRetentionLimit(event.target.value)}
                  value={retentionLimit}
                />
                <p className="mt-1.5 text-[10px] text-[var(--quiet)]">
                  0 keeps every preview. A positive number removes the oldest settled previews.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="dev-project-env">Runtime environment</Label>
                <textarea
                  className="mt-1.5 min-h-24 w-full rounded-[7px] border border-border bg-white px-3 py-2 font-mono text-[11px] leading-5 outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  id="dev-project-env"
                  onChange={(event) => setEnvVariables(event.target.value)}
                  placeholder={'NODE_ENV=production\nDATABASE_URL=...'}
                  spellCheck={false}
                  value={envVariables}
                />
              </div>
              <div>
                <Label htmlFor="dev-project-build-args">Build arguments</Label>
                <textarea
                  className="mt-1.5 min-h-24 w-full rounded-[7px] border border-border bg-white px-3 py-2 font-mono text-[11px] leading-5 outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  id="dev-project-build-args"
                  onChange={(event) => setBuildArgs(event.target.value)}
                  placeholder={'NEXT_PUBLIC_API_URL=...'}
                  spellCheck={false}
                  value={buildArgs}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-5 rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-subtle)] px-3 py-2.5">
              <label className="flex items-center gap-2 text-[11px] font-medium">
                <input
                  checked={autoDeploy}
                  className="size-3.5 accent-[var(--blue)]"
                  onChange={(event) => setAutoDeploy(event.target.checked)}
                  type="checkbox"
                />
                Auto-deploy new commits
              </label>

              {mode === 'create' ? (
                <label className="flex items-center gap-2 text-[11px] font-medium">
                  <input
                    checked={deployLatest}
                    className="size-3.5 accent-[var(--blue)]"
                    onChange={(event) => setDeployLatest(event.target.checked)}
                    type="checkbox"
                  />
                  Build current HEAD now
                </label>
              ) : null}
            </div>
          </section>

          {mode === 'edit' && project ? (
            <section className="mt-5 border-t border-[var(--hairline)] pt-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--quiet)]">
                  GitHub webhook
                </h3>
                <Badge variant="info">Optional</Badge>
              </div>
              <p className="mt-1.5 text-[10px] leading-5 text-[var(--quiet)]">
                Polling already detects new commits. Add this webhook in GitHub for instant
                deployments when this control plane is reachable from the internet.
              </p>

              {isDetailLoading ? (
                <div className="mt-3 inline-flex items-center gap-2 text-[11px] text-[var(--quiet)]">
                  <SpinnerGap aria-hidden="true" className="size-3.5 animate-spin" />
                  Loading webhook details…
                </div>
              ) : (
                <div className="mt-3 space-y-2">
                  <div>
                    <Label>Payload URL</Label>
                    <div className="mt-1.5 flex items-center gap-2">
                      <Input readOnly value={webhookUrl} />
                      <Button
                        onClick={() => void copyToClipboard(webhookUrl, 'Webhook URL')}
                        type="button"
                        variant="secondary"
                      >
                        <Copy aria-hidden="true" className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div>
                    <Label>Secret</Label>
                    <div className="mt-1.5 flex items-center gap-2">
                      <Input readOnly type="password" value={webhookSecret ?? ''} />
                      <Button
                        disabled={!webhookSecret}
                        onClick={() => void copyToClipboard(webhookSecret ?? '', 'Webhook secret')}
                        type="button"
                        variant="secondary"
                      >
                        <Copy aria-hidden="true" className="size-3.5" />
                      </Button>
                      <Button
                        disabled={isRotatingSecret}
                        onClick={handleRotateSecret}
                        type="button"
                        variant="secondary"
                      >
                        {isRotatingSecret ? (
                          <SpinnerGap aria-hidden="true" className="size-3.5 animate-spin" />
                        ) : (
                          <ArrowsClockwise aria-hidden="true" className="size-3.5" />
                        )}
                        Rotate
                      </Button>
                    </div>
                  </div>
                  <p className="text-[10px] leading-5 text-[var(--quiet)]">
                    Use the <span className="font-mono">push</span> event and content type{' '}
                    <span className="font-mono">application/json</span>. Rotating the secret
                    requires updating the GitHub webhook.
                  </p>
                </div>
              )}
            </section>
          ) : null}

          {mode === 'edit' && project ? (
            <section className="mt-5 border-t border-red-200 pt-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--red)]">
                  Danger zone
                </h3>
                <WarningCircle aria-hidden="true" className="size-4 text-[var(--red)]" />
              </div>
              <p className="mt-1.5 text-[10px] leading-5 text-[var(--quiet)]">
                Deleting this project removes every preview container, image, workspace, and log
                created for this repository and branch. Production deployments are not affected.
              </p>

              {confirmDelete ? (
                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[8px] border border-red-200 bg-[var(--red-soft)] px-3 py-2.5">
                  <span className="text-[11px] font-medium text-[var(--red)]">
                    Delete this project and all previews?
                  </span>
                  <Button
                    disabled={isDeletePending}
                    onClick={handleDelete}
                    type="button"
                    variant="danger"
                  >
                    {isDeletePending ? (
                      <SpinnerGap aria-hidden="true" className="size-3.5 animate-spin" />
                    ) : (
                      <Trash aria-hidden="true" className="size-3.5" />
                    )}
                    Yes, delete
                  </Button>
                  <Button onClick={() => setConfirmDelete(false)} type="button" variant="secondary">
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  className="mt-3"
                  onClick={() => setConfirmDelete(true)}
                  type="button"
                  variant="danger"
                >
                  <Trash aria-hidden="true" className="size-3.5" />
                  Delete project
                </Button>
              )}
            </section>
          ) : null}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--hairline)] bg-[var(--surface-subtle)] px-5 py-3">
          <span className="text-[10px] text-[var(--quiet)]">
            {mode === 'create'
              ? 'New previews use the configured base domain and Traefik.'
              : 'Saving does not rebuild existing previews.'}
          </span>
          <div className="flex items-center gap-2">
            <Button onClick={onCloseAction} type="button" variant="secondary">
              Cancel
            </Button>
            <Button
              className="border-[var(--blue)] bg-[var(--blue)] text-white shadow-none hover:bg-[#0d55bc]"
              disabled={isSubmitDisabled}
              type="submit"
            >
              {isSaving ? (
                <SpinnerGap aria-hidden="true" className="size-3.5 animate-spin" />
              ) : null}
              {mode === 'create'
                ? deployLatest
                  ? 'Connect and deploy'
                  : 'Connect repository'
                : 'Save settings'}
            </Button>
          </div>
        </footer>
      </form>
    </WorkspaceDialog>
  );
}
