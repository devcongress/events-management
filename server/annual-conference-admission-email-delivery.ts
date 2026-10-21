import { completeTestDispatchOrigin } from '@/server/complete-test-dispatch';
import { completeTestQrPng } from '@/server/complete-test-qr';
import { completeTestEmailContext, markCompleteTestEmail } from '@/server/complete-test-email-context';
import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { z } from 'zod';
import type { Context } from 'hono';
import { sendResendAttachedEmail, type ResendAttachedEmail } from '@/lib/email/resend';
import { getSupabaseAdminClient } from '@/lib/supabase/server';
import { envValue } from '@/server/env';
import { allowConferenceEmail } from '@/server/annual-conference-registration-testing';

const deliverySchema = z.object({
  id: z.string().uuid(), recipient_name: z.string(), recipient_email: z.string().email(),
  kind: z.enum([
    'ticket_delivery', 'ticket_bundle_delivery', 'waitlist_notice', 'payment_receipt',
    'flexible_order_management', 'flexible_gift_claim', 'flexible_admission_delivery',
    'flexible_buyer_bundle_delivery',
  ]),
  payload: z.record(z.string(), z.unknown()), idempotency_key: z.string(),
  first_attempt_at: z.string(), claimed_until: z.string(),
});
const frozenSchema = z.object({
  from: z.string(), to: z.array(z.string().email()).length(1), reply_to: z.string(),
  subject: z.string(), html: z.string(), text: z.string(),
  attachments: z.array(z.object({ filename: z.string(), content: z.string(), content_type: z.string(), content_id: z.string() })).optional(),
});
const tokenSchema = z.string().regex(/^[0-9a-f]{64}$/);

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}

function privateCapabilityLink(websiteOrigin: string, path: string, capability: string): string {
  const origin = new URL(websiteOrigin);

  if (origin.protocol !== 'https:' || origin.origin !== websiteOrigin || origin.pathname !== '/' || origin.search || origin.hash) {
    throw new Error('Conference website origin is invalid.');
  }

  const url = new URL(path, origin);

  url.hash = new URLSearchParams({ key: capability }).toString();

  return url.href;
}

