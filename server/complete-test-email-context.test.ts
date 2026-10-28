import type { Context } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase/server', () => ({ getSupabaseAdminClient: () => ({ rpc }) }));

import { completeTestEmailContext } from './complete-test-email-context';

beforeEach(() => {
  rpc.mockReset();
});

describe('per-order ticket email context', () => {
  it.each(['https://devcongress.org', 'https://www.devcongress.org', 'https://preview.account.workers.dev'])('accepts exact stored HTTPS origin %s', async (origin) => {
    rpc.mockResolvedValue({ error: null, data: { is_test: true, allowed: true, origin } });

    await expect(completeTestEmailContext({} as Context, 'admission', 'delivery')).resolves.toEqual({ is_test: true, allowed: true, origin });
  });

  it.each(['https://devcongress.org/', 'http://devcongress.org', 'https://user@devcongress.org', 'https://devcongress.org/path', 'https://devcongress.org?x=1', 'https://localhost'])('rejects a noncanonical test origin %s', async (origin) => {
    rpc.mockResolvedValue({ error: null, data: { is_test: true, allowed: true, origin } });

    await expect(completeTestEmailContext({} as Context, 'admission', 'delivery')).rejects.toThrow();
  });

  it('preserves recipient denial and fails closed on policy errors', async () => {
    rpc.mockResolvedValueOnce({ error: null, data: { is_test: true, allowed: false, origin: 'https://devcongress.org' } });

    await expect(completeTestEmailContext({} as Context, 'social', 'delivery')).resolves.toMatchObject({ allowed: false });
    rpc.mockResolvedValueOnce({ error: { message: 'unavailable' }, data: null });
    await expect(completeTestEmailContext({} as Context, 'admission', 'delivery')).rejects.toThrow('policy is unavailable');
  });
});
