import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { AppBindings } from '@/server/http/app-bindings';

const fixtures = vi.hoisted(() => ({
  proposals: [
    { id: '11111111-1111-4111-8111-111111111111', speaker_profile_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', speaker_name: 'Ama', title: 'Private original', abstract: 'Private abstract', status: 'selected', speaker_email: 'private@example.com' },
    { id: '22222222-2222-4222-8222-222222222222', speaker_profile_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', speaker_name: 'Ama', title: 'Another talk', status: 'selected' },
    { id: '33333333-3333-4333-8333-333333333333', speaker_profile_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', speaker_name: 'Ama', title: 'A different person', status: 'selected' },
  ],
}));

vi.mock('@/lib/supabase/admin-auth', () => ({ requireAdmin: async (c: { json: (body: object, status: number) => Response }) => c.json({ error: 'Unauthorized' }, 401), getAdminSession: async () => ({ authenticated: false }) }));
vi.mock('@/server/annual-conference-repository', () => ({ createAnnualConferenceRepository: () => ({ getWorkspace: async () => ({ edition: { id: 'edition' } }) }) }));
vi.mock('@/server/annual-conference-programme-repository', () => ({ createAnnualConferenceProgrammeRepository: () => ({ get: async () => ({ rows: [{ id: 'row', time: '10:00', title: 'Authored title', description: 'Edited text', type: 'panel', lead: 'private', resourceUrl: 'https://private.example', speakerProposalIds: fixtures.proposals.map((item) => item.id) }, { id: 'break', time: '11:00', title: 'Break', description: '', type: 'break' }], revision: 1, updated_by: 'private@example.com' }) }) }));
vi.mock('@/server/annual-conference-programme-speakers', () => ({
  acceptedProgrammeProposals: async () => fixtures.proposals,
  publicProgrammeEditionId: async () => 'edition',
  publicProgrammeRows: async () => [{ id: 'row', time: '10:00', title: 'Authored title', description: 'Edited text', type: 'panel', speakerProposalIds: fixtures.proposals.map((item) => item.id) }, { id: 'break', time: '11:00', title: 'Break', description: '', type: 'break' }],
  publicProgrammeSpeakers: async (_edition: string, ids: string[], _c: unknown, profileId?: string) => fixtures.proposals.filter((item) => ids.includes(item.id) && (!profileId || item.speaker_profile_id === profileId)),
  programmePhotoPaths: async () => new Map([['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'private/path']]),
  programmePhotoUrl: (origin: string, id: string) => `${origin}/api/public/annual-conference/2026/programme/speakers/${id}/photo`,
  programmeSpeakerId: (item: { id: string; speaker_profile_id: string | null }) => item.speaker_profile_id ?? item.id,
  referencedProposalIds: (rows: { speakerProposalIds?: string[] }[]) => new Set(rows.flatMap((row) => row.speakerProposalIds ?? [])),
  readProgrammePhoto: async () => new Blob(['image'], { type: 'image/png' }),
  saveProgrammePhoto: async () => {},
}));

import { registerAnnualConferenceProgrammeRoutes } from './annual-conference-programme';

const app = new Hono<AppBindings>();

registerAnnualConferenceProgrammeRoutes(app);

describe('public programme projection', () => {
  it('returns only authored fields and deduplicates one speaker across proposals', async () => {
    const response = await app.request('http://localhost/api/public/annual-conference/2026/programme');
    const body = await response.json();

    expect(body).toEqual({ year: 2026, rows: [
      { id: 'row', time: '10:00', title: 'Authored title', description: 'Edited text', type: 'panel', speakers: [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Ama', photoUrl: 'http://localhost/api/public/annual-conference/2026/programme/speakers/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/photo' }, { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Ama', photoUrl: null }] },
      { id: 'break', time: '11:00', title: 'Break', description: '', type: 'break', speakers: [] },
    ] });
    expect(JSON.stringify(body)).not.toContain('private@example.com');
  });

  it('limits photo access to referenced speakers and requires auth for private endpoints', async () => {
    expect((await app.request('http://localhost/api/public/annual-conference/2026/programme/speakers/cccccccc-cccc-4ccc-8ccc-cccccccccccc/photo')).status).toBe(404);
    const photo = await app.request('http://localhost/api/public/annual-conference/2026/programme/speakers/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/photo');

    expect(photo.status).toBe(200);
    expect(photo.headers.get('cache-control')).toBe('no-store');
    expect((await app.request('http://localhost/api/annual-conference/2026/programme/speakers')).status).toBe(401);
    expect((await app.request('http://localhost/api/annual-conference/2026/programme/speakers/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/photo', { method: 'DELETE' })).status).toBe(401);
  });
});
