import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'crypto';
import { eventSubmissionReplyAddress, htmlToPlainText } from '@/lib/email/event-submission-replies';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  list: vi.fn(),
  approve: vi.fn(),
  reject: vi.fn(),
  pendingEmails: vi.fn(),
  updateEmail: vi.fn(),
  insertReply: vi.fn(),
  updateReplySlack: vi.fn(),
  rateLimit: vi.fn(),
  audit: vi.fn(),
}));

vi.mock('@/lib/supabase/event-submissions', async () => {
  const actual = await vi.importActual<typeof import('@/lib/supabase/event-submissions')>('@/lib/supabase/event-submissions');
  return {
    ...actual,
    createEventSubmission: mocks.create,
    listEventSubmissions: mocks.list,
    approveEventSubmission: mocks.approve,
    rejectEventSubmission: mocks.reject,
    getPendingEventSubmissionEmails: mocks.pendingEmails,
    insertEventSubmissionReply: mocks.insertReply,
    updateEventSubmissionReplySlackStatus: mocks.updateReplySlack,
    updateEventSubmissionEmailDelivery: mocks.updateEmail,
  };
});

vi.mock('@/lib/public-rate-limit', async () => {
  const actual = await vi.importActual<typeof import('@/lib/public-rate-limit')>('@/lib/public-rate-limit');
  return { ...actual, consumePublicRateLimit: mocks.rateLimit };
});

vi.mock('@/lib/supabase/admin-auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/supabase/admin-auth')>('@/lib/supabase/admin-auth');
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
    recordAdminAudit: mocks.audit,
  };
});

const submission = {
  id: '10000000-0000-4000-8000-000000000001',
  title: 'Community systems workshop',
  summary: 'A practical workshop for engineers building reliable distributed systems.',
  format: 'workshop' as const,
  starts_at: '2099-09-20T09:00:00.000Z',
  ends_at: '2099-09-20T13:00:00.000Z',
  timezone: 'Africa/Accra',
  location_type: 'in_person' as const,
  venue_name: 'Impact Hub Accra',
  venue_address: 'Osu, Accra',
  online_url: null,
  registration_url: 'https://example.com/register',
  organizer_name: 'Community Builders Ghana',
  organizer_email: 'hello@example.com',
  organizer_website: 'https://example.com',
  notes: null,
  source_app: 'website' as const,
  review_status: 'pending' as const,
  reviewed_by: null,
  reviewed_at: null,
  rejection_category: null,
  organizer_message: null,
  internal_note: null,
  email_deliveries: [],
  replies: [],
  approved_event_id: null,
  created_at: '2099-08-01T10:00:00.000Z',
  updated_at: '2099-08-01T10:00:00.000Z',
};

