import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAnnualConferenceSocialCardBuyerGrant } from '@/lib/annual-conference-social-card-buyer-grant';
import type { AppBindings } from '@/server/http/app-bindings';

const mocks = vi.hoisted(() => ({
  collection: vi.fn(), card: vi.fn(), testers: vi.fn(),
  mode: 'test', version: 3 as number | null,
}));

vi.mock('@/server/env', () => ({ envValue: (key: string) => ({
  PAYSTACK_SECRET_KEY: 'sk_live_fixture', PAYSTACK_TEST_SECRET_KEY: 'sk_test_fixture',
  PUBLIC_WEBSITE_ORIGIN: 'https://devcongress.org', DEVCON26_COMPLETE_TEST_ENABLED: 'false',
})[key] }));
vi.mock('@/server/annual-conference-registration-testing', () => ({ registrationTesting: mocks.testers }));
vi.mock('@/server/http/public-intake-protection', () => ({ enforcePublicRateLimit: vi.fn().mockResolvedValue(null), publicClientKey: () => 'fixture' }));
vi.mock('@/lib/supabase/annual-conference-social-cards', () => ({
  getSupabaseAnnualConferenceSocialCardByOrderSeat: mocks.card,
  getSupabaseAnnualConferenceSocialCardCollectionByOrder: mocks.collection,
  getSupabaseAnnualConferenceSocialCardByCapability: vi.fn(),
  getSupabaseAnnualConferenceSocialCardByCollectionCapability: vi.fn(),
  getSupabaseAnnualConferenceSocialCardCollection: vi.fn(),
  getSupabasePublicAnnualConferenceSocialCard: vi.fn(),
  issueSupabaseAnnualConferenceSocialCardDelivery: vi.fn(),
  updateSupabaseAnnualConferenceSocialCard: vi.fn(),
  uploadSupabaseAnnualConferenceSocialCardPhoto: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({ getSupabaseAdminClient: () => ({
  from: () => {
    const query = {
      select: () => query, eq: () => query,
      single: async () => ({ error: null, data: { payment_mode: mocks.mode, checkout_origin: 'https://devcongress.org', edition_id: 'edition', status: 'paid', checkout_settings_version: mocks.version } }),
      in: async () => ({ error: null, data: [{ attendee_email: 'gift@example.test', status: 'issued' }] }),
    };

    return query;
  },
}) }));

import { registerAnnualConferenceSocialCardRoutes } from './routes/annual-conference-social-cards';

const path = '/api/public/annual-conference/2026/social-cards/buyer/collection';
const orderId = '10000000-0000-4000-8000-000000000001';

function request(mode: 'test' | 'live', suffix = '', seats: number[] | undefined = [2]) {
  const app = new Hono<AppBindings>();
  const grant = createAnnualConferenceSocialCardBuyerGrant({
    orderId, origin: 'https://devcongress.org', verifier: 'fixture',
    secretKey: mode === 'test' ? 'sk_test_fixture' : 'sk_live_fixture', seatNumbers: seats,
  });

  registerAnnualConferenceSocialCardRoutes(app);

  return app.request(`https://ems.example${path}${suffix}`, { headers: { Origin: 'https://devcongress.org', 'x-social-card-buyer-grant': grant } });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.mode = 'test';
  mocks.version = 3;
  mocks.testers.mockResolvedValue({ enabled: false, tester_emails: ['gift@example.test'] });
  mocks.collection.mockImplementation(async () => [{ seat_number: 2, card: { is_test: mocks.mode === 'test' } }]);
  mocks.card.mockImplementation(async () => ({ is_test: mocks.mode === 'test' }));
});

describe('mode-bound conference badge grants', () => {
  it.each(['live', 'test'] as const)('keeps an issued %s grant usable independently of current testing enablement', async (mode) => {
    mocks.mode = mode;
    expect((await request(mode)).status).toBe(200);
  });

  it('rejects a credential from the other payment mode and seats outside the signed scope', async () => {
    expect((await request('live')).status).toBe(403);
    expect((await request('test', '/seats/3')).status).toBe(403);
    expect(mocks.collection).not.toHaveBeenCalled();
    expect(mocks.card).not.toHaveBeenCalled();
  });

  it('rechecks the exact recipient list and keeps legacy preview enablement restrictions', async () => {
    mocks.testers.mockResolvedValueOnce({ enabled: false, tester_emails: [] });
    expect((await request('test')).status).toBe(403);
    mocks.version = null;
    expect((await request('test')).status).toBe(403);
  });

  it('rejects unscoped managed access and a card from the wrong mode', async () => {
    const app = new Hono<AppBindings>();
    const grant = createAnnualConferenceSocialCardBuyerGrant({ orderId, origin: 'https://devcongress.org', verifier: 'fixture', secretKey: 'sk_test_fixture' });

    registerAnnualConferenceSocialCardRoutes(app);
    expect((await app.request(`https://ems.example${path}`, { headers: { Origin: 'https://devcongress.org', 'x-social-card-buyer-grant': grant } })).status).toBe(403);
    mocks.card.mockResolvedValue({ is_test: false });
    expect((await request('test', '/seats/2')).status).toBe(404);
  });
});
