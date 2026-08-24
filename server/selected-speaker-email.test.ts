import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockAdminRole = vi.hoisted(() => ({ value: 'owner' as 'owner' | 'organizer' }));

vi.mock('../lib/supabase/admin-auth', async () => {
  const actual = await vi.importActual<typeof import('../lib/supabase/admin-auth')>('../lib/supabase/admin-auth');
  const session = {
    authenticated: true as const,
    user_id: 'admin-1',
    email: 'admin@devcongress.org',
    display_name: 'Organizer',
    role: 'owner' as const,
    session_id: 'session-1',
    expires_at: '2099-01-01T00:00:00.000Z',
  };
  return {
    ...actual,
    getAdminSession: vi.fn(async () => ({ ...session, role: mockAdminRole.value })),
    requireAdmin: vi.fn(async (c: { set: (key: string, value: unknown) => void }) => {
      c.set('adminSession', { ...session, role: mockAdminRole.value });
      return null;
    }),
    recordAdminAudit: vi.fn(async () => undefined),
  };
});

const originalCwd = process.cwd();
let tempRoot: string;
const event = {
  id: 'event-selected-speakers',
  name: 'DevCongress August Meetup',
  description: null,
  event_date: '2026-08-29T10:00:00.000Z',
  series_type: 'monthly',
  status: 'cfp_open',
  publish_to_website: true,
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z',
};

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'devcon-selected-speaker-email-'));
  process.chdir(tempRoot);
  await fs.mkdir('data');
  await fs.writeFile(path.join(tempRoot, 'data', 'events.json'), JSON.stringify([event]), 'utf-8');
  vi.stubEnv('APP_DATA_SOURCE', 'local-json');
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('RESEND_API_KEY', 're_test');
  vi.stubEnv('SPEAKER_EMAIL_REPLY_TO', 'hello@devcongress.org');
  vi.stubEnv('SHORT_LINK_PUBLIC_ORIGIN', 'https://go.devcongress.org');
  vi.stubEnv('SHORT_LINK_RESOLVER_TOKEN', 'test-short-link-resolver-token-2026');
  vi.stubEnv('SPEAKER_INTAKE_LINK_TOKEN_SECRET', 'test-speaker-intake-link-secret-2026');
  mockAdminRole.value = 'owner';
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  process.chdir(originalCwd);
  await fs.rm(tempRoot, { recursive: true, force: true });
});

async function setup() {
  vi.resetModules();
  const submissions = await import('../lib/mock-db/speaker-submissions');
  const links = await import('../lib/mock-db/speaker-intake-links');
  const app = (await import('./app')).default;
  const submission = await submissions.createSpeakerSubmission({
    event_id: event.id,
    kind: 'talk',
    speaker_name: 'Ama Boateng',
    speaker_email: 'ama@example.com',
    github_username: null,
    title: 'Designing Reliable Systems',
    topic: 'Systems',
    abstract: 'A practical systems talk.',
    bio: 'Community engineer.',
    resource_url: null,
  });
  return { app, submissions, links, submission };
}

