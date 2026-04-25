"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ContainerListEntry } from "@/components/workspace-shell";
import type {
  ContainerAction,
  ContainerInventoryMeta,
} from "@/lib/container-inventory";
import type { ContainerInspectData } from "@/lib/container-inspect";
import type { RecreateChanges } from "@/lib/container-recreate";
import {
  formatBytes,
  formatBytesPerSecond,
  formatPercent,
} from "@/lib/metrics-dashboard-metrics";
import type { ExposureMode } from "@/lib/validation";

const SENSITIVE_KEY_RE = /password|secret|token|key|auth|credential|private/i;

function maskIfSensitive(key: string, value: string) {
  return SENSITIVE_KEY_RE.test(key) ? "••••••••" : value;
}

function formatKindLabel(kind: ContainerInventoryMeta["kind"]) {
  switch (kind) {
    case "managed":
      return "Managed workload";
    case "system":
      return "Protected system service";
    case "unmanaged":
      return "Unmanaged runtime";
  }
}

function getKindBadgeVariant(kind: ContainerInventoryMeta["kind"]) {
  switch (kind) {
    case "managed":
      return "success" as const;
    case "system":
      return "warning" as const;
    case "unmanaged":
      return "default" as const;
  }
}

function getActionLabel(action: ContainerAction) {
  switch (action) {
    case "restart":
      return "Restart";
    case "stop":
      return "Stop";
    case "start":
      return "Start";
    case "remove":
      return "Remove";
  }
}

function getActionVariant(action: ContainerAction) {
  return action === "remove" ? ("danger" as const) : ("default" as const);
}

type InfoChipProps = {
  label: string;
  value: string | null | undefined;
  children?: React.ReactNode;
  mono?: boolean;
};

function InfoChip({ label, value, children, mono }: InfoChipProps) {
  return (
    <div className="rounded-md border border-border/60 bg-muted/16 px-2.5 py-2">
      <dt className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </dt>
      <dd
        className={`mt-1 truncate text-sm font-medium text-foreground ${mono ? "font-mono text-xs" : ""}`}
        title={value ?? undefined}
      >
        {children ?? value ?? <span className="text-muted-foreground">—</span>}
      </dd>
    </div>
  );
}

type EnvRowEditorProps = {
  envVars: Array<{ key: string; value: string }>;
  onChange: (vars: Array<{ key: string; value: string }>) => void;
};

function EnvRowEditor({ envVars, onChange }: EnvRowEditorProps) {
  const handleChange = (
    index: number,
    field: "key" | "value",
    val: string,
  ) => {
    const next = envVars.map((row, i) =>
      i === index ? { ...row, [field]: val } : row,
    );
    onChange(next);
  };

  const handleRemove = (index: number) => {
    onChange(envVars.filter((_, i) => i !== index));
  };

  const handleAdd = () => {
    onChange([...envVars, { key: "", value: "" }]);
  };

  return (
    <div className="space-y-1.5">
      {envVars.map((row, index) => (
        <div className="flex items-center gap-1.5" key={index}>
          <Input
            aria-label={`Env key ${index + 1}`}
            className="h-8 flex-1 font-mono text-xs"
            onChange={(e) => handleChange(index, "key", e.target.value)}
            placeholder="KEY"
            value={row.key}
          />
          <Input
            aria-label={`Env value ${index + 1}`}
            className="h-8 flex-[2] font-mono text-xs"
            onChange={(e) => handleChange(index, "value", e.target.value)}
            placeholder="value"
            value={row.value}
          />
          <button
            aria-label="Remove variable"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border/60 bg-background text-muted-foreground transition hover:border-rose-300/80 hover:bg-rose-50/80 hover:text-rose-600"
            onClick={() => handleRemove(index)}
            type="button"
          >
            ×
          </button>
        </div>
      ))}
      <button
        className="flex items-center gap-1.5 rounded-md border border-dashed border-border/60 px-2.5 py-1.5 text-xs text-muted-foreground transition hover:border-emerald-300/80 hover:bg-emerald-50/75 hover:text-emerald-700"
        onClick={handleAdd}
        type="button"
      >
        <span className="text-base leading-none">+</span>
        Add variable
      </button>
    </div>
  );
}

