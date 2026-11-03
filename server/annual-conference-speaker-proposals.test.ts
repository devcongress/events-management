import fs from 'fs/promises';
import crypto from 'crypto';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const session = {
  authenticated: true as const,
  user_id: 'owner-1',
  membership_id: 'membership-1',
  email: 'owner@example.com',
  display_name: 'Owner',
  role: 'owner' as const,
  session_id: 'session-1',
  expires_at: '2099-01-01T00:00:00.000Z',
};

vi.mock('@/lib/supabase/admin-auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/supabase/admin-auth')>('@/lib/supabase/admin-auth');

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

vi.mock('@/lib/supabase/server', async () => {
  const actual = await vi.importActual<typeof import('@/lib/supabase/server')>('@/lib/supabase/server');

  return {
    ...actual,
    getSupabaseAdminClient: vi.fn(() => ({
      from: vi.fn(() => {
        const builder = {
          select: vi.fn(() => builder),
          eq: vi.fn(() => builder),
          maybeSingle: vi.fn(async () => ({
            data: { id: '20260000-0000-4000-8000-000000000001', task_creator_email: 'angelateyvi@gmail.com' },
            error: null,
          })),
        };

        return builder;
      }),
    })),
  };
});

vi.mock('@/lib/supabase/annual-conference-access-grants', () => ({
  clearAnnualConferenceAccessGrantsForMembership: vi.fn(),
  getAnnualConferenceAccessGrants: vi.fn(async () => []),
  listAnnualConferenceAccessMembers: vi.fn(),
  listAnnualConferenceVolunteerTeam: vi.fn(),
  setAnnualConferenceAccessGrant: vi.fn(),
}));

const originalCwd = process.cwd();
let tempRoot: string;

const proposal = (title: string) => ({
  speaker_name: 'Ama Speaker',
  speaker_email: 'ama@example.com',
  bio: 'A platform engineer who teaches communities how to build dependable systems.',
  title,
  topic: 'Real-World Impact',
  session_type: '40-minute long talk',
  abstract: 'A practical session about building reliable services for constrained environments.',
  learning_outcomes: ['Identify common failure modes', 'Design safe retry behavior', 'Measure reliability with useful signals'],
});

async function startDecisionDelivery(app: typeof import('./app').default, id: string): Promise<Response> {
  const headers = { 'Content-Type': 'application/json' };
  const preview = await app.request('http://localhost/api/annual-conference/2026/speaker-outcomes/preview', { method: 'POST', headers, body: JSON.stringify({ ids: [id] }) });

  if (!preview.ok) return preview;
  const { preview_id } = await preview.json() as { preview_id: string };
  const queued = await app.request('http://localhost/api/annual-conference/2026/speaker-outcomes/send', { method: 'POST', headers, body: JSON.stringify({ preview_id }) });

  if (!queued.ok) return queued;
  const drain = await app.request('http://localhost/api/internal/annual-conference-speaker-emails/retry', { method: 'POST', headers: { 'x-scheduled-job-secret': 'test-scheduled-job-secret-that-is-at-least-32-bytes' } });
  const result = await drain.json() as { accepted: string[]; failed: string[] };

  return Response.json({ decision_email: { status: result.accepted.includes(id) ? 'accepted' : 'failed' } });
}

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'devcon-annual-cfp-'));
  process.chdir(tempRoot);
  await fs.mkdir('data');
  await fs.writeFile(path.join(tempRoot, 'data', 'annual-conference-editions.json'), JSON.stringify([{
    id: '20260000-0000-4000-8000-000000000001',
    year: 2026,
    name: 'DevCongress Annual Conference',
    label: 'December 2026',
    speaker_call_status: 'open',
    speaker_logistics_deadline: '2099-12-01T23:59:59.000Z',
    provisional_date: '2099-12-19',
    date_status: 'provisional',
    venue_note: null,
    keynote_note: null,
    task_creator_email: 'angelateyvi@gmail.com',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  }]), 'utf-8');
  vi.stubEnv('APP_DATA_SOURCE', 'local-json');
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('RESEND_API_KEY', 're_test');
  vi.stubEnv('SPEAKER_EMAIL_REPLY_TO', 'speakers@devcongress.org');
  vi.stubEnv('SPEAKER_INTAKE_LINK_TOKEN_SECRET', 'test-speaker-link-secret-that-is-at-least-32-bytes');
  vi.stubEnv('PUBLIC_APP_URL', 'https://events.devcongress.org');
  vi.stubEnv('RESEND_WEBHOOK_SECRET', `whsec_${Buffer.from('annual-conference-webhook-secret').toString('base64')}`);
  vi.stubEnv('SLACK_EVENTS_RETRY_SECRET', 'test-scheduled-job-secret-that-is-at-least-32-bytes');
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  process.chdir(originalCwd);
  await fs.rm(tempRoot, { recursive: true, force: true });
});

