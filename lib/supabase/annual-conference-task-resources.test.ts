import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  enabled: vi.fn(() => true),
}));

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdminClient: () => ({ from: mocks.from }),
  isSupabaseRuntimeEnabled: mocks.enabled,
}));

import {
  createSupabaseAnnualConferenceTaskResource,
  updateSupabaseAnnualConferenceTaskResource,
} from '@/lib/supabase/annual-conference-task-resources';
import { AnnualConferenceTaskResourceLimitError } from '@/lib/annual-conference-task-resources';

function updateQuery(result: { data: unknown; error: { message: string } | null }) {
  const query = {
    update: vi.fn(),
    eq: vi.fn(),
    select: vi.fn(),
    maybeSingle: vi.fn(async () => result),
  };
  query.update.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.select.mockReturnValue(query);
  return query;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.enabled.mockReturnValue(true);
});

describe('Supabase Annual Conference task resource storage', () => {
  it('enforces the volunteer creator predicate in the update query', async () => {
    const query = updateQuery({ data: undefined, error: null });
    mocks.from.mockReturnValue(query);

    await expect(updateSupabaseAnnualConferenceTaskResource(
      'task-1',
      'resource-1',
      { label: 'Notes' },
      'Volunteer@Example.com',
      'Volunteer@Example.com',
    )).resolves.toBeUndefined();

    expect(query.eq).toHaveBeenCalledWith('task_id', 'task-1');
    expect(query.eq).toHaveBeenCalledWith('id', 'resource-1');
    expect(query.eq).toHaveBeenCalledWith('created_by_email', 'volunteer@example.com');
    expect(query.update).toHaveBeenCalledWith({ label: 'Notes', updated_by_email: 'volunteer@example.com' });
  });

  it('maps the database cap violation to the domain limit error', async () => {
    const query = {
      insert: vi.fn(),
      select: vi.fn(),
      single: vi.fn(async () => ({
        data: null,
        error: { message: 'annual_conference_task_resource_limit' },
      })),
    };
    query.insert.mockReturnValue(query);
    query.select.mockReturnValue(query);
    mocks.from.mockReturnValue(query);

    await expect(createSupabaseAnnualConferenceTaskResource(
      'task-1',
      { url: 'https://example.com', label: null },
      'volunteer@example.com',
    )).rejects.toBeInstanceOf(AnnualConferenceTaskResourceLimitError);
  });
});
