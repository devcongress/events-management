import type { Context, Hono } from 'hono';
import crypto from 'node:crypto';
import { z } from 'zod';
import {
  checkInSupabaseAnnualConferenceBearerTicket,
  confirmSupabaseAnnualConferenceTicketPayment,
  createSupabaseAnnualConferenceSponsorAllocation,
  getSupabaseAnnualConferenceTicketEmailDeliverySummary,
  getSupabaseAnnualConferencePublicTicketPrices,
  getSupabaseAnnualConferenceTicketing,
  getSupabaseAnnualConferenceTicketPaymentAttempt,
  hasSupabaseAnnualConferenceTicketRefund,
  getSupabaseAnnualConferencePaidOrderSummary,
  createSupabaseAnnualConferenceCheckoutHold,
  prepareSupabaseAnnualConferenceTicketPaymentAttempt,
  listSupabaseAnnualConferenceTicketEmailDeliveries,
  listSupabaseAnnualConferenceTicketOrders,
  listSupabaseAnnualConferenceSponsorAllocations,
  retrySupabaseAnnualConferenceTicketEmailDelivery,
  updateSupabaseAnnualConferenceTicketingCapacity,
  updateSupabaseAnnualConferenceTicketPrices,
} from '@/lib/supabase/annual-conference-ticketing';
import { parseGhsAmountToMinor, validateAnnualConferenceTicketPrices } from '@/lib/annual-conference-ticketing';
import { createAnnualConferenceSocialCardBuyerGrant, verifyAnnualConferenceSocialCardBuyerGrant } from '@/lib/annual-conference-social-card-buyer-grant';
import { DEVCON26_PUBLIC_CHECKOUT_PATH, devcon26PublicCheckoutConfiguration, devcon26PublicCheckoutInitializeSchema, devcon26PublicCheckoutOriginConfiguration, devcon26PublicCheckoutVerifySchema } from '@/lib/devcon26-public-checkout';
import {
  annualConferencePaymentConfiguration,
  createPaystackHostedCheckout,
  parseVerifiedPaystackCharge,
  paystackReferenceForTicketOrder,
  inspectPaystackLiveTransaction,
  verifyPaystackTransaction,
  verifyPaystackWebhookSignature,
} from '@/lib/annual-conference-ticket-payments';
import { getAdminSession, requireAdmin } from '@/lib/supabase/admin-auth';
import { requireAnnualConferenceCapability } from '@/server/annual-conference-request';
import { envValue } from '@/server/env';
import type { AppBindings } from '@/server/http/app-bindings';
import { recordProtectedMutationAudit } from '@/server/protected-mutation';
import { registerDevcon26TestCouponRoutes } from '@/server/routes/devcon26-test-coupons';
import { enforcePublicRateLimit, publicClientKey } from '@/server/http/public-intake-protection';
import { annualConferenceSocialCardEmailConfigurationForRequest } from '@/server/annual-conference-social-card-email-delivery';

const yearSchema = z.string().regex(/^\d{4}$/, 'Conference year must use four digits.');
const capacitySchema = z.object({
  public_capacity: z.coerce.number().int().min(1).max(5_000),
}).strict();
const sponsorAllocationSchema = z.object({
  sponsor_name: z.string().trim().min(1).max(160),
  contact_name: z.string().trim().min(1).max(160),
  contact_email: z.string().trim().email().max(254),
  quantity: z.coerce.number().int().min(1).max(500),
}).strict();
const ticketPricesSchema = z.object({
  regular: z.string().trim().min(1).max(10),
  team_3: z.string().trim().min(1).max(10),
  team_5: z.string().trim().min(1).max(10),
}).strict().transform((prices, context) => {
  const parsed = {
    regular: parseGhsAmountToMinor(prices.regular),
    team_3: parseGhsAmountToMinor(prices.team_3),
    team_5: parseGhsAmountToMinor(prices.team_5),
  };

  for (const [key, value] of Object.entries(parsed)) {
    if (value === null) context.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: 'Use a GHS amount with up to two decimal places.' });
  }

  if (Object.values(parsed).some((value) => value === null)) return z.NEVER;

  const validationError = validateAnnualConferenceTicketPrices(parsed as { regular: number; team_3: number; team_5: number });

  if (validationError) context.addIssue({ code: z.ZodIssueCode.custom, message: validationError });

  return parsed as { regular: number; team_3: number; team_5: number };
});
const emailDeliveryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(['queued', 'sending', 'accepted', 'delivered', 'failed']).optional(),
}).strict();
const emailDeliveryIdSchema = z.string().uuid('Email delivery id is invalid.');
const ticketOrderQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  page_size: z.coerce.number().int().min(1).max(25).default(5),
}).strict();
const ticketCheckInSchema = z.object({
  qr_token: z.string().regex(/^[0-9a-f]{64}$/, 'Ticket code is invalid.'),
}).strict();

