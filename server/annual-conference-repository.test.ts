import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ANNUAL_CONFERENCE_2026_EDITION, ANNUAL_CONFERENCE_2026_PHASES, ANNUAL_CONFERENCE_2026_SEED_TASKS } from '@/lib/annual-conference-work-plan';

const mocks = vi.hoisted(() => ({
  supabaseWorkspace: vi.fn(),
  supabaseUpdateTask: vi.fn(),
  mockWorkspace: vi.fn(),
  mockUpdateTask: vi.fn(),
}));

vi.mock('@/lib/supabase/annual-conference-work-plan', async () => {
  const actual = await vi.importActual<typeof import('@/lib/supabase/annual-conference-work-plan')>(
    '@/lib/supabase/annual-conference-work-plan',
  );
  return {
    ...actual,
    getSupabaseAnnualConferenceWorkPlan: mocks.supabaseWorkspace,
    updateSupabaseAnnualConferenceTask: mocks.supabaseUpdateTask,
  };
});

vi.mock('@/lib/mock-db/annual-conference-work-plan', async () => {
  const actual = await vi.importActual<typeof import('@/lib/mock-db/annual-conference-work-plan')>(
    '@/lib/mock-db/annual-conference-work-plan',
  );
  return {
    ...actual,
    getMockAnnualConferenceWorkPlan: mocks.mockWorkspace,
    updateMockAnnualConferenceTask: mocks.mockUpdateTask,
  };
});

import { createAnnualConferenceRepository } from './annual-conference-repository';

const workspace = {
  edition: ANNUAL_CONFERENCE_2026_EDITION,
  phases: ANNUAL_CONFERENCE_2026_PHASES,
  tasks: ANNUAL_CONFERENCE_2026_SEED_TASKS,
};

describe('Annual Conference repository selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockWorkspace.mockReturnValue(workspace);
  });

  it('selects Supabase once and does not silently fall through on later not-found results', async () => {
    mocks.supabaseWorkspace.mockResolvedValue(workspace);
    mocks.supabaseUpdateTask.mockResolvedValue(undefined);
    const repository = createAnnualConferenceRepository();

    await expect(repository.getWorkspace(2026)).resolves.toBe(workspace);
    await expect(repository.updateTask('edition-1', 'missing', { status: 'done' }, 'owner@example.com'))
      .resolves.toBeUndefined();
    expect(mocks.mockWorkspace).not.toHaveBeenCalled();
    expect(mocks.mockUpdateTask).not.toHaveBeenCalled();
  });

  it('selects the mock adapter when Supabase reports that its runtime is disabled', async () => {
    mocks.supabaseWorkspace.mockResolvedValue(null);
    mocks.mockUpdateTask.mockReturnValue(ANNUAL_CONFERENCE_2026_SEED_TASKS[0]);
    const repository = createAnnualConferenceRepository();

    await expect(repository.getWorkspace(2026)).resolves.toBe(workspace);
    await repository.updateTask('edition-1', 'task-1', { status: 'done' }, 'owner@example.com');
    expect(mocks.mockUpdateTask).toHaveBeenCalledOnce();
    expect(mocks.supabaseUpdateTask).not.toHaveBeenCalled();
  });
});
