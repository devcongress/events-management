import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { AppBindings } from '@/server/http/app-bindings';

const state = vi.hoisted(() => ({
  owner: false,
  result: { count: 25, source: 'ticket_count', baseline: 20, purchases: 5, version: 1 },
  error: '',
  rpc: vi.fn(),
  audit: vi.fn(),
  auth: vi.fn(),
}));

vi.mock('@/lib/supabase/admin-auth', () => ({
  requireAdmin: (...args: unknown[]) => state.auth(...args),
}));
vi.mock('@/server/managed-conference-checkout', () => ({
  managedCheckoutRpc: (...args: unknown[]) => state.rpc(...args),
}));
vi.mock('@/server/protected-mutation', () => ({
  recordProtectedMutationAudit: (...args: unknown[]) => state.audit(...args),
}));

import { registerAnnualConferenceAttendanceCounter } from './annual-conference-attendance-counter';

const app = new Hono<AppBindings>();

registerAnnualConferenceAttendanceCounter(app);
const publicPath = '/api/public/annual-conference/2026/attendance-counter';
const ownerPath = '/api/annual-conference/2026/attendance-counter';
const patch = (body: unknown) => app.request(ownerPath, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

describe('ticket counter routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.owner = false;
    state.error = '';
    state.result = { count: 25, source: 'ticket_count', baseline: 20, purchases: 5, version: 1 };
    state.auth.mockImplementation(async (c: { json: (body: object, status: number) => Response }) => state.owner ? null : c.json({ error: 'Unauthorized' }, 401));
    state.rpc.mockImplementation(async (_c: unknown, name: string, args: { p_baseline?: number }) => {
      if (state.error) throw new Error(state.error);
      if (name === 'set_annual_conference_attendance_baseline') {
        state.result = { ...state.result, baseline: args.p_baseline!, count: args.p_baseline! + state.result.purchases, version: state.result.version + 1 };
      }

      return state.result;
    });
    state.audit.mockResolvedValue(undefined);
  });

  it('exposes only the public projection without caching', async () => {
    const response = await app.request(publicPath);

    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ count: 25, source: 'ticket_count' });
    expect(state.rpc).toHaveBeenCalledWith(expect.anything(), 'read_annual_conference_ticket_counter', { p_year: 2026 });
  });

  it('requires owner authorization for reads and mutations', async () => {
    expect((await app.request(ownerPath)).status).toBe(401);
    expect((await patch({ baseline: 30, version: 1 })).status).toBe(401);
    expect(state.auth).toHaveBeenCalledWith(expect.anything(), ['owner']);
    expect(state.rpc).not.toHaveBeenCalled();
    expect(state.audit).not.toHaveBeenCalled();
  });

  it('rejects invalid and non-integer inputs without calling the RPC', async () => {
    state.owner = true;

    for (const body of [null, {}, { baseline: '20', version: 1 }, { baseline: 1.5, version: 1 }, { baseline: -1, version: 1 }, { baseline: 2147483648, version: 1 }, { baseline: 1, version: -1 }, { baseline: 1, version: 2147483648 }, { baseline: 1, version: 1, extra: true }]) {
      expect((await patch(body)).status).toBe(400);
    }

    expect((await app.request(ownerPath, { method: 'PATCH', body: '{' })).status).toBe(400);
    expect(state.rpc).not.toHaveBeenCalled();
    expect(state.audit).not.toHaveBeenCalled();
  });

  it('saves an owner baseline and projects the updated public count', async () => {
    state.owner = true;
    expect(await (await app.request(ownerPath)).json()).toEqual(state.result);
    const response = await patch({ baseline: 30, version: 1 });

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ count: 35, source: 'ticket_count', baseline: 30, purchases: 5, version: 2 });
    expect(state.rpc).toHaveBeenCalledWith(expect.anything(), 'set_annual_conference_attendance_baseline', { p_year: 2026, p_baseline: 30, p_version: 1 });
    expect(state.audit).toHaveBeenCalledOnce();
    expect(await (await app.request(publicPath)).json()).toEqual({ count: 35, source: 'ticket_count' });
  });

  it('returns a safe conflict and fails closed for other errors', async () => {
    state.owner = true;
    state.error = 'attendance_baseline_conflict';
    const conflict = await patch({ baseline: 30, version: 1 });

    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toEqual({ error: 'The ticket counter changed. Refresh and try again.' });
    expect(state.audit).not.toHaveBeenCalled();
    state.error = 'Unavailable';
    expect((await patch({ baseline: 30, version: 1 })).status).toBe(503);
    const response = await app.request(publicPath);

    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});
