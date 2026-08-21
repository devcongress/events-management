import app from './app';
import type { ExecutionContext } from 'hono';
import { secureSharedSecret } from '@/lib/security/shared-secret';

export default {
  fetch: app.fetch,
  async scheduled(_controller: unknown, env: Record<string, string>, ctx: ExecutionContext) {
    const secret = secureSharedSecret(env.SLACK_EVENTS_RETRY_SECRET);
    if (!secret) return;

    const jobs = [
      { path: '/api/internal/slack-announcements/retry', event: 'scheduled_event_slack_announcement_retry_http_failed' },
      { path: '/api/internal/event-page-monitors/check-due', event: 'scheduled_event_page_monitor_http_failed' },
    ];
    for (const job of jobs) {
      const response = await app.fetch(new Request(`https://events-management.internal${job.path}`, {
        method: 'POST',
        headers: { 'x-scheduled-job-secret': secret },
      }), env, ctx);
      if (!response.ok) console.error(JSON.stringify({ event: job.event, status: response.status }));
    }
  },
};
