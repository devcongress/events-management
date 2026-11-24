import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { AnnualConferenceSession } from '@/lib/annual-conference-speakers';
import type { AppBindings } from '@/server/http/app-bindings';

const state = vi.hoisted(() => ({
  adminAllowed: false,
  capabilityAllowed: true,
  sessions: [] as AnnualConferenceSession[],
}));

vi.mock('@/lib/supabase/admin-auth', () => ({
  requireAdmin: async (c: { json: (body: object, status: number) => Response }) =>
    state.adminAllowed ? null : c.json({ error: 'Unauthorized' }, 401),
}));

vi.mock('@/server/annual-conference-request', () => ({
  getAnnualConferenceEditionByYear: async (year: number) =>
    year === 2026 ? { id: '20260000-0000-4000-8000-000000000001', year: 2026, label: 'December 2026', name: 'DevCon26' } : null,
  requireAnnualConferenceCapability: async (c: { json: (body: object, status: number) => Response }) =>
    state.capabilityAllowed ? null : c.json({ error: 'Forbidden' }, 403),
}));

vi.mock('@/server/protected-mutation', () => ({
  recordProtectedMutationAudit: async () => {},
}));

vi.mock('@/lib/annual-conference-speakers', () => ({
  listFeaturedWebsiteConferenceSessions: async (editionId: string) =>
    state.sessions.filter((item) => item.edition_id === editionId && item.status === 'confirmed' && item.website_featured),
  getAnnualConferenceSession: async (id: string) => state.sessions.find((item) => item.id === id),
  updateAnnualConferenceSessionWebsiteLineup: async (
    id: string,
    updates: { website_featured: boolean; website_role: string | null; website_organization: string | null },
  ) => {
    const index = state.sessions.findIndex((item) => item.id === id && item.status === 'confirmed');

    if (index < 0) return null;
    state.sessions[index] = {
      ...state.sessions[index],
      website_featured: updates.website_featured,
      website_role: updates.website_role,
      website_organization: updates.website_organization,
      website_featured_at: updates.website_featured ? '2026-11-24T06:40:00.000Z' : null,
      updated_at: '2026-11-24T06:40:00.000Z',
    };

    return state.sessions[index];
  },
}));

vi.mock('@/lib/supabase/server', () => ({
  isSupabaseRuntimeEnabled: () => false,
  getSupabaseAdminClient: () => {
    throw new Error('Unexpected Supabase client call in unit test');
  },
}));

import { registerAnnualConferenceWebsiteSpeakerRoutes } from './annual-conference-website-speakers';

function makeSession(overrides: Partial<AnnualConferenceSession>): AnnualConferenceSession {
  return {
    id: '65a61474-2a6c-4313-81be-f667c4e2a623',
    edition_id: '20260000-0000-4000-8000-000000000001',
    speaker_submission_id: 'dbb2f972-04f9-4703-b682-e71a8ca1d4d3',
    speaker_name: 'Edem Kumodzi',
    speaker_email: 'private-edem@example.com',
    title: 'Evaluation Driven Development',
    topic: 'AI & Emerging Technologies',
    session_type: '25-minute short talk',
    learning_outcomes: [],
    abstract: 'Private abstract',
    bio: 'Edem Kumodzi is a software architect.',
    slides_url: null,
    availability_confirmed: true,
    technical_requirements: null,
    accessibility_requirements: null,
    headshot_url: null,
    headshot_photo_path: 'headshots/65a61474-2a6c-4313-81be-f667c4e2a623/photo-1',
    headshot_revision: 1,
    social_handle: null,
    workshop_prerequisites: null,
    required_software_equipment: null,
    participants_need_laptops: null,
    preferred_workshop_capacity: null,
    logistics_updated_at: null,
    website_featured: true,
    website_role: 'Software Architect',
    website_organization: 'Microsoft',
    website_featured_at: '2026-11-24T06:00:00.000Z',
    status: 'confirmed',
    created_at: '2026-11-01T00:00:00.000Z',
    updated_at: '2026-11-24T06:00:00.000Z',
    ...overrides,
  };
}

const app = new Hono<AppBindings>();

registerAnnualConferenceWebsiteSpeakerRoutes(app);

describe('annual conference website speakers routes', () => {
  beforeEach(() => {
    state.adminAllowed = false;
    state.capabilityAllowed = true;
    state.sessions = [
      makeSession({}),
      makeSession({
        id: 'bf8fc371-e3ec-4e0a-9973-5f99ceecde66',
        speaker_name: 'Silas Bempong',
        speaker_email: 'private-silas@example.com',
        bio: 'Silas Bempong is an AI/ML engineer.',
        website_featured: false,
        website_role: 'AI/ML Engineer',
        website_organization: null,
        website_featured_at: null,
      }),
    ];
  });

  it('serves only featured confirmed speakers, hides private fields, and supports ETag 304', async () => {
    const first = await app.request('http://localhost/api/public/annual-conference/2026/speakers');

    expect(first.status).toBe(200);
    expect(first.headers.get('cache-control')).toContain('s-maxage=300');
    const etag = first.headers.get('etag');

    expect(etag).toBeTruthy();

    const body = await first.json();

    expect(body.year).toBe(2026);
    expect(body.speakers).toHaveLength(1);
    expect(body.speakers[0]).toMatchObject({
      id: '65a61474-2a6c-4313-81be-f667c4e2a623',
      name: 'Edem Kumodzi',
      role: 'Software Architect',
      organization: 'Microsoft',
      bio: 'Edem Kumodzi is a software architect.',
    });
    expect(body.speakers[0].photoUrl).toContain('/api/public/annual-conference/2026/speakers/65a61474-2a6c-4313-81be-f667c4e2a623/photo?v=');
    expect(JSON.stringify(body)).not.toContain('private-edem@example.com');
    expect(JSON.stringify(body)).not.toContain('Silas');

    const cached = await app.request('http://localhost/api/public/annual-conference/2026/speakers', {
      headers: { 'If-None-Match': etag! },
    });

    expect(cached.status).toBe(304);
  });

  it('requires organizer auth and reflects add/remove changes immediately', async () => {
    const unauthorized = await app.request(
      'http://localhost/api/annual-conference/2026/speaker-sessions/bf8fc371-e3ec-4e0a-9973-5f99ceecde66/website-lineup',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ featured: true, role: 'AI/ML Engineer', organization: null }),
      },
    );

    expect(unauthorized.status).toBe(401);

    state.adminAllowed = true;
    const add = await app.request(
      'http://localhost/api/annual-conference/2026/speaker-sessions/bf8fc371-e3ec-4e0a-9973-5f99ceecde66/website-lineup',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ featured: true, role: 'AI/ML Engineer', organization: null }),
      },
    );

    expect(add.status).toBe(200);
    const afterAdd = await (await app.request('http://localhost/api/public/annual-conference/2026/speakers')).json();

    expect(afterAdd.speakers.map((item: { name: string }) => item.name)).toEqual(['Edem Kumodzi', 'Silas Bempong']);

    const remove = await app.request(
      'http://localhost/api/annual-conference/2026/speaker-sessions/65a61474-2a6c-4313-81be-f667c4e2a623/website-lineup',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ featured: false }),
      },
    );

    expect(remove.status).toBe(200);
    const afterRemove = await (await app.request('http://localhost/api/public/annual-conference/2026/speakers')).json();

    expect(afterRemove.speakers.map((item: { name: string }) => item.name)).toEqual(['Silas Bempong']);
  });
});
