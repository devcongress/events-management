import { describe, expect, it } from 'vitest';
import {
  annualConferenceCapabilityChanges,
  ANNUAL_CONFERENCE_CAPABILITIES,
  effectiveAnnualConferenceCapabilities,
  canDelegateAnnualConferenceCapability,
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

  it('lets an edition override turn a role default off or a missing permission on', () => {
    const restrictedOrganizer = effectiveAnnualConferenceCapabilities({
      role: 'organizer',
      overrides: [{ capability: 'volunteers.review_applications', enabled: false }],
    });
    const empoweredVolunteer = effectiveAnnualConferenceCapabilities({
      role: 'volunteer',
      overrides: [{ capability: 'work_plan.manage', enabled: true }],
    });

    expect(restrictedOrganizer).not.toContain('volunteers.review_applications');
    expect(empoweredVolunteer).toContain('work_plan.manage');
  });

  it('gives planning owners planning mutations and platform owners everything', () => {
    const planningOwner = effectiveAnnualConferenceCapabilities({ role: 'organizer', isPlanningOwner: true });

    expect(planningOwner).toContain('work_plan.manage');
    expect(planningOwner).toContain('phases.manage');

    const owner = effectiveAnnualConferenceCapabilities({ role: 'owner' });

    expect(owner).toEqual(ANNUAL_CONFERENCE_CAPABILITIES);
    expect(owner).toContain('ticketing.check_in');
    expect(owner).toContain('finance.view');
    expect(owner).toContain('ticketing.manage');
  });

  it('keeps finance private to owners unless an organizer is explicitly granted access', () => {
    expect(effectiveAnnualConferenceCapabilities({ role: 'organizer' })).not.toContain('finance.view');
    expect(effectiveAnnualConferenceCapabilities({ role: 'organizer', grants: ['finance.view'] })).toContain('finance.view');
    expect(effectiveAnnualConferenceCapabilities({ role: 'volunteer', grants: ['finance.view'] })).not.toContain('finance.view');
    expect(effectiveAnnualConferenceCapabilities({ role: 'organizer', grants: ['ticketing.manage'] })).toContain('ticketing.manage');
    expect(effectiveAnnualConferenceCapabilities({ role: 'volunteer', grants: ['ticketing.manage'] })).not.toContain('ticketing.manage');
  });

  it('lets an owner delegate work-plan management to either an organizer or volunteer', () => {
    expect(canDelegateAnnualConferenceCapability('work_plan.manage', 'organizer')).toBe(true);
    expect(canDelegateAnnualConferenceCapability('work_plan.manage', 'volunteer')).toBe(true);
    expect(canDelegateAnnualConferenceCapability('work_plan.manage', 'owner')).toBe(false);
    expect(canDelegateAnnualConferenceCapability('finance.view', 'volunteer')).toBe(false);
    expect(canDelegateAnnualConferenceCapability('ticketing.manage', 'organizer')).toBe(true);
    expect(canDelegateAnnualConferenceCapability('ticketing.manage', 'volunteer')).toBe(false);
  });

  it('keeps restricted membership empty without explicit edition grants', () => {
    expect(effectiveAnnualConferenceCapabilities({ role: 'member', isPlanningOwner: true })).toEqual([]);
    expect(effectiveAnnualConferenceCapabilities({
      role: 'member',
      grants: ['ticketing.manage', 'phases.manage'],
    })).toEqual(['ticketing.view', 'ticketing.manage']);
    expect(effectiveAnnualConferenceCapabilities({
      role: 'member',
      grants: ['registration.manage'],
    })).toEqual(['registration.view', 'registration.manage']);
  });

  it('removes a restricted manage grant when the associated view is turned off', () => {
    expect(annualConferenceCapabilityChanges('member', 'ticketing.view', false)).toEqual(['ticketing.view', 'ticketing.manage']);
    expect(annualConferenceCapabilityChanges('member', 'registration.manage', true)).toEqual(['registration.view', 'registration.manage']);
    expect(annualConferenceCapabilityChanges('member', 'ticketing.manage', false)).toEqual(['ticketing.manage']);
  });

  it('rejects capabilities outside the code-owned catalogue', () => {
    expect(isAnnualConferenceCapability('timeline.view')).toBe(true);
    expect(isAnnualConferenceCapability('admin.everything')).toBe(false);
  });

  it('grants volunteers admission scanning only when assigned', () => {
    expect(effectiveAnnualConferenceCapabilities({ role: 'volunteer' })).not.toContain('ticketing.check_in');
    expect(effectiveAnnualConferenceCapabilities({ role: 'volunteer', grants: ['ticketing.check_in'] })).toEqual(['ticketing.check_in']);
    expect(canDelegateAnnualConferenceCapability('ticketing.check_in', 'volunteer')).toBe(true);
  });
});
