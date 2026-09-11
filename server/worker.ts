import app from './app';
import type { ExecutionContext } from 'hono';
import { secureSharedSecret } from '@/lib/security/shared-secret';
import type { EventBlastPreparationMessage } from '@/lib/event-blast-preparation';

type QueueMessage = { body: EventBlastPreparationMessage };
type QueueBatch = { messages: QueueMessage[] };
type WorkerBindings = Record<string, unknown> & { SLACK_EVENTS_RETRY_SECRET?: string };

export default {
  fetch: app.fetch,
  async scheduled(_controller: unknown, env: WorkerBindings, ctx: ExecutionContext) {
    const secret = secureSharedSecret(env.SLACK_EVENTS_RETRY_SECRET);

    if (!secret) return;

    const jobs = [
      { path: '/api/internal/slack-announcements/retry', event: 'scheduled_event_slack_announcement_retry_http_failed' },
      { path: '/api/internal/event-page-monitors/check-due', event: 'scheduled_event_page_monitor_http_failed' },
      { path: '/api/internal/speaker-rejection-emails/retry', event: 'scheduled_speaker_rejection_email_retry_http_failed' },
      { path: '/api/internal/selected-speaker-emails/retry', event: 'scheduled_selected_speaker_email_retry_http_failed' },
      { path: '/api/internal/annual-conference-speaker-emails/retry', event: 'scheduled_annual_conference_speaker_email_retry_http_failed' },
    ];

    for (const job of jobs) {
      const response = await app.fetch(new Request(`https://events-management.internal${job.path}`, {
        method: 'POST',
        headers: { 'x-scheduled-job-secret': secret },
      }), env, ctx);

      if (!response.ok) console.error(JSON.stringify({ event: job.event, status: response.status }));
    }
  },
  async queue(batch: QueueBatch, env: WorkerBindings, ctx: ExecutionContext) {
    const secret = secureSharedSecret(env.SLACK_EVENTS_RETRY_SECRET);

    if (!secret) throw new Error('Missing scheduled-job secret for event blast preparation.');

    for (const message of batch.messages) {
      const response = await app.fetch(new Request('https://events-management.internal/api/internal/event-blasts/prepare', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-scheduled-job-secret': secret,
        },
        body: JSON.stringify(message.body),
      }), env, ctx);

      if (!response.ok) {
        throw new Error(`Event blast preparation returned ${response.status}.`);
      }
    }
  },
};
