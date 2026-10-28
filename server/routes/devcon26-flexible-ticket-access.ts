import crypto from 'node:crypto';
import type { Context, Hono } from 'hono';
import { z } from 'zod';
import {
  claimFlexibleTicket, claimFlexibleTicketBadge, getFlexibleTicketOrder,
  reissueFlexibleGiftClaim, rotateFlexibleTicketClaim,
} from '@/lib/supabase/annual-conference-flexible-ticket-access';
import {
  DEVCON26_FLEXIBLE_CHECKOUT_PATH, devcon26PublicTicketAccessOriginAllowed,
} from '@/lib/devcon26-public-checkout';
import { envValue } from '@/server/env';
import { managedCheckoutOrigin } from '@/lib/managed-conference-checkout';
import { managedCheckoutSettings } from '@/server/managed-conference-checkout';
import type { AppBindings } from '@/server/http/app-bindings';
import { enforcePublicRateLimit, publicClientKey } from '@/server/http/public-intake-protection';

export const DEVCON26_FLEXIBLE_TICKET_ACCESS_PATH = `${DEVCON26_FLEXIBLE_CHECKOUT_PATH}/tickets`;
const capabilitySchema = z.string().regex(/^[0-9a-f]{64}$/);
const nameSchema = z.string().trim().min(1).max(120).regex(/^[^\u0000-\u001f\u007f]+$/);
const emailSchema = z.string().trim().toLowerCase().email().max(254);
const orderSchema = z.object({ capability: capabilitySchema }).strict();
const claimSchema = z.object({ capability: capabilitySchema, name: nameSchema, email: emailSchema.optional() }).strict();
const badgeSchema = z.object({ capability: capabilitySchema, name: nameSchema, email: emailSchema }).strict();
const rotateSchema = z.object({
  order_capability: capabilitySchema,
  allocation_id: z.string().uuid(),
  purpose: z.enum(['admission', 'badge']),
}).strict();
const reissueSchema = z.object({ order_capability: capabilitySchema, allocation_id: z.string().uuid() }).strict();

const accessOperations = ['order', 'claim', 'badge', 'claims/rotate', 'gifts/reissue'] as const;

export function isDevcon26FlexibleTicketAccessRequest(path: string, method: string): boolean {
  return method === 'POST' && accessOperations.some((operation) => path === `${DEVCON26_FLEXIBLE_TICKET_ACCESS_PATH}/${operation}`);
}

function environment(c: Context<AppBindings>) {
  return Object.fromEntries([
    'DEVCON26_PUBLIC_CHECKOUT_ORIGINS', 'DEVCON26_FLEXIBLE_TICKET_ACCESS_ENABLED',
    'PUBLIC_WEBSITE_ORIGIN', 'NODE_ENV', 'DEVCON26_COMPLETE_TEST_ENABLED', 'DEVCON26_COMPLETE_TEST_ORIGIN',
  ].map((key) => [key, envValue(key, c)]));
}

function capabilityRateKey(capability: string): string {
  return crypto.createHash('sha256').update(capability).digest('hex');
}

async function limit(c: Context, input: {
  action: string;
  capability: string;
  maxAttempts: number;
  windowSeconds: number;
}) {
  const clientLimit = await enforcePublicRateLimit(c, {
    action: 'devcon26-flexible-ticket-access-client',
    clientKey: publicClientKey(c),
    maxAttempts: 60,
    windowSeconds: 300,
  }, 'Please wait before trying another ticket action.');

  if (clientLimit) return clientLimit;

  return enforcePublicRateLimit(c, {
    action: `${input.action}-capability`,
    clientKey: capabilityRateKey(input.capability),
    maxAttempts: input.maxAttempts,
    windowSeconds: input.windowSeconds,
  }, 'Please wait before trying this ticket action again.');
}

function invalidCapability(c: Context<AppBindings>) {
  return c.json({ error: 'This ticket action is invalid or no longer available.' }, 404);
}

function unavailable(c: Context<AppBindings>) {
  return c.json({ error: 'Ticket access is temporarily unavailable.' }, 503);
}

async function ticketAccessEnabled(c: Context<AppBindings>, configuration: Record<string, string | undefined>): Promise<boolean> {
  const origin = c.req.header('Origin');

  if (!devcon26PublicTicketAccessOriginAllowed(configuration, origin)) return false;
  if (configuration.DEVCON26_FLEXIBLE_TICKET_ACCESS_ENABLED?.trim().toLowerCase() === 'true'
    || (configuration.DEVCON26_COMPLETE_TEST_ENABLED === 'true' && origin === configuration.DEVCON26_COMPLETE_TEST_ORIGIN)) return true;
  if (!managedCheckoutOrigin(configuration, origin)) return false;

  try {
    // Installing the managed schema replaces deployment flags as the access
    // authority. Existing paid capabilities remain usable while sales pause or
    // an Owner changes the mode for new orders.
    return Boolean(await managedCheckoutSettings(c, 2026));
  } catch {
    // Older installations retain their explicit legacy activation requirement.
    return false;
  }
}

