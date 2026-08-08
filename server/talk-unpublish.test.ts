import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminRole } from '@/types/supabase';

const mocks = vi.hoisted(() => ({
  role: 'owner' as AdminRole,
}));

vi.mock('@/lib/supabase/admin-auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/supabase/admin-auth')>('@/lib/supabase/admin-auth');
  const session = () => ({
    authenticated: true as const,
    user_id: 'admin-1',
    email: 'admin@devcongress.org',
    display_name: 'Admin',
    role: mocks.role,
    session_id: 'session-1',
    expires_at: '2099-01-01T00:00:00.000Z',
  });

  return {
    ...actual,
    getAdminSession: vi.fn(async () => session()),
    requireAdmin: vi.fn(async (c: { set: (key: string, value: unknown) => void }, roles: AdminRole[] = ['owner', 'organizer']) => {
      if (!roles.includes(mocks.role)) {
        return new Response(JSON.stringify({ error: 'This account does not have access to this resource' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      c.set('adminSession', session());
      return null;
    }),
    recordAdminAudit: vi.fn(async () => undefined),
  };
});

const originalCwd = process.cwd();
let tempRoot: string;

async function setupPublishedTalk() {
  vi.resetModules();
  const talks = await import('@/lib/mock-db/talks');
  const talk = await talks.createTalk({
    event_id: 'event-1',
    kind: 'talk',
    speaker_name: 'Presenter',
    speaker_email: 'presenter@example.com',
    github_username: null,
    title: 'Published talk',
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
  return { app, talks, talk };
}

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'devcon-talk-unpublish-'));
  process.chdir(tempRoot);
  await fs.mkdir('data');
  vi.stubEnv('APP_DATA_SOURCE', 'local-json');
  vi.stubEnv('NODE_ENV', 'test');
  mocks.role = 'owner';
});

afterEach(async () => {
  vi.unstubAllEnvs();
  process.chdir(originalCwd);
  await fs.rm(tempRoot, { recursive: true, force: true });
});

describe('published archive-item status changes', () => {
  it('allows an owner to unpublish a talk into its ready state', async () => {
    const { app, talks, talk } = await setupPublishedTalk();

    const response = await app.request(`http://localhost/api/talks/${talk.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'accepted' }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: 'accepted' });
    await expect(talks.getTalkById(talk.id)).resolves.toMatchObject({ status: 'accepted' });
  });

  it('does not let an organizer unpublish a talk', async () => {
    const { app, talks, talk } = await setupPublishedTalk();
    mocks.role = 'organizer';

    const response = await app.request(`http://localhost/api/talks/${talk.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'accepted' }),
    });

    expect(response.status).toBe(403);
    await expect(talks.getTalkById(talk.id)).resolves.toMatchObject({ status: 'published' });
  });

  it('does not use unpublish to exclude a published talk', async () => {
    const { app, talks, talk } = await setupPublishedTalk();

    const response = await app.request(`http://localhost/api/talks/${talk.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'rejected' }),
    });

    expect(response.status).toBe(400);
    await expect(talks.getTalkById(talk.id)).resolves.toMatchObject({ status: 'published' });
  });
});