export async function admissionEmailContent(
  delivery: z.infer<typeof deliverySchema>,
  from: string,
  replyTo: string,
  websiteOrigin?: string,
  isTest = false,
): Promise<ResendAttachedEmail> {
  const name = escapeHtml(delivery.recipient_name);
  const base = { from, to: [delivery.recipient_email], reply_to: replyTo };

  if (delivery.kind === 'flexible_order_management' || delivery.kind === 'flexible_gift_claim') {
    const capability = z.string().regex(/^[0-9a-f]{64}$/).parse(delivery.payload.capability);
    const management = delivery.kind === 'flexible_order_management';
    const link = privateCapabilityLink(websiteOrigin ?? '',
      management ? '/devcon26/tickets/manage/' : '/devcon26/tickets/claim/', capability);
    const action = management ? 'Manage your DevCon26 tickets' : 'Claim your DevCon26 ticket';
    const explanation = isTest
      ? management
        ? 'Your Paystack test payment is complete. No money was charged. Manage your preview tickets using this private link.'
        : 'You have been invited to claim a preview test ticket. No event admission is included. Use this private link to test the claim process.'
      : management
      ? 'Your DevCon26 payment is confirmed. Use this private link to manage the tickets you purchased or supported.'
      : 'A DevCon26 ticket has been gifted to you. Use this private link to enter your name and claim it.';

    return {
      ...base,
      subject: management ? 'Manage your DevCon26 tickets' : 'Claim your DevCon26 gift ticket',
      html: `<p>Hi ${name},</p><p>${explanation}</p><p><a href="${escapeHtml(link)}">${action}</a></p><p>Keep this link private. It is not an admission QR.</p>`,
      text: `Hi ${delivery.recipient_name},\n\n${explanation}\n\n${action}: ${link}\n\nKeep this link private. It is not an admission QR.`,
    };
  }

  if (isTest && (delivery.kind === 'waitlist_notice' || delivery.kind === 'payment_receipt')) {
    const message = delivery.kind === 'payment_receipt'
      ? 'Your Paystack test payment is complete. No money was charged. Test QR codes arrive separately and do not provide event admission.'
      : 'Your preview waitlist request was recorded. This does not reserve admission to DevCon26.';

    return { ...base, subject: 'DevCon26 preview test update', html: `<p>Hi ${name},</p><p>${message}</p>`, text: `Hi ${delivery.recipient_name}, ${message}` };
  }

  if (delivery.kind === 'waitlist_notice') return {
    ...base, subject: 'You’re on the DevCon26 waitlist',
    html: `<p>Hi ${name},</p><p>You’re on the waitlist for DevCon26. This is not a confirmed place. We’ll email your admission QR if a place becomes available.</p>`,
    text: `Hi ${delivery.recipient_name}, you’re on the DevCon26 waitlist. This is not a confirmed place. We’ll email your admission QR if a place becomes available.`,
  };
  if (delivery.kind === 'payment_receipt') return {
    ...base, subject: 'DevCon26 payment received',
    html: `<p>Hi ${name},</p><p>Your DevCon26 payment has been received. Admission QR codes arrive in a separate email.</p>`,
    text: `Hi ${delivery.recipient_name}, your DevCon26 payment has been received. Admission QR codes arrive in a separate email.`,
  };
  const flexibleBundle = delivery.kind === 'flexible_buyer_bundle_delivery'
    ? z.object({
      chunk_index: z.number().int().min(1),
      chunk_count: z.number().int().min(1),
      tickets: z.array(z.object({
        ticket_id: z.string().uuid(),
        order_seat_number: z.number().int().min(1),
        qr_token: tokenSchema,
      })).min(1).max(20),
    }).parse(delivery.payload)
    : null;

  if (flexibleBundle && flexibleBundle.chunk_index > flexibleBundle.chunk_count) {
    throw new Error('Conference ticket bundle is invalid.');
  }

  const tokens = flexibleBundle
    ? flexibleBundle.tickets.map((ticket) => ({ token: ticket.qr_token, seat: ticket.order_seat_number }))
    : delivery.kind === 'ticket_bundle_delivery'
      ? z.array(z.object({ qr_token: tokenSchema })).min(1).max(5).parse(delivery.payload.tickets)
        .map((ticket, index) => ({ token: ticket.qr_token, seat: index + 1 }))
      : [{ token: tokenSchema.parse(delivery.payload.qr_token), seat: 1 }];
  const attachments = await Promise.all(tokens.map(async ({ token, seat }, index) => ({
    filename: `devcon26-${isTest ? 'TEST-NOT-VALID-FOR-ADMISSION' : 'admission'}-seat-${seat}.png`,
    content: (isTest ? await completeTestQrPng(token)
      : await QRCode.toBuffer(token, { width: 600, margin: 4, errorCorrectionLevel: 'M' })).toString('base64'),
    content_type: 'image/png', content_id: `admission-${index + 1}`,
  })));

  if (isTest) {
    const explanation = `Attached are ${attachments.length} preview test QR codes. No money was charged and no event admission is included. These codes cannot be used to check in. Keep them private. Your test badge links arrive separately.`;

    return {
      ...base, subject: 'Your DevCon26 test QR codes', attachments,
      html: `<p>Hi ${name},</p><p>${explanation}</p>`,
      text: `Hi ${delivery.recipient_name},\n\n${explanation}`,
    };
  }

  if (flexibleBundle) {
    const part = flexibleBundle.chunk_count > 1
      ? ` (part ${flexibleBundle.chunk_index} of ${flexibleBundle.chunk_count})`
      : '';

    return {
      ...base,
      subject: `Your DevCon26 admission QR codes${part}`,
      attachments,
      html: `<p>Hi ${name},</p><p>Attached are ${attachments.length} private DevCon26 admission QR codes${part}. Each code admits one person once. Share each file only with its intended attendee.</p><p>Your optional social-sharing card is separate from admission.</p>`,
      text: `Hi ${delivery.recipient_name},\n\nAttached are ${attachments.length} private DevCon26 admission QR codes${part}. Each code admits one person once. Share each file only with its intended attendee. Your optional social-sharing card is separate from admission.`,
    };
  }

  return {
    ...base, subject: 'Your DevCon26 admission QR', attachments,
    html: `<p>Hi ${name},</p><p>Your place at DevCon26 is confirmed. Show this QR at the entrance. Keep it private: each code admits one person once.</p>${attachments.map((attachment) => `<p><img src="cid:${attachment.content_id}" width="300" height="300" alt="Private DevCon26 admission QR" /></p>`).join('')}<p>Save the attached image for event day. Your optional social-sharing card arrives separately.</p>`,
    text: `Hi ${delivery.recipient_name}, your place at DevCon26 is confirmed. Show the attached QR at the entrance. Each code admits one person once. Keep it private. Your optional social-sharing card arrives separately.`,
  };
}

