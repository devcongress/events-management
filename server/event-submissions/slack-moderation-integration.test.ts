import { createHmac } from 'node:crypto';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExecutionContext } from 'hono';

const state = vi.hoisted(() => ({
  review: vi.fn(),
  fetch: vi.fn(),
  memberStatus: 'active',
  cardExists: true,
  deliveredStatus: 'pending',
  submissionStatus: 'approved',
  linked: true,
  tombstoned: false,
  grantQueries: 0,
  granted: true,
  emailMatch: false,
  updates: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/lib/supabase/server', async (importOriginal) => ({
  ...(await importOriginal()),
  getSupabaseAdminClient: () => ({
    rpc: async (name: string) => ({ data: name === 'claim_event_submission_slack_card' ? true : [{ submission_id: 'submission-1' }], error: null }),
    from: (table: string) => {
      let operation = 'select';
      let values: Record<string, unknown> = {};
      const query = {
        select: () => query,
        update: (input: Record<string, unknown>) => { operation = 'update'; values = input;

 return query; },
        eq: () => query,
        maybeSingle: async () => {
          if (table === 'event_submission_slack_cards') return { data: state.cardExists ? { submission_id: 'submission-1', channel_id: 'C12345678', message_ts: '1700000000.123456', delivered_status: state.deliveredStatus, payload: { text: 'New event', blocks: [{ type: 'actions', elements: [{ url: 'https://events.example/review' }, { action_id: 'submission_approve' }] }] } } : null, error: null };
          if (table === 'event_submission_slack_identities') return { data: state.tombstoned ? { membership_id: null } : state.linked ? { membership_id: 'member-1' } : null, error: null };
          if (table === 'event_submission_slack_grants') {
            state.grantQueries += 1;

            return { data: state.granted ? { slack_user_id: 'U12345678' } : null, error: null };
          }
          if (table === 'admin_memberships') return { data: state.linked ? { email: 'organizer@example.com', role: 'organizer', status: state.memberStatus } : state.emailMatch ? { id: 'member-2' } : null, error: null };
          if (table === 'event_submissions') return { data: { review_status: state.submissionStatus }, error: null };

          throw new Error(`Unexpected table: ${table}`);
        },
        then: (resolve: (result: { error: null }) => void) => {
          if (operation === 'update') {
            state.updates.push(values);
            if (typeof values.delivered_status === 'string') state.deliveredStatus = values.delivered_status;
          }
          resolve({ error: null });
        },
      };

      return query;
    },
  }),
}));
vi.mock('./request-adapter', () => ({ createEventSubmissionRequestAdapter: () => ({ review: state.review }) }));

import app from '@/server/app';
import { privateSlackChannelMember, retrySubmissionCards, slackModerationConfig } from './slack-moderation';
import { callSlackWebApi } from '@/lib/email/slack';

const env = {
  SLACK_EVENT_SUBMISSION_SIGNING_SECRET: 's'.repeat(32),
  SLACK_EVENT_SUBMISSION_BOT_TOKEN: 'x'.repeat(24),
  SLACK_EVENT_SUBMISSION_TEAM_ID: 'T12345678',
  SLACK_EVENT_SUBMISSION_APP_ID: 'A12345678',
  SLACK_EVENT_SUBMISSION_CHANNEL_ID: 'C12345678',
};

function payload(action = 'submission_approve') {
  return { type: 'block_actions', team: { id: env.SLACK_EVENT_SUBMISSION_TEAM_ID }, api_app_id: env.SLACK_EVENT_SUBMISSION_APP_ID, user: { id: 'U12345678' }, channel: { id: env.SLACK_EVENT_SUBMISSION_CHANNEL_ID }, message: { ts: '1700000000.123456' }, actions: [{ action_id: action, value: 'submission-1' }], trigger_id: 'trigger' };
}

