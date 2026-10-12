import type { Context } from 'hono';
import {
  defaultAnnualConferenceTicketingSettings,
  summarizeAnnualConferenceTicketingInventory,
  ticketTiersForPrices,
  type AnnualConferenceTicketingSettings,
  validateAnnualConferenceTicketPrices,
} from '@/lib/annual-conference-ticketing';
import { getSupabaseAdminClient, isSupabaseRuntimeEnabled } from '@/lib/supabase/server';

const INVENTORY_PAGE_SIZE = 1_000;

async function sumTicketingQuantities(input: {
  fetchPage: (from: number, to: number) => Promise<{ data: Array<{ quantity: number }> | null; error: { message: string } | null }>;
}): Promise<number> {
  let from = 0;
  let total = 0;

  while (true) {
    const page = await input.fetchPage(from, from + INVENTORY_PAGE_SIZE - 1);

    if (page.error) throw new Error(page.error.message);
    const rows = page.data ?? [];

    total += rows.reduce((sum, row) => sum + row.quantity, 0);
    if (rows.length < INVENTORY_PAGE_SIZE) return total;

    from += INVENTORY_PAGE_SIZE;
  }
}

export async function getSupabaseAnnualConferenceTicketing(year: number, c?: Context) {
  if (!isSupabaseRuntimeEnabled(c)) return null;

  const client = getSupabaseAdminClient(c);
  const editionResult = await client.from('annual_conference_editions').select('id').eq('year', year).maybeSingle();

  if (editionResult.error) throw new Error(editionResult.error.message);
  if (!editionResult.data) return undefined;
  const editionId = editionResult.data.id;

  const settingsResult = await client
    .from('annual_conference_ticketing_settings')
    .select('*')
    .eq('edition_id', editionId)
    .maybeSingle();

  if (settingsResult.error) throw new Error(settingsResult.error.message);

  const settings = settingsResult.data
    ? {
      edition_id: settingsResult.data.edition_id,
      public_capacity: settingsResult.data.public_capacity,
      ticket_sales_status: settingsResult.data.sales_status,
      currency: settingsResult.data.currency,
      ticket_tiers: ticketTiersForPrices({
        regular: settingsResult.data.regular_price_minor,
        team_3: settingsResult.data.team_3_price_minor,
        team_5: settingsResult.data.team_5_price_minor,
      }),
      updated_at: settingsResult.data.updated_at,
    } satisfies AnnualConferenceTicketingSettings
    : defaultAnnualConferenceTicketingSettings(editionId);

  const [paidSeats, sponsorSeatsHeld, checkoutSeatsHeld] = await Promise.all([
    sumTicketingQuantities({
      fetchPage: async (from, to) => client.from('annual_conference_ticket_orders')
        .select('quantity')
        .eq('edition_id', editionId)
        .eq('status', 'paid')
        .range(from, to),
    }),
    sumTicketingQuantities({
      fetchPage: async (from, to) => client.from('annual_conference_sponsor_ticket_allocations')
        .select('quantity')
        .eq('edition_id', editionId)
        .range(from, to),
    }),
    sumTicketingQuantities({
      fetchPage: async (from, to) => client.from('annual_conference_ticket_orders')
        .select('quantity')
        .eq('edition_id', editionId)
        .eq('status', 'pending_payment')
        .gt('expires_at', new Date().toISOString())
        .range(from, to),
    }),
  ]);

  return {
    settings,
    inventory: summarizeAnnualConferenceTicketingInventory({
      settings,
      paidSeats,
      sponsorSeatsHeld,
      checkoutSeatsHeld,
    }),
  };
}

