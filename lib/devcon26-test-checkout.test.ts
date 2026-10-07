import { describe, expect, it } from 'vitest';
import {
  devcon26TestCheckoutConfiguration, devcon26TestInitializeSchema, isDevcon26TestCheckoutRequest,
} from '@/lib/devcon26-test-checkout';

const environment = {
  NODE_ENV: 'production', DEVCON26_TEST_CHECKOUT_ENABLED: 'true', DEVCON26_PAYMENT_PROVIDER: 'paystack',
  PAYSTACK_SECRET_KEY: 'sk_test_fixture', DEVCON26_TEST_BUYER_EMAIL: 'sandbox@example.com',
  PUBLIC_WEBSITE_ORIGIN: 'https://devcongress.org',
};

describe('DevCon26 sandbox boundary', () => {
  it('requires an explicit independent gate, test key, inbox, and trusted HTTPS return origin', () => {
    expect(devcon26TestCheckoutConfiguration(environment)?.callbackUrl).toBe('https://devcongress.org/devcon26/?test_checkout=return');

    for (const override of [
      { DEVCON26_TEST_CHECKOUT_ENABLED: 'false' }, { PAYSTACK_SECRET_KEY: 'sk_live_fixture' },
      { PAYSTACK_SECRET_KEY: 'sk_test_' }, { DEVCON26_TEST_BUYER_EMAIL: '' },
      { PUBLIC_WEBSITE_ORIGIN: '' }, { PUBLIC_WEBSITE_ORIGIN: 'http://devcongress.org' },
      { PUBLIC_WEBSITE_ORIGIN: 'https://user:password@devcongress.org' },
      { PUBLIC_WEBSITE_ORIGIN: 'https://devcongress.org/evil?next=x' },
      { PUBLIC_WEBSITE_ORIGIN: 'https://localhost' },
    ]) expect(devcon26TestCheckoutConfiguration({ ...environment, ...override })).toBeNull();
  });

  it('allows a loopback return only in explicit development mode', () => {
    expect(devcon26TestCheckoutConfiguration({ ...environment, NODE_ENV: 'development', PUBLIC_WEBSITE_ORIGIN: 'http://localhost:4321' })?.websiteOrigin).toBe('http://localhost:4321');
    expect(devcon26TestCheckoutConfiguration({ ...environment, PUBLIC_WEBSITE_ORIGIN: 'http://localhost:4321' })).toBeNull();
  });

  it('cannot accept browser prices, identities, quantities, callback URLs, or unknown tiers', () => {
    const input = { tier_key: 'regular', checkout_request_key: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' };

    expect(devcon26TestInitializeSchema.safeParse(input).success).toBe(true);

    for (const extra of ['amount', 'amount_minor', 'quantity', 'email', 'currency', 'callback_url']) {
      expect(devcon26TestInitializeSchema.safeParse({ ...input, [extra]: 'attacker-value' }).success).toBe(false);
    }

    expect(devcon26TestInitializeSchema.safeParse({ ...input, tier_key: 'free' }).success).toBe(false);
  });

  it('only opens the exact sandbox route/method set, never owner or neighboring endpoints', () => {
    const base = '/api/public/annual-conference/2026/test-checkout';

    expect(isDevcon26TestCheckoutRequest(base, 'GET')).toBe(true);
    expect(isDevcon26TestCheckoutRequest(`${base}/initialize`, 'POST')).toBe(true);
    expect(isDevcon26TestCheckoutRequest('/api/webhooks/paystack/devcon26-test', 'POST')).toBe(true);

    for (const path of [base, `${base}/initialize/more`, '/api/annual-conference/2026/ticketing', '/api/webhooks/paystack']) {
      expect(isDevcon26TestCheckoutRequest(path, 'PATCH')).toBe(false);
      expect(isDevcon26TestCheckoutRequest(path, 'POST')).toBe(false);
    }
  });
});
