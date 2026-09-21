import { describe, expect, it } from 'vitest';
import { annualConferencePhaseTiming } from './annual-conference-phase-pace';

const phase = {
  id: 'phase-1',
  edition_id: 'edition-1',
  name: 'Phase 1',
  starts_on: '2026-09-01',
  ends_on: '2026-09-30',
  position: 1,
};

describe('annualConferencePhaseTiming', () => {
  it('uses UTC calendar days for a phase before, during, and after its window', () => {
    expect(annualConferencePhaseTiming(phase, '2026-08-30')).toBe('Starts in 2 days');
    expect(annualConferencePhaseTiming(phase, '2026-09-10')).toBe('20 days remaining');
    expect(annualConferencePhaseTiming(phase, '2026-09-30')).toBe('Ends today');
    expect(annualConferencePhaseTiming(phase, '2026-10-02')).toBe('Ended 2 days ago');
  });
});
