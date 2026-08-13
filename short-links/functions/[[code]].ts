import { resolveShortLinkRequest, type ShortLinkEnv } from '../redirect';

const STATIC_ASSET_PATHS = new Set(['/robots.txt', '/unavailable.css']);

type ShortLinkPagesContext = {
  request: Request;
  env: ShortLinkEnv;
  next(): Promise<Response>;
};

export async function onRequest(context: ShortLinkPagesContext): Promise<Response> {
  if (STATIC_ASSET_PATHS.has(new URL(context.request.url).pathname)) return context.next();
  return resolveShortLinkRequest(context.request, context.env);
}
