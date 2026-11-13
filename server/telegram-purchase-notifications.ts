import crypto from 'node:crypto';
import type { Context } from 'hono';
import { z } from 'zod';
import { getSupabaseAdminClient } from '@/lib/supabase/server';
import { envValue } from '@/server/env';

const rowsSchema = z.array(z.object({
  id: z.string().uuid(), event_type: z.enum(['payment_succeeded', 'checkout_incomplete', 'refund_required', 'refund_completed', 'refund_needs_attention']),
  tier_key: z.string(), quantity: z.number().int().positive(), detail_code: z.enum(['paid', 'expired', 'payment_failed', 'checkout_abandoned', 'payment_reversed', 'customer_cancelled', 'insufficient_funds', 'declined', 'expired_card', 'bank_unavailable', 'timed_out', 'card_verification_failed', 'failed', 'required', 'refunded', 'needs_attention', 'seat_refund']),
  occurred_at: z.string().datetime({ offset: true }),
  subtotal_minor: z.number().int().nonnegative(), total_minor: z.number().int().nonnegative(),
  paid_ticket_count: z.number().int().nonnegative().nullable(),
}).refine((row) => row.event_type === 'payment_succeeded' ? row.paid_ticket_count !== null : row.paid_ticket_count === null)).max(5);

export function telegramLifecycleMessage(row: z.infer<typeof rowsSchema>[number]): string {
  const money = (value: number) => `GH₵${(value / 100).toFixed(2)}`;
  const pass = row.tier_key === 'regular_flexible' || row.tier_key === 'regular' ? 'Regular' : 'Ticket';
  const seats = `${row.quantity} ${row.quantity === 1 ? 'seat' : 'seats'}`;
  const details = {
    paid: 'Payment confirmed', expired: 'Checkout hold expired', payment_failed: 'Payment failed', checkout_abandoned: 'Checkout abandoned',
    payment_reversed: 'Payment reversed', customer_cancelled: 'Customer cancelled payment', insufficient_funds: 'Insufficient funds',
    declined: 'Payment declined', expired_card: 'Card expired', bank_unavailable: 'Bank unavailable', timed_out: 'Payment timed out',
    card_verification_failed: 'Card verification failed', failed: 'Provider follow-up required', required: 'Payment received, but tickets were not issued',
    refunded: 'Refund confirmed', needs_attention: 'Provider follow-up required', seat_refund: 'Seat refund confirmed',
  };
  const headings = {
    payment_succeeded: '✅ <b>Payment successful</b>', checkout_incomplete: '⚠️ <b>Checkout incomplete</b>',
    refund_required: '🚨 <b>Refund required</b>', refund_completed: '↩️ <b>Refund completed</b>',
    refund_needs_attention: '🛠 <b>Refund needs attention</b>',
  };
  const amountLine = row.event_type === 'payment_succeeded'
    ? `${seats} · ${money(row.subtotal_minor)} subtotal\n<b>${money(row.total_minor)} paid</b>\nPaid tickets so far · ${row.paid_ticket_count}`
    : row.event_type === 'checkout_incomplete'
      ? `${seats} · ${money(row.total_minor)} quoted\n${details[row.detail_code]}`
      : `${seats} · <b>${money(row.total_minor)} refund</b>\n${details[row.detail_code]}`;
  const date = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'GMT' }).format(new Date(row.occurred_at)).replace(',', ' ·');
  const action = row.event_type === 'checkout_incomplete' ? 'Review checkout' : 'View in Ticketing';

  return `${headings[row.event_type]}\nDevCon26 · ${pass} pass\n${amountLine}\n\n<a href="https://em.devcongress.org/organizer-console/annual-conference/2026/ticketing?section=orders">${action} →</a>\n<i>${date} GMT</i>`;
}

const versionSchema = z.object({ id: z.string().uuid(), timestamp: z.string().datetime({ offset: true }) });
const credentialsSchema = z.object({
  token: z.string().regex(/^\d+:[A-Za-z0-9_-]+$/),
  chat: z.string().regex(/^-?\d+$/),
});

async function sendTelegram(token: string, chat: string, message: string): Promise<{ result: string; retrySeconds: number | null }> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(10_000),
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text: message, parse_mode: 'HTML', link_preview_options: { is_disabled: true } }),
    });
    const body: unknown = await response.json();
    const parsed = z.object({ ok: z.boolean(), result: z.object({ message_id: z.number().int() }).optional(), parameters: z.object({ retry_after: z.number().int().min(1).max(3600) }).optional() }).safeParse(body);

    if (response.ok && parsed.success && parsed.data.ok && parsed.data.result) return { result: 'sent', retrySeconds: null };
    if (response.status === 429 && parsed.success && !parsed.data.ok && parsed.data.parameters) return { result: 'retry', retrySeconds: parsed.data.parameters.retry_after };
  } catch {
    // Provider acceptance may have occurred; reconcile manually.
  }

  return { result: 'needs_review', retrySeconds: null };
}

export async function dispatchTelegramPurchases(c: Context): Promise<void> {
  const enabled = envValue('DEVCON26_TELEGRAM_PURCHASE_NOTIFICATIONS_ENABLED', c);
  const token = envValue('DEVCON26_TELEGRAM_BOT_TOKEN', c)?.trim();
  const chat = envValue('DEVCON26_TELEGRAM_CHAT_ID', c)?.trim();
  const version = versionSchema.safeParse(c.env?.CF_VERSION_METADATA);

  if (enabled !== 'true' || !version.success || !Number.isFinite(Date.parse(version.data.timestamp))) return;
  const client = getSupabaseAdminClient(c);
  const claim = crypto.randomUUID();
  const activation = await client.rpc('ensure_devcon26_telegram_activation' as never, {
    p_version_id: version.data.id, p_version_at: version.data.timestamp,
  } as never);

  if (activation.error) throw new Error('Telegram activation failed.');
  const credentials = credentialsSchema.safeParse({ token, chat });

  if (!credentials.success) return;
  const leased = await client.rpc('claim_devcon26_telegram_purchases' as never, { p_claim: claim, p_start_at: version.data.timestamp } as never);

  if (leased.error) throw new Error('Purchase notification claim failed.');
  const rows = rowsSchema.parse(leased.data);

  for (const row of rows) {
    const begun = await client.rpc('begin_devcon26_telegram_purchase' as never, { p_event: row.id, p_claim: claim } as never);

    if (begun.error || begun.data !== true) continue;
    const delivery = await sendTelegram(credentials.data.token, credentials.data.chat, telegramLifecycleMessage(row));
    const finished = await client.rpc('finish_devcon26_telegram_purchase' as never, {
      p_event: row.id, p_claim: claim, p_result: delivery.result, p_retry_seconds: delivery.retrySeconds,
    } as never);

    if (finished.error) throw new Error('Purchase notification finalization failed.');
  }
}

export async function dispatchTelegramPurchasesInBackground(c: Context): Promise<void> {
  const task = dispatchTelegramPurchases(c).catch(() => console.warn('Purchase notification dispatch failed.'));

  try {
    c.executionCtx.waitUntil(task);
  } catch {
    // Bun has no execution context; the caught task can continue independently.
    void task;
  }
}
