import app from './app';
import type { ExecutionContext } from 'hono';
import { secureSharedSecret } from '@/lib/security/shared-secret';

export default {
  fetch: app.fetch,
  async scheduled(_controller: unknown, env: Record<string, string>, ctx: ExecutionContext) {
    const secret = secureSharedSecret(env.SLACK_EVENTS_RETRY_SECRET);
    if (!secret) return;

    const response = await app.fetch(new Request('https://events-management.internal/api/internal/slack-announcements/retry', {
      method: 'POST',
      headers: { 'x-scheduled-job-secret': secret },
    }), env, ctx);

    if (!response.ok) {
      console.error(JSON.stringify({
        event: 'scheduled_event_slack_announcement_retry_http_failed',
        status: response.status,
      }));
    }
  },
};
