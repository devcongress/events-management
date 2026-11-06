import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppBindings } from '@/server/http/app-bindings';

const mocks = vi.hoisted(() => ({
  admin: vi.fn(), session: vi.fn(), capability: vi.fn(), edition: vi.fn(), submissions: vi.fn(), link: vi.fn(), matches: vi.fn(),
  list: vi.fn(), campaign: vi.fn(), deliveries: vi.fn(), save: vi.fn(), savePreview: vi.fn(), preview: vi.fn(), queue: vi.fn(), suppressed: vi.fn(),
  audit: vi.fn(), env: vi.fn(), envelope: vi.fn(), configured: vi.fn(), rate: vi.fn(), send: vi.fn(), health: vi.fn(),
}));

vi.mock('@/lib/supabase/admin-auth', () => ({ requireAdmin: mocks.admin, getAdminSession: mocks.session }));
vi.mock('@/lib/supabase/server', () => ({ isSupabaseRuntimeEnabled: () => true, getSupabaseAdminClient: vi.fn() }));
vi.mock('@/server/annual-conference-request', () => ({ requireAnnualConferenceCapability: mocks.capability, getAnnualConferenceEditionByYear: mocks.edition }));
vi.mock('@/lib/annual-conference-speakers', () => ({ getAnnualConferenceSpeakerSubmissions: mocks.submissions, getAnnualConferenceSpeakerIntakeLinkById: mocks.link, annualConferenceSpeakerWorkspaceTokenMatches: mocks.matches, annualConferenceSpeakerWorkspaceToken: () => 'token' }));
vi.mock('@/lib/annual-conference-speaker-update-store', () => ({ listSpeakerUpdates: mocks.list, getSpeakerUpdate: mocks.campaign, listSpeakerUpdateDeliveries: mocks.deliveries, saveSpeakerUpdate: mocks.save, saveSpeakerUpdatePreview: mocks.savePreview, getSpeakerUpdatePreview: mocks.preview, queueSpeakerUpdate: mocks.queue, suppressedSpeakerUpdateEmails: mocks.suppressed }));
vi.mock('@/server/protected-mutation', () => ({ recordProtectedMutationAudit: mocks.audit }));
vi.mock('@/server/env', () => ({ envValue: mocks.env }));
vi.mock('@/server/routes/annual-conference-speakers/delivery', () => ({ annualConferenceSpeakerEmailEnvelope: mocks.envelope, annualConferenceEmailConfigured: mocks.configured }));
vi.mock('@/server/http/public-intake-protection', () => ({ enforcePublicRateLimit: mocks.rate }));
vi.mock('@/lib/email/resend', () => ({ sendResendEmailBatch: mocks.send }));
vi.mock('@/lib/email/delivery-health', () => ({ recordResendEmailHealth: mocks.health }));
vi.mock('@/server/http/public-app-origin', () => ({ publicAppOrigin: () => 'https://example.test' }));
vi.mock('@/lib/security/shared-secret', () => ({ secureSharedSecret: () => 'secret' }));

const id = '00000000-0000-4000-8000-000000000001';
const id2 = '00000000-0000-4000-8000-000000000002';
const campaign = { id, edition_id: 'edition', subject: 'Hello {first_name}', message: 'Visit {workspace_url}', version: 1, state: 'draft' };
const submission = { id, edition_id: 'edition', status: 'selected', decision_email_kind: 'acceptance', decision_email_status: 'accepted', decision_email_sent_at: '2026-11-01T00:00:00Z', decision_email_recipient: 'AMA@example.test', speaker_email: 'ama@example.test', speaker_name: 'Ama', selected_intake_link_id: id2, selected_session_id: id2, title: 'Talk' };
const link = { id: id2, edition_id: 'edition', speaker_submission_id: id, workspace_session_id: id2, revoked_at: null, expires_at: '2026-12-31T00:00:00Z' };

