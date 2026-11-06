import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  insert: vi.fn(), rpc: vi.fn(), session: vi.fn(), verify: vi.fn(), member: vi.fn(), email: vi.fn(), send: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ getSupabaseAdminClient: () => ({ from: () => ({ upsert: mocks.insert }), rpc: mocks.rpc }) }));
vi.mock('@/lib/supabase/admin-auth', () => ({
  assertAdminOrigin: (c: { req: { header: (key: string) => string | undefined } }) => c.req.header('origin') === 'https://events.example' ? null : new Response('Forbidden', { status: 403 }),
  getAdminSession: mocks.session, recordAdminAudit: vi.fn(),
}));
vi.mock('@/server/env', () => ({ envValue: (name: string) => ({
  PUBLIC_FRONTEND_ORIGIN: 'https://events.example', SLACK_EVENT_SUBMISSION_SIGNING_SECRET: 's'.repeat(32),
  SLACK_EVENT_SUBMISSION_BOT_TOKEN: 'x'.repeat(24), SLACK_EVENT_SUBMISSION_TEAM_ID: 'T12345678',
  SLACK_EVENT_SUBMISSION_APP_ID: 'A12345678', SLACK_EVENT_SUBMISSION_CHANNEL_ID: 'C12345678',
} as Record<string, string>)[name] }));
vi.mock('./slack-moderation', async (importOriginal) => ({ ...(await importOriginal()), verifySlackSignature: mocks.verify, privateSlackChannelMember: mocks.member, slackReviewerEmail: mocks.email }));

import { confirmSlackReviewerLink, slackReviewerAllowMe } from './slack-account-link';

const app = new Hono();

app.post('/allow', slackReviewerAllowMe);
app.post('/confirm', confirmSlackReviewerLink);

function command(overrides: Record<string, string> = {}) {
  return new URLSearchParams({ team_id: 'T12345678', api_app_id: 'A12345678', channel_id: 'C12345678', user_id: 'U12345678', command: '/allow-me', text: '', response_url: 'https://hooks.slack.com/commands/T123/123/secret', ...overrides }).toString();
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verify.mockResolvedValue(true);
  mocks.insert.mockResolvedValue({ error: null });
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  mocks.session.mockResolvedValue({ authenticated: true, membership_id: 'member', role: 'organizer' });
  mocks.member.mockResolvedValue(true);
  mocks.email.mockResolvedValue('reviewer@example.com');
  vi.stubGlobal('fetch', mocks.send.mockResolvedValue(new Response('ok')));
});

describe('Slack reviewer account linking', () => {
  async function enroll() {
    const tasks: Promise<unknown>[] = [];
    const response = await app.fetch(new Request('https://events.example/allow', { method: 'POST', body: command() }), {}, {
      waitUntil: (task: Promise<unknown>) => tasks.push(task), passThroughOnException: () => undefined, props: {},
    } as never);
    const ack = await response.json() as { text: string };

    await Promise.all(tasks);
    const sent = JSON.parse(mocks.send.mock.calls[0][1].body as string) as { response_type: string; text: string };

    return { ack, sent };
  }

  it('grants Slack-only access and offers an ephemeral fragment link with only a hash persisted', async () => {
    mocks.rpc.mockResolvedValue({ data: 'granted', error: null });
    const { ack, sent } = await enroll();
    const token = sent.text.match(/#([a-f0-9]{64})/)?.[1];

    expect(ack.text).toContain('Checking');
    expect(sent.response_type).toBe('ephemeral');
    expect(sent.text).toContain('Slack moderation is enabled');
    expect(token).toBeDefined();
    expect(mocks.insert.mock.calls[0][0]).toMatchObject({ team_id: 'T12345678', slack_user_id: 'U12345678' });
    expect(mocks.insert.mock.calls[0][0].token_hash).not.toBe(token);
  });

  it('requires an EMS link for a matching email and handles existing eligible links', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: 'link_required', error: null });
    expect((await enroll()).sent.text).toContain('needs to be connected');
    mocks.send.mockClear();
    mocks.rpc.mockResolvedValueOnce({ data: 'linked', error: null });
    expect((await enroll()).sent.text).toContain('already moderate');
  });

  it('denies nonmembers and inactive links, but offers organizer linking when Slack email is unavailable', async () => {
    mocks.member.mockResolvedValueOnce(false);
    expect((await enroll()).sent.text).toContain('active member');
    expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.send.mockClear();
    mocks.email.mockResolvedValueOnce(null);
    expect((await enroll()).sent.text).toContain('Slack moderation could not be enabled');
    expect(mocks.send.mock.calls[0][1].body).toContain('Connect your organizer account');
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.insert).toHaveBeenCalledOnce();
    mocks.insert.mockClear();
    mocks.send.mockClear();
    mocks.rpc.mockResolvedValueOnce({ data: 'denied', error: null });
    expect((await enroll()).sent.text).toContain('not eligible');
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('refuses unsigned, wrong channel, app, user, and email-bearing commands', async () => {
    mocks.verify.mockResolvedValueOnce(false);
    expect((await app.request('/allow', { method: 'POST', body: command() })).status).toBe(401);
    for (const override of <Record<string, string>[]>[{ channel_id: 'C99999999' }, { api_app_id: 'A99999999' }, { user_id: 'bad' }, { text: 'person@example.com' }, { response_url: 'https://hooks.slack.com.evil.example/commands/T/1/x' }, { response_url: 'https://hooks.slack.com/commands/T/1/x?redirect=evil' }]) {
      await app.request('/allow', { method: 'POST', body: command(override) });
    }
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('requires same-origin authenticated organizer confirmation and rejects expired or consumed tokens', async () => {
    const request = (origin = 'https://events.example') => app.request('/confirm', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ token: 'a'.repeat(64) }) });

    expect((await request('https://evil.example')).status).toBe(403);
    mocks.session.mockResolvedValueOnce({ authenticated: false });
    expect((await request()).status).toBe(401);
    mocks.session.mockResolvedValueOnce({ authenticated: true, membership_id: 'member', role: 'volunteer' });
    expect((await request()).status).toBe(403);
    mocks.rpc.mockResolvedValueOnce({ data: false, error: null });
    expect((await request()).status).toBe(400);
    expect((await request()).status).toBe(200);
    expect(mocks.rpc.mock.calls[0][1].p_token_hash).not.toBe('a'.repeat(64));
  });
});
