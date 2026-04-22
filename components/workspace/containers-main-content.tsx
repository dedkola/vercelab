"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ContainerListEntry } from "@/components/workspace-shell";
import type {
  ContainerAction,
  ContainerInventoryMeta,
} from "@/lib/container-runtime";
import {
  formatBytes,
  formatBytesPerSecond,
  formatPercent,
} from "@/lib/metrics-dashboard-metrics";

type ContainersMainContentProps = {
  actionError: string | null;
  actionPending: ContainerAction | null;
  aliasDraft: string;
  inventoryMeta: ContainerInventoryMeta;
  onAliasDraftChangeAction: (value: string) => void;
  onAliasSaveAction: () => void;
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
    ? ("destructive" as const)
    : ("outline" as const);
}

export function ContainersMainContent({
  actionError,
  actionPending,
  aliasDraft,
  inventoryMeta,
  onAliasDraftChangeAction,
  onAliasSaveAction,
  onRunAction,
  runtimeEntry,
}: ContainersMainContentProps) {
  const runtime = runtimeEntry?.runtime ?? null;

  return (
    <main className="min-w-0 flex-1 overflow-auto bg-linear-to-b from-background/72 via-muted/14 to-background p-4 md:p-5">
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <section className="rounded-[1.8rem] border border-border/70 bg-linear-to-br from-background via-muted/16 to-background px-5 py-5 shadow-[0_28px_90px_-58px_rgba(15,23,42,0.38)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={getKindBadgeVariant(inventoryMeta.kind)}>
                  {formatKindLabel(inventoryMeta.kind)}
                </Badge>
                <Badge className="border-border/60 bg-background/80 text-foreground">
                  Containers page
                </Badge>
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
                  {runtimeEntry?.sidebarName ?? "Containers"}
                </h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                  {runtimeEntry
                    ? inventoryMeta.note
                    : "Use the left sidebar to select a container. This first slice wires the new page, protected system classification, runtime lifecycle actions, and real logs in the right sidebar."}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {inventoryMeta.availableActions.map((action) => (
                <Button
                  disabled={!runtimeEntry || actionPending !== null}
                  key={action}
                  onClick={() => onRunAction(action)}
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

        <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-[1.5rem] border border-border/70 bg-background/88 px-4 py-4 shadow-[0_20px_60px_-48px_rgba(15,23,42,0.26)]">
                <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  Runtime state
                </div>
                <div className="mt-2 text-lg font-semibold text-foreground">
                  {runtime?.status ?? runtimeEntry?.display.status ?? "Waiting"}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Health {runtime?.health ?? "unknown"}
                </div>
              </div>

              <div className="rounded-[1.5rem] border border-border/70 bg-background/88 px-4 py-4 shadow-[0_20px_60px_-48px_rgba(15,23,42,0.26)]">
                <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  CPU
                </div>
                <div className="mt-2 text-lg font-semibold text-foreground">
                  {runtime ? formatPercent(runtime.cpuPercent, 1) : "--"}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Live host sample
                </div>
              </div>

              <div className="rounded-[1.5rem] border border-border/70 bg-background/88 px-4 py-4 shadow-[0_20px_60px_-48px_rgba(15,23,42,0.26)]">
                <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  Memory
                </div>
                <div className="mt-2 text-lg font-semibold text-foreground">
                  {runtime ? formatBytes(runtime.memoryBytes) : "--"}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {runtime ? formatPercent(runtime.memoryPercent, 1) : "No runtime sample"}
                </div>
              </div>

              <div className="rounded-[1.5rem] border border-border/70 bg-background/88 px-4 py-4 shadow-[0_20px_60px_-48px_rgba(15,23,42,0.26)]">
                <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  Network
                </div>
                <div className="mt-2 text-lg font-semibold text-foreground">
                  {runtime
                    ? formatBytesPerSecond(runtime.networkTotalBytesPerSecond)
                    : "--"}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Aggregate in/out throughput
                </div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <section className="rounded-[1.6rem] border border-border/70 bg-background/88 px-4 py-4 shadow-[0_22px_70px_-52px_rgba(15,23,42,0.28)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-foreground">
                      Selected container
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Live runtime identity, compose hints, and current limits.
                    </p>
                  </div>
                  <Badge className="border-border/60 bg-background/80 text-foreground">
                    {runtimeEntry?.sidebarSecondaryLabel ?? "No selection"}
                  </Badge>
                </div>

                <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
                  <div className="rounded-[1.2rem] border border-border/60 bg-muted/18 px-3 py-3">
                    <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                      Container name
                    </dt>
                    <dd className="mt-1 font-medium text-foreground">
                      {runtime?.name ?? runtimeEntry?.display.name ?? "--"}
                    </dd>
                  </div>
                  <div className="rounded-[1.2rem] border border-border/60 bg-muted/18 px-3 py-3">
                    <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                      Container id
                    </dt>
                    <dd className="mt-1 break-all font-medium text-foreground">
                      {runtime?.id ?? runtimeEntry?.display.id ?? "--"}
                    </dd>
                  </div>
                  <div className="rounded-[1.2rem] border border-border/60 bg-muted/18 px-3 py-3">
                    <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                      Compose project
                    </dt>
                    <dd className="mt-1 font-medium text-foreground">
                      {runtime?.projectName ?? "Detached runtime"}
                    </dd>
                  </div>
                  <div className="rounded-[1.2rem] border border-border/60 bg-muted/18 px-3 py-3">
                    <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                      Service
                    </dt>
                    <dd className="mt-1 font-medium text-foreground">
                      {runtime?.serviceName ?? "Unknown"}
                    </dd>
                  </div>
                </dl>
              </section>

              <section className="rounded-[1.6rem] border border-border/70 bg-background/88 px-4 py-4 shadow-[0_22px_70px_-52px_rgba(15,23,42,0.28)]">
                <div>
                  <h2 className="text-base font-semibold text-foreground">
                    Protected naming
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    System services keep host compose names intact. This page only starts the UI alias layer for those containers.
                  </p>
                </div>

                <div className="mt-4 space-y-3">
                  <label
                    className="block text-sm font-medium text-foreground"
                    htmlFor="container-alias"
                  >
                    Friendly label
                  </label>
                  <input
                    className="h-11 w-full rounded-2xl border border-border/70 bg-background px-4 text-sm text-foreground shadow-[0_18px_42px_-34px_rgba(15,23,42,0.2)] outline-none transition focus:border-emerald-300/80"
                    disabled={!inventoryMeta.canEditAlias}
                    id="container-alias"
                    onChange={(event) => onAliasDraftChangeAction(event.target.value)}
                    placeholder="Custom sidebar label"
                    value={aliasDraft}
                  />
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-muted-foreground">
                      {inventoryMeta.canEditAlias
                        ? "Alias changes stay in the UI for this first slice while backend preferences are added."
                        : "Alias editing is only enabled for protected and managed containers in this slice."}
                    </p>
                    <Button
                      disabled={!inventoryMeta.canEditAlias || !runtimeEntry}
                      onClick={onAliasSaveAction}
                      type="button"
                    >
                      Save label
                    </Button>
                  </div>
                </div>
              </section>
            </div>
          </div>

          <div className="space-y-4">
            <section className="rounded-[1.6rem] border border-dashed border-border/70 bg-background/86 px-4 py-4 shadow-[0_22px_64px_-54px_rgba(15,23,42,0.24)]">
              <h2 className="text-base font-semibold text-foreground">
                Creation lanes
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                This page is now live as the container inventory, logs, and runtime control surface. Image create, compose paste, and full config editors come next on top of this shell.
              </p>
              <div className="mt-4 grid gap-3">
                <div className="rounded-[1.2rem] border border-border/60 bg-muted/16 px-3 py-3">
                  <div className="font-medium text-foreground">
                    Deploy from image
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    Multi-registry image pulls, port and env inputs, and managed workload creation are planned on this surface next.
                  </div>
                </div>
                <div className="rounded-[1.2rem] border border-border/60 bg-muted/16 px-3 py-3">
                  <div className="font-medium text-foreground">
                    Paste compose
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    Compose YAML intake, service detection, and managed stack creation will attach to the same inventory and log rail.
                  </div>
                </div>
              </div>
            </section>

            {actionError ? (
              <section className="rounded-[1.4rem] border border-amber-200/80 bg-amber-50/80 px-4 py-3 text-sm text-amber-900 shadow-[0_18px_48px_-36px_rgba(180,83,9,0.28)]">
                {actionError}
              </section>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}