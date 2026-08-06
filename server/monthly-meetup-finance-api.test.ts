import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockAdminRole = vi.hoisted(() => ({ value: 'owner' as const }));

vi.mock('../lib/supabase/admin-auth', async () => {
  const actual = await vi.importActual<typeof import('../lib/supabase/admin-auth')>('../lib/supabase/admin-auth');
  const session = {
    authenticated: true as const,
    user_id: 'owner-1',
    email: 'owner@devcongress.org',
    display_name: 'Owner',
    role: 'owner' as const,
    session_id: 'session-1',
    expires_at: '2099-01-01T00:00:00.000Z',
  };

  return {
    ...actual,
    getAdminSession: vi.fn(async () => ({ ...session, role: mockAdminRole.value })),
    requireAdmin: vi.fn(async (
      c: { set: (key: string, value: unknown) => void },
      roles: Array<'owner' | 'organizer' | 'volunteer'> = ['owner', 'organizer'],
    ) => {
      if (!roles.includes(mockAdminRole.value)) {
        return new Response(JSON.stringify({ error: 'This account does not have access to this resource' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      c.set('adminSession', { ...session, role: mockAdminRole.value });
      return null;
    }),
    recordAdminAudit: vi.fn(async () => undefined),
  };
});

const originalCwd = process.cwd();
let tempRoot: string;

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'devcon-monthly-finance-'));
  process.chdir(tempRoot);
  await fs.mkdir('data');
  await fs.writeFile(path.join(tempRoot, 'data', 'events.json'), '[]', 'utf-8');
  vi.stubEnv('APP_DATA_SOURCE', 'local-json');
  vi.stubEnv('NODE_ENV', 'test');
  vi.resetModules();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  process.chdir(originalCwd);
  await fs.rm(tempRoot, { recursive: true, force: true });
});

describe('monthly meetup finance API', () => {
  it('shares a newly created monthly category across events and validates expense categories', async () => {
    const { default: app } = await import('./app');

    async function createMonthlyEvent(name: string, eventDate: string) {
      const response = await app.request('http://localhost/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description: `${name} description`,
          event_date: eventDate,
          series_type: 'monthly',
          location: { name: 'Accra', label: 'Accra', url: null },
        }),
      });
      expect(response.status).toBe(201);
      return (await response.json() as { event: { id: string } }).event;
    }

    const august = await createMonthlyEvent('August Meetup', '2026-08-29');
    const september = await createMonthlyEvent('September Meetup', '2026-09-26');

    const initialFinanceResponse = await app.request(`http://localhost/api/events/${august.id}/finance`);
    expect(initialFinanceResponse.status).toBe(200);
    await expect(initialFinanceResponse.json()).resolves.toMatchObject({
      categories: expect.arrayContaining([expect.objectContaining({ name: 'Venue' })]),
    });

    const categoryResponse = await app.request(`http://localhost/api/events/${august.id}/finance/categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Community outreach' }),
    });
    expect(categoryResponse.status).toBe(201);
    const category = await categoryResponse.json() as { id: string; name: string };
    expect(category.name).toBe('Community outreach');

    const laterFinanceResponse = await app.request(`http://localhost/api/events/${september.id}/finance`);
    expect(laterFinanceResponse.status).toBe(200);
    await expect(laterFinanceResponse.json()).resolves.toMatchObject({
      categories: expect.arrayContaining([expect.objectContaining({ id: category.id, name: category.name })]),
    });

    const expenseResponse = await app.request(`http://localhost/api/events/${september.id}/finance/expenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: 'Community outreach',
        description: 'Community handouts',
        amount_minor: 1_500,
        status: 'paid',
        expense_date: '2026-09-26',
      }),
    });
    expect(expenseResponse.status).toBe(201);
    await expect(expenseResponse.json()).resolves.toMatchObject({ category: 'Community outreach' });

    const unknownCategoryResponse = await app.request(`http://localhost/api/events/${august.id}/finance/expenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: 'Catering',
        description: 'Unregistered category example',
        amount_minor: 2_000,
        status: 'paid',
        expense_date: '2026-08-29',
      }),
    });
    expect(unknownCategoryResponse.status).toBe(400);
    await expect(unknownCategoryResponse.json()).resolves.toEqual({
      error: 'Choose an existing monthly category or add a new one first.',
    });
  });
});
