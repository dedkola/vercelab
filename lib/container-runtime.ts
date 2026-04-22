import "server-only";

import { spawn } from "node:child_process";

import type { ContainerAction } from "@/lib/container-inventory";

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