export function admissionEmailReadiness(c: Context) {
  const enabled = envValue('DEVCON26_ADMISSION_EMAILS_ENABLED', c) === 'true';
  const configured = Boolean(envValue('RESEND_API_KEY', c)?.trim()
    && envValue('DEVCON26_ADMISSION_EMAIL_FROM', c)?.trim()
    && envValue('DEVCON26_ADMISSION_EMAIL_REPLY_TO', c)?.trim());

  return { enabled, configured, ready: enabled && configured };
}

export async function retryAnnualConferenceAdmissionEmails(c: Context) {
  const apiKey = envValue('RESEND_API_KEY', c)?.trim();
  const from = envValue('DEVCON26_ADMISSION_EMAIL_FROM', c)?.trim();
  const replyTo = envValue('DEVCON26_ADMISSION_EMAIL_REPLY_TO', c)?.trim();
  const websiteOrigin = envValue('PUBLIC_WEBSITE_ORIGIN', c)?.trim();

  if (envValue('DEVCON26_ADMISSION_EMAILS_ENABLED', c) !== 'true' || !apiKey || !from || !replyTo) {
    return { configured: false, accepted: 0, failed: 0 };
  }
  const client = getSupabaseAdminClient(c);
  const claim = crypto.randomUUID();
  const previewOrigin = completeTestDispatchOrigin(c);
  const result = await client.rpc((previewOrigin ? 'claim_complete_test_only_admission_emails' : 'claim_annual_conference_ticket_email_outbox') as never, {
    p_claim_token: claim, p_limit: 10,
    ...(previewOrigin ? { p_origin: previewOrigin } : {}),
  } as never);

  if (result.error) throw new Error('Admission email queue unavailable.');
  const deliveries = z.array(deliverySchema).parse(result.data);
  const counts = { configured: true, accepted: 0, failed: 0 };

  for (const delivery of deliveries) {
    if (Date.now() + 30000 >= Date.parse(delivery.claimed_until)
      || Date.now() + 30000 >= Date.parse(delivery.first_attempt_at) + 3600000) continue;
    let providerId: string;

    try {
      if (!await allowConferenceEmail(c, 'admission', delivery.id, delivery.recipient_email, claim)) continue;
      const testContext = await completeTestEmailContext(c, 'admission', delivery.id);

      if (!testContext.allowed) continue;

      const original = await admissionEmailContent(delivery, from, replyTo, testContext.is_test ? testContext.origin : websiteOrigin, testContext.is_test);
      const content = testContext.is_test ? markCompleteTestEmail(original) : original;
      const frozen = await client.rpc('freeze_annual_conference_admission_email' as never, {
        p_id: delivery.id, p_claim: claim, p_payload: content,
      } as never);
      const payload = frozenSchema.safeParse(frozen.data);

      if (frozen.error || !payload.success || payload.data.to[0] !== delivery.recipient_email) throw new Error('Admission lease unavailable.');
      if (!await allowConferenceEmail(c, 'admission', delivery.id, payload.data.to[0], claim)) continue;
      if (!(await completeTestEmailContext(c, 'admission', delivery.id)).allowed) continue;

      providerId = await sendResendAttachedEmail({ apiKey, idempotencyKey: delivery.idempotency_key, email: payload.data });
    } catch {
      const failed = await client.rpc('finalize_annual_conference_ticket_email_outbox' as never, {
        p_outbox_id: delivery.id, p_claim_token: claim, p_status: 'failed', p_last_error: 'Admission email was not accepted.',
        p_next_attempt_at: new Date(Date.now() + 5 * 60000).toISOString(),
      } as never);

      if (failed.error) throw new Error('Admission email acknowledgement failed.');
      counts.failed += 1;
      continue;
    }

    // A failed acknowledgement must retain the lease and frozen provider payload.
    const finalized = await client.rpc('finalize_annual_conference_ticket_email_outbox' as never, {
      p_outbox_id: delivery.id, p_claim_token: claim, p_status: 'accepted', p_provider_email_id: providerId,
    } as never);

    if (finalized.error) throw new Error('Admission email acknowledgement failed.');
    counts.accepted += 1;
  }

  return counts;
}
