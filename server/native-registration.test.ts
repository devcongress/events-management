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

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'devcon-native-registration-'));
  process.chdir(tempRoot);
  await fs.mkdir('data');
  await fs.writeFile(path.join(tempRoot, 'data', 'events.json'), '[]', 'utf-8');
  vi.stubEnv('APP_DATA_SOURCE', 'local-json');
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('RESEND_API_KEY', '');
  vi.resetModules();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  process.chdir(originalCwd);
  await fs.rm(tempRoot, { recursive: true, force: true });
});

describe('native event registration API', () => {
  it('preserves an explicit no-series event and rejects unknown series values', async () => {
    const { default: app } = await import('./app');
    const createResponse = await app.request('http://localhost/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Community Demo Night',
        description: 'An independent community gathering.',
        event_date: '2026-08-20',
        series_type: null,
        location: { name: 'Accra', label: 'Accra', url: null },
      }),
    });

    expect(createResponse.status).toBe(201);
    const created = await createResponse.json() as { event: { id: string; series_type: string | null } };
    expect(created.event.series_type).toBeNull();

    const invalidUpdate = await app.request(`http://localhost/api/events/${created.event.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ series_type: 'other' }),
    });
    expect(invalidUpdate.status).toBe(400);

    const unsafeMapUpdate = await app.request(`http://localhost/api/events/${created.event.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location: {
          name: 'Accra',
          label: 'Accra',
          url: 'javascript:alert(1)',
        },
      }),
    });
    expect(unsafeMapUpdate.status).toBe(400);

    const unsafeScheduleUpdate = await app.request(`http://localhost/api/events/${created.event.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        schedule: [{
          time: '6:00 PM',
          title: 'Unsafe resource',
          type: 'talk',
          lead: null,
          resources: [{ title: 'Open', url: 'javascript:alert(1)' }],
        }],
      }),
    });
    expect(unsafeScheduleUpdate.status).toBe(400);

    const massAssignmentUpdate = await app.request(`http://localhost/api/events/${created.event.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'replacement-id', created_at: '2020-01-01T00:00:00.000Z' }),
    });
    expect(massAssignmentUpdate.status).toBe(400);
  });

  it('creates the event and draft campaign together, then confirms and waitlists guests', async () => {
    const { default: app } = await import('./app');
    const createResponse = await app.request('http://localhost/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'DevCongress August Meetup',
        description: 'A free community meetup.',
        event_date: '2026-08-29',
        slug: 'august-2026-meetup',
        series_type: 'monthly',
        location: { name: 'Fido, Accra', label: 'Fido, Accra', url: null },
        stream_url: 'https://meet.google.com/abc-defg-hij',
        publish_to_website: false,
        registration: {
          capacity: 1,
          opens_at: null,
          closes_at: null,
          waitlist_enabled: true,
          auto_confirm: true,
        },
      }),
    });

    expect(createResponse.status).toBe(201);
    const created = await createResponse.json() as {
      event: { id: string; slug: string; registration_url: string; stream_url: string | null };
      registration_campaign: { status: string; capacity: number };
    };
    expect(created.event.registration_url).toBe('http://localhost/r/august-2026-meetup');
    expect(created.event.stream_url).toBe('https://meet.google.com/abc-defg-hij');
    expect(created.registration_campaign).toMatchObject({ status: 'draft', capacity: 1 });

    const draftPublicResponse = await app.request(`http://localhost/api/registration/events/${created.event.id}`);
    expect(draftPublicResponse.status).toBe(404);
    await expect(draftPublicResponse.json()).resolves.toEqual({
      available: false,
      error: 'Registration is not available for this event.',
    });

    const draftSubmissionResponse = await app.request(
      `http://localhost/api/registration/events/${created.event.id}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Draft Guest', email: 'draft@example.com' }),
      },
    );
    expect(draftSubmissionResponse.status).toBe(404);
    await expect(draftSubmissionResponse.json()).resolves.toEqual({
      error: 'Registration is not available for this event.',
    });

    const draftCalendarResponse = await app.request(
      `http://localhost/api/registration/events/${created.event.id}/calendar.ics`,
    );
    expect(draftCalendarResponse.status).toBe(404);

    const openResponse = await app.request(`http://localhost/api/events/${created.event.id}/registrations`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'open' }),
    });
    expect(openResponse.status).toBe(200);

    const slugPublicResponse = await app.request('http://localhost/api/registration/events/august-2026-meetup');
    expect(slugPublicResponse.status).toBe(200);
    await expect(slugPublicResponse.json()).resolves.toMatchObject({
      available: true,
      event: { id: created.event.id },
    });

    const calendarResponse = await app.request(
      'http://localhost/api/registration/events/august-2026-meetup/calendar.ics',
    );
    expect(calendarResponse.status).toBe(200);
    expect(calendarResponse.headers.get('content-type')).toBe('text/calendar; charset=utf-8');
    expect(calendarResponse.headers.get('content-disposition')).toBe(
      'attachment; filename="devcongress-august-meetup.ics"',
    );
    const calendar = await calendarResponse.text();
    expect(calendar).toContain('DTSTART;VALUE=DATE:20260829\r\n');
    expect(calendar).toContain('DTEND;VALUE=DATE:20260830\r\n');
    expect(calendar).toContain('LOCATION:Fido\\, Accra\r\n');

    const register = (name: string, email: string) => app.request(
      'http://localhost/api/registration/events/august-2026-meetup',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email }),
      },
    );

    const confirmedResponse = await register('Ama Mensah', 'ama@example.com');
    expect(confirmedResponse.status).toBe(202);
    await expect(confirmedResponse.json()).resolves.toEqual({
      accepted: true,
      message: 'If this email can be registered, a confirmation will be sent shortly.',
    });

    const waitlistedResponse = await register('Kojo Owusu', 'kojo@example.com');
    expect(waitlistedResponse.status).toBe(202);
    await expect(waitlistedResponse.json()).resolves.toEqual({
      accepted: true,
      message: 'If this email can be registered, a confirmation will be sent shortly.',
    });

    const duplicateResponse = await register('Ama Again', 'AMA@example.com');
    expect(duplicateResponse.status).toBe(202);
    await expect(duplicateResponse.json()).resolves.toEqual({
      accepted: true,
      message: 'If this email can be registered, a confirmation will be sent shortly.',
    });

    const adminResponse = await app.request(`http://localhost/api/events/${created.event.id}/registrations`);
    expect(adminResponse.status).toBe(200);
    await expect(adminResponse.json()).resolves.toMatchObject({
      public_url: 'http://localhost/r/august-2026-meetup',
      summary: {
        total: 2,
        confirmed: 1,
        waitlisted: 1,
        available: 0,
        pending_emails: 2,
      },
    });
  });

  it('permanently removes a test guest and linked local delivery data only outside production', async () => {
    const { default: app } = await import('./app');
    const createResponse = await app.request('http://localhost/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Dev Guest Cleanup',
        description: 'A local registration cleanup test.',
        event_date: '2026-08-29',
        slug: 'dev-guest-cleanup',
        series_type: 'monthly',
        location: { name: 'Accra', label: 'Accra', url: null },
      }),
    });
    const created = await createResponse.json() as { event: { id: string } };

    await app.request(`http://localhost/api/events/${created.event.id}/registrations`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'open' }),
    });
    const registerResponse = await app.request(
      'http://localhost/api/registration/events/dev-guest-cleanup',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test Guest', email: 'test-guest@example.com' }),
      },
    );
    expect(registerResponse.status).toBe(202);
    const registrationsResponse = await app.request(
      `http://localhost/api/events/${created.event.id}/registrations`,
    );
    const registrationsPayload = await registrationsResponse.json() as {
      registrations: Array<{ id: string; email: string }>;
    };
    const registered = registrationsPayload.registrations.find(
      (registration) => registration.email === 'test-guest@example.com',
    );
    expect(registered).toBeDefined();

    const checkInResponse = await app.request(
      `http://localhost/api/events/${created.event.id}/registrations/${registered!.id}/check-in`,
      { method: 'POST' },
    );
    expect(checkInResponse.status).toBe(200);

    const deleteResponse = await app.request(
      `http://localhost/api/events/${created.event.id}/registrations/${registered!.id}`,
      { method: 'DELETE' },
    );
    expect(deleteResponse.status).toBe(200);
    await expect(deleteResponse.json()).resolves.toEqual({ ok: true });

    const adminResponse = await app.request(`http://localhost/api/events/${created.event.id}/registrations`);
    expect(adminResponse.status).toBe(200);
    await expect(adminResponse.json()).resolves.toMatchObject({
      registrations: [],
      summary: {
        total: 0,
        confirmed: 0,
        checked_in: 0,
        pending_emails: 0,
      },
    });
    await expect(fs.readFile(
      path.join(tempRoot, 'data', 'registration-email-deliveries.json'),
      'utf-8',
    ).then((contents) => JSON.parse(contents))).resolves.toEqual([]);

    const secondRegisterResponse = await app.request(
      'http://localhost/api/registration/events/dev-guest-cleanup',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Protected Guest', email: 'protected@example.com' }),
      },
    );
    expect(secondRegisterResponse.status).toBe(202);
    const secondRegistrationsResponse = await app.request(
      `http://localhost/api/events/${created.event.id}/registrations`,
    );
    const secondRegistrationsPayload = await secondRegistrationsResponse.json() as {
      registrations: Array<{ id: string; email: string }>;
    };
    const secondRegistration = secondRegistrationsPayload.registrations.find(
      (registration) => registration.email === 'protected@example.com',
    );
    expect(secondRegistration).toBeDefined();
    vi.stubEnv('NODE_ENV', 'production');

    const productionDeleteResponse = await app.request(
      `http://localhost/api/events/${created.event.id}/registrations/${secondRegistration!.id}`,
      { method: 'DELETE' },
    );
    expect(productionDeleteResponse.status).toBe(404);
    await expect(productionDeleteResponse.json()).resolves.toEqual({ error: 'Not found.' });

    vi.stubEnv('NODE_ENV', '');
    const unspecifiedRuntimeDeleteResponse = await app.request(
      `http://localhost/api/events/${created.event.id}/registrations/${secondRegistration!.id}`,
      { method: 'DELETE' },
    );
    expect(unspecifiedRuntimeDeleteResponse.status).toBe(404);
    await expect(unspecifiedRuntimeDeleteResponse.json()).resolves.toEqual({ error: 'Not found.' });

    const registrationsFile = JSON.parse(await fs.readFile(
      path.join(tempRoot, 'data', 'event-registrations.json'),
      'utf-8',
    )) as Array<{ id: string }>;
    expect(registrationsFile).toContainEqual(
      expect.objectContaining({ id: secondRegistration!.id }),
    );
  });

  it('rejects an unsafe video conference link before creating the event', async () => {
    const { default: app } = await import('./app');
    const response = await app.request('http://localhost/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'DevCongress Online Meetup',
        description: 'A remote community meetup.',
        event_date: '2026-08-29',
        series_type: 'monthly',
        location: { name: 'Online', label: 'Online', url: null },
        stream_url: 'javascript:alert(1)',
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Enter a full URL that starts with http:// or https://.',
    });
  });

  it('fails closed when a client submits Turnstile data but server verification is not configured', async () => {
    const { default: app } = await import('./app');
    const createResponse = await app.request('http://localhost/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'DevCongress Turnstile Test',
        description: 'A free community meetup.',
        event_date: '2026-09-26',
        series_type: 'monthly',
        location: { name: 'Accra', label: 'Accra', url: null },
      }),
    });
    const created = await createResponse.json() as { event: { id: string } };

    await app.request(`http://localhost/api/events/${created.event.id}/registrations`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'open' }),
    });

    const response = await app.request(
      `http://localhost/api/registration/events/${created.event.id}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Turnstile Guest',
          email: 'turnstile@example.com',
          turnstile_action: 'event_registration',
          turnstile_token: 'client-widget-token',
        }),
      },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'Human verification is temporarily unavailable. Please try again later.',
    });
  });

  it('sends confirmed event details, a safe map, and calendar actions in the email', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test');
    vi.stubEnv('REGISTRATION_EMAIL_FROM', 'DevCongress <events@updates.devcongress.org>');
    vi.stubEnv('REGISTRATION_EMAIL_REPLY_TO', 'hello@devcongress.org');
    const providerFetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
      data: [{ id: 'email-1' }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', providerFetch);

    const { default: app } = await import('./app');
    const createResponse = await app.request('http://localhost/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'DevCongress August Meetup',
        description: 'A free community meetup.',
        event_date: '2026-08-29',
        slug: 'august-email-test',
        series_type: 'monthly',
        location: {
          name: 'Accra Digital Centre',
          label: 'Accra Digital Centre, Accra',
          url: 'https://www.google.com/maps/place/Accra+Digital+Centre',
        },
      }),
    });
    const created = await createResponse.json() as { event: { id: string } };

    const eventUpdateResponse = await app.request(`http://localhost/api/events/${created.event.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_date: '2026-08-29T18:00:00.000Z',
        end_date: '2026-08-29T21:00:00.000Z',
      }),
    });
    expect(eventUpdateResponse.status).toBe(200);

    await app.request(`http://localhost/api/events/${created.event.id}/registrations`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'open' }),
    });
    const registrationResponse = await app.request(
      'http://localhost/api/registration/events/august-email-test',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Ama Mensah', email: 'ama@example.com' }),
      },
    );

    expect(registrationResponse.status).toBe(202);
    await expect(registrationResponse.json()).resolves.toEqual({
      accepted: true,
      message: 'If this email can be registered, a confirmation will be sent shortly.',
    });
    expect(providerFetch).toHaveBeenCalledTimes(1);
    const request = providerFetch.mock.calls[0]?.[1] as RequestInit;
    const emails = JSON.parse(String(request.body)) as Array<{ html: string; text: string }>;
    expect(emails[0]?.html).toContain('Saturday, August 29, 2026');
    expect(emails[0]?.html).toContain('6:00 PM – 9:00 PM GMT');
    expect(emails[0]?.html).toContain('View map ↗');
    expect(emails[0]?.html).toContain('Google Calendar');
    expect(emails[0]?.html).toContain('Download .ics');
    expect(emails[0]?.text).toContain(
      'Download calendar file: http://localhost/api/registration/events/august-email-test/calendar.ics',
    );
    expect(emails[0]?.html).not.toMatch(/QR code|confirmation code/i);
  });
});
