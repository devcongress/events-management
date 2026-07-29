import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalCwd = process.cwd();
let tempRoot: string;

async function importMockDb() {
  vi.resetModules();
  return import('./index');
}

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'devcon-mock-db-'));
  process.chdir(tempRoot);
  await fs.mkdir('data');
});

afterEach(async () => {
  vi.unstubAllEnvs();
  process.chdir(originalCwd);
  await fs.rm(tempRoot, { recursive: true, force: true });
});

describe('mock-db file store', () => {
  it('returns an empty collection when a data file has not been created yet', async () => {
    const { readData } = await importMockDb();

    await expect(readData('missing')).resolves.toEqual([]);
  });

  it('throws instead of hiding invalid JSON', async () => {
    const { readData } = await importMockDb();
    await fs.writeFile(path.join(tempRoot, 'data', 'broken.json'), '{not-json', 'utf-8');

    await expect(readData('broken')).rejects.toThrow('Unable to read data file');
  });

  it('writes through a temporary file and leaves the final JSON array readable', async () => {
    const { readData, writeData } = await importMockDb();

    await writeData('items', [{ id: 'one' }]);

    await expect(readData<{ id: string }>('items')).resolves.toEqual([{ id: 'one' }]);
    await expect(fs.readdir(path.join(tempRoot, 'data'))).resolves.toEqual(['items.json']);
  });

  it('does not downgrade hosted shared data to local files when Supabase credentials are missing', async () => {
    vi.stubEnv('APP_DATA_SOURCE', 'supabase');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    const { readData } = await importMockDb();

    await expect(readData('talks')).rejects.toThrow('Supabase server config is missing');
  });
});
