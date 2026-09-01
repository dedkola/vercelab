'use client';

import { useEffect, useState } from 'react';
import {
  Box,
  ExternalLink,
  LoaderCircle,
  Play,
  RotateCcw,
  Save,
  Square,
  Trash2,
  X,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ContainerListEntry, DashboardLogView, LogLine } from '@/components/workspace-shell';
import type { ContainerAction, ContainerInventoryMeta } from '@/lib/container-inventory';
import type { ContainerInspectData } from '@/lib/container-inspect';
import type { RecreateChanges } from '@/lib/container-recreate';
import { cn } from '@/lib/utils';
import type { ExposureMode } from '@/lib/validation';

const SENSITIVE_KEY_RE = /password|secret|token|key|auth|credential|private/i;

type ManagerTab = 'overview' | 'settings' | 'variables' | 'logs';

function maskIfSensitive(key: string, value: string) {
  return SENSITIVE_KEY_RE.test(key) ? '••••••••' : value;
}

function formatKindLabel(kind: ContainerInventoryMeta['kind']) {
  switch (kind) {
    case 'managed':
      return 'Managed workload';
    case 'system':
      return 'Protected service';
    case 'unmanaged':
      return 'Unmanaged runtime';
  }
}

function getKindBadgeVariant(kind: ContainerInventoryMeta['kind']) {
  switch (kind) {
    case 'managed':
      return 'success' as const;
    case 'system':
      return 'warning' as const;
    case 'unmanaged':
      return 'default' as const;
  }
}

function getActionLabel(action: ContainerAction) {
  switch (action) {
    case 'restart':
      return 'Restart';
    case 'stop':
      return 'Stop';
    case 'start':
      return 'Start';
    case 'remove':
      return 'Remove';
  }
}

function getActionVariant(action: ContainerAction) {
  return action === 'remove' || action === 'stop'
    ? ('danger' as const)
    : action === 'restart'
      ? ('secondary' as const)
      : ('default' as const);
}

function ActionIcon({ action, pending }: { action: ContainerAction; pending: boolean }) {
  if (pending) {
    return <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" />;
  }

  switch (action) {
    case 'start':
      return <Play aria-hidden="true" className="size-3.5" />;
    case 'stop':
      return <Square aria-hidden="true" className="size-3.5" />;
    case 'remove':
      return <Trash2 aria-hidden="true" className="size-3.5" />;
    case 'restart':
      return <RotateCcw aria-hidden="true" className="size-3.5" />;
  }
}

function getRuntimeState(runtimeEntry: ContainerListEntry) {
  if (runtimeEntry.runtime?.health === 'unhealthy') {
    return { label: 'Unhealthy', summary: 'Needs attention', variant: 'warning' as const };
  }

  if (runtimeEntry.runtime?.health === 'starting') {
    return { label: 'Starting', summary: 'Health check pending', variant: 'warning' as const };
  }

  if (runtimeEntry.display.status === 'degraded') {
    return { label: 'Attention', summary: 'Runtime degraded', variant: 'warning' as const };
  }

  if (runtimeEntry.runtime?.status === 'running' || runtimeEntry.display.status === 'running') {
    return { label: 'Running', summary: 'Runtime healthy', variant: 'success' as const };
  }

  return { label: 'Stopped', summary: 'Runtime offline', variant: 'default' as const };
}

function getLogDotClassName(level: LogLine['level']) {
  switch (level) {
    case 'success':
      return 'bg-emerald-400';
    case 'warning':
      return 'bg-amber-400';
    case 'info':
      return 'bg-slate-400';
  }
}

function getExposureMode(inspectData: ContainerInspectData, inspectPortBindings: unknown[]) {
  return (inspectData.traefikMethod as ExposureMode | null) === 'tcp'
    ? ('tcp' as const)
    : inspectData.traefikPort
      ? ('http' as const)
      : inspectPortBindings.length > 0
        ? ('host' as const)
        : ('internal' as const);
}

