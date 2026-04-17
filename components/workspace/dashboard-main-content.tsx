"use client";

import type { MockContainer } from "@/components/workspace-shell";
import type { ContainerStats } from "@/lib/system-metrics";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

import {
  getToneClasses,
  SectionLabel,
  Sparkline,
  usePercentWidthRef,
} from "./workspace-ui";

type DashboardMainContentProps = {
  composeMetricDescription: string;
  composeMetricTitle: string;
  composeMetricValue: string;
  healthOrNodeLabel: string;
  projectOrRegionLabel: string;
  runtimeNotice: string | null;
  runtimePillLabel: string;
  sampleContextLabel: string;
  selectedContainer: MockContainer;
  selectedRuntimeContainer: ContainerStats | null;
  selectedStatusLabel: string;
  selectedStatusVariant: "success" | "warning" | "default";
  serviceOrPortLabel: string;
  thirdMetricDescription: string;
  thirdMetricTitle: string;
  thirdMetricValue: string;
};

function EndpointLoadBar({ load }: { load: number }) {
  const fillRef = usePercentWidthRef<HTMLDivElement>(load);

  return (
    <div className="mt-3 h-2 rounded-full bg-muted/70">
      <div
        className="h-2 rounded-full bg-linear-to-r from-emerald-400 to-amber-300"
        ref={fillRef}
      />
    </div>
  );
}

