import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAnnualConferenceSocialCardBuyerGrant } from '@/lib/annual-conference-social-card-buyer-grant';
import type { AppBindings } from './http/app-bindings';

const mocks = vi.hoisted(() => ({ collection: vi.fn(), card: vi.fn(), test: true, mode: 'test', enabled: true }));
const origin = 'https://preview.account.workers.dev';
const secretKey = 'sk_test_fixture';
const orderId = '10000000-0000-4000-8000-000000000001';

vi.mock('@/server/env', () => ({ envValue: (key: string) => ({
  DEVCON26_COMPLETE_TEST_ENABLED: String(mocks.test), DEVCON26_COMPLETE_TEST_ORIGIN: 'https://preview.account.workers.dev',
  PAYSTACK_TEST_SECRET_KEY: 'sk_test_fixture', PAYSTACK_SECRET_KEY: 'sk_live_fixture',
})[key] }));
vi.mock('@/server/annual-conference-registration-testing', () => ({ registrationTesting: async () => ({ enabled: mocks.enabled, tester_emails: ['fixture@example.test'] }) }));
vi.mock('@/server/http/public-intake-protection', () => ({ enforcePublicRateLimit: async () => null, publicClientKey: () => 'fixture' }));
vi.mock('@/lib/supabase/server', () => ({ getSupabaseAdminClient: () => ({ from: () => {
  const query = { select: () => query, eq: () => query, single: async () => ({ data: {
    payment_mode: mocks.mode, checkout_origin: 'https://preview.account.workers.dev', edition_id: 'edition', status: 'paid',
  }, error: null }), in: async () => ({ error: null, data: [{ attendee_email: 'fixture@example.test', status: 'issued' }] }) };

  return query;
} }) }));
vi.mock('@/lib/supabase/annual-conference-social-cards', () => ({
  getSupabaseAnnualConferenceSocialCardCollectionByOrder: mocks.collection,
  getSupabaseAnnualConferenceSocialCardByOrderSeat: mocks.card,
}));

import { registerAnnualConferenceSocialCardRoutes } from './routes/annual-conference-social-cards';

const app = new Hono<AppBindings>();
const path = '/api/public/annual-conference/2026/social-cards/buyer/collection';

registerAnnualConferenceSocialCardRoutes(app);

function headers(seatNumbers?: number[], key = secretKey) {
  return { Origin: origin, 'x-social-card-buyer-grant': createAnnualConferenceSocialCardBuyerGrant({
    orderId, verifier: 'v'.repeat(43), origin, secretKey: key, seatNumbers,
  }) };
}

beforeEach(() => {
  mocks.test = true;
  mocks.mode = 'test';
  mocks.enabled = true;
  mocks.card.mockReset().mockResolvedValue(null);
  mocks.collection.mockReset().mockResolvedValue([1, 3].map((seat) => ({ seat_number: seat, card: {
    display_name: 'Fixture', role: 'attendee', is_test: true,
  } })));
});

describe('preview buyer badge access', () => {
  it('returns only the signed self seat, including a non-first seat', async () => {
    const response = await app.request(path, { headers: headers([3]) });

    expect(response.status).toBe(200);
    expect((await response.json()).seats.map((seat: { seat_number: number }) => seat.seat_number)).toEqual([3]);
  });

  it.each(['GET', 'PATCH', 'POST'])('blocks gift-seat %s access before card storage', async (method) => {
    const response = await app.request(`${path}/seats/1${method === 'POST' ? '/photo' : ''}`, { method, headers: headers([3]) });

    expect(response.status).toBe(403);
    expect(mocks.card).not.toHaveBeenCalled();
  });

  it('rejects unscoped test and wrong-key grants', async () => {
    expect((await app.request(path, { headers: headers() })).status).toBe(403);
    expect((await app.request(path, { headers: headers([3], 'sk_live_fixture') })).status).toBe(403);
  });

  it('rejects live orders and disabled testing in the preview', async () => {
    mocks.mode = 'live';
    expect((await app.request(path, { headers: headers([3]) })).status).toBe(403);
    mocks.mode = 'test';
    mocks.enabled = false;
    expect((await app.request(path, { headers: headers([3]) })).status).toBe(403);
  });

  it('preserves legacy live buyer grants outside preview mode', async () => {
    mocks.test = false;
    mocks.mode = 'live';
    expect((await app.request(path, { headers: headers(undefined, 'sk_live_fixture') })).status).toBe(200);
    expect((await app.request(path, { headers: headers([3]) })).status).toBe(403);
  });
});
