import app from './app';
import type { ExecutionContext } from 'hono';
import { secureSharedSecret } from '@/lib/security/shared-secret';
import type { BlastPreparationMessage, CheckoutRecoveryMessage, EventBlastPreparationQueue } from '@/lib/event-blast-preparation';

type QueueMessage = { body: BlastPreparationMessage | CheckoutRecoveryMessage };
type QueueBatch = { messages: QueueMessage[] };
type WorkerBindings = Record<string, unknown> & { SLACK_EVENTS_RETRY_SECRET?: string; EVENT_BLAST_PREPARATION_QUEUE?: EventBlastPreparationQueue };
type ScheduledController = { scheduledTime?: number };

const VOLUNTEER_FOLLOW_UP_DRAIN_JOB = {
  path: '/api/internal/volunteer-follow-up/drain',
  event: 'scheduled_volunteer_follow_up_http_failed',
} as const;

const SCHEDULED_JOBS = [
  VOLUNTEER_FOLLOW_UP_DRAIN_JOB,
  { path: '/api/internal/project-night/advance', event: 'scheduled_project_night_http_failed' },
  { path: '/api/internal/slack-announcements/retry', event: 'scheduled_event_slack_announcement_retry_http_failed' },
  { path: '/api/internal/event-page-monitors/check-due', event: 'scheduled_event_page_monitor_http_failed' },
  { path: '/api/internal/event-blasts/reconcile', event: 'scheduled_event_blast_reconciliation_http_failed' },
  { path: '/api/internal/speaker-rejection-emails/retry', event: 'scheduled_speaker_rejection_email_retry_http_failed' },
  { path: '/api/internal/selected-speaker-emails/retry', event: 'scheduled_selected_speaker_email_retry_http_failed' },
  { path: '/api/internal/annual-conference-speaker-emails/retry', event: 'scheduled_annual_conference_speaker_email_retry_http_failed' },
  { path: '/api/internal/annual-conference/phases/rollover', event: 'scheduled_annual_conference_phase_rollover_http_failed' },
  VOLUNTEER_FOLLOW_UP_DRAIN_JOB,
  { path: '/api/internal/annual-conference-social-card-emails/retry', event: 'scheduled_annual_conference_social_card_email_retry_http_failed' },
  VOLUNTEER_FOLLOW_UP_DRAIN_JOB,
  { path: '/api/internal/devcon26-test-checkout-emails/retry', event: 'scheduled_sandbox_checkout_email_retry_http_failed' },
  VOLUNTEER_FOLLOW_UP_DRAIN_JOB,
  { path: '/api/internal/annual-conference-attendee-updates/retry', event: 'scheduled_conference_admission_email_retry_http_failed' },
] as const;

const SCHEDULE_CYCLE_MINUTES = 15;

function scheduledJobFor(controller: ScheduledController) {
  if (!Number.isFinite(controller.scheduledTime)) return null;

  const scheduledMinute = Math.floor(Number(controller.scheduledTime) / 60_000);
  const slot = ((scheduledMinute % SCHEDULE_CYCLE_MINUTES) + SCHEDULE_CYCLE_MINUTES) % SCHEDULE_CYCLE_MINUTES;

  return SCHEDULED_JOBS[slot] ?? null;
}

export default {
  fetch: app.fetch,
  async scheduled(controller: ScheduledController, env: WorkerBindings, ctx: ExecutionContext) {
    const secret = secureSharedSecret(env.SLACK_EVENTS_RETRY_SECRET);

    if (!secret) return;
    const job = scheduledJobFor(controller);

    if (!job) return;

    const queue = env.EVENT_BLAST_PREPARATION_QUEUE;

    if (queue) {
      try {
        await Promise.all([
          queue.send({ kind: 'admission-recovery' }),
          ...Array.from({ length: 3 }, () => queue.send({ kind: 'payment-recovery' })),
        ]);
      } catch {
        console.error(JSON.stringify({ event: 'checkout_recovery_enqueue_failed' }));
      }
    } else {
      console.error(JSON.stringify({ event: 'checkout_recovery_queue_missing' }));
    }

    const response = await app.fetch(new Request(`https://events-management.internal${job.path}`, {
      method: 'POST',
      headers: { 'x-scheduled-job-secret': secret },
    }), env, ctx);

    if (!response.ok) console.error(JSON.stringify({ event: job.event, status: response.status }));
  },
  async queue(batch: QueueBatch, env: WorkerBindings, ctx: ExecutionContext) {
    const secret = secureSharedSecret(env.SLACK_EVENTS_RETRY_SECRET);

    if (!secret) throw new Error('Missing scheduled-job secret for event blast preparation.');

    for (const message of batch.messages) {
      if (message.body.kind === 'admission-recovery' || message.body.kind === 'payment-recovery') {
        const path = message.body.kind === 'admission-recovery'
          ? '/api/internal/annual-conference-admission-emails/retry'
          : '/api/internal/managed-payments/reconcile';
        const response = await app.fetch(new Request(`https://events-management.internal${path}`, {
          method: 'POST', headers: { 'x-scheduled-job-secret': secret },
        }), env, ctx);

        if (!response.ok) throw new Error('Checkout recovery job failed.');
        const result = await response.json() as { admissions?: { accepted?: number } };

        if (message.body.kind === 'admission-recovery' && (result.admissions?.accepted ?? 0) > 0) {
          await env.EVENT_BLAST_PREPARATION_QUEUE?.send({ kind: 'admission-recovery' }, { delaySeconds: 1 });
        }
        continue;
      }
      if (message.body.kind !== undefined && message.body.kind !== 'event' && message.body.kind !== 'volunteer') throw new Error('Unknown queue job.');
      const path = message.body.kind === 'volunteer'
        ? '/api/internal/volunteer-broadcasts/prepare'
        : '/api/internal/event-blasts/prepare';
      const response = await app.fetch(new Request(`https://events-management.internal${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-scheduled-job-secret': secret,
        },
        body: JSON.stringify(message.body),
      }), env, ctx);

      if (!response.ok) {
        throw new Error(`Blast preparation returned ${response.status}.`);
      }
    }
  },
};
