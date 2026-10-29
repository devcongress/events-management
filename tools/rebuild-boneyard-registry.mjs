import { createHash } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export function hashBytes(contents) {
  return createHash('sha256').update(contents).digest('hex');
}

export function appPath(root, path) {
  const absolutePath = resolve(root, path);
  const relativePath = relative(root, absolutePath);

  if (isAbsolute(path) || !relativePath || relativePath.startsWith(`..${sep}`) || relativePath === '..') {
    throw new Error(`Unsafe app-relative path: ${path}`);
  }

  return absolutePath;
}

export function validateManifest(manifest) {
  if (manifest.schemaVersion !== 1 || !manifest.sections || Array.isArray(manifest.sections) || typeof manifest.sections !== 'object') {
    throw new Error('Boneyard manifest is missing or has an unsupported schema. No artifacts were changed.');
  }

  return manifest;
}

export function artifactForSection(id, section) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
    throw new Error(`Unsafe Boneyard section ID: ${id}`);
  }

  const artifact = section.artifactPaths?.[0];

  if (artifact !== `src/bones/${id}.bones.json` || !section.artifactHashes?.[artifact]) {
    throw new Error(`Completed section ${id} is missing its expected artifact path or hash.`);
  }

  return artifact;
}

export async function registryEntries(root, manifest) {
  const entries = [];

  for (const [id, section] of Object.entries(manifest.sections)) {
    if (section.status !== 'completed') continue;

    const artifact = artifactForSection(id, section);
    const actualHash = hashBytes(await readFile(appPath(root, artifact)));

    if (actualHash !== section.artifactHashes[artifact]) {
      throw new Error(`Artifact hash mismatch for ${id}; refusing to rebuild the registry.`);
    }

    entries.push([id, artifact.slice('src/bones/'.length)]);
  }

  return entries;
}

// Keep existing imports, configuration, and unrelated registrations byte-for-byte.
// Only absent manifest registrations are appended in a single managed block.
export function mergeRegistry(existingRegistry, entries) {
  const additions = entries.filter(([id]) => !new RegExp(`["']${id}["']\\s*:`).test(existingRegistry));

  if (additions.length === 0) return existingRegistry;

  const suffix = hashBytes(JSON.stringify(additions)).slice(0, 10);
  const registerName = `registerAutoSkeletonBones${suffix}`;
  const block = [
    `import { registerBones as ${registerName} } from 'boneyard-js/vue';`,
    ...additions.map(([, fileName], index) => `import autoSkeletonBones${suffix}_${index} from './${fileName}';`),
    '',
    `${registerName}({`,
    ...additions.map(([id], index) => `  '${id}': autoSkeletonBones${suffix}_${index},`),
    '});',
    '',
  ].join('\n');

  return `${existingRegistry}${existingRegistry.endsWith('\n') || !existingRegistry ? '' : '\n'}\n${block}`;
}

export async function writeAtomically(path, contents) {
  const temporaryPath = resolve(dirname(path), `.${path.split(sep).at(-1)}.tmp-${process.pid}`);

  const handle = await open(temporaryPath, 'w');

  try {
    await handle.writeFile(contents);
    await handle.sync();
  } finally {
    await handle.close();
  }

  await rename(temporaryPath, path);
}

async function rebuildRegistry(root) {
  const manifest = validateManifest(JSON.parse(await readFile(resolve(root, '.auto-skeleton/manifest.json'), 'utf8')));
  const registryPath = resolve(root, 'src/bones/registry.ts');
  const existing = await readFile(registryPath, 'utf8').catch((error) => {
    if (error.code === 'ENOENT') return '';

    throw error;
  });
  const registry = mergeRegistry(existing, await registryEntries(root, manifest));

  if (registry === existing) {
    console.log('All completed Boneyard sections are registered; no files changed.');

    return;
  }

  await mkdir(resolve(root, '.auto-skeleton'), { recursive: true });

  const lockPath = resolve(root, '.auto-skeleton/capture.lock');
  const lock = await open(lockPath, 'wx').catch((error) => {
    if (error.code === 'EEXIST') throw new Error('Another Boneyard operation owns the capture lock; the registry was not changed.');

    throw error;
  });

  try {
    try {
      await readFile(resolve(root, '.auto-skeleton/capture-journal.json'));

      throw new Error('An interrupted capture must be recovered before rebuilding the Boneyard registry.');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }

    if (await readFile(registryPath, 'utf8').catch((error) => {
      if (error.code === 'ENOENT') return '';

      throw error;
    }) !== existing) throw new Error('The Boneyard registry changed while it was being validated.');

    await writeAtomically(registryPath, registry);
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await rebuildRegistry(process.cwd());
}
