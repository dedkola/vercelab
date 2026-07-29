import { promises as fs } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const standaloneServerRoot = path.join(
  repositoryRoot,
  ".next",
  "standalone",
  ".next",
  "server",
);
const standaloneAppRoot = path.join(standaloneServerRoot, "app");
const standaloneChunksRoot = path.join(standaloneServerRoot, "chunks");
const relativeRequirePattern =
  /\brequire\(\s*["'](\.[^"']+)["']\s*\)/g;

async function listFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listFiles(entryPath)));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }

  return files;
}

async function verifyStandaloneBuild() {
  const [appFiles, chunkFiles, serverFiles] = await Promise.all([
    listFiles(standaloneAppRoot),
    listFiles(standaloneChunksRoot),
    listFiles(standaloneServerRoot),
  ]);

  const appJavaScriptFiles = appFiles.filter((file) => file.endsWith(".js"));
  const serverJavaScriptFiles = serverFiles.filter((file) =>
    file.endsWith(".js"),
  );

  if (appJavaScriptFiles.length === 0) {
    throw new Error("Standalone output does not contain any App Router files.");
  }

  if (chunkFiles.length === 0) {
    throw new Error("Standalone output does not contain any server chunks.");
  }

  const missingReferences = [];
  let checkedReferences = 0;

  for (const file of serverJavaScriptFiles) {
    const source = await fs.readFile(file, "utf8");
    const requireFromFile = createRequire(file);

    for (const match of source.matchAll(relativeRequirePattern)) {
      const reference = match[1];
      checkedReferences += 1;

      try {
        requireFromFile.resolve(reference);
      } catch {
        missingReferences.push({
          file: path.relative(repositoryRoot, file),
          reference,
        });
      }
    }
  }

  if (missingReferences.length > 0) {
    const details = missingReferences
      .map(({ file, reference }) => `- ${file}: ${reference}`)
      .join("\n");

    throw new Error(
      `Standalone output contains unresolved relative imports:\n${details}`,
    );
  }

  process.stdout.write(
    `[standalone-check] Verified ${appJavaScriptFiles.length} App Router files, ` +
      `${chunkFiles.length} server chunks, and ${checkedReferences} relative imports.\n`,
  );
}

verifyStandaloneBuild().catch((error) => {
  console.error(
    `[standalone-check] ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
