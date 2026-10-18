import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';

const source = await readFile(new URL('../public/_worker.js', import.meta.url), 'utf8');

function setup(status: number) {
  const upstream = vi.fn(async () => new Response(null, {
    status,
    headers: status === 302 ? {
      Location: 'https://devcongress.org/devcon26/speak/',
      'Cache-Control': 'no-store',
    } : {},
  }));
  const assets = vi.fn(async () => new Response('EMS form', {
    headers: { 'Content-Type': 'text/html' },
  }));
  const worker = new Function('fetch', 'Request', 'Response', `${source.replace('export default', 'return')}`)(upstream, Request, Response);

  return { worker, upstream, assets, env: { ASSETS: { fetch: assets } } };
}

describe('Pages speaker alias handoff', () => {
  it('preserves the upstream redirect for both exact aliases and GET/HEAD', async () => {
    for (const path of ['/speak/c/2026', '/speak/c/2026/']) {
      for (const method of ['GET', 'HEAD']) {
        const { worker, upstream, assets, env } = setup(302);
        const response = await worker.fetch(new Request(`https://em.devcongress.org${path}?source=test`, { method }), env);

        expect(response.status).toBe(302);
        expect(response.headers.get('Location')).toBe('https://devcongress.org/devcon26/speak/');
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        expect(upstream.mock.calls).toHaveLength(1);
        expect(assets).not.toHaveBeenCalled();
      }
    }
  });

  it('serves the Pages form when the upstream flag is disabled', async () => {
    const { worker, assets, env } = setup(200);
    const response = await worker.fetch(new Request('https://em.devcongress.org/speak/c/2026'), env);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('EMS form');
    expect(assets).toHaveBeenCalledOnce();
  });

  it('does not forward neighboring paths or non-read methods', async () => {
    for (const [path, method] of [['/speak/c/2025', 'GET'], ['/speak/c/2026/extra', 'GET'], ['/speak/m/2026', 'GET'], ['/speak/c/2026', 'POST']]) {
      const { worker, upstream, env } = setup(302);

      await worker.fetch(new Request(`https://em.devcongress.org${path}`, { method }), env);

      expect(upstream).not.toHaveBeenCalled();
    }
  });
});
