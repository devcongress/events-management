import crypto from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  annualConferencePaymentConfiguration,
  parseVerifiedPaystackCharge,
  verifyPaystackWebhookSignature,
  verifyPaystackTransaction,
} from '@/lib/annual-conference-ticket-payments';

describe('annual conference ticket payment adapter', () => {
  it('is disabled unless the provider, explicit switch, and server secret are all configured', () => {
    expect(annualConferencePaymentConfiguration({})).toMatchObject({ enabled: false, provider: null });
    expect(annualConferencePaymentConfiguration({ DEVCON26_PAYMENT_PROVIDER: 'paystack', PAYSTACK_SECRET_KEY: 'sk_test' })).toMatchObject({ enabled: false });
    expect(annualConferencePaymentConfiguration({ DEVCON26_PAYMENT_PROVIDER: 'paystack', DEVCON26_PAYMENTS_ENABLED: 'true', PAYSTACK_SECRET_KEY: 'sk_live_fixture' })).toMatchObject({ enabled: true, provider: 'paystack' });
  });

  it.each(['sk_test_fixture', 'sk_live_', 'invalid-key'])('rejects %s in the live payment configuration', (secretKey) => {
    expect(annualConferencePaymentConfiguration({
      DEVCON26_PAYMENT_PROVIDER: 'paystack',
      DEVCON26_PAYMENTS_ENABLED: 'true',
      PAYSTACK_SECRET_KEY: secretKey,
    })).toEqual({ enabled: false, provider: null, secretKey: null });
  });

  it('rejects test credentials before calling the live verification provider', async () => {
    const fetcher = vi.fn();

    await expect(verifyPaystackTransaction({ secretKey: 'sk_test_fixture', paymentReference: 'devcon26_fixture', fetcher: fetcher as unknown as typeof fetch })).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each(['test', undefined])('rejects successful live-order verification with provider domain %s', async (domain) => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ status: true, data: {
      id: 123, reference: 'devcon26_fixture', amount: 19_999, currency: 'GHS', status: 'success', domain,
    } })));

    await expect(verifyPaystackTransaction({ secretKey: 'sk_live_fixture', paymentReference: 'devcon26_fixture', fetcher: fetcher as unknown as typeof fetch })).rejects.toThrow();
  });

  it('accepts successful live-order verification only with live credentials and provider domain', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ status: true, data: {
      id: 123, reference: 'devcon26_fixture', amount: 19_999, currency: 'GHS', status: 'success', domain: 'live',
    } })));

    await expect(verifyPaystackTransaction({ secretKey: 'sk_live_fixture', paymentReference: 'devcon26_fixture', fetcher: fetcher as unknown as typeof fetch })).resolves.toMatchObject({
      paymentReference: 'devcon26_fixture', amountMinor: 19_999, currency: 'GHS', facts: { domain: 'live' },
    });
  });

  it('only accepts a signed successful charge payload and preserves its server-verifiable facts', () => {
    const rawBody = JSON.stringify({ event: 'charge.success', data: { id: 123, reference: 'devcon26_abc', amount: 19_999, currency: 'GHS', status: 'success', metadata: { order_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } } });
    const signature = crypto.createHmac('sha512', 'test-secret').update(rawBody).digest('hex');

    expect(verifyPaystackWebhookSignature(rawBody, signature, 'test-secret')).toBe(true);
    expect(verifyPaystackWebhookSignature(rawBody, '00', 'test-secret')).toBe(false);
    expect(parseVerifiedPaystackCharge(rawBody)).toMatchObject({ paymentReference: 'devcon26_abc' });
    expect(parseVerifiedPaystackCharge(JSON.stringify({ event: 'charge.failed', data: {} }))).toBeNull();
  });
});
