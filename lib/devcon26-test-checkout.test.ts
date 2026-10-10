import { describe, expect, it } from 'vitest';
import {
  devcon26TestCheckoutConfiguration, devcon26TestInitializeSchema, isDevcon26TestCheckoutRequest,
  devcon26TestCheckoutOriginConfiguration, devcon26TestCheckoutRequestKey,
} from '@/lib/devcon26-test-checkout';

const environment = {
  NODE_ENV: 'production', DEVCON26_TEST_CHECKOUT_ENABLED: 'true', DEVCON26_PAYMENT_PROVIDER: 'paystack',
  PAYSTACK_SECRET_KEY: 'sk_test_fixture', DEVCON26_TEST_BUYER_EMAIL: 'sandbox@example.com',
  PUBLIC_WEBSITE_ORIGIN: 'https://devcongress.org',
};
const previewOrigin = 'https://feature-devcon26-public-checkout-devcongress-website.admins-a7d.workers.dev';
const commitOrigin = 'https://63b14d94-devcongress-website.admins-a7d.workers.dev';

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

  it('adds only exact preview origins while preserving the main-site default', () => {
    const configuration = devcon26TestCheckoutConfiguration({
      ...environment, DEVCON26_TEST_CHECKOUT_ORIGINS: `${previewOrigin}, ${commitOrigin},${previewOrigin}`,
    })!;

    expect(configuration.allowedOrigins).toEqual(['https://devcongress.org', previewOrigin, commitOrigin]);

    for (const origin of configuration.allowedOrigins) {
      expect(devcon26TestCheckoutOriginConfiguration(configuration, origin)?.callbackUrl)
        .toBe(`${origin}/devcon26/?test_checkout=return`);
    }

    for (const origin of [undefined, '', 'null', 'https://attacker.example', `${previewOrigin}.attacker.example`, `${previewOrigin}/`]) {
      expect(devcon26TestCheckoutOriginConfiguration(configuration, origin)).toBeNull();
    }

    expect(devcon26TestCheckoutConfiguration({ ...environment, DEVCON26_TEST_CHECKOUT_ORIGINS: '' })?.allowedOrigins)
      .toEqual(['https://devcongress.org']);
  });

  it.each([
    '*', 'https://*.workers.dev', 'http://preview.example', 'https://user:password@preview.example',
    'https://preview.example/route', 'https://preview.example?next=x', 'https://preview.example#return',
    'null', 'https://localhost', 'https://127.0.0.1', 'https://[::1]', 'https://PREVIEW.example',
    'https://preview.example/', 'https://preview.example:443', `${previewOrigin},`, `,${previewOrigin}`,
  ])('fails closed for a malformed sandbox origin list: %s', (origin) => {
    expect(devcon26TestCheckoutConfiguration({ ...environment, DEVCON26_TEST_CHECKOUT_ORIGINS: origin })).toBeNull();
  });

  it('namespaces retry UUIDs by origin without changing stable same-origin retries', () => {
    const requestKey = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const scopedKey = devcon26TestCheckoutRequestKey(previewOrigin, requestKey);

    expect(scopedKey).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-8[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
    expect(devcon26TestCheckoutRequestKey(previewOrigin, requestKey)).toBe(scopedKey);
    expect(devcon26TestCheckoutRequestKey(commitOrigin, requestKey)).not.toBe(scopedKey);
    expect(devcon26TestCheckoutRequestKey(previewOrigin, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')).not.toBe(scopedKey);
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
