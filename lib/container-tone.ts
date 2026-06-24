import type { ContainerStats } from "@/lib/system-metrics";

export type ContainerTone = "running" | "stopped" | "unhealthy";

export function getContainerTone(
  container: Pick<ContainerStats, "health" | "status">,
): ContainerTone {
  if (container.health === "unhealthy") {
    return "unhealthy";
  }

  return container.status === "running" ? "running" : "stopped";
}
