import { createAnnualConferenceSocialCardBuyerGrant } from '@/lib/annual-conference-social-card-buyer-grant';
import { getSupabaseAnnualConferenceSocialCardByOrderSeat } from '@/lib/supabase/annual-conference-social-cards';
import crypto from 'node:crypto';
import { cors } from 'hono/cors';
import type { Context, Hono } from 'hono';
import { z } from 'zod';
import { COMPLETE_TEST_CHECKOUT_PATH as path, COMPLETE_TEST_REFERENCE, completeTestConfiguration } from '@/lib/devcon26-complete-test-checkout';
import { devcon26FlexibleCheckoutInitializeSchema } from '@/lib/devcon26-public-checkout';
import { devcon26CartAllocationsForStorage } from '@/lib/devcon26-ticket-cart';
import { createPaystackHostedCheckout, readPaystackTestTransaction, verifyPaystackWebhookSignature, parseVerifiedPaystackCharge } from '@/lib/annual-conference-ticket-payments';
import { createDevcon26FlexibleCheckoutGrant, verifyDevcon26FlexibleCheckoutGrant } from '@/lib/devcon26-flexible-checkout-grant';
import { getSupabaseAdminClient } from '@/lib/supabase/server';
import {
  getSupabaseAnnualConferenceTicketing, getSupabaseAnnualConferenceFlexibleCheckoutState,
  prepareSupabaseAnnualConferenceTicketPaymentAttempt, getSupabaseAnnualConferenceTicketPaymentAttempt,
  confirmSupabaseAnnualConferenceTicketPayment, getSupabaseAnnualConferencePaidOrderSummary,
} from '@/lib/supabase/annual-conference-ticketing';
import { envValue } from '@/server/env';
import { registrationTesting } from '@/server/annual-conference-registration-testing';
import { dispatchCompleteTestEmails } from '@/server/complete-test-immediate-emails';
import { admissionEmailReadiness } from '@/server/annual-conference-admission-email-delivery';
import { annualConferenceSocialCardEmailConfigurationForRequest } from '@/server/annual-conference-social-card-email-delivery';
import { enforcePublicRateLimit, publicClientKey, requirePublicTurnstile } from '@/server/http/public-intake-protection';
import type { AppBindings } from '@/server/http/app-bindings';

const initializeSchema = devcon26FlexibleCheckoutInitializeSchema.extend({
  turnstile_token: z.string().trim().min(1).max(2048),
  turnstile_action: z.literal('devcon26_complete_test_checkout'),
});

const verifySchema = z.object({
  reference: z.string().regex(COMPLETE_TEST_REFERENCE),
  checkout_grant: z.string().min(20).max(2000),
  checkout_verifier: z.string().regex(/^[A-Za-z0-9_-]{40,100}$/),
}).strict();

function configuration(c: Context) {
  return completeTestConfiguration(Object.fromEntries([
    'DEVCON26_COMPLETE_TEST_ENABLED', 'DEVCON26_COMPLETE_TEST_ORIGIN', 'PAYSTACK_TEST_SECRET_KEY', 'PAYSTACK_SECRET_KEY',
  ].map((key) => [key, envValue(key, c)])));
}

async function checkoutReadiness(c: Context) {
  const ticketing = await getSupabaseAnnualConferenceTicketing(2026, c);

  if (!ticketing || ticketing.settings.public_mode !== 'paid' || ticketing.settings.ticket_sales_status !== 'open'
    || !admissionEmailReadiness(c).ready || !annualConferenceSocialCardEmailConfigurationForRequest(c).enabled) return null;

  const testing = await registrationTesting(c, ticketing.settings.edition_id);
  const state = await getSupabaseAnnualConferenceFlexibleCheckoutState(ticketing.settings.edition_id, c);

  if (!testing.enabled || !testing.tester_emails.length || state?.flexible_checkout_state !== 'internal'
    || state.regular_price_minor !== 15000) return null;

  return { ticketing, testing };
}

