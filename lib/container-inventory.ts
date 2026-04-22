import type { ContainerListEntry } from "@/components/workspace-shell";
import type { ContainerStats } from "@/lib/system-metrics";

export type ContainerAction = "remove" | "restart" | "start" | "stop";
export type ContainerInventoryKind = "managed" | "system" | "unmanaged";

export type ContainerInventoryMeta = {
  availableActions: ContainerAction[];
  canEditAlias: boolean;
  kind: ContainerInventoryKind;
  note: string;
};

const SYSTEM_CONTAINER_NAMES = new Set([
  "traefik",
  "vercelab-influxdb",
  "vercelab-influxdb-explorer",
  "vercelab-postgres",
  "vercelab-ui",
]);

const SYSTEM_SERVICE_NAMES = new Set([
  "control-plane",
  "influxdb",
  "influxdb-explorer",
  "postgres",
  "traefik",
]);

export function isSystemContainer(runtime: ContainerStats | null) {
  if (!runtime) {
    return false;
  }

  if (SYSTEM_CONTAINER_NAMES.has(runtime.name)) {
    return true;
  }

  return (
    runtime.projectName === "vercelab" &&
    typeof runtime.serviceName === "string" &&
    SYSTEM_SERVICE_NAMES.has(runtime.serviceName)
  );
}

export function getContainerInventoryMeta(
  entry: ContainerListEntry | null,
): ContainerInventoryMeta {
  if (!entry) {
    return {
      availableActions: [],
      canEditAlias: false,
      kind: "unmanaged",
      note: "Select a container to inspect its runtime details.",
    };
  }

  if (!entry.runtime) {
    return {
      availableActions: [],
      canEditAlias: false,
      kind: entry.deploymentStatus ? "managed" : "unmanaged",
      note: "No live runtime container is attached to this record right now, so lifecycle actions are disabled.",
    };
  }

  if (isSystemContainer(entry.runtime)) {
    return {
      availableActions: ["restart"],
      canEditAlias: true,
      kind: "system",
      note: "Protected Vercelab service. Runtime actions stay intentionally minimal on this page.",
    };
  }

  if (entry.deploymentStatus) {
    return {
      availableActions:
        entry.runtime.status === "running"
          ? ["restart", "stop", "remove"]
          : ["start", "remove"],
      canEditAlias: true,
      kind: "managed",
      note: "Managed workload. Runtime lifecycle actions work now; image, compose, ports, and env editing land in the next slice.",
    };
  }

  return {
    availableActions:
      entry.runtime.status === "running"
        ? ["restart", "stop", "remove"]
        : ["start", "remove"],
    canEditAlias: true,
    kind: "unmanaged",
    note: "External runtime container. You can inspect logs, manage lifecycle state, and set a local label on this page.",
  };
}