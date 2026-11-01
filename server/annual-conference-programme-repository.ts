import type { Context } from 'hono';
import { readData, updateData } from '@/lib/mock-db';
import { getSupabaseAdminClient, isSupabaseRuntimeEnabled } from '@/lib/supabase/server';
import { programmeRowSchema, type ProgrammeSave, type ProgrammeSnapshot } from '@/lib/annual-conference-programme';

const FILE = 'annual-conference-programmes';
const normalize = (snapshot: ProgrammeSnapshot): ProgrammeSnapshot => ({ ...snapshot, rows: snapshot.rows.map((row) => programmeRowSchema.parse(row)) });
const empty = (): ProgrammeSnapshot => ({ rows: [], revision: 0, updated_at: null, updated_by: null });

type StoredProgramme = ProgrammeSnapshot & { edition_id: string };

export function createAnnualConferenceProgrammeRepository(c?: Context) {
  const remote = isSupabaseRuntimeEnabled(c);

  return {
    async get(editionId: string): Promise<ProgrammeSnapshot> {
      if (!remote) {
        return normalize((await readData<StoredProgramme>(FILE)).find((item) => item.edition_id === editionId) ?? empty());
      }

      const result = await getSupabaseAdminClient(c).from('annual_conference_programmes' as never)
        .select('rows, revision, updated_at, updated_by').eq('edition_id', editionId).maybeSingle() as unknown as { data: ProgrammeSnapshot | null; error: { message: string } | null };

      if (result.error) throw new Error(result.error.message);

      return normalize(result.data ?? empty());
    },
    async save(editionId: string, input: ProgrammeSave, actor: string): Promise<ProgrammeSnapshot | null> {
      if (!remote) {
        return updateData<StoredProgramme, ProgrammeSnapshot | null>(FILE, (items) => {
          const current = items.find((item) => item.edition_id === editionId);

          if ((current?.revision ?? 0) !== input.revision) return { data: items, result: null };
          const next = { edition_id: editionId, rows: input.rows, revision: input.revision + 1, updated_at: new Date().toISOString(), updated_by: actor };

          return { data: [...items.filter((item) => item.edition_id !== editionId), next], result: next };
        });
      }

      const result = await getSupabaseAdminClient(c).rpc('save_annual_conference_programme' as never, {
        p_edition_id: editionId, p_revision: input.revision, p_rows: input.rows, p_actor: actor,
      } as never);

      if (result.error) throw new Error(result.error.message);

      return result.data as ProgrammeSnapshot | null;
    },
  };
}