export function registerDevcon26FlexibleTicketAccessRoutes(app: Hono<AppBindings>): void {
  app.use(`${DEVCON26_FLEXIBLE_TICKET_ACCESS_PATH}/*`, async (c, next) => {
    const configuration = environment(c);

    if (!await ticketAccessEnabled(c, configuration)) {
      return c.json({ error: 'Ticket access is not available.' }, 503);
    }
    if (c.req.header('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
      return c.json({ error: 'Use a JSON ticket request.' }, 415);
    }
    if (new URL(c.req.url).search) return invalidCapability(c);

    await next();
  });

  app.post(`${DEVCON26_FLEXIBLE_TICKET_ACCESS_PATH}/order`, async (c) => {
    const input = orderSchema.safeParse(await c.req.json().catch(() => null));

    if (!input.success) return invalidCapability(c);
    const limited = await limit(c, {
      action: 'devcon26-flexible-ticket-order', capability: input.data.capability,
      maxAttempts: 30, windowSeconds: 300,
    });

    if (limited) return limited;

    try {
      const rows = await getFlexibleTicketOrder(input.data.capability, c);

      if (rows === null) return unavailable(c);
      if (!rows.length) return invalidCapability(c);

      return c.json({
        status: rows[0].order_status,
        allocations: rows.map((row) => ({
          allocation_id: row.allocation_id,
          seat_number: row.seat_index,
          kind: row.allocation_kind,
          fulfillment_status: row.fulfillment_status,
          ticket_status: row.ticket_status,
          claim_status: row.claim_status,
          can_rotate_claim: row.can_rotate_claim,
        })),
      });
    } catch {
      return unavailable(c);
    }
  });

  app.post(`${DEVCON26_FLEXIBLE_TICKET_ACCESS_PATH}/claim`, async (c) => {
    const input = claimSchema.safeParse(await c.req.json().catch(() => null));

    if (!input.success) return invalidCapability(c);
    const limited = await limit(c, {
      action: 'devcon26-flexible-ticket-claim', capability: input.data.capability,
      maxAttempts: 10, windowSeconds: 300,
    });

    if (limited) return limited;

    try {
      const result = await claimFlexibleTicket(input.data, c);

      if (result === null) return unavailable(c);
      if (!result || result.outcome !== 'claimed') return invalidCapability(c);

      return c.json({ status: 'claimed', seat_number: result.order_seat_number, delivery_queued: result.delivery_queued });
    } catch {
      return unavailable(c);
    }
  });

  app.post(`${DEVCON26_FLEXIBLE_TICKET_ACCESS_PATH}/badge`, async (c) => {
    const input = badgeSchema.safeParse(await c.req.json().catch(() => null));

    if (!input.success) return invalidCapability(c);
    const limited = await limit(c, {
      action: 'devcon26-flexible-ticket-badge', capability: input.data.capability,
      maxAttempts: 10, windowSeconds: 300,
    });

    if (limited) return limited;

    try {
      const result = await claimFlexibleTicketBadge(input.data, c);

      if (result === null) return unavailable(c);
      if (!result || result.outcome !== 'claimed') return invalidCapability(c);

      return c.json({
        status: 'claimed', seat_number: result.order_seat_number,
        social_card_id: result.social_card_id, delivery_queued: result.delivery_queued,
      });
    } catch {
      return unavailable(c);
    }
  });

  app.post(`${DEVCON26_FLEXIBLE_TICKET_ACCESS_PATH}/claims/rotate`, async (c) => {
    const input = rotateSchema.safeParse(await c.req.json().catch(() => null));

    if (!input.success) return invalidCapability(c);
    const limited = await limit(c, {
      action: 'devcon26-flexible-ticket-rotate', capability: input.data.order_capability,
      maxAttempts: 20, windowSeconds: 300,
    });

    if (limited) return limited;

    try {
      const result = await rotateFlexibleTicketClaim({
        orderCapability: input.data.order_capability,
        allocationId: input.data.allocation_id,
        purpose: input.data.purpose,
      }, c);

      if (result === null) return unavailable(c);
      if (!result || result.outcome !== 'rotated' || !result.claim_capability) return invalidCapability(c);

      return c.json({ status: 'rotated', claim_capability: result.claim_capability });
    } catch {
      return unavailable(c);
    }
  });

  app.post(`${DEVCON26_FLEXIBLE_TICKET_ACCESS_PATH}/gifts/reissue`, async (c) => {
    const input = reissueSchema.safeParse(await c.req.json().catch(() => null));

    if (!input.success) return invalidCapability(c);
    const limited = await limit(c, {
      action: 'devcon26-flexible-gift-reissue', capability: input.data.order_capability,
      maxAttempts: 5, windowSeconds: 3_600,
    });

    if (limited) return limited;

    try {
      const result = await reissueFlexibleGiftClaim({
        orderCapability: input.data.order_capability,
        allocationId: input.data.allocation_id,
      }, c);

      if (result === null) return unavailable(c);
      if (!result || result.outcome !== 'queued') return invalidCapability(c);

      return c.json({ status: 'queued' });
    } catch {
      return unavailable(c);
    }
  });
}
