import { describe, expect, it } from 'vitest';
import {
  ANNUAL_CONFERENCE_2026_PHASES,
  ANNUAL_CONFERENCE_2026_SEED_TASKS,
} from './annual-conference-work-plan';
import { createAnnualConferenceReadModel } from './annual-conference-read-model';

describe('annual conference read model', () => {
  const model = createAnnualConferenceReadModel({
    phases: ANNUAL_CONFERENCE_2026_PHASES,
    tasks: ANNUAL_CONFERENCE_2026_SEED_TASKS,
  });

  it('projects one coherent phase-scoped snapshot', () => {
    const projection = model.project({
      phaseScope: ANNUAL_CONFERENCE_2026_PHASES[0].id,
      today: '2026-08-03',
    });

    expect(projection.tasks).toHaveLength(12);
    expect(projection.summary.total).toBe(12);
    expect(Object.values(projection.status_counts).reduce((sum, count) => sum + count, 0)).toBe(12);
    expect(projection.selected_phase?.name).toBe('Phase 1');
    expect(projection.current_phase?.name).toBe('Phase 1');
    expect(projection.health.total).toBe(12);
    expect(projection.workstreams.reduce((sum, item) => sum + item.total, 0)).toBe(12);
  });

  it('keeps No phase tasks and planning gaps visible', () => {
    const projection = model.project({ phaseScope: 'unassigned', today: '2026-08-03' });

    expect(projection.tasks).toHaveLength(15);
    expect(projection.unclassified_count).toBe(15);
    expect(projection.planning_gaps).toHaveLength(15);
    expect(projection.selected_phase).toBeNull();
  });

  it('reconciles phase and unassigned task totals with the full edition', () => {
    const all = model.project({ phaseScope: 'all', today: '2026-08-03' });
    const phaseTotals = ANNUAL_CONFERENCE_2026_PHASES.reduce((sum, phase) => (
      sum + model.project({ phaseScope: phase.id, today: '2026-08-03' }).tasks.length
    ), 0);
    const unassigned = model.project({ phaseScope: 'unassigned', today: '2026-08-03' });

    expect(phaseTotals + unassigned.tasks.length).toBe(all.tasks.length);
  });
});
