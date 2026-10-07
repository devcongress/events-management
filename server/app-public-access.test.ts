import crypto from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as ticketingStorage from '@/lib/supabase/annual-conference-ticketing';
import app, { isUnauthenticatedApiRequest } from './app';

const liveSecret = 'sk_live_fixture';
const paymentReference = 'devcon26_fixture';
const orderId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function configureLiveWebhook(secretKey = liveSecret) {
  vi.stubEnv('DEVCON26_PAYMENTS_ENABLED', 'true');
  vi.stubEnv('DEVCON26_PAYMENT_PROVIDER', 'paystack');
  vi.stubEnv('PAYSTACK_SECRET_KEY', secretKey);
}

function webhookRequest(secretKey = liveSecret) {
  const rawBody = JSON.stringify({ event: 'charge.success', data: {
    id: 123, reference: paymentReference, amount: 19_999, currency: 'GHS', status: 'success',
  } });
  const signature = crypto.createHmac('sha512', secretKey).update(rawBody).digest('hex');

  return app.request('https://ems.example/api/webhooks/paystack', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-paystack-signature': signature },
    body: rawBody,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('public API access policy', () => {
  it('allows only the signed provider webhook POST without opening organizer ticketing', () => {
    expect(isUnauthenticatedApiRequest('/api/webhooks/paystack', 'POST')).toBe(true);
    expect(isUnauthenticatedApiRequest('/api/webhooks/paystack', 'GET')).toBe(false);
    expect(isUnauthenticatedApiRequest('/api/webhooks/paystack', 'PATCH')).toBe(false);
    expect(isUnauthenticatedApiRequest('/api/webhooks/paystack/other', 'POST')).toBe(false);
    expect(isUnauthenticatedApiRequest('/api/annual-conference/2026/ticketing', 'GET')).toBe(false);
  });

  it('allows the public volunteer follow-up test form without opening the owner campaign API', () => {
    const testFormPath = '/api/annual-conference/2026/volunteer-follow-up/test';

    expect(isUnauthenticatedApiRequest(testFormPath, 'GET')).toBe(true);
    expect(isUnauthenticatedApiRequest(testFormPath, 'POST')).toBe(true);
    expect(isUnauthenticatedApiRequest(testFormPath, 'PATCH')).toBe(false);
    expect(
      isUnauthenticatedApiRequest('/api/annual-conference/2026/volunteer-follow-up', 'GET'),
    ).toBe(false);
  });
});

describe('live Paystack webhook boundary', () => {
  it.each([false, true])('rejects oversized webhook bodies before signature verification (signed: %s)', async (signed) => {
    configureLiveWebhook();

    const rawBody = JSON.stringify({ padding: 'x'.repeat(64 * 1024) });
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };

    if (signed) {
      headers['x-paystack-signature'] = crypto.createHmac('sha512', liveSecret).update(rawBody).digest('hex');
    }

    const response = await app.request('https://ems.example/api/webhooks/paystack', {
      method: 'POST', headers, body: rawBody,
    });

    expect(response.status).toBe(413);
  });

  it('reaches raw-signature verification without an organizer session', async () => {
    configureLiveWebhook();

    const response = await app.request('https://ems.example/api/webhooks/paystack', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Invalid webhook signature.' });
  });

  it('keeps test credentials out of the live webhook even when the live flag is enabled', async () => {
    configureLiveWebhook('sk_test_fixture');

    expect((await webhookRequest('sk_test_fixture')).status).toBe(404);
  });

  it.each(['test', 'live'])('uses provider-verified %s mode before live order confirmation', async (domain) => {
    configureLiveWebhook();
    vi.spyOn(ticketingStorage, 'getSupabaseAnnualConferenceTicketPaymentAttempt').mockResolvedValue({
      order_id: orderId, provider: 'paystack', payment_reference: paymentReference,
    });

    const confirmation = vi.spyOn(ticketingStorage, 'confirmSupabaseAnnualConferenceTicketPayment').mockResolvedValue({
      id: orderId, status: 'paid', quantity: 1, amount_minor: 19_999, currency: 'GHS',
    });

    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status: true, data: {
      id: 123, reference: paymentReference, amount: 19_999, currency: 'GHS', status: 'success', domain,
    } }))));

    const response = await webhookRequest();

    if (domain === 'test') {
      expect(response.status).toBe(500);
      expect(confirmation).not.toHaveBeenCalled();

      return;
    }

    expect(response.status).toBe(204);
    expect(confirmation).toHaveBeenCalledWith(expect.objectContaining({
      orderId, amountMinor: 19_999, currency: 'GHS', paymentFacts: expect.objectContaining({ domain: 'live' }),
    }), expect.anything());
  });
});
