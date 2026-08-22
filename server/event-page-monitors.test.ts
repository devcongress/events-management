import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/supabase/admin-auth', async () => {
  const actual = await vi.importActual<typeof import('../lib/supabase/admin-auth')>('../lib/supabase/admin-auth');
  const session = { authenticated: true as const, user_id: 'admin-1', email: 'owner@devcongress.org', display_name: 'Owner', role: 'owner' as const, session_id: 'session-1', expires_at: '2099-01-01T00:00:00.000Z' };
  return {
    ...actual,
    getAdminSession: vi.fn(async () => session),
    requireAdmin: vi.fn(async (c: { set: (key: string, value: unknown) => void }) => { c.set('adminSession', session); return null; }),
    recordAdminAudit: vi.fn(async () => undefined),
  };
});

const originalCwd = process.cwd();
let tempRoot: string;

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'devcon-event-page-monitor-'));
  process.chdir(tempRoot);
  await fs.mkdir('data');
  await fs.writeFile(path.join(tempRoot, 'data', 'events.json'), '[]', 'utf-8');
  vi.stubEnv('APP_DATA_SOURCE', 'local-json');
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('SLACK_EVENTS_RETRY_SECRET', 'scheduled-monitor-secret-for-tests-2026');
  vi.resetModules();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  process.chdir(originalCwd);
  await fs.rm(tempRoot, { recursive: true, force: true });
});

async function createExternalEvent() {
  const { createEvent } = await import('@/lib/mock-db/events');
  return createEvent({
    name: 'Systems Night',
    description: 'A community event.',
    event_date: '2099-09-10T18:00:00.000Z',
    end_date: '2099-09-10T20:00:00.000Z',
    cover: '/images/event-announcement-fallback.png',
    location: { name: 'Impact Hub', label: 'Impact Hub', url: null },
    venue_address: 'Accra',
    registration_url: 'https://events.example/systems-night',
    ownership: 'external',
    submission_source: 'public_submission',
    moderation_status: 'approved',
    publication_status: 'published',
    publish_to_website: true,
  });
}

describe('event registration page monitor API', () => {
  it('shows Last checked, checks on demand, and enforces the cooldown', async () => {
    const event = await createExternalEvent();
    const pageFetch = vi.fn(async () => new Response(`<script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org', '@type': 'Event', name: event.name,
      startDate: event.event_date, endDate: event.end_date,
      location: { '@type': 'Place', name: 'Impact Hub', address: 'Accra' },
      offers: { url: event.registration_url },
    })}</script>`, { status: 200, headers: { 'content-type': 'text/html' } }));
    vi.stubGlobal('fetch', pageFetch);
    const { default: app } = await import('./app');

    const initial = await app.request(`http://localhost/api/events/${event.id}/page-monitor`);
    await expect(initial.json()).resolves.toMatchObject({
      eligible: true,
      organizer_contact: null,
      monitor: { status: 'pending', last_checked_at: null },
    });

    const checked = await app.request(`http://localhost/api/events/${event.id}/page-monitor/check`, { method: 'POST' });
    const checkedBody = await checked.json() as { monitor: { status: string; last_checked_at: string | null; next_check_at: string | null } };
    expect(checkedBody.monitor.status).toBe('unchanged');
    expect(checkedBody.monitor.last_checked_at).toBeTruthy();
    expect(checkedBody.monitor.next_check_at).toBeTruthy();

    const repeated = await app.request(`http://localhost/api/events/${event.id}/page-monitor/check`, { method: 'POST' });
    expect(repeated.status).toBe(429);
    await expect(repeated.json()).resolves.toMatchObject({ can_check_at: expect.any(String) });
  });

  it('keeps the scheduled endpoint private', async () => {
    const { default: app } = await import('./app');
    const rejected = await app.request('http://localhost/api/internal/event-page-monitors/check-due', { method: 'POST', headers: { 'x-scheduled-job-secret': 'wrong-secret' } });
    expect(rejected.status).toBe(404);
  });

  it('waits for the cadence before scheduled checks and checks once a monitor is due', async () => {
    const event = await createExternalEvent();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(`<script type="application/ld+json">${JSON.stringify({
      '@type': 'Event', name: event.name, startDate: event.event_date, endDate: event.end_date,
      location: { name: 'Impact Hub', address: 'Accra' }, offers: { url: event.registration_url },
    })}</script>`, { status: 200, headers: { 'content-type': 'text/html' } })));
    const { default: app } = await import('./app');

    const initialized = await app.request(`http://localhost/api/events/${event.id}/page-monitor`);
    const initializedBody = await initialized.json() as { monitor: { next_check_at: string | null } };
    expect(Date.parse(initializedBody.monitor.next_check_at ?? '')).toBeGreaterThan(Date.now());

    const notDue = await app.request('http://localhost/api/internal/event-page-monitors/check-due', {
      method: 'POST', headers: { 'x-scheduled-job-secret': 'scheduled-monitor-secret-for-tests-2026' },
    });
    await expect(notDue.json()).resolves.toMatchObject({ ok: true, checked: 0, changed: 0, unavailable: 0, failed: 0 });

    const { saveEventPageMonitor } = await import('@/lib/supabase/event-page-monitors');
    await saveEventPageMonitor(event.id, { next_check_at: new Date(Date.now() - 1_000).toISOString() });

    const response = await app.request('http://localhost/api/internal/event-page-monitors/check-due', {
      method: 'POST', headers: { 'x-scheduled-job-secret': 'scheduled-monitor-secret-for-tests-2026' },
    });
    await expect(response.json()).resolves.toMatchObject({ ok: true, checked: 1, changed: 0, unavailable: 0, failed: 0 });

    const status = await app.request(`http://localhost/api/events/${event.id}/page-monitor`);
    await expect(status.json()).resolves.toMatchObject({ monitor: { status: 'unchanged', last_checked_at: expect.any(String) } });
  });
});
