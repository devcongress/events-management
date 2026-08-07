const WORKER_API_ORIGIN = 'https://events-management.admins-a7d.workers.dev';
const STALE_ASSET_RELOAD_KEY = 'devcon-stale-asset-reload';
const APP_BOOT_VARIANT_ATTRIBUTE = 'data-app-boot-variant';
const APP_BOOT_LABELS = {
  organizer: 'Opening the DevCongress organizer workspace',
  registration: 'Loading your registration form',
  cfp: 'Loading the proposal form',
  feedback: 'Loading the feedback form',
  speaker: 'Loading the talk details form',
  volunteer: 'Loading the volunteer form',
  'learning-room': 'Joining the learning room',
};
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

function publicBootVariant(pathname) {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path.startsWith('/r/')) return 'registration';
  if (path.startsWith('/register/')) return 'registration';
  if (path.startsWith('/cfp/')) return 'cfp';
  if (path.startsWith('/feedback/')) return 'feedback';
  if (path.startsWith('/speaker-talks/')) return 'speaker';
  if (path.startsWith('/volunteer/')) return 'volunteer';
  if (path.startsWith('/learn/system-design/')) return 'learning-room';
  return 'organizer';
}

async function withRouteAwareBoot(response, pathname) {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('text/html')) return response;

  const html = await response.text();
  const variant = publicBootVariant(pathname);
  const nextHtml = html
    .replace(
      new RegExp(`${APP_BOOT_VARIANT_ATTRIBUTE}="[^"]+"`),
      `${APP_BOOT_VARIANT_ATTRIBUTE}="${variant}"`,
    )
    .replace(
      /(<section class="app-boot"[^>]*aria-label=")[^"]+("[^>]*>)/,
      `$1${APP_BOOT_LABELS[variant]}$2`,
    );

  const headers = new Headers(response.headers);
  headers.delete('content-encoding');
  headers.delete('content-length');

  if (nextHtml === html) {
    return new Response(html, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  return new Response(nextHtml, {
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
      const routeAwareResponse = await withRouteAwareBoot(response, url.pathname);
      const headers = new Headers(routeAwareResponse.headers);
      headers.set('cache-control', 'no-store');
      return withSecurityHeaders(new Response(routeAwareResponse.body, {
        status: routeAwareResponse.status,
        statusText: routeAwareResponse.statusText,
        headers,
      }));
    }

    return withSecurityHeaders(response);
  },
};
