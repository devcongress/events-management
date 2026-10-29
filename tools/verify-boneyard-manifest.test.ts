import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { hashBytes } from './rebuild-boneyard-registry.mjs';
import { verifyBoneyardManifest } from './verify-boneyard-manifest.mjs';

const temporaryRoots: string[] = [];

async function fixture() {
  const root = await mkdtemp(resolve(tmpdir(), 'ems-skeleton-integrity-'));
  const artifact = 'src/bones/sample-card.bones.json';
  const contents = '{"bones":[]}';
  const hash = hashBytes(contents);
  const manifest = {
    schemaVersion: 1,
    sections: {
      'sample-card': {
        status: 'completed',
        artifactPaths: [artifact],
        artifactHashes: { [artifact]: hash },
      },
    },
  };

  temporaryRoots.push(root);
  await mkdir(resolve(root, 'src/bones'), { recursive: true });
  await mkdir(resolve(root, '.auto-skeleton'), { recursive: true });
  await writeFile(resolve(root, artifact), contents);
  await writeFile(resolve(root, '.auto-skeleton/manifest.json'), JSON.stringify(manifest, null, 2));

  return { root, artifact, hash };
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe('skeleton hash inventory integrity', () => {
  it('verifies completed artifacts and every matching raw inventory row', async () => {
    const { root } = await fixture();

    await expect(verifyBoneyardManifest(root)).resolves.toEqual({ completedSections: 1, verifiedHashRows: 1 });
  });

  it('rejects artifacts whose bytes no longer match the manifest', async () => {
    const { root, artifact } = await fixture();

    await writeFile(resolve(root, artifact), 'changed artifact');

    await expect(verifyBoneyardManifest(root)).rejects.toThrow('Artifact hash mismatch');
  });

  it('rejects a mismatched duplicate row that JSON parsing would discard', async () => {
    const { root, artifact, hash } = await fixture();
    const path = resolve(root, '.auto-skeleton/manifest.json');
    const source = await readFile(path, 'utf8');
    const row = `"${artifact}": "${hash}"`;

    await writeFile(path, source.replace(row, `"${artifact}": "${'0'.repeat(64)}",\n        ${row}`));

    await expect(verifyBoneyardManifest(root)).rejects.toThrow('Skeleton artifact hash mismatch');
  });

  it('checks hash rows outside completed entries rather than trusting unused metadata', async () => {
    const { root, artifact } = await fixture();
    const path = resolve(root, '.auto-skeleton/manifest.json');
    const manifest = JSON.parse(await readFile(path, 'utf8'));

    manifest.unused = { [artifact]: '0'.repeat(64) };
    await writeFile(path, JSON.stringify(manifest, null, 2));

    await expect(verifyBoneyardManifest(root)).rejects.toThrow('Skeleton artifact hash mismatch');
  });
});
