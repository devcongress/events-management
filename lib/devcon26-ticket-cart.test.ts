import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';
import { devcon26FlexibleCheckoutInitializeSchema } from './devcon26-public-checkout';
import {
  DEVCON26_MAX_TICKETS_FOR_INTEGER_AMOUNT,
  DEVCON26_MAX_TICKETS_PER_PAYSTACK_PAYMENT,
  DEVCON26_TICKET_UNIT_PRICE_MINOR,
  PAYSTACK_MAX_TRANSACTION_MINOR,
  devcon26CartAllocationsForStorage,
  devcon26AvailablePaymentProviders,
  devcon26TicketCartSchema,
  devcon26TicketSubtotalMinor,
} from './devcon26-ticket-cart';

describe('DevCon26 ticket cart', () => {
  it('accepts every allocation kind in one mixed order and normalizes gift recipients', () => {
    expect(devcon26TicketCartSchema.parse({
      quantity: 5,
      allocations: [
        { kind: 'gift', recipient_email: ' GUEST@Example.Test ' },
        { kind: 'community_managed' },
        { kind: 'self' },
        { kind: 'community_shareable' },
        { kind: 'buyer_managed' },
      ],
    })).toEqual({
      quantity: 5,
      allocations: [
        { kind: 'gift', recipient_email: 'guest@example.test' },
        { kind: 'community_managed' },
        { kind: 'self' },
        { kind: 'community_shareable' },
        { kind: 'buyer_managed' },
      ],
      payment_provider: 'paystack',
    });
  });

  it('derives indexed self identity and leaves unassigned seats free of recipient data', () => {
    const cart = devcon26TicketCartSchema.parse({
      quantity: 4,
      allocations: [
        { kind: 'self' },
        { kind: 'gift', recipient_email: ' Recipient@Example.Test ' },
        { kind: 'buyer_managed' },
        { kind: 'community_managed' },
      ],
    });

    expect(devcon26CartAllocationsForStorage(cart, { name: ' Ada ', email: ' ADA@Example.Test ' })).toEqual([
      { seat_index: 1, kind: 'self', recipient_name: 'Ada', recipient_email: 'ada@example.test' },
      { seat_index: 2, kind: 'gift', recipient_email: 'recipient@example.test' },
      { seat_index: 3, kind: 'buyer_managed' },
      { seat_index: 4, kind: 'community_managed' },
    ]);
  });

  it.each([
    { kind: 'self' },
    { kind: 'gift', recipient_email: 'person@example.test' },
    { kind: 'buyer_managed' },
    { kind: 'community_managed' },
    { kind: 'community_shareable' },
  ])('accepts the $kind allocation on its own', (allocation) => {
    expect(devcon26TicketCartSchema.safeParse({ quantity: 1, allocations: [allocation] }).success).toBe(true);
  });

  it('requires one allocation per ticket and permits quantities above twenty', () => {
    expect(devcon26TicketCartSchema.safeParse({
      quantity: 21,
      allocations: Array.from({ length: 21 }, (_, index) => ({
        kind: index % 2 === 0 ? 'community_managed' as const : 'community_shareable' as const,
      })),
    }).success).toBe(true);

    for (const allocations of [
      [{ kind: 'community_managed' }],
      [{ kind: 'community_shareable' }, { kind: 'buyer_managed' }, { kind: 'gift', recipient_email: 'person@example.test' }],
    ]) {
      const result = devcon26TicketCartSchema.safeParse({ quantity: 2, allocations });

      expect(result.success).toBe(false);
      expect(result.error?.issues).toContainEqual(expect.objectContaining({
        path: ['allocations'],
        message: 'Allocate every ticket.',
      }));
    }
  });

  it('uses the Paystack amount ceiling rather than an arbitrary group-size limit', () => {
    expect(DEVCON26_MAX_TICKETS_PER_PAYSTACK_PAYMENT).toBe(666);
    expect(devcon26TicketCartSchema.safeParse({
      quantity: DEVCON26_MAX_TICKETS_PER_PAYSTACK_PAYMENT,
      allocations: Array.from({ length: DEVCON26_MAX_TICKETS_PER_PAYSTACK_PAYMENT }, () => ({ kind: 'buyer_managed' })),
    }).success).toBe(true);
    expect(DEVCON26_MAX_TICKETS_PER_PAYSTACK_PAYMENT * DEVCON26_TICKET_UNIT_PRICE_MINOR).toBeLessThanOrEqual(PAYSTACK_MAX_TRANSACTION_MINOR);
    expect(devcon26TicketCartSchema.safeParse({
      quantity: DEVCON26_MAX_TICKETS_PER_PAYSTACK_PAYMENT + 1,
      allocations: Array.from({ length: DEVCON26_MAX_TICKETS_PER_PAYSTACK_PAYMENT + 1 }, () => ({ kind: 'buyer_managed' })),
    }).success).toBe(false);
  });

  it('allows at most one self allocation', () => {
    const result = devcon26TicketCartSchema.safeParse({
      quantity: 2,
      allocations: [{ kind: 'self' }, { kind: 'self' }],
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toContainEqual(expect.objectContaining({
      path: ['allocations'],
      message: 'Only one ticket can be yours.',
    }));
  });

  it.each([
    { quantity: 0, allocations: [{ kind: 'community_managed' }] },
    { quantity: 1.5, allocations: [{ kind: 'community_shareable' }] },
    { quantity: DEVCON26_MAX_TICKETS_FOR_INTEGER_AMOUNT + 1, allocations: [{ kind: 'community_managed' }] },
    { quantity: 1, allocations: [{ kind: 'gift', recipient_email: 'not-an-email' }] },
    { quantity: 1, allocations: [{ kind: 'self', recipient_email: 'person@example.test' }] },
    { quantity: 1, allocations: [{ kind: 'gift', recipient_email: 'person@example.test', claim_token: 'private' }] },
    { quantity: 1, allocations: [{ kind: 'unknown' }] },
    { quantity: 1, allocations: [{ kind: 'community_managed' }], amount_minor: 15_000 },
    { quantity: 1, allocations: [{ kind: 'community_shareable' }], payment_provider: 'unknown' },
  ])('rejects unsafe or caller-owned cart input %j', (cart) => {
    expect(devcon26TicketCartSchema.safeParse(cart).success).toBe(false);
  });
});

describe('DevCon26 ticket pricing and providers', () => {
  it('calculates the subtotal through the PostgreSQL integer amount boundary', () => {
    const maximumSubtotal = devcon26TicketSubtotalMinor(DEVCON26_MAX_TICKETS_FOR_INTEGER_AMOUNT);

    expect(DEVCON26_MAX_TICKETS_FOR_INTEGER_AMOUNT)
      .toBe(Math.floor(2_147_483_647 / DEVCON26_TICKET_UNIT_PRICE_MINOR));
    expect(maximumSubtotal).toBe(DEVCON26_MAX_TICKETS_FOR_INTEGER_AMOUNT * DEVCON26_TICKET_UNIT_PRICE_MINOR);
    expect(maximumSubtotal).toBeLessThanOrEqual(2_147_483_647);
    expect(maximumSubtotal + DEVCON26_TICKET_UNIT_PRICE_MINOR).toBeGreaterThan(2_147_483_647);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, DEVCON26_MAX_TICKETS_FOR_INTEGER_AMOUNT + 1])
  ('rejects an invalid subtotal quantity %s', (quantity) => {
    expect(() => devcon26TicketSubtotalMinor(quantity)).toThrow('Invalid ticket quantity.');
  });

  it('publishes the supported payment provider catalog', () => {
    expect(devcon26AvailablePaymentProviders()).toEqual([{ key: 'paystack', name: 'Paystack' }]);
  });
});

describe('flexible checkout request', () => {
  const checkout = {
    checkout_request_key: randomUUID(),
    purchaser_name: 'Ada Example',
    purchaser_email: 'ADA@example.test',
    cart: { quantity: 1, allocations: [{ kind: 'self' }] },
  };

  it('normalizes the buyer and defaults to the only active provider', () => {
    expect(devcon26FlexibleCheckoutInitializeSchema.parse(checkout)).toEqual({
      ...checkout,
      purchaser_email: 'ada@example.test',
      cart: { ...checkout.cart, payment_provider: 'paystack' },
    });
  });

  it('rejects caller-owned totals and unsupported providers', () => {
    expect(devcon26FlexibleCheckoutInitializeSchema.safeParse({ ...checkout, amount_minor: 15_000 }).success).toBe(false);
    expect(devcon26FlexibleCheckoutInitializeSchema.safeParse({
      ...checkout,
      cart: { ...checkout.cart, payment_provider: 'unknown' },
    }).success).toBe(false);
  });
});
