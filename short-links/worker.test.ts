import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequest } from './functions/[[code]]';
import { resolveShortLinkRequest } from './redirect';

const env = () => ({
  PUBLIC_APP_ORIGIN: 'https://em.devcongress.org',
  EMS_RESOLVER_ORIGIN: 'https://em.devcongress.org',
  SHORT_LINK_RESOLVER_TOKEN: 'test-short-link-resolver-token-2026',
});

afterEach(() => vi.unstubAllGlobals());

describe('short-link Worker', () => {
  it.each(['/unavailable.css', '/robots.txt'])('passes the static asset %s to Pages', async (pathname) => {
    const next = vi.fn(async () => new Response('static asset', {
      status: 200,
      headers: { 'content-type': pathname.endsWith('.css') ? 'text/css' : 'text/plain' },
    }));

    const response = await onRequest({
      request: new Request(`https://go.devcongress.org${pathname}`),
      env: env(),
      next,
    });

    expect(next).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('static asset');
  });

  it('resolves an opaque code through EMS and uses a mutable redirect', async () => {
    const resolver = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://em.devcongress.org/api/internal/short-links/K7M4P');
      expect(new Headers(init?.headers).get('x-short-link-resolver-token')).toBe('test-short-link-resolver-token-2026');
      return new Response(JSON.stringify({ destination_path: '/r/august-meetup' }), { status: 200 });
    });
    vi.stubGlobal('fetch', resolver);
    const response = await resolveShortLinkRequest(new Request('https://go.devcongress.org/K7M4P'), env());
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('https://em.devcongress.org/r/august-meetup');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('does not become an open redirect or accept a code-shaped path with extra segments', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ destination_path: '//evil.example' }), { status: 200 }));
    const unsafe = await resolveShortLinkRequest(new Request('https://go.devcongress.org/K7M4P'), env());
    const extra = await resolveShortLinkRequest(new Request('https://go.devcongress.org/K7M4P/anything'), env());
    expect(unsafe.status).toBe(404);
    expect(extra.status).toBe(404);
  });

  it('returns the unavailable page when EMS cannot be reached', async () => {
    vi.stubGlobal('fetch', async () => { throw new Error('network unavailable'); });
    const response = await resolveShortLinkRequest(new Request('https://go.devcongress.org/K7M4P'), env());
    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(response.headers.get('content-security-policy')).toContain("img-src https://em.devcongress.org");
    expect(response.headers.get('content-security-policy')).toContain("style-src 'self'");
    expect(response.headers.get('content-security-policy')).toContain("style-src-attr 'none'");
    expect(response.headers.get('content-security-policy')).not.toContain("'unsafe-inline'");
    const page = await response.text();
    expect(page).toContain('This link left the building.');
    expect(page).toContain('<title>DevCongress | Link unavailable</title>');
    expect(page).toContain('https://em.devcongress.org/brand/favicon-32x32.png');
    expect(page).toContain('<link rel="stylesheet" href="/unavailable.css">');
    expect(page).not.toContain('<style>');
  });

  it('fails closed before contacting EMS when the resolver token is weak', async () => {
    const resolver = vi.fn();
    vi.stubGlobal('fetch', resolver);
    const response = await resolveShortLinkRequest(new Request('https://go.devcongress.org/K7M4P'), {
      ...env(),
      SHORT_LINK_RESOLVER_TOKEN: 'weak-token',
    });
    expect(response.status).toBe(404);
    expect(resolver).not.toHaveBeenCalled();
  });
});
