import type { ProgrammeSave, ProgrammeSnapshot } from '@/lib/annual-conference-programme';

export class ProgrammeError extends Error {
  constructor(readonly status: 400 | 403 | 404 | 409, message: string) {
    super(message);
  }
}

export function createAnnualConferenceProgrammeService(deps: {
  role: string;
  email: string;
  edition(year: number): Promise<{ id: string } | undefined>;
  repository: { get(id: string): Promise<ProgrammeSnapshot>; save(id: string, input: ProgrammeSave, actor: string): Promise<ProgrammeSnapshot | null> };
  audit(id: string, revision: number): Promise<void>;
  acceptedProposalIds?(id: string): Promise<Set<string>>;
  canManageSpeakers?(year: number): Promise<boolean>;
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

      let previousRows: ProgrammeSnapshot['rows'] = [];

      if (deps.canManageSpeakers) {
        const current = await deps.repository.get(id);

        previousRows = current.rows;

        if (current.revision !== input.revision) throw new ProgrammeError(409, 'Programme changed since you started editing. Reload the latest version when ready.');
        const links = (rows: ProgrammeSnapshot['rows']) => JSON.stringify(rows.flatMap((row) => {
          const ids = row.speakerProposalIds ?? [];

          return ids.length ? [[row.id, ids]] : [];
        }).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));

        if (links(current.rows) !== links(input.rows) && !await deps.canManageSpeakers(year)) {
          throw new ProgrammeError(403, 'This account has not been assigned that conference responsibility.');
        }
      }
      const previousByRow = new Map(previousRows.map((row) => [row.id, new Set(row.speakerProposalIds ?? [])]));
      const ids = input.rows.flatMap((row) => row.speakerProposalIds.filter((proposalId) => !previousByRow.get(row.id)?.has(proposalId)));

      if (ids.length) {
        const accepted = await deps.acceptedProposalIds?.(id);

        if (!accepted || ids.some((proposalId) => !accepted.has(proposalId))) {
          throw new ProgrammeError(400, 'Speakers must be selected proposals from this conference.');
        }
      }
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
