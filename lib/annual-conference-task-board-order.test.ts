import { describe, expect, it } from 'vitest';
import type { AnnualConferenceTask } from '@/lib/annual-conference-work-plan';
import { annualConferenceTasksForBoard } from './annual-conference-task-board-order';

function task(id: string, boardEnteredAt?: string | null): AnnualConferenceTask {
  return {
    id,
    edition_id: 'edition',
    title: id,
    details: null,
    internal_note: null,
    phase_id: 'phase',
    workstream: 'volunteers',
    accountable_owner: null,
    collaborators: [],
    priority: null,
    target_date: null,
    status: 'not_started',
    dependency_task_ids: [],
    dependency_note: null,
    source: 'manual',
    source_row: null,
    sort_order: 1,
    board_entered_at: boardEnteredAt,
    created_by_email: null,
    updated_by_email: null,
    completed_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

describe('annualConferenceTasksForBoard', () => {
  it('puts recently created or moved cards first and retains their newest-first order', () => {
    expect(annualConferenceTasksForBoard([
      task('established-first'),
      task('newer', '2026-09-22T11:02:00.000Z'),
      task('moved', '2026-09-22T11:01:00.000Z'),
      task('established-second'),
    ]).map((item) => item.id)).toEqual([
      'newer',
      'moved',
      'established-first',
      'established-second',
    ]);
  });

  it('keeps the source order for legacy cards and equal move times', () => {
    expect(annualConferenceTasksForBoard([
      task('legacy-first'),
      task('moved-first', '2026-09-22T11:00:00.000Z'),
      task('moved-second', '2026-09-22T11:00:00.000Z'),
      task('legacy-second'),
    ]).map((item) => item.id)).toEqual([
      'moved-first',
      'moved-second',
      'legacy-first',
      'legacy-second',
    ]);
  });

  it('orders PostgreSQL and client timestamp formats by their actual time', () => {
    expect(annualConferenceTasksForBoard([
      task('whole-second', '2026-09-22T11:00:00+00:00'),
      task('client-move', '2026-09-22T11:00:00.100Z'),
      task('invalid-legacy', 'not-a-timestamp'),
    ]).map((item) => item.id)).toEqual([
      'client-move',
      'whole-second',
      'invalid-legacy',
    ]);
  });
});
