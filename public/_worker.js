const WORKER_API_ORIGIN = 'https://events-management.admins-a7d.workers.dev';
const STALE_ASSET_RELOAD_KEY = 'devcon-stale-asset-reload';

async function proxyApiRequest(request) {
  const incomingUrl = new URL(request.url);
  const targetUrl = new URL(incomingUrl.pathname, WORKER_API_ORIGIN);
  targetUrl.search = incomingUrl.search;

  const headers = new Headers(request.headers);
  headers.delete('host');

  return fetch(new Request(targetUrl, {
    method: request.method,
    headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    redirect: 'manual',
  }));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      return proxyApiRequest(request);
    }

    const response = await env.ASSETS.fetch(request);
    const contentType = response.headers.get('content-type') ?? '';

    if (url.pathname.startsWith('/assets/') && contentType.includes('text/html')) {
      if (url.pathname.endsWith('.js')) {
        return new Response(`
const key = ${JSON.stringify(STALE_ASSET_RELOAD_KEY)};
if (!globalThis.sessionStorage?.getItem(key)) {
  globalThis.sessionStorage?.setItem(key, '1');
  globalThis.location.reload();
} else {
  throw new Error('Missing deployed module asset: ' + ${JSON.stringify(url.pathname)});
}
`, {
          status: 200,
          headers: {
            'content-type': 'application/javascript; charset=utf-8',
            'cache-control': 'no-store',
          },
        });
      }

      return new Response('Asset not found', {
        status: 404,
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          'cache-control': 'no-store',
        },
      });
    }

    if (contentType.includes('text/html')) {
      const headers = new Headers(response.headers);
      headers.set('cache-control', 'no-store');
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }

    return response;
  },
};
