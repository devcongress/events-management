import { describe, expect, it } from 'vitest';
import {
  devcon26PublicCheckoutConfiguration,
  devcon26PublicCheckoutOriginConfiguration,
  devcon26PublicCheckoutVerifySchema,
} from './devcon26-public-checkout';

const enabledEnvironment = {
  DEVCON26_PUBLIC_CHECKOUT_ENABLED: 'true',
  DEVCON26_PAYMENT_PROVIDER: 'paystack',
  DEVCON26_PAYMENTS_ENABLED: 'true',
  PAYSTACK_SECRET_KEY: 'sk_live_fixture',
  PUBLIC_WEBSITE_ORIGIN: 'https://devcongress.org',
  DEVCON26_PUBLIC_CHECKOUT_ORIGINS: 'https://preview.example.test',
};

describe('DevCon26 public checkout boundary', () => {
  it('stays unavailable unless both public checkout and live payment gates are enabled', () => {
    expect(devcon26PublicCheckoutConfiguration({ ...enabledEnvironment, DEVCON26_PUBLIC_CHECKOUT_ENABLED: 'false' })).toBeNull();
    expect(devcon26PublicCheckoutConfiguration({ ...enabledEnvironment, DEVCON26_PAYMENTS_ENABLED: 'false' })).toBeNull();
    expect(devcon26PublicCheckoutConfiguration({ ...enabledEnvironment, PAYSTACK_SECRET_KEY: 'sk_test_fixture' })).toBeNull();
  });

  it('allows only explicitly configured HTTPS origins and builds a fixed callback URL', () => {
    const configuration = devcon26PublicCheckoutConfiguration(enabledEnvironment);

    expect(configuration).not.toBeNull();
    expect(devcon26PublicCheckoutOriginConfiguration(configuration!, 'https://preview.example.test')?.callbackUrl)
      .toBe('https://preview.example.test/devcon26/payment-confirmation/');
    expect(devcon26PublicCheckoutOriginConfiguration(configuration!, 'https://not-approved.example')).toBeNull();
  });

  it('requires the live browser verifier on callback exchange', () => {
    expect(devcon26PublicCheckoutVerifySchema.safeParse({ reference: 'devcon26_0123456789abcdef0123456789abcdef', buyer_grant: 'a'.repeat(40) }).success).toBe(false);
    expect(devcon26PublicCheckoutVerifySchema.safeParse({
      reference: 'devcon26_0123456789abcdef0123456789abcdef',
      buyer_grant: 'a'.repeat(40),
      buyer_verifier: 'x'.repeat(43),
    }).success).toBe(true);
  });
});
