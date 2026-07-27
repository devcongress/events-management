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
});
