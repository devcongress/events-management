import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnnualConferenceTaskResource } from '@/lib/annual-conference-task-resources';

const storage = vi.hoisted(() => ({
  rows: [] as AnnualConferenceTaskResource[],
  queue: Promise.resolve() as Promise<unknown>,
}));

vi.mock('@/lib/mock-db', () => ({
  readData: vi.fn(async () => storage.rows.map((row) => ({ ...row }))),
  updateData: vi.fn((_filename: string, update: (rows: AnnualConferenceTaskResource[]) => {
    data: AnnualConferenceTaskResource[];
    result: unknown;
  }) => {
    const operation = storage.queue.then(() => {
      const outcome = update(storage.rows.map((row) => ({ ...row })));
      storage.rows = outcome.data;
      return outcome.result;
    });
    storage.queue = operation.catch(() => undefined);
    return operation;
  }),
}));

import { createMockAnnualConferenceTaskResource } from '@/lib/mock-db/annual-conference-task-resources';

function resource(index: number): AnnualConferenceTaskResource {
  return {
    id: `resource-${index}`,
    task_id: 'task-1',
    url: `https://example.com/${index}`,
    label: null,
    created_by_email: 'volunteer@example.com',
    updated_by_email: 'volunteer@example.com',
    created_at: `2026-09-08T00:00:${String(index).padStart(2, '0')}.000Z`,
    updated_at: `2026-09-08T00:00:${String(index).padStart(2, '0')}.000Z`,
  };
}

beforeEach(() => {
  storage.rows = Array.from({ length: 19 }, (_, index) => resource(index));
  storage.queue = Promise.resolve();
});

describe('mock Annual Conference task resource storage', () => {
  it('serializes concurrent creates so the per-task cap cannot be exceeded', async () => {
    const results = await Promise.allSettled([
      createMockAnnualConferenceTaskResource(
        'task-1',
        { url: 'https://example.com/a', label: null },
        'volunteer@example.com',
      ),
      createMockAnnualConferenceTaskResource(
        'task-1',
        { url: 'https://example.com/b', label: null },
        'volunteer@example.com',
      ),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(storage.rows.filter((row) => row.task_id === 'task-1')).toHaveLength(20);
  });
});
