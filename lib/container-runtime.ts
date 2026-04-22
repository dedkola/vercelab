import { spawn } from "node:child_process";

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

type CommandOptions = {
  cwd?: string;
  env?: Partial<NodeJS.ProcessEnv>;
};

async function runCommand(
  command: string,
  args: string[],
  options: CommandOptions = {},
) {
  return await new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: {
        ...process.env,
        ...options.env,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      const output = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n");

      if (code === 0) {
        resolve(output);
        return;
      }

      reject(
        new Error(
          [output, `${command} ${args.join(" ")} exited with status ${code}.`]
            .filter(Boolean)
            .join("\n"),
        ),
      );
    });
  });
}

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
    canEditAlias: false,
    kind: "unmanaged",
    note: "External runtime container. You can inspect logs and basic lifecycle state here before import flows are added.",
  };
}

export async function readContainerRuntimeLog(
  containerRef: string,
  options?: {
    tail?: number;
    timestamps?: boolean;
  },
) {
  const tail = Math.max(1, Math.min(options?.tail ?? 150, 500));
  const args = ["logs", `--tail=${tail}`];

  if (options?.timestamps ?? true) {
    args.push("--timestamps");
  }

  args.push(containerRef);

  const output = await runCommand("docker", args);

  return {
    output,
    tail,
    updatedAt: new Date().toISOString(),
  };
}

export async function runContainerAction(
  containerRef: string,
  action: ContainerAction,
) {
  switch (action) {
    case "start":
      await runCommand("docker", ["start", containerRef]);
      break;
    case "stop":
      await runCommand("docker", ["stop", containerRef]);
      break;
    case "restart":
      await runCommand("docker", ["restart", containerRef]);
      break;
    case "remove":
      await runCommand("docker", ["rm", "-f", containerRef]);
      break;
  }

  return {
    action,
    updatedAt: new Date().toISOString(),
  };
}