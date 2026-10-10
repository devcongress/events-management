import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminSession, AdminRole } from '@/lib/supabase/admin-auth';
import * as storage from '@/lib/supabase/devcon26-test-coupons';
import { recordProtectedMutationAudit } from '@/server/protected-mutation';
import type { AppBindings } from '@/server/http/app-bindings';
import { registerDevcon26TestCouponRoutes } from '@/server/routes/devcon26-test-coupons';

vi.mock('@/lib/supabase/devcon26-test-coupons', () => ({
  listDevcon26TestCoupons: vi.fn(), createDevcon26TestCoupon: vi.fn(), toggleDevcon26TestCoupon: vi.fn(),
}));
vi.mock('@/server/protected-mutation', () => ({ recordProtectedMutationAudit: vi.fn() }));

const app = new Hono<AppBindings>();
const path = '/api/annual-conference/2026/ticketing/test-coupons';
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const input = { code: 'TEST-COUPON', discount_type: 'fixed_minor', discount_value: 1000,
  eligible_tiers: ['regular'], expires_at: '2099-12-19T23:00:00Z', max_completed: 5 };
let role: AdminRole | null = 'owner';

app.use('*', async (c, next) => {
  if (role) c.set('adminSession', {
    authenticated: true, mode: 'supabase', role, email: 'owner@example.test', user_id: id,
    membership_id: id, display_name: 'Owner', expires_at: '2099-01-01T00:00:00Z',
  } satisfies AdminSession);
  await next();
});
registerDevcon26TestCouponRoutes(app);

function request(method: string, route = path, body?: unknown, origin: string | null = 'https://ems.example') {
  return app.request(`https://ems.example${route}`, {
    method, headers: { ...(origin ? { Origin: origin } : {}), 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  role = 'owner';
  vi.stubEnv('APP_DATA_SOURCE', 'local-json');
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('PUBLIC_APP_URL', 'https://ems.example');
  vi.mocked(storage.listDevcon26TestCoupons).mockResolvedValue({
    coupons: [], checkouts: [], total: 0, page: 1, page_size: 25, checkout_total: 0, checkout_page: 1, checkout_page_size: 25,
  });
  vi.mocked(storage.createDevcon26TestCoupon).mockResolvedValue({ id });
  vi.mocked(storage.toggleDevcon26TestCoupon).mockResolvedValue({ id, enabled: false });
});
afterEach(() => vi.unstubAllEnvs());

describe('Owner test coupon operations', () => {
  it.each(['organizer', 'volunteer', null] as const)('denies %s before any storage or audit', async (value) => {
    role = value;

    for (const [method, route, body] of [['GET', path, undefined], ['POST', path, input], ['PATCH', `${path}/${id}`, { enabled: false }]] as const) {
      expect((await request(method, route, body)).status).toBe(value ? 403 : 401);
    }
    expect(storage.listDevcon26TestCoupons).not.toHaveBeenCalled();
    expect(storage.createDevcon26TestCoupon).not.toHaveBeenCalled();
    expect(storage.toggleDevcon26TestCoupon).not.toHaveBeenCalled();
    expect(recordProtectedMutationAudit).not.toHaveBeenCalled();
  });

  it.each([null, 'https://attacker.example'])('uses the existing CSRF origin guard for %s', async (origin) => {
    expect((await request('POST', path, input, origin)).status).toBe(403);
    expect((await request('PATCH', `${path}/${id}`, { enabled: false }, origin)).status).toBe(403);
    expect(storage.createDevcon26TestCoupon).not.toHaveBeenCalled();
    expect(storage.toggleDevcon26TestCoupon).not.toHaveBeenCalled();
  });

  it('creates and toggles only test terms, auditing coupon identity without code or purchaser PII', async () => {
    expect((await request('POST', path, input)).status).toBe(201);
    expect((await request('PATCH', `${path}/${id}`, { enabled: false })).status).toBe(200);
    expect(storage.createDevcon26TestCoupon).toHaveBeenCalledWith(expect.anything(), input, 'owner@example.test');
    const events = vi.mocked(recordProtectedMutationAudit).mock.calls.map((call) => call[1]);

    expect(events).toMatchObject([
      { action: 'annual_conference.test_coupon.create', targetId: id, metadata: { edition_year: 2026 } },
      { action: 'annual_conference.test_coupon.toggle', targetId: id, metadata: { edition_year: 2026, enabled: false } },
    ]);
    expect(JSON.stringify(events)).not.toMatch(/TEST-COUPON|owner@example|purchaser/);
  });

  it('bounds both coupon and private purchaser ledger pages and rejects unknown query fields', async () => {
    expect((await request('GET', `${path}?page=2&page_size=8&checkout_page=3&checkout_page_size=8`)).status).toBe(200);
    expect(storage.listDevcon26TestCoupons).toHaveBeenCalledWith(expect.anything(), { page: 2, page_size: 8, checkout_page: 3, checkout_page_size: 8 });
    for (const query of ['page_size=51', 'checkout_page_size=51', 'page=0', 'checkout_page=10001', 'code=private']) {
      expect((await request('GET', `${path}?${query}`)).status).toBe(400);
    }
  });

  it('rejects another year, edits to terms, deletion, and browser supplied actor identity', async () => {
    expect((await request('GET', path.replace('2026', '2027'))).status).toBe(400);
    expect((await request('PATCH', `${path}/${id}`, { enabled: true, discount_value: 1 })).status).toBe(400);
    expect((await request('DELETE', `${path}/${id}`)).status).toBe(404);
    expect((await request('POST', path, { ...input, created_by_email: 'other@example.test' })).status).toBe(400);
    expect(storage.createDevcon26TestCoupon).not.toHaveBeenCalled();
    expect(storage.toggleDevcon26TestCoupon).not.toHaveBeenCalled();
  });
});
