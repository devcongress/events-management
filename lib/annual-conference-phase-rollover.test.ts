import { describe, expect, it } from 'vitest';
import { dueAnnualConferencePhaseRollovers } from './annual-conference-phase-rollover';
import type { AnnualConferencePhase, AnnualConferenceTask } from './annual-conference-work-plan';

const phase = (id: string, starts_on: string, ends_on: string, sort_order: number): AnnualConferencePhase => ({
  id, edition_id: 'edition', name: id, starts_on, ends_on, sort_order,
  created_by_email: null, updated_by_email: null, created_at: '', updated_at: '',
});
const task = (id: string, status: AnnualConferenceTask['status']): AnnualConferenceTask => ({
  id, edition_id: 'edition', title: id, details: null, internal_note: null, phase_id: 'phase-1', workstream: 'volunteers', accountable_owner: null, collaborators: [], priority: null, target_date: null, status, dependency_task_ids: [], dependency_note: null, source: 'manual', source_row: null, sort_order: 1, created_by_email: null, updated_by_email: null, completed_at: status === 'done' ? '' : null, created_at: '', updated_at: '',
});

describe('Annual Conference phase rollover', () => {
  it('moves only unfinished carry-over tasks once the next phase begins', () => {
    const rollovers = dueAnnualConferencePhaseRollovers(
      [phase('phase-1', '2026-08-01', '2026-08-31', 1), phase('phase-2', '2026-09-01', '2026-09-30', 2)],
      [task('queued', 'not_started'), task('active', 'in_progress'), task('blocked', 'blocked'), task('done', 'done')],
      '2026-09-01',
    );

    expect(rollovers).toHaveLength(1);
    expect(rollovers[0].tasks.map((item) => item.id)).toEqual(['queued', 'active', 'blocked']);
  });
});
