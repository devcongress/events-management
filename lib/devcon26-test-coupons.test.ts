import { describe, expect, it } from 'vitest';
import { createDevcon26TestCouponSchema, devcon26CouponError, devcon26TestQuoteForSession } from '@/lib/devcon26-test-coupons';
import { devcon26TestInitializeSchema, devcon26TestQuoteSchema } from '@/lib/devcon26-test-checkout';

const coupon = {
  code: ' TEST-COUPON ', discount_type: 'fixed_minor', discount_value: 1000,
  eligible_tiers: ['regular', 'team_3'], expires_at: '2099-12-19T23:00:00Z', max_completed: 5,
};
const buyer = {
  tier_key: 'regular', checkout_request_key: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  purchaser_name: ' Ada Lovelace ', purchaser_email: ' ADA@example.test ', coupon_code: ' test-coupon ',
};

describe('test coupon input and public summaries', () => {
  it('normalizes code and buyer fields once and accepts a quote without buyer PII', () => {
    expect(devcon26TestInitializeSchema.parse(buyer)).toMatchObject({
      purchaser_name: 'Ada Lovelace', purchaser_email: 'ada@example.test', coupon_code: 'TEST-COUPON',
    });
    expect(devcon26TestQuoteSchema.parse({ tier_key: 'regular', coupon_code: 'test-coupon' }))
      .toEqual({ tier_key: 'regular', coupon_code: 'TEST-COUPON' });
    expect(devcon26TestQuoteSchema.safeParse({ ...buyer }).success).toBe(false);
  });

  it.each([
    { purchaser_name: '' }, { purchaser_name: 'a'.repeat(161) }, { purchaser_name: 'Ada\nLovelace' },
    { purchaser_email: 'invalid' }, { coupon_code: '' }, { coupon_code: 'x'.repeat(49) },
    { coupon_code: '<script>' }, { amount_minor: 1 }, { discount_amount_minor: 1 }, { quantity: 99 },
  ])('rejects invalid or caller-owned checkout input %j', (override) => {
    expect(devcon26TestInitializeSchema.safeParse({ ...buyer, ...override }).success).toBe(false);
  });

  it.each([
    { discount_value: 19_999 }, { discount_value: 0 }, { discount_value: -1 },
    { discount_type: 'percentage_bps', discount_value: 10_000 },
    { discount_type: 'percentage_bps', discount_value: 12_000 },
    { eligible_tiers: [] }, { eligible_tiers: ['regular', 'regular'] },
    { expires_at: '2000-01-01T00:00:00Z' }, { enabled: false }, { edition_year: 2027 },
  ])('rejects unsafe coupon terms %j', (override) => {
    expect(createDevcon26TestCouponSchema.safeParse({ ...coupon, ...override }).success).toBe(false);
  });

  it('supports a fixed discount above regular price only when regular passes are excluded', () => {
    expect(createDevcon26TestCouponSchema.safeParse({ ...coupon, eligible_tiers: ['team_5'], discount_value: 30_000 }).success).toBe(true);
    expect(createDevcon26TestCouponSchema.safeParse({ ...coupon, discount_type: 'percentage_bps', discount_value: 1 }).success).toBe(true);
  });

  it('redacts purchaser details and exposes only bounded coupon errors', () => {
    const summary = devcon26TestQuoteForSession({
      ...buyer, tier_key: 'regular', quantity: 1, currency: 'GHS',
      amount_minor: 18_999, base_amount_minor: 19_999, discount_amount_minor: 1000, coupon_code: 'TEST-COUPON',
    });

    expect(summary).toEqual({ mode: 'test', tier_key: 'regular', quantity: 1, currency: 'GHS',
      base_amount_minor: 19_999, discount_amount_minor: 1000, final_amount_minor: 18_999, coupon_applied: 'TEST-COUPON' });
    expect(JSON.stringify(summary)).not.toMatch(/Lovelace|example\.test|purchaser/);
    expect(devcon26CouponError(new Error('test_coupon_ineligible private details'))).toEqual({
      error: 'This coupon does not apply to this pass.', coupon_error: 'ineligible',
    });
    expect(devcon26CouponError(new Error('database connection private details'))).toBeNull();
  });
});
