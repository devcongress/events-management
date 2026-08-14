import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(async () => {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('APP_DATA_SOURCE', 'local-json');
  vi.resetModules();
  const { resetLocalPublicRateLimits } = await import('../lib/public-rate-limit');
  resetLocalPublicRateLimits();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('public email preflight API', () => {
  it('accepts and normalizes an address without changing any registration data', async () => {
    const app = (await import('./app')).default;
    const response = await app.request('http://localhost/api/public/email-preflight', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: '  AMA@Example.com  ' }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      accepted: true,
      status: 'deliverable',
      normalized_email: 'ama@example.com',
    });
  });

  it('returns a useful correction for a likely provider typo', async () => {
    const app = (await import('./app')).default;
    const response = await app.request('http://localhost/api/public/email-preflight', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'ama@gmial.com' }),
    });

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: 'Did you mean ama@gmail.com?',
      code: 'likely_typo',
      suggestion: 'ama@gmail.com',
    });
  });

  it('rejects disposable domains before a public form is submitted', async () => {
    const app = (await import('./app')).default;
    const response = await app.request('http://localhost/api/public/email-preflight', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'guest@mailinator.com' }),
    });

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ code: 'disposable_domain' });
  });
});
