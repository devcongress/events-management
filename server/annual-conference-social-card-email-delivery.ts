import crypto from 'crypto';
import type { Context } from 'hono';
import { z } from 'zod';
import {
  annualConferenceSocialCardEmailDeliveryConfiguration,
  annualConferenceSocialCardManagementUrl,
} from '@/lib/annual-conference-social-card-email-delivery';
import { recordResendEmailHealth } from '@/lib/email/delivery-health';
import { ResendBatchError, sendResendEmailBatch } from '@/lib/email/resend';
import { claimSupabaseAnnualConferenceSocialCardEmailDeliveries, finalizeSupabaseAnnualConferenceSocialCardEmailDelivery } from '@/lib/supabase/annual-conference-social-cards';
import { envValue } from '@/server/env';

const retryDelayMilliseconds = 5 * 60_000;

function htmlEscape(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
}

export function annualConferenceSocialCardEmailConfigurationForRequest(c: Context) {
  return annualConferenceSocialCardEmailDeliveryConfiguration({
    RESEND_API_KEY: envValue('RESEND_API_KEY', c),
    DEVCON26_SOCIAL_CARD_EMAILS_ENABLED: envValue('DEVCON26_SOCIAL_CARD_EMAILS_ENABLED', c),
    DEVCON26_SOCIAL_CARD_EMAIL_FROM: envValue('DEVCON26_SOCIAL_CARD_EMAIL_FROM', c),
    DEVCON26_SOCIAL_CARD_EMAIL_REPLY_TO: envValue('DEVCON26_SOCIAL_CARD_EMAIL_REPLY_TO', c),
  });
}

function deliveryContent(recipientName: string, capability: string) {
  const privateUrl = annualConferenceSocialCardManagementUrl(capability);
  const name = htmlEscape(recipientName);

  return {
    subject: 'Create your DevCon26 social card',
    text: `Hi ${recipientName},\n\nCreate and manage your DevCon26 social card: ${privateUrl}\n\nThis personal link lets you update your card.`,
    html: `<p>Hi ${name},</p><p><a href="${privateUrl}">Create and manage your DevCon26 social card</a></p><p>This personal link lets you update your card.</p>`,
  };
}

function failureMessage(error: unknown): string {
  if (error instanceof ResendBatchError && error.status === 400) return 'The email provider rejected this social-card message.';
  if (error instanceof ResendBatchError && error.status === 422) return 'The email provider rejected this social-card recipient.';

  return 'The social-card email provider did not accept the message.';
}

export async function retryAnnualConferenceSocialCardEmails(c: Context): Promise<{
  configured: boolean;
  accepted: number;
  failed: number;
}> {
  const configured = annualConferenceSocialCardEmailConfigurationForRequest(c);

  if (!configured.enabled || !configured.apiKey || !configured.from || !configured.replyTo) {
    return { configured: false, accepted: 0, failed: 0 };
  }
  const claimToken = crypto.randomUUID();
  const deliveries = await claimSupabaseAnnualConferenceSocialCardEmailDeliveries(claimToken, 20, c);
  let accepted = 0;
  let failed = 0;

  for (const delivery of deliveries) {
    try {
      const content = deliveryContent(delivery.recipient_name, delivery.capability);
      const result = await sendResendEmailBatch({
        apiKey: configured.apiKey,
        idempotencyKey: delivery.idempotency_key,
        emails: [{ from: configured.from, to: [delivery.recipient_email], reply_to: configured.replyTo, ...content }],
      });
      const providerEmailId = result.ids[0]?.trim();

      if (!providerEmailId) throw new Error('The email provider did not return a message identifier.');
      await finalizeSupabaseAnnualConferenceSocialCardEmailDelivery({
        deliveryId: delivery.id,
        claimToken,
        status: 'accepted',
        providerEmailId,
      }, c);
      await recordResendEmailHealth(c, result.quota);
      accepted += 1;
    } catch (error) {
      await finalizeSupabaseAnnualConferenceSocialCardEmailDelivery({
        deliveryId: delivery.id,
        claimToken,
        status: 'failed',
        lastError: failureMessage(error),
        nextAttemptAt: new Date(Date.now() + retryDelayMilliseconds).toISOString(),
      }, c);
      failed += 1;
    }
  }

  return { configured: true, accepted, failed };
}
