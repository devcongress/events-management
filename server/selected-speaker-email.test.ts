import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { legacySelectedSpeakerShortCode } from '../lib/speaker-intake-short-links';

const mockAdminRole = vi.hoisted(() => ({ value: 'owner' as 'owner' | 'organizer' }));
const mockAdminAuditFailure = vi.hoisted(() => ({ value: false }));

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
    recordAdminAudit: vi.fn(async () => {
      if (mockAdminAuditFailure.value) throw new Error('audit unavailable');
    }),
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
  vi.stubEnv('SLACK_EVENTS_RETRY_SECRET', 'test-scheduled-speaker-email-job-secret-2026');
  vi.stubEnv('SHORT_LINK_PUBLIC_ORIGIN', 'https://go.devcongress.org');
  vi.stubEnv('SHORT_LINK_RESOLVER_TOKEN', 'test-short-link-resolver-token-2026');
  vi.stubEnv('SPEAKER_INTAKE_LINK_TOKEN_SECRET', 'test-speaker-intake-link-secret-2026');
  mockAdminRole.value = 'owner';
  mockAdminAuditFailure.value = false;
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

  it('creates one owner-only pending proposal for the real approval flow', async () => {
    const { app } = await setup();
    const requestId = '33f6ca43-e7b6-4f43-93d5-361974e95dc9';
    const created = await app.request(`http://localhost/api/events/${event.id}/speaker-submissions/test`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ request_id: requestId }),
    });
    expect(created.status).toBe(201);
    await expect(created.json()).resolves.toMatchObject({
      created: true,
      submission: { status: 'submitted', speaker_email: 'admin@devcongress.org', internal_note: 'owner-only:test-speaker' },
    });
    const retry = await app.request(`http://localhost/api/events/${event.id}/speaker-submissions/test`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ request_id: requestId }),
    });
    expect(retry.status).toBe(200);
    await expect(retry.json()).resolves.toMatchObject({ created: false, submission: { status: 'submitted' } });
    mockAdminRole.value = 'organizer';
    const hidden = await app.request(`http://localhost/api/events/${event.id}/speaker-submissions`);
    const hiddenBody = await hidden.json() as { submissions: Array<{ internal_note: string | null }> };
    expect(hiddenBody.submissions).not.toContainEqual(expect.objectContaining({ internal_note: 'owner-only:test-speaker' }));
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

  it('sends one synthetic sample to the owner without touching any speaker record', async () => {
    const resendFetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ data: [{ id: 'resend-owner-test-1' }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', resendFetch);
    vi.stubEnv('SPEAKER_INTAKE_LINK_TOKEN_SECRET', '');
    const { app, links, submissions, submission } = await setup();

    const response = await app.request(`http://localhost/api/events/${event.id}/selected-speaker-emails/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request_id: '33f6ca43-e7b6-4f43-93d5-361974e95dc9' }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      accepted: true,
      recipient: 'admin@devcongress.org',
      provider_id: 'resend-owner-test-1',
      subject: '[TEST] Your presentation was selected for DevCongress August Meetup',
    });
    expect(resendFetch).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(resendFetch.mock.calls[0]?.[1]?.body));
    expect(payload).toEqual([expect.objectContaining({
      from: 'DevCongress Speakers <speakers@updates.devcongress.org>',
      to: ['admin@devcongress.org'],
      reply_to: 'hello@devcongress.org',
      subject: '[TEST] Your presentation was selected for DevCongress August Meetup',
      html: expect.stringContaining('Designing Reliable Event-Driven Systems'),
      text: expect.stringContaining('https://go.devcongress.org/P_sample-private-speaker-link'),
    })]);
    expect(payload[0].html).toContain('DevCongress August Meetup');
    expect(payload[0].html).not.toContain('ama@example.com');
    expect((resendFetch.mock.calls[0]?.[1]?.headers as Record<string, string>)['Idempotency-Key']).toMatch(/^speaker-selected-test-[a-f0-9]{64}$/);
    await expect(submissions.getSpeakerSubmissionById(submission.id)).resolves.toMatchObject({
      status: 'submitted',
      selected_intake_link_id: null,
    });
    await expect(links.getSpeakerIntakeLinksByEvent(event.id)).resolves.toEqual([]);
  });

  it('rejects non-owner and browser-supplied test recipients before sending', async () => {
    const resendFetch = vi.fn();
    vi.stubGlobal('fetch', resendFetch);
    const { app } = await setup();

    const arbitraryRecipient = await app.request(`http://localhost/api/events/${event.id}/selected-speaker-emails/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        request_id: '0f43b857-b6ba-4fba-8ff4-051f020c40db',
        recipient: 'someone-else@example.com',
      }),
    });
    expect(arbitraryRecipient.status).toBe(400);

    mockAdminRole.value = 'organizer';
    const organizer = await app.request(`http://localhost/api/events/${event.id}/selected-speaker-emails/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request_id: 'c5b64d55-012b-47ec-8acb-0158c9772df3' }),
    });
    expect(organizer.status).toBe(403);
    expect(resendFetch).not.toHaveBeenCalled();
  });

  it('reports provider acceptance even when the post-send audit is unavailable', async () => {
    const resendFetch = vi.fn(async () => new Response(JSON.stringify({ data: [{ id: 'resend-owner-test-audit' }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', resendFetch);
    const { app } = await setup();
    mockAdminAuditFailure.value = true;

    const response = await app.request(`http://localhost/api/events/${event.id}/selected-speaker-emails/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request_id: 'd70db989-f926-4801-97b8-ddf94c3355b7' }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      accepted: true,
      provider_id: 'resend-owner-test-audit',
    });
    expect(resendFetch).toHaveBeenCalledTimes(1);
  });

  it('prepares a private short link and automatically sends on selection', async () => {
    const resendFetch = vi.fn(async () => new Response(JSON.stringify({ data: [{ id: 'resend-selected-auto' }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', resendFetch);
    const { app, links, submissions, submission } = await setup();
    const selectResponse = await app.request(`http://localhost/api/speaker-submissions/${submission.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'selected', expires_in_days: 7 }),
    });
    expect(selectResponse.status).toBe(200);
    const selected = await selectResponse.json() as { link: { short_url: string; token: null } };
    expect(selected.link.short_url).toMatch(/^https:\/\/go\.devcongress\.org\/P_[A-Za-z0-9_-]{22}$/);
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
    const preview = await previewResponse.json() as { ready_count: number; already_sent_count: number; previews: Array<{ subject: string; short_url: string; html: string }> };
    expect(preview.ready_count).toBe(0);
    expect(preview.already_sent_count).toBe(1);
    expect(resendFetch).toHaveBeenCalledTimes(1);
    expect((await links.getSpeakerIntakeLinksByEvent(event.id))[0]).toMatchObject({
      token: null,
      email_status: 'accepted',
      email_provider_id: 'resend-selected-auto',
    });

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

  it('automatically sends only the approved speakers', async () => {
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
    await expect(previewResponse.json()).resolves.toMatchObject({ ready_count: 0, already_sent_count: 1 });

    const sendResponse = await app.request(`http://localhost/api/events/${event.id}/selected-speaker-emails/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(selection),
    });
    expect(sendResponse.status).toBe(200);
    await expect(sendResponse.json()).resolves.toMatchObject({ sent_count: 0, already_sent_count: 1 });
    expect(resendFetch).toHaveBeenCalledTimes(2);
    const payload = JSON.parse(String(resendFetch.mock.calls[1]?.[1]?.body));
    expect(payload).toHaveLength(1);
    expect(payload[0]).toMatchObject({ to: ['kojo@example.com'] });
  });

  it('keeps a selected proposal final and retries a failed acceptance email with the same link', async () => {
    let attempts = 0;
    const resendFetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      attempts += 1;
      return attempts === 1
        ? new Response(JSON.stringify({ message: 'unavailable' }), { status: 503, headers: { 'Content-Type': 'application/json' } })
        : new Response(JSON.stringify({ data: [{ id: 'resend-selected-retry' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', resendFetch);
    const { app, links, submission } = await setup();
    const selected = await app.request(`http://localhost/api/speaker-submissions/${submission.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'selected' }),
    });
    expect(selected.status).toBe(200);
    const [failedLink] = await links.getSpeakerIntakeLinksByEvent(event.id);
    expect(failedLink).toMatchObject({ email_status: 'failed' });
    const retry = await app.request('http://localhost/api/internal/selected-speaker-emails/retry', {
      method: 'POST', headers: { 'x-scheduled-job-secret': 'test-scheduled-speaker-email-job-secret-2026' },
    });
    expect(retry.status).toBe(200);
    await expect(retry.json()).resolves.toMatchObject({ ok: true, accepted: [submission.id], failed: [] });
    const [acceptedLink] = await links.getSpeakerIntakeLinksByEvent(event.id);
    expect(acceptedLink).toMatchObject({ id: failedLink.id, email_status: 'accepted', email_provider_id: 'resend-selected-retry' });
    expect(resendFetch.mock.calls[0]?.[1]?.headers).toMatchObject({ 'Idempotency-Key': acceptedLink.email_idempotency_key });
    expect(resendFetch.mock.calls[1]?.[1]?.headers).toMatchObject({ 'Idempotency-Key': acceptedLink.email_idempotency_key });
  });

  it('continues resolving already-issued long selected-speaker capabilities', async () => {
    const { app, links, submissions, submission } = await setup();
    const linkId = 'd82e328d-9bd8-446a-9bec-2fd0605f67fc';
    const code = legacySelectedSpeakerShortCode(linkId, event.id, 'test-speaker-intake-link-secret-2026');
    await links.createSpeakerIntakeLink({
      id: linkId,
      token: code,
      event_id: event.id,
      event_month: '2026-08',
      expires_at: '2099-01-01T00:00:00.000Z',
      purpose: 'selected_speaker_confirmation',
      speaker_submission_id: submission.id,
      speaker_name: submission.speaker_name,
      speaker_email: submission.speaker_email,
      talk_title: submission.title,
    });
    await submissions.updateSpeakerSubmission(submission.id, {
      status: 'selected',
      selected_intake_link_id: linkId,
    });

    const response = await app.request(`http://localhost/api/internal/short-links/${code}`, {
      headers: { 'x-short-link-resolver-token': 'test-short-link-resolver-token-2026' },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      destination_path: `/speaker-talks/${event.id}/${code}`,
    });
  });

  it('previews the exact personalized rejection message without sending it', async () => {
    const resendFetch = vi.fn();
    vi.stubGlobal('fetch', resendFetch);
    const { app, submission } = await setup();

    const response = await app.request(`http://localhost/api/speaker-submissions/${submission.id}/rejection-email/preview`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      submission_id: submission.id,
      from: 'DevCongress Speakers <speakers@updates.devcongress.org>',
      to: 'Ama Boateng <ama@example.com>',
      subject: 'Update on your presentation proposal for DevCongress August Meetup',
      text: expect.stringContaining('Thank you for submitting “Designing Reliable Systems”'),
      html: expect.stringContaining('we will not be moving forward with this proposal'),
    });
    expect(resendFetch).not.toHaveBeenCalled();
  });

  it('automatically sends the rejection email once and keeps the decision final', async () => {
    const resendFetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ data: [{ id: 'resend-rejected-1' }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', resendFetch);
    const { app, submissions, submission } = await setup();
    const reject = await app.request(`http://localhost/api/speaker-submissions/${submission.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'not_selected' }),
    });
    expect(reject.status).toBe(200);
    await expect(reject.json()).resolves.toMatchObject({
      submission: { status: 'not_selected' },
      decision_email: { status: 'pending' },
    });
    expect(resendFetch).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(resendFetch.mock.calls[0]?.[1]?.body));
    expect(payload).toEqual([expect.objectContaining({
      from: 'DevCongress Speakers <speakers@updates.devcongress.org>',
      to: ['ama@example.com'],
      reply_to: 'hello@devcongress.org',
      subject: 'Update on your presentation proposal for DevCongress August Meetup',
    })]);
    await expect(submissions.getSpeakerSubmissionById(submission.id)).resolves.toMatchObject({
      decision_email_status: 'accepted',
      decision_email_provider_id: 'resend-rejected-1',
      decision_email_idempotency_key: `speaker-rejected-${submission.id}`,
    });

    const approve = await app.request(`http://localhost/api/speaker-submissions/${submission.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'selected' }),
    });
    expect(approve.status).toBe(409);
  });

  it('does not finalize a rejection when speaker email is not configured', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    const { app, submissions, submission } = await setup();
    const response = await app.request(`http://localhost/api/speaker-submissions/${submission.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'not_selected' }),
    });
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'Speaker email sending is not configured. The proposal was not rejected.',
    });
    await expect(submissions.getSpeakerSubmissionById(submission.id)).resolves.toMatchObject({
      status: 'submitted',
      decision_email_status: null,
    });
  });

  it('retries a failed automatic rejection email from the scheduled drain', async () => {
    const resendFetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Temporary provider failure' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: 'resend-rejected-retry' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));
    vi.stubGlobal('fetch', resendFetch);
    const { app, submissions, submission } = await setup();
    const rejected = await app.request(`http://localhost/api/speaker-submissions/${submission.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'not_selected' }),
    });
    expect(rejected.status).toBe(200);
    await expect(submissions.getSpeakerSubmissionById(submission.id)).resolves.toMatchObject({
      decision_email_status: 'failed',
    });

    const retry = await app.request('http://localhost/api/internal/speaker-rejection-emails/retry', {
      method: 'POST',
      headers: { 'x-scheduled-job-secret': 'test-scheduled-speaker-email-job-secret-2026' },
    });
    expect(retry.status).toBe(200);
    await expect(retry.json()).resolves.toMatchObject({
      ok: true,
      accepted: [submission.id],
      failed: [],
    });
    expect(resendFetch).toHaveBeenCalledTimes(2);
    await expect(submissions.getSpeakerSubmissionById(submission.id)).resolves.toMatchObject({
      decision_email_status: 'accepted',
      decision_email_provider_id: 'resend-rejected-retry',
    });
  });

  it('sends automatically once and suppresses a later manual duplicate', async () => {
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
    await expect(first.json()).resolves.toMatchObject({ sent_count: 0, already_sent_count: 1 });
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
