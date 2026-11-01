import { beforeEach, describe, expect, it, vi } from 'vitest';
import { programmeSaveSchema } from '@/lib/annual-conference-programme';

const storage = vi.hoisted(() => ({ rows: [] as unknown[], remote: false, failure: false, queue: Promise.resolve() }));

vi.mock('@/lib/mock-db', () => ({
  readData: async () => storage.rows,
  updateData: async (_file: string, update: (rows: unknown[]) => { data: unknown[]; result: unknown }) => {
    const operation = storage.queue.then(() => {
      const value = update(storage.rows);

      storage.rows = value.data;

      return value.result;
    });

    storage.queue = operation.then(() => {});

    return operation;
  },
}));
vi.mock('@/lib/supabase/server', () => ({
  isSupabaseRuntimeEnabled: () => storage.remote,
  getSupabaseAdminClient: () => ({ rpc: async () => ({ data: null, error: storage.failure ? { message: 'unavailable' } : null }) }),
}));

import { createAnnualConferenceProgrammeRepository } from './annual-conference-programme-repository';

const row = (id: string, title: string) => ({ id, title, time: '', type: 'talk', lead: '', description: '', resourceTitle: '', resourceUrl: '' });
const a = row('14b4b5bc-4e3b-4c31-88a9-bc4ec1b099ab', 'A');
const b = row('24b4b5bc-4e3b-4c31-88a9-bc4ec1b099ab', 'B');
const input = (revision: number, rows: unknown[]) => programmeSaveSchema.parse({ revision, rows });

describe('programme repository', () => {
  beforeEach(() => {
    Object.assign(storage, { rows: [], remote: false, failure: false, queue: Promise.resolve() });
  });

  it('serializes first and stale saves, preserves order and clears without resetting revision', async () => {
    const repository = createAnnualConferenceProgrammeRepository();
    const first = await Promise.all([repository.save('one', input(0, [a]), 'a'), repository.save('one', input(0, [b]), 'b')]);

    expect(first.filter(Boolean)).toHaveLength(1);
    expect(await repository.save('one', input(1, [b, a]), 'a')).toBeTruthy();
    expect((await repository.get('one')).rows.map((item) => item.title)).toEqual(['B', 'A']);
    expect(await repository.save('two', input(0, [a]), 'a')).toBeTruthy();
    expect(await repository.save('one', input(2, []), 'a')).toBeTruthy();
    expect(await repository.get('one')).toMatchObject({ revision: 3, rows: [] });
    expect(await repository.get('two')).toMatchObject({ revision: 1, rows: [{ title: 'A' }] });
    expect(await repository.save('one', input(0, [b]), 'b')).toBeNull();
  });

  it('propagates Supabase failure without using mock storage', async () => {
    storage.remote = true;
    storage.failure = true;
    await expect(createAnnualConferenceProgrammeRepository().save('one', input(0, [a]), 'a')).rejects.toThrow('unavailable');
    expect(storage.rows).toEqual([]);
  });
});
