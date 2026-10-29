import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { breakpoints, compactSnapshot, promoteTransaction, recoverTransaction, validateCatalog, validateSnapshot, withinDeadline } from './capture-boneyard.mjs';
import { hashBytes, mergeRegistry } from './rebuild-boneyard-registry.mjs';

const temporaryRoots: string[] = [];

async function transactionFixture() {
  const root = await mkdtemp(resolve(tmpdir(), 'ems-boneyard-'));
  const staging = '.auto-skeleton/staging-test';

  temporaryRoots.push(root);
  await mkdir(resolve(root, staging), { recursive: true });
  await mkdir(resolve(root, 'src/bones'), { recursive: true });
  await writeFile(resolve(root, 'src/bones/old.bones.json'), 'existing artifact');
  await writeFile(resolve(root, 'src/bones/registry.ts'), 'existing registry');
  await writeFile(resolve(root, '.auto-skeleton/manifest.json'), 'existing manifest');

  return { root, staging };
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Boneyard capture safety', () => {
  it('fails an unresolved browser readiness wait at its deadline and clears the timer', async () => {
    vi.useFakeTimers();

    try {
      const pending = withinDeadline(new Promise(() => {}), 'Fixture readiness deadline', 1000);
      const rejection = expect(pending).rejects.toThrow('Fixture readiness deadline');

      await vi.advanceTimersByTimeAsync(1000);
      await rejection;

      expect(vi.getTimerCount()).toBe(0);
      await expect(withinDeadline(Promise.resolve('ready'), 'Unused deadline')).resolves.toBe('ready');
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('uses every application breakpoint and rejects duplicate stable IDs', () => {
    expect(breakpoints).toEqual([390, 640, 768, 960, 1024, 1280]);

    const section = { id: 'test-section', route: '/events', sourcePaths: ['src/views/EventsView.vue'], capture: { maxWidth: 1280 } };

    expect(validateCatalog([section])).toEqual([section]);
    expect(() => validateCatalog([section, section])).toThrow('duplicate');
    expect(() => validateCatalog([{ ...section, id: '../outside' }])).toThrow('Unsafe');
  });

  it('serializes supported compact tuples without changing geometry or container flags', () => {
    const snapshot = {
      name: 'table-section', viewportWidth: 1280, width: 1216, height: 396,
      bones: [
        { x: 1.2345, y: 16, w: 22.9876, h: 19, r: 8 },
        { x: 0, y: 0, w: 100, h: 396, r: '50%', c: true },
      ],
    };
    const compact = compactSnapshot(snapshot);

    expect(compact.bones).toEqual([[1.2345, 16, 22.9876, 19, 8], [0, 0, 100, 396, '50%', true]]);
    expect({ ...compact, bones: snapshot.bones }).toEqual(snapshot);
    expect(JSON.parse(JSON.stringify(compact))).toEqual(compact);
    expect(validateSnapshot(compact, 'table-section', 1280)).toBe(compact);
  });

  it('rejects incomplete or invalid snapshots while allowing clipped scroll descendants', () => {
    const snapshot = { name: 'test-section', viewportWidth: 390, width: 358, height: 200, bones: [[0, 10, 50, 24, 6]] };

    expect(validateSnapshot(snapshot, 'test-section', 390)).toBe(snapshot);
    expect(() => validateSnapshot({ ...snapshot, bones: [] }, 'test-section', 390)).toThrow('Invalid');
    expect(() => validateSnapshot({ ...snapshot, bones: [[0, 190, 50, 24, 6]] }, 'test-section', 390)).not.toThrow();
    expect(() => validateSnapshot({ ...snapshot, bones: [[0, 10, Number.NaN, 24, 6]] }, 'test-section', 390)).toThrow('Invalid Boneyard bone');
    expect(() => validateSnapshot({ ...snapshot, bones: [[120, 10, 50, 24, 6]] }, 'test-section', 390)).toThrow('no visible bones');
  });

  it('preserves existing registry configuration and appends only new registrations once', () => {
    const existing = "import { configureBoneyard, registerBones } from 'boneyard-js/vue';\nconfigureBoneyard({ animate: false });\nregisterBones({ 'existing': existingBones });\n";
    const entries = [['existing', 'existing.bones.json'], ['new-section', 'new-section.bones.json']];
    const merged = mergeRegistry(existing, entries);

    expect(merged.startsWith(existing)).toBe(true);
    expect(merged.match(/new-section\.bones\.json/g)).toHaveLength(1);
    expect(mergeRegistry(merged, entries)).toBe(merged);
  });

  it('promotes artifacts and registry before completion metadata and preserves unrelated artifacts', async () => {
    const { root, staging } = await transactionFixture();
    let runtimeChecked = false;

    await promoteTransaction(root, staging, [
      { target: 'src/bones/new-section.bones.json', contents: 'new artifact' },
      { target: 'src/bones/registry.ts', contents: 'new registry' },
      { target: '.auto-skeleton/manifest.json', contents: 'new manifest' },
    ], async () => {
      expect(await readFile(resolve(root, 'src/bones/new-section.bones.json'), 'utf8')).toBe('new artifact');
      expect(await readFile(resolve(root, 'src/bones/registry.ts'), 'utf8')).toBe('new registry');
      expect(await readFile(resolve(root, '.auto-skeleton/manifest.json'), 'utf8')).toBe('existing manifest');
      runtimeChecked = true;
    });

    expect(runtimeChecked).toBe(true);
    expect(await readFile(resolve(root, '.auto-skeleton/manifest.json'), 'utf8')).toBe('new manifest');
    expect(await readFile(resolve(root, 'src/bones/old.bones.json'), 'utf8')).toBe('existing artifact');
    await expect(readFile(resolve(root, '.auto-skeleton/capture-journal.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rolls back this run when runtime verification fails', async () => {
    const { root, staging } = await transactionFixture();

    await expect(promoteTransaction(root, staging, [
      { target: 'src/bones/new-section.bones.json', contents: 'new artifact' },
      { target: 'src/bones/registry.ts', contents: 'new registry' },
      { target: '.auto-skeleton/manifest.json', contents: 'new manifest' },
    ], async () => { throw new Error('Runtime height mismatch'); })).rejects.toThrow('Runtime height mismatch');

    expect(await readFile(resolve(root, 'src/bones/registry.ts'), 'utf8')).toBe('existing registry');
    expect(await readFile(resolve(root, '.auto-skeleton/manifest.json'), 'utf8')).toBe('existing manifest');
    await expect(readFile(resolve(root, 'src/bones/new-section.bones.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('preserves outside edits and recovery backups when rollback cannot safely overwrite them', async () => {
    const { root, staging } = await transactionFixture();

    await expect(promoteTransaction(root, staging, [
      { target: 'src/bones/new-section.bones.json', contents: 'new artifact' },
      { target: 'src/bones/registry.ts', contents: 'new registry' },
      { target: '.auto-skeleton/manifest.json', contents: 'new manifest' },
    ], async () => {
      await writeFile(resolve(root, 'src/bones/registry.ts'), 'outside user edit');

      throw new Error('Runtime verification failed');
    })).rejects.toThrow('outside edit');

    expect(await readFile(resolve(root, 'src/bones/registry.ts'), 'utf8')).toBe('outside user edit');
    expect(await readFile(resolve(root, '.auto-skeleton/manifest.json'), 'utf8')).toBe('existing manifest');
    expect(await readFile(resolve(root, '.auto-skeleton/capture-journal.json'), 'utf8')).toContain('backup-1');
  });

  it('recovers an interrupted artifact promotion from its journal', async () => {
    const { root, staging } = await transactionFixture();
    const backup = `${staging}/backup-0`;

    await writeFile(resolve(root, backup), 'existing artifact');
    await writeFile(resolve(root, 'src/bones/old.bones.json'), 'replacement artifact');
    await writeFile(resolve(root, '.auto-skeleton/capture-journal.json'), JSON.stringify({
      version: 1, staging, entries: [
        { target: 'src/bones/old.bones.json', staged: `${staging}/write-0`, backup,
          beforeHash: hashBytes('existing artifact'), afterHash: hashBytes('replacement artifact') },
        { target: '.auto-skeleton/manifest.json', staged: `${staging}/write-1`, backup: null,
          beforeHash: hashBytes('existing manifest'), afterHash: hashBytes('new manifest') },
      ],
    }));

    await recoverTransaction(root);

    expect(await readFile(resolve(root, 'src/bones/old.bones.json'), 'utf8')).toBe('existing artifact');
    expect(await readFile(resolve(root, '.auto-skeleton/manifest.json'), 'utf8')).toBe('existing manifest');
  });
});
