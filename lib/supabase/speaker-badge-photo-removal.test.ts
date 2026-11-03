import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ client: vi.fn(), configured: vi.fn() }));

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdminClient: mocks.client,
  isSupabaseRuntimeEnabled: mocks.configured,
}));

import { removeSpeakerSocialCardPhoto } from './annual-conference-social-cards';

type Row = { id: string; photo_path: string | null; revoked_at: string | null; display_name: string; crop_x: number; crop_y: number; crop_scale: number };

function createClient(initial: Row, removeFails: boolean | 'throw' = false) {
  let row = { ...initial };
  let replaceBeforeUpdate = false;
  const remove = vi.fn(async () => {
    if (removeFails === 'throw') throw new Error('network failure');

    return { error: removeFails ? { message: 'storage failure' } : null };
  });

  function from() {
    let payload: Partial<Row> = {};
    const filters: Array<(value: Row) => boolean> = [];
    const query = {
      update(value: Partial<Row>) { payload = value;

 return query; },
      eq(key: keyof Row, value: unknown) { filters.push(item => item[key] === value);

 return query; },
      is(key: keyof Row, value: unknown) { filters.push(item => item[key] === value);

 return query; },
      select() { return query; },
      async maybeSingle() {
        if (replaceBeforeUpdate) row.photo_path = 'cards/card/new.jpg';
        if (!filters.every(filter => filter(row))) return { data: null, error: null };
        Object.assign(row, payload);

        return { data: { ...row }, error: null };
      },
      then(resolve: (value: { error: null }) => void) {
        if (filters.every(filter => filter(row))) Object.assign(row, payload);
        resolve({ error: null });
      },
    };

    return query;
  }

  return {
    from,
    storage: { from: () => ({ remove }) },
    remove,
    getRow: () => row,
    replaceOnUpdate: () => { replaceBeforeUpdate = true; },
  };
}

const initial: Row = { id: 'card', photo_path: 'cards/card/old.jpg', revoked_at: null, display_name: 'Speaker', crop_x: 0.5, crop_y: 0.5, crop_scale: 1 };

beforeEach(() => {
  mocks.configured.mockReturnValue(true);
});

describe('speaker badge photo removal', () => {
  it('detaches and removes the original object', async () => {
    const client = createClient(initial);

    mocks.client.mockReturnValue(client);
    const card = await removeSpeakerSocialCardPhoto('card', 'cards/card/old.jpg');

    expect(card?.photo_path).toBeNull();
    expect(client.remove).toHaveBeenCalledWith(['cards/card/old.jpg']);
  });

  it('does not delete a concurrently replaced object', async () => {
    const client = createClient(initial);

    client.replaceOnUpdate();
    mocks.client.mockReturnValue(client);
    expect(await removeSpeakerSocialCardPhoto('card', 'cards/card/old.jpg')).toBeNull();
    expect(client.getRow().photo_path).toBe('cards/card/new.jpg');
    expect(client.remove).not.toHaveBeenCalled();
  });

  it('restores the reference if storage removal fails', async () => {
    const client = createClient(initial, true);

    mocks.client.mockReturnValue(client);
    await expect(removeSpeakerSocialCardPhoto('card', 'cards/card/old.jpg')).rejects.toThrow('Unable to remove');
    expect(client.getRow().photo_path).toBe('cards/card/old.jpg');
  });

  it('restores the reference if the storage request throws', async () => {
    const client = createClient(initial, 'throw');

    mocks.client.mockReturnValue(client);
    await expect(removeSpeakerSocialCardPhoto('card', 'cards/card/old.jpg')).rejects.toThrow('Unable to remove');
    expect(client.getRow().photo_path).toBe('cards/card/old.jpg');
  });

});
