import { describe, expect, it } from 'vitest';
import {
  effectiveAnnualConferenceCapabilities,
  hasAnnualConferenceCapability,
  isAnnualConferenceCapability,
} from './annual-conference-capabilities';

describe('annual conference capabilities', () => {
  it('keeps volunteers restricted until a responsibility is explicitly granted', () => {
    expect(effectiveAnnualConferenceCapabilities({ role: 'volunteer' })).toEqual([]);
    expect(effectiveAnnualConferenceCapabilities({
      role: 'volunteer',
      grants: ['timeline.view', 'volunteers.view_team'],
    })).toEqual(['timeline.view', 'volunteers.view_team']);
  });

  it('preserves organizer defaults without granting planning-owner mutations', () => {
    const capabilities = effectiveAnnualConferenceCapabilities({ role: 'organizer' });
    expect(hasAnnualConferenceCapability(capabilities, 'work_plan.view_all')).toBe(true);
    expect(hasAnnualConferenceCapability(capabilities, 'volunteers.review_applications')).toBe(true);
    expect(hasAnnualConferenceCapability(capabilities, 'work_plan.manage')).toBe(false);
    expect(hasAnnualConferenceCapability(capabilities, 'phases.manage')).toBe(false);
  });

  it('gives planning owners planning mutations and platform owners everything', () => {
    const planningOwner = effectiveAnnualConferenceCapabilities({ role: 'organizer', isPlanningOwner: true });
    expect(planningOwner).toContain('work_plan.manage');
    expect(planningOwner).toContain('phases.manage');

    const owner = effectiveAnnualConferenceCapabilities({ role: 'owner' });
    expect(owner).toHaveLength(8);
    expect(owner).toContain('finance.view');
  });

  it('keeps finance private to owners unless an organizer is explicitly granted access', () => {
    expect(effectiveAnnualConferenceCapabilities({ role: 'organizer' })).not.toContain('finance.view');
    expect(effectiveAnnualConferenceCapabilities({ role: 'organizer', grants: ['finance.view'] })).toContain('finance.view');
    expect(effectiveAnnualConferenceCapabilities({ role: 'volunteer', grants: ['finance.view'] })).not.toContain('finance.view');
  });

  it('rejects capabilities outside the code-owned catalogue', () => {
    expect(isAnnualConferenceCapability('timeline.view')).toBe(true);
    expect(isAnnualConferenceCapability('admin.everything')).toBe(false);
  });
});
