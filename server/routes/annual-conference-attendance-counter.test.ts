import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { AppBindings } from '@/server/http/app-bindings';

const state = vi.hoisted(() => ({ owner: false, result: { count: 25, source: 'ticket_count', baseline: 20, purchases: 5 }, error: false }));

vi.mock('@/lib/supabase/admin-auth', () => ({
  requireAdmin: async (c: { json: (body: object, status: number) => Response }) => state.owner ? null : c.json({ error: 'Unauthorized' }, 401),
}));
vi.mock('@/server/managed-conference-checkout', () => ({ managedCheckoutRpc: async () => {
  if (state.error) throw new Error('Unavailable');

  return state.result;
} }));

import { registerAnnualConferenceAttendanceCounter } from './annual-conference-attendance-counter';

const app = new Hono<AppBindings>();

registerAnnualConferenceAttendanceCounter(app);
const publicPath = '/api/public/annual-conference/2026/attendance-counter';
const ownerPath = '/api/annual-conference/2026/attendance-counter';

describe('ticket counter routes', () => {
  beforeEach(() => {
    state.owner = false;
    state.error = false;
  });

  it('exposes only the public projection without caching', async () => {
    const response = await app.request(publicPath);

    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ count: 25, source: 'ticket_count' });
  });

  it('protects the breakdown and removes manual mutation', async () => {
    expect((await app.request(ownerPath)).status).toBe(401);
    state.owner = true;
    expect(await (await app.request(ownerPath)).json()).toEqual(state.result);
    expect((await app.request(ownerPath, { method: 'PATCH' })).status).toBe(404);
  });

  it('fails closed when the aggregate is unavailable', async () => {
    state.error = true;
    const response = await app.request(publicPath);

    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});
