import crypto from 'node:crypto';
import type { Context } from 'hono';
import {
  sandboxEmailConfiguration, sandboxEmailContent, sandboxEmailRecipientAllowed, sandboxProviderPayloadSchema,
} from '@/lib/devcon26-test-checkout-email-delivery';
import { sendResendEmailBatch } from '@/lib/email/resend';
import { claimSandboxEmails, finishSandboxEmail, freezeSandboxEmail } from '@/lib/supabase/devcon26-test-checkout-emails';
import { envValue } from '@/server/env';

export async function retrySandboxCheckoutEmails(c: Context) {
  const keys = [
    'DEVCON26_TEST_CHECKOUT_ENABLED', 'DEVCON26_PAYMENT_PROVIDER', 'PAYSTACK_SECRET_KEY',
    'DEVCON26_TEST_BUYER_EMAIL', 'PUBLIC_WEBSITE_ORIGIN', 'DEVCON26_TEST_CHECKOUT_ORIGINS', 'NODE_ENV',
    'DEVCON26_TEST_CHECKOUT_EMAILS_ENABLED', 'DEVCON26_TEST_CHECKOUT_EMAIL_FROM',
    'DEVCON26_TEST_CHECKOUT_EMAIL_REPLY_TO', 'DEVCON26_TEST_CHECKOUT_EMAIL_RECIPIENTS', 'RESEND_API_KEY',
    'DEVCON26_TEST_CHECKOUT_PREVIEW_EMAILS_ENABLED', 'DEVCON26_TEST_CHECKOUT_PREVIEW_EMAIL_ORIGINS',
  ];
  const configuration = sandboxEmailConfiguration(Object.fromEntries(keys.map((key) => [key, envValue(key, c)])));

  if (!configuration) return { configured: false, accepted: 0, failed: 0, suppressed: 0 };
  const claimToken = crypto.randomUUID();
  const deliveries = await claimSandboxEmails(c, claimToken);
  const counts = { configured: true, accepted: 0, failed: 0, suppressed: 0 };

  for (const delivery of deliveries) {
    const authorizedDelivery = delivery as typeof delivery & {
      preview_email_authorized_origin?: string | null;
      preview_email_authorized_until?: string | null;
    };

    if (!sandboxEmailRecipientAllowed(configuration, authorizedDelivery)) {
      await finishSandboxEmail(c, delivery.id, claimToken, 'suppressed');
      counts.suppressed += 1;
      continue;
    }

    // A frozen payload survives template and sender changes between attempts.
    const stored = await freezeSandboxEmail(c, delivery.id, claimToken,
      sandboxEmailContent(delivery, configuration.from, configuration.replyTo));
    const parsed = sandboxProviderPayloadSchema.safeParse(stored);

    if (!parsed.success || parsed.data.to[0] !== delivery.recipient_email) {
      await finishSandboxEmail(c, delivery.id, claimToken, 'needs_attention');
      counts.failed += 1;
      continue;
    }

    // Do not cross the retry window or send after a lease has expired.
    const now = Date.now();
    const leaseUntil = Date.parse(delivery.lease_until ?? '');
    const firstAttemptAt = Date.parse(delivery.first_attempt_at ?? '');

    if (!Number.isFinite(leaseUntil) || !Number.isFinite(firstAttemptAt)
      || now + 30_000 >= leaseUntil
      || now + 30_000 >= firstAttemptAt + 60 * 60_000) continue;

    // Recheck immediately before the provider call so time spent freezing and
    // validating cannot cross a preview authorization deadline.
    if (!sandboxEmailRecipientAllowed(configuration, authorizedDelivery, Date.now())) {
      await finishSandboxEmail(c, delivery.id, claimToken, 'suppressed');
      counts.suppressed += 1;
      continue;
    }

    let providerEmailId: string | undefined;

    try {
      const result = await sendResendEmailBatch({
        apiKey: configuration.apiKey,
        idempotencyKey: delivery.idempotency_key,
        emails: [parsed.data],
      });

      providerEmailId = result.ids[0]?.trim();

      if (!providerEmailId) throw new Error('missing_sandbox_email_id');
    } catch {
      await finishSandboxEmail(c, delivery.id, claimToken, 'failed');
      counts.failed += 1;
      continue;
    }

    // Keep this outside the provider catch: a failed DB acknowledgement must
    // leave the lease intact, not relabel a provider-accepted message as failed.
    await finishSandboxEmail(c, delivery.id, claimToken, 'accepted', providerEmailId);
    counts.accepted += 1;
  }

  return counts;
}
