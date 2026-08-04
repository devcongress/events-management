import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/supabase/admin-auth', async () => {
  const actual = await vi.importActual<typeof import('../lib/supabase/admin-auth')>('../lib/supabase/admin-auth');
  const session = {
    authenticated: true as const,
    user_id: 'admin-1',
    email: 'organizer@devcongress.org',
    display_name: 'Organizer',
    role: 'owner' as const,
    session_id: 'session-1',
    expires_at: '2099-01-01T00:00:00.000Z',
  };

  return {
    ...actual,
    getAdminSession: vi.fn(async () => session),
    requireAdmin: vi.fn(async (c: { set: (key: string, value: unknown) => void }) => {
      c.set('adminSession', session);
      return null;
    }),
    recordAdminAudit: vi.fn(async () => undefined),
  };
});

const originalCwd = process.cwd();
let tempRoot: string;

function event(overrides: Record<string, unknown>) {
  return {
    id: 'event-1',
    slug: 'event-1',
    name: 'Published event',
    description: 'A published event.',
    event_date: '2099-08-20T18:00:00.000Z',
    end_date: '2099-08-20T20:00:00.000Z',
    status: 'upcoming',
    created_at: '2026-08-04T00:00:00.000Z',
    updated_at: '2026-08-04T00:00:00.000Z',
    publish_to_website: true,
    publication_status: 'published',
    ownership: 'devcongress',
    submission_source: 'internal',
    moderation_status: null,
    format: 'meetup',
    timezone: 'Africa/Accra',
    location_type: 'in_person',
    location: { name: 'Accra', label: 'Accra', url: null },
    ...overrides,
  };
}

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'devcon-event-beta-visibility-'));
  process.chdir(tempRoot);
  await fs.mkdir('data');
  await fs.writeFile(path.join(tempRoot, 'data', 'events.json'), JSON.stringify([
    event({ id: 'official', slug: 'official', name: 'Official event' }),
    event({
      id: 'community-live',
      slug: 'community-live',
      name: 'Community workshop',
      ownership: 'external',
      submission_source: 'public_submission',
      moderation_status: 'approved',
    }),
    event({
      id: 'community-beta',
      slug: 'community-beta',
      name: 'Community beta workshop',
      ownership: 'external',
      submission_source: 'public_submission',
      moderation_status: 'approved',
    }),
  ]), 'utf-8');
  vi.stubEnv('APP_DATA_SOURCE', 'local-json');
  vi.stubEnv('NODE_ENV', 'test');
  vi.resetModules();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  process.chdir(originalCwd);
  await fs.rm(tempRoot, { recursive: true, force: true });
});

describe('private beta event visibility', () => {
  it('keeps public-submission events out of the public events API by default', async () => {
    const { default: app } = await import('./app');
    const response = await app.request('http://localhost/api/public/events');
    const payload = await response.json() as { data: Array<{ id: string }> };

    expect(response.status).toBe(200);
    expect(payload.data.map((item) => item.id)).toEqual(['official']);
  });

  it('includes approved public submissions only after public discovery is explicitly enabled', async () => {
    vi.stubEnv('PUBLIC_EVENT_SUBMISSIONS_PUBLIC_DISCOVERY_ENABLED', 'true');
    const { default: app } = await import('./app');
    const response = await app.request('http://localhost/api/public/events');
    const payload = await response.json() as { data: Array<{ id: string }> };

    expect(response.status).toBe(200);
    expect(payload.data.map((item) => item.id)).toEqual([
      'official',
      'community-live',
      'community-beta',
    ]);
  });

  it('keeps public-submission events visible in the authenticated EMS preview', async () => {
    const { default: app } = await import('./app');
    const response = await app.request('http://localhost/api/admin/events-preview');
    const payload = await response.json() as { data: Array<{ id: string }> };

    expect(response.status).toBe(200);
    expect(payload.data.map((item) => item.id)).toEqual([
      'official',
      'community-live',
      'community-beta',
    ]);
  });
});
