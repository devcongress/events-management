import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { createHash } from 'crypto';
import type { AppBindings } from '@/server/http/app-bindings';

const mocks = vi.hoisted(() => ({
  link: vi.fn(), session: vi.fn(), submission: vi.fn(), ensure: vi.fn(), update: vi.fn(), remove: vi.fn(), capability: vi.fn(), rpc: vi.fn(),
}));

vi.mock('@/lib/annual-conference-speakers', () => ({ getAnnualConferenceSpeakerIntakeLink: mocks.link, getAnnualConferenceSession: mocks.session, getAnnualConferenceSpeakerSubmission: mocks.submission }));
vi.mock('@/lib/supabase/annual-conference-social-cards', () => ({ ensureSpeakerSocialCard: mocks.ensure, removeSpeakerSocialCardPhoto: mocks.remove, updateSupabaseAnnualConferenceSocialCard: mocks.update, uploadSupabaseAnnualConferenceSocialCardPhoto: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ getSupabaseAdminClient: () => ({ rpc: mocks.rpc }) }));
vi.mock('@/server/annual-conference-request', () => ({ getAnnualConferenceEditionByYear: vi.fn().mockResolvedValue({ id: 'edition', speaker_logistics_deadline: null }), requireAnnualConferenceCapability: mocks.capability }));
vi.mock('@/server/http/public-intake-protection', () => ({ enforcePublicRateLimit: vi.fn().mockResolvedValue(null), publicClientKey: vi.fn().mockReturnValue('client') }));

import { registerAnnualConferenceSpeakerBadgeRoutes } from './annual-conference-speaker-badges';

const photoVersion = createHash('sha256').update('cards/card/original.jpg').digest('base64url');

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

  it('rejects revoked links but allows access after the due date', async () => {
    mocks.link.mockResolvedValueOnce({ id: 'link', revoked_at: '2026-01-01', speaker_submission_id: 'submission', workspace_session_id: 'session', expires_at: '2099-01-01' });
    mocks.link.mockResolvedValueOnce({ id: 'link', revoked_at: null, speaker_submission_id: 'submission', workspace_session_id: 'session', expires_at: '2020-01-01' });
    expect((await app().request('/api/conferences/2026/speaker-intake/token/badge')).status).toBe(404);
    expect((await app().request('/api/conferences/2026/speaker-intake/token/badge')).status).toBe(200);
    expect(mocks.ensure).toHaveBeenCalledOnce();
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

  it('removes only the authorized workspace photo', async () => {
    mocks.ensure.mockResolvedValueOnce({ id: 'card', display_name: 'Speaker', crop_x: 0.5, crop_y: 0.5, crop_scale: 1, photo_path: 'cards/card/original.jpg', revoked_at: null });
    mocks.remove.mockResolvedValueOnce({ display_name: 'Speaker', crop_x: 0.5, crop_y: 0.5, crop_scale: 1, photo_path: null });
    const result = await app().request('/api/conferences/2026/speaker-intake/token/badge/photo', { method: 'DELETE', headers: { 'X-Badge-Photo-Version': photoVersion } });

    expect(result.status).toBe(200);
    expect(result.headers.get('cache-control')).toBe('no-store');
    expect(await result.json()).toMatchObject({ card: { display_name: 'Speaker', photo_available: false } });
    expect(mocks.remove).toHaveBeenCalledWith('card', 'cards/card/original.jpg', expect.anything());
  });

  it('does not delete for a revoked or replaced private link', async () => {
    mocks.link.mockResolvedValueOnce({ id: 'link', revoked_at: '2026-01-01', speaker_submission_id: 'submission', workspace_session_id: 'session' });
    const result = await app().request('/api/conferences/2026/speaker-intake/token/badge/photo', { method: 'DELETE', headers: { 'X-Badge-Photo-Version': photoVersion } });

    expect(result.status).toBe(404);
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('reports conflict when the photo is replaced during removal', async () => {
    mocks.ensure.mockResolvedValueOnce({ id: 'card', photo_path: 'cards/card/original.jpg', revoked_at: null });
    mocks.remove.mockResolvedValueOnce(null);
    const result = await app().request('/api/conferences/2026/speaker-intake/token/badge/photo', { method: 'DELETE', headers: { 'X-Badge-Photo-Version': photoVersion } });

    expect(result.status).toBe(409);
  });

  it('reports storage failures and supports already-absent photos', async () => {
    mocks.ensure.mockResolvedValueOnce({ id: 'card', photo_path: 'cards/card/original.jpg', revoked_at: null });
    mocks.remove.mockRejectedValueOnce(new Error('storage unavailable'));
    expect((await app().request('/api/conferences/2026/speaker-intake/token/badge/photo', { method: 'DELETE', headers: { 'X-Badge-Photo-Version': photoVersion } })).status).toBe(503);
    expect((await app().request('/api/conferences/2026/speaker-intake/token/badge/photo', { method: 'DELETE' })).status).toBe(200);
  });

  it('rejects a stale photo version without touching a replacement', async () => {
    mocks.ensure.mockResolvedValueOnce({ id: 'card', photo_path: 'cards/card/replacement.jpg', revoked_at: null });
    const result = await app().request('/api/conferences/2026/speaker-intake/token/badge/photo', { method: 'DELETE', headers: { 'X-Badge-Photo-Version': photoVersion } });

    expect(result.status).toBe(409);
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('returns authorized aggregate storage usage without object paths', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [{ speaker_photo_count: 2, speaker_photo_bytes: 1000, shared_bucket_bytes: 5000, name: 'private' }], error: null });
    const result = await app().request('/api/annual-conference/2026/speakers/storage');

    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ speaker_photo_count: 2, speaker_photo_bytes: 1000, shared_bucket_bytes: 5000 });
    expect(mocks.capability).toHaveBeenCalledWith(expect.anything(), 2026, 'speakers.view');
    expect(mocks.rpc).toHaveBeenCalledWith('annual_conference_speaker_badge_storage_usage', { p_edition_id: 'edition' });
  });

  it('requires speaker capability before accessing aggregate storage', async () => {
    mocks.capability.mockResolvedValueOnce(new Response('Forbidden', { status: 403 }));
    const result = await app().request('/api/annual-conference/2026/speakers/storage');

    expect(result.status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('does not report zero when storage metadata or migration is unavailable', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [{ speaker_photo_count: 1, speaker_photo_bytes: null, shared_bucket_bytes: 100 }], error: null });
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'not found' } });
    expect((await app().request('/api/annual-conference/2026/speakers/storage')).status).toBe(503);
    expect((await app().request('/api/annual-conference/2026/speakers/storage')).status).toBe(503);
  });

});