async function request(path: string, method = 'GET', body?: unknown) {
  const { registerSpeakerUpdateRoutes } = await import('./routes/annual-conference-speakers/updates');
  const app = new Hono<AppBindings>();

  registerSpeakerUpdateRoutes(app);

  return app.request(`/api/annual-conference/2026/speaker-updates${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
}

describe('speaker update owner routes', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.admin.mockResolvedValue(null);
    mocks.session.mockResolvedValue({ authenticated: true, membership_id: 'owner', email: 'owner@example.test' });
    mocks.capability.mockResolvedValue(null);
    mocks.edition.mockResolvedValue({ id: 'edition', year: 2026, label: 'DevCon26' });
    mocks.submissions.mockResolvedValue([submission]);
    mocks.link.mockResolvedValue(link);
    mocks.matches.mockReturnValue(true);
    mocks.list.mockResolvedValue([]);
    mocks.campaign.mockResolvedValue(campaign);
    mocks.suppressed.mockResolvedValue(new Set());
    mocks.envelope.mockReturnValue({ from: 'sender@example.test', replyTo: 'reply@example.test' });
    mocks.configured.mockReturnValue(true);
    mocks.env.mockReturnValue('true');
    mocks.queue.mockResolvedValue(1);
  });

  it('marks duplicate, suppressed, and revoked workspaces ineligible without exposing tokens', async () => {
    mocks.submissions.mockResolvedValue([submission, { ...submission, id: id2 }]);
    const response = await request('');
    const body = await response.json();

    expect(body.candidates).toEqual([
      { id, name: 'Ama', email: 'ama@example.test', eligible: true, reason: null },
      { id: id2, name: 'Ama', email: 'ama@example.test', eligible: false, reason: 'The private workspace link is unavailable.' },
    ]);
    mocks.suppressed.mockResolvedValue(new Set(['ama@example.test']));
    expect((await (await request('')).json()).candidates[0].reason).toContain('suppressed');
    mocks.suppressed.mockResolvedValue(new Set());
    mocks.link.mockResolvedValue({ ...link, revoked_at: '2026-11-04T00:00:00Z' });
    expect((await (await request('')).json()).candidates[0].eligible).toBe(false);
  });

  it('freezes personalized preview and rejects changed audience before enqueue', async () => {
    const response = await request(`/${id}/preview`, 'POST', { ids: [id], version: 1 });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.recipients[0]).toMatchObject({ id, recipient: 'ama@example.test', text: 'Visit https://example.test/conference-speakers/2026/token' });
    const preview = mocks.savePreview.mock.calls[0][0];

    expect(body.recipients[0].preview_url).toBe(`/api/annual-conference/2026/speaker-updates/${id}/previews/${body.preview_id}/recipients/${id}/html`);
    expect(preview.actor_id).toBe('owner');
    expect(preview.recipients[0].provider_payload.to).toEqual(['ama@example.test']);
    expect(body.recipients[0]).not.toHaveProperty('key');
    mocks.preview.mockResolvedValue(preview);
    mocks.link.mockResolvedValue({ ...link, revoked_at: '2026-11-04T00:00:00Z' });
    expect((await request(`/${id}/send`, 'POST', { preview_id: body.preview_id, confirmed: true })).status).toBe(409);
    expect(mocks.queue).not.toHaveBeenCalled();
    mocks.link.mockResolvedValue(link);
    expect((await request(`/${id}/send`, 'POST', { preview_id: body.preview_id, confirmed: true })).status).toBe(200);
    expect(mocks.queue).toHaveBeenCalledOnce();
  });

  it('serves only the exact frozen recipient HTML to the owning session', async () => {
    const html = '<style>p { color: red }</style><p>Frozen workspace link</p>';
    const preview = { id: id2, update_id: id, edition_id: 'edition', actor_id: 'owner', version: 1, used_at: null, expires_at: new Date(Date.now() + 60000).toISOString(), recipients: [{ id, html }] };

    mocks.preview.mockImplementation(async (previewId, updateId, editionId, actorId) => previewId === preview.id && updateId === preview.update_id && editionId === preview.edition_id && actorId === preview.actor_id ? preview : undefined);
    const path = `/${id}/previews/${id2}/recipients/${id}/html`;
    const response = await request(path);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.text()).toBe(html);
    expect(mocks.preview).toHaveBeenCalledWith(id2, id, 'edition', 'owner');
    expect(mocks.queue).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();

    mocks.session.mockResolvedValue({ authenticated: true, membership_id: 'other-owner' });
    expect((await request(path)).status).toBe(409);
    mocks.session.mockResolvedValue({ authenticated: true, membership_id: 'owner' });
    mocks.edition.mockResolvedValue({ id: 'other-edition', year: 2026 });
    expect((await request(path)).status).toBe(409);
    mocks.edition.mockResolvedValue({ id: 'edition', year: 2026 });
    mocks.campaign.mockResolvedValue({ ...campaign, id: id2 });
    expect((await request(path)).status).toBe(409);
    mocks.campaign.mockResolvedValue(campaign);
    expect((await request(`/${id}/previews/${id2}/recipients/${id2}/html`)).status).toBe(409);
    expect((await request(`/invalid/previews/${id2}/recipients/${id}/html`)).status).toBe(404);
    expect((await request(`/${id}/previews/${id2}/recipients/${id}/wrong`)).status).toBe(404);
  });

  it('rejects unavailable, expired, used, or stale preview documents', async () => {
    const path = `/${id}/previews/${id2}/recipients/${id}/html`;
    const valid = { version: 1, used_at: null, expires_at: new Date(Date.now() + 60000).toISOString(), recipients: [{ id, html: '<p>Frozen</p>' }] };

    for (const preview of [undefined, { ...valid, used_at: new Date().toISOString() }, { ...valid, expires_at: new Date(Date.now() - 1000).toISOString() }, { ...valid, version: 2 }]) {
      mocks.preview.mockResolvedValue(preview);
      const response = await request(path);

      expect(response.status).toBe(409);
      expect(response.headers.get('content-type')).toContain('application/json');
    }
    mocks.preview.mockResolvedValue(valid);
    mocks.campaign.mockResolvedValue({ ...campaign, state: 'queued' });
    expect((await request(path)).status).toBe(409);
    mocks.admin.mockResolvedValue(new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }));
    expect((await request(path)).status).toBe(401);
    mocks.admin.mockResolvedValue(null);
    mocks.capability.mockResolvedValue(new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }));
    expect((await request(path)).status).toBe(403);
  });

  it('requires explicit confirmation and rejects stale draft versions', async () => {
    expect((await request(`/${id}/send`, 'POST', { preview_id: id })).status).toBe(400);
    expect((await request(`/${id}/preview`, 'POST', { ids: [id], version: 2 })).status).toBe(409);
    expect(mocks.queue).not.toHaveBeenCalled();
  });

  it('fails closed when delivery is disabled', async () => {
    mocks.env.mockReturnValue('false');
    const listing = await (await request('')).json();

    expect(listing.sending_enabled).toBe(false);
    expect(listing.send_unavailable_reason).toContain('enabled');
    expect((await request(`/${id}/send`, 'POST', { preview_id: id, confirmed: true })).status).toBe(503);
    expect((await request(`/${id}/deliveries/${id2}/retry`, 'POST')).status).toBe(503);
    expect(mocks.queue).not.toHaveBeenCalled();
  });

  it('sends a test only to the chosen address using the frozen preview', async () => {
    mocks.env.mockReturnValue('false');
    const created = await request(`/${id}/preview`, 'POST', { ids: [id], version: 1 });
    const body = await created.json();
    const snapshot = mocks.savePreview.mock.calls[0][0];

    mocks.preview.mockResolvedValue(snapshot);
    mocks.rate.mockResolvedValue(null);
    mocks.send.mockResolvedValue({ ids: ['provider'], quota: {} });
    const document = await request(`/${id}/previews/${body.preview_id}/recipients/${id}/html`);
    const frozenHtml = await document.text();
    const response = await request(`/${id}/test`, 'POST', { preview_id: body.preview_id, recipient_id: id, request_id: id2, email: 'TESTER@example.test' });

    expect(created.status).toBe(200);
    expect(document.status).toBe(200);
    expect(response.status).toBe(200);
    expect(mocks.preview).toHaveBeenCalledWith(body.preview_id, id, 'edition', 'owner');
    expect(mocks.send.mock.calls[0][0].emails).toEqual([{ ...snapshot.recipients[0].provider_payload, to: ['tester@example.test'] }]);
    expect(mocks.send.mock.calls[0][0].emails[0].html).toBe(frozenHtml);
    expect(mocks.queue).not.toHaveBeenCalled();
  });
});
