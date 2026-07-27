import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

const event = {
  id: 'event-july',
  name: 'DevCongress July Meetup',
  description: null,
  event_date: '2026-07-25T10:00:00.000Z',
  series_type: 'monthly',
  status: 'completed',
  publish_to_website: true,
  schedule: [
    {
      time: '11:00',
      title: 'Reliable Workers',
      type: 'talk',
      lead: 'Ama Mensah',
      resources: [],
    },
    {
      time: '12:00',
      title: 'A useful product demo',
      type: 'product_demo',
      lead: 'Kojo Owusu',
      resources: [],
    },
  ],
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-01T00:00:00.000Z',
};

async function importEmailModules() {
  vi.resetModules();
  const app = (await import('./app')).default;
  const links = await import('../lib/mock-db/speaker-intake-links');
  return { app, links };
}

function requestSpeakerEmails(app: { request: (input: string, init?: RequestInit) => Response | Promise<Response> }, body: unknown) {
  return Promise.resolve(app.request(
    `http://localhost/api/events/${event.id}/speaker-intake-emails`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  ));
}

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'devcon-speaker-email-'));
  process.chdir(tempRoot);
  await fs.mkdir('data');
  await fs.writeFile(path.join(tempRoot, 'data', 'events.json'), JSON.stringify([event]), 'utf-8');
  vi.stubEnv('APP_DATA_SOURCE', 'local-json');
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('RESEND_API_KEY', 're_test');
  vi.stubEnv('SPEAKER_EMAIL_FROM', 'DevCongress Monthly Speakers <speakers@updates.devcongress.org>');
  vi.stubEnv('SPEAKER_EMAIL_REPLY_TO', 'hello@devcongress.org');
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  process.chdir(originalCwd);
  await fs.rm(tempRoot, { recursive: true, force: true });
});

describe('speaker intake email API', () => {
  it('sends organizer-provided recipient emails once and records the accepted state', async () => {
    const resendFetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
      data: [{ id: 'resend-ama' }, { id: 'resend-kojo' }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', resendFetch);
    const { app, links } = await importEmailModules();

    const firstResponse = await requestSpeakerEmails(app, {
      recipients: [
        { program_item_index: 0, speaker_email: 'ama@example.com' },
        { program_item_index: 1, speaker_email: 'kojo@example.com' },
      ],
      expires_in_days: 7,
    });

    expect(firstResponse.status).toBe(200);
    await expect(firstResponse.json()).resolves.toMatchObject({
      sent_count: 2,
      already_sent_count: 0,
    });
    expect(resendFetch).toHaveBeenCalledTimes(1);
    const [, resendRequest] = resendFetch.mock.calls[0];
    const resendPayload = JSON.parse(String(resendRequest?.body));
    expect(resendPayload).toEqual([
      expect.objectContaining({
        from: 'DevCongress Monthly Speakers <speakers@updates.devcongress.org>',
        to: ['ama@example.com'],
        subject: 'Your DevCongress archive link',
        html: expect.stringContaining('/speaker-talks/event-july/'),
      }),
      expect.objectContaining({
        to: ['kojo@example.com'],
        html: expect.stringContaining('/speaker-talks/event-july/'),
      }),
    ]);
    await expect(links.getSpeakerIntakeLinksByEvent(event.id)).resolves.toEqual([
      expect.objectContaining({
        speaker_email: 'kojo@example.com',
        talk_title: 'A useful product demo',
        email_status: 'accepted',
        email_provider_id: 'resend-kojo',
      }),
      expect.objectContaining({
        speaker_email: 'ama@example.com',
        talk_title: 'Reliable Workers',
        email_status: 'accepted',
        email_provider_id: 'resend-ama',
      }),
    ]);

    const duplicateResponse = await requestSpeakerEmails(app, {
      recipients: [
        { program_item_index: 0, speaker_email: 'different@example.com' },
        { program_item_index: 1, speaker_email: 'kojo@example.com' },
      ],
      expires_in_days: 7,
    });

    expect(duplicateResponse.status).toBe(200);
    await expect(duplicateResponse.json()).resolves.toMatchObject({
      sent_count: 0,
      already_sent_count: 2,
    });
    expect(resendFetch).toHaveBeenCalledTimes(1);
  });

  it('keeps a rejected provider request retryable with the same private link', async () => {
    const resendFetch = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(new Response('{}', { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{ id: 'resend-retry' }],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));
    vi.stubGlobal('fetch', resendFetch);
    const { app, links } = await importEmailModules();
    const send = () => requestSpeakerEmails(app, {
      recipients: [{ program_item_index: 0, speaker_email: 'ama@example.com' }],
      expires_in_days: 7,
    });

    const failedResponse = await send();
    expect(failedResponse.status).toBe(502);
    const [failedLink] = await links.getSpeakerIntakeLinksByEvent(event.id);
    expect(failedLink).toMatchObject({ email_status: 'failed' });

    const retryResponse = await send();
    expect(retryResponse.status).toBe(200);
    await expect(retryResponse.json()).resolves.toMatchObject({ sent_count: 1 });
    const [acceptedLink] = await links.getSpeakerIntakeLinksByEvent(event.id);
    expect(acceptedLink).toMatchObject({
      id: failedLink.id,
      token: failedLink.token,
      email_status: 'accepted',
      email_provider_id: 'resend-retry',
    });
    expect(resendFetch.mock.calls[0][1]?.headers).toEqual(expect.objectContaining({
      'Idempotency-Key': expect.any(String),
    }));
    expect(resendFetch.mock.calls[1][1]?.headers).toEqual(expect.objectContaining({
      'Idempotency-Key': resendFetch.mock.calls[0][1]?.headers
        ? (resendFetch.mock.calls[0][1]!.headers as Record<string, string>)['Idempotency-Key']
        : '',
    }));
  });

  it('rejects an invalid organizer-provided email before calling Resend', async () => {
    const resendFetch = vi.fn();
    vi.stubGlobal('fetch', resendFetch);
    const { app, links } = await importEmailModules();

    const response = await requestSpeakerEmails(app, {
      recipients: [{ program_item_index: 0, speaker_email: 'not-an-email' }],
      expires_in_days: 7,
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Presenter email must be valid',
    });
    expect(resendFetch).not.toHaveBeenCalled();
    await expect(links.getSpeakerIntakeLinksByEvent(event.id)).resolves.toEqual([]);
  });
});
