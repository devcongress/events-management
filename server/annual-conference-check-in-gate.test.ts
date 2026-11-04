import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono, type Context } from 'hono';
import type { AppBindings } from '@/server/http/app-bindings';

const mocks = vi.hoisted(() => ({
  authorized: true,
  date: '2026-12-19' as string | null,
  rpc: vi.fn(),
  bearer: vi.fn(),
  audit: vi.fn(),
}));

vi.mock('@/lib/supabase/admin-auth', () => ({
  requireAdmin: async () => null,
  getAdminSession: async () => ({ authenticated: true, email: 'volunteer@example.test' }),
}));
vi.mock('@/server/annual-conference-request', () => ({
  requireAnnualConferenceCapability: async (c: Context) => mocks.authorized ? null : c.json({ error: 'Forbidden' }, 403),
  getAnnualConferenceEditionByYear: async () => ({ id: 'edition-1', provisional_date: mocks.date }),
}));
vi.mock('@/lib/supabase/server', () => ({ getSupabaseAdminClient: () => ({ rpc: mocks.rpc }) }));
vi.mock('@/server/protected-mutation', () => ({ recordProtectedMutationAudit: mocks.audit }));
vi.mock('@/lib/supabase/annual-conference-ticketing', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/supabase/annual-conference-ticketing')>(),
  getSupabaseAnnualConferenceTicketing: async () => ({ settings: { edition_id: 'edition-1' } }),
  checkInSupabaseAnnualConferenceBearerTicket: mocks.bearer,
}));

import { registerAnnualConferenceCheckInRoutes } from './routes/annual-conference-check-in';
import { registerAnnualConferenceTicketingRoutes } from './routes/annual-conference-ticketing';

const app = new Hono<AppBindings>();

registerAnnualConferenceCheckInRoutes(app);
registerAnnualConferenceTicketingRoutes(app);

const cases = [
  { path: '/api/annual-conference/2026/check-in/admit', body: { ticket_id: '20000000-0000-4000-8000-000000000001', confirmed: true } },
  { path: '/api/annual-conference/2026/ticketing/check-in', body: { qr_token: 'a'.repeat(64) } },
];

beforeEach(() => {
  vi.useFakeTimers();
  mocks.authorized = true;
  mocks.date = '2026-12-19';
  mocks.rpc.mockReset().mockResolvedValue({ data: 'checked_in', error: null });
  mocks.bearer.mockReset().mockResolvedValue({ outcome: 'checked_in', ticket_id: 'ticket-1' });
  mocks.audit.mockReset();
});
afterEach(() => vi.useRealTimers());

describe.each(cases)('conference admission gate $path', ({ path, body }) => {
  const request = () => app.request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  it('blocks before midnight and opens at the boundary', async () => {
    vi.setSystemTime(new Date('2026-12-18T23:59:59.999Z'));
    expect((await request()).status).toBe(409);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.bearer).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
    vi.setSystemTime(new Date('2026-12-19T00:00:00Z'));
    expect((await request()).status).toBe(200);
    expect(mocks.rpc.mock.calls.length + mocks.bearer.mock.calls.length).toBe(1);
  });

  it('fails closed for a missing date and checks permission first', async () => {
    mocks.date = null;
    expect((await request()).status).toBe(409);
    mocks.authorized = false;
    expect((await request()).status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.bearer).not.toHaveBeenCalled();
  });
});
