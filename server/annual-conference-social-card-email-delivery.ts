import crypto from 'crypto';
import type { Context } from 'hono';
import { z } from 'zod';
import {
  annualConferenceSocialCardCollectionManagementUrl,
  annualConferenceSocialCardEmailDeliveryConfiguration,
  annualConferenceSocialCardManagementUrl,
} from '@/lib/annual-conference-social-card-email-delivery';
import { recordResendEmailHealth } from '@/lib/email/delivery-health';
import { ResendBatchError, sendResendEmailBatch } from '@/lib/email/resend';
import { claimSupabaseAnnualConferenceSocialCardEmailDeliveries, finalizeSupabaseAnnualConferenceSocialCardEmailDelivery } from '@/lib/supabase/annual-conference-social-cards';
import { envValue } from '@/server/env';
import { allowConferenceEmail } from '@/server/annual-conference-registration-testing';

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

function deliveryContent(recipientName: string, capability: string, isCollection: boolean, local: boolean) {
  const canonicalUrl = isCollection
    ? annualConferenceSocialCardCollectionManagementUrl(capability)
    : annualConferenceSocialCardManagementUrl(capability);
  const privateUrl = local ? canonicalUrl.replace('https://devcongress.org', 'http://localhost:4321') : canonicalUrl;
  const name = htmlEscape(recipientName);
  const title = isCollection ? 'Create your DevCon26 ticket cards' : 'Create your DevCon26 social card';
  const prompt = isCollection
    ? 'Your tickets each have an optional card. Personalize any now, or return to this private link later.'
    : 'This personal link lets you update your card.';

  return {
    subject: title,
    text: `Hi ${recipientName},\n\n${title}: ${privateUrl}\n\n${prompt}`,
    html: `<p>Hi ${name},</p><p><a href="${privateUrl}">${title}</a></p><p>${prompt}</p>`,
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
      if (!await allowConferenceEmail(c, 'social', delivery.id, delivery.recipient_email, claimToken)) continue;
      const content = deliveryContent(delivery.recipient_name, delivery.capability, Boolean(delivery.collection_order_id), envValue('NODE_ENV', c) === 'development');
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
