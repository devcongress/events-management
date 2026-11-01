import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { AppBindings } from '@/server/http/app-bindings';

const mocks = vi.hoisted(() => ({
  link: vi.fn(), session: vi.fn(), submission: vi.fn(), ensure: vi.fn(), update: vi.fn(), capability: vi.fn(),
}));

vi.mock('@/lib/annual-conference-speakers', () => ({ getAnnualConferenceSpeakerIntakeLink: mocks.link, getAnnualConferenceSession: mocks.session, getAnnualConferenceSpeakerSubmission: mocks.submission }));
vi.mock('@/lib/supabase/annual-conference-social-cards', () => ({ ensureSpeakerSocialCard: mocks.ensure, updateSupabaseAnnualConferenceSocialCard: mocks.update, uploadSupabaseAnnualConferenceSocialCardPhoto: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ getSupabaseAdminClient: vi.fn() }));
vi.mock('@/server/annual-conference-request', () => ({ getAnnualConferenceEditionByYear: vi.fn().mockResolvedValue({ id: 'edition', speaker_logistics_deadline: null }), requireAnnualConferenceCapability: mocks.capability }));
vi.mock('@/server/http/public-intake-protection', () => ({ enforcePublicRateLimit: vi.fn().mockResolvedValue(null), publicClientKey: vi.fn().mockReturnValue('client') }));

import { registerAnnualConferenceSpeakerBadgeRoutes } from './annual-conference-speaker-badges';

function app() {
  const instance = new Hono<AppBindings>();

  registerAnnualConferenceSpeakerBadgeRoutes(instance);

  return instance;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.link.mockResolvedValue({ id: 'link', speaker_submission_id: 'submission', workspace_session_id: 'session', expires_at: '2099-01-01', revoked_at: null });
  mocks.session.mockResolvedValue({ id: 'session', edition_id: 'edition', speaker_submission_id: 'submission', status: 'confirmed', availability_confirmed: false });
  mocks.submission.mockResolvedValue({ id: 'submission', edition_id: 'edition', status: 'selected', selected_session_id: 'session', selected_intake_link_id: 'link', speaker_name: 'Speaker' });
  mocks.ensure.mockResolvedValue({ id: 'card', display_name: 'Speaker', crop_x: 0.5, crop_y: 0.5, crop_scale: 1, photo_path: null, revoked_at: null });
  mocks.capability.mockResolvedValue(null);
});

describe('speaker badge access', () => {
  it('allows selected speakers before participation is confirmed', async () => {
    const result = await app().request('/api/conferences/2026/speaker-intake/token/badge');

    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ card: { role: 'speaker', display_name: 'Speaker' } });
    expect(result.headers.get('cache-control')).toBe('no-store');
  });

  it('rejects revoked, replaced, or unselected workspace access', async () => {
    mocks.link.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'old', speaker_submission_id: 'submission', workspace_session_id: 'session', expires_at: '2099-01-01' });
    expect((await app().request('/api/conferences/2026/speaker-intake/invalid/badge')).status).toBe(404);
    expect((await app().request('/api/conferences/2026/speaker-intake/old/badge')).status).toBe(404);
    mocks.submission.mockResolvedValueOnce({ id: 'submission', edition_id: 'edition', status: 'withdrawn', selected_session_id: 'session', selected_intake_link_id: 'link' });
    expect((await app().request('/api/conferences/2026/speaker-intake/token/badge')).status).toBe(404);
    expect(mocks.ensure).not.toHaveBeenCalled();
  });

  it('rejects archived sessions', async () => {
    mocks.session.mockResolvedValueOnce({ id: 'session', edition_id: 'edition', speaker_submission_id: 'submission', status: 'archived' });
    expect((await app().request('/api/conferences/2026/speaker-intake/token/badge')).status).toBe(404);
    expect(mocks.ensure).not.toHaveBeenCalled();
  });

  it('rejects revoked and expired links', async () => {
    mocks.link.mockResolvedValueOnce({ id: 'link', revoked_at: '2026-01-01', speaker_submission_id: 'submission', workspace_session_id: 'session', expires_at: '2099-01-01' });
    mocks.link.mockResolvedValueOnce({ id: 'link', revoked_at: null, speaker_submission_id: 'submission', workspace_session_id: 'session', expires_at: '2020-01-01' });
    expect((await app().request('/api/conferences/2026/speaker-intake/token/badge')).status).toBe(404);
    expect((await app().request('/api/conferences/2026/speaker-intake/token/badge')).status).toBe(404);
    expect(mocks.ensure).not.toHaveBeenCalled();
  });

  it('allows organizers with speaker viewing capability', async () => {
    const result = await app().request('/api/annual-conference/2026/speaker-badges/session');

    expect(result.status).toBe(200);
    expect(mocks.capability).toHaveBeenCalledWith(expect.anything(), 2026, 'speakers.view');
  });

  it('enforces organizer capability before exposing a card', async () => {
    mocks.capability.mockResolvedValueOnce(new Response('Forbidden', { status: 403 }));
    expect((await app().request('/api/annual-conference/2026/speaker-badges/session')).status).toBe(403);
    expect(mocks.ensure).not.toHaveBeenCalled();
  });

  it('rejects invalid crop and does not update a card', async () => {
    const result = await app().request('/api/conferences/2026/speaker-intake/token/badge', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ display_name: 'Speaker', crop: { x: 2, y: 0.5, scale: 1 } }) });

    expect(result.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
