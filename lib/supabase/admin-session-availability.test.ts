import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), update: vi.fn(), configured: true }));

vi.mock('@/lib/supabase/server', () => ({
  isSupabaseServerConfigured: () => mocks.configured,
  getSupabaseAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ is: () => ({ maybeSingle: mocks.lookup }) }) }),
      update: mocks.update,
    }),
  }),
}));
vi.mock('@/server/env', () => ({ envValue: () => 'configured' }));

import { expireObservedAdminSession, getAdminSession, requireAdmin } from './admin-auth';

const app = new Hono();

app.get('/session', async (c) => c.json(await getAdminSession(c)));
app.post('/expire/:id', async (c) => {
  await expireObservedAdminSession(c, c.req.param('id'));

  return c.json({ ok: true });
});
app.get('/protected', async (c) => (await requireAdmin(c)) ?? c.json({ ok: true }));

describe('organizer session availability', () => {
  beforeEach(() => {
    mocks.configured = true;
    mocks.lookup.mockReset();
    mocks.update.mockReset();
  });

  it('returns an explicit session-loss signal when a session is absent', async () => {
    const response = await app.request('/protected');

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: 'ADMIN_SESSION_REQUIRED' });
  });

  it('fails closed with a server error when the membership lookup fails', async () => {
    mocks.lookup.mockResolvedValue({ data: null, error: { code: 'unavailable' } });

    const response = await app.request('/session', { headers: { cookie: 'devcon_admin=token' } });

    expect(response.status).toBe(500);
  });

  it('binds automatic expiry to both the observed id and the current cookie without setting cookies', async () => {
    const predicates: Array<[string, unknown]> = [];
    const chain = {
      eq: (key: string, value: unknown) => { predicates.push([key, value]);

 return chain; },
      is: (key: string, value: unknown) => { predicates.push([key, value]);

 return Promise.resolve({ error: null }); },
    };

    mocks.update.mockReturnValue(chain);
    const response = await app.request('/expire/old-id', { method: 'POST', headers: { cookie: 'devcon_admin=new-token' } });
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('new-token')))]
      .map(byte => byte.toString(16).padStart(2, '0')).join('');

    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(predicates).toEqual([['id', 'old-id'], ['token_hash', hash], ['revoked_at', null]]);
  });

  it('does not revoke a newer cookie session when an older tab expires', async () => {
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('new-token')))]
      .map(byte => byte.toString(16).padStart(2, '0')).join('');
    const session = { id: 'new-id', tokenHash: hash, revoked: false };

    mocks.update.mockImplementation(() => {
      const filters = new Map<string, unknown>();
      const chain = {
        eq: (key: string, value: unknown) => { filters.set(key, value);

 return chain; },
        is: () => {
          if (filters.get('id') === session.id && filters.get('token_hash') === session.tokenHash) session.revoked = true;

          return Promise.resolve({ error: null });
        },
      };

      return chain;
    });

    await app.request('/expire/old-id', { method: 'POST', headers: { cookie: 'devcon_admin=new-token' } });
    expect(session.revoked).toBe(false);
    await app.request('/expire/new-id', { method: 'POST', headers: { cookie: 'devcon_admin=new-token' } });
    expect(session.revoked).toBe(true);
  });

  it('fails closed without clearing cookies if revocation storage fails', async () => {
    const chain = { eq: () => chain, is: () => Promise.resolve({ error: { code: 'unavailable' } }) };

    mocks.update.mockReturnValue(chain);
    const response = await app.request('/expire/old-id', { method: 'POST', headers: { cookie: 'devcon_admin=token' } });

    expect(response.status).toBe(500);
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('reports an unknown or revoked token as anonymous', async () => {
    mocks.lookup.mockResolvedValue({ data: null, error: null });

    const response = await app.request('/session', { headers: { cookie: 'devcon_admin=token' } });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ authenticated: false });
  });
});
