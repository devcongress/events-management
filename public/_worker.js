const WORKER_API_ORIGIN = 'https://events-management.admins-a7d.workers.dev';
const STALE_ASSET_RELOAD_KEY = 'devcon-stale-asset-reload';
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline' https://api.fontshare.com",
  "font-src 'self' data: https://cdn.fontshare.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' https:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://challenges.cloudflare.com",
  "frame-src https://challenges.cloudflare.com https://youtube.com https://www.youtube.com https://youtube-nocookie.com https://www.youtube-nocookie.com https://player.vimeo.com",
  "worker-src 'self' blob:",
].join('; ');

function withSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('X-Permitted-Cross-Domain-Policies', 'none');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

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
      return withSecurityHeaders(await proxyApiRequest(request));
    }

    const response = await env.ASSETS.fetch(request);
    const contentType = response.headers.get('content-type') ?? '';

    if (url.pathname.startsWith('/assets/') && contentType.includes('text/html')) {
      if (url.pathname.endsWith('.js')) {
        return withSecurityHeaders(new Response(`
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
        }));
      }

      return withSecurityHeaders(new Response('Asset not found', {
        status: 404,
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          'cache-control': 'no-store',
        },
      }));
    }

    if (contentType.includes('text/html')) {
      const headers = new Headers(response.headers);
      headers.set('cache-control', 'no-store');
      return withSecurityHeaders(new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      }));
    }

    return withSecurityHeaders(response);
  },
};
