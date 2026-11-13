import app from './app';
import { managedRecoveryQueueRequest, paymentDiagnosticsDueRequest } from './managed-recovery-request';
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
const RECOVERY_INTERVAL_MINUTES = 5;
const RECOVERY_MAX_BATCHES = 3;
const PAYMENT_BATCH_SIZE = 8;

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

    const scheduledMinute = Math.floor(Number(controller.scheduledTime) / 60_000);

    if (scheduledMinute % RECOVERY_INTERVAL_MINUTES === 0) {
      const queue = env.EVENT_BLAST_PREPARATION_QUEUE;

      if (queue) {
        const kinds: CheckoutRecoveryMessage['kind'][] = [];

        if (env.ADMISSION_RECOVERY_OWNER === undefined || env.ADMISSION_RECOVERY_OWNER === 'queue') kinds.push('admission-recovery');
        kinds.push('payment-recovery');
        const results = await Promise.allSettled(kinds.map(async (kind) => queue.send({ kind })));

        results.forEach((result, index) => {
          if (result.status === 'rejected') {
            console.error(JSON.stringify({ event: 'checkout_recovery_enqueue_failed', kind: kinds[index] }));
          }
        });
      } else {
        console.error(JSON.stringify({ event: 'checkout_recovery_queue_missing' }));
      }
    }

    const telegram = scheduledMinute % RECOVERY_INTERVAL_MINUTES === 0 && env.DEVCON26_TELEGRAM_PURCHASE_NOTIFICATIONS_ENABLED === 'true' ? (async () => {
      try {
        const retry = await app.fetch(new Request('https://events-management.internal/api/internal/telegram-purchases/retry', {
          method: 'POST', headers: { 'x-scheduled-job-secret': secret },
        }), env, ctx);

        if (!retry.ok) console.error(JSON.stringify({ event: 'telegram_purchase_retry_failed', status: retry.status }));
      } catch {
        console.error(JSON.stringify({ event: 'telegram_purchase_retry_failed' }));
      }
    })() : undefined;
    const diagnostics = scheduledMinute % RECOVERY_INTERVAL_MINUTES === 0 ? (async () => {
      try {
        const response = await app.fetch(paymentDiagnosticsDueRequest('https://events-management.internal/api/internal/payment-diagnostics/due', secret), env, ctx);

        if (!response.ok) throw new Error('Due probe failed.');
        const result: unknown = await response.json();

        if (!result || typeof result !== 'object' || !('due' in result) || typeof result.due !== 'boolean') throw new Error('Invalid due probe.');
        if (result.due) {
          if (!env.EVENT_BLAST_PREPARATION_QUEUE) throw new Error('Queue unavailable.');
          await env.EVENT_BLAST_PREPARATION_QUEUE.send({ kind: 'payment-diagnostics' });
        }
      } catch {
        console.error(JSON.stringify({ event: 'payment_diagnostics_due_dispatch_failed' }));
      }
    })() : undefined;

    const response = await app.fetch(new Request(`https://events-management.internal${job.path}`, {
      method: 'POST',
      headers: { 'x-scheduled-job-secret': secret },
    }), env, ctx);

    if (!response.ok) console.error(JSON.stringify({ event: job.event, status: response.status }));
    await diagnostics;
    await telegram;
  },
  async queue(batch: QueueBatch, env: WorkerBindings, ctx: ExecutionContext) {
    const secret = secureSharedSecret(env.SLACK_EVENTS_RETRY_SECRET);

    if (!secret) throw new Error('Missing scheduled-job secret for event blast preparation.');

    for (const message of batch.messages) {
      if (message.body.kind === 'admission-recovery' && env.ADMISSION_RECOVERY_OWNER !== undefined && env.ADMISSION_RECOVERY_OWNER !== 'queue') continue;
      if (message.body.kind === 'admission-recovery' || message.body.kind === 'payment-recovery' || message.body.kind === 'payment-diagnostics') {
        const path = message.body.kind === 'admission-recovery'
          ? '/api/internal/managed-admission-emails/retry'
          : message.body.kind === 'payment-diagnostics'
            ? '/api/internal/payment-diagnostics/check'
            : '/api/internal/managed-payments/reconcile';
        const response = await app.fetch(managedRecoveryQueueRequest(`https://events-management.internal${path}`, secret), env, ctx);

        if (!response.ok) throw new Error('Checkout recovery job failed.');
        const result = await response.json() as { admissions?: { accepted?: number; failed?: number }; checked?: number; failed?: number };
        const batchNumber = message.body.batch ?? 1;
        const validBatch = Number.isInteger(batchNumber) && batchNumber >= 1 && batchNumber < RECOVERY_MAX_BATCHES;
        const productive = message.body.kind === 'admission-recovery'
          ? (result.admissions?.accepted ?? 0) > 0 && result.admissions?.failed === 0
          : result.checked === PAYMENT_BATCH_SIZE && result.failed === 0;

        if (validBatch && productive) {
          try {
            if (!env.EVENT_BLAST_PREPARATION_QUEUE) throw new Error('Queue unavailable.');
            await env.EVENT_BLAST_PREPARATION_QUEUE.send({ kind: message.body.kind, batch: batchNumber + 1 }, { delaySeconds: 1 });
          } catch {
            console.error(JSON.stringify({ event: 'checkout_recovery_continuation_enqueue_failed', kind: message.body.kind }));
          }
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
