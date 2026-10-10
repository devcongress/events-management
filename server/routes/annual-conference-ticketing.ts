import type { Context, Hono } from 'hono';
import crypto from 'node:crypto';
import { z } from 'zod';
import {
  confirmSupabaseAnnualConferenceTicketPayment,
  createSupabaseAnnualConferenceSponsorAllocation,
  getSupabaseAnnualConferenceTicketEmailDeliverySummary,
  getSupabaseAnnualConferenceTicketing,
  getSupabaseAnnualConferenceTicketPaymentAttempt,
  listSupabaseAnnualConferenceTicketEmailDeliveries,
  listSupabaseAnnualConferenceSponsorAllocations,
  retrySupabaseAnnualConferenceTicketEmailDelivery,
  updateSupabaseAnnualConferenceTicketingCapacity,
  updateSupabaseAnnualConferenceTicketPrices,
} from '@/lib/supabase/annual-conference-ticketing';
import { parseGhsAmountToMinor, validateAnnualConferenceTicketPrices } from '@/lib/annual-conference-ticketing';
import {
  annualConferencePaymentConfiguration,
  parseVerifiedPaystackCharge,
  verifyPaystackTransaction,
  verifyPaystackWebhookSignature,
} from '@/lib/annual-conference-ticket-payments';
import { getAdminSession, requireAdmin } from '@/lib/supabase/admin-auth';
import { envValue } from '@/server/env';
import type { AppBindings } from '@/server/http/app-bindings';
import { recordProtectedMutationAudit } from '@/server/protected-mutation';
import { registerDevcon26TestCouponRoutes } from '@/server/routes/devcon26-test-coupons';

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

function ticketingUnavailable(c: Context<AppBindings>) {
  return c.json({ error: 'Ticketing storage is not configured for this environment.' }, 503);
}

function ticketPaymentEnvironment(c: Context<AppBindings>): Record<string, string | undefined> {
  return {
    DEVCON26_PAYMENT_PROVIDER: envValue('DEVCON26_PAYMENT_PROVIDER', c),
    DEVCON26_PAYMENTS_ENABLED: envValue('DEVCON26_PAYMENTS_ENABLED', c),
    PAYSTACK_SECRET_KEY: envValue('PAYSTACK_SECRET_KEY', c),
  };
}

export function registerAnnualConferenceTicketingRoutes(app: Hono<AppBindings>): void {
  registerDevcon26TestCouponRoutes(app);

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
        paymentFacts: charge.facts,
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
    const adminError = await requireAdmin(c, ['owner']);

    if (adminError) return adminError;
    const year = yearSchema.safeParse(c.req.param('year'));

    if (!year.success) return c.json({ error: year.error.issues[0]?.message }, 400);

    try {
      const ticketing = await getSupabaseAnnualConferenceTicketing(Number(year.data), c);

      if (ticketing === null) return ticketingUnavailable(c);
      if (!ticketing) return c.json({ error: `Annual conference ${year.data} was not found.` }, 404);

      return c.json(ticketing);
    } catch {
      return c.json({ error: 'Unable to load conference ticketing.' }, 500);
    }
  });

  app.patch('/api/annual-conference/:year/ticketing/capacity', async (c) => {
    const adminError = await requireAdmin(c, ['owner']);

    if (adminError) return adminError;
    const year = yearSchema.safeParse(c.req.param('year'));
    const body = capacitySchema.safeParse(await c.req.json().catch(() => null));

    if (!year.success) return c.json({ error: year.error.issues[0]?.message }, 400);
    if (!body.success) return c.json({ error: body.error.issues[0]?.message ?? 'Enter a valid capacity.' }, 400);

    try {
      const ticketing = await getSupabaseAnnualConferenceTicketing(Number(year.data), c);

      if (ticketing === null) return ticketingUnavailable(c);
      if (!ticketing) return c.json({ error: `Annual conference ${year.data} was not found.` }, 404);
      const session = c.get('adminSession') ?? await getAdminSession(c);

      if (!session.authenticated || !session.email) return c.json({ error: 'Conference owner access required.' }, 403);
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
    const adminError = await requireAdmin(c, ['owner']);

    if (adminError) return adminError;
    const year = yearSchema.safeParse(c.req.param('year'));
    const body = ticketPricesSchema.safeParse(await c.req.json().catch(() => null));

    if (!year.success) return c.json({ error: year.error.issues[0]?.message }, 400);
    if (!body.success) return c.json({ error: body.error.issues[0]?.message ?? 'Enter valid ticket prices.' }, 400);

    try {
      const ticketing = await getSupabaseAnnualConferenceTicketing(Number(year.data), c);

      if (ticketing === null) return ticketingUnavailable(c);
      if (!ticketing) return c.json({ error: `Annual conference ${year.data} was not found.` }, 404);
      const session = c.get('adminSession') ?? await getAdminSession(c);

      if (!session.authenticated || !session.email) return c.json({ error: 'Conference owner access required.' }, 403);

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
    const adminError = await requireAdmin(c, ['owner']);

    if (adminError) return adminError;
    const year = yearSchema.safeParse(c.req.param('year'));

    if (!year.success) return c.json({ error: year.error.issues[0]?.message }, 400);
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
    const adminError = await requireAdmin(c, ['owner']);

    if (adminError) return adminError;
    const year = yearSchema.safeParse(c.req.param('year'));
    const query = emailDeliveryQuerySchema.safeParse(c.req.query());

    if (!year.success) return c.json({ error: year.error.issues[0]?.message }, 400);
    if (!query.success) return c.json({ error: query.error.issues[0]?.message ?? 'Email delivery filters are invalid.' }, 400);

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
    const adminError = await requireAdmin(c, ['owner']);

    if (adminError) return adminError;
    const year = yearSchema.safeParse(c.req.param('year'));
    const deliveryId = emailDeliveryIdSchema.safeParse(c.req.param('deliveryId'));

    if (!year.success) return c.json({ error: year.error.issues[0]?.message }, 400);
    if (!deliveryId.success) return c.json({ error: deliveryId.error.issues[0]?.message }, 400);

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
    const adminError = await requireAdmin(c, ['owner']);

    if (adminError) return adminError;
    const year = yearSchema.safeParse(c.req.param('year'));
    const body = sponsorAllocationSchema.safeParse(await c.req.json().catch(() => null));

    if (!year.success) return c.json({ error: year.error.issues[0]?.message }, 400);
    if (!body.success) return c.json({ error: body.error.issues[0]?.message ?? 'Check the sponsor allocation.' }, 400);
    try {
      const ticketing = await getSupabaseAnnualConferenceTicketing(Number(year.data), c);

      if (ticketing === null) return ticketingUnavailable(c);
      if (!ticketing) return c.json({ error: `Annual conference ${year.data} was not found.` }, 404);
      if (body.data.quantity > ticketing.inventory.remaining_public_seats) {
        return c.json({ error: `Only ${ticketing.inventory.remaining_public_seats} seats remain available for sponsor allocation.` }, 409);
      }
      const session = c.get('adminSession') ?? await getAdminSession(c);

      if (!session.authenticated || !session.email) return c.json({ error: 'Conference owner access required.' }, 403);
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
