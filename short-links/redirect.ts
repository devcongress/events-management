export interface ShortLinkEnv {
  PUBLIC_APP_ORIGIN: string;
  EMS_RESOLVER_ORIGIN: string;
  SHORT_LINK_RESOLVER_TOKEN: string;
}

const CODE_PATTERN = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{5,8}$/;
const MINIMUM_SHARED_SECRET_BYTES = 32;

function secureResolverToken(value: string): string | null {
  const token = value.trim();
  return new TextEncoder().encode(token).byteLength >= MINIMUM_SHARED_SECRET_BYTES ? token : null;
}

function securityHeaders(initial: HeadersInit = {}): Headers {
  const headers = new Headers(initial);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  headers.set('Content-Security-Policy', "default-src 'none'; style-src 'self'; style-src-attr 'none'; img-src https://em.devcongress.org; base-uri 'none'; frame-ancestors 'none'");
  return headers;
}

function unavailable(): Response {
  return new Response(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="theme-color" content="#fbf8ef">
    <title>DevCongress | Link unavailable</title>
    <link rel="icon" type="image/png" sizes="16x16" href="https://em.devcongress.org/brand/favicon-16x16.png">
    <link rel="icon" type="image/png" sizes="32x32" href="https://em.devcongress.org/brand/favicon-32x32.png">
    <link rel="icon" type="image/png" sizes="512x512" href="https://em.devcongress.org/brand/favicon-rounded-512.png">
    <link rel="apple-touch-icon" sizes="180x180" href="https://em.devcongress.org/brand/apple-touch-icon.png">
    <link rel="stylesheet" href="/unavailable.css">
  </head>
  <body>
    <div class="backdrop" aria-hidden="true">
      <span class="orbit orbit--pink"></span>
      <span class="orbit orbit--yellow"></span>
    </div>
    <main>
      <section class="scene" aria-labelledby="page-title">
        <div class="ticket" aria-hidden="true">
          <p class="ticket-kicker">DevCongress · short links</p>
          <p class="number">404</p>
          <svg class="route" viewBox="0 0 360 200" role="presentation">
            <path class="road" d="M22 34 C128 24 79 144 192 123 S250 67 319 104" />
            <path class="cross" d="M294 77 L340 123 M340 77 L294 123" />
            <circle class="pin" cx="28" cy="34" r="15" />
          </svg>
          <p class="route-label">Route<br>not found</p>
        </div>
        <div class="content">
          <p class="eyebrow">Wrong turn</p>
          <h1 id="page-title">This link left the building.</h1>
          <p class="lead">The event is not here—but the good stuff still is.</p>
          <p class="detail">The code may be mistyped, retired, or replaced. Get the current link from whoever shared it with you.</p>
          <div class="actions">
            <a class="button" href="https://devcongress.org">Visit DevCongress <span class="arrow" aria-hidden="true">→</span></a>
          </div>
        </div>
      </section>
    </main>
  </body>
</html>`, {
    status: 404,
    headers: securityHeaders({ 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }),
  });
}

export async function resolveShortLinkRequest(request: Request, env: ShortLinkEnv): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return unavailable();
  const url = new URL(request.url);
  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length !== 1 || !CODE_PATTERN.test(segments[0])) return unavailable();
  const resolverToken = secureResolverToken(env.SHORT_LINK_RESOLVER_TOKEN);
  if (!resolverToken) return unavailable();

  let resolved: Response;
  try {
    const resolverUrl = new URL(`/api/internal/short-links/${segments[0]}`, env.EMS_RESOLVER_ORIGIN);
    resolved = await fetch(resolverUrl, {
      headers: {
        accept: 'application/json',
        'cache-control': 'no-store',
        'x-short-link-resolver-token': resolverToken,
      },
      redirect: 'manual',
    });
  } catch {
    return unavailable();
  }
  if (!resolved.ok) return unavailable();
  const body = await resolved.json<{ destination_path?: unknown }>();
  if (typeof body.destination_path !== 'string' || !body.destination_path.startsWith('/') || body.destination_path.startsWith('//')) {
    return unavailable();
  }
  const destination = new URL(body.destination_path, env.PUBLIC_APP_ORIGIN);
  if (destination.origin !== new URL(env.PUBLIC_APP_ORIGIN).origin) return unavailable();
  return new Response(null, {
    status: 302,
    headers: securityHeaders({ location: destination.toString(), 'cache-control': 'no-store' }),
  });
}
