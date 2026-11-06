import { afterEach, describe, expect, it, vi } from 'vitest';

// The Pages worker is plain JavaScript without a TypeScript declaration.
// @ts-expect-error Exercise the deployed worker directly.
const pagesWorker = await import('../public/_worker.js');

const id = '00000000-0000-4000-8000-000000000001';
const path = `/api/annual-conference/2026/speaker-updates/${id}/previews/${id}/recipients/${id}/html`;
const policy = "default-src 'none'; script-src 'none'; form-action 'none'; style-src 'unsafe-inline'; frame-ancestors 'self'";

afterEach(() => vi.unstubAllGlobals());

describe('Pages speaker preview proxy', () => {
  it('preserves the protected HTML security and cache headers', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<p>Frozen</p>', {
      headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': policy, 'cache-control': 'private, no-store', 'x-frame-options': 'SAMEORIGIN', 'referrer-policy': 'no-referrer' },
    })));
    const response = await pagesWorker.default.fetch(new Request(`https://em.devcongress.org${path}`, { headers: { cookie: 'session=test' } }), {});

    expect(await response.text()).toBe('<p>Frozen</p>');
    expect(response.headers.get('content-security-policy')).toBe(policy);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-frame-options')).toBe('SAMEORIGIN');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
  });

  it('keeps strict headers for errors, other paths, non-HTML, and missing upstream CSP', async () => {
    const cases = [
      { path, status: 409, contentType: 'application/json', csp: policy },
      { path: `${path}/other`, status: 200, contentType: 'text/html', csp: policy },
      { path, status: 200, contentType: 'application/json', csp: policy },
      { path, status: 200, contentType: 'text/html', csp: '' },
    ];

    for (const item of cases) {
      vi.stubGlobal('fetch', vi.fn(async () => new Response('response', { status: item.status, headers: { 'content-type': item.contentType, ...(item.csp ? { 'content-security-policy': item.csp } : {}) } })));
      const response = await pagesWorker.default.fetch(new Request(`https://em.devcongress.org${item.path}`), {});

      expect(response.headers.get('x-frame-options')).toBe('DENY');
      expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
      expect(response.headers.get('content-security-policy')).toContain("style-src-attr 'none'");
    }
  });
});
