export interface ShortLinkEnv {
  PUBLIC_APP_ORIGIN: string;
  EMS_RESOLVER_ORIGIN: string;
  SHORT_LINK_RESOLVER_TOKEN: string;
}

const CODE_PATTERN = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{5,8}$/;

function securityHeaders(initial: HeadersInit = {}): Headers {
  const headers = new Headers(initial);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  headers.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'");
  return headers;
}

function unavailable(): Response {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Link unavailable · DevCongress</title></head><body><main><p>DEVCONGRESS</p><h1>This link is no longer active.</h1><p>Please ask the DevCongress team for the current link.</p></main></body></html>`, {
    status: 404,
    headers: securityHeaders({ 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }),
  });
}

export async function resolveShortLinkRequest(request: Request, env: ShortLinkEnv): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return unavailable();
  const url = new URL(request.url);
  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length !== 1 || !CODE_PATTERN.test(segments[0])) return unavailable();

  let resolved: Response;
  try {
    const resolverUrl = new URL(`/api/internal/short-links/${segments[0]}`, env.EMS_RESOLVER_ORIGIN);
    resolved = await fetch(resolverUrl, {
      headers: {
        accept: 'application/json',
        'cache-control': 'no-store',
        'x-short-link-resolver-token': env.SHORT_LINK_RESOLVER_TOKEN,
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
