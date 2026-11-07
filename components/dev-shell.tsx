'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GitBranch, RocketLaunch, SpinnerGap } from '@phosphor-icons/react';
import { toast } from 'sonner';

import { DevCommitPickerDialog } from '@/components/workspace/dev-commit-picker-dialog';
import { DevDeploymentDetail } from '@/components/workspace/dev-deployment-detail';
import { DevDeploymentsContent } from '@/components/workspace/dev-deployments-content';
import { DevProjectDialog } from '@/components/workspace/dev-project-dialog';
import { DevProjectSidebar } from '@/components/workspace/dev-project-sidebar';
import { WorkspaceDialog } from '@/components/workspace/workspace-dialog';
import { WorkspaceNotice } from '@/components/workspace/workspace-notice';
import { Button } from '@/components/ui/button';
import type { DevDeployment, DevProject, DevState } from '@/lib/dev-types';
import type { DevDeploymentAction } from '@/lib/dev-validation';

type DevShellProps = {
  initialState: DevState | null;
};

type ProjectAction = 'deploy' | 'sync';

const POLL_ACTIVE_MS = 3000;
const POLL_IDLE_MS = 15000;
const POLL_HIDDEN_MS = 60000;

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim().length > 0 ? error.message : fallback;
}

export function DevShell({ initialState }: DevShellProps) {
  const [state, setState] = useState<DevState | null>(initialState);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [stateError, setStateError] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    initialState?.projects[0]?.id ?? null
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingActionKey, setPendingActionKey] = useState<string | null>(null);
  const [isConnectOpen, setIsConnectOpen] = useState(false);
  const [settingsProjectId, setSettingsProjectId] = useState<string | null>(null);
  const [detailDeploymentId, setDetailDeploymentId] = useState<string | null>(null);
  const [commitPickerProjectId, setCommitPickerProjectId] = useState<string | null>(null);
  const [deleteDeployment, setDeleteDeployment] = useState<DevDeployment | null>(null);
  const [isDeletingDeployment, setIsDeletingDeployment] = useState(false);
  const pollInFlightRef = useRef(false);

  const refreshState = useCallback(async (showSpinner = false) => {
    if (showSpinner) {
      setIsRefreshing(true);
    }

    try {
      const response = await fetch('/api/dev/state', { cache: 'no-store' });
      const payload = (await response.json()) as DevState | { error?: string };

      if (!response.ok) {
        throw new Error(
          'error' in payload && payload.error ? payload.error : 'Unable to load Dev state.'
        );
      }

      setState(payload as DevState);
      setStateError(null);
    } catch (error) {
      setStateError(getErrorMessage(error, 'Unable to load Dev state.'));
    } finally {
      if (showSpinner) {
        setIsRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    void refreshState(false);
  }, [refreshState]);

  const projects = useMemo(() => state?.projects ?? [], [state]);
  const deployments = useMemo(() => state?.deployments ?? [], [state]);
  const containerStates = state?.containerStates ?? {};
  const hasActiveBuilds = deployments.some(
    (deployment) => deployment.status === 'queued' || deployment.status === 'building'
  );

  useEffect(() => {
    if (projects.length === 0) {
      if (selectedProjectId !== null) {
        setSelectedProjectId(null);
      }

      return;
    }

    if (!selectedProjectId || !projects.some((project) => project.id === selectedProjectId)) {
      setSelectedProjectId(projects[0]!.id);
    }
  }, [projects, selectedProjectId]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;

    const tick = async () => {
      if (!cancelled && !pollInFlightRef.current && document.visibilityState === 'visible') {
        pollInFlightRef.current = true;

        try {
          await refreshState(false);
        } finally {
          pollInFlightRef.current = false;
        }
      }

      if (!cancelled) {
        const delay =
          document.visibilityState === 'hidden'
            ? POLL_HIDDEN_MS
            : hasActiveBuilds
              ? POLL_ACTIVE_MS
              : POLL_IDLE_MS;

        timer = window.setTimeout(() => void tick(), delay);
      }
    };

    timer = window.setTimeout(() => void tick(), hasActiveBuilds ? POLL_ACTIVE_MS : 4000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refreshState(false);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);

      if (timer !== null) {
        window.clearTimeout(timer);
      }
    };
  }, [hasActiveBuilds, refreshState]);

  const selectedProject =
    projects.find((project) => project.id === selectedProjectId) ?? projects[0] ?? null;
  const selectedProjectDeployments = useMemo(
    () =>
      selectedProject
        ? deployments.filter((deployment) => deployment.projectId === selectedProject.id)
        : [],
    [deployments, selectedProject]
  );
  const settingsProject = projects.find((project) => project.id === settingsProjectId) ?? null;
  const commitPickerProject =
    projects.find((project) => project.id === commitPickerProjectId) ?? null;
  const detailDeployment =
    deployments.find((deployment) => deployment.id === detailDeploymentId) ?? null;
  const detailProject =
    projects.find((project) => project.id === detailDeployment?.projectId) ?? null;

  async function runProjectAction(project: DevProject, action: ProjectAction) {
    setPendingActionKey(`project:${action}`);

    try {
      const response = await fetch(
        `/api/dev/projects/${project.id}/${action === 'sync' ? 'sync' : 'deploy'}`,
        {
          body: action === 'deploy' ? JSON.stringify({}) : undefined,
          headers: action === 'deploy' ? { 'Content-Type': 'application/json' } : undefined,
          method: 'POST',
        }
      );
      const payload = (await response.json()) as {
        created?: boolean;
        deployment?: DevDeployment;
        enqueued?: number;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? `Unable to ${action} previews.`);
      }

      if (action === 'sync') {
        toast.success(
          payload.enqueued
            ? `Queued ${payload.enqueued} new preview build${payload.enqueued === 1 ? '' : 's'}.`
            : 'No new commits found.'
        );
      } else if (payload.created) {
        toast.success(
          payload.deployment
            ? `Queued preview for ${payload.deployment.shortSha}.`
            : 'Preview build queued.'
        );
      } else {
        toast.info('That commit already has a preview deployment.');
      }

      await refreshState(false);
    } catch (error) {
      toast.error(getErrorMessage(error, `Unable to ${action} previews.`));
    } finally {
      setPendingActionKey(null);
    }
  }

  async function deployCommit(projectId: string, commitSha: string) {
    const response = await fetch(`/api/dev/projects/${projectId}/deploy`, {
      body: JSON.stringify({ commitSha }),
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    });
    const payload = (await response.json()) as {
      created?: boolean;
      deployment?: DevDeployment;
      error?: string;
    };

    if (!response.ok) {
      throw new Error(payload.error ?? 'Unable to deploy that commit.');
    }

    toast.success(
      payload.created
        ? `Queued preview for ${payload.deployment?.shortSha ?? commitSha.slice(0, 7)}.`
        : 'That commit already has a preview deployment.'
    );
    await refreshState(false);
  }

  async function runDeploymentAction(action: DevDeploymentAction, deploymentId: string) {
    const deployment = deployments.find((item) => item.id === deploymentId);

    if (!deployment) {
      return;
    }

    if (action === 'delete') {
      if (deployment.status === 'queued' || deployment.status === 'building') {
        toast.error('Wait for the current build to finish before deleting this preview.');
        return;
      }

      setDeleteDeployment(deployment);
      return;
    }

    setPendingActionKey(`${deploymentId}:${action}`);

    try {
      const response = await fetch(`/api/dev/deployments/${deploymentId}/actions`, {
        body: JSON.stringify({ action }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Unable to run preview action.');
      }

      const messages: Record<Exclude<DevDeploymentAction, 'delete'>, string> = {
        restart: 'Preview restarted.',
        retry: 'Preview build queued again.',
        start: 'Preview started.',
        stop: 'Preview stopped.',
      };

      toast.success(messages[action]);
      await refreshState(false);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Unable to run preview action.'));
    } finally {
      setPendingActionKey(null);
    }
  }

  async function confirmDeleteDeployment() {
    if (!deleteDeployment) {
      return;
    }

    setIsDeletingDeployment(true);
    setPendingActionKey(`${deleteDeployment.id}:delete`);

    try {
      const response = await fetch(`/api/dev/deployments/${deleteDeployment.id}/actions`, {
        body: JSON.stringify({ action: 'delete' }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Unable to delete preview.');
      }

      toast.success(`Deleted preview ${deleteDeployment.shortSha}.`);

      if (detailDeploymentId === deleteDeployment.id) {
        setDetailDeploymentId(null);
      }

      setDeleteDeployment(null);
      await refreshState(false);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Unable to delete preview.'));
    } finally {
      setIsDeletingDeployment(false);
      setPendingActionKey(null);
    }
  }

  function handleProjectSaved(projectId: string) {
    setIsConnectOpen(false);
    setSettingsProjectId(null);
    setSelectedProjectId(projectId);
    void refreshState(false);
  }

  function handleProjectDeleted() {
    setSettingsProjectId(null);
    setSelectedProjectId(null);
    setDetailDeploymentId(null);
    void refreshState(false);
  }

  return (
    <div className="relative flex min-w-0 flex-1 overflow-hidden bg-[var(--canvas)] max-[960px]:flex-col">
      <DevProjectSidebar
        deployments={deployments}
        isRefreshing={isRefreshing}
        onConnectAction={() => setIsConnectOpen(true)}
        onSearchQueryChangeAction={setSearchQuery}
        onSelectProjectAction={setSelectedProjectId}
        projects={projects}
        searchQuery={searchQuery}
        selectedProjectId={selectedProject?.id ?? null}
      />

      <main className="min-w-0 flex-1 overflow-auto">
        {stateError ? (
          <div className="vercelab-page">
            <WorkspaceNotice>
              {stateError}{' '}
              <button
                className="font-medium underline underline-offset-2"
                onClick={() => void refreshState(true)}
                type="button"
              >
                Retry
              </button>
            </WorkspaceNotice>
          </div>
        ) : null}

        {!state && !stateError ? (
          <div className="flex min-h-[50dvh] items-center justify-center gap-2 text-[11px] text-[var(--quiet)]">
            <SpinnerGap aria-hidden="true" className="size-4 animate-spin" />
            Loading Dev workspace…
          </div>
        ) : null}

        {state && selectedProject ? (
          <DevDeploymentsContent
            baseDomain={state.baseDomain}
            containerStates={containerStates}
            deployments={selectedProjectDeployments}
            onActionAction={(action, deploymentId) =>
              void runDeploymentAction(action, deploymentId)
            }
            onDeployLatestAction={() => void runProjectAction(selectedProject, 'deploy')}
            onOpenCommitsAction={() => setCommitPickerProjectId(selectedProject.id)}
            onOpenSettingsAction={() => setSettingsProjectId(selectedProject.id)}
            onSelectDeploymentAction={setDetailDeploymentId}
            onSyncAction={() => void runProjectAction(selectedProject, 'sync')}
            pendingActionKey={pendingActionKey}
            previewProtocol={state.previewProtocol}
            project={selectedProject}
          />
        ) : null}

        {state && !selectedProject ? (
          <div className="vercelab-page">
            <section className="relative mx-auto max-w-2xl overflow-hidden rounded-[10px] border border-blue-200 bg-white px-5 py-6 shadow-[var(--shadow)] before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-[var(--blue)]">
              <div className="flex size-10 items-center justify-center rounded-[9px] bg-[var(--blue-soft)] text-[var(--blue)]">
                <RocketLaunch aria-hidden="true" className="size-5" />
              </div>
              <h1 className="mt-3 text-[18px] font-semibold tracking-tight">
                Commit-based preview deployments
              </h1>
              <p className="mt-2 max-w-xl text-[12px] leading-6 text-muted-foreground">
                Connect a GitHub repository and Vercelab will build every new commit into its own
                Docker container. Each preview gets a unique URL, its own logs, and stays online
                until you remove it.
              </p>

              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                {[
                  ['1', 'Connect repository', 'Pick a repo, branch, and Dockerfile.'],
                  ['2', 'Push a commit', 'Polling or a webhook detects it automatically.'],
                  ['3', 'Open the preview', 'Compare any commit without touching production.'],
                ].map(([step, title, description]) => (
                  <div
                    className="rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-subtle)] p-3"
                    key={step}
                  >
                    <div className="font-mono text-[9px] text-[var(--quiet)]">STEP {step}</div>
                    <div className="mt-1 text-[11px] font-semibold">{title}</div>
                    <div className="mt-1 text-[10px] leading-4 text-[var(--quiet)]">
                      {description}
                    </div>
                  </div>
                ))}
              </div>

              {state.githubTokenConfigured ? (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Button
                    className="border-[var(--blue)] bg-[var(--blue)] text-white shadow-none hover:bg-[#0d55bc]"
                    onClick={() => setIsConnectOpen(true)}
                    type="button"
                  >
                    <RocketLaunch aria-hidden="true" className="size-3.5" />
                    Connect repository
                  </Button>
                  <span className="inline-flex items-center gap-1 text-[10px] text-[var(--quiet)]">
                    <GitBranch aria-hidden="true" className="size-3" />
                    Production deployments stay at their existing URLs.
                  </span>
                </div>
              ) : (
                <div className="mt-4">
                  <WorkspaceNotice>
                    Add a GitHub token in the Vercelab settings popover to connect a repository.
                  </WorkspaceNotice>
                </div>
              )}
            </section>
          </div>
        ) : null}
      </main>

      {detailDeployment && detailProject ? (
        <DevDeploymentDetail
          baseDomain={state?.baseDomain ?? ''}
          containerState={containerStates[detailDeployment.id] ?? null}
          deployment={detailDeployment}
          onActionAction={(action, deploymentId) => void runDeploymentAction(action, deploymentId)}
          onCloseAction={() => setDetailDeploymentId(null)}
          pendingActionKey={pendingActionKey}
          previewProtocol={state?.previewProtocol ?? 'https'}
          project={detailProject}
        />
      ) : null}

      {isConnectOpen ? (
        <DevProjectDialog
          baseDomain={state?.baseDomain ?? ''}
          mode="create"
          onCloseAction={() => setIsConnectOpen(false)}
          onDeletedAction={() => undefined}
          onSavedAction={handleProjectSaved}
          previewProtocol={state?.previewProtocol ?? 'https'}
        />
      ) : null}

      {settingsProject ? (
        <DevProjectDialog
          baseDomain={state?.baseDomain ?? ''}
          mode="edit"
          onCloseAction={() => setSettingsProjectId(null)}
          onDeletedAction={handleProjectDeleted}
          onSavedAction={handleProjectSaved}
          previewProtocol={state?.previewProtocol ?? 'https'}
          project={settingsProject}
        />
      ) : null}

      {commitPickerProject ? (
        <DevCommitPickerDialog
          onCloseAction={() => setCommitPickerProjectId(null)}
          onDeployAction={(commitSha) => deployCommit(commitPickerProject.id, commitSha)}
          project={commitPickerProject}
        />
      ) : null}

      {deleteDeployment ? (
        <WorkspaceDialog
          onCloseAction={() => setDeleteDeployment(null)}
          title={`Delete preview ${deleteDeployment.shortSha}`}
        >
          <div className="px-5 py-4">
            <h2 className="text-[16px] font-semibold tracking-tight">
              Delete preview {deleteDeployment.shortSha}?
            </h2>
            <p className="mt-2 text-[11px] leading-5 text-[var(--quiet)]">
              This removes the preview container, image, workspace, and build log. Other previews
              and the production deployment are not affected.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                disabled={isDeletingDeployment}
                onClick={() => setDeleteDeployment(null)}
                type="button"
                variant="secondary"
              >
                Cancel
              </Button>
              <Button
                disabled={isDeletingDeployment}
                onClick={() => void confirmDeleteDeployment()}
                type="button"
                variant="danger"
              >
                {isDeletingDeployment ? (
                  <SpinnerGap aria-hidden="true" className="size-3.5 animate-spin" />
                ) : null}
                Delete preview
              </Button>
            </div>
          </div>
        </WorkspaceDialog>
      ) : null}
    </div>
  );
}
