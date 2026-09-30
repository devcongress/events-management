import { describe, expect, it, vi } from 'vitest';

const maybeSingle = vi.fn();
const eq = vi.fn(() => ({ is: vi.fn(() => ({ maybeSingle })) }));
const select = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ select }));

vi.mock('@/lib/supabase/server', () => ({ getSupabaseAdminClient: () => ({ from }) }));
vi.mock('hono/cookie', () => ({ getCookie: () => 'opaque-request-token', deleteCookie: vi.fn(), setCookie: vi.fn() }));

import { getAccessRequestSession } from './admin-access-requests';

describe('access request session', () => {
  it('fails closed for malformed and expired database expiry timestamps', async () => {
    maybeSingle.mockResolvedValueOnce({ data: { user_id: 'user', email: 'person@example.com', display_name: 'Person', expires_at: 'not-a-date' }, error: null });
    await expect(getAccessRequestSession({ req: { url: 'http://localhost/api/auth/admin/access-request' } } as never)).resolves.toBeNull();

    maybeSingle.mockResolvedValueOnce({ data: { user_id: 'user', email: 'person@example.com', display_name: 'Person', expires_at: '2000-01-01T00:00:00.000Z' }, error: null });
    await expect(getAccessRequestSession({ req: { url: 'http://localhost/api/auth/admin/access-request' } } as never)).resolves.toBeNull();
  });

  it('returns only an unrevoked, unexpired request identity', async () => {
    maybeSingle.mockResolvedValueOnce({ data: { user_id: 'user', email: 'person@example.com', display_name: 'Person', expires_at: '2099-01-01T00:00:00.000Z' }, error: null });
    await expect(getAccessRequestSession({ req: { url: 'http://localhost/api/auth/admin/access-request' } } as never)).resolves.toMatchObject({ userId: 'user', email: 'person@example.com' });
    expect(eq).toHaveBeenCalledWith('token_hash', expect.any(String));
  });
});
