import { describe, expect, it } from 'vitest';
import {
  createDevcon26FlexibleCheckoutGrant,
  verifyDevcon26FlexibleCheckoutGrant,
} from './devcon26-flexible-checkout-grant';

const input = {
  orderId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  verifier: 'x'.repeat(43),
  origin: 'https://devcongress.org',
  secretKey: 'sk_live_fixture',
  now: 1_790_000_000_000,
};

describe('flexible checkout verification grant', () => {
  it('binds payment verification to its order, origin, secret and short-lived verifier', () => {
    const grant = createDevcon26FlexibleCheckoutGrant(input);

    expect(verifyDevcon26FlexibleCheckoutGrant({ grant, ...input })).toMatchObject({
      order_id: input.orderId,
      origin: input.origin,
    });
    expect(verifyDevcon26FlexibleCheckoutGrant({ grant, ...input, verifier: 'y'.repeat(43) })).toBeNull();
    expect(verifyDevcon26FlexibleCheckoutGrant({ grant, ...input, origin: 'https://attacker.example' })).toBeNull();
    expect(verifyDevcon26FlexibleCheckoutGrant({ grant, ...input, secretKey: 'sk_live_other' })).toBeNull();
    expect(verifyDevcon26FlexibleCheckoutGrant({ grant, ...input, now: input.now + 86_400_000 })).toBeNull();
  });
});