describe('selected-speaker email workflow', () => {
  it('shows an owner-only test proposal only to the owner', async () => {
    const { app, submissions, submission } = await setup();
    await submissions.updateSpeakerSubmission(submission.id, {
      internal_note: 'owner-only:test-speaker',
    });

    const ownerResponse = await app.request(`http://localhost/api/events/${event.id}/speaker-submissions`);
    expect(ownerResponse.status).toBe(200);
    await expect(ownerResponse.json()).resolves.toMatchObject({
      counts: { submitted: 1 },
      submissions: [{ id: submission.id }],
    });

    mockAdminRole.value = 'organizer';
    const organizerResponse = await app.request(`http://localhost/api/events/${event.id}/speaker-submissions`);
    expect(organizerResponse.status).toBe(200);
    await expect(organizerResponse.json()).resolves.toMatchObject({
      counts: { submitted: 0 },
      submissions: [],
    });

    const organizerDecision = await app.request(`http://localhost/api/speaker-submissions/${submission.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'selected' }),
    });
    expect(organizerDecision.status).toBe(404);
  });

  it('reports the missing private-link secret before preparing previews', async () => {
    const { app } = await setup();

    const response = await app.request(
      `http://localhost/api/events/${event.id}/selected-speaker-emails/preview`,
      { method: 'POST' },
      { SPEAKER_INTAKE_LINK_TOKEN_SECRET: '' },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'Selected-speaker email links are not configured. Add a SPEAKER_INTAKE_LINK_TOKEN_SECRET of at least 32 characters.',
    });
  });

  it('prepares a private short link on selection and previews before sending', async () => {
    const { app, links, submissions, submission } = await setup();
    const selectResponse = await app.request(`http://localhost/api/speaker-submissions/${submission.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'selected', expires_in_days: 7 }),
    });
    expect(selectResponse.status).toBe(200);
    const selected = await selectResponse.json() as { link: { short_url: string; token: null } };
    expect(selected.link.short_url).toMatch(/^https:\/\/go\.devcongress\.org\/P_/);
    expect(selected.link.token).toBeNull();

    const code = selected.link.short_url.split('/').at(-1)!;
    const resolverResponse = await app.request(`http://localhost/api/internal/short-links/${code}`, {
      headers: { 'x-short-link-resolver-token': 'test-short-link-resolver-token-2026' },
    });
    const resolverBody = await resolverResponse.json();
    const storedLinks = await links.getSpeakerIntakeLinksByEvent(event.id);
    const storedSubmission = await submissions.getSpeakerSubmissionById(submission.id);
    expect(resolverResponse.status, JSON.stringify({ resolverBody, code, storedLinks, storedSubmission })).toBe(200);
    expect(resolverBody).toEqual({
      destination_path: `/speaker-talks/${event.id}/${code}`,
    });

    const previewResponse = await app.request(`http://localhost/api/events/${event.id}/selected-speaker-emails/preview`, { method: 'POST' });
    expect(previewResponse.status).toBe(200);
    const preview = await previewResponse.json() as { ready_count: number; previews: Array<{ subject: string; short_url: string; html: string }> };
    expect(preview.ready_count).toBe(1);
    expect(preview.previews[0]).toMatchObject({
      subject: 'Your presentation was selected for DevCongress August Meetup',
      short_url: selected.link.short_url,
    });
    expect(preview.previews[0]?.html).toContain(selected.link.short_url);
    expect((await links.getSpeakerIntakeLinksByEvent(event.id))[0]).toMatchObject({ token: null, email_status: null });

    const reverseDecision = await app.request(`http://localhost/api/speaker-submissions/${submission.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'not_selected' }),
    });
    expect(reverseDecision.status).toBe(409);
    await expect(reverseDecision.json()).resolves.toEqual({
      error: 'This proposal already has a final decision and cannot be changed.',
    });
  });

  it('previews and sends only the requested selected speaker', async () => {
    const resendFetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ data: [{ id: 'resend-selected-single' }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', resendFetch);
    const { app, submissions, submission } = await setup();
    const secondSubmission = await submissions.createSpeakerSubmission({
      event_id: event.id,
      kind: 'talk',
      speaker_name: 'Kojo Mensah',
      speaker_email: 'kojo@example.com',
      github_username: null,
      title: 'Shipping Thoughtful Interfaces',
      topic: 'Design engineering',
      abstract: 'A practical interface talk.',
      bio: 'Design engineer.',
      resource_url: null,
    });
    for (const item of [submission, secondSubmission]) {
      const response = await app.request(`http://localhost/api/speaker-submissions/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'selected' }),
      });
      expect(response.status).toBe(200);
    }

    const selection = { submission_ids: [secondSubmission.id] };
    const previewResponse = await app.request(`http://localhost/api/events/${event.id}/selected-speaker-emails/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(selection),
    });
    expect(previewResponse.status).toBe(200);
    await expect(previewResponse.json()).resolves.toMatchObject({
      ready_count: 1,
      previews: [{ submission_id: secondSubmission.id, speaker_email: 'kojo@example.com' }],
    });

    const sendResponse = await app.request(`http://localhost/api/events/${event.id}/selected-speaker-emails/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(selection),
    });
    expect(sendResponse.status).toBe(200);
    await expect(sendResponse.json()).resolves.toMatchObject({ sent_count: 1 });
    const payload = JSON.parse(String(resendFetch.mock.calls[0]?.[1]?.body));
    expect(payload).toHaveLength(1);
    expect(payload[0]).toMatchObject({ to: ['kojo@example.com'] });
  });

  it('keeps a rejection final', async () => {
    const { app, submission } = await setup();
    const reject = await app.request(`http://localhost/api/speaker-submissions/${submission.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'not_selected' }),
    });
    expect(reject.status).toBe(200);

    const approve = await app.request(`http://localhost/api/speaker-submissions/${submission.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'selected' }),
    });
    expect(approve.status).toBe(409);
  });

  it('sends the previewed email once and suppresses a duplicate send', async () => {
    const resendFetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ data: [{ id: 'resend-selected-1' }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', resendFetch);
    const { app, links, submission } = await setup();
    await app.request(`http://localhost/api/speaker-submissions/${submission.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'selected' }),
    });

    const first = await app.request(`http://localhost/api/events/${event.id}/selected-speaker-emails/send`, { method: 'POST' });
    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toMatchObject({ sent_count: 1, already_sent_count: 0 });
    expect(resendFetch).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(resendFetch.mock.calls[0]?.[1]?.body));
    expect(payload[0]).toMatchObject({
      from: 'DevCongress Speakers <speakers@updates.devcongress.org>',
      to: ['ama@example.com'],
      subject: 'Your presentation was selected for DevCongress August Meetup',
    });
    expect(payload[0].html).toContain('https://go.devcongress.org/P_');
    expect((await links.getSpeakerIntakeLinksByEvent(event.id))[0]).toMatchObject({
      email_status: 'accepted',
      email_provider_id: 'resend-selected-1',
    });

    const duplicate = await app.request(`http://localhost/api/events/${event.id}/selected-speaker-emails/send`, { method: 'POST' });
    expect(duplicate.status).toBe(200);
    await expect(duplicate.json()).resolves.toMatchObject({ sent_count: 0, already_sent_count: 1 });
    expect(resendFetch).toHaveBeenCalledTimes(1);
  });
});
