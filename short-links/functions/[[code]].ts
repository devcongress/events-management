import { resolveShortLinkRequest, type ShortLinkEnv } from '../redirect';

export async function onRequest(context: { request: Request; env: ShortLinkEnv }): Promise<Response> {
  return resolveShortLinkRequest(context.request, context.env);
}
