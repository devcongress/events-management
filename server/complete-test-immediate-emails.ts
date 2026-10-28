import type { Context } from 'hono';
import { completeTestDispatchOrigin } from '@/server/complete-test-dispatch';
import { retryAnnualConferenceAdmissionEmails } from '@/server/annual-conference-admission-email-delivery';

// Keep the durable outbox authoritative. Concurrent verification/webhook calls
// share its leases and provider idempotency keys; failures remain retryable.
export async function dispatchCompleteTestEmails(c: Context): Promise<void> {
  const task = (async () => {
    if (!completeTestDispatchOrigin(c)) return;

    const result = await retryAnnualConferenceAdmissionEmails(c);

    console.info(JSON.stringify({ event: 'preview_payment_email_dispatch', ...result }));
  })().catch(() => {
    console.warn(JSON.stringify({ event: 'preview_payment_email_dispatch_failed' }));
  });

  try {
    c.executionCtx.waitUntil(task);
  } catch {
    await task;
  }
}

export async function dispatchManagedConferenceEmails(c: Context): Promise<void> {
  const task = retryAnnualConferenceAdmissionEmails(c, { managed: true }).then((result) => {
    console.info(JSON.stringify({ event: 'managed_payment_email_dispatch', ...result }));
  }).catch(() => {
    console.warn(JSON.stringify({ event: 'managed_payment_email_dispatch_failed' }));
  });

  try {
    c.executionCtx.waitUntil(task);
  } catch {
    await task;
  }
}
