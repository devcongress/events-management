import crypto from 'node:crypto';
import type { Context } from 'hono';
import { z } from 'zod';
import { getSupabaseAdminClient } from '@/lib/supabase/server';
import { readResendEmailQuota, sendResendEmailBatch } from '@/lib/email/resend';
import { getEmailOutboxSummary } from '@/lib/email/delivery-health';
import { blastTransactionalReserve } from '@/lib/email/blast-capacity';
import { envValue } from '@/server/env';

const deliverySchema = z.object({
  id: z.string().uuid(), recipient_name: z.string(), recipient_email: z.string().email(),
  subject: z.string(), body: z.string(), first_attempt_at: z.string(), claimed_until: z.string(),
});
const payloadSchema = z.object({
  from: z.string(), reply_to: z.string(), to: z.array(z.string().email()).length(1),
  subject: z.string(), text: z.string(), html: z.string(),
});

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}

export async function retryAnnualConferenceAttendeeUpdates(c: Context) {
  const apiKey = envValue('RESEND_API_KEY', c)?.trim();
  const quotaKey = envValue('RESEND_BROADCASTS_API_KEY', c)?.trim() || apiKey;
  const from = envValue('DEVCON26_ADMISSION_EMAIL_FROM', c)?.trim();
  const replyTo = envValue('DEVCON26_ADMISSION_EMAIL_REPLY_TO', c)?.trim();

  if (envValue('DEVCON26_ATTENDEE_UPDATES_ENABLED', c) !== 'true' || !apiKey || !quotaKey || !from || !replyTo) return { configured: false, accepted: 0 };
  const usage = await readResendEmailQuota({ apiKey: quotaKey });

  if (usage?.dailyUsed === null || usage?.dailyUsed === undefined || usage.monthlyUsed === null) return { configured: true, accepted: 0, blocked: 'capacity_unknown' };
  const outbox = await getEmailOutboxSummary(c);
  const client = getSupabaseAdminClient(c);
  const admission = await client.from('annual_conference_ticket_email_outbox').select('id', { count: 'exact', head: true }).in('status', ['queued', 'sending', 'failed']).neq('next_attempt_at', 'infinity');

  if (!outbox || admission.error || admission.count === null) return { configured: true, accepted: 0, blocked: 'capacity_unknown' };
  const dailyLimit = Number(envValue('RESEND_DAILY_EMAIL_QUOTA', c) || 100);
  const monthlyLimit = Number(envValue('RESEND_MONTHLY_EMAIL_QUOTA', c) || 3000);
  const reserve = blastTransactionalReserve(envValue('RESEND_BLAST_TRANSACTIONAL_RESERVE', c));
  const available = Math.min(10, dailyLimit - usage.dailyUsed - reserve - outbox.pending - admission.count, monthlyLimit - usage.monthlyUsed - reserve);

  if (!Number.isSafeInteger(available) || available < 1) return { configured: true, accepted: 0, blocked: 'protect_transactional_email' };
  const claim = crypto.randomUUID();
  const result = await client.rpc('claim_annual_conference_attendee_updates' as never, { p_claim: claim, p_limit: available } as never);

  if (result.error) throw new Error('Attendee update queue unavailable.');
  const deliveries = z.array(deliverySchema).parse(result.data);
  let accepted = 0;

  for (const delivery of deliveries) {
    if (Date.now() + 30000 >= Date.parse(delivery.claimed_until)
      || Date.now() + 30000 >= Date.parse(delivery.first_attempt_at) + 3600000) continue;
    let id: string;

    try {
      const content = {
        from, reply_to: replyTo, to: [delivery.recipient_email], subject: delivery.subject,
        text: `Hi ${delivery.recipient_name},\n\n${delivery.body}\n\nAn update about your DevCon26 registration.`,
        html: `<p>Hi ${escapeHtml(delivery.recipient_name)},</p><p>${escapeHtml(delivery.body).replaceAll('\n', '<br />')}</p><p>An update about your DevCon26 registration.</p>`,
      };
      const frozen = await client.rpc('freeze_annual_conference_attendee_update' as never, { p_id: delivery.id, p_claim: claim, p_payload: content } as never);
      const payload = payloadSchema.safeParse(frozen.data);

      if (frozen.error || !payload.success || payload.data.to[0] !== delivery.recipient_email) throw new Error('Update lease unavailable.');
      const sent = await sendResendEmailBatch({ apiKey, idempotencyKey: `conference-update:${delivery.id}`, emails: [payload.data] });

      id = sent.ids[0];
    } catch {
      const failed = await client.rpc('finish_annual_conference_attendee_update' as never, { p_id: delivery.id, p_claim: claim } as never);

      if (failed.error) throw new Error('Update acknowledgement failed.');
      continue;
    }
    const done = await client.rpc('finish_annual_conference_attendee_update' as never, { p_id: delivery.id, p_claim: claim, p_provider_id: id } as never);

    if (done.error) throw new Error('Update acknowledgement failed.');
    accepted += 1;
  }

  return { configured: true, accepted };
}
