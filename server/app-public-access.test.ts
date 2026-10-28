import crypto from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as ticketingStorage from '@/lib/supabase/annual-conference-ticketing';
import * as paymentProvider from '@/lib/annual-conference-ticket-payments';
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
    const socialCardSlug = 'a'.repeat(32);

    const socialCardBase = '/api/public/annual-conference/2026/social-cards';

    expect(isUnauthenticatedApiRequest(`${socialCardBase}/manage`, 'GET')).toBe(true);
    expect(isUnauthenticatedApiRequest(`${socialCardBase}/manage`, 'PATCH')).toBe(true);
    expect(isUnauthenticatedApiRequest(`${socialCardBase}/manage/photo`, 'GET')).toBe(true);
    expect(isUnauthenticatedApiRequest(`${socialCardBase}/manage/photo`, 'POST')).toBe(true);
    expect(isUnauthenticatedApiRequest(`${socialCardBase}/manage/publish`, 'PATCH')).toBe(true);
    expect(isUnauthenticatedApiRequest(`${socialCardBase}/manage/revoke`, 'PATCH')).toBe(true);
    expect(isUnauthenticatedApiRequest(`${socialCardBase}/collection`, 'GET')).toBe(true);
    expect(isUnauthenticatedApiRequest(`${socialCardBase}/collection/seats/3`, 'PATCH')).toBe(true);
    expect(isUnauthenticatedApiRequest(`${socialCardBase}/collection/seats/3/photo`, 'POST')).toBe(true);
    expect(isUnauthenticatedApiRequest(`${socialCardBase}/collection/seats/3/photo`, 'GET')).toBe(true);
    expect(isUnauthenticatedApiRequest(`${socialCardBase}/${socialCardSlug}`, 'GET')).toBe(true);
    expect(isUnauthenticatedApiRequest(`${socialCardBase}/${socialCardSlug}/image`, 'GET')).toBe(true);
    expect(isUnauthenticatedApiRequest(`${socialCardBase}/manage`, 'POST')).toBe(false);
    expect(isUnauthenticatedApiRequest(`${socialCardBase}/manage/photo`, 'PATCH')).toBe(false);
    expect(isUnauthenticatedApiRequest(`${socialCardBase}/${socialCardSlug}`, 'PATCH')).toBe(false);
    expect(isUnauthenticatedApiRequest(`${socialCardBase}/too-short`, 'GET')).toBe(false);
    expect(isUnauthenticatedApiRequest('/api/annual-conference/2026/social-cards/deliveries', 'POST')).toBe(false);
    expect(isUnauthenticatedApiRequest('/api/internal/annual-conference-social-card-emails/retry', 'POST')).toBe(true);
    expect(isUnauthenticatedApiRequest('/api/internal/annual-conference-social-card-emails/retry', 'GET')).toBe(false);
  });

  it('allows anonymous access only to exact buyer checkout and paid-order card routes', () => {
    const checkoutBase = '/api/public/annual-conference/2026/checkout';
    const buyerCollection = '/api/public/annual-conference/2026/social-cards/buyer/collection';

    expect(isUnauthenticatedApiRequest(checkoutBase, 'GET')).toBe(true);
    expect(isUnauthenticatedApiRequest(`${checkoutBase}/quote`, 'POST')).toBe(true);
    expect(isUnauthenticatedApiRequest(`${checkoutBase}/initialize`, 'POST')).toBe(true);
    expect(isUnauthenticatedApiRequest(`${checkoutBase}/verify`, 'POST')).toBe(true);
    expect(isUnauthenticatedApiRequest(`${checkoutBase}/neighbor`, 'POST')).toBe(false);
    expect(isUnauthenticatedApiRequest(buyerCollection, 'GET')).toBe(true);
    expect(isUnauthenticatedApiRequest(`${buyerCollection}/seats/3`, 'PATCH')).toBe(true);
    expect(isUnauthenticatedApiRequest(`${buyerCollection}/seats/3/photo`, 'POST')).toBe(true);
    expect(isUnauthenticatedApiRequest(`${buyerCollection}/seats/3/photo`, 'GET')).toBe(true);
    expect(isUnauthenticatedApiRequest(`${buyerCollection}/seats/3/publish`, 'PATCH')).toBe(false);
    expect(isUnauthenticatedApiRequest(`${buyerCollection}/seats/3`, 'DELETE')).toBe(false);
  });

  it('keeps the public live checkout unavailable until the explicit activation flag is enabled', async () => {
    vi.stubEnv('DEVCON26_PUBLIC_CHECKOUT_ENABLED', 'false');
    const response = await app.request('https://ems.example/api/public/annual-conference/2026/checkout');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ mode: 'unavailable' });
  });

  it('allows social-card CORS only for the website origin without credentials', async () => {
    const path = '/api/public/annual-conference/2026/social-cards/manage';
    const allowed = await app.request(`https://ems.example${path}`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://devcongress.org',
        'Access-Control-Request-Method': 'PATCH',
        'Access-Control-Request-Headers': 'x-social-card-capability, x-social-card-collection-capability, content-type',
      },
    });

    expect(allowed.headers.get('access-control-allow-origin')).toBe('https://devcongress.org');
    expect(allowed.headers.get('access-control-allow-credentials')).toBeNull();
    expect(allowed.headers.get('access-control-allow-headers')).toContain('X-Social-Card-Capability');
    expect(allowed.headers.get('access-control-allow-headers')).toContain('X-Social-Card-Collection-Capability');

    const denied = await app.request(`https://ems.example${path}`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://other.example', 'Access-Control-Request-Method': 'PATCH' },
    });

    expect(denied.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('lets the shared-secret social-card sender reach its internal route without an organizer session', async () => {
    vi.stubEnv('SLACK_EVENTS_RETRY_SECRET', 'social-card-scheduled-retry-secret-at-least-32-bytes');

    const response = await app.request('https://ems.example/api/internal/annual-conference-social-card-emails/retry', {
      method: 'POST',
      headers: { 'x-scheduled-job-secret': 'social-card-scheduled-retry-secret-at-least-32-bytes' },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ configured: false, accepted: 0, failed: 0 });
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

describe('EMS-managed checkout application boundary', () => {
  const managedPath = '/api/public/annual-conference/2026/checkout/managed';
  const managedWebhook = '/api/webhooks/paystack/devcon26-managed';

  it('opens only the exact managed catalog, initialize, verify and signed webhook methods', () => {
    for (const [path, method] of [
      [managedPath, 'GET'], [`${managedPath}/initialize`, 'POST'],
      [`${managedPath}/verify`, 'POST'], [managedWebhook, 'POST'],
    ]) {
      expect(isUnauthenticatedApiRequest(path, method)).toBe(true);
    }
    for (const [path, method] of [
      [managedPath, 'POST'], [managedPath, 'HEAD'], [`${managedPath}/initialize`, 'GET'],
      [`${managedPath}/verify`, 'PATCH'], [`${managedPath}/neighbor`, 'POST'],
      [`${managedPath}/initialize/neighbor`, 'POST'], [managedWebhook, 'GET'],
      [`${managedWebhook}/neighbor`, 'POST'], ['/api/annual-conference/2026/registrations/payment-mode', 'GET'],
      ['/api/annual-conference/2026/registrations/payment-mode', 'PATCH'],
    ]) {
      expect(isUnauthenticatedApiRequest(path, method)).toBe(false);
    }
  });

  it('serves narrow managed preflights independently of legacy activation flags', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('PUBLIC_WEBSITE_ORIGIN', 'https://devcongress.org');
    vi.stubEnv('DEVCON26_PUBLIC_CHECKOUT_ORIGINS', 'https://devcongress.org,https://www.devcongress.org');
    vi.stubEnv('DEVCON26_PUBLIC_CHECKOUT_ENABLED', 'false');
    vi.stubEnv('DEVCON26_PAYMENTS_ENABLED', 'false');
    vi.stubEnv('DEVCON26_COMPLETE_TEST_ENABLED', 'false');

    for (const path of [managedPath, `${managedPath}/initialize`, `${managedPath}/verify`]) {
      for (const origin of ['https://devcongress.org', 'https://www.devcongress.org']) {
        const response = await app.request(`https://ems.example${path}`, {
          method: 'OPTIONS',
          headers: { Origin: origin, 'Access-Control-Request-Method': path === managedPath ? 'GET' : 'POST', 'Access-Control-Request-Headers': 'content-type' },
        });

        expect(response.status).toBe(204);
        expect(response.headers.get('access-control-allow-origin')).toBe(origin);
        expect(response.headers.get('access-control-allow-credentials')).toBeNull();
        expect(response.headers.get('access-control-allow-headers')).toContain('Content-Type');
      }
    }
    for (const origin of ['https://devcongress.org.attacker.test', 'https://attacker.test']) {
      const response = await app.request(`https://ems.example${managedPath}/initialize`, {
        method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST' },
      });

      expect(response.headers.get('access-control-allow-origin')).toBeNull();
    }
    const unrelated = await app.request(`https://ems.example${managedPath}/neighbor`, {
      method: 'OPTIONS', headers: { Origin: 'https://devcongress.org', 'Access-Control-Request-Method': 'POST' },
    });

    expect(unrelated.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('retains the flexible cart ceiling and a separate small webhook ceiling', async () => {
    vi.stubEnv('PUBLIC_WEBSITE_ORIGIN', 'https://devcongress.org');
    const request = (path: string, bytes: number) => app.request(`https://ems.example${path}`, {
      method: 'POST', headers: { Origin: 'https://devcongress.org', 'Content-Type': 'application/json' },
      body: JSON.stringify({ padding: 'x'.repeat(bytes) }),
    });

    expect((await request(`${managedPath}/initialize`, 70 * 1024)).status).toBe(400);
    expect((await request(`${managedPath}/initialize`, 513 * 1024)).status).toBe(413);
    expect((await request(`${managedPath}/verify`, 65 * 1024)).status).toBe(413);
    expect((await request(managedWebhook, 65 * 1024)).status).toBe(413);
  });

  it('retires new legacy paid initialization before storage or provider calls even with old flags enabled', async () => {
    configureLiveWebhook();
    vi.stubEnv('DEVCON26_PUBLIC_CHECKOUT_ENABLED', 'true');
    vi.stubEnv('PUBLIC_WEBSITE_ORIGIN', 'https://devcongress.org');
    vi.stubEnv('DEVCON26_PUBLIC_CHECKOUT_ORIGINS', 'https://devcongress.org');
    const standardHold = vi.spyOn(ticketingStorage, 'createSupabaseAnnualConferenceCheckoutHold');
    const flexibleHold = vi.spyOn(ticketingStorage, 'createSupabaseAnnualConferenceFlexibleCheckoutHold');
    const provider = vi.spyOn(paymentProvider, 'createPaystackHostedCheckout');

    for (const path of ['/api/public/annual-conference/2026/checkout/initialize', '/api/public/annual-conference/2026/checkout/flexible/initialize']) {
      const response = await app.request(`https://ems.example${path}`, {
        method: 'POST', headers: { Origin: 'https://devcongress.org', 'Content-Type': 'application/json' }, body: '{}',
      });

      expect(response.status).toBe(410);
      expect(await response.json()).toMatchObject({ code: 'checkout_moved' });
    }
    expect(standardHold).not.toHaveBeenCalled();
    expect(flexibleHold).not.toHaveBeenCalled();
    expect(provider).not.toHaveBeenCalled();
  });
});
