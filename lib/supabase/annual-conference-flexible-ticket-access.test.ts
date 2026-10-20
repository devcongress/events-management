import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  enabled: vi.fn(() => true),
  rpc: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdminClient: () => ({ rpc: mocks.rpc }),
  isSupabaseRuntimeEnabled: mocks.enabled,
}));

import {
  claimFlexibleTicket,
  claimFlexibleTicketBadge,
  getFlexibleTicketOrder,
  reissueFlexibleGiftClaim,
  rotateFlexibleTicketClaim,
} from './annual-conference-flexible-ticket-access';

const context = {} as Parameters<typeof getFlexibleTicketOrder>[1];
const capability = 'a'.repeat(64);
const orderCapability = 'b'.repeat(64);
const allocationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const orderId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ticketId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const socialCardId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const deliveryId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.enabled.mockReturnValue(true);
});

describe('Supabase flexible ticket capability access', () => {
  it('calls the five private RPCs with their exact capability arguments', async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: [{
        order_id: orderId,
        order_status: 'paid',
        allocation_id: allocationId,
        seat_index: 1,
        allocation_kind: 'community_shareable',
        fulfillment_status: 'issued',
        ticket_id: ticketId,
        ticket_status: 'issued',
        claim_status: 'available',
        can_rotate_claim: true,
        can_request_refund: false,
      }], error: null })
      .mockResolvedValueOnce({ data: [{
        outcome: 'claimed', ticket_id: ticketId, order_seat_number: 1, delivery_queued: true,
      }], error: null })
      .mockResolvedValueOnce({ data: [{
        outcome: 'claimed', ticket_id: ticketId, order_seat_number: 1,
        social_card_id: socialCardId, delivery_queued: true,
      }], error: null })
      .mockResolvedValueOnce({ data: [{ outcome: 'rotated', claim_capability: capability }], error: null })
      .mockResolvedValueOnce({ data: [{ outcome: 'queued', delivery_id: deliveryId }], error: null });

    await expect(getFlexibleTicketOrder(orderCapability, context)).resolves.toHaveLength(1);
    await expect(claimFlexibleTicket({ capability, name: 'Ama', email: 'ama@example.test' }, context))
      .resolves.toMatchObject({ outcome: 'claimed' });
    await expect(claimFlexibleTicketBadge({ capability, name: 'Ama', email: 'ama@example.test' }, context))
      .resolves.toMatchObject({ social_card_id: socialCardId });
    await expect(rotateFlexibleTicketClaim({
      orderCapability, allocationId, purpose: 'badge',
    }, context)).resolves.toEqual({ outcome: 'rotated', claim_capability: capability });
    await expect(reissueFlexibleGiftClaim({ orderCapability, allocationId }, context))
      .resolves.toEqual({ outcome: 'queued', delivery_id: deliveryId });

    expect(mocks.rpc.mock.calls).toEqual([
      ['get_annual_conference_flexible_order_management', { p_capability: orderCapability }],
      ['claim_annual_conference_flexible_ticket', {
        p_capability: capability, p_name: 'Ama', p_email: 'ama@example.test',
      }],
      ['claim_annual_conference_flexible_badge', {
        p_capability: capability, p_name: 'Ama', p_email: 'ama@example.test',
      }],
      ['rotate_annual_conference_flexible_ticket_claim', {
        p_order_management_capability: orderCapability,
        p_allocation_id: allocationId,
        p_purpose: 'badge',
      }],
      ['reissue_annual_conference_gift_claim', {
        p_order_management_capability: orderCapability,
        p_allocation_id: allocationId,
      }],
    ]);
  });

  it('passes null for an omitted gift email so PostgreSQL can apply allocation rules', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [{
      outcome: 'claimed', ticket_id: ticketId, order_seat_number: 1, delivery_queued: true,
    }], error: null });

    await claimFlexibleTicket({ capability, name: 'Ama' }, context);

    expect(mocks.rpc).toHaveBeenCalledWith('claim_annual_conference_flexible_ticket', {
      p_capability: capability,
      p_name: 'Ama',
      p_email: null,
    });
  });

  it('fails closed on provider errors, extra output fields, or multiple mutation rows', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: `private ${capability}` } });

    await expect(getFlexibleTicketOrder(orderCapability, context))
      .rejects.toThrow('flexible_ticket_access_unavailable');

    mocks.rpc.mockResolvedValueOnce({ data: [{
      outcome: 'claimed', ticket_id: ticketId, order_seat_number: 1,
      delivery_queued: true, private_detail: capability,
    }], error: null });

    await expect(claimFlexibleTicket({ capability, name: 'Ama' }, context))
      .rejects.toThrow('flexible_ticket_access_unavailable');

    const row = { outcome: 'rotated', claim_capability: capability };

    mocks.rpc.mockResolvedValueOnce({ data: [row, row], error: null });

    await expect(rotateFlexibleTicketClaim({
      orderCapability, allocationId, purpose: 'admission',
    }, context)).rejects.toThrow('flexible_ticket_access_unavailable');
  });

  it('returns null without touching storage when the Supabase runtime is disabled', async () => {
    mocks.enabled.mockReturnValue(false);

    await expect(getFlexibleTicketOrder(orderCapability, context)).resolves.toBeNull();
    await expect(claimFlexibleTicket({ capability, name: 'Ama' }, context)).resolves.toBeNull();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
