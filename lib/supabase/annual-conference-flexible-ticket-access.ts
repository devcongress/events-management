import type { Context } from 'hono';
import { z } from 'zod';
import { getSupabaseAdminClient, isSupabaseRuntimeEnabled } from '@/lib/supabase/server';

const orderAllocationSchema = z.object({
  order_id: z.string().uuid(),
  order_status: z.string().min(1).max(40),
  allocation_id: z.string().uuid(),
  seat_index: z.number().int().positive(),
  allocation_kind: z.enum(['self', 'gift', 'buyer_managed', 'community_managed', 'community_shareable']),
  fulfillment_status: z.enum(['pending_identity', 'cancelled', 'issued']),
  ticket_id: z.string().uuid(),
  ticket_status: z.string().min(1).max(40),
  claim_status: z.enum(['used', 'revoked', 'available', 'not_applicable']),
  can_rotate_claim: z.boolean(),
  can_request_refund: z.boolean(),
}).strict();

const ticketClaimSchema = z.object({
  outcome: z.string(),
  ticket_id: z.string().uuid().nullable(),
  order_seat_number: z.number().int().positive().nullable(),
  delivery_queued: z.boolean(),
}).strict();

const badgeClaimSchema = ticketClaimSchema.extend({
  social_card_id: z.string().uuid().nullable(),
}).strict();

const rotatedClaimSchema = z.object({
  outcome: z.string(),
  claim_capability: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
}).strict();

const reissuedGiftSchema = z.object({
  outcome: z.string(),
  delivery_id: z.string().uuid().nullable(),
}).strict();

type RpcResult = { data: unknown; error: { message: string } | null };

async function rpc(c: Context, name: string, args: Record<string, unknown>): Promise<unknown | null> {
  if (!isSupabaseRuntimeEnabled(c)) return null;
  const result = await getSupabaseAdminClient(c).rpc(name as never, args as never) as unknown as RpcResult;

  if (result.error) throw new Error('flexible_ticket_access_unavailable');

  return result.data;
}

export async function getFlexibleTicketOrder(capability: string, c: Context) {
  const data = await rpc(c, 'get_annual_conference_flexible_order_management', {
    p_capability: capability,
  });

  if (data === null) return null;
  const parsed = z.array(orderAllocationSchema).safeParse(data);

  if (!parsed.success) throw new Error('flexible_ticket_access_unavailable');

  return parsed.data;
}

export async function claimFlexibleTicket(input: {
  capability: string;
  name: string;
  email?: string;
}, c: Context) {
  const data = await rpc(c, 'claim_annual_conference_flexible_ticket', {
    p_capability: input.capability,
    p_name: input.name,
    p_email: input.email ?? null,
  });

  if (data === null) return null;
  const parsed = z.array(ticketClaimSchema).max(1).safeParse(data);

  if (!parsed.success) throw new Error('flexible_ticket_access_unavailable');

  return parsed.data[0];
}

export async function claimFlexibleTicketBadge(input: {
  capability: string;
  name: string;
  email: string;
}, c: Context) {
  const data = await rpc(c, 'claim_annual_conference_flexible_badge', {
    p_capability: input.capability,
    p_name: input.name,
    p_email: input.email,
  });

  if (data === null) return null;
  const parsed = z.array(badgeClaimSchema).max(1).safeParse(data);

  if (!parsed.success) throw new Error('flexible_ticket_access_unavailable');

  return parsed.data[0];
}

export async function rotateFlexibleTicketClaim(input: {
  orderCapability: string;
  allocationId: string;
  purpose: 'admission' | 'badge';
}, c: Context) {
  const data = await rpc(c, 'rotate_annual_conference_flexible_ticket_claim', {
    p_order_management_capability: input.orderCapability,
    p_allocation_id: input.allocationId,
    p_purpose: input.purpose,
  });

  if (data === null) return null;
  const parsed = z.array(rotatedClaimSchema).max(1).safeParse(data);

  if (!parsed.success) throw new Error('flexible_ticket_access_unavailable');

  return parsed.data[0];
}

export async function reissueFlexibleGiftClaim(input: {
  orderCapability: string;
  allocationId: string;
}, c: Context) {
  const data = await rpc(c, 'reissue_annual_conference_gift_claim', {
    p_order_management_capability: input.orderCapability,
    p_allocation_id: input.allocationId,
  });

  if (data === null) return null;
  const parsed = z.array(reissuedGiftSchema).max(1).safeParse(data);

  if (!parsed.success) throw new Error('flexible_ticket_access_unavailable');

  return parsed.data[0];
}
