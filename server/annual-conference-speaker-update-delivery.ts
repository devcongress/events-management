import crypto from 'node:crypto';
import type { Context } from 'hono';
import { z } from 'zod';
import { getSupabaseAdminClient, isSupabaseRuntimeEnabled } from '@/lib/supabase/server';
import { readResendEmailQuota, sendResendEmailBatch } from '@/lib/email/resend';
import { getEmailOutboxSummary } from '@/lib/email/delivery-health';
import { blastTransactionalReserve } from '@/lib/email/blast-capacity';
import { envValue } from '@/server/env';
import { annualConferenceSpeakerWorkspaceToken, annualConferenceSpeakerWorkspaceTokenMatches, type AnnualConferenceSpeakerIntakeLink } from '@/lib/annual-conference-speakers';
import { secureSharedSecret } from '@/lib/security/shared-secret';
import { annualConferenceEmailConfigured } from '@/server/routes/annual-conference-speakers/delivery';

const deliverySchema = z.object({
  id: z.string().uuid(), link_id: z.string().uuid(), recipient: z.string().email(), idempotency_key: z.string().min(1),
  provider_payload: z.object({
    from: z.string().min(1), reply_to: z.string().email(), to: z.array(z.string().email()).length(1),
    subject: z.string().min(1), html: z.string(), text: z.string(),
  }),
});

export async function retryAnnualConferenceSpeakerUpdates(c: Context) {
  const apiKey = envValue('RESEND_API_KEY', c)?.trim();
  const quotaKey = envValue('RESEND_BROADCASTS_API_KEY', c)?.trim() || apiKey;
  const tokenSecret = secureSharedSecret(envValue('SPEAKER_INTAKE_LINK_TOKEN_SECRET', c));

  if (!isSupabaseRuntimeEnabled(c) || envValue('DEVCON26_SPEAKER_UPDATES_ENABLED', c) !== 'true' || !apiKey || !quotaKey || !tokenSecret || !annualConferenceEmailConfigured(c)) {
    return { configured: false, accepted: 0 };
  }
  const usage = await readResendEmailQuota({ apiKey: quotaKey });
  const outbox = await getEmailOutboxSummary(c);
  const client = getSupabaseAdminClient(c);
  const admission = await client.from('annual_conference_ticket_email_outbox').select('id', { count: 'exact', head: true })
    .in('status', ['queued', 'sending', 'failed']).neq('next_attempt_at', 'infinity');

  if (usage?.dailyUsed == null || usage.monthlyUsed == null || !outbox || admission.error || admission.count === null) {
    return { configured: true, accepted: 0, blocked: 'capacity_unknown' };
  }
  const reserve = blastTransactionalReserve(envValue('RESEND_BLAST_TRANSACTIONAL_RESERVE', c));
  const available = Math.min(10,
    Number(envValue('RESEND_DAILY_EMAIL_QUOTA', c) || 100) - usage.dailyUsed - reserve - outbox.pending - admission.count,
    Number(envValue('RESEND_MONTHLY_EMAIL_QUOTA', c) || 3000) - usage.monthlyUsed - reserve);

  if (!Number.isSafeInteger(available) || available < 1) return { configured: true, accepted: 0, blocked: 'protect_transactional_email' };
  const claim = crypto.randomUUID();
  const result = await client.rpc('claim_annual_conference_speaker_updates' as never, { p_claim: claim, p_limit: available } as never);

  if (result.error) throw new Error('Speaker update queue unavailable.');
  const deliveries = z.array(deliverySchema).parse(result.data);
  let accepted = 0;

  for (const delivery of deliveries) {
    const valid = await client.rpc('valid_annual_conference_speaker_update' as never, { p_id: delivery.id, p_claim: claim } as never);

    if (valid.error) continue;
    const linkResult = await client.from('annual_conference_speaker_intake_links').select('id, token_hash').eq('id', delivery.link_id).maybeSingle();

    if (linkResult.error) continue;
    const link = linkResult.data as Pick<AnnualConferenceSpeakerIntakeLink, 'id' | 'token_hash'> | null;
    const token = annualConferenceSpeakerWorkspaceToken(delivery.link_id, tokenSecret);
    const workspaceUrl = delivery.provider_payload.text.match(new RegExp(`https?://[^\\s\"'<>/]+/conference-speakers/\\d{4}/${token}(?![A-Za-z0-9_-])`))?.[0];
    const linkMatches = link && annualConferenceSpeakerWorkspaceTokenMatches(link as AnnualConferenceSpeakerIntakeLink, tokenSecret)
      && workspaceUrl && delivery.provider_payload.html.includes(`href=\"${workspaceUrl}\"`);

    if (!valid.data || !linkMatches || delivery.provider_payload.to[0] !== delivery.recipient) {
      const failed = await client.rpc('finish_annual_conference_speaker_update' as never, {
        p_id: delivery.id, p_claim: claim, p_error: 'Recipient or workspace changed',
      } as never);

      if (failed.error) throw new Error('Speaker update acknowledgement failed.');
      continue;
    }
    let providerId: string;

    try {
      const sent = await sendResendEmailBatch({ apiKey, idempotencyKey: delivery.idempotency_key, emails: [delivery.provider_payload] });

      const ids = z.array(z.string().trim().min(1).max(200)).length(1).safeParse(sent.ids);

      if (!ids.success) continue;
      providerId = ids.data[0];
    } catch {
      // A network failure may follow provider acceptance. Keep the lease until expiry,
      // then replay the exact frozen payload with the same idempotency key.
      continue;
    }
    const done = await client.rpc('finish_annual_conference_speaker_update' as never, {
      p_id: delivery.id, p_claim: claim, p_provider_id: providerId,
    } as never);

    if (done.error || !done.data) throw new Error('Speaker update acknowledgement failed.');
    accepted += 1;
  }

  return { configured: true, accepted };
}
