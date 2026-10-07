import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Devcon26TestSession } from '@/lib/supabase/devcon26-test-checkout';
import * as storage from '@/lib/supabase/devcon26-test-checkout';
import { consumePublicRateLimit } from '@/lib/public-rate-limit';
import { devcon26TestCheckoutRequestKey } from '@/lib/devcon26-test-checkout';
import app, { isUnauthenticatedApiRequest } from '@/server/app';

vi.mock('@/lib/supabase/devcon26-test-checkout', () => ({
  devcon26TestStorageReady: vi.fn(), prepareDevcon26TestSession: vi.fn(),
  initializeDevcon26TestSession: vi.fn(), findDevcon26TestSession: vi.fn(), confirmDevcon26TestSession: vi.fn(),
}));
vi.mock('@/lib/public-rate-limit', () => ({ consumePublicRateLimit: vi.fn() }));

const base = '/api/public/annual-conference/2026/test-checkout';
const webhookPath = '/api/webhooks/paystack/devcon26-test';
const reference = 'devcon26-test-aaaaaaaaaaaa4aaa8aaaaaaaaaaaaaaa';
const requestKey = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const checkoutUrl = 'https://checkout.paystack.com/test-fixture';
const previewOrigin = 'https://feature-devcon26-public-checkout-devcongress-website.admins-a7d.workers.dev';
const commitOrigin = 'https://63b14d94-devcongress-website.admins-a7d.workers.dev';
let session: Devcon26TestSession;
let provider: ReturnType<typeof vi.fn>;
let providerFacts: Record<string, unknown>;

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return app.request(`https://ems.example${path}`, {
    method: 'POST', headers: { Origin: 'https://devcongress.org', 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();

  for (const [key, value] of Object.entries({
    NODE_ENV: 'production', APP_DATA_SOURCE: 'local-json',
    DEVCON26_TEST_CHECKOUT_ENABLED: 'true', DEVCON26_PAYMENT_PROVIDER: 'paystack',
    PAYSTACK_SECRET_KEY: 'sk_test_fixture', DEVCON26_TEST_BUYER_EMAIL: 'sandbox@example.com',
    PUBLIC_WEBSITE_ORIGIN: 'https://devcongress.org', PUBLIC_API_CORS_ORIGINS: 'https://devcongress.org',
    DEVCON26_TEST_CHECKOUT_ORIGINS: `${previewOrigin},${commitOrigin}`,
  })) vi.stubEnv(key, value);

  session = {
    id: requestKey, checkout_request_key: requestKey, tier_key: 'team_3', quantity: 3,
    amount_minor: 54_999, currency: 'GHS', payment_reference: reference, status: 'prepared',
    authorization_url: null, initialization_lease: requestKey,
    initialization_lease_until: '2026-10-07T12:01:00Z', expires_at: '2026-10-08T12:00:00Z',
    verified_at: null, created_at: '2026-10-07T12:00:00Z',
  };
  providerFacts = { id: 123, reference, domain: 'test', status: 'success', amount: 54_999, currency: 'GHS' };
  vi.mocked(consumePublicRateLimit).mockResolvedValue({ allowed: true });
  vi.mocked(storage.devcon26TestStorageReady).mockResolvedValue(true);
  vi.mocked(storage.prepareDevcon26TestSession).mockImplementation(async (_c, _key, tier) => {
    if (tier !== session.tier_key) throw new Error('test_checkout_cart_conflict');

    return { ...session };
  });
  vi.mocked(storage.initializeDevcon26TestSession).mockImplementation(async () => {
    session = { ...session, status: 'initialized', authorization_url: checkoutUrl };

    return session;
  });
  vi.mocked(storage.findDevcon26TestSession).mockResolvedValue(session);
  vi.mocked(storage.confirmDevcon26TestSession).mockImplementation(async (_c, input) => {
    session = { ...session, status: input.amountMinor === session.amount_minor && input.currency === 'GHS' ? 'verified' : 'rejected' };
    vi.mocked(storage.findDevcon26TestSession).mockResolvedValue(session);

    return session;
  });
  provider = vi.fn(async (url: string) => new Response(JSON.stringify({ status: true, data: url.endsWith('/initialize')
    ? { authorization_url: checkoutUrl, reference } : providerFacts }), { status: 200 }));
  vi.stubGlobal('fetch', provider);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('public DevCon26 test checkout integration', () => {
  it.each([previewOrigin, commitOrigin])('supports anonymous sandbox CORS, initialization and verification from %s', async (origin) => {
    const catalog = await app.request(`https://ems.example${base}`, { headers: { Origin: origin } });

    expect((await catalog.json()).mode).toBe('test');
    expect(catalog.headers.get('access-control-allow-origin')).toBe(origin);
    expect(catalog.headers.get('access-control-allow-credentials')).toBeNull();

    const preflight = await app.request(`https://ems.example${base}/initialize`, {
      method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' },
    });

    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe(origin);
    expect(preflight.headers.get('access-control-allow-methods')).toContain('POST');
    expect(preflight.headers.get('access-control-allow-headers')).toContain('Content-Type');
    expect(preflight.headers.get('access-control-allow-credentials')).toBeNull();

    const initialized = await post(`${base}/initialize`, { tier_key: 'team_3', checkout_request_key: requestKey }, { Origin: origin });

    expect(initialized.status).toBe(200);
    expect(initialized.headers.get('access-control-allow-origin')).toBe(origin);
    expect(JSON.parse(provider.mock.calls[0][1].body).callback_url).toBe(`${origin}/devcon26/?test_checkout=return`);
    expect(storage.prepareDevcon26TestSession).toHaveBeenCalledWith(expect.anything(), devcon26TestCheckoutRequestKey(origin, requestKey), 'team_3');

    const verified = await post(`${base}/verify`, { reference }, { Origin: origin });

    expect(verified.status).toBe(200);
    expect((await verified.json()).status).toBe('verified');
    expect(verified.headers.get('access-control-allow-origin')).toBe(origin);
  });

  it('does not grant preview access to neighboring public, webhook or organizer routes', async () => {
    for (const path of ['/api/public/meetups', `${base}/neighbor`, '/api/public/event-submissions', webhookPath, '/api/annual-conference/2026/ticketing']) {
      const response = await app.request(`https://ems.example${path}`, {
        method: 'OPTIONS', headers: { Origin: previewOrigin, 'Access-Control-Request-Method': 'POST' },
      });

      expect(response.headers.get('access-control-allow-origin')).not.toBe(previewOrigin);
    }

    const production = await app.request('https://ems.example/api/public/meetups', {
      method: 'OPTIONS', headers: { Origin: 'https://devcongress.org', 'Access-Control-Request-Method': 'GET' },
    });

    expect(production.headers.get('access-control-allow-origin')).toBe('https://devcongress.org');
    expect((await app.request('https://ems.example/api/annual-conference/2026/ticketing')).status).toBe(401);
    expect(provider).not.toHaveBeenCalled();
  });

  it('fails closed for wildcard configuration and preview requests with live credentials', async () => {
    const input = { tier_key: 'team_3', checkout_request_key: requestKey };

    for (const override of [{ DEVCON26_TEST_CHECKOUT_ORIGINS: 'https://*.workers.dev' }, { PAYSTACK_SECRET_KEY: 'sk_live_fixture' }]) {
      vi.stubEnv('DEVCON26_TEST_CHECKOUT_ORIGINS', `${previewOrigin},${commitOrigin}`);
      vi.stubEnv('PAYSTACK_SECRET_KEY', 'sk_test_fixture');
      for (const [key, value] of Object.entries(override)) vi.stubEnv(key, value);
      const response = await post(`${base}/initialize`, input, { Origin: previewOrigin });

      expect(response.status).toBe(503);
      expect(response.headers.get('access-control-allow-origin')).toBeNull();
    }

    expect(provider).not.toHaveBeenCalled();
    expect(storage.prepareDevcon26TestSession).not.toHaveBeenCalled();
  });

  it.each(['null', '', `${previewOrigin}/`, `${previewOrigin}.attacker.example`, 'http://localhost:4321'])('rejects an unapproved request origin %s before storage or provider work', async (origin) => {
    const response = await post(`${base}/initialize`, { tier_key: 'team_3', checkout_request_key: requestKey }, { Origin: origin });

    expect(response.status).toBe(403);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    expect(provider).not.toHaveBeenCalled();
    expect(storage.prepareDevcon26TestSession).not.toHaveBeenCalled();
  });

  it('rejects browser initialization without an Origin header', async () => {
    const response = await app.request(`https://ems.example${base}/initialize`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier_key: 'team_3', checkout_request_key: requestKey }),
    });

    expect(response.status).toBe(403);
    expect(provider).not.toHaveBeenCalled();
    expect(storage.prepareDevcon26TestSession).not.toHaveBeenCalled();
  });

  it('keeps retry keys stable within an origin and isolates callbacks across origins', async () => {
    const initialized = new Map<string, Devcon26TestSession>();

    vi.mocked(storage.prepareDevcon26TestSession).mockImplementation(async (_c, key) => {
      const saved = initialized.get(key) ?? { ...session, checkout_request_key: key, authorization_url: null };

      return saved;
    });
    vi.mocked(storage.initializeDevcon26TestSession).mockImplementation(async (_c, prepared, url) => {
      const saved = { ...prepared, authorization_url: url, status: 'initialized' as const };

      initialized.set(prepared.checkout_request_key, saved);

      return saved;
    });

    const input = { tier_key: 'team_3', checkout_request_key: requestKey };

    for (const origin of [previewOrigin, previewOrigin, commitOrigin]) {
      expect((await post(`${base}/initialize`, input, { Origin: origin })).status).toBe(200);
    }

    expect(provider).toHaveBeenCalledTimes(2);
    expect(provider.mock.calls.map((call) => JSON.parse(call[1].body).callback_url)).toEqual([
      `${previewOrigin}/devcon26/?test_checkout=return`, `${commitOrigin}/devcon26/?test_checkout=return`,
    ]);
  });

  it('advertises only a ready sandbox, with no secrets or buyer identity', async () => {
    const response = await app.request(`https://ems.example${base}`, { headers: { Origin: 'https://devcongress.org' } });
    const payload = await response.json();

    expect(payload.mode).toBe('test');
    expect(payload.tiers).toHaveLength(3);
    expect(JSON.stringify(payload)).not.toMatch(/secret|buyer|sandbox@example/);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('access-control-allow-origin')).toBe('https://devcongress.org');
    vi.mocked(storage.devcon26TestStorageReady).mockResolvedValue(false);
    expect(await (await app.request(`https://ems.example${base}`)).json()).toEqual({ mode: 'unavailable' });
  });

  it('rejects live keys and missing configuration before any storage/provider work', async () => {
    vi.stubEnv('PAYSTACK_SECRET_KEY', 'sk_live_fixture');
    expect((await post(`${base}/initialize`, { tier_key: 'team_3', checkout_request_key: requestKey })).status).toBe(503);
    expect(await (await app.request(`https://ems.example${base}`)).json()).toEqual({ mode: 'unavailable' });
    expect(provider).not.toHaveBeenCalled();
    expect(storage.prepareDevcon26TestSession).not.toHaveBeenCalled();
  });

  it('does not reuse a provider response with a different initialization reference', async () => {
    provider.mockResolvedValue(new Response(JSON.stringify({ status: true, data: { reference: 'wrong', authorization_url: checkoutUrl } })));
    expect((await post(`${base}/initialize`, { tier_key: 'team_3', checkout_request_key: requestKey })).status).toBe(503);
    expect(storage.initializeDevcon26TestSession).not.toHaveBeenCalled();
  });

  it('requires provider API success, not merely a success-shaped transaction body', async () => {
    provider.mockResolvedValue(new Response(JSON.stringify({ status: false, data: providerFacts })));
    expect((await post(`${base}/verify`, { reference })).status).toBe(503);
    expect(storage.confirmDevcon26TestSession).not.toHaveBeenCalled();
  });

  it('uses server pricing, email, currency, reference and callback; duplicate requests reuse the URL', async () => {
    const input = { tier_key: 'team_3', checkout_request_key: requestKey };
    const first = await post(`${base}/initialize`, input);
    const second = await post(`${base}/initialize`, input);

    expect(first.status).toBe(200);
    expect(await second.json()).toEqual(await first.json());
    expect(provider).toHaveBeenCalledTimes(1);
    const outbound = JSON.parse(provider.mock.calls[0][1].body);

    expect(outbound).toMatchObject({ amount: 54_999, currency: 'GHS', email: 'sandbox@example.com', reference,
      callback_url: 'https://devcongress.org/devcon26/?test_checkout=return' });
    expect((await post(`${base}/initialize`, { ...input, tier_key: 'regular' })).status).toBe(409);
  });

  it('rejects caller pricing and unsafe origins before initializing', async () => {
    const input = { tier_key: 'team_3', checkout_request_key: requestKey };

    expect((await post(`${base}/initialize`, { ...input, amount_minor: 1 })).status).toBe(400);
    const denied = await post(`${base}/initialize`, input, { Origin: 'https://attacker.example' });

    expect(denied.status).toBe(403);
    expect(denied.headers.get('access-control-allow-origin')).toBeNull();
    expect((await post(`${base}/initialize`, input, { 'Content-Type': 'text/plain' })).status).toBe(415);
    expect(provider).not.toHaveBeenCalled();
  });

  it('enforces preflight, payload limits and narrow authentication exemptions', async () => {
    const preflight = await app.request(`https://ems.example${base}/initialize`, {
      method: 'OPTIONS', headers: { Origin: 'https://devcongress.org', 'Access-Control-Request-Method': 'POST' },
    });

    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-methods')).toContain('POST');
    expect((await post(`${base}/initialize`, { filler: 'x'.repeat(65_536) })).status).toBe(413);
    expect((await post(webhookPath, { filler: 'x'.repeat(65_536) })).status).toBe(413);
    expect(isUnauthenticatedApiRequest(`${base}/initialize`, 'POST')).toBe(true);
    expect(isUnauthenticatedApiRequest(webhookPath, 'POST')).toBe(true);
    expect(isUnauthenticatedApiRequest('/api/annual-conference/2026/ticketing', 'GET')).toBe(false);
    expect(isUnauthenticatedApiRequest(`${base}/initialize`, 'PATCH')).toBe(false);
  });

  it('fails closed when the distributed throttle is unavailable or exhausted', async () => {
    vi.mocked(consumePublicRateLimit).mockResolvedValue({ allowed: false, retryAfterSeconds: 60, unavailable: true });
    expect((await post(`${base}/initialize`, { tier_key: 'team_3', checkout_request_key: requestKey })).status).toBe(503);
    expect(provider).not.toHaveBeenCalled();
    vi.mocked(consumePublicRateLimit).mockResolvedValue({ allowed: false, retryAfterSeconds: 60 });
    expect((await post(`${base}/verify`, { reference })).status).toBe(429);
  });

  it('never treats unknown references or browser success claims as payment evidence', async () => {
    vi.mocked(storage.findDevcon26TestSession).mockResolvedValue(null);
    expect((await post(`${base}/verify`, { reference })).status).toBe(404);
    expect((await post(`${base}/verify`, { reference, status: 'success' })).status).toBe(400);
    expect(provider).not.toHaveBeenCalled();
  });

  it.each(['pending', 'failed'])('reports a %s transaction without confirmation', async (status) => {
    providerFacts.status = status;
    const response = await post(`${base}/verify`, { reference });

    expect((await response.json()).status).toBe(status);
    expect(storage.confirmDevcon26TestSession).not.toHaveBeenCalled();
  });

  it.each([{ domain: 'live' }, { domain: undefined }, { reference: 'wrong' }, { amount: '54999' }])('rejects untrusted verification facts %j', async (override) => {
    Object.assign(providerFacts, override);
    expect((await post(`${base}/verify`, { reference })).status).toBe(503);
    expect(storage.confirmDevcon26TestSession).not.toHaveBeenCalled();
  });

  it.each([{ amount: 1 }, { currency: 'USD' }])('does not verify mismatched money %j', async (override) => {
    Object.assign(providerFacts, override);
    expect((await (await post(`${base}/verify`, { reference })).json()).status).toBe('failed');
  });

  it('converges a return and duplicate signed webhook into the same verified sandbox result', async () => {
    expect((await (await post(`${base}/verify`, { reference })).json()).status).toBe('verified');
    const body = { event: 'charge.success', data: providerFacts };
    const signature = crypto.createHmac('sha512', 'sk_test_fixture').update(JSON.stringify(body)).digest('hex');

    expect((await post(webhookPath, body, { 'x-paystack-signature': signature })).status).toBe(204);
    expect((await post(webhookPath, body, { 'x-paystack-signature': signature })).status).toBe(204);
    expect(storage.confirmDevcon26TestSession).toHaveBeenCalledTimes(1);
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid webhook signatures and retries transient verification failures', async () => {
    const body = { event: 'charge.success', data: providerFacts };

    expect((await post(webhookPath, body, { 'x-paystack-signature': '00' })).status).toBe(401);
    expect(provider).not.toHaveBeenCalled();
    provider.mockRejectedValue(new Error('provider fixture failure'));
    const signature = crypto.createHmac('sha512', 'sk_test_fixture').update(JSON.stringify(body)).digest('hex');

    expect((await post(webhookPath, body, { 'x-paystack-signature': signature })).status).toBe(500);
  });

  it.each(['https://attacker.example/checkout', 'https://checkout.paystack.com.attacker.example/x', 'http://checkout.paystack.com/x', 'https://user@checkout.paystack.com/x'])('refuses an unsafe checkout redirect %s', async (authorizationUrl) => {
    provider.mockResolvedValue(new Response(JSON.stringify({ status: true, data: { reference, authorization_url: authorizationUrl } })));
    expect((await post(`${base}/initialize`, { tier_key: 'team_3', checkout_request_key: requestKey })).status).toBe(503);
    expect(storage.initializeDevcon26TestSession).not.toHaveBeenCalled();
  });
});
