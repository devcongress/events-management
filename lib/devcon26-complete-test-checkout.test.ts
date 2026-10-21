import { describe, expect, it } from 'vitest';
import { completeTestConfiguration } from './devcon26-complete-test-checkout';
import { devcon26PublicCheckoutConfiguration } from './devcon26-public-checkout';

const env = {
  DEVCON26_COMPLETE_TEST_ENABLED: 'true',
  DEVCON26_COMPLETE_TEST_ORIGIN: 'https://preview-site.account.workers.dev',
  PAYSTACK_TEST_SECRET_KEY: 'sk_test_fixture',
};

describe('complete test checkout configuration', () => {
  it('requires an explicit preview and a test key', () => {
    expect(completeTestConfiguration(env)?.origin).toBe(env.DEVCON26_COMPLETE_TEST_ORIGIN);

    for (const invalid of [
      { DEVCON26_COMPLETE_TEST_ENABLED: 'false' },
      { PAYSTACK_TEST_SECRET_KEY: 'sk_live_fixture' },
      { DEVCON26_COMPLETE_TEST_ORIGIN: 'https://devcongress.org' },
      { DEVCON26_COMPLETE_TEST_ORIGIN: 'https://preview-site.account.workers.dev/anything' },
      { DEVCON26_COMPLETE_TEST_ORIGIN: 'https://*.workers.dev' },
    ]) expect(completeTestConfiguration({ ...env, ...invalid })).toBeNull();
  });

  it('does not activate the live checkout path', () => {
    expect(devcon26PublicCheckoutConfiguration({ ...env, PAYSTACK_SECRET_KEY: 'sk_test_fixture',
      DEVCON26_PUBLIC_CHECKOUT_ENABLED: 'true', DEVCON26_PAYMENTS_ENABLED: 'true',
      DEVCON26_PAYMENT_PROVIDER: 'paystack', PUBLIC_WEBSITE_ORIGIN: 'https://devcongress.org',
    })).toBeNull();
  });
});