function ticketingUnavailable(c: Context<AppBindings>) {
  return c.json({ error: 'Ticketing storage is not configured for this environment.' }, 503);
}

async function requireTicketingManagement(c: Context<AppBindings>, year: number) {
  const sessionError = await requireAdmin(c, ['owner', 'organizer', 'volunteer']);

  if (sessionError) return sessionError;

  return requireAnnualConferenceCapability(c, year, 'ticketing.manage');
}

function ticketPaymentEnvironment(c: Context<AppBindings>): Record<string, string | undefined> {
  return {
    DEVCON26_PAYMENT_PROVIDER: envValue('DEVCON26_PAYMENT_PROVIDER', c),
    DEVCON26_PAYMENTS_ENABLED: envValue('DEVCON26_PAYMENTS_ENABLED', c),
    DEVCON26_PAYSTACK_FEE_MODE: envValue('DEVCON26_PAYSTACK_FEE_MODE', c),
    PAYSTACK_SECRET_KEY: envValue('PAYSTACK_SECRET_KEY', c),
  };
}

export function registerAnnualConferenceTicketingRoutes(app: Hono<AppBindings>): void {
  registerDevcon26TestCouponRoutes(app);

  const publicCheckoutEnvironment = (c: Context<AppBindings>) => Object.fromEntries([
    'DEVCON26_PUBLIC_CHECKOUT_ENABLED', 'DEVCON26_PUBLIC_CHECKOUT_ORIGINS', 'DEVCON26_PAYMENT_PROVIDER',
    'DEVCON26_PAYMENTS_ENABLED', 'DEVCON26_PAYSTACK_FEE_MODE', 'PAYSTACK_SECRET_KEY', 'PUBLIC_WEBSITE_ORIGIN', 'NODE_ENV',
  ].map((key) => [key, envValue(key, c)]));

  for (const operation of ['initialize', 'verify']) {
    app.use(`${DEVCON26_PUBLIC_CHECKOUT_PATH}/${operation}`, async (c, next) => {
      const configuration = devcon26PublicCheckoutConfiguration(publicCheckoutEnvironment(c));

      if (!configuration || !devcon26PublicCheckoutOriginConfiguration(configuration, c.req.header('Origin'))) {
        return c.json({ error: 'Public ticket checkout is not available.' }, 503);
      }
      if (c.req.header('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
        return c.json({ error: 'Use a JSON checkout request.' }, 415);
      }

      await next();
    });
  }

  app.get(DEVCON26_PUBLIC_CHECKOUT_PATH, async (c) => {
    const rawConfiguration = devcon26PublicCheckoutConfiguration(publicCheckoutEnvironment(c));
    const configuration = rawConfiguration && devcon26PublicCheckoutOriginConfiguration(rawConfiguration, c.req.header('Origin'));

    if (!configuration || !annualConferencePaymentConfiguration(publicCheckoutEnvironment(c)).enabled) return c.json({ mode: 'unavailable' });

    try {
      const ticketing = await getSupabaseAnnualConferenceTicketing(2026, c);

      if (!ticketing || ticketing.settings.ticket_sales_status !== 'open') return c.json({ mode: 'unavailable' });

      return c.json({
        mode: 'live', accepts_coupon: false, currency: ticketing.settings.currency,
        tiers: ticketing.settings.ticket_tiers.map((tier) => ({ tier_key: tier.key, quantity: tier.quantity, amount_minor: tier.price_minor, currency: ticketing.settings.currency })),
      });
    } catch {
      return c.json({ mode: 'unavailable' });
    }
  });

  app.post(`${DEVCON26_PUBLIC_CHECKOUT_PATH}/quote`, async (c) => {
    const rawConfiguration = devcon26PublicCheckoutConfiguration(publicCheckoutEnvironment(c));
    const configuration = rawConfiguration && devcon26PublicCheckoutOriginConfiguration(rawConfiguration, c.req.header('Origin'));
    const input = z.object({ tier_key: z.enum(['regular', 'team_3', 'team_5']) }).strict().safeParse(await c.req.json().catch(() => null));

    if (!configuration || !input.success || !annualConferencePaymentConfiguration(publicCheckoutEnvironment(c)).enabled) {
      return c.json({ error: 'Ticket quote is not available.' }, 503);
    }

    try {
      const prices = await getSupabaseAnnualConferencePublicTicketPrices(2026, c);
      const tier = prices?.tiers.find((item) => item.tier_key === input.data.tier_key);

      if (!prices || !tier) return c.json({ error: 'Ticket quote is not available.' }, 503);

      return c.json({
        mode: 'live', tier_key: tier.tier_key, quantity: tier.quantity, currency: prices.currency,
        base_amount_minor: tier.amount_minor, discount_amount_minor: 0, final_amount_minor: tier.amount_minor, coupon_applied: null,
      });
    } catch {
      return c.json({ error: 'Ticket quote is not available.' }, 503);
    }
  });

  app.post(`${DEVCON26_PUBLIC_CHECKOUT_PATH}/initialize`, async (c) => {
    const environment = publicCheckoutEnvironment(c);
    const rawConfiguration = devcon26PublicCheckoutConfiguration(environment);
    const configuration = rawConfiguration && devcon26PublicCheckoutOriginConfiguration(rawConfiguration, c.req.header('Origin'));
    const input = devcon26PublicCheckoutInitializeSchema.safeParse(await c.req.json().catch(() => null));

    if (!configuration || !annualConferencePaymentConfiguration(environment).enabled || !input.success) {
      return c.json({ error: 'Choose a valid ticket.' }, 400);
    }
    const limited = await enforcePublicRateLimit(c, {
      action: 'devcon26-public-checkout-initialize', clientKey: publicClientKey(c), maxAttempts: 5, windowSeconds: 300,
    }, 'Please wait before starting another checkout.');

    if (limited) return limited;

    try {
      const ticketing = await getSupabaseAnnualConferenceTicketing(2026, c);

      if (!ticketing || ticketing.settings.ticket_sales_status !== 'open') return c.json({ error: 'Ticket sales are not open.' }, 409);
      const order = await createSupabaseAnnualConferenceCheckoutHold({
        editionId: ticketing.settings.edition_id,
        purchaserName: input.data.purchaser_name,
        purchaserEmail: input.data.purchaser_email,
        tierKey: input.data.tier_key,
        checkoutRequestKey: input.data.checkout_request_key,
      }, c) as Record<string, unknown> | null;

      if (!order?.id || !Number.isSafeInteger(order.amount_minor) || Number(order.amount_minor) <= 0) return ticketingUnavailable(c);

      const reference = paystackReferenceForTicketOrder(String(order.id));

      await prepareSupabaseAnnualConferenceTicketPaymentAttempt(String(order.id), reference, c);
      const checkout = await createPaystackHostedCheckout({
        secretKey: configuration.secretKey,
        orderId: String(order.id),
        purchaserEmail: input.data.purchaser_email,
        amountMinor: Number(order.amount_minor),
        callbackUrl: configuration.callbackUrl,
        paymentReference: reference,
      });
      const verifier = crypto.randomBytes(32).toString('base64url');
      const buyerGrant = createAnnualConferenceSocialCardBuyerGrant({
        orderId: String(order.id), verifier, origin: configuration.websiteOrigin, secretKey: configuration.secretKey,
      });

      return c.json({
        mode: 'live', authorization_url: checkout.authorizationUrl, reference: checkout.paymentReference,
        buyer_grant: buyerGrant, buyer_verifier: verifier, tier_key: order.tier_key,
        quantity: order.quantity, amount_minor: order.amount_minor, currency: order.currency,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';

      if (message.includes('ticketing_capacity_exhausted')) return c.json({ error: 'This ticket is no longer available.' }, 409);
      if (message.includes('ticket_checkout_not_payable')) {
        return c.json({ error: 'This checkout has expired.', checkout_error: 'finished' }, 409);
      }

      return c.json({ error: 'We could not prepare this checkout.' }, 503);
    }
  });

  app.post(`${DEVCON26_PUBLIC_CHECKOUT_PATH}/verify`, async (c) => {
    const environment = publicCheckoutEnvironment(c);
    const rawConfiguration = devcon26PublicCheckoutConfiguration(environment);
    const configuration = rawConfiguration && devcon26PublicCheckoutOriginConfiguration(rawConfiguration, c.req.header('Origin'));
    const input = devcon26PublicCheckoutVerifySchema.safeParse(await c.req.json().catch(() => null));

    if (!configuration || !annualConferencePaymentConfiguration(environment).enabled || !input.success) {
      return c.json({ error: 'Checkout could not be verified.' }, 400);
    }
    const limited = await enforcePublicRateLimit(c, {
      action: 'devcon26-public-checkout-verify', clientKey: publicClientKey(c), maxAttempts: 12, windowSeconds: 300,
    }, 'Please wait before checking this payment again.');

    if (limited) return limited;

    const claims = verifyAnnualConferenceSocialCardBuyerGrant({
      grant: input.data.buyer_grant,
      verifier: input.data.buyer_verifier,
      origin: configuration.websiteOrigin,
      secretKey: configuration.secretKey,
    });
    const attempt = await getSupabaseAnnualConferenceTicketPaymentAttempt(input.data.reference, c);

    if (!claims || !attempt || attempt.order_id !== claims.order_id || attempt.provider !== 'paystack') {
      return c.json({ error: 'Checkout could not be verified.' }, 404);
    }

    try {
      const providerResult = await inspectPaystackLiveTransaction({ secretKey: configuration.secretKey, paymentReference: attempt.payment_reference });

      if (providerResult.status !== 'success') {
        return c.json({ mode: 'live', status: providerResult.status });
      }

      const charge = providerResult.charge;
      const order = await confirmSupabaseAnnualConferenceTicketPayment({
        orderId: attempt.order_id,
        provider: charge.provider,
        providerEventId: charge.providerEventId,
        eventType: charge.eventType,
        paymentReference: charge.paymentReference,
        amountMinor: charge.amountMinor,
        currency: charge.currency,
        payloadSha256: crypto.createHash('sha256').update(JSON.stringify(charge.facts)).digest('hex'),
        paymentFacts: { ...charge.facts, fee_mode: annualConferencePaymentConfiguration(publicCheckoutEnvironment(c)).feeMode },
      }, c);

      if (!order) return ticketingUnavailable(c);
      if (order.status === 'expired' && await hasSupabaseAnnualConferenceTicketRefund(attempt.order_id, c)) {
        return c.json({ mode: 'live', status: 'refund_required', reference: attempt.payment_reference });
      }
      if (order.status !== 'paid') return c.json({ mode: 'live', status: order.status === 'pending_payment' ? 'pending' : 'failed' });

      const summary = await getSupabaseAnnualConferencePaidOrderSummary(attempt.order_id, c);

      if (!summary || summary.status !== 'paid' || summary.currency !== 'GHS'
        || !Number.isSafeInteger(summary.ticket_amount_minor) || !Number.isSafeInteger(summary.amount_paid_minor)) {
        return ticketingUnavailable(c);
      }

      return c.json({
        mode: 'live', status: 'verified', buyer_grant: input.data.buyer_grant,
        tier_key: summary.tier_key, quantity: summary.quantity, currency: summary.currency,
        ticket_amount_minor: summary.ticket_amount_minor, amount_paid_minor: summary.amount_paid_minor,
        can_return_later: annualConferenceSocialCardEmailConfigurationForRequest(c).enabled,
      });
    } catch {
      return c.json({ error: 'Payment is not confirmed yet. Check again shortly.' }, 503);
    }
  });

  app.get('/api/public/annual-conference/2026/ticket-prices', async (c) => {
    c.header('Cache-Control', 'no-store');

    try {
      const prices = await getSupabaseAnnualConferencePublicTicketPrices(2026, c);

      if (!prices) return c.json({ error: 'Ticket prices are temporarily unavailable.' }, 503);

      return c.json(prices);
    } catch {
      return c.json({ error: 'Ticket prices are temporarily unavailable.' }, 503);
    }
  });

  app.post('/api/webhooks/paystack', async (c) => {
    const configuration = annualConferencePaymentConfiguration(ticketPaymentEnvironment(c));

    // Keep the payment surface absent until a merchant has deliberately enabled it.
    if (!configuration.enabled || configuration.provider !== 'paystack' || !configuration.secretKey) return c.json({ error: 'Not found.' }, 404);

    const rawBody = await c.req.text();
    const signature = c.req.header('x-paystack-signature') ?? null;

    if (!verifyPaystackWebhookSignature(rawBody, signature, configuration.secretKey)) {
      return c.json({ error: 'Invalid webhook signature.' }, 401);
    }

    const webhook = parseVerifiedPaystackCharge(rawBody);

    if (!webhook) return c.body(null, 204);

    try {
      const attempt = await getSupabaseAnnualConferenceTicketPaymentAttempt(webhook.paymentReference, c);

      // Provider metadata is caller-controlled. Only a server-created payment
      // attempt may identify an order, then Paystack's verify endpoint supplies
      // the amount and currency we pass to the atomic confirmation command.
      if (attempt === null) return ticketingUnavailable(c);
      if (!attempt || attempt.provider !== 'paystack') return c.body(null, 204);
      const charge = await verifyPaystackTransaction({
        secretKey: configuration.secretKey,
        paymentReference: attempt.payment_reference,
      });

      const order = await confirmSupabaseAnnualConferenceTicketPayment({
        orderId: attempt.order_id,
        provider: charge.provider,
        providerEventId: charge.providerEventId,
        eventType: charge.eventType,
        paymentReference: charge.paymentReference,
        amountMinor: charge.amountMinor,
        currency: charge.currency,
        payloadSha256: crypto.createHash('sha256').update(rawBody).digest('hex'),
        paymentFacts: {
          ...charge.facts,
          fee_mode: configuration.feeMode,
        },
      }, c);

      if (order === null) return ticketingUnavailable(c);

      return c.body(null, 204);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';

      if (message.includes('ticket_payment_amount_mismatch') || message.includes('ticket_checkout_not_payable') || message.includes('ticket_order_not_found')) {
        return c.body(null, 204);
      }

      return c.json({ error: 'Unable to process payment confirmation.' }, 500);
    }
  });

  app.get('/api/annual-conference/:year/ticketing', async (c) => {
    const year = yearSchema.safeParse(c.req.param('year'));

    if (!year.success) return c.json({ error: year.error.issues[0]?.message }, 400);
    const accessError = await requireTicketingManagement(c, Number(year.data));

    if (accessError) return accessError;

    try {
      const ticketing = await getSupabaseAnnualConferenceTicketing(Number(year.data), c);

      if (ticketing === null) return ticketingUnavailable(c);
      if (!ticketing) return c.json({ error: `Annual conference ${year.data} was not found.` }, 404);

      return c.json(ticketing);
    } catch {
      return c.json({ error: 'Unable to load conference ticketing.' }, 500);
    }
  });

  app.get('/api/annual-conference/:year/ticketing/orders', async (c) => {
    const year = yearSchema.safeParse(c.req.param('year'));
    const query = ticketOrderQuerySchema.safeParse(c.req.query());

    if (!year.success) return c.json({ error: year.error.issues[0]?.message }, 400);
    if (!query.success) return c.json({ error: query.error.issues[0]?.message ?? 'Ticket order filters are invalid.' }, 400);
    const accessError = await requireTicketingManagement(c, Number(year.data));

    if (accessError) return accessError;

    try {
      const ticketing = await getSupabaseAnnualConferenceTicketing(Number(year.data), c);

      if (ticketing === null) return ticketingUnavailable(c);
      if (!ticketing) return c.json({ error: `Annual conference ${year.data} was not found.` }, 404);

      const result = await listSupabaseAnnualConferenceTicketOrders({
        editionId: ticketing.settings.edition_id,
        page: query.data.page,
        pageSize: query.data.page_size,
      }, c);

      if (result === null) return ticketingUnavailable(c);

      return c.json({
        ...result,
        page: query.data.page,
        page_size: query.data.page_size,
      });
    } catch {
      return c.json({ error: 'Unable to load ticket orders.' }, 500);
    }
  });

  app.post('/api/annual-conference/:year/ticketing/check-in', async (c) => {
    const year = yearSchema.safeParse(c.req.param('year'));
    const body = ticketCheckInSchema.safeParse(await c.req.json().catch(() => null));

    if (!year.success) return c.json({ error: year.error.issues[0]?.message }, 400);
    if (!body.success) return c.json({ error: body.error.issues[0]?.message ?? 'Ticket code is invalid.' }, 400);
    const accessError = await requireTicketingManagement(c, Number(year.data));

    if (accessError) return accessError;

    try {
      const ticketing = await getSupabaseAnnualConferenceTicketing(Number(year.data), c);

      if (ticketing === null) return ticketingUnavailable(c);
      if (!ticketing) return c.json({ error: `Annual conference ${year.data} was not found.` }, 404);
      const session = c.get('adminSession') ?? await getAdminSession(c);

      if (!session.authenticated || !session.email) return c.json({ error: 'Conference ticketing access required.' }, 403);
      const result = await checkInSupabaseAnnualConferenceBearerTicket({
        editionId: ticketing.settings.edition_id,
        qrToken: body.data.qr_token,
        checkedInByEmail: session.email,
      }, c);

      if (result === null) return ticketingUnavailable(c);

      if (result.outcome === 'checked_in') {
        await recordProtectedMutationAudit(c, {
          action: 'annual_conference.ticketing.ticket_check_in',
          targetType: 'annual_conference_ticket',
          targetId: result.ticket_id ?? 'unknown',
          metadata: { edition_year: Number(year.data), order_id: result.order_id, order_seat_number: result.order_seat_number },
        });
      }

      return c.json(result);
    } catch {
      return c.json({ error: 'Unable to check in this ticket.' }, 500);
    }
  });

  app.patch('/api/annual-conference/:year/ticketing/capacity', async (c) => {
    const year = yearSchema.safeParse(c.req.param('year'));
    const body = capacitySchema.safeParse(await c.req.json().catch(() => null));

    if (!year.success) return c.json({ error: year.error.issues[0]?.message }, 400);
    if (!body.success) return c.json({ error: body.error.issues[0]?.message ?? 'Enter a valid capacity.' }, 400);
    const accessError = await requireTicketingManagement(c, Number(year.data));

    if (accessError) return accessError;

    try {
      const ticketing = await getSupabaseAnnualConferenceTicketing(Number(year.data), c);

      if (ticketing === null) return ticketingUnavailable(c);
      if (!ticketing) return c.json({ error: `Annual conference ${year.data} was not found.` }, 404);
      const session = c.get('adminSession') ?? await getAdminSession(c);

      if (!session.authenticated || !session.email) return c.json({ error: 'Conference ticketing access required.' }, 403);
      let settings: { public_capacity: number; updated_at: string } | null;

      try {
        settings = await updateSupabaseAnnualConferenceTicketingCapacity(
          ticketing.settings.edition_id,
          body.data.public_capacity,
          session.email,
          c,
        );
      } catch (error) {
        if (error instanceof Error && error.message.includes('ticketing_capacity_below_reservations')) {
          return c.json({ error: 'Capacity cannot be lower than issued, held, or sponsor-reserved seats.' }, 409);
        }

        throw error;
      }

      if (!settings) return ticketingUnavailable(c);
      await recordProtectedMutationAudit(c, {
        action: 'annual_conference.ticketing.capacity_update',
        targetType: 'annual_conference_ticketing_settings',
        targetId: ticketing.settings.edition_id,
        metadata: { edition_year: Number(year.data), previous_capacity: ticketing.settings.public_capacity, next_capacity: body.data.public_capacity },
      });

      return c.json({ settings: { ...ticketing.settings, public_capacity: settings.public_capacity, updated_at: settings.updated_at } });
    } catch {
      return c.json({ error: 'Unable to update ticketing capacity.' }, 500);
    }
  });

  app.patch('/api/annual-conference/:year/ticketing/prices', async (c) => {
    const year = yearSchema.safeParse(c.req.param('year'));
    const body = ticketPricesSchema.safeParse(await c.req.json().catch(() => null));

    if (!year.success) return c.json({ error: year.error.issues[0]?.message }, 400);
    if (!body.success) return c.json({ error: body.error.issues[0]?.message ?? 'Enter valid ticket prices.' }, 400);
    const accessError = await requireTicketingManagement(c, Number(year.data));

    if (accessError) return accessError;

    try {
      const ticketing = await getSupabaseAnnualConferenceTicketing(Number(year.data), c);

      if (ticketing === null) return ticketingUnavailable(c);
      if (!ticketing) return c.json({ error: `Annual conference ${year.data} was not found.` }, 404);
      const session = c.get('adminSession') ?? await getAdminSession(c);

      if (!session.authenticated || !session.email) return c.json({ error: 'Conference ticketing access required.' }, 403);

      let settings: { regular_price_minor: number; team_3_price_minor: number; team_5_price_minor: number; updated_at: string } | null;

      try {
        settings = await updateSupabaseAnnualConferenceTicketPrices(ticketing.settings.edition_id, body.data, session.email, c);
      } catch (error) {
        if (error instanceof Error && error.message.includes('ticket_prices_locked')) {
          return c.json({ error: 'Prices are locked once ticket sales begin or an order exists.' }, 409);
        }

        if (error instanceof Error && error.message.includes('ticket_prices_invalid')) {
          return c.json({ error: 'Enter valid ticket prices.' }, 400);
        }

        throw error;
      }

      if (!settings) return ticketingUnavailable(c);
      await recordProtectedMutationAudit(c, {
        action: 'annual_conference.ticketing.prices_update',
        targetType: 'annual_conference_ticketing_settings',
        targetId: ticketing.settings.edition_id,
        metadata: {
          edition_year: Number(year.data),
          previous_prices_minor: Object.fromEntries(ticketing.settings.ticket_tiers.map((tier) => [tier.key, tier.price_minor])),
          next_prices_minor: body.data,
        },
      });

      return c.json({
        settings: {
          ...ticketing.settings,
          ticket_tiers: ticketing.settings.ticket_tiers.map((tier) => ({
            ...tier,
            price_minor: tier.key === 'regular'
              ? settings.regular_price_minor
              : tier.key === 'team_3'
                ? settings.team_3_price_minor
                : settings.team_5_price_minor,
          })),
          updated_at: settings.updated_at,
        },
      });
    } catch {
      return c.json({ error: 'Unable to update ticket prices.' }, 500);
    }
  });

  app.get('/api/annual-conference/:year/ticketing/sponsor-allocations', async (c) => {
    const year = yearSchema.safeParse(c.req.param('year'));

    if (!year.success) return c.json({ error: year.error.issues[0]?.message }, 400);
    const accessError = await requireTicketingManagement(c, Number(year.data));

    if (accessError) return accessError;
    try {
      const ticketing = await getSupabaseAnnualConferenceTicketing(Number(year.data), c);

      if (ticketing === null) return ticketingUnavailable(c);
      if (!ticketing) return c.json({ error: `Annual conference ${year.data} was not found.` }, 404);
      const allocations = await listSupabaseAnnualConferenceSponsorAllocations(ticketing.settings.edition_id, c);

      if (allocations === null) return ticketingUnavailable(c);

      return c.json({ allocations });
    } catch {
      return c.json({ error: 'Unable to load sponsor allocations.' }, 500);
    }
  });

  app.get('/api/annual-conference/:year/ticketing/email-deliveries', async (c) => {
    const year = yearSchema.safeParse(c.req.param('year'));
    const query = emailDeliveryQuerySchema.safeParse(c.req.query());

    if (!year.success) return c.json({ error: year.error.issues[0]?.message }, 400);
    if (!query.success) return c.json({ error: query.error.issues[0]?.message ?? 'Email delivery filters are invalid.' }, 400);
    const accessError = await requireTicketingManagement(c, Number(year.data));

    if (accessError) return accessError;

    try {
      const ticketing = await getSupabaseAnnualConferenceTicketing(Number(year.data), c);

      if (ticketing === null) return ticketingUnavailable(c);
      if (!ticketing) return c.json({ error: `Annual conference ${year.data} was not found.` }, 404);
      const [result, summary] = await Promise.all([
        listSupabaseAnnualConferenceTicketEmailDeliveries({
          editionId: ticketing.settings.edition_id,
          page: query.data.page,
          pageSize: query.data.page_size,
          status: query.data.status,
        }, c),
        getSupabaseAnnualConferenceTicketEmailDeliverySummary(ticketing.settings.edition_id, c),
      ]);

      if (result === null || summary === null) return ticketingUnavailable(c);

      return c.json({
        ...result,
        summary,
        page: query.data.page,
        page_size: query.data.page_size,
      });
    } catch {
      return c.json({ error: 'Unable to load ticket email deliveries.' }, 500);
    }
  });

  app.post('/api/annual-conference/:year/ticketing/email-deliveries/:deliveryId/retry', async (c) => {
    const year = yearSchema.safeParse(c.req.param('year'));
    const deliveryId = emailDeliveryIdSchema.safeParse(c.req.param('deliveryId'));

    if (!year.success) return c.json({ error: year.error.issues[0]?.message }, 400);
    if (!deliveryId.success) return c.json({ error: deliveryId.error.issues[0]?.message }, 400);
    const accessError = await requireTicketingManagement(c, Number(year.data));

    if (accessError) return accessError;

    try {
      const ticketing = await getSupabaseAnnualConferenceTicketing(Number(year.data), c);

      if (ticketing === null) return ticketingUnavailable(c);
      if (!ticketing) return c.json({ error: `Annual conference ${year.data} was not found.` }, 404);
      let delivery;

      try {
        delivery = await retrySupabaseAnnualConferenceTicketEmailDelivery({
          editionId: ticketing.settings.edition_id,
          deliveryId: deliveryId.data,
        }, c);
      } catch (error) {
        const message = error instanceof Error ? error.message : '';

        if (message.includes('ticket_email_not_found')) return c.json({ error: 'Ticket email delivery was not found.' }, 404);
        if (message.includes('ticket_email_retry_limit_reached')) return c.json({ error: 'This email has reached its retry limit and needs manual review.' }, 409);
        if (message.includes('ticket_email_retry_provider_ambiguous')) return c.json({ error: 'This email was accepted by the provider and cannot be blindly resent.' }, 409);
        if (message.includes('ticket_email_retry_claimed')) return c.json({ error: 'This email is already being processed.' }, 409);
        if (message.includes('ticket_email_retry_not_failed')) return c.json({ error: 'Only a failed email can be retried.' }, 409);

        throw error;
      }

      if (delivery === null) return ticketingUnavailable(c);
      await recordProtectedMutationAudit(c, {
        action: 'annual_conference.ticketing.email_delivery_retry',
        targetType: 'annual_conference_ticket_email_outbox',
        targetId: delivery.id,
        metadata: { edition_year: Number(year.data), kind: delivery.kind, attempt_count: delivery.attempt_count },
      });

      return c.json({ delivery });
    } catch {
      return c.json({ error: 'Unable to retry ticket email delivery.' }, 500);
    }
  });

  app.post('/api/annual-conference/:year/ticketing/sponsor-allocations', async (c) => {
    const year = yearSchema.safeParse(c.req.param('year'));
    const body = sponsorAllocationSchema.safeParse(await c.req.json().catch(() => null));

    if (!year.success) return c.json({ error: year.error.issues[0]?.message }, 400);
    if (!body.success) return c.json({ error: body.error.issues[0]?.message ?? 'Check the sponsor allocation.' }, 400);
    const accessError = await requireTicketingManagement(c, Number(year.data));

    if (accessError) return accessError;
    try {
      const ticketing = await getSupabaseAnnualConferenceTicketing(Number(year.data), c);

      if (ticketing === null) return ticketingUnavailable(c);
      if (!ticketing) return c.json({ error: `Annual conference ${year.data} was not found.` }, 404);
      if (body.data.quantity > ticketing.inventory.remaining_public_seats) {
        return c.json({ error: `Only ${ticketing.inventory.remaining_public_seats} seats remain available for sponsor allocation.` }, 409);
      }
      const session = c.get('adminSession') ?? await getAdminSession(c);

      if (!session.authenticated || !session.email) return c.json({ error: 'Conference ticketing access required.' }, 403);
      const allocation = await createSupabaseAnnualConferenceSponsorAllocation({
        editionId: ticketing.settings.edition_id,
        sponsorName: body.data.sponsor_name,
        contactName: body.data.contact_name,
        contactEmail: body.data.contact_email,
        quantity: body.data.quantity,
        actorEmail: session.email,
      }, c);

      if (!allocation) return ticketingUnavailable(c);
      await recordProtectedMutationAudit(c, {
        action: 'annual_conference.ticketing.sponsor_allocation_create',
        targetType: 'annual_conference_sponsor_ticket_allocation',
        targetId: allocation.id,
        metadata: { edition_year: Number(year.data), quantity: allocation.quantity },
      });

      return c.json({ allocation }, 201);
    } catch {
      return c.json({ error: 'Unable to create sponsor allocation.' }, 500);
    }
  });
}