async function callback(body: string, tamper = false) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = `v0=${createHmac('sha256', env.SLACK_EVENT_SUBMISSION_SIGNING_SECRET).update(`v0:${timestamp}:${body}`).digest('hex')}`;
  const tasks: Promise<unknown>[] = [];
  const context = { waitUntil: (task: Promise<unknown>) => { tasks.push(task); }, passThroughOnException: () => undefined, props: {} } as ExecutionContext;
  const request = new Request('https://events.example/api/webhooks/slack/event-submissions', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-slack-request-timestamp': timestamp, 'x-slack-signature': signature }, body: tamper ? `${body}x` : body,
  });
  const response = await app.fetch(request, env, context);

  await Promise.all(tasks);

  return response;
}

beforeEach(() => {
  state.review.mockReset().mockResolvedValue({ submission: { id: 'submission-1' } });
  state.fetch.mockReset().mockImplementation(async (url) => {
    const method = new URL(String(url)).pathname;
    const result = method.endsWith('conversations.info') ? { ok: true, channel: { id: 'C12345678', is_private: true } }
      : method.endsWith('conversations.members') ? { ok: true, members: ['U12345678'] } : { ok: true };

    return new Response(JSON.stringify(result), { headers: { 'content-type': 'application/json' } });
  });
  vi.stubGlobal('fetch', state.fetch);
  state.memberStatus = 'active';
  state.cardExists = true;
  state.deliveredStatus = 'pending';
  state.submissionStatus = 'approved';
  state.linked = true;
  state.tombstoned = false;
  state.grantQueries = 0;
  state.granted = true;
  state.emailMatch = false;
  state.updates = [];
});

afterEach(() => vi.unstubAllGlobals());

