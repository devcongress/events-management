import { afterEach, describe, expect, it, vi } from 'vitest';
import * as speakers from '@/lib/annual-conference-speakers';
import * as supabase from '@/lib/supabase/server';
import * as conference from '@/server/annual-conference-request';
import app from './app';

const base = '/api/public/annual-conference/2026/speakers';
const id = '65a61474-2a6c-4313-81be-f667c4e2a623';
const editionId = '20260000-0000-4000-8000-000000000001';
const session = {
  id,
  edition_id: editionId,
  status: 'confirmed',
  website_featured: true,
  speaker_name: 'Example Speaker',
  website_role: null,
  website_organization: null,
  bio: 'Public biography',
  headshot_photo_path: 'private/photo',
  headshot_revision: 1,
  updated_at: '2026-11-24T06:00:00.000Z',
} as speakers.AnnualConferenceSession;

function setup() {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('PUBLIC_APP_URL', 'https://ems.example');
  vi.stubEnv('PUBLIC_API_CORS_ORIGINS', 'https://devcongress.org');
  vi.spyOn(conference, 'getAnnualConferenceEditionByYear').mockResolvedValue({ id: editionId } as never);
  vi.spyOn(speakers, 'listFeaturedWebsiteConferenceSessions').mockResolvedValue([session]);
  vi.spyOn(speakers, 'getAnnualConferenceSession').mockResolvedValue(session);
  vi.spyOn(supabase, 'isSupabaseRuntimeEnabled').mockReturnValue(true);
  vi.spyOn(supabase, 'getSupabaseAdminClient').mockReturnValue({
    storage: {
      from: () => ({
        download: async () => ({
          data: new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0x00])]),
          error: null,
        }),
      }),
    },
  } as never);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('website speaker access through application middleware', () => {
  it('serves the feed and its revisioned photo anonymously, including HEAD and website CORS', async () => {
    setup();
    const headers = { Origin: 'https://devcongress.org' };
    const feed = await app.request(`https://ems.example${base}`, { headers });

    expect(feed.status).toBe(200);
    expect(feed.headers.get('access-control-allow-origin')).toBe(headers.Origin);
    expect(feed.headers.get('access-control-allow-credentials')).toBeNull();
    const body = await feed.json();
    const photoUrl = body.speakers[0].photoUrl as string;

    expect(photoUrl).toMatch(new RegExp(`/speakers/${id}/photo\\?v=[A-Za-z0-9_-]{16}$`));
    for (const method of ['GET', 'HEAD']) {
      const photo = await app.request(photoUrl, { method, headers });

      expect(photo.status).toBe(200);
      expect(photo.headers.get('content-type')).toBe('image/jpeg');
      expect(photo.headers.get('access-control-allow-origin')).toBe(headers.Origin);
      if (method === 'GET') expect((await photo.arrayBuffer()).byteLength).toBe(4);
    }
    expect((await app.request(`https://ems.example${base}`, { method: 'HEAD', headers })).status).toBe(200);
    const deniedOrigin = await app.request(photoUrl, { headers: { Origin: 'https://attacker.example' } });

    expect(deniedOrigin.headers.get('access-control-allow-origin')).toBeNull();
    for (const path of [base, `${base}/${id}/photo`]) {
      const preflight = await app.request(`https://ems.example${path}`, {
        method: 'OPTIONS', headers: { ...headers, 'Access-Control-Request-Method': 'GET' },
      });

      expect(preflight.headers.get('access-control-allow-origin')).toBe(headers.Origin);
      expect(preflight.headers.get('access-control-allow-credentials')).toBeNull();
    }
  });

  it('rejects unsupported query strings, protected operations and unrelated routes', async () => {
    setup();
    const photo = `${base}/${id}/photo`;

    for (const path of [
      `${base}?v=abcdefghijklmnop`,
      `${photo}?v=short`,
      `${photo}?v=abcdefghijklmnop&v=abcdefghijklmnop`,
      `${photo}?v=abcdefghijklmnop&x=1`,
      `${photo}?x=abcdefghijklmnop`,
      '/api/public/annual-conference/2026/programme?v=abcdefghijklmnop',
    ]) {
      expect((await app.request(`https://ems.example${path}`)).status).toBe(400);
    }
    expect((await app.request(`https://ems.example${photo}`)).status).toBe(200);
    for (const [path, method] of [
      [base, 'POST'],
      [photo, 'DELETE'],
      [`${base}/neighbor`, 'GET'],
      [`${base}/invalid/photo`, 'GET'],
      [`/api/annual-conference/2026/speaker-sessions/${id}/website-lineup`, 'PATCH'],
    ]) {
      expect((await app.request(`https://ems.example${path}`, { method })).status).toBe(401);
    }
    const unrelated = await app.request(`https://ems.example${base}/neighbor`, {
      method: 'OPTIONS', headers: { Origin: 'https://devcongress.org', 'Access-Control-Request-Method': 'GET' },
    });

    expect(unrelated.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('retains photo eligibility checks through the full application', async () => {
    setup();
    const lookup = vi.mocked(speakers.getAnnualConferenceSession);

    for (const overrides of [
      { website_featured: false },
      { status: 'pending' },
      { edition_id: 'other' },
      { headshot_photo_path: null },
    ]) {
      lookup.mockResolvedValueOnce({ ...session, ...overrides } as speakers.AnnualConferenceSession);
      expect((await app.request(`https://ems.example${base}/${id}/photo?v=abcdefghijklmnop`)).status).toBe(404);
    }
  });
});
