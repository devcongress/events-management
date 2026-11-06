import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { AppBindings } from '@/server/http/app-bindings';

const state = vi.hoisted(() => ({ owner: false, result: { count: 20, source: 'estimate', version: 1 }, error: '' }));

vi.mock('@/lib/supabase/admin-auth', () => ({
  requireAdmin: async (c: { json: (body: object, status: number) => Response }) => state.owner ? null : c.json({ error: 'Unauthorized' }, 401),
  getAdminSession: async () => ({ authenticated: true, email: 'owner@example.com' }),
}));
vi.mock('@/server/managed-conference-checkout', () => ({ managedCheckoutRpc: async () => {
  if (state.error) throw new Error(state.error);

  return state.result;
} }));
vi.mock('@/server/protected-mutation', () => ({ recordProtectedMutationAudit: async () => {} }));

import { registerAnnualConferenceAttendanceCounter } from './annual-conference-attendance-counter';

const app = new Hono<AppBindings>();

registerAnnualConferenceAttendanceCounter(app);
const publicPath = '/api/public/annual-conference/2026/attendance-counter';
const ownerPath = '/api/annual-conference/2026/attendance-counter';

describe('attendance counter routes', () => {
  beforeEach(() => {
    state.owner = false;
    state.error = '';
    state.result = { count: 20, source: 'estimate', version: 1 };
  });

  it('exposes only the public projection without caching', async () => {
    const response = await app.request(publicPath);

    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ count: 20, source: 'estimate' });
  });

  it('protects owner controls and requires explicit confirmation', async () => {
    expect((await app.request(ownerPath)).status).toBe(401);
    state.owner = true;
    const response = await app.request(ownerPath, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source: 'actual', version: 1 }) });

    expect(response.status).toBe(400);
  });

  it('reports concurrent changes without overwriting them', async () => {
    state.owner = true;
    state.error = 'attendance_counter_changed';
    const response = await app.request(ownerPath, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source: 'actual', version: 1, confirmed: true }) });

    expect(response.status).toBe(409);
  });
});
