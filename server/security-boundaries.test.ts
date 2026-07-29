import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('HTTP security boundaries', () => {
  it('adds browser security headers to API responses', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { default: app } = await import('./app');
    const response = await app.request('https://events.example.com/api/health');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(response.headers.get('content-security-policy')).toContain(
      'frame-src https://challenges.cloudflare.com https://youtube.com https://www.youtube.com https://youtube-nocookie.com https://www.youtube-nocookie.com https://player.vimeo.com',
    );
    expect(response.headers.get('strict-transport-security')).toContain('max-age=63072000');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('permissions-policy')).toContain('camera=()');
    expect(response.headers.get('x-request-id')).toBeTruthy();
  });

  it('returns credentialed CORS preflights and rejects untrusted origins in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('PUBLIC_FRONTEND_ORIGIN', 'https://events.example.com');
    const { default: app } = await import('./app');

    const allowed = await app.request('https://api.example.com/api/auth/session', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://events.example.com',
        'Access-Control-Request-Method': 'GET',
      },
    });
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get('access-control-allow-origin')).toBe('https://events.example.com');
    expect(allowed.headers.get('access-control-allow-credentials')).toBe('true');

    const rejected = await app.request('https://api.example.com/api/auth/session', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:5173',
        'Access-Control-Request-Method': 'GET',
      },
    });
    expect(rejected.status).toBe(204);
    expect(rejected.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('rejects oversized public JSON before route processing', async () => {
    const { default: app } = await import('./app');
    const response = await app.request('http://localhost/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'x'.repeat(70 * 1024) }),
    });

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ error: 'Request body is too large.' });
  });
});
