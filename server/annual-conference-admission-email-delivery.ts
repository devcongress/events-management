import { ResendDeliveryError } from '@/lib/email/resend-delivery-error';
import { conferenceTicketEmail } from '@/lib/email/templates/conference-ticket';
import { conferenceTicketPdf } from './conference-ticket-pdf';
import { createAnnualConferenceSocialCardBuyerGrant } from '@/lib/annual-conference-social-card-buyer-grant';
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
  first_attempt_at: z.string(), claimed_until: z.string(), provider_payload: z.unknown().optional(),
});
const frozenSchema = z.object({
  from: z.string(), to: z.array(z.string().email()).length(1), reply_to: z.string(),
  subject: z.string(), html: z.string(), text: z.string(),
  attachments: z.array(z.object({ filename: z.string(), content: z.string(), content_type: z.string(), content_id: z.string().optional() })).optional(),
});
const tokenSchema = z.string().regex(/^[0-9a-f]{64}$/);

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}

function conferenceWebsiteUrl(websiteOrigin: string): URL {
  const origin = new URL(websiteOrigin);

  if (origin.protocol !== 'https:' || origin.origin !== websiteOrigin || origin.pathname !== '/' || origin.search || origin.hash) {
    throw new Error('Conference website origin is invalid.');
  }

  return origin;
}

function privateCapabilityLink(websiteOrigin: string, path: string, capability: string): string {
  const url = new URL(path, conferenceWebsiteUrl(websiteOrigin));

  url.hash = new URLSearchParams({ capability }).toString();

  return url.href;
}

