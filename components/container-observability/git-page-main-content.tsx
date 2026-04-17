"use client";

import type { FormEvent, ReactNode } from "react";

import type {
  ContainerSignal,
  MetricCard,
} from "@/components/container-observability-page";
import type { DashboardDeployment } from "@/lib/persistence";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupInput,
  InputGroupSuffix,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import { getToneClasses, Sparkline } from "./workspace-ui";

type GitPageMainContentProps = {
  baseDomain?: string;
  credentialSourceLabel: string;
  credentialSourceText: string;
  deployment: DashboardDeployment;
  deploymentEnvironment: Array<{ key: string; value: string }>;
  deploymentHref: string | null;
  deploymentModeLabel: string;
  deploymentOverviewMetrics: MetricCard[];
  deploymentSignals: ContainerSignal[];
  deploymentStatusLabel: string;
  deploymentStatusVariant: "success" | "warning" | "default";
  deploymentSummary: ReactNode | null;
  deploymentTimeline: Array<{ detail: string; label: string }>;
  isUpdating: boolean;
  onRefreshAction: () => void;
  onUpdateAppAction: (
    event: FormEvent<HTMLFormElement>,
  ) => void | Promise<void>;
  publicDomainLabel: string;
  repositoryPathName: string;
  summaryIncludesDeploymentHref: boolean;
};

