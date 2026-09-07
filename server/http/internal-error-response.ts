import type { Context } from 'hono';
import { safeErrorName, securitySafeRequestPath } from '@/server/security-log';

export function internalErrorResponse(
  c: Context,
  event: string,
  error: unknown,
  publicMessage: string,
) {
  console.error(JSON.stringify({
    event,
    request_id: c.get('requestId') ?? null,
    method: c.req.method,
    path: securitySafeRequestPath(c.req.path),
    error_name: safeErrorName(error),
  }));
  return c.json({ error: publicMessage }, 500);
}
