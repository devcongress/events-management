import crypto from 'node:crypto';
import type { Context } from 'hono';
import { z } from 'zod';
import { managedCheckoutSettingsSchema, managedPaymentModeSchema, managedPaymentSecret } from '@/lib/managed-conference-checkout';
import { getSupabaseAdminClient } from '@/lib/supabase/server';
import { confirmSupabaseAnnualConferenceTicketPayment } from '@/lib/supabase/annual-conference-ticketing';
import { inspectPaystackLiveTransaction, readPaystackTestTransaction } from '@/lib/annual-conference-ticket-payments';
import { envValue } from '@/server/env';
import { admissionEmailReadiness } from '@/server/annual-conference-admission-email-delivery';
import { annualConferenceSocialCardEmailConfigurationForRequest } from '@/server/annual-conference-social-card-email-delivery';

export function managedPaymentEnvironment(c: Context): Record<string, string | undefined> {
  return Object.fromEntries([
    'PAYSTACK_SECRET_KEY', 'PAYSTACK_TEST_SECRET_KEY', 'PUBLIC_WEBSITE_ORIGIN',
    'DEVCON26_PUBLIC_CHECKOUT_ORIGINS', 'TURNSTILE_SECRET_KEY', 'NODE_ENV',
  ].map((key) => [key, envValue(key, c)]));
}

export async function managedCheckoutRpc(c: Context, name: string, args: Record<string, unknown>): Promise<unknown> {
  const result = await getSupabaseAdminClient(c).rpc(name as never, args as never);

  if (result.error) throw new Error(result.error.message);

  return result.data;
}

export async function managedCheckoutSettings(c: Context, year = 2026) {
  const data = await managedCheckoutRpc(c, 'get_managed_conference_checkout_settings', { p_year: year });

  return data === null ? null : managedCheckoutSettingsSchema.parse(data);
}

export function managedCheckoutReadiness(c: Context, mode: 'test' | 'live') {
  const environment = managedPaymentEnvironment(c);
  const reasons: string[] = [];

  if (!managedPaymentSecret(environment, mode)) reasons.push(`The Paystack ${mode} key is missing or invalid.`);
  if (!admissionEmailReadiness(c).ready) reasons.push('Admission email delivery is not ready.');
  if (!annualConferenceSocialCardEmailConfigurationForRequest(c).enabled) reasons.push('Badge email delivery is not ready.');
  if (!environment.TURNSTILE_SECRET_KEY?.trim()) reasons.push('Human verification is not configured.');

  try {
    const website = new URL(environment.PUBLIC_WEBSITE_ORIGIN ?? '');

    if (website.protocol !== 'https:' || website.origin !== environment.PUBLIC_WEBSITE_ORIGIN
      || website.username || website.password) reasons.push('The website origin is not configured.');
  } catch {
    reasons.push('The website origin is not configured.');
  }

  return { ready: reasons.length === 0, reasons };
}

const storedOrderSchema = z.object({
  id: z.string().uuid(), edition_id: z.string().uuid(), payment_mode: managedPaymentModeSchema,
  checkout_origin: z.string().nullable(), checkout_settings_version: z.number().int().positive().safe(),
  quoted_processing_fee_policy: z.enum(['buyer_pays_processing']).nullable(),
});

export async function managedCheckoutOrder(c: Context, reference: string) {
  const client = getSupabaseAdminClient(c);
  const attempt = await client.from('annual_conference_ticket_payment_attempts')
    .select('order_id,provider,payment_reference').eq('payment_reference', reference).maybeSingle();

  if (attempt.error) throw new Error('Payment attempt unavailable.');
  if (!attempt.data || attempt.data.provider !== 'paystack') return null;
  const stored = await client.from('annual_conference_ticket_orders' as never)
    .select('id,edition_id,payment_mode,checkout_origin,checkout_settings_version,quoted_processing_fee_policy').eq('id', attempt.data.order_id).maybeSingle();

  if (stored.error) throw new Error('Payment order unavailable.');
  const parsed = storedOrderSchema.safeParse(stored.data);

  return parsed.success ? parsed.data : null;
}

export async function confirmManagedCheckout(c: Context, order: z.infer<typeof storedOrderSchema>, reference: string) {
  const secretKey = managedPaymentSecret(managedPaymentEnvironment(c), order.payment_mode);

  if (!secretKey) throw new Error('Payment credentials unavailable.');
  let charge: { providerEventId: string; amountMinor: number; currency: string; facts: Record<string, string | number> };

  if (order.payment_mode === 'test') {
    const payment = await readPaystackTestTransaction({ secretKey, paymentReference: reference });

    if (payment.status !== 'verified') return { status: payment.status };

    charge = {
      providerEventId: payment.providerEventId, amountMinor: payment.amountMinor, currency: payment.currency,
      facts: { id: payment.providerEventId.replace(/^charge:/, ''), domain: 'test' },
    };
  } else {
    const payment = await inspectPaystackLiveTransaction({ secretKey, paymentReference: reference });

    if (payment.status !== 'success') return { status: payment.status };

    charge = {
      providerEventId: payment.charge.providerEventId, amountMinor: payment.charge.amountMinor, currency: payment.charge.currency,
      facts: payment.charge.facts,
    };
  }
  const facts = {
    ...charge.facts, domain: order.payment_mode, amount: charge.amountMinor,
    currency: charge.currency, fee_mode: order.quoted_processing_fee_policy ?? 'merchant_absorbs',
  };
  const confirmed = await confirmSupabaseAnnualConferenceTicketPayment({
    orderId: order.id, provider: 'paystack', providerEventId: `managed:${order.payment_mode}:${charge.providerEventId}`,
    eventType: 'charge.success', paymentReference: reference, amountMinor: charge.amountMinor, currency: charge.currency,
    payloadSha256: crypto.createHash('sha256').update(JSON.stringify(facts)).digest('hex'), paymentFacts: facts,
  }, c);

  if (!confirmed) throw new Error('Payment confirmation unavailable.');

  if (confirmed.status === 'expired') {
    return { status: order.payment_mode === 'test' ? 'failed' : 'refund_required' };
  }

  return { status: confirmed.status === 'paid' ? 'verified' : 'pending' };
}
