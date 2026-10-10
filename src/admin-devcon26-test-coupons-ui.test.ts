import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./components/Devcon26TestCoupons.vue', import.meta.url), 'utf8');
const ticketing = readFileSync(new URL('./views/admin/AdminAnnualConferenceTicketingView.vue', import.meta.url), 'utf8');

describe('Owner test coupon interface boundary', () => {
  it('keeps coupon operations on the 2026 Owner Ticketing page with test-only copy', () => {
    expect(ticketing).toContain('<Devcon26TestCoupons v-if="year === \'2026\'" :year="year" />');
    expect(source).toContain('Test checkout coupons');
    expect(source).toContain('These checkouts do not issue admission tickets.');
    expect(source).not.toMatch(/deleteDevcon26|update.*Discount|PAYSTACK_SECRET_KEY|sk_test_/);
  });

  it('labels every coupon input, announces outcomes, and focuses the invalid field', () => {
    for (const id of ['code', 'type', 'discount', 'max', 'expiry']) {
      expect(source).toContain(`for="test-coupon-${id}"`);
      expect(source).toContain(`id="test-coupon-${id}"`);
    }
    expect(source).toContain('<legend class="editorial-label">Eligible passes</legend>');
    expect(source).toContain('role="alert"');
    expect(source).toContain('role="status"');
    expect(source).toContain('?.focus()');
  });

  it('shows frozen terms, redemption health, and a paginated private purchaser ledger', () => {
    for (const label of ['Terms cannot be edited', 'Completed / maximum', 'Active holds', 'Remaining uses', 'Needs attention', 'View purchaser and checkout ID']) {
      expect(source).toContain(label);
    }
    expect(source).toContain('checkoutPageCount');
    expect(source).toContain('pageCount');
    expect(source).toContain('toggleDevcon26TestCoupon(props.year, coupon.id, !coupon.enabled)');
  });
});
