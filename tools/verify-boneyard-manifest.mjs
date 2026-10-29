import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appPath, hashBytes, registryEntries, validateManifest } from './rebuild-boneyard-registry.mjs';

export async function verifyBoneyardManifest(root) {
  const source = await readFile(resolve(root, '.auto-skeleton/manifest.json'), 'utf8');
  const manifest = validateManifest(JSON.parse(source));
  const entries = await registryEntries(root, manifest);
  const inventoryRow = /^\s*"(src\/bones\/[a-z0-9-]+\.bones\.json)"\s*:\s*"([0-9a-f]{64})",?\s*$/gm;
  let verifiedHashRows = 0;

  // Check raw rows too: JSON parsing can discard duplicate keys, and hashes
  // outside completed entries must not gain an unchecked scan exception.
  for (const [, artifact, expectedHash] of source.matchAll(inventoryRow)) {
    const actualHash = hashBytes(await readFile(appPath(root, artifact)));

    if (actualHash !== expectedHash) {
      throw new Error(`Skeleton artifact hash mismatch for ${artifact}.`);
    }

    verifiedHashRows += 1;
  }

  return { completedSections: entries.length, verifiedHashRows };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await verifyBoneyardManifest(process.cwd());

    console.log(`Verified ${result.completedSections} completed skeleton artifacts and ${result.verifiedHashRows} raw SHA-256 inventory rows.`);
  } catch {
    console.error('Skeleton artifact integrity check failed. Inspect the manifest and artifact files; no files were changed.');
    process.exitCode = 1;
  }
}
