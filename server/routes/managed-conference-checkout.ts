import { PaystackInitializationError } from '@/lib/paystack-initialization-error';
import crypto from 'node:crypto';
import type { Context, Hono } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';
import { MANAGED_CHECKOUT_PATH as path, MANAGED_PAYMENT_WEBHOOK_PATH, MANAGED_PROCESSING_FEE_POLICY, MANAGED_PROCESSING_FEE_ROUNDING, managedCheckoutInitializeSchema, managedCheckoutMaximumQuantity, managedCheckoutOrigin, managedCheckoutProcessingFeeQuote, managedCheckoutVerifySchema, managedPaymentReference, managedPaymentSecret } from '@/lib/managed-conference-checkout';
import { createPaystackHostedCheckout, isPaystackCheckoutUrl, parseVerifiedPaystackCharge, verifyPaystackWebhookSignature } from '@/lib/annual-conference-ticket-payments';
import { devcon26CartAllocationsForStorage, devcon26AvailablePaymentProviders, PAYSTACK_MAX_TRANSACTION_MINOR } from '@/lib/devcon26-ticket-cart';
import { createDevcon26FlexibleCheckoutGrant, verifyDevcon26FlexibleCheckoutGrant } from '@/lib/devcon26-flexible-checkout-grant';
import { createAnnualConferenceSocialCardBuyerGrant } from '@/lib/annual-conference-social-card-buyer-grant';
import { getSupabaseAnnualConferencePaidOrderSummary } from '@/lib/supabase/annual-conference-ticketing';
import { getSupabaseAnnualConferenceSocialCardByOrderSeat } from '@/lib/supabase/annual-conference-social-cards';
import { getSupabaseAdminClient } from '@/lib/supabase/server';
import { managedCheckoutOrder, managedCheckoutReadiness, managedCheckoutRpc, managedCheckoutSettings, managedPaymentEnvironment, confirmManagedCheckout } from '@/server/managed-conference-checkout';
import { registrationTesting } from '@/server/annual-conference-registration-testing';
import { dispatchManagedConferenceEmails } from '@/server/complete-test-immediate-emails';
import { assessPublicSubmissionEmail, enforcePublicRateLimit, publicClientKey, requirePublicTurnstile } from '@/server/http/public-intake-protection';
import type { AppBindings } from '@/server/http/app-bindings';

const holdSchema = z.object({
  id: z.string().uuid(), payment_mode: z.enum(['test', 'live']), amount_minor: z.number().int().positive().safe(),
  quoted_processing_fee_minor: z.number().int().nonnegative().safe(), quoted_gross_amount_minor: z.number().int().positive().safe(),
  currency: z.literal('GHS'), expires_at: z.string().optional(),
});
const initializationSchema = z.object({ authorization_url: z.string().nullable(), initialization_claim: z.string().uuid().nullable() });

export function managedCheckoutFailure(c: Context, error: unknown) {
  const message = error instanceof Error ? error.message : '';

  if (message.includes('checkout_settings_changed')) return c.json({ error: 'Checkout settings changed. Review the updated checkout before continuing.', code: 'checkout_settings_changed' }, 409);
  if (message.includes('initialization_in_progress')) return c.json({ error: 'Your checkout is being prepared. Please try again shortly.', code: 'checkout_initialization_in_progress' }, 409);
  if (message.includes('initialization_uncertain')) return c.json({ error: 'This checkout needs confirmation. Check your email or contact the organizer before starting another payment.', code: 'checkout_initialization_uncertain' }, 409);
  if (message.includes('capacity_exhausted')) return c.json({ error: 'There are not enough tickets left.' }, 409);
  if (message.includes('recipient_not_allowed') || message.includes('tester_not_allowed')) return c.json({ error: 'One or more addresses are not approved for testing.' }, 409);
  if (message.includes('not_payable')) return c.json({ error: 'This checkout cannot accept another payment. Check your ticket email or contact the organizer before starting again.' }, 409);
  if (message.includes('request_conflict')) return c.json({ error: 'This checkout has expired or was already used. Check your email before starting again.' }, 409);

  return c.json({ error: 'Checkout is temporarily unavailable. No new payment was confirmed.' }, 503);
}

