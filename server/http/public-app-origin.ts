import type { Context } from 'hono';
import { envValue } from '@/server/env';

function isLocalRequestOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  } catch {
    return false;
  }
}

export function publicAppOrigin(c: Context): string {
  const requestOrigin = new URL(c.req.url).origin;
  if (envValue('NODE_ENV', c) !== 'production' && isLocalRequestOrigin(requestOrigin)) {
    return requestOrigin;
  }

  return envValue('PUBLIC_APP_URL', c) ?? envValue('PUBLIC_FRONTEND_ORIGIN', c) ?? requestOrigin;
}
