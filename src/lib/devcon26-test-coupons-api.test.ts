import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchDevcon26TestCoupons } from './api';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Independent coupon and checkout pagination requests', () => {
  it('requests five checkouts per page without changing the eight-coupon page size', async () => {
    const requests: URL[] = [];
    const fetchMock = vi.fn(async (input: string, _options?: RequestInit) => {
      const url = new URL(input, 'http://localhost');
      const checkoutPage = Number(url.searchParams.get('checkout_page'));
      const checkoutPageSize = Number(url.searchParams.get('checkout_page_size'));
      const offset = (checkoutPage - 1) * checkoutPageSize;
      const checkouts = Array.from({ length: 11 }, (_, index) => ({ id: `checkout-${index + 1}` }));

      requests.push(url);

      return new Response(JSON.stringify({
        coupons: [], total: 20,
        page: Number(url.searchParams.get('page')), page_size: Number(url.searchParams.get('page_size')),
        checkouts: checkouts.slice(offset, offset + checkoutPageSize),
        checkout_total: checkouts.length, checkout_page: checkoutPage, checkout_page_size: checkoutPageSize,
      }), { status: 200 });
    });

    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('window', { setTimeout, clearTimeout });
    const first = await fetchDevcon26TestCoupons('2026', 2, 1);
    const second = await fetchDevcon26TestCoupons('2026', 2, 2);
    const third = await fetchDevcon26TestCoupons('2026', 2, 3);
    const changedCouponPage = await fetchDevcon26TestCoupons('2026', 3, 3);

    expect(first.checkouts.map(({ id }) => id)).toEqual(['checkout-1', 'checkout-2', 'checkout-3', 'checkout-4', 'checkout-5']);
    expect(second.checkouts.map(({ id }) => id)).toEqual(['checkout-6', 'checkout-7', 'checkout-8', 'checkout-9', 'checkout-10']);
    expect(third.checkouts.map(({ id }) => id)).toEqual(['checkout-11']);
    expect(changedCouponPage.checkouts).toEqual(third.checkouts);
    expect(requests.map((url) => url.searchParams.get('page'))).toEqual(['2', '2', '2', '3']);
    expect(requests.map((url) => url.searchParams.get('checkout_page'))).toEqual(['1', '2', '3', '3']);
    for (const url of requests) {
      expect(url.pathname).toBe('/api/annual-conference/2026/ticketing/test-coupons');
      expect(url.searchParams.get('page_size')).toBe('8');
      expect(url.searchParams.get('checkout_page_size')).toBe('5');
    }
    for (const [, options] of fetchMock.mock.calls) {
      expect(options?.credentials).toBe('include');
    }
  });
});
