import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  annualConferencePaymentConfiguration,
  parseVerifiedPaystackCharge,
  verifyPaystackWebhookSignature,
} from '@/lib/annual-conference-ticket-payments';

describe('annual conference ticket payment adapter', () => {
  it('is disabled unless the provider, explicit switch, and server secret are all configured', () => {
    expect(annualConferencePaymentConfiguration({})).toMatchObject({ enabled: false, provider: null });
    expect(annualConferencePaymentConfiguration({ DEVCON26_PAYMENT_PROVIDER: 'paystack', PAYSTACK_SECRET_KEY: 'sk_test' })).toMatchObject({ enabled: false });
    expect(annualConferencePaymentConfiguration({ DEVCON26_PAYMENT_PROVIDER: 'paystack', DEVCON26_PAYMENTS_ENABLED: 'true', PAYSTACK_SECRET_KEY: 'sk_test' })).toMatchObject({ enabled: true, provider: 'paystack' });
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
