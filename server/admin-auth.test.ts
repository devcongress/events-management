import { describe, expect, it } from 'vitest';
import app from './app';

describe('organizer authentication contract', () => {
  it('does not expose the removed shared-password login endpoint', async () => {
    expect(app.routes).not.toContainEqual(expect.objectContaining({
      method: 'POST',
      path: '/api/auth/admin/login',
    }));

    const response = await app.request('/api/auth/admin/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ password: 'devcon-admin' }),
    });

    expect(response.status).toBe(401);
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('reports Supabase-only auth and whether it is configured', async () => {
    const response = await app.request('/api/auth/session');
    const payload = await response.json() as {
      authenticated: boolean;
      auth_mode: string;
      auth_configured: boolean;
    };

    expect(response.status).toBe(200);
    expect(payload.authenticated).toBe(false);
    expect(payload.auth_mode).toBe('supabase');
    expect(payload.auth_configured).toEqual(expect.any(Boolean));
  });

  it('signs out over HTTPS and expires both secure and local session cookies', async () => {
    const response = await app.request('https://em.devcongress.org/api/auth/logout', {
      method: 'POST',
      headers: {
        Origin: 'https://em.devcongress.org',
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ authenticated: false });

    const setCookie = response.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('__Host-devcon_admin=; Max-Age=0; Path=/; Secure');
    expect(setCookie).toContain('devcon_admin=; Max-Age=0; Path=/');
  });
});