export async function getSupabaseAnnualConferencePublicTicketPrices(year: number, c?: Context) {
  if (!isSupabaseRuntimeEnabled(c)) return null;

  const client = getSupabaseAdminClient(c);
  const editionResult = await client.from('annual_conference_editions').select('id').eq('year', year).maybeSingle();

  if (editionResult.error) throw new Error(editionResult.error.message);
  if (!editionResult.data) return undefined;

  const settingsResult = await client.from('annual_conference_ticketing_settings')
    .select('currency,regular_price_minor,team_3_price_minor,team_5_price_minor')
    .eq('edition_id', editionResult.data.id)
    .maybeSingle();

  if (settingsResult.error) throw new Error(settingsResult.error.message);
  if (!settingsResult.data || settingsResult.data.currency !== 'GHS') return undefined;

  const prices = {
    regular: settingsResult.data.regular_price_minor,
    team_3: settingsResult.data.team_3_price_minor,
    team_5: settingsResult.data.team_5_price_minor,
  };

  if (validateAnnualConferenceTicketPrices(prices)) return undefined;

  return {
    currency: settingsResult.data.currency,
    tiers: ticketTiersForPrices(prices).map((tier) => ({ tier_key: tier.key, quantity: tier.quantity, amount_minor: tier.price_minor })),
  };
}

export async function createSupabaseAnnualConferenceCheckoutHold(input: {
  editionId: string;
  purchaserName: string;
  purchaserEmail: string;
  tierKey: string;
  checkoutRequestKey: string;
}, c?: Context) {
  if (!isSupabaseRuntimeEnabled(c)) return null;

  const result = await getSupabaseAdminClient(c).rpc(
    'create_annual_conference_checkout_hold',
    {
      p_edition_id: input.editionId,
      p_purchaser_name: input.purchaserName,
      p_purchaser_email: input.purchaserEmail,
      p_tier_key: input.tierKey,
      p_checkout_request_key: input.checkoutRequestKey,
    },
  );

  if (result.error) throw new Error(result.error.message);

  return result.data;
}

export async function confirmSupabaseAnnualConferenceTicketPayment(input: {
  orderId: string;
  provider: string;
  providerEventId: string;
  eventType: string;
  paymentReference: string;
  amountMinor: number;
  currency: string;
  payloadSha256: string;
  paymentFacts: Record<string, string | number>;
}, c?: Context) {
  if (!isSupabaseRuntimeEnabled(c)) return null;

  const result = await getSupabaseAdminClient(c).rpc(
    'confirm_annual_conference_ticket_payment' as never,
    {
      p_order_id: input.orderId,
      p_provider: input.provider,
      p_provider_event_id: input.providerEventId,
      p_event_type: input.eventType,
      p_payment_reference: input.paymentReference,
      p_amount_minor: input.amountMinor,
      p_currency: input.currency,
      p_payload_sha256: input.payloadSha256,
      p_payment_facts: input.paymentFacts,
    } as never,
  );

  if (result.error) throw new Error(result.error.message);

  return result.data as unknown as {
    id: string;
    status: 'pending_payment' | 'paid' | 'refunded' | 'expired' | 'cancelled';
    quantity: number;
    amount_minor: number;
    currency: string;
  };
}

export async function getSupabaseAnnualConferenceTicketPaymentAttempt(paymentReference: string, c?: Context) {
  if (!isSupabaseRuntimeEnabled(c)) return null;

  const result = await getSupabaseAdminClient(c)
    .from('annual_conference_ticket_payment_attempts')
    .select('order_id, provider, payment_reference')
    .eq('payment_reference', paymentReference)
    .maybeSingle();

  if (result.error) throw new Error(result.error.message);

  return result.data;
}

export async function updateSupabaseAnnualConferenceTicketingCapacity(
  editionId: string,
  publicCapacity: number,
  actorEmail: string,
  c?: Context,
) {
  if (!isSupabaseRuntimeEnabled(c)) return null;

  const result = await getSupabaseAdminClient(c).rpc(
    'set_annual_conference_ticketing_capacity' as never,
    {
      p_edition_id: editionId,
      p_public_capacity: publicCapacity,
      p_actor_email: actorEmail,
    } as never,
  );

  if (result.error) throw new Error(result.error.message);

  return result.data as unknown as {
    public_capacity: number;
    updated_at: string;
  };
}

