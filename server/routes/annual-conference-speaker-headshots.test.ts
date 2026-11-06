import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { AppBindings } from '@/server/http/app-bindings';

const mocks = vi.hoisted(() => ({ link: vi.fn(), session: vi.fn(), submission: vi.fn(), update: vi.fn(), card: vi.fn(), capability: vi.fn(), upload: vi.fn(), download: vi.fn(), copy: vi.fn() }));

vi.mock('@/lib/annual-conference-speakers', () => ({ getAnnualConferenceSpeakerIntakeLink: mocks.link, getAnnualConferenceSession: mocks.session, getAnnualConferenceSpeakerSubmission: mocks.submission, updateAnnualConferenceSessionHeadshot: mocks.update }));
vi.mock('@/lib/supabase/annual-conference-social-cards', () => ({ ensureSpeakerSocialCard: mocks.card }));
vi.mock('@/lib/supabase/server', () => ({ getSupabaseAdminClient: () => ({ storage: { from: () => ({ upload: mocks.upload, download: mocks.download, copy: mocks.copy }) } }) }));
vi.mock('@/server/annual-conference-request', () => ({ getAnnualConferenceEditionByYear: vi.fn().mockResolvedValue({ id: 'edition' }), requireAnnualConferenceCapability: mocks.capability }));
vi.mock('@/server/http/public-intake-protection', () => ({ enforcePublicRateLimit: vi.fn().mockResolvedValue(null), publicClientKey: vi.fn().mockReturnValue('client') }));

import { registerAnnualConferenceSpeakerHeadshotRoutes } from './annual-conference-speaker-headshots';

const base = '/api/conferences/2026/speaker-intake/token/headshot';
const badgePath = 'cards/card/original.jpg';
const badgeVersion = createHash('sha256').update(badgePath).digest('base64url');
const image = new Uint8Array([0xff, 0xd8, 0xff, 0x01]);

function app() {
  const instance = new Hono<AppBindings>();

  registerAnnualConferenceSpeakerHeadshotRoutes(instance);

  return instance;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.link.mockResolvedValue({ id: 'link', speaker_submission_id: 'submission', workspace_session_id: 'session', revoked_at: null });
  mocks.session.mockResolvedValue({ id: 'session', edition_id: 'edition', speaker_submission_id: 'submission', status: 'confirmed', headshot_url: 'https://example.com/photo', headshot_photo_path: null, headshot_revision: 2 });
  mocks.submission.mockResolvedValue({ id: 'submission', edition_id: 'edition', status: 'selected', selected_session_id: 'session', selected_intake_link_id: 'link', speaker_name: 'Speaker' });
  mocks.card.mockResolvedValue({ photo_path: badgePath, revoked_at: null });
  mocks.capability.mockResolvedValue(null);
  mocks.download.mockResolvedValue({ data: new Blob([image], { type: 'image/jpeg' }), error: null });
  mocks.copy.mockResolvedValue({ error: null });
  mocks.upload.mockResolvedValue({ error: null });
  mocks.update.mockImplementation(async (_id, rev, selection) => ({ ...await mocks.session(), ...selection, headshot_revision: rev + 1 }));
});

