import { z } from 'zod';

const seatSchema = z.object({
  id: z.string().uuid(),
  order_seat_number: z.number().int().positive(),
  status: z.enum(['pending', 'issued', 'checked_in', 'cancelled']),
  attendee_name: z.string().nullable(),
  attendee_email: z.string().nullable(),
});

export const communityPurchaseRowsSchema = z.array(z.object({
  id: z.string().uuid(),
  purchaser_name: z.string(),
  purchaser_email: z.string(),
  payment_mode: z.enum(['live', 'test']),
  created_at: z.string(),
  allocations: z.array(z.object({ id: z.string().uuid(), seat_index: z.number().int().positive() })).min(1),
  tickets: z.array(seatSchema),
})).max(26);

type PurchaseRow = z.infer<typeof communityPurchaseRowsSchema>[number];

export function communityPurchase(row: PurchaseRow) {
  const seats = row.allocations.map((allocation) => {
    const matching = row.tickets.filter((ticket) => ticket.order_seat_number === allocation.seat_index);

    if (matching.length !== 1) throw new Error('Community ticket inventory is incomplete.');
    const ticket = matching[0];

    return {
      allocation_id: allocation.id,
      ticket_id: ticket.id,
      seat_index: allocation.seat_index,
      status: ticket.status,
      attendee_name: ticket.attendee_name,
      attendee_email: ticket.attendee_email,
    };
  }).sort((a, b) => a.seat_index - b.seat_index);

  return {
    order_id: row.id,
    supporter_name: row.purchaser_name,
    supporter_email: row.purchaser_email,
    payment_mode: row.payment_mode,
    created_at: row.created_at,
    total: seats.length,
    assigned: seats.filter((seat) => seat.status === 'issued' || seat.status === 'checked_in').length,
    available: seats.filter((seat) => seat.status === 'pending').length,
    cancelled: seats.filter((seat) => seat.status === 'cancelled').length,
    seats,
  };
}

export type CommunityPurchase = ReturnType<typeof communityPurchase>;
export type CommunitySeat = CommunityPurchase['seats'][number];