export function registerManagedConferenceCheckout(app: Hono<AppBindings>): void {
  for (const legacyPath of ['/api/public/annual-conference/2026/checkout/initialize', '/api/public/annual-conference/2026/checkout/flexible/initialize']) {
    app.post(legacyPath, (c) => c.json({ error: 'Refresh the website to use the current checkout.', code: 'checkout_moved' }, 410));
  }

  const publicCors = cors({
    origin: (origin, c) => managedCheckoutOrigin(managedPaymentEnvironment(c), origin) ?? undefined,
    allowMethods: ['GET', 'POST', 'OPTIONS'], allowHeaders: ['Content-Type'], maxAge: 600,
  });

  app.use(path, publicCors);
  app.use(`${path}/*`, publicCors);
  app.use(`${path}/*`, async (c, next) => {
    c.header('Cache-Control', 'no-store');

    if (!managedCheckoutOrigin(managedPaymentEnvironment(c), c.req.header('Origin'))) return c.json({ error: 'Checkout unavailable.' }, 403);
    if (c.req.method === 'POST' && c.req.header('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return c.json({ error: 'Use a JSON checkout request.' }, 415);

    await next();
  });

  app.get(path, async (c) => {
    c.header('Cache-Control', 'no-store');

    if (!managedCheckoutOrigin(managedPaymentEnvironment(c), c.req.header('Origin'))) return c.json({ mode: 'unavailable' });

    try {
      const settings = await managedCheckoutSettings(c);

      if (!settings || settings.public_mode !== 'paid' || settings.sales_status !== 'open'
        || !['internal', 'public'].includes(settings.flexible_checkout_state)
        || settings.regular_price_minor !== 15000 || !managedCheckoutReadiness(c, settings.payment_mode).ready) return c.json({ mode: 'unavailable' });
      if (settings.payment_mode === 'test' && !(await registrationTesting(c, settings.edition_id)).tester_emails.length) return c.json({ mode: 'unavailable' });

      return c.json({
        mode: settings.payment_mode, settings_version: settings.settings_version,
        accepts_coupon: false, currency: 'GHS', payment_providers: devcon26AvailablePaymentProviders(),
        flexible_checkout: {
          mode: settings.payment_mode, unit_amount_minor: 15000,
          fee_rate_basis_points: settings.processing_fee_rate_basis_points,
          fee_policy: MANAGED_PROCESSING_FEE_POLICY, fee_rounding: MANAGED_PROCESSING_FEE_ROUNDING,
          max_per_payment: managedCheckoutMaximumQuantity(15000, settings.processing_fee_rate_basis_points,
            Math.min(settings.flexible_checkout_max_amount_minor, PAYSTACK_MAX_TRANSACTION_MINOR)),
        },
        tiers: [{ tier_key: 'regular', quantity: 1, amount_minor: 15000, currency: 'GHS' }],
      });
    } catch {
      return c.json({ mode: 'unavailable' });
    }
  });

  app.post(`${path}/initialize`, async (c) => {
    const input = managedCheckoutInitializeSchema.safeParse(await c.req.json().catch(() => null));

    if (!input.success) return c.json({ error: 'Review your ticket details and human verification.' }, 400);
    const limited = await enforcePublicRateLimit(c, { action: 'managed-checkout-initialize', clientKey: publicClientKey(c), maxAttempts: 1200, windowSeconds: 300 }, 'Please wait before starting another checkout.');

    if (limited) return limited;

    try {
      const settings = await managedCheckoutSettings(c);
      const environment = managedPaymentEnvironment(c);
      const origin = managedCheckoutOrigin(environment, c.req.header('Origin'))!;

      if (!settings || settings.payment_mode !== input.data.expected_mode || settings.settings_version !== input.data.settings_version) throw new Error('checkout_settings_changed');
      if (!managedCheckoutReadiness(c, settings.payment_mode).ready) throw new Error('checkout_not_ready');
      const challenge = await requirePublicTurnstile(c, { token: input.data.turnstile_token, submittedAction: input.data.turnstile_action, expectedAction: 'devcon26_checkout', expectedHostname: new URL(origin).hostname });

      if (challenge) return challenge;
      const buyerLimit = await enforcePublicRateLimit(c, { action: 'managed-checkout-buyer', clientKey: input.data.purchaser_email, maxAttempts: 10, windowSeconds: 300 }, 'Please wait before starting another checkout.');

      if (buyerLimit) return buyerLimit;
      const allocations = devcon26CartAllocationsForStorage(input.data.cart, { name: input.data.purchaser_name, email: input.data.purchaser_email });
      const recipients = new Set([input.data.purchaser_email, ...allocations.flatMap((allocation) => allocation.recipient_email ? [allocation.recipient_email] : [])]);

      if (settings.payment_mode === 'test') {
        const testing = await registrationTesting(c, settings.edition_id);

        if ([...recipients].some((email) => !testing.tester_emails.includes(email))) throw new Error('tester_not_allowed');

        for (const limit of [
          { action: 'managed-checkout-ip-day', clientKey: publicClientKey(c), maxAttempts: 100 },
          { action: 'managed-checkout-shared-day', clientKey: 'all', maxAttempts: 500 },
        ]) {
          const budget = await enforcePublicRateLimit(c, { ...limit, windowSeconds: 86400 }, 'The testing checkout limit has been reached. Please try again later.');

          if (budget) return budget;
        }
      }

      for (const email of recipients) {
        const assessment = await assessPublicSubmissionEmail(c, email);

        if (assessment.status !== 'deliverable') return c.json({ error: assessment.status === 'invalid' ? assessment.message : 'Email verification is temporarily unavailable.' }, assessment.status === 'invalid' ? 400 : 503);
        const recipientLimit = await enforcePublicRateLimit(c, { action: 'managed-checkout-recipient-day', clientKey: email, maxAttempts: settings.payment_mode === 'test' ? 50 : 20, windowSeconds: 86400 }, 'Please wait before starting another checkout.');

        if (recipientLimit) return recipientLimit;
      }

      const order = holdSchema.parse(await managedCheckoutRpc(c, 'create_managed_conference_checkout_hold', {
        p_edition_id: settings.edition_id, p_purchaser_name: input.data.purchaser_name,
        p_purchaser_email: input.data.purchaser_email, p_quantity: input.data.cart.quantity,
        p_allocations: allocations, p_checkout_request_key: input.data.checkout_request_key,
        p_expected_mode: input.data.expected_mode, p_settings_version: input.data.settings_version, p_origin: origin,
      }));

      const quote = managedCheckoutProcessingFeeQuote(input.data.cart.quantity * 15000, settings.processing_fee_rate_basis_points);

      if (order.payment_mode !== settings.payment_mode || order.amount_minor !== quote.ticket_amount_minor
        || order.quoted_processing_fee_minor !== quote.processing_fee_minor || order.quoted_gross_amount_minor !== quote.amount_minor
        || order.quoted_gross_amount_minor > PAYSTACK_MAX_TRANSACTION_MINOR) throw new Error('checkout_amount_invalid');
      const reference = managedPaymentReference(order.id, order.payment_mode);
      const claim = crypto.randomUUID();
      const initialized = initializationSchema.parse(await managedCheckoutRpc(c, 'claim_managed_conference_checkout_initialization', {
        p_order_id: order.id, p_reference: reference, p_claim_token: claim,
      }));
      const secretKey = managedPaymentSecret(environment, order.payment_mode)!;
      let authorizationUrl = initialized.authorization_url;

      if (!authorizationUrl) {
        if (initialized.initialization_claim !== claim) throw new Error('checkout_initialization_in_progress');
        const checkout = await createPaystackHostedCheckout({
          secretKey, orderId: order.id, purchaserEmail: input.data.purchaser_email, amountMinor: order.quoted_gross_amount_minor,
          callbackUrl: `${origin}/devcon26/payment-confirmation/`, paymentReference: reference,
        }).catch(async (error) => {
          await managedCheckoutRpc(c, 'record_managed_initialization_failure', {
            p_order: order.id, p_claim: claim,
            p_rejected: error instanceof PaystackInitializationError && error.definitelyRejected,
          });

          throw error;
        });
        const saved = initializationSchema.parse(await managedCheckoutRpc(c, 'finalize_managed_conference_checkout_initialization', {
          p_order_id: order.id, p_claim_token: claim, p_authorization_url: checkout.authorizationUrl,
        }));

        authorizationUrl = saved.authorization_url;
      }

      if (!authorizationUrl || !isPaystackCheckoutUrl(authorizationUrl)) throw new Error('checkout_destination_invalid');
      const verifier = crypto.randomBytes(32).toString('base64url');

      return c.json({ mode: order.payment_mode, reference, expires_at: order.expires_at, authorization_url: authorizationUrl,
        checkout_grant: createDevcon26FlexibleCheckoutGrant({ orderId: order.id, verifier, origin, secretKey }),
        checkout_verifier: verifier, quantity: input.data.cart.quantity, ticket_amount_minor: order.amount_minor,
        processing_fee_minor: order.quoted_processing_fee_minor, amount_minor: order.quoted_gross_amount_minor, currency: order.currency });
    } catch (error) {
      return managedCheckoutFailure(c, error);
    }
  });

  // Verification follows immutable order provenance, not the current sales mode.
  app.post(`${path}/verify`, async (c) => {
    const input = managedCheckoutVerifySchema.safeParse(await c.req.json().catch(() => null));

    if (!input.success) return c.json({ error: 'Invalid checkout.' }, 400);
    const limited = await enforcePublicRateLimit(c, { action: 'managed-checkout-verify', clientKey: publicClientKey(c), maxAttempts: 1200, windowSeconds: 300 }, 'Please wait before checking this payment again.');

    if (limited) return limited;

    try {
      const order = await managedCheckoutOrder(c, input.data.reference);
      const environment = managedPaymentEnvironment(c);
      const origin = managedCheckoutOrigin(environment, c.req.header('Origin'))!;
      const secretKey = order && managedPaymentSecret(environment, order.payment_mode);
      const claims = secretKey && verifyDevcon26FlexibleCheckoutGrant({ grant: input.data.checkout_grant, verifier: input.data.checkout_verifier, origin, secretKey });

      if (!order || !secretKey || !claims || claims.order_id !== order.id
        || managedPaymentReference(order.id, order.payment_mode) !== input.data.reference
        || (order.payment_mode === 'test' && order.checkout_origin !== origin)) return c.json({ error: 'Invalid checkout.' }, 404);
      const orderLimit = await enforcePublicRateLimit(c, { action: 'managed-checkout-order-verify', clientKey: order.id, maxAttempts: 20, windowSeconds: 300 }, 'Please wait before checking this payment again.');

      if (orderLimit) return orderLimit;
      const confirmation = await confirmManagedCheckout(c, order, input.data.reference);

      if (confirmation.status !== 'verified') return c.json({ mode: order.payment_mode, ...confirmation });
      await dispatchManagedConferenceEmails(c);
      const summary = await getSupabaseAnnualConferencePaidOrderSummary(order.id, c);

      if (!summary || summary.status !== 'paid') throw new Error('Payment summary unavailable.');
      const allocation = await getSupabaseAdminClient(c).from('annual_conference_flexible_ticket_allocations' as never)
        .select('seat_index').eq('order_id', order.id).eq('allocation_kind', 'self').maybeSingle() as unknown as { data: { seat_index: number } | null; error: unknown };

      if (allocation.error) throw new Error('Buyer badge unavailable.');
      const seat = allocation.data?.seat_index;
      const card = seat ? await getSupabaseAnnualConferenceSocialCardByOrderSeat(order.id, seat, c) : null;
      const badge = card && Boolean(card.is_test) === (order.payment_mode === 'test') && seat
        ? { card_quantity: 1, can_return_later: true, buyer_grant: createAnnualConferenceSocialCardBuyerGrant({ orderId: order.id, verifier: input.data.checkout_verifier, origin, secretKey, seatNumbers: [seat] }) }
        : { card_quantity: 0 };

      return c.json({ ...summary, ...badge, mode: order.payment_mode, status: 'verified' });
    } catch (error) {
      return managedCheckoutFailure(c, error);
    }
  });

  async function processWebhook(c: Context<AppBindings>) {
    const body = await c.req.text();
    const environment = managedPaymentEnvironment(c);
    const signature = c.req.header('x-paystack-signature') ?? null;
    const signedModes = (['test', 'live'] as const).filter((mode) => {
      const key = managedPaymentSecret(environment, mode);

      return key && verifyPaystackWebhookSignature(body, signature, key);
    });

    if (!signedModes.length) return c.json({ error: 'Invalid signature.' }, 401);
    const event = parseVerifiedPaystackCharge(body);

    if (!event || !/^devcon26-managed-(test|live)-[a-f0-9]{32}$/.test(event.paymentReference)) return c.body(null, 204);

    try {
      const order = await managedCheckoutOrder(c, event.paymentReference);

      if (!order) return c.body(null, 204);
      if (!signedModes.includes(order.payment_mode) || managedPaymentReference(order.id, order.payment_mode) !== event.paymentReference) return c.json({ error: 'Invalid payment domain.' }, 401);
      await confirmManagedCheckout(c, order, event.paymentReference);
      await dispatchManagedConferenceEmails(c);

      return c.body(null, 204);
    } catch {
      return c.json({ error: 'Payment confirmation is temporarily unavailable.' }, 503);
    }
  }

  app.post(MANAGED_PAYMENT_WEBHOOK_PATH, processWebhook);

  // Existing Paystack dashboards can keep their webhook URL during rollout.
  for (const historicalPath of ['/api/webhooks/paystack', '/api/webhooks/paystack/devcon26-complete-test', '/api/webhooks/paystack/devcon26-test']) {
    app.post(historicalPath, async (c, next) => {
      const event = parseVerifiedPaystackCharge(await c.req.text());

      if (event && /^devcon26-managed-(test|live)-[a-f0-9]{32}$/.test(event.paymentReference)) return processWebhook(c);

      await next();
    });
  }
}