export function DashboardMainContent({
  composeMetricDescription,
  composeMetricTitle,
  composeMetricValue,
  healthOrNodeLabel,
  projectOrRegionLabel,
  runtimeNotice,
  runtimePillLabel,
  sampleContextLabel,
  selectedContainer,
  selectedRuntimeContainer,
  selectedStatusLabel,
  selectedStatusVariant,
  serviceOrPortLabel,
  thirdMetricDescription,
  thirdMetricTitle,
  thirdMetricValue,
}: DashboardMainContentProps) {
  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-[1.5rem] border border-border/70 bg-linear-to-r from-background via-muted/12 to-background shadow-[0_24px_72px_-56px_rgba(15,23,42,0.32)]">
        <div className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-col gap-2 lg:flex-row lg:items-center lg:gap-3">
            <SectionLabel icon="monitor" text="Focused container" />
            <div className="flex min-w-0 flex-wrap items-center gap-2.5">
              <h1 className="max-w-full truncate text-lg font-semibold tracking-tight text-foreground md:text-xl">
                {selectedContainer.name}
              </h1>
              <Badge variant={selectedStatusVariant}>
                {selectedStatusLabel}
              </Badge>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 lg:max-w-2xl lg:justify-end">
            <div className="min-w-34 rounded-full border border-border/60 bg-background/82 px-3 py-2 text-sm shadow-[0_18px_42px_-34px_rgba(15,23,42,0.22)]">
              <span className="mr-2 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                Runtime
              </span>
              <span className="font-semibold text-foreground">
                {runtimePillLabel}
              </span>
            </div>
            <div className="min-w-34 rounded-full border border-border/60 bg-background/82 px-3 py-2 text-sm shadow-[0_18px_42px_-34px_rgba(15,23,42,0.22)]">
              <span className="mr-2 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                {selectedRuntimeContainer ? "Health" : "Node"}
              </span>
              <span className="font-semibold text-foreground">
                {healthOrNodeLabel}
              </span>
            </div>
            <div className="min-w-34 rounded-full border border-border/60 bg-background/82 px-3 py-2 text-sm shadow-[0_18px_42px_-34px_rgba(15,23,42,0.22)]">
              <span className="mr-2 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                {selectedRuntimeContainer ? "Project" : "Region"}
              </span>
              <span className="font-semibold text-foreground">
                {projectOrRegionLabel}
              </span>
            </div>
            <div className="min-w-34 rounded-full border border-border/60 bg-background/82 px-3 py-2 text-sm shadow-[0_18px_42px_-34px_rgba(15,23,42,0.22)]">
              <span className="mr-2 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                {selectedRuntimeContainer ? "Service" : "Exposed port"}
              </span>
              <span className="font-semibold text-foreground">
                {serviceOrPortLabel}
              </span>
            </div>
          </div>
        </div>
      </section>

      {runtimeNotice ? (
        <div className="rounded-[1.35rem] border border-emerald-200/70 bg-linear-to-r from-emerald-50/80 via-background to-background px-4 py-3 text-sm text-muted-foreground shadow-[0_22px_52px_-42px_rgba(16,185,129,0.24)]">
          {runtimeNotice}
        </div>
      ) : null}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-4">
        <Card className="overflow-hidden border-border/70 bg-linear-to-br from-emerald-50/70 via-background to-background">
          <CardHeader className="border-b border-border/60">
            <CardTitle>CPU</CardTitle>
            <CardDescription>Current compute demand.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-3">
            <div className="text-2xl font-semibold tracking-tight text-foreground">
              {selectedContainer.cpu}
            </div>
            <Sparkline
              className="h-14"
              points={selectedContainer.signals[0].points}
              tone="emerald"
            />
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-border/70 bg-linear-to-br from-amber-50/70 via-background to-background">
          <CardHeader className="border-b border-border/60">
            <CardTitle>Memory</CardTitle>
            <CardDescription>Resident set and cache.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-3">
            <div className="text-2xl font-semibold tracking-tight text-foreground">
              {selectedContainer.memory}
            </div>
            <Sparkline
              className="h-14"
              points={selectedContainer.signals[1].points}
              tone="amber"
            />
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-border/70 bg-linear-to-br from-slate-50/80 via-background to-background">
          <CardHeader className="border-b border-border/60">
            <CardTitle>{thirdMetricTitle}</CardTitle>
            <CardDescription>{thirdMetricDescription}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-3">
            <div className="text-2xl font-semibold tracking-tight text-foreground">
              {thirdMetricValue}
            </div>
            <Sparkline
              className="h-14"
              points={selectedContainer.signals[2].points}
              tone="slate"
            />
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-border/70 bg-linear-to-br from-background via-muted/14 to-background">
          <CardHeader className="border-b border-border/60">
            <CardTitle>{composeMetricTitle}</CardTitle>
            <CardDescription>
              {selectedRuntimeContainer
                ? "Project and service labels from the runtime."
                : "Recent container churn."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-3">
            <div className="text-2xl font-semibold tracking-tight text-foreground">
              {composeMetricValue}
            </div>
            <div className="rounded-2xl border border-border/60 bg-background/80 px-3 py-3 text-xs leading-5 text-muted-foreground">
              {composeMetricDescription}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card className="overflow-hidden border-border/70 bg-card/92">
          <CardHeader className="border-b border-border/60 bg-linear-to-r from-muted/52 via-background to-background">
            <CardTitle>Current container signals</CardTitle>
            <CardDescription>
              Small trend cards tuned for a quiet, operational read.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 pt-4 lg:grid-cols-3">
            {selectedContainer.signals.map((signal) => {
              const toneClasses = getToneClasses(signal.tone);

              return (
                <div
                  className={cn(
                    "rounded-[1.35rem] border bg-linear-to-br px-4 py-4 shadow-[0_20px_52px_-44px_rgba(15,23,42,0.22)]",
                    toneClasses.border,
                    toneClasses.surface,
                  )}
                  key={signal.label}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold tracking-tight text-foreground">
                        {signal.label}
                      </div>
                      <div className="mt-1 text-xs leading-5 text-muted-foreground">
                        {signal.caption}
                      </div>
                    </div>
                    <div
                      className={cn("text-xs font-semibold", toneClasses.delta)}
                    >
                      {signal.delta}
                    </div>
                  </div>
                  <div className="mt-4 text-xl font-semibold tracking-tight text-foreground">
                    {signal.value}
                  </div>
                  <Sparkline
                    className="mt-4 h-16"
                    points={signal.points}
                    tone={signal.tone}
                  />
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-border/70 bg-card/92">
          <CardHeader className="border-b border-border/60 bg-linear-to-r from-muted/52 via-background to-background">
            <CardTitle>Runtime overview</CardTitle>
            <CardDescription>
              Topology, endpoints, and rollout notes for the selected workload.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[1.25rem] border border-border/60 bg-background/80 px-4 py-3">
                <div className="text-xs text-muted-foreground">Image</div>
                <div className="mt-1 text-sm font-semibold text-foreground">
                  {selectedContainer.image}
                </div>
              </div>
              <div className="rounded-[1.25rem] border border-border/60 bg-background/80 px-4 py-3">
                <div className="text-xs text-muted-foreground">Stack</div>
                <div className="mt-1 text-sm font-semibold text-foreground">
                  {selectedContainer.stack}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {selectedContainer.endpoints.length ? (
                selectedContainer.endpoints.map((endpoint) => (
                  <div
                    className="rounded-[1.2rem] border border-border/60 bg-background/80 px-4 py-3"
                    key={endpoint.name}
                  >
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <div className="font-semibold text-foreground">
                        {endpoint.name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {endpoint.latency} - {endpoint.uptime}
                      </div>
                    </div>
                    <EndpointLoadBar load={endpoint.load} />
                  </div>
                ))
              ) : (
                <div className="rounded-[1.2rem] border border-dashed border-border/70 bg-background/70 px-4 py-4 text-sm text-muted-foreground">
                  No live endpoint inspection is wired for this container yet.
                </div>
              )}
            </div>

            <div className="space-y-2 rounded-[1.2rem] border border-border/60 bg-background/80 px-4 py-3">
              {selectedContainer.timeline.length ? (
                selectedContainer.timeline.map((event) => (
                  <div className="flex gap-3 text-sm" key={event.label}>
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-500/80" />
                    <div>
                      <div className="font-semibold tracking-tight text-foreground">
                        {event.label}
                      </div>
                      <div className="text-xs leading-5 text-muted-foreground">
                        {event.detail}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-xs leading-5 text-muted-foreground">
                  Runtime notes will appear here when richer container
                  inspection data is connected.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden border-border/70 bg-card/92">
        <CardHeader className="border-b border-border/60 bg-linear-to-r from-muted/52 via-background to-background">
          <CardTitle>Environment and mounts</CardTitle>
          <CardDescription>
            Config, volumes, and attached context for the selected container.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 pt-4 lg:grid-cols-2">
          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Environment
            </div>
            {selectedContainer.environment.length ? (
              selectedContainer.environment.map((item) => (
                <div
                  className="rounded-[1.2rem] border border-border/60 bg-background/80 px-4 py-3"
                  key={item.key}
                >
                  <div className="text-xs text-muted-foreground">
                    {item.key}
                  </div>
                  <div className="mt-1 font-mono text-sm text-foreground">
                    {item.value}
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-[1.2rem] border border-dashed border-border/70 bg-background/70 px-4 py-4 text-sm text-muted-foreground">
                Environment inspection is not wired for this live runtime yet.
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Volumes
            </div>
            {selectedContainer.volumes.length ? (
              selectedContainer.volumes.map((volume) => (
                <div
                  className="rounded-[1.2rem] border border-border/60 bg-background/80 px-4 py-3"
                  key={volume}
                >
                  <div className="font-mono text-sm text-foreground">
                    {volume}
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-[1.2rem] border border-dashed border-border/70 bg-background/70 px-4 py-4 text-sm text-muted-foreground">
                Mount inspection is not wired for this live runtime yet.
              </div>
            )}
            {selectedContainer.tags.length ? (
              <div className="flex flex-wrap gap-2 pt-1">
                {selectedContainer.tags.map((tag) => (
                  <Badge
                    className="border-border/60 bg-muted/70 text-foreground"
                    key={tag}
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
            ) : null}
            <div className="rounded-[1.2rem] border border-border/60 bg-background/80 px-4 py-3 text-xs leading-5 text-muted-foreground">
              {sampleContextLabel}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