function validPayload() {
  return {
    title: submission.title,
    summary: submission.summary,
    format: submission.format,
    starts_at: submission.starts_at,
    ends_at: submission.ends_at,
    timezone: submission.timezone,
    location_type: submission.location_type,
    venue_name: submission.venue_name,
    venue_address: submission.venue_address,
    registration_url: submission.registration_url,
    organizer_name: submission.organizer_name,
    organizer_email: submission.organizer_email,
    organizer_website: submission.organizer_website,
    turnstile_action: 'event_submission',
    turnstile_token: '',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('APP_DATA_SOURCE', 'local-json');
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('PUBLIC_EVENT_SUBMISSIONS_ENABLED', 'true');
  vi.stubEnv('TURNSTILE_SECRET_KEY', '');
  mocks.create.mockResolvedValue(submission);
  mocks.list.mockResolvedValue([submission]);
  mocks.rateLimit.mockResolvedValue({ allowed: true });
  mocks.pendingEmails.mockResolvedValue([]);
  mocks.updateEmail.mockResolvedValue(undefined);
  mocks.insertReply.mockResolvedValue({
    created: true,
    reply: {
      id: 'reply-1',
      sender_email: 'hello@example.com',
      subject: 'Re: Community systems workshop',
      body_text: 'Thanks for the update.',
      received_at: '2099-08-02T10:00:00.000Z',
      attachments: [],
      slack_status: 'pending',
    },
  });
  mocks.updateReplySlack.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('community event submissions', () => {
  it('fails closed before validation, security providers, or persistence when intake is disabled', async () => {
    vi.stubEnv('PUBLIC_EVENT_SUBMISSIONS_ENABLED', 'false');
    const { default: app } = await import('./app');
    const response = await app.request('http://localhost/api/public/event-submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validPayload()),
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'submissions_disabled',
        message: 'Event submissions are not currently accepting new proposals.',
      },
    });
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('accepts a validated proposal as a pending receipt without trusting a source field', async () => {
    const { default: app } = await import('./app');
    const response = await app.request('http://localhost/api/public/event-submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validPayload()),
    });

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      data: { id: submission.id, status: 'pending', submitted_at: submission.created_at },
      meta: { version: 1 },
    });
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      organizer_email: 'hello@example.com',
      format: 'workshop',
    }), expect.anything());
    expect(mocks.create.mock.calls[0]?.[0]).not.toHaveProperty('source_app');
    expect(mocks.rateLimit).toHaveBeenCalledTimes(2);
  });

  it('keeps public submission titles unchanged when organizer event test mode is enabled', async () => {
    vi.stubEnv('EVENT_TEST_MODE', 'true');
    const { default: app } = await import('./app');
    const response = await app.request('http://localhost/api/public/event-submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validPayload()),
    });

    expect(response.status).toBe(202);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      title: submission.title,
    }), expect.anything());
  });

  it('attempts the durable receipt after accepting the public submission', async () => {
    vi.stubEnv('RESEND_API_KEY', 'resend-test-key');
    vi.stubEnv('EVENT_EMAIL_REPLY_TO', 'hello@devcongress.org');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      data: [{ id: 'email-receipt-1' }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    mocks.pendingEmails.mockResolvedValue([{
      delivery_id: 'delivery-receipt-1',
      submission_id: submission.id,
      idempotency_key: `event-submission-${submission.id}-receipt`,
      attempts: 0,
      kind: 'receipt',
      organizer_name: submission.organizer_name,
      organizer_email: submission.organizer_email,
      event_title: submission.title,
      starts_at: submission.starts_at,
      timezone: submission.timezone,
      registration_url: submission.registration_url,
      rejection_category: null,
      organizer_message: null,
    }]);

    const { default: app } = await import('./app');
    const response = await app.request('http://localhost/api/public/event-submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validPayload()),
    });

    expect(response.status).toBe(202);
    expect(mocks.pendingEmails).toHaveBeenCalledWith(expect.objectContaining({
      submissionId: submission.id,
      kinds: ['receipt'],
    }), expect.anything());
    expect(mocks.updateEmail).toHaveBeenCalledWith('delivery-receipt-1', {
      status: 'accepted',
      provider_id: 'email-receipt-1',
    }, expect.anything());
  });

  it('uses a signed submission-specific Reply-To when inbound routing is configured', async () => {
    vi.stubEnv('RESEND_API_KEY', 'resend-test-key');
    vi.stubEnv('EVENT_SUBMISSION_REPLY_DOMAIN', 'inbox.devcongress.org');
    vi.stubEnv('EVENT_SUBMISSION_REPLY_TOKEN_SECRET', 'reply-token-secret');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      data: [{ id: 'email-receipt-signed-1' }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    mocks.pendingEmails.mockResolvedValue([{
      delivery_id: 'delivery-receipt-signed-1',
      submission_id: submission.id,
      idempotency_key: `event-submission-${submission.id}-receipt`,
      attempts: 0,
      kind: 'receipt',
      organizer_name: submission.organizer_name,
      organizer_email: submission.organizer_email,
      event_title: submission.title,
      starts_at: submission.starts_at,
      timezone: submission.timezone,
      registration_url: submission.registration_url,
      rejection_category: null,
      organizer_message: null,
    }]);

    const { default: app } = await import('./app');
    await app.request('http://localhost/api/public/event-submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validPayload()),
    });

    const fetchMock = vi.mocked(fetch);
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(requestBody[0].reply_to).toBe(eventSubmissionReplyAddress({
      submissionId: submission.id,
      domain: 'inbox.devcongress.org',
      secret: 'reply-token-secret',
    }));
  });

  it('returns field-level errors before security providers or persistence are called', async () => {
    const { default: app } = await import('./app');
    const response = await app.request('http://localhost/api/public/event-submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validPayload(), venue_name: '', registration_url: '' }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'validation_failed', field_errors: { venue_name: expect.any(String) } },
    });
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('verifies the devcongress.org Turnstile hostname before consuming durable limits', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'turnstile-secret');
    vi.stubEnv('EVENT_SUBMISSION_TURNSTILE_EXPECTED_HOSTNAMES', 'devcongress.org,www.devcongress.org');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      success: true,
      action: 'event_submission',
      hostname: 'em.devcongress.org',
    }), { status: 200 })));
    const { default: app } = await import('./app');
    const response = await app.request('https://em.devcongress.org/api/public/event-submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validPayload(), turnstile_token: 'valid-looking-token' }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'verification_failed' } });
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('keeps organizer review routes authenticated and records an approval audit', async () => {
    mocks.approve.mockResolvedValue({
      ...submission,
      review_status: 'approved',
      approved_event_id: '20000000-0000-4000-8000-000000000001',
    });
    const { default: app } = await import('./app');
    const response = await app.request(
      `http://localhost/api/admin/event-submissions/${submission.id}/approve`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publish: true }),
      },
    );

    expect(response.status).toBe(200);
    expect(mocks.approve).toHaveBeenCalledWith(submission.id, 'organizer@devcongress.org', true, expect.anything());
    expect(mocks.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: 'event_submission.approve_and_publish',
      target_id: submission.id,
    }));
  });

  it('queues an approval notice and records provider acceptance without repeating approval', async () => {
    vi.stubEnv('RESEND_API_KEY', 'resend-test-key');
    vi.stubEnv('EVENT_EMAIL_REPLY_TO', 'hello@devcongress.org');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      data: [{ id: 'email-approved-1' }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    mocks.approve.mockResolvedValue({
      ...submission,
      review_status: 'approved',
      approved_event_id: '20000000-0000-4000-8000-000000000001',
    });
    mocks.pendingEmails.mockResolvedValue([{
      delivery_id: 'delivery-approved-1',
      submission_id: submission.id,
      idempotency_key: `event-submission-${submission.id}-approved`,
      attempts: 0,
      kind: 'approved',
      organizer_name: submission.organizer_name,
      organizer_email: submission.organizer_email,
      event_title: submission.title,
      starts_at: submission.starts_at,
      timezone: submission.timezone,
      registration_url: submission.registration_url,
      rejection_category: null,
      organizer_message: null,
    }]);

    const { default: app } = await import('./app');
    const response = await app.request(
      `http://localhost/api/admin/event-submissions/${submission.id}/approve`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publish: true }),
      },
    );

    expect(response.status).toBe(200);
    expect(mocks.approve).toHaveBeenCalledTimes(1);
    expect(mocks.pendingEmails).toHaveBeenCalledWith(expect.objectContaining({
      submissionId: submission.id,
      kinds: ['approved'],
    }), expect.anything());
    expect(mocks.updateEmail).toHaveBeenCalledWith('delivery-approved-1', {
      status: 'accepted',
      provider_id: 'email-approved-1',
    }, expect.anything());
  });

  it('keeps organizer-facing rejection copy separate from the private note', async () => {
    mocks.reject.mockResolvedValue({
      ...submission,
      review_status: 'rejected',
      rejection_category: 'calendar_fit',
      organizer_message: 'This calendar focuses on Ghana technology community events.',
      internal_note: 'Website could not be verified.',
    });
    const { default: app } = await import('./app');
    const response = await app.request(
      `http://localhost/api/admin/event-submissions/${submission.id}/reject`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: 'calendar_fit',
          organizer_message: 'This calendar focuses on Ghana technology community events.',
          internal_note: 'Website could not be verified.',
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(mocks.reject).toHaveBeenCalledWith(submission.id, 'organizer@devcongress.org', {
      category: 'calendar_fit',
      organizer_message: 'This calendar focuses on Ghana technology community events.',
      internal_note: 'Website could not be verified.',
    }, expect.anything());
    expect(mocks.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      metadata: {
        category: 'calendar_fit',
        organizer_message_provided: true,
        internal_note_provided: true,
      },
    }));
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain('Website could not be verified.');
  });

  it('retries only the failed email and keeps the moderation decision untouched', async () => {
    vi.stubEnv('RESEND_API_KEY', 'resend-test-key');
    vi.stubEnv('EVENT_EMAIL_REPLY_TO', 'hello@devcongress.org');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'quota' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    })));
    mocks.pendingEmails.mockResolvedValue([{
      delivery_id: 'delivery-rejected-1',
      submission_id: submission.id,
      idempotency_key: `event-submission-${submission.id}-rejected`,
      attempts: 1,
      kind: 'rejected',
      organizer_name: submission.organizer_name,
      organizer_email: submission.organizer_email,
      event_title: submission.title,
      starts_at: submission.starts_at,
      timezone: submission.timezone,
      registration_url: submission.registration_url,
      rejection_category: 'other',
      organizer_message: null,
    }]);

    const { default: app } = await import('./app');
    const response = await app.request(
      `http://localhost/api/admin/event-submissions/${submission.id}/emails/rejected/retry`,
      { method: 'POST' },
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: 'Email provider daily quota reached; delivery can be retried.',
    });
    expect(mocks.updateEmail).toHaveBeenCalledWith('delivery-rejected-1', {
      status: 'failed',
      last_error: 'Email provider daily quota reached; delivery can be retried.',
    }, expect.anything());
    expect(mocks.approve).not.toHaveBeenCalled();
    expect(mocks.reject).not.toHaveBeenCalled();
  });

  it('shows the provider reason when a submission email is rejected', async () => {
    vi.stubEnv('RESEND_API_KEY', 'resend-test-key');
    vi.stubEnv('EVENT_EMAIL_REPLY_TO', 'hello@updates.devcongress.org');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      message: 'The from address is not verified',
    }), {
      status: 422,
      headers: { 'Content-Type': 'application/json' },
    })));
    mocks.pendingEmails.mockResolvedValue([{
      delivery_id: 'delivery-rejected-detail-1',
      submission_id: submission.id,
      idempotency_key: `event-submission-${submission.id}-rejected-detail`,
      attempts: 1,
      kind: 'rejected',
      organizer_name: submission.organizer_name,
      organizer_email: submission.organizer_email,
      event_title: submission.title,
      starts_at: submission.starts_at,
      timezone: submission.timezone,
      registration_url: submission.registration_url,
      rejection_category: 'other',
      organizer_message: null,
    }]);

    const { default: app } = await import('./app');
    const response = await app.request(
      `http://localhost/api/admin/event-submissions/${submission.id}/emails/rejected/retry`,
      { method: 'POST' },
    );

    const error = 'Email provider rejected the message or recipient details; delivery can be retried after the details are corrected. Provider detail: The from address is not verified';
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error });
    expect(mocks.updateEmail).toHaveBeenCalledWith('delivery-rejected-detail-1', {
      status: 'failed',
      last_error: error,
    }, expect.anything());
  });

  it('stores a verified inbound reply and sends one Slack notification', async () => {
    vi.stubEnv('RESEND_API_KEY', 'resend-test-key');
    vi.stubEnv('EVENT_SUBMISSION_REPLY_DOMAIN', 'inbox.devcongress.org');
    vi.stubEnv('EVENT_SUBMISSION_REPLY_TOKEN_SECRET', 'reply-token-secret');
    vi.stubEnv('RESEND_INBOUND_WEBHOOK_SECRET', `whsec_${Buffer.from('webhook-secret').toString('base64')}`);
    vi.stubEnv('SLACK_EVENT_SUBMISSION_WEBHOOK_URL', 'https://hooks.slack.com/services/T000/B000/secret');
    const replyAddress = eventSubmissionReplyAddress({
      submissionId: submission.id,
      domain: 'inbox.devcongress.org',
      secret: 'reply-token-secret',
    });
    const payload = JSON.stringify({
      type: 'email.received',
      created_at: '2099-08-02T10:00:00.000Z',
      data: { email_id: 'received-email-1', to: [replyAddress] },
    });
    const webhookId = 'msg-evt-1';
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = crypto.createHmac('sha256', Buffer.from('webhook-secret'))
      .update(`${webhookId}.${timestamp}.${payload}`)
      .digest('base64');
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/emails/receiving/')) {
        return new Response(JSON.stringify({
          id: 'received-email-1',
          to: [replyAddress],
          from: 'hello@example.com',
          created_at: '2099-08-02T10:00:00.000Z',
          subject: 'Re: Community systems workshop',
          text: 'Thanks for the update.',
          html: null,
          headers: null,
          message_id: '<message-1@example.com>',
          attachments: [],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { default: app } = await import('./app');
    const response = await app.request('http://localhost/api/webhooks/resend/inbound', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'svix-id': webhookId,
        'svix-timestamp': timestamp,
        'svix-signature': `v1,${signature}`,
      },
      body: payload,
    });

    expect(response.status).toBe(204);
    expect(mocks.insertReply).toHaveBeenCalledWith(expect.objectContaining({
      submission_id: submission.id,
      webhook_event_id: webhookId,
      resend_email_id: 'received-email-1',
      body_text: 'Thanks for the update.',
    }), expect.anything());
    expect(mocks.updateReplySlack).toHaveBeenCalledWith('reply-1', { status: 'sent' }, expect.anything());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects an inbound webhook with an invalid signature before retrieval or storage', async () => {
    vi.stubEnv('RESEND_API_KEY', 'resend-test-key');
    vi.stubEnv('EVENT_SUBMISSION_REPLY_DOMAIN', 'inbox.devcongress.org');
    vi.stubEnv('EVENT_SUBMISSION_REPLY_TOKEN_SECRET', 'reply-token-secret');
    vi.stubEnv('RESEND_INBOUND_WEBHOOK_SECRET', `whsec_${Buffer.from('webhook-secret').toString('base64')}`);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const payload = JSON.stringify({
      type: 'email.received',
      data: { email_id: 'received-email-invalid', to: ['submissions+not-a-real-token@inbox.devcongress.org'] },
    });

    const { default: app } = await import('./app');
    const response = await app.request('http://localhost/api/webhooks/resend/inbound', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'svix-id': 'msg-evt-invalid',
        'svix-timestamp': String(Math.floor(Date.now() / 1000)),
        'svix-signature': 'v1,not-valid',
      },
      body: payload,
    });

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.insertReply).not.toHaveBeenCalled();
  });
});

describe('inbound reply sanitization', () => {
  it('removes script and style blocks with attributes and decodes entities once', () => {
    expect(htmlToPlainText(
      '<style type="text/css">.secret { display: none; }</style >'
      + '<p>Thanks &amp; &lt;hello&gt;</p>'
      + '<script type="text/javascript">alert("ignore")</script\n bar>'
      + '<p>&amp;lt;literal&amp;gt;</p>',
    )).toBe('Thanks & <hello>\n&lt;literal&gt;');
    expect(htmlToPlainText('<scrip<script>hidden</script>t>alert(1)</script>')).toBe('');
    expect(htmlToPlainText('<sty<style>hidden</style>le>.secret {}</style>')).toBe('');
  });
});
