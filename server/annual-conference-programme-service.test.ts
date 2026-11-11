import { describe, expect, it, vi } from 'vitest';
import { programmeSaveSchema } from '@/lib/annual-conference-programme';
import { createAnnualConferenceProgrammeService } from './annual-conference-programme-service';

const row = { id: '14b4b5bc-4e3b-4c31-88a9-bc4ec1b099ab', time: '', title: 'Opening', type: 'talk', lead: '', description: '', resourceTitle: '', resourceUrl: '' };

describe('conference programme', () => {
  it('normalizes blank time and rejects invalid, unsafe, duplicate or excessive rows', () => {
    expect(programmeSaveSchema.parse({ revision: 0, rows: [row] }).rows[0].time).toBe('TBD');
    expect(programmeSaveSchema.safeParse({ revision: 0, rows: [{ ...row, title: ' ' }] }).success).toBe(false);
    expect(programmeSaveSchema.safeParse({ revision: 0, rows: [{ ...row, resourceUrl: 'javascript:alert(1)' }] }).success).toBe(false);
    expect(programmeSaveSchema.safeParse({ revision: 0, rows: [row, row] }).success).toBe(false);
    expect(programmeSaveSchema.safeParse({ revision: 0, rows: Array(101).fill(row) }).success).toBe(false);
  });

  it('resolves each year independently after route authorization', async () => {
    const get = vi.fn(async () => ({ rows: [], revision: 0, updated_at: null, updated_by: null }));
    const edition = vi.fn(async (year: number) => year === 2026 ? { id: 'edition-26' } : undefined);
    const dependencies = { role: 'organizer', email: 'organizer@example.com', edition, repository: { get, save: vi.fn(async () => ({ rows: [], revision: 1, updated_at: null, updated_by: null })) }, audit: vi.fn(async () => {}) };
    const service = createAnnualConferenceProgrammeService(dependencies);

    await service.get(2026);
    expect(get).toHaveBeenCalledWith('edition-26');
    await expect(service.get(2027)).rejects.toMatchObject({ status: 404 });
    await expect(createAnnualConferenceProgrammeService({ ...dependencies, role: 'member' }).get(2026)).resolves.toMatchObject({ revision: 0 });
  });

  it('returns the exact committed snapshot when audit fails without rereading', async () => {
    const saved = { rows: programmeSaveSchema.parse({ revision: 0, rows: [row] }).rows, revision: 1, updated_at: '2026-11-01T00:00:00Z', updated_by: 'owner@example.com' };
    const get = vi.fn(async () => { throw new Error('later read failed'); });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const service = createAnnualConferenceProgrammeService({
      role: 'owner',
      email: 'owner@example.com',
      edition: async () => ({ id: 'edition' }),
      repository: { get, save: async () => saved },
      audit: async () => { throw new Error('audit failed'); },
    });

    try {
      await expect(service.save(2026, programmeSaveSchema.parse({ revision: 0, rows: [row] }))).resolves.toEqual(saved);
      expect(get).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledOnce();
    } finally {
      log.mockRestore();
    }
  });

  it('reports conflicts without auditing and propagates storage failures', async () => {
    const audit = vi.fn(async () => {});
    const repository = { get: vi.fn(async () => ({ rows: [], revision: 0, updated_at: null, updated_by: null })), save: vi.fn(async () => null) };
    const service = createAnnualConferenceProgrammeService({ role: 'owner', email: 'owner@example.com', edition: async () => ({ id: 'edition' }), repository, audit });
    const input = programmeSaveSchema.parse({ revision: 0, rows: [row] });

    await expect(service.save(2026, input)).rejects.toMatchObject({ status: 409 });
    expect(audit).not.toHaveBeenCalled();
    repository.save.mockRejectedValueOnce(new Error('storage unavailable'));
    await expect(service.save(2026, input)).rejects.toThrow('storage unavailable');
  });

  it('rejects unselected or cross-edition proposals before saving and deduplicates IDs per row', async () => {
    const acceptedId = '11111111-1111-4111-8111-111111111111';
    const otherId = '22222222-2222-4222-8222-222222222222';
    const save = vi.fn(async (_id, input) => ({ rows: input.rows, revision: 1, updated_at: null, updated_by: null }));
    const service = createAnnualConferenceProgrammeService({
      role: 'owner', email: 'owner@example.com', edition: async () => ({ id: 'edition' }),
      repository: { get: async () => ({ rows: [], revision: 0, updated_at: null, updated_by: null }), save },
      acceptedProposalIds: async () => new Set([acceptedId]), audit: async () => {},
    });
    const invalid = programmeSaveSchema.parse({ revision: 0, rows: [{ ...row, speakerProposalIds: [otherId] }] });

    await expect(service.save(2026, invalid)).rejects.toMatchObject({ status: 400 });
    expect(save).not.toHaveBeenCalled();
    const valid = programmeSaveSchema.parse({ revision: 0, rows: [{ ...row, speakerProposalIds: [acceptedId, acceptedId] }] });

    await service.save(2026, valid);
    expect(valid.rows[0].speakerProposalIds).toEqual([acceptedId]);
  });

  it('allows a denied organizer to preserve existing speaker links while editing authored copy', async () => {
    const proposalId = '11111111-1111-4111-8111-111111111111';
    const initial = programmeSaveSchema.parse({ revision: 1, rows: [{ ...row, speakerProposalIds: [proposalId] }] });
    const save = vi.fn(async (_id, input) => ({ rows: input.rows, revision: 2, updated_at: null, updated_by: null }));
    const service = createAnnualConferenceProgrammeService({
      role: 'organizer', email: 'organizer@example.com', edition: async () => ({ id: 'edition' }),
      repository: { get: async () => ({ rows: initial.rows, revision: 1, updated_at: null, updated_by: null }), save },
      acceptedProposalIds: async () => new Set([proposalId]), canManageSpeakers: async () => false, audit: async () => {},
    });

    await expect(service.save(2026, { ...initial, rows: [{ ...initial.rows[0], title: 'Edited copy' }] })).resolves.toMatchObject({ revision: 2 });
    await expect(service.save(2026, { ...initial, rows: [{ ...initial.rows[0], speakerProposalIds: [] }] })).rejects.toMatchObject({ status: 403 });
    expect(save).toHaveBeenCalledOnce();
  });

  it('allows unchanged stale links, rejects restricted reorder, and permits authorized stale removal', async () => {
    const stale = '11111111-1111-4111-8111-111111111111';
    const accepted = '22222222-2222-4222-8222-222222222222';
    const input = programmeSaveSchema.parse({ revision: 1, rows: [{ ...row, speakerProposalIds: [stale, accepted] }] });
    const save = vi.fn(async (_id, data) => ({ rows: data.rows, revision: 2, updated_at: null, updated_by: null }));
    const deps = {
      role: 'organizer', email: 'organizer@example.com', edition: async () => ({ id: 'edition' }),
      repository: { get: async () => ({ rows: input.rows, revision: 1, updated_at: null, updated_by: null }), save },
      acceptedProposalIds: async () => new Set([accepted]), canManageSpeakers: async () => false, audit: async () => {},
    };
    const service = createAnnualConferenceProgrammeService(deps);

    await expect(service.save(2026, input)).resolves.toMatchObject({ revision: 2 });
    await expect(service.save(2026, { ...input, rows: [{ ...input.rows[0], speakerProposalIds: [accepted, stale] }] })).rejects.toMatchObject({ status: 403 });
    const authorized = createAnnualConferenceProgrammeService({ ...deps, canManageSpeakers: async () => true });

    await expect(authorized.save(2026, { ...input, rows: [{ ...input.rows[0], speakerProposalIds: [accepted] }] })).resolves.toMatchObject({ revision: 2 });
  });

});