export function GitPageMainContent({
  baseDomain,
  credentialSourceLabel,
  credentialSourceText,
  deployment,
  deploymentEnvironment,
  deploymentHref,
  deploymentModeLabel,
  deploymentOverviewMetrics,
  deploymentSignals,
  deploymentStatusLabel,
  deploymentStatusVariant,
  deploymentSummary,
  deploymentTimeline,
  isUpdating,
  onRefreshAction,
  onUpdateAppAction,
  publicDomainLabel,
  repositoryPathName,
  summaryIncludesDeploymentHref,
}: GitPageMainContentProps) {
  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-[1.75rem] border border-border/70 bg-linear-to-r from-background via-muted/20 to-background shadow-[0_32px_96px_-64px_rgba(15,23,42,0.42)]">
        <div className="px-5 py-5">
          <div className="max-w-3xl space-y-3">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
                  {deployment.appName}
                </h1>
                <Badge variant={deploymentStatusVariant}>
                  {deploymentStatusLabel}
                </Badge>
              </div>
              {deploymentSummary ? (
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                  {deploymentSummary}
                </p>
              ) : null}
              {!summaryIncludesDeploymentHref && deploymentHref ? (
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                  Deployment is live at{" "}
                  <a
                    className="font-medium text-foreground underline underline-offset-4 transition-colors hover:text-foreground/80"
                    href={deploymentHref}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {deploymentHref}
                  </a>
                  .
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-4">
        {deploymentOverviewMetrics.map((metric) => {
          const toneClasses = getToneClasses(metric.tone);

          return (
            <Card
              className={cn(
                "overflow-hidden border-border/70 bg-linear-to-br",
                toneClasses.surface,
              )}
              key={metric.title}
            >
              <CardHeader className="border-b border-border/60">
                <CardTitle>{metric.title}</CardTitle>
                <CardDescription>{metric.caption}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 pt-3">
                <div
                  className={cn(
                    "text-sm font-semibold uppercase tracking-[0.16em]",
                    toneClasses.delta,
                  )}
                >
                  {metric.delta}
                </div>
                <div className="text-2xl font-semibold tracking-tight text-foreground">
                  {metric.value}
                </div>
                <Sparkline
                  className="h-14"
                  points={metric.points}
                  tone={metric.tone}
                />
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card className="overflow-hidden border-border/70 bg-card/92">
          <CardHeader className="border-b border-border/60 bg-linear-to-r from-muted/52 via-background to-background">
            <CardTitle>Current app signals</CardTitle>
            <CardDescription>
              Rollout, routing, and source state for the selected GitHub app.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 pt-4 lg:grid-cols-3">
            {deploymentSignals.map((signal) => {
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
            <CardTitle>Deployment overview</CardTitle>
            <CardDescription>
              Source, route, and lifecycle context for the selected app.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[1.25rem] border border-border/60 bg-background/80 px-4 py-3">
                <div className="text-xs text-muted-foreground">Repository</div>
                <div className="mt-1 text-sm font-semibold text-foreground">
                  {deployment.repositoryName}
                </div>
              </div>
              <div className="rounded-[1.25rem] border border-border/60 bg-background/80 px-4 py-3">
                <div className="text-xs text-muted-foreground">Project</div>
                <div className="mt-1 text-sm font-semibold text-foreground">
                  {deployment.projectName}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="rounded-[1.2rem] border border-border/60 bg-background/80 px-4 py-3">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <div className="font-semibold text-foreground">
                    Public route
                  </div>
                  <div className="text-xs text-muted-foreground">
                    :{deployment.port}
                  </div>
                </div>
                <div className="mt-1 text-sm text-foreground">
                  https://{publicDomainLabel}
                </div>
              </div>

              <div className="rounded-[1.2rem] border border-border/60 bg-background/80 px-4 py-3">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <div className="font-semibold text-foreground">
                    Service selection
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {deploymentModeLabel}
                  </div>
                </div>
                <div className="mt-1 text-sm text-foreground">
                  {deployment.serviceName ??
                    "Auto-detect service from repository"}
                </div>
              </div>

              <div className="rounded-[1.2rem] border border-border/60 bg-background/80 px-4 py-3">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <div className="font-semibold text-foreground">
                    Credential path
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {credentialSourceLabel}
                  </div>
                </div>
                <div className="mt-1 text-sm text-foreground">
                  {credentialSourceText}
                </div>
              </div>
            </div>

            <div className="space-y-2 rounded-[1.2rem] border border-border/60 bg-background/80 px-4 py-3">
              {deploymentTimeline.map((event) => (
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
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden border-border/70 bg-card/92">
        <CardHeader className="border-b border-border/60 bg-linear-to-r from-muted/52 via-background to-background">
          <CardTitle>Settings and environment</CardTitle>
          <CardDescription>
            Editable deployment fields paired with runtime environment details.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 pt-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <form
            className="space-y-4"
            key={deployment.id}
            onSubmit={onUpdateAppAction}
          >
            <input name="deploymentId" type="hidden" value={deployment.id} />

            <div className="rounded-[1.2rem] border border-border/60 bg-background/80 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Editable fields
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label
                    className="text-xs font-medium text-muted-foreground"
                    htmlFor="app-name"
                  >
                    App name
                  </Label>
                  <Input
                    className="h-10 rounded-xl bg-background/80"
                    defaultValue={deployment.appName}
                    id="app-name"
                    name="appName"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label
                    className="text-xs font-medium text-muted-foreground"
                    htmlFor="app-port"
                  >
                    Port
                  </Label>
                  <Input
                    className="h-10 rounded-xl bg-background/80"
                    defaultValue={String(deployment.port)}
                    id="app-port"
                    inputMode="numeric"
                    name="port"
                  />
                </div>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">
                    Subdomain
                  </Label>
                  <InputGroup>
                    <InputGroupInput
                      defaultValue={deployment.subdomain}
                      name="subdomain"
                    />
                    {baseDomain ? (
                      <InputGroupSuffix>.{baseDomain}</InputGroupSuffix>
                    ) : null}
                  </InputGroup>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">
                    Branch
                  </Label>
                  <Input
                    className="h-10 rounded-xl bg-background/70"
                    disabled
                    readOnly
                    value={deployment.branch ?? "Default branch"}
                  />
                </div>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">
                    Repository
                  </Label>
                  <Input
                    className="h-10 rounded-xl bg-background/70"
                    disabled
                    readOnly
                    value={repositoryPathName}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">
                    Service name
                  </Label>
                  <Input
                    className="h-10 rounded-xl bg-background/70"
                    disabled
                    readOnly
                    value={deployment.serviceName ?? "Auto-detect"}
                  />
                </div>
              </div>
            </div>

            <div className="rounded-[1.2rem] border border-border/60 bg-background/80 p-4">
              <Label
                className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground"
                htmlFor="app-env"
              >
                Env variables
              </Label>
              <textarea
                className="mt-4 min-h-44 w-full rounded-2xl border border-input/80 bg-background/80 px-3 py-3 text-sm text-foreground shadow-[0_14px_34px_-26px_rgba(15,23,42,0.28)] outline-none transition focus:border-ring focus:ring-1 focus:ring-ring/70"
                defaultValue={deployment.envVariables ?? ""}
                id="app-env"
                name="envVariables"
                placeholder="KEY=value"
              />
              <p className="mt-3 text-xs text-muted-foreground">
                Use one KEY=VALUE pair per line. Blank lines are ignored.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                className="h-9 px-4"
                disabled={isUpdating}
                size="sm"
                type="submit"
              >
                {isUpdating ? "Saving..." : "Save changes"}
              </Button>
              <Button
                className="h-9 px-4"
                onClick={onRefreshAction}
                size="sm"
                type="button"
                variant="secondary"
              >
                Refresh snapshot
              </Button>
            </div>
          </form>

          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Environment
            </div>
            {deploymentEnvironment.length ? (
              deploymentEnvironment.map((item) => (
                <div
                  className="rounded-[1.2rem] border border-border/60 bg-background/80 px-4 py-3"
                  key={`${item.key}-${item.value}`}
                >
                  <div className="text-xs text-muted-foreground">
                    {item.key}
                  </div>
                  <div className="mt-1 font-mono text-sm text-foreground">
                    {item.value || "(empty)"}
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-[1.2rem] border border-dashed border-border/70 bg-background/70 px-4 py-4 text-sm text-muted-foreground">
                No runtime environment variables are stored for this deployment
                yet.
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <Badge className="border-border/60 bg-muted/70 text-foreground">
                {deploymentModeLabel}
              </Badge>
              <Badge className="border-border/60 bg-muted/70 text-foreground">
                {deployment.tokenStored ? "Encrypted token" : "Server token"}
              </Badge>
              <Badge className="border-border/60 bg-muted/70 text-foreground">
                {deployment.branch ?? "Default branch"}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