export type ContainersMainContentProps = {
  actionError: string | null;
  actionPending: ContainerAction | null;
  aliasDraft: string;
  inspectData: ContainerInspectData | null;
  inspectLoading: boolean;
  inventoryMeta: ContainerInventoryMeta;
  onAliasDraftChangeAction: (value: string) => void;
  onAliasSaveAction: () => void;
  onRecreateAction: (changes: RecreateChanges) => Promise<void>;
  onRunAction: (action: ContainerAction) => void;
  recreateError: string | null;
  recreatePending: boolean;
  runtimeEntry: ContainerListEntry | null;
};

export function ContainersMainContent({
  actionError,
  actionPending,
  aliasDraft,
  inspectData,
  inspectLoading,
  inventoryMeta,
  onAliasDraftChangeAction,
  onAliasSaveAction,
  onRecreateAction,
  onRunAction,
  recreateError,
  recreatePending,
  runtimeEntry,
}: ContainersMainContentProps) {
  const runtime = runtimeEntry?.runtime ?? null;

  const [isEnvOpen, setIsEnvOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);

  const [editName, setEditName] = useState("");
  const [editImage, setEditImage] = useState("");
  const [editPort, setEditPort] = useState("");
  const [editExposureMode, setEditExposureMode] = useState<ExposureMode>("http");
  const [editEnvVars, setEditEnvVars] = useState<
    Array<{ key: string; value: string }>
  >([]);

  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [tagsLoading, setTagsLoading] = useState(false);
  const [tagsError, setTagsError] = useState<string | null>(null);

  const handleOpenEdit = () => {
    if (!isEditOpen && inspectData) {
      setEditName(inspectData.name);
      setEditImage(inspectData.image);
      setEditPort(
        inspectData.traefikPort ??
          inspectData.appPort?.replace(/\/tcp$/, "") ??
          "",
      );
      setEditExposureMode(
        (inspectData.traefikMethod as ExposureMode | null) === "tcp"
          ? "tcp"
          : inspectData.traefikPort
            ? "http"
            : inspectData.portBindings.length > 0
              ? "host"
              : "internal",
      );
      setEditEnvVars(inspectData.envVars.map((v) => ({ ...v })));
      setAvailableTags([]);
      setTagsError(null);
    }

    setIsEditOpen((prev) => !prev);
  };

  const handleFetchTags = async () => {
    const imageName = editImage.trim().split(":")[0] ?? "";

    if (!imageName) {
      return;
    }

    setTagsLoading(true);
    setTagsError(null);

    try {
      const response = await fetch(
        `/api/containers/catalog/tags?image=${encodeURIComponent(imageName)}`,
        { cache: "no-store" },
      );
      const payload = (await response.json()) as {
        tags?: string[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to fetch tags.");
      }

      const tags = payload.tags ?? [];
      setAvailableTags(tags);

      if (tags.length === 0) {
        setTagsError("No tags found or not a Docker Hub image.");
      }
    } catch (err) {
      setTagsError(
        err instanceof Error ? err.message : "Unable to fetch tags.",
      );
    } finally {
      setTagsLoading(false);
    }
  };

  const handleRecreate = async () => {
    const changes: RecreateChanges = {
      envVars: editEnvVars.filter((v) => v.key.trim().length > 0),
      exposureMode: editExposureMode,
      image: editImage.trim() || undefined,
      name: editName.trim() || undefined,
      port: editPort.trim() ? Number.parseInt(editPort, 10) : undefined,
    };

    await onRecreateAction(changes);
    setIsEditOpen(false);
  };

  const url =
    runtimeEntry?.display.endpoints[0]?.url ??
    runtimeEntry?.display.endpoints[0]?.name ??
    null;

  return (
    <main className="min-w-0 flex-1 overflow-auto bg-linear-to-b from-background/72 via-muted/12 to-background p-2 md:p-3">
      <div className="mx-auto flex max-w-7xl flex-col gap-2.5">

        {/* Header */}
        <section className="rounded-xl border border-border/70 bg-background/86 px-3 py-2.5 shadow-[0_18px_50px_-44px_rgba(15,23,42,0.35)]">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Badge variant={getKindBadgeVariant(inventoryMeta.kind)}>
                {formatKindLabel(inventoryMeta.kind)}
              </Badge>
              <h1 className="truncate text-sm font-semibold tracking-tight text-foreground md:text-base">
                {runtimeEntry?.sidebarName ?? "Containers"}
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {inventoryMeta.availableActions.map((action) => (
                <Button
                  disabled={!runtimeEntry || actionPending !== null}
                  key={action}
                  onClick={() => onRunAction(action)}
                  size="xs"
                  type="button"
                  variant={getActionVariant(action)}
                >
                  {actionPending === action
                    ? `${getActionLabel(action)}...`
                    : getActionLabel(action)}
                </Button>
              ))}
            </div>
          </div>
        </section>

        {/* Compact metrics row */}
        <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-lg border border-border/70 bg-background/88 px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              State
            </div>
            <div className="mt-0.5 text-sm font-semibold text-foreground">
              {runtime?.status ?? runtimeEntry?.display.status ?? "—"}
            </div>
            <div className="truncate text-[11px] text-muted-foreground">
              {runtime?.health ?? "unknown"}
            </div>
          </div>
          <div className="rounded-lg border border-border/70 bg-background/88 px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              CPU
            </div>
            <div className="mt-0.5 text-sm font-semibold text-foreground">
              {runtime ? formatPercent(runtime.cpuPercent, 1) : "—"}
            </div>
          </div>
          <div className="rounded-lg border border-border/70 bg-background/88 px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Memory
            </div>
            <div className="mt-0.5 text-sm font-semibold text-foreground">
              {runtime ? formatBytes(runtime.memoryBytes) : "—"}
            </div>
            <div className="truncate text-[11px] text-muted-foreground">
              {runtime ? formatPercent(runtime.memoryPercent, 1) : "—"}
            </div>
          </div>
          <div className="rounded-lg border border-border/70 bg-background/88 px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Network
            </div>
            <div className="mt-0.5 text-sm font-semibold text-foreground">
              {runtime
                ? formatBytesPerSecond(runtime.networkTotalBytesPerSecond)
                : "—"}
            </div>
          </div>
        </section>

        {/* Info chips */}
        <section className="rounded-xl border border-border/70 bg-background/88 px-3 py-3 shadow-[0_16px_42px_-36px_rgba(15,23,42,0.3)]">
          {runtimeEntry ? (
            <dl className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <InfoChip
                label="Container name"
                value={runtime?.name ?? runtimeEntry.display.name}
              />
              <InfoChip
                label="Container ID"
                mono
                value={
                  (runtime?.id ?? runtimeEntry.display.id)?.slice(0, 12) ?? null
                }
              />
              <InfoChip
                label="App port"
                mono
                value={inspectLoading ? "Loading…" : (inspectData?.appPort ?? "—")}
              />
              <InfoChip
                label="Traefik port"
                mono
                value={inspectLoading ? "Loading…" : (inspectData?.traefikPort ?? "—")}
              />
              <InfoChip
                label="Label"
                value={aliasDraft || runtimeEntry.sidebarName}
              />
              <InfoChip label="URL" value={url}>
                {url ? (
                  <a
                    className="truncate text-emerald-700 underline decoration-emerald-300 underline-offset-2 hover:text-emerald-800"
                    href={url}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {url}
                  </a>
                ) : (
                  <span className="text-muted-foreground">No Traefik route</span>
                )}
              </InfoChip>
              <InfoChip
                label="Version"
                mono
                value={inspectLoading ? "Loading…" : (inspectData?.imageVersion ?? "—")}
              />
              <InfoChip
                label="Image"
                mono
                value={
                  inspectLoading
                    ? "Loading…"
                    : (inspectData?.image ?? runtime?.name ?? "—")
                }
              />
            </dl>
          ) : (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Select a container to inspect its details.
            </p>
          )}
        </section>

        {/* Environment Variables */}
        {runtimeEntry ? (
          <section className="overflow-hidden rounded-xl border border-border/70 bg-background/88 shadow-[0_16px_42px_-36px_rgba(15,23,42,0.3)]">
            <button
              className="flex w-full items-center justify-between px-3 py-2.5 text-left transition hover:bg-muted/20"
              onClick={() => setIsEnvOpen((prev) => !prev)}
              type="button"
            >
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Environment Variables
                {inspectData ? ` (${inspectData.envVars.length})` : null}
              </span>
              <span className="text-muted-foreground">{isEnvOpen ? "▲" : "▼"}</span>
            </button>

            {isEnvOpen ? (
              <div className="border-t border-border/60 px-3 pb-3 pt-2">
                {inspectLoading ? (
                  <p className="py-2 text-xs text-muted-foreground">Loading…</p>
                ) : inspectData?.envVars.length ? (
                  <div className="overflow-auto rounded-md border border-border/60">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border/60 bg-muted/20">
                          <th className="px-2.5 py-1.5 text-left font-medium uppercase tracking-[0.1em] text-muted-foreground">
                            Key
                          </th>
                          <th className="px-2.5 py-1.5 text-left font-medium uppercase tracking-[0.1em] text-muted-foreground">
                            Value
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {inspectData.envVars.map(({ key, value }) => (
                          <tr
                            className="border-b border-border/40 last:border-0 odd:bg-muted/8"
                            key={key}
                          >
                            <td className="px-2.5 py-1.5 font-mono font-medium text-foreground">
                              {key}
                            </td>
                            <td className="max-w-xs truncate px-2.5 py-1.5 font-mono text-muted-foreground">
                              {maskIfSensitive(key, value)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="py-2 text-xs text-muted-foreground">
                    No environment variables set.
                  </p>
                )}
              </div>
            ) : null}
          </section>
        ) : null}

        {/* Edit Card */}
        {runtimeEntry ? (
          <section className="overflow-hidden rounded-xl border border-border/70 bg-background/88 shadow-[0_16px_42px_-36px_rgba(15,23,42,0.3)]">
            <button
              className="flex w-full items-center justify-between px-3 py-2.5 text-left transition hover:bg-muted/20"
              onClick={handleOpenEdit}
              type="button"
            >
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Edit Container
              </span>
              <span className="text-muted-foreground">{isEditOpen ? "▲" : "▼"}</span>
            </button>

            {isEditOpen ? (
              <div className="space-y-4 border-t border-border/60 px-3 pb-3 pt-3">
                {inventoryMeta.kind === "system" ? (
                  <p className="rounded-md border border-amber-300/80 bg-amber-50/80 px-3 py-2 text-xs text-amber-800">
                    System containers cannot be edited or recreated from this page.
                  </p>
                ) : (
                  <>
                    {/* Label — saves without recreate */}
                    <div className="space-y-1.5">
                      <label
                        className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground"
                        htmlFor="edit-label"
                      >
                        Label
                        <span className="ml-1.5 rounded bg-muted/50 px-1 py-0.5 text-[10px] normal-case tracking-normal text-muted-foreground">
                          saved locally
                        </span>
                      </label>
                      <div className="flex items-center gap-1.5">
                        <Input
                          className="h-8 flex-1 text-sm"
                          disabled={!inventoryMeta.canEditAlias}
                          id="edit-label"
                          onChange={(e) =>
                            onAliasDraftChangeAction(e.target.value)
                          }
                          value={aliasDraft}
                        />
                        <Button
                          disabled={!inventoryMeta.canEditAlias || !runtimeEntry}
                          onClick={onAliasSaveAction}
                          size="xs"
                          type="button"
                          variant="secondary"
                        >
                          Save label
                        </Button>
                      </div>
                    </div>

                    <hr className="border-border/60" />

                    {/* Fields that require recreate */}
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <label
                          className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground"
                          htmlFor="edit-name"
                        >
                          Name
                        </label>
                        <Input
                          className="h-8 text-sm"
                          id="edit-name"
                          onChange={(e) => setEditName(e.target.value)}
                          value={editName}
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label
                          className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground"
                          htmlFor="edit-port"
                        >
                          Port
                        </label>
                        <Input
                          className="h-8 text-sm"
                          id="edit-port"
                          inputMode="numeric"
                          onChange={(e) => setEditPort(e.target.value)}
                          placeholder="e.g. 80"
                          value={editPort}
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label
                          className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground"
                          htmlFor="edit-exposure"
                        >
                          Traefik method
                        </label>
                        <select
                          className="h-8 w-full rounded-md border border-input bg-background px-2.5 text-sm"
                          id="edit-exposure"
                          onChange={(e) =>
                            setEditExposureMode(e.target.value as ExposureMode)
                          }
                          value={editExposureMode}
                        >
                          <option value="http">HTTP — reverse proxy</option>
                          <option value="tcp">TCP — passthrough</option>
                          <option value="host">Host port — direct bind</option>
                          <option value="internal">Internal — no exposure</option>
                        </select>
                      </div>
                    </div>

                    {/* Version / image */}
                    <div className="space-y-1.5">
                      <label
                        className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground"
                        htmlFor="edit-image"
                      >
                        Image / Version
                      </label>
                      <div className="flex items-center gap-1.5">
                        <Input
                          className="h-8 flex-1 font-mono text-xs"
                          id="edit-image"
                          onChange={(e) => {
                            setEditImage(e.target.value);
                            setAvailableTags([]);
                          }}
                          placeholder="nginx:latest"
                          value={editImage}
                        />
                        <Button
                          disabled={tagsLoading || !editImage.trim()}
                          onClick={handleFetchTags}
                          size="xs"
                          type="button"
                          variant="secondary"
                        >
                          {tagsLoading ? "Loading…" : "Fetch tags"}
                        </Button>
                      </div>
                      {tagsError ? (
                        <p className="text-xs text-muted-foreground">{tagsError}</p>
                      ) : null}
                      {availableTags.length > 0 ? (
                        <div className="max-h-36 overflow-auto rounded-md border border-border/60 bg-background/70 p-1">
                          {availableTags.map((tag) => {
                            const baseName = editImage.trim().split(":")[0] ?? "";
                            return (
                              <button
                                className="flex w-full items-center rounded-md border border-transparent px-2 py-1 text-left text-xs transition hover:border-border/70 hover:bg-muted/20"
                                key={tag}
                                onClick={() => setEditImage(`${baseName}:${tag}`)}
                                type="button"
                              >
                                <span className="font-mono text-foreground">{tag}</span>
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>

                    {/* Env vars editor */}
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                        Environment Variables
                      </span>
                      <EnvRowEditor
                        envVars={editEnvVars}
                        onChange={setEditEnvVars}
                      />
                    </div>

                    {/* Recreate footer */}
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs text-muted-foreground">
                        {recreateError ? (
                          <span className="text-rose-700">{recreateError}</span>
                        ) : (
                          "Recreate will stop and replace the running container."
                        )}
                      </div>
                      <Button
                        disabled={recreatePending || !runtimeEntry}
                        onClick={handleRecreate}
                        size="xs"
                        type="button"
                      >
                        {recreatePending ? "Recreating…" : "Recreate"}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ) : null}
          </section>
        ) : null}

        {/* Action error */}
        {actionError ? (
          <section className="rounded-lg border border-amber-300/80 bg-amber-50/80 px-3 py-2 text-xs text-amber-900">
            {actionError}
          </section>
        ) : null}
      </div>
    </main>
  );
}
