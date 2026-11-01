import type { ProgrammeSave, ProgrammeSnapshot } from '@/lib/annual-conference-programme';

export class ProgrammeError extends Error {
  constructor(readonly status: 403 | 404 | 409, message: string) {
    super(message);
  }
}

export function createAnnualConferenceProgrammeService(deps: {
  role: string;
  email: string;
  edition(year: number): Promise<{ id: string } | undefined>;
  repository: { get(id: string): Promise<ProgrammeSnapshot>; save(id: string, input: ProgrammeSave, actor: string): Promise<ProgrammeSnapshot | null> };
  audit(id: string, revision: number): Promise<void>;
}) {
  async function edition(year: number) {
    if (deps.role !== 'owner' && deps.role !== 'organizer') throw new ProgrammeError(403, 'Conference access required.');
    const result = await deps.edition(year);

    if (!result) throw new ProgrammeError(404, 'Conference edition not found.');

    return result;
  }

  return {
    async get(year: number) {
      return deps.repository.get((await edition(year)).id);
    },
    async save(year: number, input: ProgrammeSave) {
      const { id } = await edition(year);

      const saved = await deps.repository.save(id, input, deps.email);

      if (!saved) throw new ProgrammeError(409, 'Programme changed since you started editing. Reload the latest version when ready.');
      try {
        await deps.audit(id, saved.revision);
      } catch {
        console.error(JSON.stringify({ event: 'annual_conference_programme_audit_failed', edition_id: id }));
      }

      return saved;
    },
  };
}
