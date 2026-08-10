import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockAdminRole = vi.hoisted(() => ({
  value: 'owner' as 'owner' | 'organizer' | 'volunteer',
}));

vi.mock('../lib/supabase/admin-auth', async () => {
  const actual = await vi.importActual<typeof import('../lib/supabase/admin-auth')>('../lib/supabase/admin-auth');
  const session = {
    authenticated: true as const,
    user_id: 'admin-1',
    email: 'organizer@devcongress.org',
    display_name: 'Organizer',
    role: mockAdminRole.value,
    session_id: 'session-1',
    expires_at: '2099-01-01T00:00:00.000Z',
  };

  return {
    ...actual,
    getAdminSession: vi.fn(async () => ({ ...session, role: mockAdminRole.value })),
    requireAdmin: vi.fn(async (
      c: { set: (key: string, value: unknown) => void },
      roles: Array<'owner' | 'organizer' | 'volunteer'> = ['owner', 'organizer'],
    ) => {
      if (!roles.includes(mockAdminRole.value)) {
        return new Response(JSON.stringify({ error: 'This account does not have access to this resource' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      c.set('adminSession', { ...session, role: mockAdminRole.value });
      return null;
    }),
    recordAdminAudit: vi.fn(async () => undefined),
  };
});

const originalCwd = process.cwd();
let tempRoot: string;

beforeEach(async () => {
  mockAdminRole.value = 'owner';
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
  mockAdminRole.value = 'owner';
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  process.chdir(originalCwd);
  await fs.rm(tempRoot, { recursive: true, force: true });
});

describe('native event registration API', () => {
  it('announces a published organizer event to the configured events channel', async () => {
    vi.stubEnv('SLACK_EVENTS_CHANNEL_WEBHOOK_URL', 'https://hooks.slack.com/services/test/events');
    const slackFetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', slackFetch);
    const { default: app } = await import('./app');

    const response = await app.request('http://localhost/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Events channel meetup',
        description: 'A published organizer event.',
        event_date: '2099-08-20T19:00:00.000Z',
        location: { name: 'Accra', label: 'Accra', url: null },
        registration: { capacity: 100, opens_at: null, closes_at: null, waitlist_enabled: true, auto_confirm: true },
      }),
    });

    expect(response.status).toBe(201);
    expect(slackFetch).toHaveBeenCalledTimes(1);
    expect(String(slackFetch.mock.calls[0]?.[0])).toEqual('https://hooks.slack.com/services/test/events');
    const slackPayload = JSON.parse(String(slackFetch.mock.calls[0]?.[1]?.body)) as {
      text: string;
      blocks: Array<{
        type: string;
        image_url?: string;
        text?: { text?: string };
        elements?: Array<{ url?: string }>;
      }>;
    };
    expect(slackPayload).toMatchObject({
      text: 'New event added: Events channel meetup',
    });
    const created = await response.clone().json() as { event: { id: string; slug?: string | null } };
    expect(slackPayload.blocks.find((block) => block.type === 'section')?.text?.text)
      .toContain('Thu, 20 Aug 2099 · 7:00 pm GMT');
    expect(slackPayload.blocks.find((block) => block.type === 'actions')?.elements?.[0]?.url)
      .toBe(`https://devcongress.org/events/${created.event.slug ?? created.event.id}`);
    expect(slackPayload.blocks.find((block) => block.type === 'image')?.image_url)
      .toBe('https://em.devcongress.org/images/event-announcement-fallback.png');
  });

  it('does not fail event creation when the events channel is unavailable', async () => {
    vi.stubEnv('SLACK_EVENTS_CHANNEL_WEBHOOK_URL', 'https://hooks.slack.com/services/test/events');
    const slackFetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('unavailable', { status: 503 }));
    vi.stubGlobal('fetch', slackFetch);
    const { default: app } = await import('./app');

    const response = await app.request('http://localhost/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Events channel outage test',
        description: 'The event should still be created.',
        event_date: '2099-08-20',
        location: { name: 'Accra', label: 'Accra', url: null },
        registration: { capacity: 100, opens_at: null, closes_at: null, waitlist_enabled: true, auto_confirm: true },
      }),
    });

    expect(response.status).toBe(201);
    expect(slackFetch).toHaveBeenCalledTimes(1);
  });

  it('permits one deliberate retry after a failed event-channel announcement and never reposts after success', async () => {
    vi.stubEnv('SLACK_EVENTS_CHANNEL_WEBHOOK_URL', 'https://hooks.slack.com/services/test/events');
    let available = false;
    const slackFetch = vi.fn(async () => new Response(available ? 'ok' : 'unavailable', { status: available ? 200 : 503 }));
    vi.stubGlobal('fetch', slackFetch);
    const { default: app } = await import('./app');

    const createdResponse = await app.request('http://localhost/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Retryable events channel meetup',
        description: 'A published organizer event.',
        event_date: '2099-08-20T19:00:00.000Z',
        location: { name: 'Accra', label: 'Accra', url: null },
        registration: { capacity: 100, opens_at: null, closes_at: null, waitlist_enabled: true, auto_confirm: true },
      }),
    });
    const created = await createdResponse.json() as { event: { id: string } };

    const failedStatus = await app.request(`http://localhost/api/events/${created.event.id}/slack-announcement`);
    await expect(failedStatus.json()).resolves.toMatchObject({ announcement: { status: 'failed', attempt_count: 1 }, eligible: true });

    available = true;
    const retry = await app.request(`http://localhost/api/events/${created.event.id}/slack-announcement`, { method: 'POST' });
    await expect(retry.json()).resolves.toMatchObject({ announcement: { status: 'sent', attempt_count: 2 }, dispatched: true });

    const repeated = await app.request(`http://localhost/api/events/${created.event.id}/slack-announcement`, { method: 'POST' });
    await expect(repeated.json()).resolves.toMatchObject({ announcement: { status: 'sent', attempt_count: 2 }, dispatched: false });
    expect(slackFetch).toHaveBeenCalledTimes(2);
  });

  it('does not expose event-channel announcement controls to volunteers', async () => {
    const { default: app } = await import('./app');
    const createdResponse = await app.request('http://localhost/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Restricted Slack action meetup',
        description: 'A published organizer event.',
        event_date: '2099-08-20T19:00:00.000Z',
        location: { name: 'Accra', label: 'Accra', url: null },
        registration: { capacity: 100, opens_at: null, closes_at: null, waitlist_enabled: true, auto_confirm: true },
      }),
    });
    const created = await createdResponse.json() as { event: { id: string } };
    mockAdminRole.value = 'volunteer';

    const response = await app.request(`http://localhost/api/events/${created.event.id}/slack-announcement`, { method: 'POST' });
    expect(response.status).toBe(403);
  });

  it('removes an event and reports a repeated removal as not found', async () => {
    const { default: app } = await import('./app');
    const createdResponse = await app.request('http://localhost/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Temporary meetup',
        description: 'An event that should be removable.',
        event_date: '2099-08-20',
        location: { name: 'Accra', label: 'Accra', url: null },
        registration: { capacity: 100, opens_at: null, closes_at: null, waitlist_enabled: true, auto_confirm: true },
      }),
    });
    const created = await createdResponse.json() as { event: { id: string } };

    const deleteResponse = await app.request(`http://localhost/api/events/${created.event.id}`, {
      method: 'DELETE',
    });
    expect(deleteResponse.status).toBe(200);
    await expect(deleteResponse.json()).resolves.toEqual({ ok: true });

    const repeatedDeleteResponse = await app.request(`http://localhost/api/events/${created.event.id}`, {
      method: 'DELETE',
    });
    expect(repeatedDeleteResponse.status).toBe(404);
    await expect(repeatedDeleteResponse.json()).resolves.toEqual({ error: 'Event not found' });
  });

  it('keeps real organizer-created events unmarked when the legacy test-mode variable is enabled', async () => {
    vi.stubEnv('EVENT_TEST_MODE', 'true');
    const { default: app } = await import('./app');
    const response = await app.request('http://localhost/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Acceptance-test meetup',
        description: 'A temporary event for exercising the hosted workflow.',
        event_date: '2099-08-20',
        location: { name: 'Accra', label: 'Accra', url: null },
        registration: { capacity: 100, opens_at: null, closes_at: null, waitlist_enabled: true, auto_confirm: true },
      }),
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      event: { name: 'Acceptance-test meetup' },
    });
  });

  it('returns authenticated Google Places suggestions restricted to Ghana', async () => {
    vi.stubEnv('GOOGLE_MAPS_PLACES_API_KEY', 'server-places-key');
    const providerFetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
      suggestions: [{
        placePrediction: {
          placeId: 'ghana-place-1',
          text: { text: 'Fido, Accra, Ghana' },
          structuredFormat: {
            mainText: { text: 'Fido' },
            secondaryText: { text: 'Accra, Ghana' },
          },
        },
      }],
    }), { status: 200 }));
    vi.stubGlobal('fetch', providerFetch);

    const { default: app } = await import('./app');
    const response = await app.request('http://localhost/api/admin/venues/search?q=Fido');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      venues: [{
        placeId: 'ghana-place-1',
        name: 'Fido',
        address: 'Accra, Ghana',
        label: 'Fido, Accra, Ghana',
      }],
    });
    const requestBody = JSON.parse(String(providerFetch.mock.calls[0]?.[1]?.body));
    expect(requestBody).toMatchObject({ includedRegionCodes: ['gh'], regionCode: 'gh' });
  });

  it('keeps a blast in a friendly capacity state when Broadcasts are not configured', async () => {
    const { default: app } = await import('./app');
    const createdResponse = await app.request('http://localhost/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Blast-ready meetup',
        description: 'An event with an update.',
        event_date: '2026-08-20',
        location: { name: 'Accra', label: 'Accra', url: null },
        registration: { capacity: 100, opens_at: null, closes_at: null, waitlist_enabled: true, auto_confirm: true },
      }),
    });
    const created = await createdResponse.json() as { event: { id: string } };
    await app.request(`http://localhost/api/events/${created.event.id}/registrations`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'open' }),
    });
    await app.request(`http://localhost/api/registration/events/${created.event.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Ama Mensah', email: 'ama@example.com' }),
    });

    const blastResponse = await app.request(`http://localhost/api/events/${created.event.id}/blasts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject: 'Venue update', body: 'We have moved rooms.' }),
    });

    expect(blastResponse.status).toBe(202);
    await expect(blastResponse.json()).resolves.toMatchObject({
      delivery: 'needs_capacity',
      blast: { recipient_count: 1, status: 'needs_capacity' },
    });
  });

  it('retries a persisted provider draft without creating another blast audience', async () => {
    vi.stubEnv('RESEND_BROADCASTS_API_KEY', 're_broadcast_test');
    vi.stubEnv('REGISTRATION_EMAIL_REPLY_TO', 'hello@devcongress.org');
    let sendAttempts = 0;
    const providerFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/segments')) return new Response(JSON.stringify({ id: 'segment-1' }), { status: 200 });
      if (url.endsWith('/contacts')) return new Response(JSON.stringify({ id: 'contact-1' }), { status: 200 });
      if (url.endsWith('/broadcasts')) return new Response(JSON.stringify({ id: 'broadcast-1' }), { status: 200 });
      if (url.endsWith('/broadcasts/broadcast-1/send')) {
        sendAttempts += 1;
        if (sendAttempts === 1) throw new Error('socket closed after provider accepted');
        return new Response(JSON.stringify({ id: 'send-1' }), { status: 200 });
      }
      return new Response('not found', { status: 404 });
    });
    vi.stubGlobal('fetch', providerFetch);

    const { default: app } = await import('./app');
    const createdResponse = await app.request('http://localhost/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Resilient blast meetup',
        description: 'An event with an update.',
        event_date: '2026-08-20',
        location: { name: 'Accra', label: 'Accra', url: null },
        registration: { capacity: 100, opens_at: null, closes_at: null, waitlist_enabled: true, auto_confirm: true },
      }),
    });
    const created = await createdResponse.json() as { event: { id: string } };
    await app.request(`http://localhost/api/events/${created.event.id}/registrations`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'open' }),
    });
    await app.request(`http://localhost/api/registration/events/${created.event.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Ama Mensah', email: 'ama@example.com' }),
    });

    const failed = await app.request(`http://localhost/api/events/${created.event.id}/blasts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject: 'Venue update', body: 'We have moved rooms.' }),
    });
    expect(failed.status).toBe(502);
    const failedPayload = await failed.json() as { blast: { id: string; status: string; provider_broadcast_id: string } };
    expect(failedPayload.blast).toMatchObject({ status: 'failed', provider_broadcast_id: 'broadcast-1' });

    const retried = await app.request(
      `http://localhost/api/events/${created.event.id}/blasts/${failedPayload.blast.id}/retry`,
      { method: 'POST' },
    );
    expect(retried.status).toBe(201);
    await expect(retried.json()).resolves.toMatchObject({
      delivery: 'sent',
      blast: { id: failedPayload.blast.id, status: 'sent', provider_broadcast_id: 'broadcast-1' },
    });
    expect(providerFetch.mock.calls.filter(([url]) => String(url).endsWith('/broadcasts'))).toHaveLength(1);
  });

  it('identifies existing events without a campaign as not internally managed', async () => {
    const legacyEvent = {
      id: 'legacy-luma-event',
      name: 'DevCongress Historical Meetup',
      description: 'Registration was handled before native registration launched.',
      event_date: '2025-06-28T09:00:00.000Z',
      status: 'completed',
      created_at: '2025-06-01T09:00:00.000Z',
      updated_at: '2025-06-29T09:00:00.000Z',
      registration_url: 'https://lu.ma/legacy-event',
      external_source: 'luma',
      external_id: 'legacy-event',
      external_url: 'https://lu.ma/legacy-event',
    };
    await fs.writeFile(
      path.join(tempRoot, 'data', 'events.json'),
      JSON.stringify([legacyEvent]),
      'utf-8',
    );

    const { default: app } = await import('./app');
    const response = await app.request(
      'http://localhost/api/events/legacy-luma-event/registrations',
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      managed_internally: false,
      event: { id: legacyEvent.id },
      campaign: null,
      registrations: [],
      summary: null,
      public_url: null,
    });

    const unknownResponse = await app.request(
      'http://localhost/api/events/unknown-event/registrations',
    );
    expect(unknownResponse.status).toBe(404);
    await expect(unknownResponse.json()).resolves.toEqual({ error: 'Event not found.' });
  });

  it('preserves an explicit no-series event and rejects unknown series values', async () => {
    const { default: app } = await import('./app');
    const createResponse = await app.request('http://localhost/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Community Demo Night',
        description: 'An independent community gathering.',
        event_date: '2026-08-20',
        format: 'conference',
        series_type: null,
        location: { name: 'Accra', label: 'Accra', url: null },
      }),
    });

    expect(createResponse.status).toBe(201);
    const created = await createResponse.json() as { event: { id: string; format: string; series_type: string | null } };
    expect(created.event.series_type).toBeNull();
    expect(created.event.format).toBe('conference');

    const formatUpdate = await app.request(`http://localhost/api/events/${created.event.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ format: 'hackathon' }),
    });
    expect(formatUpdate.status).toBe(200);
    await expect(formatUpdate.json()).resolves.toMatchObject({ format: 'hackathon' });

    const invalidFormatUpdate = await app.request(`http://localhost/api/events/${created.event.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ format: 'congress' }),
    });
    expect(invalidFormatUpdate.status).toBe(400);

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

    const registrationPageUpdate = await app.request(`http://localhost/api/events/${created.event.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Community Demo Night Updated',
        description: 'Updated details for registered guests.',
        event_date: '2026-08-20T18:00:00.000Z',
        end_date: '2026-08-20T21:00:00.000Z',
        location: {
          name: 'Google Maps location',
          label: 'Google Maps location',
          url: 'https://maps.app.goo.gl/n8u6C6TgdtW35db67',
        },
      }),
    });
    expect(registrationPageUpdate.status).toBe(200);

    const updatedPublicForm = await app.request(`http://localhost/api/registration/events/${created.event.id}`);
    expect(updatedPublicForm.status).toBe(200);
    await expect(updatedPublicForm.json()).resolves.toMatchObject({
      event: {
        name: 'Community Demo Night Updated',
        description: 'Updated details for registered guests.',
        event_date: '2026-08-20T18:00:00.000Z',
        end_date: '2026-08-20T21:00:00.000Z',
        location: {
          name: 'Google Maps location',
          url: 'https://maps.app.goo.gl/n8u6C6TgdtW35db67',
        },
      },
    });

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

  it('creates the event with registration open, then confirms and waitlists guests', async () => {
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
        registration: {
          capacity: 1,
          opens_at: null,
          closes_at: null,
          waitlist_enabled: false,
          auto_confirm: false,
        },
      }),
    });

    expect(createResponse.status).toBe(201);
    const created = await createResponse.json() as {
      event: {
        id: string;
        slug: string;
        status: string;
        publish_to_website: boolean;
        registration_url: string;
        stream_url: string | null;
      };
      registration_campaign: {
        status: string;
        description: string | null;
        capacity: number;
        waitlist_enabled: boolean;
        auto_confirm: boolean;
      };
    };
    expect(created.event.registration_url).toBe('http://localhost/r/august-2026-meetup');
    expect(created.event.stream_url).toBe('https://meet.google.com/abc-defg-hij');
    expect(created.event.status).toBe('upcoming');
    expect(created.event.publish_to_website).toBe(true);
    expect(created.registration_campaign).toMatchObject({
      status: 'open',
      description: null,
      capacity: 1,
      waitlist_enabled: true,
      auto_confirm: true,
    });

    const initialPublicResponse = await app.request(`http://localhost/api/registration/events/${created.event.id}`);
    expect(initialPublicResponse.status).toBe(200);
    await expect(initialPublicResponse.json()).resolves.toMatchObject({
      available: true,
      event: { id: created.event.id },
      campaign: { status: 'open', description: null, opens_at: null },
    });

    const introductionUpdateResponse = await app.request(
      `http://localhost/api/events/${created.event.id}/registrations`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: 'Bring your questions and a laptop.' }),
      },
    );
    expect(introductionUpdateResponse.status).toBe(200);
    await expect(introductionUpdateResponse.json()).resolves.toMatchObject({
      description: 'Bring your questions and a laptop.',
    });

    const updatedIntroductionResponse = await app.request(
      `http://localhost/api/registration/events/${created.event.id}`,
    );
    expect(updatedIntroductionResponse.status).toBe(200);
    await expect(updatedIntroductionResponse.json()).resolves.toMatchObject({
      event: { description: 'A free community meetup.' },
      campaign: { description: 'Bring your questions and a laptop.' },
    });

    const oversizedIntroductionResponse = await app.request(
      `http://localhost/api/events/${created.event.id}/registrations`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: 'x'.repeat(2001) }),
      },
    );
    expect(oversizedIntroductionResponse.status).toBe(400);

    const policyOverrideResponse = await app.request(
      `http://localhost/api/events/${created.event.id}/registrations`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auto_confirm: false, waitlist_enabled: false }),
      },
    );
    expect(policyOverrideResponse.status).toBe(400);

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
    const beforeCancellation = await adminResponse.json() as {
      managed_internally: boolean;
      public_url: string;
      summary: {
        total: number;
        confirmed: number;
        waitlisted: number;
        available: number;
        pending_emails: number;
      };
      registrations: Array<{
        id: string;
        status: string;
        email: string;
      }>;
    };
    expect(beforeCancellation).toMatchObject({
      managed_internally: true,
      public_url: 'http://localhost/r/august-2026-meetup',
      summary: {
        total: 2,
        confirmed: 1,
        waitlisted: 1,
        available: 0,
        pending_emails: 2,
      },
    });

    const confirmed = beforeCancellation.registrations.find((registration) => (
      registration.status === 'confirmed'
    ));
    const waitlisted = beforeCancellation.registrations.find((registration) => (
      registration.status === 'waitlisted'
    ));
    expect(confirmed).toBeDefined();
    expect(waitlisted).toBeDefined();

    const cancellationResponse = await app.request(
      `http://localhost/api/events/${created.event.id}/registrations/${confirmed!.id}/cancel`,
      { method: 'POST' },
    );
    expect(cancellationResponse.status).toBe(200);
    await expect(cancellationResponse.json()).resolves.toEqual({
      ok: true,
      promoted_registration_id: waitlisted!.id,
    });

    const afterCancellationResponse = await app.request(
      `http://localhost/api/events/${created.event.id}/registrations`,
    );
    expect(afterCancellationResponse.status).toBe(200);
    await expect(afterCancellationResponse.json()).resolves.toMatchObject({
      summary: {
        total: 1,
        confirmed: 1,
        waitlisted: 0,
        available: 0,
        pending_emails: 1,
      },
      registrations: expect.arrayContaining([
        expect.objectContaining({
          id: waitlisted!.id,
          email: 'kojo@example.com',
          status: 'confirmed',
          email_kind: 'promotion',
          email_status: 'pending',
        }),
        expect.objectContaining({
          id: confirmed!.id,
          email: 'ama@example.com',
          status: 'cancelled',
        }),
      ]),
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

  it('rejects permanent guest removal for organizers at the API boundary', async () => {
    mockAdminRole.value = 'organizer';
    const { default: app } = await import('./app');

    const response = await app.request(
      'http://localhost/api/events/event-1/registrations/registration-1',
      { method: 'DELETE' },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'This account does not have access to this resource',
    });
  });

  it('undoes a mistaken check-in without cancelling the guest registration', async () => {
    const { default: app } = await import('./app');
    const createResponse = await app.request('http://localhost/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Check-in correction meetup',
        description: 'A local check-in correction test.',
        event_date: '2026-08-30',
        slug: 'check-in-correction-meetup',
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
    await app.request(
      'http://localhost/api/registration/events/check-in-correction-meetup',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Ama Mensah', email: 'ama-correction@example.com' }),
      },
    );
    const registrationsResponse = await app.request(
      `http://localhost/api/events/${created.event.id}/registrations`,
    );
    const registrationsPayload = await registrationsResponse.json() as {
      registrations: Array<{ id: string; status: string; checked_in_at: string | null }>;
    };
    const registration = registrationsPayload.registrations[0];
    expect(registration).toMatchObject({ status: 'confirmed', checked_in_at: null });

    const checkInResponse = await app.request(
      `http://localhost/api/events/${created.event.id}/registrations/${registration.id}/check-in`,
      { method: 'POST' },
    );
    expect(checkInResponse.status).toBe(200);

    const undoResponse = await app.request(
      `http://localhost/api/events/${created.event.id}/registrations/${registration.id}/check-in`,
      { method: 'DELETE' },
    );
    expect(undoResponse.status).toBe(200);
    await expect(undoResponse.json()).resolves.toEqual({ ok: true });

    const afterUndoResponse = await app.request(
      `http://localhost/api/events/${created.event.id}/registrations`,
    );
    await expect(afterUndoResponse.json()).resolves.toMatchObject({
      summary: { total: 1, confirmed: 1, checked_in: 0 },
      registrations: [expect.objectContaining({
        id: registration.id,
        status: 'confirmed',
        checked_in_at: null,
      })],
    });

    const repeatedUndoResponse = await app.request(
      `http://localhost/api/events/${created.event.id}/registrations/${registration.id}/check-in`,
      { method: 'DELETE' },
    );
    expect(repeatedUndoResponse.status).toBe(409);
    await expect(repeatedUndoResponse.json()).resolves.toEqual({ error: 'Guest is not checked in.' });
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

  it('sends confirmed, waitlist, and automatic promotion emails to the intended guest', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test');
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
      body: JSON.stringify({ status: 'open', capacity: 1 }),
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
    const emails = JSON.parse(String(request.body)) as Array<{ from: string; html: string; text: string }>;
    expect(emails[0]?.from).toBe('DevCongress Events <events@updates.devcongress.org>');
    expect(emails[0]?.html).toContain('Saturday, August 29, 2026');
    expect(emails[0]?.html).toContain('6:00 PM – 9:00 PM GMT');
    expect(emails[0]?.html).toContain('View map →');
    expect(emails[0]?.html).toContain('Google Calendar');
    expect(emails[0]?.html).toContain('Download .ics');
    expect(emails[0]?.html).toContain('http://localhost/r/august-email-test?view=details');
    expect(emails[0]?.text).toContain(
      'Download calendar file: http://localhost/api/registration/events/august-email-test/calendar.ics',
    );
    expect(emails[0]?.html).not.toMatch(/QR code|confirmation code/i);

    const waitlistResponse = await app.request(
      'http://localhost/api/registration/events/august-email-test',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Kojo Owusu', email: 'kojo@example.com' }),
      },
    );
    expect(waitlistResponse.status).toBe(202);
    expect(providerFetch).toHaveBeenCalledTimes(2);
    const waitlistRequest = providerFetch.mock.calls[1]?.[1] as RequestInit;
    const waitlistEmails = JSON.parse(String(waitlistRequest.body)) as Array<{
      subject: string;
      to: string[];
    }>;
    expect(waitlistEmails).toEqual([
      expect.objectContaining({
        subject: 'You are on the waitlist for DevCongress August Meetup',
        to: ['kojo@example.com'],
      }),
    ]);

    const registrationsResponse = await app.request(
      `http://localhost/api/events/${created.event.id}/registrations`,
    );
    const registrations = await registrationsResponse.json() as {
      registrations: Array<{ id: string; email: string }>;
    };
    const confirmedRegistration = registrations.registrations.find((item) => (
      item.email === 'ama@example.com'
    ));
    expect(confirmedRegistration).toBeDefined();

    const cancelResponse = await app.request(
      `http://localhost/api/events/${created.event.id}/registrations/${confirmedRegistration!.id}/cancel`,
      { method: 'POST' },
    );
    expect(cancelResponse.status).toBe(200);
    await expect(cancelResponse.json()).resolves.toMatchObject({
      ok: true,
      promoted_registration_id: expect.any(String),
    });
    expect(providerFetch).toHaveBeenCalledTimes(3);
    const promotionRequest = providerFetch.mock.calls[2]?.[1] as RequestInit;
    const promotionEmails = JSON.parse(String(promotionRequest.body)) as Array<{
      subject: string;
      text: string;
      to: string[];
    }>;
    expect(promotionEmails).toEqual([
      expect.objectContaining({
        subject: 'A place opened up for DevCongress August Meetup',
        to: ['kojo@example.com'],
      }),
    ]);
    expect(promotionEmails[0]?.text).toContain('You’re off the waitlist.');
    expect(promotionEmails[0]?.text).toContain('ADD TO CALENDAR');
  });
});
