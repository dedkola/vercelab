import { promises as fs } from "node:fs";
import path from "node:path";

function escapeEnvValue(value: string) {
  return JSON.stringify(value);
}

function normalizeEnvFile(source: string) {
  return source.replace(/\r\n/g, "\n");
}

export function getWorkspaceEnvPath() {
  return path.join(process.cwd(), ".env");
}

export async function readWorkspaceEnvFile() {
  try {
    const source = await fs.readFile(getWorkspaceEnvPath(), "utf8");
    return normalizeEnvFile(source);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return "";
    }

    throw error;
  }
}

export async function upsertWorkspaceEnvValue(key: string, value: string) {
  const source = await readWorkspaceEnvFile();
  const lines = source.length > 0 ? source.split("\n") : [];
  const nextLine = `${key}=${escapeEnvValue(value)}`;
  let didReplace = false;

  const updatedLines = lines.map((line) => {
    if (!new RegExp(`^${key}=`).test(line)) {
      return line;
    }

    didReplace = true;
    return nextLine;
  });

  if (!didReplace) {
    if (updatedLines.length > 0 && updatedLines.at(-1) !== "") {
      updatedLines.push("");
    }

    updatedLines.push(nextLine);
  }

  const nextSource = `${updatedLines.join("\n").replace(/\n*$/, "")}\n`;
  await fs.writeFile(getWorkspaceEnvPath(), nextSource, "utf8");
}