export async function updateSupabaseAnnualConferenceTicketPrices(
  editionId: string,
  prices: { regular: number; team_3: number; team_5: number },
  actorEmail: string,
  c?: Context,
) {
  if (!isSupabaseRuntimeEnabled(c)) return null;

  const result = await getSupabaseAdminClient(c).rpc(
    'set_annual_conference_ticket_prices',
    {
      p_edition_id: editionId,
      p_regular_price_minor: prices.regular,
      p_team_3_price_minor: prices.team_3,
      p_team_5_price_minor: prices.team_5,
      p_actor_email: actorEmail,
    },
  );

  if (result.error) throw new Error(result.error.message);

  return result.data;
}

export async function createSupabaseAnnualConferenceSponsorAllocation(input: {
  editionId: string;
  sponsorName: string;
  contactName: string;
  contactEmail: string;
  quantity: number;
  actorEmail: string;
}, c?: Context) {
  if (!isSupabaseRuntimeEnabled(c)) return null;

  const result = await getSupabaseAdminClient(c).rpc(
    'allocate_annual_conference_sponsor_tickets' as never,
    {
      p_edition_id: input.editionId,
      p_sponsor_name: input.sponsorName,
      p_contact_name: input.contactName,
      p_contact_email: input.contactEmail,
      p_quantity: input.quantity,
      p_actor_email: input.actorEmail,
    } as never,
  );

  if (result.error) throw new Error(result.error.message);

  return result.data as unknown as {
    id: string;
    quantity: number;
  };
}

export async function listSupabaseAnnualConferenceSponsorAllocations(editionId: string, c?: Context) {
  if (!isSupabaseRuntimeEnabled(c)) return null;

  const result = await getSupabaseAdminClient(c)
    .from('annual_conference_sponsor_ticket_allocations')
    .select('*')
    .eq('edition_id', editionId)
    .order('created_at', { ascending: false });

  if (result.error) throw new Error(result.error.message);

  return result.data;
}

export type AnnualConferenceTicketEmailDeliveryStatus = 'queued' | 'sending' | 'accepted' | 'delivered' | 'failed';