describe('Annual Conference proposal lifecycle', () => {
  it('accepts the preview Turnstile hostname only for DevCon26 and retains the public hostnames', async () => {
    vi.resetModules();
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'turnstile-test-secret');
    const previewHostname = 'feature-devcon26-public-checkout-devcongress-website.admins-a7d.workers.dev';
    const acceptedHostnames = ['devcongress.org', 'www.devcongress.org', 'em.devcongress.org', previewHostname, 'feature-devcon26-registration-paused-devcongress-website.admins-a7d.workers.dev'];
    const tokenResults = new Map(acceptedHostnames.map((hostname, index) => [`valid-token-${index}`, {
      action: 'cfp_submission', hostname,
    }]));

    tokenResults.set('preview-token-other-year', { action: 'cfp_submission', hostname: previewHostname });
    tokenResults.set('unrelated-preview-token', { action: 'cfp_submission', hostname: 'other.workers.dev' });
    tokenResults.set('suffix-spoof-token', { action: 'cfp_submission', hostname: `${previewHostname}.attacker.example` });
    tokenResults.set('wrong-action-token', { action: 'registration', hostname: previewHostname });
    const providerFetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const token = String((init?.body as FormData).get('response'));

      return new Response(JSON.stringify({ success: true, ...tokenResults.get(token) }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    vi.stubGlobal('fetch', providerFetch);
    const app = (await import('./app')).default;

    for (const [index, hostname] of acceptedHostnames.entries()) {
      const token = `valid-token-${index}`;
      const response = await app.request('http://localhost/api/cfp/conferences/2026', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...proposal(`CFP hostname ${index}`), turnstile_token: token, turnstile_action: 'cfp_submission' }),
      });

      expect(response.status, hostname).toBe(202);
    }

    const rejectedCases = [
      { token: 'preview-token-other-year', year: 2025, expectedError: 'Human verification did not match this site. Please refresh and try again.' },
      { token: 'unrelated-preview-token', year: 2026, expectedError: 'Human verification did not match this site. Please refresh and try again.' },
      { token: 'suffix-spoof-token', year: 2026, expectedError: 'Human verification did not match this site. Please refresh and try again.' },
      { token: 'wrong-action-token', year: 2026, expectedError: 'Human verification did not match this form. Please try again.' },
    ];

    for (const { token, year, expectedError } of rejectedCases) {
      const response = await app.request(`http://localhost/api/cfp/conferences/${year}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...proposal(`Rejected ${token}`), turnstile_token: token, turnstile_action: 'cfp_submission' }),
      });

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: expectedError });
    }

    expect(providerFetch).toHaveBeenCalledTimes(acceptedHostnames.length + rejectedCases.length);
  });

  it('treats 150 bio words as guidance while keeping the bio required', async () => {
    vi.resetModules();
    const providerFetch = vi.fn();

    vi.stubGlobal('fetch', providerFetch);
    const app = (await import('./app')).default;

    const missing = await app.request('http://localhost/api/cfp/conferences/2026', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...proposal('Missing bio'), bio: '' }),
    });
    const longer = await app.request('http://localhost/api/cfp/conferences/2026', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...proposal('Longer bio'), bio: Array.from({ length: 151 }, () => 'speaker').join(' ') }),
    });

    expect(missing.status).toBe(400);
    expect(longer.status).toBe(202);
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it('emails a rejection once and records provider delivery events', async () => {
    vi.resetModules();
    const providerFetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ data: [{ id: 'resend-rejection-1' }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));

    vi.stubGlobal('fetch', providerFetch);
    const app = (await import('./app')).default;
    const speakerStore = await import('@/lib/annual-conference-speakers');

    expect((await app.request('http://localhost/api/cfp/conferences/2026', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(proposal('A careful rejection')),
    })).status).toBe(202);
    expect(providerFetch).not.toHaveBeenCalled();
    const [record] = await speakerStore.getAnnualConferenceSpeakerSubmissions('20260000-0000-4000-8000-000000000001');
    const decision = await app.request(`http://localhost/api/annual-conference/2026/speaker-submissions/${record.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'not_selected' }),
    });

    expect(decision.status).toBe(200);
    await expect(decision.json()).resolves.toMatchObject({ decision_email: { status: 'pending' } });
    expect(providerFetch).not.toHaveBeenCalled();
    expect(await speakerStore.getPendingAnnualConferenceDecisionEmails()).toEqual([]);
    const firstSend = await startDecisionDelivery(app, record.id);

    await expect(firstSend.json()).resolves.toMatchObject({ decision_email: { status: 'accepted' } });
    expect(providerFetch).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(providerFetch.mock.calls[0]?.[1]?.body));

    expect(payload[0].subject).toContain('December 2026 proposal');
    expect(payload[0].text).toContain('A careful rejection');

    const webhookBody = JSON.stringify({
      type: 'email.delivered',
      created_at: '2026-09-07T18:00:00.000Z',
      data: { email_id: 'resend-rejection-1' },
    });
    const webhookId = 'msg_annual_rejection_delivered';
    const timestamp = String(Math.floor(Date.now() / 1000));
    const webhookSecret = Buffer.from('annual-conference-webhook-secret');
    const signature = crypto.createHmac('sha256', webhookSecret).update(`${webhookId}.${timestamp}.${webhookBody}`).digest('base64');

    expect((await app.request('http://localhost/api/webhooks/resend', {
      method: 'POST',
      headers: { 'svix-id': webhookId, 'svix-timestamp': timestamp, 'svix-signature': 'v1,invalid' },
      body: webhookBody,
    })).status).toBe(401);
    const webhook = await app.request('http://localhost/api/webhooks/resend', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'svix-id': webhookId,
        'svix-timestamp': timestamp,
        'svix-signature': `v1,${signature}`,
      },
      body: webhookBody,
    });

    expect(webhook.status).toBe(204);
    const duplicate = await app.request('http://localhost/api/webhooks/resend', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'svix-id': webhookId,
        'svix-timestamp': timestamp,
        'svix-signature': `v1,${signature}`,
      },
      body: webhookBody,
    });

    expect(duplicate.status).toBe(204);

    const staleBody = JSON.stringify({
      type: 'email.bounced',
      created_at: '2026-09-07T17:59:00.000Z',
      data: { email_id: 'resend-rejection-1' },
    });
    const staleId = 'msg_annual_rejection_stale_bounce';
    const staleSignature = crypto.createHmac('sha256', webhookSecret).update(`${staleId}.${timestamp}.${staleBody}`).digest('base64');

    expect((await app.request('http://localhost/api/webhooks/resend', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'svix-id': staleId,
        'svix-timestamp': timestamp,
        'svix-signature': `v1,${staleSignature}`,
      },
      body: staleBody,
    })).status).toBe(204);
    await expect(speakerStore.getAnnualConferenceSpeakerSubmission(record.id)).resolves.toMatchObject({
      decision_email_status: 'delivered',
      decision_email_delivered_at: '2026-09-07T18:00:00.000Z',
    });
  });

  it('validates the conference-only schema and keeps proposals independent through acceptance and repeat logistics saves', async () => {
    vi.resetModules();
    const resendFetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ data: [{ id: 'resend-accepted-1' }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));

    vi.stubGlobal('fetch', resendFetch);
    const app = (await import('./app')).default;
    const speakerStore = await import('@/lib/annual-conference-speakers');

    const incomplete = await app.request('http://localhost/api/cfp/conferences/2026', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...proposal('Incomplete outcomes'), learning_outcomes: ['One', 'Two'] }),
    });

    expect(incomplete.status).toBe(400);

    for (const title of ['Reliable systems in emerging markets', 'Teaching incident response']) {
      const response = await app.request('http://localhost/api/cfp/conferences/2026', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(proposal(title)),
      });

      expect(response.status).toBe(202);
    }

    const submissions = await speakerStore.getAnnualConferenceSpeakerSubmissions('20260000-0000-4000-8000-000000000001');

    expect(submissions).toHaveLength(2);
    expect(submissions[0].speaker_profile_id).toBe(submissions[1].speaker_profile_id);

    const accepted = submissions.find((item) => item.title.startsWith('Reliable'))!;
    const untouched = submissions.find((item) => item.id !== accepted.id)!;
    const decision = await app.request(`http://localhost/api/annual-conference/2026/speaker-submissions/${accepted.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'selected' }),
    });

    expect(decision.status).toBe(200);
    await expect(decision.json()).resolves.toMatchObject({
      submission: { id: accepted.id, status: 'selected' },
      token: null,
      decision_email: { status: 'pending' },
    });
    expect(resendFetch).not.toHaveBeenCalled();
    expect(await speakerStore.getPendingAnnualConferenceDecisionEmails()).toEqual([]);
    expect((await startDecisionDelivery(app, accepted.id)).status).toBe(200);
    await expect(speakerStore.getAnnualConferenceSpeakerSubmission(untouched.id)).resolves.toMatchObject({ status: 'submitted' });

    const resendPayload = JSON.parse(String(resendFetch.mock.calls[0]?.[1]?.body));

    expect(resendPayload[0].text).toContain('/conference-speakers/2026/');
    const privateUrl = resendPayload[0].text.match(/https?:\/\/[^\s]+\/conference-speakers\/2026\/[^\s]+/)?.[0];

    expect(privateUrl).toBeTruthy();
    const token = new URL(privateUrl!).pathname.split('/').at(-1)!;

    const workspace = await app.request(`http://localhost/api/conferences/2026/speaker-intake/${token}`);

    expect(workspace.status).toBe(200);
    await expect(workspace.json()).resolves.toMatchObject({
      link: { purpose: 'conference_speaker_workspace' },
      prefill: { title: accepted.title, learning_outcomes: proposal(accepted.title).learning_outcomes },
    });

    const save = (technicalRequirements: string) => app.request(`http://localhost/api/conferences/2026/speaker-intake/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slides_url: 'https://example.com/slides',
        availability_confirmed: true,
        technical_requirements: technicalRequirements,
        workshop_prerequisites: '',
        required_software_equipment: 'USB-C adapter',
        participants_need_laptops: false,
        preferred_workshop_capacity: null,
      }),
    });

    const privateDetails = {
      accessibility_requirements: 'Step-free access',
      headshot_url: 'https://example.com/headshot',
      social_handle: '@ama',
    };
    const savePrivateDetails = (details: Record<string, string>) => app.request(`http://localhost/api/conferences/2026/speaker-intake/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(details),
    });
    const updateLogistics = vi.spyOn(speakerStore, 'updateAnnualConferenceSessionLogistics');

    expect((await savePrivateDetails(privateDetails)).status).toBe(200);
    expect((await save('Legacy client')).status).toBe(200);
    expect(updateLogistics.mock.lastCall?.[1]).not.toHaveProperty('accessibility_requirements');
    expect(updateLogistics.mock.lastCall?.[1]).not.toHaveProperty('headshot_url');
    expect(updateLogistics.mock.lastCall?.[1]).not.toHaveProperty('social_handle');
    await expect((await app.request(`http://localhost/api/conferences/2026/speaker-intake/${token}`)).json()).resolves.toMatchObject({ prefill: privateDetails });
    expect((await savePrivateDetails({ accessibility_requirements: '', headshot_url: '', social_handle: '' })).status).toBe(200);
    expect(updateLogistics.mock.lastCall?.[1]).toMatchObject({ accessibility_requirements: null, headshot_url: null, social_handle: null });
    await expect((await app.request(`http://localhost/api/conferences/2026/speaker-intake/${token}`)).json()).resolves.toMatchObject({ prefill: { accessibility_requirements: '', headshot_url: '', social_handle: '' } });
    updateLogistics.mockRestore();

    const editionsPath = path.join(tempRoot, 'data', 'annual-conference-editions.json');
    const editions = JSON.parse(await fs.readFile(editionsPath, 'utf-8'));

    editions[0].speaker_logistics_deadline = '2020-01-01T00:00:00.000Z';
    await fs.writeFile(editionsPath, JSON.stringify(editions));
    const linksPath = path.join(tempRoot, 'data', 'annual-conference-speaker-intake-links.json');
    const links = JSON.parse(await fs.readFile(linksPath, 'utf-8'));

    links[0].expires_at = '2020-01-01T00:00:00.000Z';
    await fs.writeFile(linksPath, JSON.stringify(links));
    expect((await app.request(`http://localhost/api/conferences/2026/speaker-intake/${token}`)).status).toBe(200);
    expect((await app.request(`http://localhost/api/annual-conference/2026/speaker-submissions/${accepted.id}/workspace-link`)).status).toBe(200);
    expect((await save('Projector')).status).toBe(200);
    expect((await save('Projector and lapel microphone')).status).toBe(200);

    const refreshed = await app.request(`http://localhost/api/conferences/2026/speaker-intake/${token}`);

    await expect(refreshed.json()).resolves.toMatchObject({
      prefill: { technical_requirements: 'Projector and lapel microphone', availability_confirmed: true },
    });
    const revokePath = `http://localhost/api/annual-conference/2026/speaker-submissions/${accepted.id}/revoke-workspace`;

    expect((await app.request(revokePath, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })).status).toBe(400);
    expect((await app.request(revokePath, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmed: true }) })).status).toBe(200);
    expect((await app.request(`http://localhost/api/conferences/2026/speaker-intake/${token}`)).status).toBe(410);
    expect((await save('Denied')).status).toBe(410);
    const replacement = await app.request(`http://localhost/api/annual-conference/2026/speaker-submissions/${accepted.id}/replace-workspace-email`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmed: true }),
    });

    expect(replacement.status).toBe(200);
    const preview = await app.request('http://localhost/api/annual-conference/2026/speaker-outcomes/preview', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [accepted.id] }),
    });

    expect(preview.status).toBe(200);
    const { recipients } = await preview.json();

    expect(recipients[0].text).toContain('Date: 19 December 2026\nVenue: Ghana Digital Center, Accra');
    expect(recipients[0].html).toContain('Ghana Digital Center, Accra');
    expect(recipients[0].html).not.toContain('(provisional)');
  });

  it('retries a failed acceptance email without changing the private link or accepted proposal', async () => {
    vi.resetModules();
    const resendFetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: 'provider unavailable' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: 'resend-accepted-retry' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));

    vi.stubGlobal('fetch', resendFetch);
    const app = (await import('./app')).default;
    const speakerStore = await import('@/lib/annual-conference-speakers');

    const submitted = await app.request('http://localhost/api/cfp/conferences/2026', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(proposal('Recovering acceptance delivery')),
    });

    expect(submitted.status).toBe(202);
    const [proposalRecord] = await speakerStore.getAnnualConferenceSpeakerSubmissions('20260000-0000-4000-8000-000000000001');

    const decision = await app.request(`http://localhost/api/annual-conference/2026/speaker-submissions/${proposalRecord.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'selected' }),
    });

    expect(decision.status).toBe(200);
    await expect(decision.json()).resolves.toMatchObject({
      submission: { id: proposalRecord.id, status: 'selected' },
      decision_email: { status: 'pending' },
    });
    expect(resendFetch).not.toHaveBeenCalled();
    expect((await startDecisionDelivery(app, proposalRecord.id)).status).toBe(200);
    const failedPayload = JSON.parse(String(resendFetch.mock.calls[0]?.[1]?.body));
    const failedUrl = failedPayload[0].text.match(/https?:\/\/[^\s]+\/conference-speakers\/2026\/[^\s]+/)?.[0];

    expect(failedUrl).toBeTruthy();

    vi.stubEnv('SPEAKER_EMAIL_REPLY_TO', 'changed@example.com');
    const retry = await app.request(`http://localhost/api/annual-conference/2026/speaker-submissions/${proposalRecord.id}/resend-workspace-email`, {
      method: 'POST',
    });

    expect(retry.status).toBe(200);
    await expect(retry.json()).resolves.toMatchObject({ decision_email: { status: 'accepted' } });
    const retryPayload = JSON.parse(String(resendFetch.mock.calls[1]?.[1]?.body));
    const retryUrl = retryPayload[0].text.match(/https?:\/\/[^\s]+\/conference-speakers\/2026\/[^\s]+/)?.[0];

    expect(retryUrl).toBeTruthy();
    expect(retryUrl).toBe(failedUrl);
    expect(retryPayload[0]).toEqual(failedPayload[0]);

    const failedToken = new URL(failedUrl!).pathname.split('/').at(-1)!;
    const retryToken = new URL(retryUrl!).pathname.split('/').at(-1)!;

    expect((await app.request(`http://localhost/api/conferences/2026/speaker-intake/${failedToken}`)).status).toBe(200);
    expect((await app.request(`http://localhost/api/conferences/2026/speaker-intake/${retryToken}`)).status).toBe(200);
  });

  it('requires an explicit organizer due date before acceptance', async () => {
    vi.resetModules();
    const editionsPath = path.join(tempRoot, 'data', 'annual-conference-editions.json');
    const editions = JSON.parse(await fs.readFile(editionsPath, 'utf8'));

    editions[0].speaker_logistics_deadline = null;
    await fs.writeFile(editionsPath, JSON.stringify(editions), 'utf8');
    const providerFetch = vi.fn();

    vi.stubGlobal('fetch', providerFetch);
    const app = (await import('./app')).default;
    const speakerStore = await import('@/lib/annual-conference-speakers');

    expect((await app.request('http://localhost/api/cfp/conferences/2026', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(proposal('Deadline required')),
    })).status).toBe(202);
    const [record] = await speakerStore.getAnnualConferenceSpeakerSubmissions('20260000-0000-4000-8000-000000000001');
    const decision = await app.request(`http://localhost/api/annual-conference/2026/speaker-submissions/${record.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'selected' }),
    });

    expect(decision.status).toBe(409);
    expect(providerFetch).not.toHaveBeenCalled();
    await expect(speakerStore.getAnnualConferenceSpeakerSubmission(record.id)).resolves.toMatchObject({ status: 'submitted' });
  });

  it('retries a transient rejection delivery from the scheduled drain', async () => {
    vi.resetModules();
    const providerFetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: 'temporarily unavailable' }), { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: 'resend-rejection-retry' }] }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      }));

    vi.stubGlobal('fetch', providerFetch);
    const app = (await import('./app')).default;
    const speakerStore = await import('@/lib/annual-conference-speakers');

    expect((await app.request('http://localhost/api/cfp/conferences/2026', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(proposal('Retry this rejection')),
    })).status).toBe(202);
    const [record] = await speakerStore.getAnnualConferenceSpeakerSubmissions('20260000-0000-4000-8000-000000000001');
    const decision = await app.request(`http://localhost/api/annual-conference/2026/speaker-submissions/${record.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'not_selected' }),
    });

    await expect(decision.json()).resolves.toMatchObject({ decision_email: { status: 'pending' } });
    expect((await startDecisionDelivery(app, record.id)).status).toBe(200);
    await speakerStore.updateAnnualConferenceSpeakerSubmission(record.id, {
      decision_email_last_attempt_at: '2026-09-07T00:00:00.000Z',
    });
    const retry = await app.request('http://localhost/api/internal/annual-conference-speaker-emails/retry', {
      method: 'POST', headers: { 'x-scheduled-job-secret': 'test-scheduled-job-secret-that-is-at-least-32-bytes' },
    });

    expect(retry.status).toBe(200);
    await expect(retry.json()).resolves.toMatchObject({ accepted: [record.id], failed: [] });
    expect(providerFetch).toHaveBeenCalledTimes(2);
  });

  it('confirms address correction and explicit private-link replacement independently', async () => {
    vi.resetModules();
    const providerFetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
      data: [{ id: `resend-recovery-${providerFetch.mock.calls.length}` }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    vi.stubGlobal('fetch', providerFetch);
    const app = (await import('./app')).default;
    const speakerStore = await import('@/lib/annual-conference-speakers');

    expect((await app.request('http://localhost/api/cfp/conferences/2026', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(proposal('Recover one proposal only')),
    })).status).toBe(202);
    const [record] = await speakerStore.getAnnualConferenceSpeakerSubmissions('20260000-0000-4000-8000-000000000001');

    expect((await app.request(`http://localhost/api/annual-conference/2026/speaker-submissions/${record.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'selected' }),
    })).status).toBe(200);
    expect(providerFetch).not.toHaveBeenCalled();
    expect((await startDecisionDelivery(app, record.id)).status).toBe(200);
    const originalPayload = JSON.parse(String(providerFetch.mock.calls[0]?.[1]?.body));
    const originalUrl = originalPayload[0].text.match(/https?:\/\/[^\s]+\/conference-speakers\/2026\/[^\s]+/)?.[0];

    const correction = await app.request(`http://localhost/api/annual-conference/2026/speaker-submissions/${record.id}/decision-email-recipient`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ speaker_email: 'ama.corrected@example.com', confirmed: true }),
    });

    expect(correction.status).toBe(200);
    const corrected = await speakerStore.getAnnualConferenceSpeakerSubmission(record.id);

    expect(corrected).toMatchObject({ decision_email_recipient: 'ama.corrected@example.com', decision_email_attempt_count: 0 });
    expect(providerFetch).toHaveBeenCalledTimes(1);
    expect((await startDecisionDelivery(app, record.id)).status).toBe(200);
    const correctedPayload = JSON.parse(String(providerFetch.mock.calls[1]?.[1]?.body));

    expect(correctedPayload[0].to).toEqual(['ama.corrected@example.com']);
    const correctedUrl = correctedPayload[0].text.match(/https?:\/\/[^\s]+\/conference-speakers\/2026\/[^\s]+/)?.[0];

    expect(correctedUrl).not.toBe(originalUrl);
    const originalToken = new URL(originalUrl!).pathname.split('/').at(-1)!;

    expect((await app.request(`http://localhost/api/conferences/2026/speaker-intake/${originalToken}`)).status).toBe(410);

    const replacement = await app.request(`http://localhost/api/annual-conference/2026/speaker-submissions/${record.id}/replace-workspace-email`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmed: true }),
    });

    expect(replacement.status).toBe(200);
    expect(providerFetch).toHaveBeenCalledTimes(2);
    expect((await startDecisionDelivery(app, record.id)).status).toBe(200);
    const replacementPayload = JSON.parse(String(providerFetch.mock.calls[2]?.[1]?.body));
    const replacementUrl = replacementPayload[0].text.match(/https?:\/\/[^\s]+\/conference-speakers\/2026\/[^\s]+/)?.[0];

    expect(replacementUrl).not.toBe(correctedUrl);
    const correctedToken = new URL(correctedUrl!).pathname.split('/').at(-1)!;
    const replacementToken = new URL(replacementUrl!).pathname.split('/').at(-1)!;

    expect((await app.request(`http://localhost/api/conferences/2026/speaker-intake/${correctedToken}`)).status).toBe(410);
    expect((await app.request(`http://localhost/api/conferences/2026/speaker-intake/${replacementToken}`)).status).toBe(200);
  });

  it('does not routinely resend a permanent provider failure to the same address', async () => {
    vi.resetModules();
    const providerFetch = vi.fn(async () => new Response(JSON.stringify({ data: [{ id: 'resend-permanent-failure' }] }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    }));

    vi.stubGlobal('fetch', providerFetch);
    const app = (await import('./app')).default;
    const speakerStore = await import('@/lib/annual-conference-speakers');

    expect((await app.request('http://localhost/api/cfp/conferences/2026', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(proposal('Do not resend complaints')),
    })).status).toBe(202);
    const [record] = await speakerStore.getAnnualConferenceSpeakerSubmissions('20260000-0000-4000-8000-000000000001');

    expect((await app.request(`http://localhost/api/annual-conference/2026/speaker-submissions/${record.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'selected' }),
    })).status).toBe(200);
    expect((await startDecisionDelivery(app, record.id)).status).toBe(200);
    await speakerStore.applyAnnualConferenceDecisionEmailProviderEvent({
      providerEmailId: 'resend-permanent-failure',
      status: 'complained',
      eventAt: '2099-01-01T00:00:00.000Z',
      lastError: 'The recipient reported this message.',
      retryable: false,
    });
    const retry = await app.request(`http://localhost/api/annual-conference/2026/speaker-submissions/${record.id}/resend-workspace-email`, { method: 'POST' });

    expect(retry.status).toBe(409);
    expect(providerFetch).toHaveBeenCalledTimes(1);
  });

  it('blocks routine retry after an immediate permanent provider rejection', async () => {
    vi.resetModules();
    const providerFetch = vi.fn(async () => new Response(JSON.stringify({ message: 'invalid recipient' }), {
      status: 422, headers: { 'Content-Type': 'application/json' },
    }));

    vi.stubGlobal('fetch', providerFetch);
    const app = (await import('./app')).default;
    const speakerStore = await import('@/lib/annual-conference-speakers');

    expect((await app.request('http://localhost/api/cfp/conferences/2026', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(proposal('Rejected by provider immediately')),
    })).status).toBe(202);
    const [record] = await speakerStore.getAnnualConferenceSpeakerSubmissions('20260000-0000-4000-8000-000000000001');
    const decision = await app.request(`http://localhost/api/annual-conference/2026/speaker-submissions/${record.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'selected' }),
    });

    await expect(decision.json()).resolves.toMatchObject({ decision_email: { status: 'pending' } });
    expect((await startDecisionDelivery(app, record.id)).status).toBe(200);
    await expect(speakerStore.getAnnualConferenceSpeakerSubmission(record.id)).resolves.toMatchObject({
      decision_email_retryable: false,
      decision_email_provider_id: null,
    });
    const retry = await app.request(`http://localhost/api/annual-conference/2026/speaker-submissions/${record.id}/resend-workspace-email`, { method: 'POST' });

    expect(retry.status).toBe(409);
    expect(providerFetch).toHaveBeenCalledTimes(1);
  });

  it('allows a manual rejection retry after automatic attempts are exhausted', async () => {
    vi.resetModules();
    const providerFetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: 'temporarily unavailable' }), { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: 'resend-manual-after-exhaustion' }] }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      }));

    vi.stubGlobal('fetch', providerFetch);
    const app = (await import('./app')).default;
    const speakerStore = await import('@/lib/annual-conference-speakers');

    expect((await app.request('http://localhost/api/cfp/conferences/2026', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(proposal('Retry manually after exhaustion')),
    })).status).toBe(202);
    const [record] = await speakerStore.getAnnualConferenceSpeakerSubmissions('20260000-0000-4000-8000-000000000001');

    expect((await app.request(`http://localhost/api/annual-conference/2026/speaker-submissions/${record.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'not_selected' }),
    })).status).toBe(200);
    expect((await startDecisionDelivery(app, record.id)).status).toBe(200);
    await speakerStore.updateAnnualConferenceSpeakerSubmission(record.id, {
      decision_email_attempt_count: 5,
      decision_email_last_attempt_at: '2020-01-01T00:00:00.000Z',
      decision_email_last_error: 'Automatic email retries were exhausted. Review the recipient and retry manually.',
      decision_email_retryable: false,
    });
    const retry = await app.request(`http://localhost/api/annual-conference/2026/speaker-submissions/${record.id}/resend-decision-email`, { method: 'POST' });

    expect(retry.status).toBe(200);
    await expect(retry.json()).resolves.toMatchObject({ decision_email: { status: 'accepted' } });
    expect(providerFetch).toHaveBeenCalledTimes(2);
  });

  it('prevents an address correction from racing an in-flight scheduled retry', async () => {
    vi.resetModules();
    let releaseRetry!: () => void;
    let markRetryStarted!: () => void;
    const retryStarted = new Promise<void>((resolve) => { markRetryStarted = resolve; });
    const retryReleased = new Promise<void>((resolve) => { releaseRetry = resolve; });
    let requestCount = 0;
    const providerFetch = vi.fn(async () => {
      requestCount += 1;
      if (requestCount === 1) return new Response(JSON.stringify({ message: 'temporarily unavailable' }), { status: 503 });
      markRetryStarted();
      await retryReleased;

      return new Response(JSON.stringify({ data: [{ id: 'resend-scheduled-race' }] }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    });

    vi.stubGlobal('fetch', providerFetch);
    const app = (await import('./app')).default;
    const speakerStore = await import('@/lib/annual-conference-speakers');

    expect((await app.request('http://localhost/api/cfp/conferences/2026', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(proposal('Do not race corrections')),
    })).status).toBe(202);
    const [record] = await speakerStore.getAnnualConferenceSpeakerSubmissions('20260000-0000-4000-8000-000000000001');

    expect((await app.request(`http://localhost/api/annual-conference/2026/speaker-submissions/${record.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'not_selected' }),
    })).status).toBe(200);
    expect((await startDecisionDelivery(app, record.id)).status).toBe(200);
    await speakerStore.updateAnnualConferenceSpeakerSubmission(record.id, { decision_email_last_attempt_at: '2020-01-01T00:00:00.000Z' });

    const scheduledRetry = app.request('http://localhost/api/internal/annual-conference-speaker-emails/retry', {
      method: 'POST', headers: { 'x-scheduled-job-secret': 'test-scheduled-job-secret-that-is-at-least-32-bytes' },
    });

    await retryStarted;
    const correction = await app.request(`http://localhost/api/annual-conference/2026/speaker-submissions/${record.id}/decision-email-recipient`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ speaker_email: 'new-address@example.com', confirmed: true }),
    });

    expect(correction.status).toBe(409);
    releaseRetry();
    expect((await scheduledRetry).status).toBe(200);
    await expect(speakerStore.getAnnualConferenceSpeakerSubmission(record.id)).resolves.toMatchObject({
      decision_email_recipient: 'ama@example.com',
      decision_email_status: 'accepted',
      decision_email_attempt_count: 2,
    });
    expect(providerFetch).toHaveBeenCalledTimes(2);
  });

  it('prevents an accepted-workspace correction from racing an in-flight scheduled retry', async () => {
    vi.resetModules();
    let releaseRetry!: () => void;
    let markRetryStarted!: () => void;
    const retryStarted = new Promise<void>((resolve) => { markRetryStarted = resolve; });
    const retryReleased = new Promise<void>((resolve) => { releaseRetry = resolve; });
    let requestCount = 0;
    const providerFetch = vi.fn(async () => {
      requestCount += 1;
      if (requestCount === 1) return new Response(JSON.stringify({ message: 'temporarily unavailable' }), { status: 503 });
      markRetryStarted();
      await retryReleased;

      return new Response(JSON.stringify({ data: [{ id: 'resend-selected-scheduled-race' }] }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    });

    vi.stubGlobal('fetch', providerFetch);
    const app = (await import('./app')).default;
    const speakerStore = await import('@/lib/annual-conference-speakers');

    expect((await app.request('http://localhost/api/cfp/conferences/2026', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(proposal('Do not race selected corrections')),
    })).status).toBe(202);
    const [record] = await speakerStore.getAnnualConferenceSpeakerSubmissions('20260000-0000-4000-8000-000000000001');

    expect((await app.request(`http://localhost/api/annual-conference/2026/speaker-submissions/${record.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'selected' }),
    })).status).toBe(200);
    expect((await startDecisionDelivery(app, record.id)).status).toBe(200);
    const failed = await speakerStore.getAnnualConferenceSpeakerSubmission(record.id);

    await speakerStore.updateAnnualConferenceSpeakerSubmission(record.id, { decision_email_last_attempt_at: '2020-01-01T00:00:00.000Z' });
    await speakerStore.updateAnnualConferenceSpeakerIntakeLink(failed!.selected_intake_link_id!, { email_last_attempt_at: '2020-01-01T00:00:00.000Z' });

    const scheduledRetry = app.request('http://localhost/api/internal/annual-conference-speaker-emails/retry', {
      method: 'POST', headers: { 'x-scheduled-job-secret': 'test-scheduled-job-secret-that-is-at-least-32-bytes' },
    });

    await retryStarted;
    const correction = await app.request(`http://localhost/api/annual-conference/2026/speaker-submissions/${record.id}/decision-email-recipient`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ speaker_email: 'new-selected-address@example.com', confirmed: true }),
    });

    expect(correction.status).toBe(409);
    releaseRetry();
    expect((await scheduledRetry).status).toBe(200);
    await expect(speakerStore.getAnnualConferenceSpeakerSubmission(record.id)).resolves.toMatchObject({
      selected_intake_link_id: failed!.selected_intake_link_id,
      decision_email_recipient: 'ama@example.com',
      decision_email_status: 'accepted',
      decision_email_attempt_count: 2,
    });
    expect(providerFetch).toHaveBeenCalledTimes(2);
  });

  it('commits only one result when accept and reject race for the same proposal', async () => {
    vi.resetModules();
    const resendFetch = vi.fn(async () => new Response(JSON.stringify({ data: [{ id: 'resend-race-winner' }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));

    vi.stubGlobal('fetch', resendFetch);
    const app = (await import('./app')).default;
    const speakerStore = await import('@/lib/annual-conference-speakers');

    expect((await app.request('http://localhost/api/cfp/conferences/2026', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(proposal('One final decision')),
    })).status).toBe(202);
    const [record] = await speakerStore.getAnnualConferenceSpeakerSubmissions('20260000-0000-4000-8000-000000000001');
    const decide = (status: 'selected' | 'not_selected') => app.request(`http://localhost/api/annual-conference/2026/speaker-submissions/${record.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });

    const responses = await Promise.all([decide('selected'), decide('not_selected')]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    const final = await speakerStore.getAnnualConferenceSpeakerSubmission(record.id);

    expect(['selected', 'not_selected']).toContain(final?.status);
    if (final?.status === 'selected') {
      expect(final.selected_session_id).toBeTruthy();
      expect(final.selected_intake_link_id).toBeTruthy();
      expect(resendFetch).not.toHaveBeenCalled();
    } else {
      expect(final?.selected_session_id).toBeNull();
      expect(final?.selected_intake_link_id).toBeNull();
      expect(resendFetch).not.toHaveBeenCalled();
    }
  });

  it('freezes a reviewed outcome before queuing and sends it once through the worker', async () => {
    vi.resetModules();
    const provider = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ data: [{ id: 'provider-1' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    vi.stubGlobal('fetch', provider);
    const app = (await import('./app')).default;
    const store = await import('@/lib/annual-conference-speakers');
    const json = { 'Content-Type': 'application/json' };
    const created = await app.request('http://localhost/api/cfp/conferences/2026', { method: 'POST', headers: json, body: JSON.stringify(proposal('Frozen outcome')) });

    expect(created.status).toBe(202);
    const record = (await store.getAnnualConferenceSpeakerSubmissions('20260000-0000-4000-8000-000000000001'))[0];
    const decided = await app.request(`http://localhost/api/annual-conference/2026/speaker-submissions/${record.id}`, { method: 'PATCH', headers: json, body: JSON.stringify({ status: 'not_selected' }) });

    expect(decided.status).toBe(200);
    const saved = await app.request('http://localhost/api/annual-conference/2026/speaker-outcomes/messages', { method: 'PUT', headers: json, body: JSON.stringify({ kind: 'rejection', subject: 'Hello {first_name}', message: 'Your proposal was {talk_title}', version: 0 }) });

    expect(saved.status).toBe(200);
    const preview = await app.request('http://localhost/api/annual-conference/2026/speaker-outcomes/preview', { method: 'POST', headers: json, body: JSON.stringify({ ids: [record.id] }) });
    const prepared = await preview.json() as { preview_id: string; recipients: Array<{ subject: string; text: string }> };

    expect(preview.status).toBe(200);
    expect(prepared.recipients[0]).toMatchObject({ subject: 'Hello Ama', text: 'Your proposal was Frozen outcome' });
    const queue = () => app.request('http://localhost/api/annual-conference/2026/speaker-outcomes/send', { method: 'POST', headers: json, body: JSON.stringify({ preview_id: prepared.preview_id }) });

    expect((await queue()).status).toBe(200);
    expect(provider).not.toHaveBeenCalled();
    expect((await queue()).status).toBe(409);
    const changed = await app.request('http://localhost/api/annual-conference/2026/speaker-outcomes/messages', { method: 'PUT', headers: json, body: JSON.stringify({ kind: 'rejection', subject: 'Changed', message: 'Changed', version: 1 }) });

    expect(changed.status).toBe(200);
    const drain = await app.request('http://localhost/api/internal/annual-conference-speaker-emails/retry', { method: 'POST', headers: { 'x-scheduled-job-secret': 'test-scheduled-job-secret-that-is-at-least-32-bytes' } });

    expect(drain.status).toBe(200);
    expect(provider).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(provider.mock.calls[0]?.[1]?.body));

    expect(payload[0]).toMatchObject({ subject: 'Hello Ama', text: 'Your proposal was Frozen outcome' });
    await app.request('http://localhost/api/internal/annual-conference-speaker-emails/retry', { method: 'POST', headers: { 'x-scheduled-job-secret': 'test-scheduled-job-secret-that-is-at-least-32-bytes' } });
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it('rejects a speaker preview if the workspace deadline changes before queueing', async () => {
    vi.resetModules();
    const app = (await import('./app')).default;
    const store = await import('@/lib/annual-conference-speakers');
    const headers = { 'Content-Type': 'application/json' };

    expect((await app.request('http://localhost/api/cfp/conferences/2026', { method: 'POST', headers, body: JSON.stringify(proposal('Deadline change')) })).status).toBe(202);
    const record = (await store.getAnnualConferenceSpeakerSubmissions('20260000-0000-4000-8000-000000000001'))[0];

    expect((await app.request(`http://localhost/api/annual-conference/2026/speaker-submissions/${record.id}`, { method: 'PATCH', headers, body: JSON.stringify({ status: 'selected' }) })).status).toBe(200);
    const preview = await app.request('http://localhost/api/annual-conference/2026/speaker-outcomes/preview', { method: 'POST', headers, body: JSON.stringify({ ids: [record.id] }) });
    const body = await preview.json() as { preview_id: string };

    expect(preview.status).toBe(200);
    expect((await app.request('http://localhost/api/annual-conference/2026/speakers/logistics-deadline', { method: 'PATCH', headers, body: JSON.stringify({ deadline: '2099-11-01T23:59:59.000Z' }) })).status).toBe(200);
    const queued = await app.request('http://localhost/api/annual-conference/2026/speaker-outcomes/send', { method: 'POST', headers, body: JSON.stringify({ preview_id: body.preview_id }) });

    expect(queued.status).toBe(409);
    expect((await store.getAnnualConferenceSpeakerSubmission(record.id))?.decision_email_queued_at).toBeFalsy();
  });

  it('requires a fresh preview if a queued workspace deadline changes before the first attempt', async () => {
    vi.resetModules();
    const provider = vi.fn(async () => new Response('{}', { status: 500 }));

    vi.stubGlobal('fetch', provider);
    const app = (await import('./app')).default;
    const store = await import('@/lib/annual-conference-speakers');
    const headers = { 'Content-Type': 'application/json' };

    await app.request('http://localhost/api/cfp/conferences/2026', { method: 'POST', headers, body: JSON.stringify(proposal('Queued deadline change')) });
    const record = (await store.getAnnualConferenceSpeakerSubmissions('20260000-0000-4000-8000-000000000001'))[0];

    await app.request(`http://localhost/api/annual-conference/2026/speaker-submissions/${record.id}`, { method: 'PATCH', headers, body: JSON.stringify({ status: 'selected' }) });
    const preview = await app.request('http://localhost/api/annual-conference/2026/speaker-outcomes/preview', { method: 'POST', headers, body: JSON.stringify({ ids: [record.id] }) });
    const { preview_id } = await preview.json() as { preview_id: string };

    expect((await app.request('http://localhost/api/annual-conference/2026/speaker-outcomes/send', { method: 'POST', headers, body: JSON.stringify({ preview_id }) })).status).toBe(200);
    await app.request('http://localhost/api/annual-conference/2026/speakers/logistics-deadline', { method: 'PATCH', headers, body: JSON.stringify({ deadline: '2099-11-01T23:59:59.000Z' }) });
    await app.request('http://localhost/api/internal/annual-conference-speaker-emails/retry', { method: 'POST', headers: { 'x-scheduled-job-secret': 'test-scheduled-job-secret-that-is-at-least-32-bytes' } });
    expect(provider).not.toHaveBeenCalled();
    expect(await store.getAnnualConferenceSpeakerSubmission(record.id)).toMatchObject({ decision_email_status: 'failed', decision_email_attempt_count: 0, decision_email_queued_at: null });
    expect((await app.request('http://localhost/api/annual-conference/2026/speaker-outcomes/preview', { method: 'POST', headers, body: JSON.stringify({ ids: [record.id] }) })).status).toBe(200);
  });

});
