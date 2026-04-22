"use client";

import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ContainerListEntry } from "@/components/workspace-shell";
import type {
  ContainerAction,
  ContainerInventoryMeta,
} from "@/lib/container-inventory";
import {
  formatBytes,
  formatBytesPerSecond,
  formatPercent,
} from "@/lib/metrics-dashboard-metrics";

type ContainersMainContentProps = {
  actionError: string | null;
  actionPending: ContainerAction | null;
  aliasDraft: string;
  createPanel: ReactNode;
  inventoryMeta: ContainerInventoryMeta;
  isCreatePanelOpen: boolean;
  onAliasDraftChangeAction: (value: string) => void;
  onAliasSaveAction: () => void;
  onToggleCreatePanelAction: () => void;
  onRunAction: (action: ContainerAction) => void;
  runtimeEntry: ContainerListEntry | null;
};

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
  return action === "remove"
    ? ("danger" as const)
    : ("default" as const);
}

export function ContainersMainContent({
  actionError,
  actionPending,
  aliasDraft,
  createPanel,
  inventoryMeta,
  isCreatePanelOpen,
  onAliasDraftChangeAction,
  onAliasSaveAction,
  onToggleCreatePanelAction,
  onRunAction,
  runtimeEntry,
}: ContainersMainContentProps) {
  const runtime = runtimeEntry?.runtime ?? null;

  return (
    <main className="min-w-0 flex-1 overflow-auto bg-linear-to-b from-background/72 via-muted/12 to-background p-2 md:p-3">
      <div className="mx-auto flex max-w-7xl flex-col gap-2.5">
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
              <Button
                onClick={onToggleCreatePanelAction}
                size="xs"
                type="button"
                variant={isCreatePanelOpen ? "secondary" : "default"}
              >
                {isCreatePanelOpen ? "Close" : "Add"}
              </Button>

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

        {isCreatePanelOpen ? (
          <section className="rounded-xl border border-border/70 bg-background/88 px-3 py-3 shadow-[0_16px_42px_-36px_rgba(15,23,42,0.3)]">
            {createPanel}
          </section>
        ) : null}

        <section className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border border-border/70 bg-background/88 px-3 py-2.5">
            <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              State
            </div>
            <div className="mt-1 text-sm font-semibold text-foreground">
              {runtime?.status ?? runtimeEntry?.display.status ?? "Waiting"}
            </div>
            <div className="text-xs text-muted-foreground">
              {runtime?.health ?? "unknown"}
            </div>
          </div>

          <div className="rounded-lg border border-border/70 bg-background/88 px-3 py-2.5">
            <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              CPU
            </div>
            <div className="mt-1 text-sm font-semibold text-foreground">
              {runtime ? formatPercent(runtime.cpuPercent, 1) : "--"}
            </div>
          </div>

          <div className="rounded-lg border border-border/70 bg-background/88 px-3 py-2.5">
            <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              Memory
            </div>
            <div className="mt-1 text-sm font-semibold text-foreground">
              {runtime ? formatBytes(runtime.memoryBytes) : "--"}
            </div>
            <div className="text-xs text-muted-foreground">
              {runtime ? formatPercent(runtime.memoryPercent, 1) : "--"}
            </div>
          </div>

          <div className="rounded-lg border border-border/70 bg-background/88 px-3 py-2.5">
            <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              Network
            </div>
            <div className="mt-1 text-sm font-semibold text-foreground">
              {runtime
                ? formatBytesPerSecond(runtime.networkTotalBytesPerSecond)
                : "--"}
            </div>
          </div>
        </section>

        <section className="grid gap-2 lg:grid-cols-2">
          <section className="rounded-lg border border-border/70 bg-background/88 px-3 py-3">
            <dl className="grid gap-2 text-xs md:grid-cols-2">
              <div className="rounded-md border border-border/60 bg-muted/16 px-2.5 py-2">
                <dt className="uppercase tracking-[0.12em] text-muted-foreground">
                  Name
                </dt>
                <dd className="mt-1 truncate text-sm font-medium text-foreground">
                  {runtime?.name ?? runtimeEntry?.display.name ?? "--"}
                </dd>
              </div>
              <div className="rounded-md border border-border/60 bg-muted/16 px-2.5 py-2">
                <dt className="uppercase tracking-[0.12em] text-muted-foreground">
                  ID
                </dt>
                <dd className="mt-1 break-all font-medium text-foreground">
                  {runtime?.id ?? runtimeEntry?.display.id ?? "--"}
                </dd>
              </div>
              <div className="rounded-md border border-border/60 bg-muted/16 px-2.5 py-2">
                <dt className="uppercase tracking-[0.12em] text-muted-foreground">
                  Project
                </dt>
                <dd className="mt-1 font-medium text-foreground">
                  {runtime?.projectName ?? "Detached"}
                </dd>
              </div>
              <div className="rounded-md border border-border/60 bg-muted/16 px-2.5 py-2">
                <dt className="uppercase tracking-[0.12em] text-muted-foreground">
                  Service
                </dt>
                <dd className="mt-1 font-medium text-foreground">
                  {runtime?.serviceName ?? "Unknown"}
                </dd>
              </div>
              <div className="rounded-md border border-border/60 bg-muted/16 px-2.5 py-2 md:col-span-2">
                <dt className="uppercase tracking-[0.12em] text-muted-foreground">
                  Access
                </dt>
                <dd className="mt-1 flex flex-wrap gap-2 text-sm font-medium text-foreground">
                  {runtimeEntry?.display.endpoints.length ? (
                    runtimeEntry.display.endpoints.map((endpoint) => (
                      <a
                        className="truncate text-emerald-700 underline decoration-emerald-300 underline-offset-2"
                        href={endpoint.url ?? endpoint.name}
                        key={endpoint.name}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {endpoint.url ?? endpoint.name}
                      </a>
                    ))
                  ) : (
                    <span className="text-muted-foreground">
                      No Traefik route detected
                    </span>
                  )}
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-lg border border-border/70 bg-background/88 px-3 py-3">
            <div className="space-y-2">
              <label
                className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground"
                htmlFor="container-alias"
              >
                Label
              </label>
              <input
                className="h-9 w-full rounded-md border border-border/70 bg-background px-3 text-sm text-foreground outline-none transition focus:border-emerald-300/80"
                disabled={!inventoryMeta.canEditAlias}
                id="container-alias"
                onChange={(event) => onAliasDraftChangeAction(event.target.value)}
                value={aliasDraft}
              />
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs text-muted-foreground">
                  {inventoryMeta.note}
                </span>
                <Button
                  disabled={!inventoryMeta.canEditAlias || !runtimeEntry}
                  onClick={onAliasSaveAction}
                  size="xs"
                  type="button"
                >
                  Save
                </Button>
              </div>
            </div>
          </section>
        </section>

        {actionError ? (
          <section className="rounded-lg border border-amber-300/80 bg-amber-50/80 px-3 py-2 text-xs text-amber-900">
            {actionError}
          </section>
        ) : null}
      </div>
    </main>
  );
}