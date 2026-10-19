import { createHash } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const manifestPath = resolve(root, ".auto-skeleton/manifest.json");
const registryPath = resolve(root, "src/bones/registry.ts");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

if (manifest.schemaVersion !== 1 || !manifest.sections) {
  throw new Error("Boneyard manifest is missing or has an unsupported schema.");
}

const entries = [];

for (const [id, section] of Object.entries(manifest.sections)) {
  if (section.status !== "completed") continue;

  const relativeArtifactPath = section.artifactPaths?.[0];
  const expectedHash = section.artifactHashes?.[relativeArtifactPath];

  if (!relativeArtifactPath || !expectedHash) {
    throw new Error(`Completed section ${id} is missing an artifact path or hash.`);
  }

  const artifact = await readFile(resolve(root, relativeArtifactPath));
  const actualHash = createHash("sha256").update(artifact).digest("hex");

  if (actualHash !== expectedHash) {
    throw new Error(`Artifact hash mismatch for ${id}; refusing to rebuild the registry.`);
  }

  entries.push([id, relativeArtifactPath.replace("src/bones/", "")]);
}

const registry = [
  'import { registerBones } from "boneyard-js/vue";',
  ...entries.map(([id, fileName], index) => `import bones${index} from "./${fileName}";`),
  "",
  "registerBones({",
  ...entries.map(([id], index) => `  "${id}": bones${index},`),
  "});",
  "",
].join("\n");

const temporaryPath = `${registryPath}.tmp-${process.pid}`;

await writeFile(temporaryPath, registry);
await rename(temporaryPath, registryPath);
