import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEVCON26_ANNUAL_CFP_REDIRECT_ENABLED_ENV,
  DEVCON26_ANNUAL_CFP_WEBSITE_URL,
} from '@/lib/devcon26-annual-cfp-redirect';

const productionWorkerConfig = await readFile(new URL('../wrangler.toml', import.meta.url), 'utf8');

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('DevCon26 annual CFP website redirect', () => {
  it('keeps the handoff explicitly disabled in the production Worker configuration', () => {
    expect(productionWorkerConfig).toMatch(
      new RegExp(`${DEVCON26_ANNUAL_CFP_REDIRECT_ENABLED_ENV}\\s*=\\s*"false"`),
    );
  });

  it('leaves the public EMS page in place and tells the SPA the redirect is off by default', async () => {
    const { default: app } = await import('./app');
    const response = await app.request('https://em.devcongress.org/speak/c/2026');
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('Location')).toBeNull();
    expect(html).toContain('name="devcon26-annual-cfp-website-redirect-enabled" content="false"');
  });

  it('redirects exact GET and HEAD requests without forwarding user-controlled query values', async () => {
    const { default: app } = await import('./app');
    const env = { [DEVCON26_ANNUAL_CFP_REDIRECT_ENABLED_ENV]: 'true' };

    for (const method of ['GET', 'HEAD']) {
      for (const pathname of ['/speak/c/2026', '/speak/c/2026/']) {
        const response = await app.request(
          `https://em.devcongress.org${pathname}?token=private&next=https%3A%2F%2Fevil.example`,
          { method },
          env,
        );

        expect(response.status).toBe(302);
        expect(response.headers.get('Location')).toBe(DEVCON26_ANNUAL_CFP_WEBSITE_URL);
        expect(response.headers.get('Cache-Control')).toBe('no-store');
      }
    }
  });

  it('does not redirect neighboring page, API, private-link, or non-GET/HEAD routes', async () => {
    const { default: app } = await import('./app');
    const env = { [DEVCON26_ANNUAL_CFP_REDIRECT_ENABLED_ENV]: 'true' };

    for (const pathname of [
      '/speak/c/2025',
      '/speak/c/2026/extra',
      '/speak/m/event-123',
      '/conference-speakers/2026/private-token',
      '/organizer-console/annual-conference/2026/speakers',
      '/api/health',
      '/api/cfp/conferences/2026',
    ]) {
      const response = await app.request(`https://em.devcongress.org${pathname}`, {}, env);

      expect(response.status).not.toBe(302);
      expect(response.headers.get('Location')).not.toBe(DEVCON26_ANNUAL_CFP_WEBSITE_URL);
    }

    const post = await app.request(
      'https://em.devcongress.org/speak/c/2026',
      { method: 'POST' },
      env,
    );

    expect(post.status).not.toBe(302);
    expect(post.headers.get('Location')).not.toBe(DEVCON26_ANNUAL_CFP_WEBSITE_URL);
  });
});
