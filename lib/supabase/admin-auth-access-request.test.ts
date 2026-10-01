import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getUser, getCookie, deleteCookie, setCookie } = vi.hoisted(() => ({
  getUser: vi.fn(),
  getCookie: vi.fn(),
  deleteCookie: vi.fn(),
  setCookie: vi.fn(),
}));
const calls: Array<{ table: string; action: string }> = [];
let memberships: Array<Record<string, unknown> | null> = [];
let revokeError: unknown = null;

function from(table: string) {
  const maybeSingle = async () => ({
    data: memberships.shift() ?? null,
    error: null,
  });

  return {
    select: () => ({
      eq: () => ({
        eq: () => ({ maybeSingle }),
        maybeSingle,
      }),
    }),
    insert: async () => {
      calls.push({ table, action: 'insert' });

      return { error: null };
    },
    update: () => ({
      eq: async () => {
        calls.push({ table, action: 'update' });

        return { error: table === 'admin_sessions' ? revokeError : null };
      },
    }),
  };
}

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: { getUser } }) }));
vi.mock('@/lib/supabase/server', () => ({ getSupabaseAdminClient: () => ({ from }), isSupabaseServerConfigured: () => true }));
vi.mock('@/server/env', () => ({ envValue: (name: string) => name === 'VITE_SUPABASE_URL' ? 'https://example.supabase.co' : name === 'VITE_SUPABASE_ANON_KEY' ? 'anon' : 'development' }));
vi.mock('hono/cookie', () => ({ getCookie, deleteCookie, setCookie }));

import { completeSupabaseAdminToken } from './admin-auth';

const context = { req: { url: 'http://localhost/api/auth/admin/exchange', header: () => null, method: 'POST', path: '/api/auth/admin/exchange' }, json: vi.fn(), header: vi.fn(), set: vi.fn(), get: vi.fn() } as never;
const user = { id: 'user-id', email: 'person@example.com', email_confirmed_at: '2026-01-01T00:00:00Z', app_metadata: { provider: 'google' }, identities: [], user_metadata: { full_name: 'Person' } };

describe('Google exchange request-session boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    calls.length = 0;
    memberships = [];
    revokeError = null;
    getCookie.mockReturnValue('old-admin-cookie');
    getUser.mockResolvedValue({ data: { user }, error: null });
  });

  it('revokes the old organizer session and creates only a request session for an unknown identity', async () => {
    memberships = [null];
    await expect(completeSupabaseAdminToken(context, 'token')).resolves.toMatchObject({ ok: true, outcome: 'access_request' });
    expect(calls.filter((call) => call.table === 'admin_sessions' && call.action === 'update')).toHaveLength(1);
    expect(calls.filter((call) => call.table === 'admin_sessions' && call.action === 'insert')).toHaveLength(0);
    expect(calls.filter((call) => call.table === 'admin_access_request_sessions' && call.action === 'update')).toHaveLength(1);
    expect(calls.filter((call) => call.table === 'admin_access_request_sessions' && call.action === 'insert')).toHaveLength(1);
    expect(deleteCookie).toHaveBeenCalledWith(context, 'devcon_admin', expect.objectContaining({ path: '/' }));
  });

  it('clears the old session and rejects disabled identities without a request session', async () => {
    memberships = [{ status: 'disabled' }];
    await expect(completeSupabaseAdminToken(context, 'token')).resolves.toMatchObject({ ok: false, status: 403 });
    expect(calls.filter((call) => call.table === 'admin_access_request_sessions' && call.action === 'update')).toHaveLength(1);
    expect(deleteCookie).toHaveBeenCalled();
  });

  it('uses normal organizer authentication for active memberships and revokes a request session', async () => {
    memberships = [{ status: 'active' }, { id: 'membership-id', status: 'active', role: 'organizer', display_name: 'Person' }];
    await expect(completeSupabaseAdminToken(context, 'token')).resolves.toMatchObject({ ok: true, outcome: 'authenticated' });
    expect(calls.filter((call) => call.table === 'admin_sessions' && call.action === 'insert')).toHaveLength(1);
    expect(calls.some((call) => call.table === 'admin_access_request_sessions' && call.action === 'insert')).toBe(false);
  });

  it('fails closed on old-session revocation failure while still expiring cookies', async () => {
    memberships = [null];
    revokeError = { message: 'database unavailable' };
    await expect(completeSupabaseAdminToken(context, 'token')).rejects.toThrow('Unable to revoke organizer session');
    expect(calls.some((call) => call.table === 'admin_access_request_sessions' && call.action === 'insert')).toBe(false);
    expect(deleteCookie).toHaveBeenCalled();
  });

  it('rejects unconfirmed and non-Google identities before data access', async () => {
    getUser.mockResolvedValueOnce({ data: { user: { ...user, email_confirmed_at: null } }, error: null });
    await expect(completeSupabaseAdminToken(context, 'token')).resolves.toMatchObject({ ok: false, status: 401 });
    getUser.mockResolvedValueOnce({ data: { user: { ...user, app_metadata: { provider: 'github' }, identities: [] } }, error: null });
    await expect(completeSupabaseAdminToken(context, 'token')).resolves.toMatchObject({ ok: false, status: 401 });
    expect(calls).toHaveLength(0);
  });
});