function InfoRow({
  label,
  mono = false,
  value,
}: {
  label: string;
  mono?: boolean;
  value: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[8.5rem_minmax(0,1fr)] items-start gap-3 border-b border-[var(--hairline)] px-3 py-2.5 last:border-b-0 max-[480px]:grid-cols-1 max-[480px]:gap-1">
      <dt className="font-mono text-[10px] font-semibold tracking-[0.08em] text-[var(--quiet)] uppercase">
        {label}
      </dt>
      <dd
        className={cn(
          'min-w-0 break-words text-[12px] text-foreground',
          mono && 'font-mono text-[11px]'
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function ConfigurationField({
  children,
  description,
  label,
  savedValue,
}: {
  children: React.ReactNode;
  description: string;
  label: string;
  savedValue: React.ReactNode;
}) {
  return (
    <div className="rounded-[8px] border border-[var(--hairline)] bg-white p-3">
      <div className="mb-2.5 min-h-8">
        <div className="text-xs font-semibold tracking-tight text-foreground">{label}</div>
        <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{description}</p>
      </div>
      {children}
      <div className="mt-2 truncate font-mono text-[10px] text-[var(--quiet)]">
        Saved · {savedValue}
      </div>
    </div>
  );
}

type EnvRowEditorProps = {
  envVars: Array<{ key: string; value: string }>;
  onChange: (vars: Array<{ key: string; value: string }>) => void;
};

function EnvRowEditor({ envVars, onChange }: EnvRowEditorProps) {
  return (
    <section className="overflow-hidden rounded-[8px] border border-[var(--hairline)] bg-white">
      <header className="flex items-center justify-between gap-3 border-b border-[var(--hairline)] bg-[var(--surface-subtle)] px-3 py-2.5">
        <div>
          <h3 className="text-[12px] font-semibold">Variables</h3>
          <p className="mt-0.5 font-mono text-[10px] text-[var(--quiet)]">
            Applied when the container is recreated
          </p>
        </div>
        <Button
          onClick={() => onChange([...envVars, { key: '', value: '' }])}
          size="xs"
          type="button"
          variant="secondary"
        >
          Add variable
        </Button>
      </header>

      {envVars.length ? (
        <div className="divide-y divide-[var(--hairline)]">
          {envVars.map((row, index) => (
            <div
              className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_auto] items-center gap-2 px-3 py-2.5 max-[540px]:grid-cols-[minmax(0,1fr)_auto]"
              key={`${row.key}-${index}`}
            >
              <Input
                aria-label={`Env key ${index + 1}`}
                className="h-9 rounded-[7px] font-mono text-[11px] shadow-none"
                onChange={(event) =>
                  onChange(
                    envVars.map((candidate, candidateIndex) =>
                      candidateIndex === index
                        ? { ...candidate, key: event.target.value }
                        : candidate
                    )
                  )
                }
                placeholder="KEY"
                value={row.key}
              />
              <Input
                aria-label={`Env value ${index + 1}`}
                className="h-9 rounded-[7px] font-mono text-[11px] shadow-none max-[540px]:col-start-1"
                onChange={(event) =>
                  onChange(
                    envVars.map((candidate, candidateIndex) =>
                      candidateIndex === index
                        ? { ...candidate, value: event.target.value }
                        : candidate
                    )
                  )
                }
                placeholder="value"
                value={row.value}
              />
              <Button
                aria-label={`Remove ${row.key || 'environment variable'}`}
                className="size-7 max-[540px]:row-span-2 max-[540px]:row-start-1"
                onClick={() =>
                  onChange(envVars.filter((_, candidateIndex) => candidateIndex !== index))
                }
                size="icon"
                type="button"
                variant="ghost"
              >
                <X aria-hidden="true" className="size-3.5" />
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
  );
}

export type ContainersMainContentProps = {
  actionError: string | null;
  actionPending: ContainerAction | null;
  activeLogView: DashboardLogView;
  aliasDraft: string;
  inspectData: ContainerInspectData | null;
  inspectLoading: boolean;
  inventoryMeta: ContainerInventoryMeta;
  logs: LogLine[];
  onAliasDraftChangeAction: (value: string) => void;
  onAliasSaveAction: () => void;
  onCloseAction: () => void;
  onLogViewChangeAction: (view: DashboardLogView) => void;
  onRecreateAction: (changes: RecreateChanges) => Promise<void>;
  onRunAction: (action: ContainerAction) => void;
  recreateError: string | null;
  recreatePending: boolean;
  runtimeEntry: ContainerListEntry;
};

export function ContainersMainContent({
  actionError,
  actionPending,
  activeLogView,
  aliasDraft,
  inspectData,
  inspectLoading,
  inventoryMeta,
  logs,
  onAliasDraftChangeAction,
  onAliasSaveAction,
  onCloseAction,
  onLogViewChangeAction,
  onRecreateAction,
  onRunAction,
  recreateError,
  recreatePending,
  runtimeEntry,
}: ContainersMainContentProps) {
  const [activeTab, setActiveTab] = useState<ManagerTab>('overview');
  const [editName, setEditName] = useState('');
  const [editImage, setEditImage] = useState('');
  const [editPort, setEditPort] = useState('');
  const [editExposureMode, setEditExposureMode] = useState<ExposureMode>('http');
  const [editEnvVars, setEditEnvVars] = useState<Array<{ key: string; value: string }>>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [tagsLoading, setTagsLoading] = useState(false);
  const [tagsError, setTagsError] = useState<string | null>(null);
  const inspectEnvVars = inspectData?.envVars ?? [];
  const inspectPortBindings = inspectData?.portBindings ?? [];
  const runtimeState = getRuntimeState(runtimeEntry);
  const url =
    runtimeEntry.display.endpoints[0]?.url ?? runtimeEntry.display.endpoints[0]?.name ?? null;

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onCloseAction();
      }
    }

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onCloseAction]);

  useEffect(() => {
    if (!inspectData) {
      return;
    }

    setEditName(inspectData.name);
    setEditImage(inspectData.image);
    setEditPort(inspectData.traefikPort ?? inspectData.appPort?.replace(/\/tcp$/, '') ?? '');
    setEditExposureMode(getExposureMode(inspectData, inspectData.portBindings));
    setEditEnvVars(inspectData.envVars.map((variable) => ({ ...variable })));
    setAvailableTags([]);
    setTagsError(null);
  }, [inspectData]);

  const handleFetchTags = async () => {
    const imageName = editImage.trim().split(':')[0] ?? '';

    if (!imageName) {
      return;
    }

    setTagsLoading(true);
    setTagsError(null);

    try {
      const response = await fetch(
        `/api/containers/catalog/tags?image=${encodeURIComponent(imageName)}`,
        { cache: 'no-store' }
      );
      const payload = (await response.json()) as { tags?: string[]; error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Unable to fetch tags.');
      }

      const tags = payload.tags ?? [];
      setAvailableTags(tags);

      if (tags.length === 0) {
        setTagsError('No tags found or not a Docker Hub image.');
      }
    } catch (error) {
      setTagsError(error instanceof Error ? error.message : 'Unable to fetch tags.');
    } finally {
      setTagsLoading(false);
    }
  };

  const handleRecreate = async () => {
    await onRecreateAction({
      envVars: editEnvVars.filter((variable) => variable.key.trim().length > 0),
      exposureMode: editExposureMode,
      image: editImage.trim() || undefined,
      name: editName.trim() || undefined,
      port: editPort.trim() ? Number.parseInt(editPort, 10) : undefined,
    });
  };

  const managerTabs: Array<{ label: string; value: ManagerTab }> = [
    { label: 'Overview', value: 'overview' },
    { label: 'Settings', value: 'settings' },
    { label: 'Variables', value: 'variables' },
    { label: 'Logs', value: 'logs' },
  ];

  return (
    <>
      <button
        aria-label="Close container manager"
        className="fixed inset-0 z-50 cursor-default bg-[rgb(26_26_29_/_0.2)]"
        onClick={onCloseAction}
        type="button"
      />
      <aside
        aria-labelledby="container-manager-title"
        aria-modal="true"
        className="fixed inset-y-0 right-0 z-[60] flex w-[min(560px,calc(100vw-24px))] flex-col border-l border-[var(--hairline)] bg-white shadow-[-20px_0_60px_rgb(16_24_40_/_0.12)] max-[640px]:w-screen max-[640px]:border-l-0"
        role="dialog"
      >
        <header className="flex min-h-[58px] items-center justify-between gap-3 border-b border-[var(--hairline)] px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid size-[30px] shrink-0 place-items-center rounded-[7px] border border-blue-200 bg-[var(--blue-soft)] text-[var(--blue)]">
              <Box aria-hidden="true" className="size-4" />
            </span>
            <div className="min-w-0">
              <h2
                className="truncate text-[14px] font-semibold tracking-[-0.015em]"
                id="container-manager-title"
              >
                {runtimeEntry.sidebarName}
              </h2>
              <p className="mt-0.5 truncate font-mono text-[10px] text-[var(--quiet)]">
                {runtimeEntry.display.image} · {runtimeEntry.display.id.slice(0, 12)}
              </p>
            </div>
          </div>
          <Button
            aria-label="Close container manager"
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
          aria-label="Container management"
          className="flex min-h-[39px] shrink-0 gap-4 overflow-x-auto border-b border-[var(--hairline)] px-4"
          role="tablist"
        >
          {managerTabs.map((tab) => (
            <button
              aria-selected={activeTab === tab.value}
              className={cn(
                'relative shrink-0 px-0 text-[11px] font-semibold transition-colors after:absolute after:inset-x-0 after:bottom-[-1px] after:h-0.5',
                activeTab === tab.value
                  ? 'text-foreground after:bg-[var(--blue)]'
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
            <div className="space-y-4">
              <section className="rounded-[10px] border border-[var(--hairline)] bg-white p-3.5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <span className="font-mono text-[10px] font-semibold tracking-[0.08em] text-[var(--quiet)] uppercase">
                      Current runtime
                    </span>
                    <h3 className="mt-1 text-lg font-semibold tracking-[-0.035em]">
                      {runtimeState.summary}
                    </h3>
                  </div>
                  <Badge className="rounded-[6px] shadow-none" variant={runtimeState.variant}>
                    {runtimeState.label}
                  </Badge>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3 font-mono text-[10px] text-[var(--quiet)]">
                  <span>{formatKindLabel(inventoryMeta.kind)}</span>
                  <span>{runtimeEntry.display.uptime || 'No uptime sample'}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {url ? (
                    <Button asChild className="shadow-none" size="xs" variant="secondary">
                      <a href={url} rel="noreferrer" target="_blank">
                        <ExternalLink aria-hidden="true" className="size-3.5" />
                        Open route
                      </a>
                    </Button>
                  ) : null}
                  <Button
                    onClick={() => setActiveTab('logs')}
                    size="xs"
                    type="button"
                    variant="secondary"
                  >
                    View logs
                  </Button>
                  {inventoryMeta.availableActions.map((action) => (
                    <Button
                      disabled={actionPending !== null}
                      key={action}
                      onClick={() => onRunAction(action)}
                      size="xs"
                      type="button"
                      variant={getActionVariant(action)}
                    >
                      <ActionIcon action={action} pending={actionPending === action} />
                      {getActionLabel(action)}
                    </Button>
                  ))}
                </div>
              </section>

              {actionError ? (
                <section className="rounded-[8px] border border-orange-200 bg-[var(--orange-soft)] px-3 py-2.5 text-[11px] text-orange-900">
                  {actionError}
                </section>
              ) : null}

              <section>
                <h3 className="mb-2 text-[12px] font-semibold">Runtime path</h3>
                <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-1.5 max-[520px]:grid-cols-1">
                  <div className="min-w-0 rounded-[8px] border border-[var(--hairline)] bg-white p-2.5">
                    <span className="grid size-4 place-items-center rounded-full bg-[var(--green-soft)] font-mono text-[10px] font-bold text-[var(--green)]">
                      ✓
                    </span>
                    <strong className="mt-1.5 block text-[11px]">Image</strong>
                    <span className="mt-0.5 block truncate font-mono text-[10px] text-[var(--quiet)]">
                      {inspectLoading ? 'loading' : (inspectData?.imageVersion ?? 'unknown')}
                    </span>
                  </div>
                  <span className="text-center text-[var(--quiet)] max-[520px]:rotate-90">→</span>
                  <div className="min-w-0 rounded-[8px] border border-[var(--hairline)] bg-white p-2.5">
                    <span className="grid size-4 place-items-center rounded-full bg-[var(--blue-soft)] font-mono text-[10px] font-bold text-[var(--blue)]">
                      {runtimeState.variant === 'success' ? '✓' : '·'}
                    </span>
                    <strong className="mt-1.5 block text-[11px]">Runtime</strong>
                    <span className="mt-0.5 block truncate font-mono text-[10px] text-[var(--quiet)]">
                      {runtimeEntry.runtime?.status ?? runtimeEntry.display.status}
                    </span>
                  </div>
                  <span className="text-center text-[var(--quiet)] max-[520px]:rotate-90">→</span>
                  <div className="min-w-0 rounded-[8px] border border-[var(--hairline)] bg-white p-2.5">
                    <span className="grid size-4 place-items-center rounded-full bg-[var(--surface-subtle)] font-mono text-[10px] font-bold text-[var(--quiet)]">
                      {url ? '✓' : '—'}
                    </span>
                    <strong className="mt-1.5 block text-[11px]">Route</strong>
                    <span className="mt-0.5 block truncate font-mono text-[10px] text-[var(--quiet)]">
                      {url ? 'available' : 'internal'}
                    </span>
                  </div>
                </div>
              </section>

              <section className="overflow-hidden rounded-[8px] border border-[var(--hairline)] bg-white">
                <header className="border-b border-[var(--hairline)] bg-[var(--surface-subtle)] px-3 py-2.5">
                  <h3 className="text-[12px] font-semibold">Runtime details</h3>
                </header>
                <dl>
                  <InfoRow label="Container name" value={runtimeEntry.display.name} />
                  <InfoRow label="Container ID" mono value={runtimeEntry.display.id} />
                  <InfoRow
                    label="Stack / service"
                    mono
                    value={`${runtimeEntry.runtime?.projectName ?? runtimeEntry.display.stack} / ${runtimeEntry.runtime?.serviceName ?? 'runtime'}`}
                  />
                  <InfoRow
                    label="App port"
                    mono
                    value={inspectLoading ? 'Loading…' : (inspectData?.appPort ?? 'Not exposed')}
                  />
                  <InfoRow
                    label="Traefik"
                    mono
                    value={
                      inspectLoading
                        ? 'Loading…'
                        : inspectData?.traefikPort
                          ? `${inspectData.traefikMethod ?? 'http'} · :${inspectData.traefikPort}`
                          : 'Not routed'
                    }
                  />
                  <InfoRow
                    label="Host bindings"
                    mono
                    value={
                      inspectLoading
                        ? 'Loading…'
                        : inspectPortBindings.length
                          ? inspectPortBindings
                              .map((binding) => `${binding.hostPort}:${binding.containerPort}`)
                              .join(', ')
                          : 'None'
                    }
                  />
                </dl>
              </section>

              <p className="px-1 text-[11px] leading-4 text-[var(--quiet)]">{inventoryMeta.note}</p>
            </div>
          ) : null}

          {activeTab === 'settings' ? (
            <div className="space-y-3">
              <section className="rounded-[10px] border border-[var(--hairline)] bg-white p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="font-mono text-[10px] font-semibold tracking-[0.08em] text-[var(--quiet)] uppercase">
                      Configuration
                    </span>
                    <h3 className="mt-1 text-lg font-semibold tracking-[-0.035em]">
                      Container settings
                    </h3>
                  </div>
                  <Badge
                    className="rounded-[6px] shadow-none"
                    variant={getKindBadgeVariant(inventoryMeta.kind)}
                  >
                    {formatKindLabel(inventoryMeta.kind)}
                  </Badge>
                </div>
              </section>

              <ConfigurationField
                description="Local display name used throughout Vercelab."
                label="Friendly label"
                savedValue={runtimeEntry.sidebarName}
              >
                <div className="flex items-center gap-1.5">
                  <Input
                    aria-label="Label"
                    className="h-9 rounded-[7px] text-[12px] shadow-none"
                    disabled={!inventoryMeta.canEditAlias}
                    onChange={(event) => onAliasDraftChangeAction(event.target.value)}
                    value={aliasDraft}
                  />
                  <Button
                    disabled={!inventoryMeta.canEditAlias}
                    onClick={onAliasSaveAction}
                    size="xs"
                    type="button"
                    variant="secondary"
                  >
                    Save label
                  </Button>
                </div>
              </ConfigurationField>

              {inventoryMeta.kind === 'system' ? (
                <section className="rounded-[8px] border border-orange-200 bg-[var(--orange-soft)] px-3 py-3 text-[11px] leading-5 text-orange-900">
                  Protected system containers can be relabeled and restarted. Runtime configuration
                  stays locked on this page.
                </section>
              ) : (
                <>
                  <ConfigurationField
                    description="Docker runtime name applied during recreation."
                    label="Container name"
                    savedValue={inspectData?.name ?? runtimeEntry.display.name}
                  >
                    <Input
                      aria-label="Container runtime name"
                      className="h-9 rounded-[7px] text-[12px] shadow-none"
                      disabled={inspectLoading}
                      onChange={(event) => setEditName(event.target.value)}
                      value={editName}
                    />
                  </ConfigurationField>

                  <ConfigurationField
                    description="Image reference and tag pulled before recreation."
                    label="Image and version"
                    savedValue={inspectData?.image ?? runtimeEntry.display.image}
                  >
                    <div className="flex items-center gap-1.5">
                      <Input
                        aria-label="Container image"
                        className="h-9 rounded-[7px] font-mono text-[11px] shadow-none"
                        disabled={inspectLoading}
                        onChange={(event) => {
                          setEditImage(event.target.value);
                          setAvailableTags([]);
                        }}
                        value={editImage}
                      />
                      <Button
                        disabled={tagsLoading || !editImage.trim()}
                        onClick={handleFetchTags}
                        size="xs"
                        type="button"
                        variant="secondary"
                      >
                        {tagsLoading ? 'Loading…' : 'Fetch tags'}
                      </Button>
                    </div>
                    {tagsError ? (
                      <p className="mt-2 text-[11px] text-[var(--quiet)]">{tagsError}</p>
                    ) : null}
                    {availableTags.length ? (
                      <div className="mt-2 max-h-36 overflow-auto rounded-[7px] border border-[var(--hairline)] bg-[var(--surface-subtle)] p-1">
                        {availableTags.map((tag) => {
                          const baseName = editImage.trim().split(':')[0] ?? '';

                          return (
                            <button
                              className="flex w-full rounded-[5px] px-2 py-1.5 text-left font-mono text-[11px] transition-colors hover:bg-white"
                              key={tag}
                              onClick={() => setEditImage(`${baseName}:${tag}`)}
                              type="button"
                            >
                              {tag}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </ConfigurationField>

                  <div className="grid grid-cols-2 gap-3 max-[520px]:grid-cols-1">
                    <ConfigurationField
                      description="Container port used by the selected exposure mode."
                      label="Application port"
                      savedValue={inspectData?.traefikPort ?? inspectData?.appPort ?? 'none'}
                    >
                      <Input
                        aria-label="Container port"
                        className="h-9 rounded-[7px] font-mono text-[11px] shadow-none"
                        inputMode="numeric"
                        onChange={(event) => setEditPort(event.target.value)}
                        placeholder="3000"
                        value={editPort}
                      />
                    </ConfigurationField>
                    <ConfigurationField
                      description="How traffic reaches this container."
                      label="Exposure"
                      savedValue={
                        inspectData ? getExposureMode(inspectData, inspectPortBindings) : 'loading'
                      }
                    >
                      <select
                        aria-label="Container exposure mode"
                        className="h-9 w-full rounded-[7px] border border-input bg-white px-2.5 text-[12px] outline-none focus:border-ring focus:ring-1 focus:ring-ring/70"
                        onChange={(event) =>
                          setEditExposureMode(event.target.value as ExposureMode)
                        }
                        value={editExposureMode}
                      >
                        <option value="http">HTTP reverse proxy</option>
                        <option value="tcp">TCP passthrough</option>
                        <option value="host">Direct host port</option>
                        <option value="internal">Internal only</option>
                      </select>
                    </ConfigurationField>
                  </div>
                </>
              )}
            </div>
          ) : null}

          {activeTab === 'variables' ? (
            <div className="space-y-3">
              <section className="rounded-[10px] border border-[var(--hairline)] bg-white p-3.5">
                <span className="font-mono text-[10px] font-semibold tracking-[0.08em] text-[var(--quiet)] uppercase">
                  Environment
                </span>
                <h3 className="mt-1 text-lg font-semibold tracking-[-0.035em]">
                  {inspectLoading
                    ? 'Loading variables'
                    : `${inspectEnvVars.length} variable${inspectEnvVars.length === 1 ? '' : 's'}`}
                </h3>
                <p className="mt-1 font-mono text-[10px] text-[var(--quiet)]">
                  Sensitive values stay masked in the runtime snapshot
                </p>
              </section>

              {inspectEnvVars.length ? (
                <section className="overflow-hidden rounded-[8px] border border-[var(--hairline)] bg-white">
                  <header className="border-b border-[var(--hairline)] bg-[var(--surface-subtle)] px-3 py-2.5">
                    <h3 className="text-[12px] font-semibold">Current snapshot</h3>
                  </header>
                  <dl>
                    {inspectEnvVars.map(({ key, value }) => (
                      <InfoRow key={key} label={key} mono value={maskIfSensitive(key, value)} />
                    ))}
                  </dl>
                </section>
              ) : null}

              {inventoryMeta.kind === 'system' ? (
                <section className="rounded-[8px] border border-orange-200 bg-[var(--orange-soft)] px-3 py-3 text-[11px] leading-5 text-orange-900">
                  Environment editing is locked for protected system containers.
                </section>
              ) : (
                <EnvRowEditor envVars={editEnvVars} onChange={setEditEnvVars} />
              )}
            </div>
          ) : null}

          {activeTab === 'logs' ? (
            <div className="space-y-3">
              <section className="rounded-[10px] border border-[var(--hairline)] bg-white p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="font-mono text-[10px] font-semibold tracking-[0.08em] text-[var(--quiet)] uppercase">
                      Runtime output
                    </span>
                    <h3 className="mt-1 text-lg font-semibold tracking-[-0.035em]">
                      {runtimeEntry.sidebarName}
                    </h3>
                  </div>
                  <Badge className="rounded-[6px] shadow-none" variant={runtimeState.variant}>
                    {runtimeState.label}
                  </Badge>
                </div>
                <div className="mt-3 flex gap-1.5">
                  {(['live', 'events', 'alerts'] as const).map((view) => (
                    <button
                      aria-pressed={activeLogView === view}
                      className={cn(
                        'h-7 rounded-[6px] border px-2.5 text-[11px] font-medium transition-colors',
                        activeLogView === view
                          ? 'border-blue-200 bg-[var(--blue-soft)] text-[var(--blue)]'
                          : 'border-[var(--hairline)] bg-white text-[var(--quiet)] hover:text-foreground'
                      )}
                      key={view}
                      onClick={() => onLogViewChangeAction(view)}
                      type="button"
                    >
                      {view.charAt(0).toUpperCase() + view.slice(1)}
                    </button>
                  ))}
                </div>
              </section>

              <section className="overflow-hidden rounded-[10px] border border-[#27313c] bg-[#0f1720] shadow-[0_20px_50px_rgb(15_23_32_/_0.18)]">
                <header className="flex items-center justify-between border-b border-white/10 px-3 py-2.5">
                  <div className="flex items-center gap-2 text-[11px] text-slate-300">
                    <span className="size-2 rounded-full bg-emerald-400" />
                    {activeLogView === 'live' ? 'Live tail' : activeLogView}
                  </div>
                  <span className="font-mono text-[10px] text-slate-500">{logs.length} lines</span>
                </header>
                <div className="min-h-80 space-y-1.5 overflow-x-auto p-3 font-mono text-[11px] leading-5 text-slate-200">
                  {logs.length ? (
                    logs.map((line) => (
                      <div
                        className="grid grid-cols-[auto_auto_minmax(16rem,1fr)] gap-2"
                        key={line.id}
                      >
                        <span
                          aria-hidden="true"
                          className={cn('mt-2 size-1 rounded-full', getLogDotClassName(line.level))}
                        />
                        <span className="whitespace-nowrap text-slate-500">{line.timestamp}</span>
                        <span className="text-slate-100">{line.message}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-slate-400">No lines in this log view.</p>
                  )}
                </div>
              </section>
            </div>
          ) : null}
        </div>

        {(activeTab === 'settings' || activeTab === 'variables') &&
        inventoryMeta.kind !== 'system' ? (
          <footer className="flex min-h-[54px] shrink-0 items-center justify-between gap-3 border-t border-[var(--hairline)] bg-white px-4 py-3">
            <span className="font-mono text-[10px] text-[var(--quiet)]">
              {recreateError ?? 'Changes apply by replacing the current container'}
            </span>
            <Button
              disabled={recreatePending || inspectLoading}
              onClick={() => void handleRecreate()}
              size="xs"
              type="button"
            >
              {recreatePending ? (
                <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" />
              ) : (
                <Save aria-hidden="true" className="size-3.5" />
              )}
              Save and recreate
            </Button>
          </footer>
        ) : null}
      </aside>
    </>
  );
}
