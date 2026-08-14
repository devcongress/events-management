import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';

const productionWorkerConfig = await readFile(new URL('../wrangler.toml', import.meta.url), 'utf8');

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('HTTP security boundaries', () => {
  it('keeps production Turnstile hostname binding on public domains only', () => {
    const match = productionWorkerConfig.match(/EVENT_SUBMISSION_TURNSTILE_EXPECTED_HOSTNAMES\s*=\s*"([^"]+)"/);
    expect(match?.[1]).toBe('devcongress.org,www.devcongress.org');
    expect(match?.[1]).not.toMatch(/(?:^|,)(?:localhost|127\.0\.0\.1)(?:,|$)/);
  });

  it('keeps production public API CORS on explicit website origins', () => {
    const match = productionWorkerConfig.match(/PUBLIC_API_CORS_ORIGINS\s*=\s*"([^"]+)"/);
    expect(match?.[1]).toBe('https://devcongress.org,https://www.devcongress.org');
    expect(match?.[1]).not.toContain('*');
  });

  it('adds browser security headers to API responses', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { default: app } = await import('./app');
    const response = await app.request('https://events.example.com/api/health');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(response.headers.get('content-security-policy')).toContain("style-src-attr 'none'");
    expect(response.headers.get('content-security-policy')).not.toContain("style-src 'self' 'unsafe-inline'");
    expect(response.headers.get('content-security-policy')).toContain(
      'frame-src https://challenges.cloudflare.com https://youtube.com https://www.youtube.com https://youtube-nocookie.com https://www.youtube-nocookie.com https://player.vimeo.com',
    );
    expect(response.headers.get('strict-transport-security')).toContain('max-age=63072000');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('permissions-policy')).toContain('camera=()');
    expect(response.headers.get('x-permitted-cross-domain-policies')).toBe('none');
    expect(response.headers.get('cache-control')).toBe('no-store');
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

  it('fails closed for localhost CORS when NODE_ENV is missing', async () => {
    vi.stubEnv('PUBLIC_FRONTEND_ORIGIN', 'https://events.example.com');
    const { default: app } = await import('./app');

    const response = await app.request('https://api.example.com/api/auth/session', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:5173',
        'Access-Control-Request-Method': 'GET',
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('allows public reads and intake only from configured website origins', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('PUBLIC_API_CORS_ORIGINS', 'https://devcongress.org,https://www.devcongress.org');
    const { default: app } = await import('./app');

    const allowedRead = await app.request('https://em.devcongress.org/api/public/events', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://devcongress.org',
        'Access-Control-Request-Method': 'GET',
      },
    });
    const rejectedRead = await app.request('https://em.devcongress.org/api/public/events', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://attacker.example',
        'Access-Control-Request-Method': 'GET',
      },
    });
    const allowedIntake = await app.request('https://em.devcongress.org/api/public/event-submissions', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://www.devcongress.org',
        'Access-Control-Request-Method': 'POST',
      },
    });
    const capabilityPreflight = await app.request('https://em.devcongress.org/api/public/event-submissions/management', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://devcongress.org',
        'Access-Control-Request-Method': 'GET',
      },
    });

    expect(allowedRead.headers.get('access-control-allow-origin')).toBe('https://devcongress.org');
    expect(rejectedRead.headers.get('access-control-allow-origin')).toBeNull();
    expect(allowedIntake.headers.get('access-control-allow-origin')).toBe('https://www.devcongress.org');
    expect(capabilityPreflight.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('rejects query-shaped cache keys on public read contracts', async () => {
    const { default: app } = await import('./app');
    const response = await app.request('http://localhost/api/public/events?limit=999999');
    const headResponse = await app.request('http://localhost/api/public/events?limit=999999', { method: 'HEAD' });

    expect(response.status).toBe(400);
    expect(headResponse.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Query parameters are not supported for this endpoint.',
    });
  });

  it('rejects oversized public JSON before route processing', async () => {
    const { default: app } = await import('./app');
    const responses = await Promise.all([
      app.request('http://localhost/api/public/email-preflight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'person@example.com', padding: 'x'.repeat(70 * 1024) }),
      }),
      app.request('http://localhost/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'x'.repeat(70 * 1024) }),
      }),
      app.request('http://localhost/api/quiz/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ join_code: 'ABC234', device_id: crypto.randomUUID(), padding: 'x'.repeat(70 * 1024) }),
      }),
      app.request('http://localhost/api/quiz/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: crypto.randomUUID(), user_id: crypto.randomUUID(), device_id: crypto.randomUUID(), padding: 'x'.repeat(70 * 1024) }),
      }),
    ]);

    expect(responses.map((response) => response.status)).toEqual([413, 413, 413, 413]);
    for (const response of responses) {
      await expect(response.json()).resolves.toEqual({ error: 'Request body is too large.' });
    }
  });

  it('keeps the complete System Design participant request flow outside organizer auth', async () => {
    const { default: app } = await import('./app');
    const requests = [
      app.request('http://localhost/api/quiz/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          join_code: 'invalid',
          device_id: 'invalid',
          purpose: 'system_design_learning',
        }),
      }),
      app.request('http://localhost/api/quiz/state?sessionId=invalid&userId=invalid'),
      app.request('http://localhost/api/quiz/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: 'invalid', user_id: 'invalid', answer_index: 0 }),
      }),
      app.request('http://localhost/api/quiz/participants/invalid/name', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: 'invalid', nickname: 'Ama' }),
      }),
    ];

    const responses = await Promise.all(requests);
    expect(responses.map((response) => response.status)).not.toContain(401);
    expect(responses.every((response) => response.status >= 400 && response.status < 500)).toBe(true);
  });
});
