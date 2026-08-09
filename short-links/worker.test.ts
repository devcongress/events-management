import { describe, expect, it } from 'vitest';
import worker from './worker';

const env = (response: Response) => ({
  PUBLIC_APP_ORIGIN: 'https://em.devcongress.org',
  SHORT_LINK_RESOLVER_TOKEN: 'test-token',
  EMS: { fetch: async (request: Request) => {
    expect(request.headers.get('x-short-link-resolver-token')).toBe('test-token');
    return response;
  } },
});

describe('short-link Worker', () => {
  it('resolves an opaque code through EMS and uses a mutable redirect', async () => {
    const response = await worker.fetch(new Request('https://go.devcongress.org/K7M4P'), env(new Response(JSON.stringify({ destination_path: '/r/august-meetup' }), { status: 200 })) as never);
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('https://em.devcongress.org/r/august-meetup');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('does not become an open redirect or accept a code-shaped path with extra segments', async () => {
    const unsafe = await worker.fetch(new Request('https://go.devcongress.org/K7M4P'), env(new Response(JSON.stringify({ destination_path: '//evil.example' }), { status: 200 })) as never);
    const extra = await worker.fetch(new Request('https://go.devcongress.org/K7M4P/anything'), env(new Response('unused')) as never);
    expect(unsafe.status).toBe(404);
    expect(extra.status).toBe(404);
  });
});
