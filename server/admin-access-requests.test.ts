import { describe, expect, it } from 'vitest';
import app from './app';

describe('admin access request transport boundary', () => {
  it('rejects a cross-origin token exchange before parsing a text/plain body or setting cookies', async () => {
    const response = await app.request('https://em.devcongress.org/api/auth/admin/exchange', {
      method: 'POST',
      headers: { Origin: 'https://attacker.example', 'Content-Type': 'text/plain' },
      body: JSON.stringify({ access_token: 'forged-token' }),
    });

    expect(response.status).toBe(403);
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('does not treat an access-request cookie as organizer authentication', async () => {
    const response = await app.request('https://em.devcongress.org/api/admin/access-requests', {
      headers: { Cookie: '__Host-devcon_access_request=opaque-request-token' },
    });

    expect(response.status).toBe(401);
  });

  it('rejects forged request form identity when no verified request session exists', async () => {
    const response = await app.request('http://localhost/api/auth/admin/access-request', {
      method: 'POST',
      headers: { Origin: 'http://localhost', 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'owner@example.com', role: 'owner', display_name: 'Forged' }),
    });

    expect(response.status).toBe(401);
  });
});
