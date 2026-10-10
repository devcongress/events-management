import { z } from 'zod';
import type { AnnualConferenceTicketTierKey } from '@/lib/annual-conference-ticketing';

export interface Devcon26TestQuote {
  mode: 'test';
  tier_key: AnnualConferenceTicketTierKey;
  quantity: number;
  currency: 'GHS';
  base_amount_minor: number;
  discount_amount_minor: number;
  final_amount_minor: number;
  coupon_applied: string | null;
}

export const createDevcon26TestCouponSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{3,48}$/, 'Use 3–48 letters, numbers, or hyphens.'),
  discount_type: z.enum(['fixed_minor', 'percentage_bps']),
  discount_value: z.number().int().positive(),
  eligible_tiers: z.array(z.enum(['regular', 'team_3', 'team_5'])).min(1).max(3),
  expires_at: z.string().datetime({ offset: true }),
  max_completed: z.number().int().min(1).max(1_000_000),
}).strict().superRefine((coupon, context) => {
  const lowestPrice = Math.min(...coupon.eligible_tiers.map((tier) => (
    tier === 'regular' ? 19_999 : tier === 'team_3' ? 54_999 : 84_999
  )));

  if ((coupon.discount_type === 'percentage_bps' && coupon.discount_value >= 10_000)
    || (coupon.discount_type === 'fixed_minor' && coupon.discount_value >= lowestPrice)) {
    context.addIssue({ code: 'custom', path: ['discount_value'], message: 'The discount must leave a positive payment for every eligible pass.' });
  }
  if (new Set(coupon.eligible_tiers).size !== coupon.eligible_tiers.length) {
    context.addIssue({ code: 'custom', path: ['eligible_tiers'], message: 'Choose each eligible pass once.' });
  }
  if (Date.parse(coupon.expires_at) <= Date.now()) {
    context.addIssue({ code: 'custom', path: ['expires_at'], message: 'Choose a future expiry.' });
  }
});

export type Devcon26TestCouponInput = z.infer<typeof createDevcon26TestCouponSchema>;
export interface Devcon26TestCoupon {
  id: string;
  code: string;
  discount_type: 'fixed_minor' | 'percentage_bps';
  discount_value: number;
  eligible_tiers: AnnualConferenceTicketTierKey[];
  expires_at: string;
  max_completed: number;
  enabled: boolean;
  completed: number;
  active_holds: number;
  remaining: number;
  exceptions: number;
  created_at: string;
}

export interface Devcon26TestCheckoutLedgerRow {
  id: string;
  payment_reference: string;
  purchaser_name: string | null;
  purchaser_email: string | null;
  tier_key: AnnualConferenceTicketTierKey;
  quantity: number;
  coupon_code: string | null;
  base_amount_minor: number;
  discount_amount_minor: number;
  amount_minor: number;
  currency: 'GHS';
  status: 'prepared' | 'initialized' | 'verified' | 'rejected' | 'refund_required';
  resolution_reason: string | null;
  expires_at: string;
  verified_at: string | null;
  created_at: string;
}

export interface Devcon26TestCouponsResponse {
  coupons: Devcon26TestCoupon[];
  total: number;
  page: number;
  page_size: number;
  checkouts: Devcon26TestCheckoutLedgerRow[];
  checkout_total: number;
  checkout_page: number;
  checkout_page_size: number;
}

export function devcon26CouponError(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  const errors = {
    invalid: 'This coupon is invalid.',
    expired: 'This coupon has expired.',
    ineligible: 'This coupon does not apply to this pass.',
    unavailable: 'This coupon is not available right now.',
  } as const;
  const code = (Object.keys(errors) as Array<keyof typeof errors>).find((key) => message.includes(`test_coupon_${key}`));

  return code ? { error: errors[code], coupon_error: code } : null;
}

export function devcon26TestQuoteForSession(session: {
  tier_key: AnnualConferenceTicketTierKey;
  quantity: number;
  currency: 'GHS';
  amount_minor: number;
  base_amount_minor: number;
  discount_amount_minor: number;
  coupon_code: string | null;
}): Devcon26TestQuote {
  return {
    mode: 'test', tier_key: session.tier_key, quantity: session.quantity, currency: session.currency,
    base_amount_minor: session.base_amount_minor, discount_amount_minor: session.discount_amount_minor,
    final_amount_minor: session.amount_minor, coupon_applied: session.coupon_code,
  };
}
