import { z } from 'zod';

export const DEVCON26_TICKET_UNIT_PRICE_MINOR = 15_000;
export const PAYSTACK_MAX_TRANSACTION_MINOR = 10_000_000;
export const DEVCON26_MAX_TICKETS_PER_PAYSTACK_PAYMENT = Math.floor(
  PAYSTACK_MAX_TRANSACTION_MINOR / DEVCON26_TICKET_UNIT_PRICE_MINOR,
);

// The order table stores integer pesewas. Actual availability is checked under
// the edition capacity lock, not by an arbitrary per-buyer ticket quota.
export const DEVCON26_MAX_TICKETS_FOR_INTEGER_AMOUNT = Math.floor(2_147_483_647 / DEVCON26_TICKET_UNIT_PRICE_MINOR);

const selfSeatSchema = z.object({ kind: z.literal('self') }).strict();
const buyerManagedSeatSchema = z.object({ kind: z.literal('buyer_managed') }).strict();
const managedCommunitySeatSchema = z.object({ kind: z.literal('community_managed') }).strict();
const shareableCommunitySeatSchema = z.object({ kind: z.literal('community_shareable') }).strict();
const giftSeatSchema = z.object({
  kind: z.literal('gift'),
  recipient_email: z.string().trim().toLowerCase().email().max(254),
}).strict();

export const devcon26SeatAllocationSchema = z.discriminatedUnion('kind', [
  selfSeatSchema,
  buyerManagedSeatSchema,
  giftSeatSchema,
  managedCommunitySeatSchema,
  shareableCommunitySeatSchema,
]);

export const devcon26TicketCartSchema = z.object({
  quantity: z.number().int().min(1).max(DEVCON26_MAX_TICKETS_PER_PAYSTACK_PAYMENT),
  allocations: z.array(devcon26SeatAllocationSchema)
    .min(1)
    .max(DEVCON26_MAX_TICKETS_PER_PAYSTACK_PAYMENT),
  payment_provider: z.literal('paystack').default('paystack'),
}).strict().superRefine((cart, context) => {
  if (cart.allocations.length !== cart.quantity) {
    context.addIssue({ code: 'custom', path: ['allocations'], message: 'Allocate every ticket.' });
  }

  if (cart.allocations.filter((seat) => seat.kind === 'self').length > 1) {
    context.addIssue({ code: 'custom', path: ['allocations'], message: 'Only one ticket can be yours.' });
  }
});

export type Devcon26TicketCart = z.infer<typeof devcon26TicketCartSchema>;

export function devcon26CartAllocationsForStorage(
  cart: Devcon26TicketCart,
  purchaser: { name: string; email: string },
) {
  return cart.allocations.map((seat, index) => {
    if (seat.kind === 'self') {
      return {
        seat_index: index + 1,
        kind: seat.kind,
        recipient_name: purchaser.name.trim(),
        recipient_email: purchaser.email.trim().toLowerCase(),
      };
    }

    if (seat.kind === 'gift') {
      return { seat_index: index + 1, kind: seat.kind, recipient_email: seat.recipient_email };
    }

    return { seat_index: index + 1, kind: seat.kind };
  });
}

export function devcon26TicketSubtotalMinor(quantity: number): number {
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > DEVCON26_MAX_TICKETS_FOR_INTEGER_AMOUNT) {
    throw new Error('Invalid ticket quantity.');
  }

  return quantity * DEVCON26_TICKET_UNIT_PRICE_MINOR;
}

export function devcon26AvailablePaymentProviders(): Array<{ key: 'paystack'; name: 'Paystack' }> {
  return [{ key: 'paystack', name: 'Paystack' }];
}