describe('Slack moderation HTTP integration', () => {
  it('rejects a modified signed body before any decision', async () => {
    const body = new URLSearchParams({ payload: JSON.stringify(payload()) }).toString();

    expect((await callback(body, true)).status).toBe(401);
    expect(state.review).not.toHaveBeenCalled();
  });

  it('acknowledges signed review-link actions without attempting a decision', async () => {
    const review = payload('submission_review');

    review.actions = [{ action_id: 'submission_review', value: '' }];
    const body = new URLSearchParams({ payload: JSON.stringify(review) }).toString();

    expect((await callback(body)).status).toBe(200);
    expect(state.review).not.toHaveBeenCalled();
  });

  it('uses the documented GET query for private channel lookup', async () => {
    await callSlackWebApi({ method: 'conversations.info', botToken: env.SLACK_EVENT_SUBMISSION_BOT_TOKEN, payload: { channel: env.SLACK_EVENT_SUBMISSION_CHANNEL_ID } });
    const [url, options] = state.fetch.mock.calls[0];

    expect(new URL(String(url)).searchParams.get('channel')).toBe(env.SLACK_EVENT_SUBMISSION_CHANNEL_ID);
    expect((options as RequestInit).method).toBe('GET');
    expect((options as RequestInit).body).toBeUndefined();
  });

  it('follows Slack channel membership cursors and denies shared channels', async () => {
    let shared = false;

    state.fetch.mockImplementation(async (url) => {
      const request = new URL(String(url));
      const result = request.pathname.endsWith('conversations.info') ? { ok: true, channel: { id: 'C12345678', is_private: true, is_shared: shared } }
        : request.searchParams.has('cursor') ? { ok: true, members: ['U12345678'], response_metadata: { next_cursor: '' } }
          : { ok: true, members: [], response_metadata: { next_cursor: 'next' } };

      return new Response(JSON.stringify(result), { headers: { 'content-type': 'application/json' } });
    });
    const config = slackModerationConfig((name) => env[name as keyof typeof env])!;

    expect(await privateSlackChannelMember(config, 'U12345678')).toBe(true);
    shared = true;
    expect(await privateSlackChannelMember(config, 'U12345678')).toBe(false);
  });

  it('validates rejection fields and forwards private notes only to the lifecycle', async () => {
    const submission = {
      type: 'view_submission', team: { id: env.SLACK_EVENT_SUBMISSION_TEAM_ID }, api_app_id: env.SLACK_EVENT_SUBMISSION_APP_ID, user: { id: 'U12345678' },
      view: { callback_id: 'submission_rejection', private_metadata: JSON.stringify({ submissionId: 'submission-1', channelId: env.SLACK_EVENT_SUBMISSION_CHANNEL_ID, messageTs: '1700000000.123456' }), state: { values: { category: { value: { selected_option: { value: 'duplicate' } } }, message: { value: { value: 'Please resubmit' } }, note: { value: { value: 'Private note' } } } } },
    };
    const body = new URLSearchParams({ payload: JSON.stringify(submission) }).toString();

    state.submissionStatus = 'rejected';
    expect((await callback(body)).status).toBe(200);
    expect(state.review).toHaveBeenCalledWith(expect.objectContaining({ command: { kind: 'reject', category: 'duplicate', organizerMessage: 'Please resubmit', internalNote: 'Private note' } }));
    expect(JSON.stringify(state.fetch.mock.calls)).not.toContain('Private note');
    expect(state.deliveredStatus).toBe('rejected');
  });

  it('checks active membership and the stored card before invoking the lifecycle', async () => {
    const body = new URLSearchParams({ payload: JSON.stringify(payload()) }).toString();

    state.memberStatus = 'disabled';
    expect((await callback(body)).status).toBe(200);
    expect(state.review).not.toHaveBeenCalled();
    expect(state.fetch.mock.calls.some(([url]) => String(url).includes('chat.postEphemeral'))).toBe(true);
    state.memberStatus = 'active';
    state.cardExists = false;
    await callback(body);
    expect(state.review).not.toHaveBeenCalled();
    state.cardExists = true;
    await callback(body);
    expect(state.review).toHaveBeenCalledWith(expect.objectContaining({ command: { kind: 'approve', publish: true }, actor: { email: 'organizer@example.com', role: 'organizer' } }));
    expect(state.deliveredStatus).toBe('approved');
  });

  it.each(['submission_approve', 'submission_reject_view'])('allows a granted Slack-only reviewer to decide: %s', async (kind) => {
    state.linked = false;
    state.submissionStatus = kind === 'submission_approve' ? 'approved' : 'rejected';
    state.fetch.mockImplementation(async (url) => {
      const method = new URL(String(url)).pathname;
      const result = method.endsWith('conversations.info') ? { ok: true, channel: { id: 'C12345678', is_private: true } }
        : method.endsWith('conversations.members') ? { ok: true, members: ['U12345678'] }
          : method.endsWith('users.info') ? { ok: true, user: { id: 'U12345678', team_id: 'T12345678', deleted: false, is_bot: false, is_email_confirmed: true, profile: { email: 'slack@example.com' } } }
            : { ok: true };

      return new Response(JSON.stringify(result), { headers: { 'content-type': 'application/json' } });
    });
    const action = kind === 'submission_approve' ? payload() : {
      type: 'view_submission', team: { id: 'T12345678' }, api_app_id: 'A12345678', user: { id: 'U12345678' },
      view: { callback_id: 'submission_rejection', private_metadata: JSON.stringify({ submissionId: 'submission-1', channelId: 'C12345678', messageTs: '1700000000.123456' }), state: { values: { category: { value: { selected_option: { value: 'duplicate' } } } } } },
    };

    await callback(new URLSearchParams({ payload: JSON.stringify(action) }).toString());
    expect(state.review).toHaveBeenCalledWith(expect.objectContaining({ actor: { email: 'slack@example.com', role: null }, command: expect.objectContaining({ kind: kind === 'submission_approve' ? 'approve' : 'reject' }) }));
    expect(state.deliveredStatus).toBe(state.submissionStatus);
  });

  it('denies a deleted linked membership even when a Slack-only grant remains', async () => {
    state.tombstoned = true;
    state.granted = true;
    await callback(new URLSearchParams({ payload: JSON.stringify(payload()) }).toString());
    expect(state.review).not.toHaveBeenCalled();
    expect(state.grantQueries).toBe(0);
  });

  it('rejects a linked EMS organizer who has left the private channel', async () => {
    state.fetch.mockImplementation(async (url) => {
      const method = new URL(String(url)).pathname;
      const result = method.endsWith('conversations.info') ? { ok: true, channel: { id: 'C12345678', is_private: true } }
        : method.endsWith('conversations.members') ? { ok: true, members: [] } : { ok: true };

      return new Response(JSON.stringify(result), { headers: { 'content-type': 'application/json' } });
    });
    await callback(new URLSearchParams({ payload: JSON.stringify(payload()) }).toString());
    expect(state.review).not.toHaveBeenCalled();
  });

  it('rejects ungranted reviewers, absent channel members, unavailable email, and unlinked EMS email matches', async () => {
    state.linked = false;
    let members: string[] = [];
    let email: string | undefined = 'slack@example.com';
    let confirmed = true;

    state.fetch.mockImplementation(async (url) => {
      const method = new URL(String(url)).pathname;
      const result = method.endsWith('conversations.info') ? { ok: true, channel: { id: 'C12345678', is_private: true } }
        : method.endsWith('conversations.members') ? { ok: true, members }
          : method.endsWith('users.info') ? { ok: true, user: { id: 'U12345678', team_id: 'T12345678', deleted: false, is_bot: false, is_email_confirmed: confirmed, profile: { email } } }
            : { ok: true };

      return new Response(JSON.stringify(result), { headers: { 'content-type': 'application/json' } });
    });
    const body = new URLSearchParams({ payload: JSON.stringify(payload()) }).toString();

    state.granted = false;
    await callback(body);
    state.granted = true;
    await callback(body);
    members = ['U12345678'];
    email = undefined;
    await callback(body);
    email = 'slack@example.com';
    confirmed = false;
    await callback(body);
    confirmed = true;
    state.emailMatch = true;
    await callback(body);
    expect(state.review).not.toHaveBeenCalled();
  });

  it('keeps a failed card update eligible for retry and preserves the review link', async () => {
    let failUpdate = true;

    state.fetch.mockImplementation(async (url) => {
      const method = new URL(String(url)).pathname;
      const result = method.endsWith('conversations.info') ? { ok: true, channel: { id: 'C12345678', is_private: true } }
        : method.endsWith('conversations.members') ? { ok: true, members: ['U12345678'] }
          : method.endsWith('chat.update') && failUpdate ? { ok: false, error: 'ratelimited' } : { ok: true };

      if (method.endsWith('chat.update')) failUpdate = false;

      return new Response(JSON.stringify(result), { headers: { 'content-type': 'application/json' } });
    });
    const body = new URLSearchParams({ payload: JSON.stringify(payload()) }).toString();

    await callback(body);
    expect(state.review).toHaveBeenCalledOnce();
    expect(state.deliveredStatus).toBe('pending');
    expect(state.updates).toContainEqual({ sync_token: null, sync_until: null });
    const retryApp = new Hono();

    retryApp.post('/retry', async (c) => {
      await retrySubmissionCards(c, slackModerationConfig((name) => env[name as keyof typeof env])!);

      return c.body(null, 204);
    });
    await retryApp.request('/retry', { method: 'POST' });
    expect(state.deliveredStatus).toBe('approved');
    const update = state.fetch.mock.calls.filter(([url]) => String(url).endsWith('chat.update')).at(-1)!;
    const sent = JSON.parse((update[1] as RequestInit).body as string);

    expect(JSON.stringify(sent.blocks)).toContain('https://events.example/review');
    expect(JSON.stringify(sent.blocks)).not.toContain('submission_approve');
  });
});