describe('private speaker headshot workspace', () => {
  it('exposes source metadata without storage paths and rejects old or revoked links', async () => {
    const response = await app().request(base);
    const body = await response.json();

    expect(body).toEqual({ headshot: { source: 'link', url: 'https://example.com/photo', revision: 2, photo_available: false }, badge_photo: { available: true, version: badgeVersion } });
    expect(JSON.stringify(body)).not.toContain(badgePath);
    expect(response.headers.get('cache-control')).toContain('no-store');
    mocks.link.mockResolvedValueOnce({ id: 'link', revoked_at: 'now' });
    expect((await app().request(base)).status).toBe(404);
    mocks.submission.mockResolvedValueOnce({ id: 'submission', edition_id: 'edition', status: 'selected', selected_session_id: 'another' });
    expect((await app().request(base)).status).toBe(404);
  });

  it('checks revisions and validates HTTPS links without fetching them', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const request = (url: string, rev = '2') => app().request(base, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-Headshot-Revision': rev }, body: JSON.stringify({ source: 'link', url }) });

    expect((await request('http://example.com')).status).toBe(400);
    expect((await request('https://localhost/photo')).status).toBe(400);
    expect((await request('https://127.0.0.1/photo')).status).toBe(400);
    expect((await request('https://192.168.1.1/photo')).status).toBe(400);
    expect((await request('https://example.com', '1')).status).toBe(409);
    expect((await request('https://example.com')).status).toBe(200);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledWith('session', 2, { headshot_url: 'https://example.com/', headshot_photo_path: null });
    fetchSpy.mockRestore();
  });

  it('copies the original badge to a separate unique path and checks the observed version', async () => {
    const request = (badge_version: string) => app().request(base, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-Headshot-Revision': '2' }, body: JSON.stringify({ source: 'badge', badge_version }) });

    expect((await request('stale')).status).toBe(409);
    expect((await request(badgeVersion)).status).toBe(200);
    expect(mocks.copy).toHaveBeenCalledWith(badgePath, expect.stringMatching(/^headshots\/session\//));
    expect(mocks.update.mock.calls[0][2].headshot_photo_path).not.toBe(badgePath);
  });

  it('rejects mismatched image bytes and does not upload', async () => {
    const form = new FormData();

    form.set('file', new File(['not an image'], 'image.jpg', { type: 'image/jpeg' }));
    const response = await app().request(`${base}/photo`, { method: 'POST', headers: { 'X-Headshot-Revision': '2' }, body: form });

    expect(response.status).toBe(400);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('rejects a badge replaced during copying and leaves the current headshot untouched', async () => {
    mocks.card.mockResolvedValueOnce({ photo_path: badgePath, revoked_at: null }).mockResolvedValueOnce({ photo_path: 'cards/card/replacement.jpg', revoked_at: null });
    const response = await app().request(base, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-Headshot-Revision': '2' }, body: JSON.stringify({ source: 'badge', badge_version: badgeVersion }) });

    expect(response.status).toBe(409);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('uploads a verified original and returns no object path', async () => {
    const form = new FormData();

    form.set('file', new File([image], 'photo.jpg', { type: 'image/jpeg' }));
    const response = await app().request(`${base}/photo`, { method: 'POST', headers: { 'X-Headshot-Revision': '2' }, body: form });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.headshot).toEqual({ source: 'photo', url: null, revision: 3, photo_available: true });
    expect(JSON.stringify(body)).not.toContain('headshots/');
    expect(mocks.upload).toHaveBeenCalledOnce();
  });

  it('does not save an upload when its workspace link is revoked during storage', async () => {
    mocks.upload.mockImplementationOnce(async () => {
      mocks.link.mockResolvedValueOnce({ id: 'link', revoked_at: 'now' });

      return { error: null };
    });
    const form = new FormData();

    form.set('file', new File([image], 'photo.jpg', { type: 'image/jpeg' }));
    const response = await app().request(`${base}/photo`, { method: 'POST', headers: { 'X-Headshot-Revision': '2' }, body: form });

    expect(response.status).toBe(404);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('downloads with a safe extension for an authorized organizer', async () => {
    mocks.session.mockResolvedValueOnce({ id: 'session', edition_id: 'edition', speaker_submission_id: 'submission', status: 'confirmed', headshot_photo_path: 'headshots/session/photo' });
    const response = await app().request('/api/annual-conference/2026/speaker-headshots/session/photo');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="speaker-headshot.jpg"');
  });

  it('requires organizer access and scopes photo access to the selected session', async () => {
    mocks.capability.mockResolvedValueOnce(new Response('Forbidden', { status: 403 }));
    expect((await app().request('/api/annual-conference/2026/speaker-headshots/session/photo')).status).toBe(403);
    expect(mocks.download).not.toHaveBeenCalled();
    mocks.session.mockResolvedValueOnce({ id: 'session', edition_id: 'other', speaker_submission_id: 'submission', status: 'confirmed', headshot_photo_path: 'private' });
    expect((await app().request('/api/annual-conference/2026/speaker-headshots/session/photo')).status).toBe(404);
  });

  it('returns conflict when the atomic update loses a race', async () => {
    mocks.update.mockResolvedValueOnce(null);
    expect((await app().request(base, { method: 'DELETE', headers: { 'X-Headshot-Revision': '2' } })).status).toBe(409);
  });
});
