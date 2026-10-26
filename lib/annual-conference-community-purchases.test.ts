import { describe, expect, it } from 'vitest';
import { communityPurchase, communityPurchaseRowsSchema } from './annual-conference-community-purchases';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const row = {
  id: id(1), purchaser_name: 'Community Supporter', purchaser_email: 'supporter@example.test',
  payment_mode: 'test' as const, created_at: '2026-10-25T12:00:00Z',
  allocations: [1, 2, 3, 4].map((n) => ({ id: id(n + 10), seat_index: n })),
  tickets: ['pending', 'issued', 'checked_in', 'cancelled'].map((status, n) => ({
    id: id(n + 20), order_seat_number: n + 1, status,
    attendee_name: n ? 'Recipient' : null, attendee_email: n ? 'recipient@example.test' : null,
  })),
};

describe('Community purchase progress', () => {
  it('counts only community seats, distinguishing assigned, available and cancelled', () => {
    const input = communityPurchaseRowsSchema.parse([{ ...row, tickets: [...row.tickets, {
      id: id(30), order_seat_number: 5, status: 'issued', attendee_name: 'Private gift', attendee_email: 'private@example.test',
    }] }])[0];
    const result = communityPurchase(input);

    expect(result).toMatchObject({ supporter_name: 'Community Supporter', total: 4, assigned: 2, available: 1, cancelled: 1, payment_mode: 'test' });
    expect(JSON.stringify(result)).not.toContain('private@example.test');
    expect(result.seats.map((seat) => seat.seat_index)).toEqual([1, 2, 3, 4]);
  });

  it('fails closed when a community allocation has no corresponding ticket', () => {
    const input = communityPurchaseRowsSchema.parse([{ ...row, tickets: row.tickets.slice(1) }])[0];

    expect(() => communityPurchase(input)).toThrow('incomplete');
  });

  it('rejects malformed ticket status instead of presenting it as assignable', () => {
    expect(communityPurchaseRowsSchema.safeParse([{ ...row, tickets: [{ ...row.tickets[0], status: 'unknown' }] }]).success).toBe(false);
  });
});
