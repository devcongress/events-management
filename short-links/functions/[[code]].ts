import { resolveShortLinkRequest, type ShortLinkEnv } from '../redirect';

const STATIC_ASSET_PATHS = new Set(['/robots.txt', '/unavailable.css']);
const LEGACY_SPEAKER_EMAIL_ASSET_PATHS = new Set([
  '/brand/dev-con-logo.png',
  '/brand/speaker-archive-illustration.png',
  '/fonts/inter-400.woff2',
  '/fonts/inter-600.woff2',
  '/fonts/inter-700.woff2',
  '/fonts/inter-800.woff2',
  '/fonts/ibm-plex-mono-700.woff2',
]);

type ShortLinkPagesContext = {
  request: Request;
  env: ShortLinkEnv;
  next(): Promise<Response>;
};

export async function onRequest(context: ShortLinkPagesContext): Promise<Response> {
  const pathname = new URL(context.request.url).pathname;
  if (STATIC_ASSET_PATHS.has(pathname)) return context.next();
  if (LEGACY_SPEAKER_EMAIL_ASSET_PATHS.has(pathname)) {
    return new Response(null, {
      status: 301,
      headers: {
        location: new URL(pathname, context.env.PUBLIC_APP_ORIGIN).toString(),
        'cache-control': 'public, max-age=86400',
      },
    });
  }
  return resolveShortLinkRequest(context.request, context.env);
}
