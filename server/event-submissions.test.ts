import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  list: vi.fn(),
  approve: vi.fn(),
  reject: vi.fn(),
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
  rejection_reason: null,
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
  vi.stubEnv('TURNSTILE_SECRET_KEY', '');
  mocks.create.mockResolvedValue(submission);
  mocks.list.mockResolvedValue([submission]);
  mocks.rateLimit.mockResolvedValue({ allowed: true });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('community event submissions', () => {
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
});