export function registerDevcon26CompleteTestCheckout(app: Hono<AppBindings>) {
  const testCors = cors({
    origin: (origin, c) => configuration(c)?.origin === origin ? origin : undefined,
    allowMethods: ['GET', 'POST', 'OPTIONS'], allowHeaders: ['Content-Type'], maxAge: 600,
  });

  app.use(path, testCors);
  app.use(`${path}/*`, testCors);
  app.use(`${path}/*`, async (c, next) => {
    if (!configuration(c) || configuration(c)?.origin !== c.req.header('Origin')) return c.json({ error: 'Test checkout unavailable.' }, 503);
    if (c.req.method === 'POST' && c.req.header('Content-Type')?.split(';')[0].trim() !== 'application/json') {
      return c.json({ error: 'Use a JSON request.' }, 415);
    }

    await next();
  });

  app.get(path, async (c) => {
    c.header('Cache-Control', 'no-store');

    if (!configuration(c) || configuration(c)?.origin !== c.req.header('Origin')
      || !envValue('TURNSTILE_SECRET_KEY', c)?.trim()) return c.json({ mode: 'unavailable' });

    try {
      if (!await checkoutReadiness(c)) return c.json({ mode: 'unavailable' });

      return c.json({
        mode: 'test', currency: 'GHS', payment_providers: [{ key: 'paystack' }],
        flexible_checkout: { mode: 'test', unit_amount_minor: 15000, max_per_payment: 20 },
      });
    } catch {
      return c.json({ mode: 'unavailable' });
    }
  });

  app.post(`${path}/initialize`, async (c) => {
    const config = configuration(c)!;
    const input = initializeSchema.safeParse(await c.req.json().catch(() => null));

    if (!input.success || input.data.cart.quantity > 20) return c.json({ error: 'Choose up to 20 test tickets.' }, 400);

    const limited = await enforcePublicRateLimit(c, {
      action: 'complete-test-initialize', clientKey: publicClientKey(c), maxAttempts: 20, windowSeconds: 300,
    }, 'Please wait before trying again.');

    if (limited) return limited;
    if (!envValue('TURNSTILE_SECRET_KEY', c)?.trim()) {
      return c.json({ error: 'Human verification is temporarily unavailable.' }, 503);
    }

    const challenge = await requirePublicTurnstile(c, {
      token: input.data.turnstile_token,
      submittedAction: input.data.turnstile_action,
      expectedAction: 'devcon26_complete_test_checkout',
      expectedHostname: new URL(config.origin).hostname,
    });

    if (challenge) return challenge;

    try {
      const readiness = await checkoutReadiness(c);

      if (!readiness) return c.json({ error: 'Test checkout is unavailable.' }, 503);

      const { ticketing, testing } = readiness;

      const recipients = new Set([input.data.purchaser_email,
        ...input.data.cart.allocations.flatMap((seat) => seat.kind === 'gift' ? [seat.recipient_email] : []),
      ]);

      if (!testing.tester_emails.includes(input.data.purchaser_email)) {
        return c.json({ error: 'Your email is not approved for preview checkout yet. Go back to Your details to use an approved email, or ask the organizer to add yours, then try again.' }, 409);
      }

      if (Array.from(recipients).some((email) => !testing.tester_emails.includes(email))) {
        return c.json({ error: 'A gift recipient email is not approved for preview checkout yet. Go back to Tickets to check the recipient emails, or ask the organizer to approve them, then try again.' }, 409);
      }

      for (const limit of [
        { action: 'complete-test-ip-day', clientKey: publicClientKey(c), maxAttempts: 100 },
        ...Array.from(recipients, (clientKey) => ({ action: 'complete-test-recipient-day', clientKey, maxAttempts: 50 })),
        { action: 'complete-test-shared-day', clientKey: 'all', maxAttempts: 500 },
      ]) {
        const quota = await enforcePublicRateLimit(c, { ...limit, windowSeconds: 86_400 },
          'The test checkout limit has been reached. Please try again tomorrow.');

        if (quota) return quota;
      }

      const result = await getSupabaseAdminClient(c).rpc('create_complete_test_hold_v2' as never, {
        p_edition_id: ticketing.settings.edition_id,
        p_purchaser_name: input.data.purchaser_name, p_purchaser_email: input.data.purchaser_email,
        p_quantity: input.data.cart.quantity, p_checkout_request_key: input.data.checkout_request_key,
        p_origin: config.origin,
        p_allocations: devcon26CartAllocationsForStorage(input.data.cart, { name: input.data.purchaser_name, email: input.data.purchaser_email }),
      } as never) as unknown as { data: { id: string; payment_mode: string; checkout_origin: string; amount_minor: number } | null; error: unknown };
      const order = result.data;

      if (result.error || !order || order.payment_mode !== 'test' || order.checkout_origin !== config.origin
        || order.amount_minor !== input.data.cart.quantity * 15000) {
        return c.json({ error: 'We could not reserve your tickets. No payment was started. Please try again; if this continues, contact the organizer.' }, 503);
      }

      const reference = `devcon26-complete-test-${order.id.replaceAll('-', '')}`;

      await prepareSupabaseAnnualConferenceTicketPaymentAttempt(order.id, reference, c);
      const checkout = await createPaystackHostedCheckout({
        secretKey: config.secretKey, orderId: order.id, purchaserEmail: input.data.purchaser_email,
        amountMinor: order.amount_minor, callbackUrl: `${config.origin}/devcon26/payment-confirmation/`, paymentReference: reference,
      });
      const verifier = crypto.randomBytes(32).toString('base64url');

      return c.json({
        mode: 'test', authorization_url: checkout.authorizationUrl, reference,
        checkout_verifier: verifier,
        checkout_grant: createDevcon26FlexibleCheckoutGrant({ orderId: order.id, verifier, origin: config.origin, secretKey: config.secretKey }),
        quantity: input.data.cart.quantity, amount_minor: order.amount_minor, currency: 'GHS',
      });
    } catch {
      return c.json({ error: 'Test checkout could not start.' }, 503);
    }
  });

  app.post(`${path}/verify`, async (c) => {
    const config = configuration(c)!;
    const input = verifySchema.safeParse(await c.req.json().catch(() => null));

    if (!input.success) return c.json({ error: 'Invalid test checkout.' }, 400);

    const limited = await enforcePublicRateLimit(c, {
      action: 'complete-test-verify', clientKey: publicClientKey(c), maxAttempts: 12, windowSeconds: 300,
    }, 'Please wait before trying again.');

    if (limited) return limited;

    try {
      const grant = verifyDevcon26FlexibleCheckoutGrant({ grant: input.data.checkout_grant, verifier: input.data.checkout_verifier, origin: config.origin, secretKey: config.secretKey });
      const attempt = await getSupabaseAnnualConferenceTicketPaymentAttempt(input.data.reference, c);

      if (!grant || !attempt || attempt.order_id !== grant.order_id) return c.json({ error: 'Invalid test checkout.' }, 404);

      const stored = await getSupabaseAdminClient(c).from('annual_conference_ticket_orders' as never)
        .select('payment_mode,checkout_origin,edition_id').eq('id', grant.order_id).single() as unknown as {
          data: { payment_mode: string; checkout_origin: string; edition_id: string } | null; error: unknown;
        };

      if (stored.error || stored.data?.payment_mode !== 'test' || stored.data.checkout_origin !== config.origin
        || !(await registrationTesting(c, stored.data.edition_id)).enabled) return c.json({ error: 'Test checkout is unavailable.' }, 409);

      const payment = await readPaystackTestTransaction({ secretKey: config.secretKey, paymentReference: input.data.reference });

      if (payment.status !== 'verified') return c.json({ mode: 'test', status: payment.status });

      const facts = { domain: 'test', amount: payment.amountMinor, currency: payment.currency, fee_mode: 'merchant_absorbs' };
      const order = await confirmSupabaseAnnualConferenceTicketPayment({
        orderId: grant.order_id, provider: 'paystack', providerEventId: `complete-test:${payment.providerEventId}`,
        eventType: 'charge.success', paymentReference: payment.paymentReference, amountMinor: payment.amountMinor,
        currency: payment.currency, payloadSha256: crypto.createHash('sha256').update(JSON.stringify(facts)).digest('hex'), paymentFacts: facts,
      }, c);

      if (order?.status !== 'paid') return c.json({ mode: 'test', status: 'pending' });

      await dispatchCompleteTestEmails(c);

      const summary = await getSupabaseAnnualConferencePaidOrderSummary(grant.order_id, c);

      if (!summary) throw new Error('Missing summary');

      const allocation = await getSupabaseAdminClient(c).from('annual_conference_flexible_ticket_allocations' as never)
        .select('seat_index').eq('order_id', grant.order_id).eq('allocation_kind', 'self').maybeSingle() as unknown as {
          data: { seat_index: number } | null; error: unknown;
        };

      if (allocation.error) throw new Error('Badge allocation unavailable');

      const seat = allocation.data?.seat_index;
      const card = seat ? await getSupabaseAnnualConferenceSocialCardByOrderSeat(grant.order_id, seat, c) : null;
      const badge = card?.is_test && seat ? {
        buyer_grant: createAnnualConferenceSocialCardBuyerGrant({
          orderId: grant.order_id, verifier: input.data.checkout_verifier, origin: config.origin,
          secretKey: config.secretKey, seatNumbers: [seat],
        }),
        card_quantity: 1,
        can_return_later: true,
      } : { card_quantity: 0 };

      return c.json({ ...summary, ...badge, mode: 'test', status: 'verified' });
    } catch {
      return c.json({ error: 'Test payment could not be confirmed yet.' }, 503);
    }
  });

  app.post('/api/webhooks/paystack/devcon26-complete-test', async (c) => {
    const config = configuration(c);

    if (!config) return c.json({ error: 'Not found.' }, 404);

    const body = await c.req.text();

    if (!verifyPaystackWebhookSignature(body, c.req.header('x-paystack-signature') ?? null, config.secretKey)) {
      return c.json({ error: 'Invalid signature.' }, 401);
    }

    const event = parseVerifiedPaystackCharge(body);

    if (!event || !COMPLETE_TEST_REFERENCE.test(event.paymentReference)) return c.body(null, 204);

    try {
      const attempt = await getSupabaseAnnualConferenceTicketPaymentAttempt(event.paymentReference, c);

      if (!attempt) return c.body(null, 204);

      const stored = await getSupabaseAdminClient(c).from('annual_conference_ticket_orders' as never)
        .select('payment_mode,checkout_origin,edition_id').eq('id', attempt.order_id).single() as unknown as {
          data: { payment_mode: string; checkout_origin: string; edition_id: string } | null; error: unknown;
        };

      if (stored.error) throw new Error('Order lookup failed');
      if (stored.data?.payment_mode !== 'test' || stored.data.checkout_origin !== config.origin
        || !(await registrationTesting(c, stored.data.edition_id)).enabled) return c.body(null, 204);

      const payment = await readPaystackTestTransaction({ secretKey: config.secretKey, paymentReference: event.paymentReference });

      if (payment.status !== 'verified') return c.body(null, 204);

      const order = await confirmSupabaseAnnualConferenceTicketPayment({
        orderId: attempt.order_id, provider: 'paystack', providerEventId: `complete-test:${payment.providerEventId}`,
        eventType: 'charge.success', paymentReference: payment.paymentReference, amountMinor: payment.amountMinor,
        currency: payment.currency, payloadSha256: crypto.createHash('sha256').update(body).digest('hex'),
        paymentFacts: { domain: 'test', amount: payment.amountMinor, currency: payment.currency, fee_mode: 'merchant_absorbs' },
      }, c);

      if (!order) throw new Error('Confirmation unavailable');
      if (order.status === 'paid') await dispatchCompleteTestEmails(c);

      return c.body(null, 204);
    } catch {
      return c.json({ error: 'Test payment confirmation is unavailable.' }, 503);
    }
  });
}