export interface AnnualConferenceTicketEmailDelivery {
  id: string;
  order_id: string;
  kind: 'payment_receipt' | 'ticket_delivery' | 'ticket_bundle_delivery';
  recipient_name: string;
  recipient_email: string;
  status: AnnualConferenceTicketEmailDeliveryStatus;
  attempt_count: number;
  provider_email_id: string | null;
  last_error: string | null;
  next_attempt_at: string;
  accepted_at: string | null;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AnnualConferenceTicketEmailDeliverySummary {
  queued: number;
  sending: number;
  accepted: number;
  delivered: number;
  failed: number;
}

export type AnnualConferenceTicketOrderStatus = 'pending_payment' | 'paid' | 'refunded' | 'expired' | 'cancelled';
export type AnnualConferenceTicketStatus = 'pending' | 'issued' | 'cancelled' | 'checked_in';

export interface AnnualConferenceTicketOrderSeat {
  id: string;
  order_seat_number: number | null;
  status: AnnualConferenceTicketStatus;
  issued_at: string | null;
  checked_in_at: string | null;
}

export interface AnnualConferenceTicketOrderOverview {
  id: string;
  purchaser_name: string;
  purchaser_email: string;
  tier_key: string;
  quantity: number;
  amount_minor: number;
  currency: string;
  status: AnnualConferenceTicketOrderStatus;
  payment_reference: string | null;
  paid_at: string | null;
  created_at: string;
  seats: AnnualConferenceTicketOrderSeat[];
  delivery_status: AnnualConferenceTicketEmailDeliveryStatus | null;
}

type AnnualConferenceTicketOrderRow = Omit<AnnualConferenceTicketOrderOverview, 'seats' | 'delivery_status'>;

/**
 * Operator order reads deliberately omit QR hashes, email payloads, provider
 * metadata, and outbox leases. The drawer receives only what staff need to
 * resolve a purchase or understand its admission state.
 */
export async function listSupabaseAnnualConferenceTicketOrders(input: {
  editionId: string;
  page: number;
  pageSize: number;
}, c?: Context): Promise<{ orders: AnnualConferenceTicketOrderOverview[]; total: number } | null> {
  if (!isSupabaseRuntimeEnabled(c)) return null;

  const from = (input.page - 1) * input.pageSize;
  const to = from + input.pageSize - 1;
  const client = getSupabaseAdminClient(c);
  const orderResult = await client
    .from('annual_conference_ticket_orders')
    .select('id, purchaser_name, purchaser_email, tier_key, quantity, amount_minor, currency, status, payment_reference, paid_at, created_at', { count: 'exact' })
    .eq('edition_id', input.editionId)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (orderResult.error) throw new Error(orderResult.error.message);

  const orderRows = (orderResult.data ?? []) as unknown as AnnualConferenceTicketOrderRow[];
  const orderIds = orderRows.map((order) => order.id);

  if (!orderIds.length) return { orders: [], total: orderResult.count ?? 0 };

  const [seatsResult, deliveriesResult] = await Promise.all([
    client
      .from('annual_conference_tickets')
      .select('id, order_id, order_seat_number, status, issued_at, checked_in_at')
      .in('order_id', orderIds)
      .order('order_seat_number', { ascending: true }),
    client
      .from('annual_conference_ticket_email_outbox')
      .select('order_id, status, created_at')
      .in('order_id', orderIds)
      .order('created_at', { ascending: false }),
  ]);

  if (seatsResult.error) throw new Error(seatsResult.error.message);
  if (deliveriesResult.error) throw new Error(deliveriesResult.error.message);

  const seatsByOrder = new Map<string, AnnualConferenceTicketOrderSeat[]>();

  for (const seat of seatsResult.data ?? []) {
    const orderId = String(seat.order_id);
    const current = seatsByOrder.get(orderId) ?? [];

    current.push({
      id: String(seat.id),
      order_seat_number: typeof seat.order_seat_number === 'number' ? seat.order_seat_number : null,
      status: seat.status as AnnualConferenceTicketStatus,
      issued_at: seat.issued_at,
      checked_in_at: seat.checked_in_at,
    });
    seatsByOrder.set(orderId, current);
  }

  const deliveryStatusByOrder = new Map<string, AnnualConferenceTicketEmailDeliveryStatus>();

  for (const delivery of deliveriesResult.data ?? []) {
    const orderId = String(delivery.order_id);

    if (!deliveryStatusByOrder.has(orderId)) {
      deliveryStatusByOrder.set(orderId, delivery.status as AnnualConferenceTicketEmailDeliveryStatus);
    }
  }

  return {
    orders: orderRows.map((order) => ({
      ...order,
      seats: seatsByOrder.get(order.id) ?? [],
      delivery_status: deliveryStatusByOrder.get(order.id) ?? null,
    })),
    total: orderResult.count ?? 0,
  };
}

export type AnnualConferenceBearerTicketCheckInOutcome = 'checked_in' | 'already_checked_in' | 'invalid';

export async function checkInSupabaseAnnualConferenceBearerTicket(input: {
  editionId: string;
  qrToken: string;
  checkedInByEmail: string;
}, c?: Context): Promise<{
  outcome: AnnualConferenceBearerTicketCheckInOutcome;
  ticket_id: string | null;
  order_id: string | null;
  order_seat_number: number | null;
} | null> {
  if (!isSupabaseRuntimeEnabled(c)) return null;

  const result = await getSupabaseAdminClient(c).rpc(
    'check_in_annual_conference_bearer_ticket' as never,
    {
      p_edition_id: input.editionId,
      p_qr_token: input.qrToken,
      p_checked_in_by_email: input.checkedInByEmail,
    } as never,
  );

  if (result.error) throw new Error(result.error.message);

  const row = Array.isArray(result.data) ? result.data[0] : null;

  if (!row) throw new Error('Ticket check-in did not return an outcome.');

  return row as {
    outcome: AnnualConferenceBearerTicketCheckInOutcome;
    ticket_id: string | null;
    order_id: string | null;
    order_seat_number: number | null;
  };
}

type AnnualConferenceTicketEmailDeliveryRow = AnnualConferenceTicketEmailDelivery & {
  payload?: unknown;
  idempotency_key?: unknown;
  claim_token?: unknown;
  claimed_until?: unknown;
  qr_token?: unknown;
  qr_token_hash?: unknown;
};

/**
 * The outbox can contain capabilities needed by the sender. Operator reads
 * must cross this boundary through an allowlist, including after an RPC call.
 */
export function ticketEmailDeliveryForOperator(row: AnnualConferenceTicketEmailDeliveryRow): AnnualConferenceTicketEmailDelivery {
  return {
    id: row.id,
    order_id: row.order_id,
    kind: row.kind,
    recipient_name: row.recipient_name,
    recipient_email: row.recipient_email,
    status: row.status,
    attempt_count: row.attempt_count,
    provider_email_id: row.provider_email_id,
    last_error: row.last_error,
    next_attempt_at: row.next_attempt_at,
    accepted_at: row.accepted_at,
    delivered_at: row.delivered_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function listSupabaseAnnualConferenceTicketEmailDeliveries(input: {
  editionId: string;
  page: number;
  pageSize: number;
  status?: AnnualConferenceTicketEmailDeliveryStatus;
}, c?: Context) {
  if (!isSupabaseRuntimeEnabled(c)) return null;

  const from = (input.page - 1) * input.pageSize;
  const to = from + input.pageSize - 1;
  let query = getSupabaseAdminClient(c)
    .from('annual_conference_ticket_email_outbox')
    // Never expose the email payload, idempotency key, QR capability, or claim lease.
    .select('id, order_id, kind, recipient_name, recipient_email, status, attempt_count, provider_email_id, last_error, next_attempt_at, accepted_at, delivered_at, created_at, updated_at', { count: 'exact' })
    .eq('edition_id', input.editionId)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (input.status) query = query.eq('status', input.status);

  const result = await query;

  if (result.error) throw new Error(result.error.message);

  return {
    deliveries: (result.data ?? []).map((delivery) => ticketEmailDeliveryForOperator(delivery as AnnualConferenceTicketEmailDeliveryRow)),
    total: result.count ?? 0,
  };
}

export async function getSupabaseAnnualConferenceTicketEmailDeliverySummary(
  editionId: string,
  c?: Context,
): Promise<AnnualConferenceTicketEmailDeliverySummary | null> {
  if (!isSupabaseRuntimeEnabled(c)) return null;

  const client = getSupabaseAdminClient(c);
  const statuses: AnnualConferenceTicketEmailDeliveryStatus[] = ['queued', 'sending', 'accepted', 'delivered', 'failed'];
  const results = await Promise.all(statuses.map((status) => client
    .from('annual_conference_ticket_email_outbox')
    .select('id', { count: 'exact', head: true })
    .eq('edition_id', editionId)
    .eq('status', status)));

  for (const result of results) {
    if (result.error) throw new Error(result.error.message);
  }

  return {
    queued: results[0]?.count ?? 0,
    sending: results[1]?.count ?? 0,
    accepted: results[2]?.count ?? 0,
    delivered: results[3]?.count ?? 0,
    failed: results[4]?.count ?? 0,
  };
}

export async function retrySupabaseAnnualConferenceTicketEmailDelivery(input: {
  editionId: string;
  deliveryId: string;
}, c?: Context) {
  if (!isSupabaseRuntimeEnabled(c)) return null;

  const result = await getSupabaseAdminClient(c).rpc(
    'retry_annual_conference_ticket_email_outbox' as never,
    {
      p_edition_id: input.editionId,
      p_outbox_id: input.deliveryId,
    } as never,
  ) as unknown as {
    data: AnnualConferenceTicketEmailDeliveryRow | null;
    error: { message: string } | null;
  };

  if (result.error) throw new Error(result.error.message);

  if (!result.data) throw new Error('Ticket email retry did not return a delivery.');

  return ticketEmailDeliveryForOperator(result.data as unknown as AnnualConferenceTicketEmailDeliveryRow);
}
