import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminRole } from '@/types/supabase';

const mocks = vi.hoisted(() => ({ role: 'owner' as AdminRole }));

vi.mock('@/lib/supabase/admin-auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/supabase/admin-auth')>('@/lib/supabase/admin-auth');
  const session = () => ({
    authenticated: true as const,
    user_id: 'owner-1',
    email: 'owner@devcongress.org',
    display_name: 'Owner',
    role: mocks.role,
    session_id: 'session-1',
    expires_at: '2099-01-01T00:00:00.000Z',
  });
  return {
    ...actual,
    getAdminSession: vi.fn(async () => session()),
    requireAdmin: vi.fn(async (c: { set: (key: string, value: unknown) => void }, roles: AdminRole[] = ['owner', 'organizer']) => {
      if (!roles.includes(mocks.role)) {
        return new Response(JSON.stringify({ error: 'This account does not have access to this resource' }), { status: 403 });
      }
      c.set('adminSession', session());
      return null;
    }),
    recordAdminAudit: vi.fn(async () => undefined),
  };
});

const originalCwd = process.cwd();
let tempRoot: string;
const event = {
  id: 'event-july',
  name: 'DevCongress July Meetup',
  description: null,
  event_date: '2026-07-25T10:00:00.000Z',
  series_type: 'monthly',
  status: 'completed',
  publish_to_website: true,
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-01T00:00:00.000Z',
};

async function setup() {
  vi.resetModules();
  const talks = await import('@/lib/mock-db/talks');
  const links = await import('@/lib/mock-db/speaker-intake-links');
  const talk = await talks.createTalk({
    event_id: event.id,
    kind: 'talk',
    speaker_name: 'Jeffrey Hinson',
    speaker_email: 'jeffrey@example.com',
    github_username: null,
    title: 'Design in the age of AI',
    topic: 'General',
    abstract: null,
    bio: null,
    slides_url: null,
    slides_type: null,
    storage_path: null,
    slides_uploaded_at: null,
  });
  await talks.updateTalk(talk.id, { status: 'published' });
  const app = (await import('./app')).default;
  return { app, links, talks, talk };
}

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'devcon-materials-follow-up-'));
  process.chdir(tempRoot);
  await fs.mkdir('data');
  await fs.writeFile(path.join(tempRoot, 'data', 'events.json'), JSON.stringify([event]), 'utf8');
  vi.stubEnv('APP_DATA_SOURCE', 'local-json');
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('RESEND_API_KEY', 're_test');
  vi.stubEnv('SPEAKER_EMAIL_REPLY_TO', 'hello@devcongress.org');
  mocks.role = 'owner';
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  process.chdir(originalCwd);
  await fs.rm(tempRoot, { recursive: true, force: true });
});

describe('archive materials follow-up', () => {
  it('sends an Owner-issued, existing-record-bound follow-up link', async () => {
    const resendFetch = vi.fn(async () => new Response(JSON.stringify({ data: [{ id: 'resend-follow-up' }] }), { status: 200 }));
    vi.stubGlobal('fetch', resendFetch);
    const { app, links, talk } = await setup();

    const response = await app.request(`http://localhost/api/talks/${talk.id}/materials-follow-up`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requested_fields: ['abstract', 'slides_url'] }),
    });

    expect(response.status).toBe(201);
    expect(resendFetch).toHaveBeenCalledWith('https://api.resend.com/emails/batch', expect.objectContaining({ method: 'POST' }));
    await expect(links.getSpeakerIntakeLinksByEvent(event.id)).resolves.toEqual([
      expect.objectContaining({
        purpose: 'archive_materials_follow_up',
        talk_id: talk.id,
        requested_fields: ['abstract', 'slides_url'],
        email_status: 'accepted',
      }),
    ]);
  });

  it('updates only the requested fields on the existing published record', async () => {
    const { app, links, talks, talk } = await setup();
    const { token, link } = await links.createSpeakerIntakeLink({
      event_id: event.id,
      event_month: '2026-07',
      expires_at: '2099-01-01T00:00:00.000Z',
      kind: 'talk',
      purpose: 'archive_materials_follow_up',
      speaker_name: talk.speaker_name,
      speaker_email: talk.speaker_email,
      talk_title: talk.title,
      talk_id: talk.id,
      requested_fields: ['abstract', 'slides_url'],
    });

    const response = await app.request(`http://localhost/api/events/${event.id}/speaker-intake/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        abstract: 'A practical look at design decisions in AI-assisted products.',
        slides_url: 'https://example.com/slides',
      }),
    });

    expect(response.status).toBe(201);
    await expect(talks.getTalkById(talk.id)).resolves.toMatchObject({
      id: talk.id,
      status: 'published',
      abstract: 'A practical look at design decisions in AI-assisted products.',
      slides_url: 'https://example.com/slides',
      bio: null,
    });
    await expect(links.getSpeakerIntakeLinkByToken(event.id, token)).resolves.toMatchObject({
      id: link.id,
      used_talk_id: talk.id,
    });
  });

  it('does not let an Organizer issue a materials follow-up', async () => {
    const { app, talk } = await setup();
    mocks.role = 'organizer';

    const response = await app.request(`http://localhost/api/talks/${talk.id}/materials-follow-up`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requested_fields: ['abstract'] }),
    });

    expect(response.status).toBe(403);
  });
});
