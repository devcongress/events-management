import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ remote: true, batches: [] as string[][], removed: [] as string[][], saved: false }));

vi.mock('@/lib/supabase/server', () => ({
  isSupabaseRuntimeEnabled: () => state.remote,
  getSupabaseAdminClient: () => ({
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        is: () => query,
        update: () => query,
        in: (_field: string, ids: string[]) => {
          state.batches.push(ids);

          return Promise.resolve({ data: table === 'annual_conference_speaker_profiles' ? ids.map((id) => ({ id, programme_photo_path: 'old' })) : [], error: null });
        },
        maybeSingle: async () => ({ data: state.saved ? { id: 'speaker' } : null, error: null }),
      };

      return query;
    },
    storage: { from: () => ({ upload: async () => ({ error: null }), remove: async (paths: string[]) => { state.removed.push(paths);

 return { error: null }; } }) },
  }),
}));
vi.mock('@/lib/annual-conference-speakers', () => ({
  getAnnualConferenceSpeakerSubmissions: async () => [
    { id: 'a', status: 'selected', speaker_profile_id: null, speaker_email: ' AMA@example.com ' },
    { id: 'b', status: 'selected', speaker_profile_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', speaker_email: 'ama@example.com' },
  ],
}));

import { acceptedProgrammeProposals, ProgrammePhotoConflict, programmePhotoPaths, publicProgrammeSpeakers, saveProgrammePhoto } from './annual-conference-programme-speakers';
import type { Context } from 'hono';

const context = {} as Context;

describe('programme speaker persistence', () => {
  beforeEach(() => { Object.assign(state, { remote: true, batches: [], removed: [], saved: false }); });

  it('chunks and deduplicates proposal and profile queries', async () => {
    const ids = Array.from({ length: 205 }, (_, index) => String(index));

    await publicProgrammeSpeakers('edition', [...ids, ids[0]], context);
    expect(state.batches.map((batch) => batch.length)).toEqual([100, 100, 5]);
    state.batches = [];
    await programmePhotoPaths([...ids, ids[0]], context);
    expect(state.batches.map((batch) => batch.length)).toEqual([100, 100, 5]);
  });

  it('rolls back the uploaded object on a concurrent photo change', async () => {
    await expect(saveProgrammePhoto('speaker', new File(['photo'], 'photo.png', { type: 'image/png' }), context)).rejects.toBeInstanceOf(ProgrammePhotoConflict);
    expect(state.removed).toHaveLength(1);
    expect(state.removed[0][0]).toMatch(/^programme-speakers\/speaker\//);
    expect(state.removed[0]).not.toContain('old');
  });

  it('gives local legacy proposals with the same email one reusable speaker identity', async () => {
    state.remote = false;
    const proposals = await acceptedProgrammeProposals('edition', context);

    expect(proposals[0].speaker_profile_id).toBe(proposals[1].speaker_profile_id);
    expect(proposals[0].speaker_profile_id).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  });
});
