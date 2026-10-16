import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { z } from 'zod';
import type { Context } from 'hono';
import { sendResendAttachedEmail, type ResendAttachedEmail } from '@/lib/email/resend';
import { getSupabaseAdminClient } from '@/lib/supabase/server';
import { envValue } from '@/server/env';

const deliverySchema = z.object({
  id: z.string().uuid(), recipient_name: z.string(), recipient_email: z.string().email(),
  kind: z.enum(['ticket_delivery', 'ticket_bundle_delivery', 'waitlist_notice', 'payment_receipt']),
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

export async function admissionEmailContent(delivery: z.infer<typeof deliverySchema>, from: string, replyTo: string): Promise<ResendAttachedEmail> {
  const name = escapeHtml(delivery.recipient_name);
  const base = { from, to: [delivery.recipient_email], reply_to: replyTo };

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
  const tokens = delivery.kind === 'ticket_bundle_delivery'
    ? z.array(z.object({ qr_token: tokenSchema })).min(1).max(5).parse(delivery.payload.tickets).map((ticket) => ticket.qr_token)
    : [tokenSchema.parse(delivery.payload.qr_token)];
  const attachments = await Promise.all(tokens.map(async (token, index) => ({
    filename: `devcon26-admission-${index + 1}.png`,
    content: (await QRCode.toBuffer(token, { width: 600, margin: 4, errorCorrectionLevel: 'M' })).toString('base64'),
    content_type: 'image/png', content_id: `admission-${index + 1}`,
  })));

  return {
    ...base, subject: 'Your DevCon26 admission QR', attachments,
    html: `<p>Hi ${name},</p><p>Your place at DevCon26 is confirmed. Show this QR at the entrance. Keep it private: each code admits one person once.</p>${attachments.map((attachment) => `<p><img src="cid:${attachment.content_id}" width="300" height="300" alt="Private DevCon26 admission QR" /></p>`).join('')}<p>Save the attached image for event day. Your optional social-sharing card arrives separately.</p>`,
    text: `Hi ${delivery.recipient_name}, your place at DevCon26 is confirmed. Show the attached QR at the entrance. Each code admits one person once. Keep it private. Your optional social-sharing card arrives separately.`,
  };
}

export async function retryAnnualConferenceAdmissionEmails(c: Context) {
  const apiKey = envValue('RESEND_API_KEY', c)?.trim();
  const from = envValue('DEVCON26_ADMISSION_EMAIL_FROM', c)?.trim();
  const replyTo = envValue('DEVCON26_ADMISSION_EMAIL_REPLY_TO', c)?.trim();

  if (envValue('DEVCON26_ADMISSION_EMAILS_ENABLED', c) !== 'true' || !apiKey || !from || !replyTo) {
    return { configured: false, accepted: 0, failed: 0 };
  }
  const client = getSupabaseAdminClient(c);
  const claim = crypto.randomUUID();
  const result = await client.rpc('claim_annual_conference_ticket_email_outbox' as never, { p_claim_token: claim, p_limit: 10 } as never);

  if (result.error) throw new Error('Admission email queue unavailable.');
  const deliveries = z.array(deliverySchema).parse(result.data);
  const counts = { configured: true, accepted: 0, failed: 0 };

  for (const delivery of deliveries) {
    if (Date.now() + 30000 >= Date.parse(delivery.claimed_until)
      || Date.now() + 30000 >= Date.parse(delivery.first_attempt_at) + 3600000) continue;
    let providerId: string;

    try {
      const content = await admissionEmailContent(delivery, from, replyTo);
      const frozen = await client.rpc('freeze_annual_conference_admission_email' as never, {
        p_id: delivery.id, p_claim: claim, p_payload: content,
      } as never);
      const payload = frozenSchema.safeParse(frozen.data);

      if (frozen.error || !payload.success || payload.data.to[0] !== delivery.recipient_email) throw new Error('Admission lease unavailable.');
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