export async function admissionEmailContent(
  delivery: z.infer<typeof deliverySchema>,
  from: string,
  replyTo: string,
  websiteOrigin?: string,
  isTest = false,
  badgeUrl?: string,
): Promise<ResendAttachedEmail> {
  if (delivery.payload.email_version === 2) {
    const hasTicket = delivery.kind === 'flexible_admission_delivery';
    const capability = delivery.payload.capability === undefined ? undefined : tokenSchema.parse(delivery.payload.capability);
    const claim = delivery.kind === 'flexible_gift_claim';
    const link = capability ? privateCapabilityLink(websiteOrigin ?? '',
      claim ? '/devcon26/tickets/claim/' : '/devcon26/tickets/manage/', capability) : undefined;

    if (hasTicket && (delivery.payload.badge_included !== true || !badgeUrl)) {
      throw new Error('Combined ticket badge unavailable.');
    }
    const attachments = hasTicket ? [{
      filename: `devcon26-${isTest ? 'TEST-' : ''}ticket-${z.number().int().positive().parse(delivery.payload.seat_number)}.pdf`,
      content: Buffer.from(await conferenceTicketPdf({ token: tokenSchema.parse(delivery.payload.qr_token),
        name: delivery.recipient_name, seat: z.number().int().positive().parse(delivery.payload.seat_number), isTest })).toString('base64'),
      content_type: 'application/pdf',
    }] : undefined;

    return { from, to: [delivery.recipient_email], reply_to: replyTo,
      ...conferenceTicketEmail({ name: delivery.recipient_name, hasTicket, isTest,
        badgeUrl: hasTicket ? badgeUrl : undefined, managementUrl: claim ? undefined : link, claimUrl: claim ? link : undefined }),
      ...(attachments ? { attachments } : {}),
    };
  }
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
    const explanation = `Attached are ${attachments.length} preview test QR codes. No money was charged and no event admission is included. These codes cannot be used to check in. Keep them private.`;

    return {
      ...base, subject: 'Your DevCon26 test QR codes', attachments,
      html: `<p>Hi ${name},</p><p>${explanation}</p><p><strong>DevCon26 · 19 December 2026</strong><br>Ghana Digital Center, Accra</p>${attachments.map((attachment) => `<p><img src="cid:${attachment.content_id}" width="300" height="360" alt="Private test ticket QR" /></p>`).join('')}${badgeUrl ? `<p><a href="${escapeHtml(badgeUrl)}">Create your conference badge</a> (private link expires after 30 days)</p>` : ''}<p>Save the attached QR image. Keep this email and its private links.</p>`,
      text: `Hi ${delivery.recipient_name},\n\n${explanation}\n\nDevCon26 · 19 December 2026\nGhana Digital Center, Accra\n${badgeUrl ? `\nCreate your conference badge: ${badgeUrl}\n` : ''}\nSave the attached QR image. Keep this email and its private links.`,
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

async function admissionBadgeUrl(c: Context, delivery: z.infer<typeof deliverySchema>, origin: string, isTest: boolean): Promise<string> {
  const ticketId = z.string().uuid().parse(delivery.payload.ticket_id);
  const client = getSupabaseAdminClient(c);
  const card = await client.from('annual_conference_social_cards' as never)
    .select('id,is_test,revoked_at').eq('ticket_id', ticketId).single() as unknown as {
      data: { id: string; is_test: boolean; revoked_at: string | null } | null; error: unknown;
    };

  if (card.error || !card.data || card.data.is_test !== isTest || card.data.revoked_at) throw new Error('Ticket badge unavailable.');
  const ticket = await client.from('annual_conference_tickets' as never)
    .select('order_id,order_seat_number,attendee_email').eq('id', ticketId).single() as unknown as {
      data: { order_id: string; order_seat_number: number; attendee_email: string } | null; error: unknown;
    };
  const order = ticket.data ? await client.from('annual_conference_ticket_orders' as never)
    .select('payment_mode,checkout_origin,status,checkout_settings_version').eq('id', ticket.data.order_id).single() as unknown as {
      data: { payment_mode: string; checkout_origin: string | null; status: string; checkout_settings_version: number | null } | null; error: unknown;
    } : null;
  const secretKey = (isTest ? envValue('PAYSTACK_TEST_SECRET_KEY', c)
    || (order?.data?.checkout_settings_version == null ? envValue('PAYSTACK_SECRET_KEY', c) : undefined)
    : envValue('PAYSTACK_SECRET_KEY', c))?.trim();

  if (ticket.error || !ticket.data || ticket.data.attendee_email !== delivery.recipient_email
    || order?.error || order?.data?.status !== 'paid' || order.data.payment_mode !== (isTest ? 'test' : 'live')
    || (isTest && order.data.checkout_origin !== origin)
    || !secretKey?.startsWith(isTest ? 'sk_test_' : 'sk_live_')) throw new Error('Ticket badge link unavailable.');
  // Validate the destination before signing it into the grant.
  conferenceWebsiteUrl(origin);
  // Independent signed access survives scrubbing of the separately sent badge email.
  // It neither rotates nor invalidates that existing personal link.
  const grant = createAnnualConferenceSocialCardBuyerGrant({
    orderId: ticket.data.order_id, seatNumbers: [ticket.data.order_seat_number],
    verifier: delivery.id, origin, secretKey, lifetimeSeconds: 30 * 24 * 60 * 60,
  });

  return `${origin}/devcon26/social-card/#buyer_grant=${encodeURIComponent(grant)}`;
}

export function admissionEmailReadiness(c: Context) {
  const enabled = envValue('DEVCON26_ADMISSION_EMAILS_ENABLED', c) === 'true';
  const configured = Boolean(envValue('RESEND_API_KEY', c)?.trim()
    && envValue('DEVCON26_ADMISSION_EMAIL_FROM', c)?.trim()
    && envValue('DEVCON26_ADMISSION_EMAIL_REPLY_TO', c)?.trim());

  return { enabled, configured, ready: enabled && configured };
}

async function deliverAdmissionEmail(c: Context, options: Readonly<{ managed?: boolean }>, dispatchToken: string, seen: Set<string>) {
  const apiKey = envValue('RESEND_API_KEY', c)?.trim();
  const from = envValue('DEVCON26_ADMISSION_EMAIL_FROM', c)?.trim();
  const replyTo = envValue('DEVCON26_ADMISSION_EMAIL_REPLY_TO', c)?.trim();
  const websiteOrigin = envValue('PUBLIC_WEBSITE_ORIGIN', c)?.trim();

  if (envValue('DEVCON26_ADMISSION_EMAILS_ENABLED', c) !== 'true' || !apiKey || !from || !replyTo) {
    return { configured: false, accepted: 0, failed: 0 };
  }
  const client = getSupabaseAdminClient(c);
  const claim = crypto.randomUUID();
  const previewOrigin = completeTestDispatchOrigin(c, options);
  const result = await client.rpc((previewOrigin ? 'claim_complete_test_only_admission_emails' : 'claim_annual_conference_ticket_email_outbox') as never, {
    p_claim_token: claim, p_limit: 1,
    ...(previewOrigin ? { p_origin: previewOrigin } : {}),
  } as never);

  if (result.error) throw new Error('Admission email queue unavailable.');
  const parsed = z.array(deliverySchema).safeParse(result.data);

  if (!parsed.success) {
    console.error(JSON.stringify({ event: 'admission_email_invalid_claim', issues: parsed.error.issues.map((issue) => ({ path: issue.path, code: issue.code })) }));

    throw new Error('Admission email claim invalid.');
  }
  const deliveries = parsed.data;
  const counts = { configured: true, accepted: 0, failed: 0 };

  for (const delivery of deliveries) {
    if (seen.has(delivery.id)) break;
    seen.add(delivery.id);
    if (Date.now() + 30000 >= Date.parse(delivery.claimed_until)
      || Date.now() + 30000 >= Date.parse(delivery.first_attempt_at) + 23 * 3600000) continue;
    let providerId: string;
    let stage = 'recipient_policy';

    try {
      if (!await allowConferenceEmail(c, 'admission', delivery.id, delivery.recipient_email, claim)) continue;
      stage = 'test_policy';
      const testContext = await completeTestEmailContext(c, 'admission', delivery.id);

      if (!testContext.allowed) continue;

      const existingPayload = frozenSchema.safeParse(delivery.provider_payload);
      let content: ResendAttachedEmail;

      if (existingPayload.success) {
        content = existingPayload.data;
      } else {
        stage = 'badge_link';
        const messageOrigin = testContext.is_test ? testContext.origin : websiteOrigin;
        const badgeUrl = delivery.kind === 'flexible_admission_delivery'
          && (testContext.is_test || delivery.payload.email_version === 2)
          ? await admissionBadgeUrl(c, delivery, messageOrigin ?? '', testContext.is_test) : undefined;

        stage = 'content';
        const original = await admissionEmailContent(delivery, from, replyTo, messageOrigin, testContext.is_test, badgeUrl);

        content = testContext.is_test && delivery.payload.email_version !== 2 ? markCompleteTestEmail(original) : original;

      }

      stage = 'freeze';
      const frozen = await client.rpc('freeze_annual_conference_admission_email' as never, {
        p_id: delivery.id, p_claim: claim, p_payload: content,
      } as never);
      const payload = frozenSchema.safeParse(frozen.data);

      if (frozen.error || !payload.success || payload.data.to[0] !== delivery.recipient_email) throw new Error('Admission lease unavailable.');
      if (!await allowConferenceEmail(c, 'admission', delivery.id, payload.data.to[0], claim)) continue;
      if (!(await completeTestEmailContext(c, 'admission', delivery.id)).allowed) continue;

      const slot = await client.rpc('admission_send_slot' as never, { p_token: dispatchToken } as never);

      if (slot.error) throw new Error('Provider pacing unavailable.');
      if (slot.data !== true) throw new ResendDeliveryError('throttled', 1);

      stage = 'provider';
      providerId = await sendResendAttachedEmail({ apiKey, idempotencyKey: delivery.idempotency_key, email: payload.data });
    } catch (error) {
      console.error(JSON.stringify({ event: 'admission_email_failed', stage }));
      const kind = error instanceof ResendDeliveryError ? error.kind : 'ambiguous';
      const delay = error instanceof ResendDeliveryError ? error.retryAfterSeconds : 60;

      if (kind === 'throttled') {
        const cooldown = await client.rpc('admission_send_slot' as never, { p_token: dispatchToken, p_cooldown_seconds: delay } as never);

        if (cooldown.error) throw new Error('Provider cooldown unavailable.');
      }
      const failed = await client.rpc('defer_admission_delivery' as never, {
        p_id: delivery.id, p_claim: claim, p_kind: kind, p_seconds: delay,
      } as never);

      if (failed.error) {
        console.error(JSON.stringify({ event: 'admission_email_acknowledgement_failed', code: failed.error.code }));

        throw new Error('Admission email acknowledgement failed.');
      }
      counts.failed += 1;
      continue;
    }

    // A failed acknowledgement must retain the lease and frozen provider payload.
    const finalized = await client.rpc((previewOrigin ? 'finalize_complete_test_only_admission_email' : 'finalize_annual_conference_ticket_email_outbox') as never, {
        ...(previewOrigin ? { p_origin: previewOrigin } : {}),
      p_outbox_id: delivery.id, p_claim_token: claim, p_status: 'accepted', p_provider_email_id: providerId,
    } as never);

    if (finalized.error) throw new Error('Admission email acknowledgement failed.');
    counts.accepted += 1;
  }

  return counts;
}

export async function retryAnnualConferenceAdmissionEmails(c: Context, options: Readonly<{ managed?: boolean; scheduled?: boolean }> = {}) {
  const counts = { configured: admissionEmailReadiness(c).ready, accepted: 0, failed: 0 };

  if (!counts.configured) return counts;
  const client = getSupabaseAdminClient(c);
  const token = crypto.randomUUID();
  const started = Date.now();
  const lease = await client.rpc('lease_admission_dispatch' as never, { p_token: token, p_seconds: options.scheduled ? 60 : 30 } as never);

  if (lease.error) throw new Error('Admission dispatcher unavailable.');
  if (lease.data !== true) return counts;

  try {
    // A final 15-second provider call must finish before the dispatch lease and HTTP waitUntil budget.
    const seen = new Set<string>();
    const startBudget = options.scheduled ? 40000 : 8000;

    for (let i = 0; i < 3 && Date.now() - started < startBudget; i += 1) {
      const result = await deliverAdmissionEmail(c, options, token, seen);

      counts.accepted += result.accepted;
      counts.failed += result.failed;
      if (result.failed || result.accepted === 0) break;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  } finally {
    const released = await client.rpc('release_admission_dispatch' as never, { p_token: token } as never);

    if (released.error) console.error(JSON.stringify({ event: 'admission_dispatch_release_failed' }));
  }

  return counts;
}
