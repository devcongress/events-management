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
  headers.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src https://em.devcongress.org; base-uri 'none'; frame-ancestors 'none'");
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
    <style>
      :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      * { box-sizing: border-box; }
      body { min-width: 320px; min-height: 100dvh; margin: 0; overflow-x: hidden; background: #f5f0e6; color: #181714; }
      .backdrop { position: fixed; z-index: 0; inset: 0; overflow: hidden; pointer-events: none; }
      main { position: relative; z-index: 1; width: min(100% - 48px, 720px); min-height: 100dvh; display: grid; align-items: center; margin: 0 auto; padding: 48px 0; }
      .orbit { position: absolute; width: min(32vw, 460px); aspect-ratio: 1; border-radius: 50%; filter: blur(1px); opacity: 0.9; }
      .orbit--pink { top: -150px; right: -190px; background: #f21c82; }
      .orbit--yellow { bottom: -210px; left: -190px; background: #ffeb39; }
      .scene { position: relative; z-index: 1; overflow: hidden; border: 2px solid #181714; border-radius: 18px; background: #fffdf7; box-shadow: 7px 7px 0 #181714; animation: settle 240ms cubic-bezier(0.16, 1, 0.3, 1) both; }
      .ticket { position: relative; min-height: 210px; overflow: hidden; padding: 24px; background: #ffeb39; border-bottom: 2px solid #181714; }
      .ticket::before { position: absolute; right: -12px; bottom: -12px; left: -12px; height: 22px; border-radius: 50%; background: #fffdf7; box-shadow: 44px 0 0 #fffdf7, 88px 0 0 #fffdf7, 132px 0 0 #fffdf7, 176px 0 0 #fffdf7, 220px 0 0 #fffdf7, 264px 0 0 #fffdf7, 308px 0 0 #fffdf7, 352px 0 0 #fffdf7, 396px 0 0 #fffdf7, 440px 0 0 #fffdf7, 484px 0 0 #fffdf7, 528px 0 0 #fffdf7; content: ""; }
      .ticket-kicker, .eyebrow { margin: 0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.75rem; font-weight: 800; letter-spacing: 0.13em; text-transform: uppercase; }
      .ticket-kicker { position: relative; z-index: 1; }
      .number { position: absolute; right: 16px; bottom: -12px; margin: 0; color: #181714; font-size: clamp(8.75rem, 31vw, 12rem); font-weight: 900; letter-spacing: -0.13em; line-height: 0.8; }
      .route { position: absolute; z-index: 1; left: 34px; bottom: 42px; width: min(54%, 235px); height: auto; overflow: visible; }
      .route path { fill: none; stroke: #181714; stroke-linecap: round; stroke-linejoin: round; }
      .route .road { stroke-width: 9; stroke-dasharray: 1 18; }
      .route .pin { fill: #f21c82; stroke: #181714; stroke-width: 7; }
      .route .cross { stroke-width: 7; }
      .route-label { display: none; }
      .content { display: flex; min-width: 0; flex-direction: column; align-items: flex-start; justify-content: center; padding: clamp(32px, 7vw, 54px); }
      .eyebrow { display: inline-flex; align-items: center; gap: 10px; color: #aa0d5d; }
      .eyebrow::before { width: 20px; height: 2px; background: currentColor; content: ""; }
      h1 { max-width: 10ch; margin: 18px 0 0; font-size: clamp(2.7rem, 7vw, 4.4rem); font-weight: 400; line-height: 0.92; letter-spacing: -0.04em; }
      .lead { max-width: 40ch; margin: 20px 0 0; color: #49463f; font-size: clamp(1rem, 1.6vw, 1.12rem); line-height: 1.55; }
      .detail { max-width: 45ch; margin: 12px 0 0; color: #6b665d; font-size: 0.95rem; line-height: 1.55; }
      .actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 34px; }
      .button { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 48px; padding: 0 20px; border: 2px solid #181714; border-radius: 8px; background: #181714; box-shadow: 3px 3px 0 #f21c82; color: #fffdf7; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.8rem; font-weight: 800; letter-spacing: 0.06em; text-decoration: none; text-transform: uppercase; transition: transform 150ms cubic-bezier(0.4, 0, 0.2, 1), box-shadow 150ms cubic-bezier(0.4, 0, 0.2, 1), background-color 150ms cubic-bezier(0.4, 0, 0.2, 1); }
      .button .arrow { margin-left: 4px; }
      .button:focus-visible { outline: 3px solid #f21c82; outline-offset: 3px; }
      .button:active { transform: translate(2px, 2px) scale(0.97); box-shadow: 1px 1px 0 #f21c82; }
      @media (hover: hover) and (pointer: fine) { .button:hover { transform: translate(-1px, -1px); box-shadow: 5px 5px 0 #f21c82; background: #312f2a; } }
      @media (max-width: 720px) { .orbit { width: 240px; } .orbit--pink { top: -126px; right: -198px; } .orbit--yellow { bottom: -190px; left: -198px; } main { width: min(100% - 28px, 640px); min-height: 100dvh; padding: 28px 0; } .ticket { min-height: 250px; padding: 22px; } .number { right: 10px; bottom: -16px; font-size: clamp(8.5rem, 45vw, 13rem); } .route { left: 32px; bottom: 42px; width: min(65%, 265px); } .content { padding: 34px 24px 28px; } h1 { max-width: 10ch; font-size: clamp(2.65rem, 13vw, 4.4rem); } .lead { margin-top: 20px; font-size: 1rem; } .detail { font-size: 0.94rem; } .actions { width: 100%; margin-top: 28px; } .button { width: 100%; } }
      @keyframes settle { from { opacity: 0; transform: translateY(12px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
      @media (prefers-reduced-motion: reduce) { .scene { animation: none; } .button { transition: none; } }
    </style>
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
