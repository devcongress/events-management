import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ANNUAL_CONFERENCE_CAPABILITIES,
  ANNUAL_CONFERENCE_CAPABILITY_GATES,
  evaluateAnnualConferenceCapabilityGate,
  LEGACY_ANNUAL_CONFERENCE_CAPABILITY_MAP,
  annualConferenceCapabilityChanges,
  canDelegateAnnualConferenceCapability,
  effectiveAnnualConferenceCapabilities,
  hasAnnualConferenceCapability,
  isAnnualConferenceCapability,
} from './annual-conference-capabilities';

describe('annual conference leaf capabilities', () => {
  it('gives owners all known leaves even with denials and grants restricted members nothing by default', () => {
    expect(effectiveAnnualConferenceCapabilities({ role: 'owner', overrides: [{ capability: 'finance.view', enabled: false }] })).toEqual(ANNUAL_CONFERENCE_CAPABILITIES);
    expect(effectiveAnnualConferenceCapabilities({ role: 'member', isPlanningOwner: true })).toEqual([]);
    expect(effectiveAnnualConferenceCapabilities({ role: 'member', grants: ['speakers.delivery.retry'] })).toEqual(['speakers.delivery.view', 'speakers.delivery.retry']);
  });

  it('retains organizer defaults without owner-only actions', () => {
    const capabilities = effectiveAnnualConferenceCapabilities({ role: 'organizer' });

    expect(capabilities).toContain('speakers.proposals.manage');
    expect(capabilities).toContain('volunteers.reviews.manage');
    expect(capabilities).not.toContain('speakers.outcomes.send');
    expect(capabilities).not.toContain('ticketing.complimentary.manage');
    expect(capabilities).not.toContain('registration.community.manage');
  });

  it('couples each action only to its own view', () => {
    expect(annualConferenceCapabilityChanges('member', 'speakers.delivery.manage', true)).toEqual(['speakers.delivery.view', 'speakers.delivery.manage']);
    expect(annualConferenceCapabilityChanges('member', 'speakers.delivery.view', false)).toEqual(['speakers.delivery.view', 'speakers.delivery.manage', 'speakers.delivery.retry']);
    expect(annualConferenceCapabilityChanges('member', 'speakers.delivery.retry', true)).toEqual(['speakers.delivery.view', 'speakers.delivery.retry']);
    expect(annualConferenceCapabilityChanges('member', 'registration.blasts.send', true)).toEqual(['registration.blasts.view', 'registration.blasts.send']);
    expect(effectiveAnnualConferenceCapabilities({ role: 'member', overrides: [
      { capability: 'speakers.delivery.view', enabled: false },
      { capability: 'speakers.delivery.manage', enabled: true },
    ] })).toEqual([]);
    expect(effectiveAnnualConferenceCapabilities({ role: 'member', overrides: [
      { capability: 'registration.blasts.view', enabled: false },
      { capability: 'registration.blasts.send', enabled: true },
    ] })).toEqual([]);
  });

  it('never turns one leaf into a broad legacy permission or a future wildcard', () => {
    expect(hasAnnualConferenceCapability(['speakers.proposals.view'], 'speakers.view')).toBe(false);
    expect(hasAnnualConferenceCapability(['speakers.proposals.view', 'speakers.participation.view'], 'speakers.view')).toBe(true);
    expect(isAnnualConferenceCapability('speakers.*')).toBe(false);
    expect(isAnnualConferenceCapability('speakers.future.view')).toBe(false);
  });

  it('limits volunteers and maps legacy speakers without email or outcomes', () => {
    expect(canDelegateAnnualConferenceCapability('work_plan.tasks.manage', 'volunteer')).toBe(true);
    expect(canDelegateAnnualConferenceCapability('speakers.proposals.view', 'volunteer')).toBe(false);
    expect(effectiveAnnualConferenceCapabilities({ role: 'volunteer', grants: ['speakers.proposals.view'] })).toEqual([]);
    expect(LEGACY_ANNUAL_CONFERENCE_CAPABILITY_MAP['speakers.view']).toEqual(['speakers.proposals.view', 'speakers.participation.view']);
    expect(LEGACY_ANNUAL_CONFERENCE_CAPABILITY_MAP['speakers.manage']).not.toContain('speakers.delivery.manage');
  });

  it('keeps migration mapping and eligibility in the reviewed SQL contract', () => {
    const sql = readFileSync('supabase/migrations/20261111121000_granular_conference_access.sql', 'utf8');

    for (const [legacy, leaves] of Object.entries(LEGACY_ANNUAL_CONFERENCE_CAPABILITY_MAP)) {
      for (const leaf of leaves) expect(sql).toContain(`('${legacy}', '${leaf}')`);
    }
    expect(sql).toContain('g.enabled, g.granted_by_membership_id, g.created_at');
    expect(sql).toContain('delete from public.annual_conference_access_grants');
    expect(sql).toContain("v_membership.role = 'volunteer'");
    expect(LEGACY_ANNUAL_CONFERENCE_CAPABILITY_MAP['volunteers.review_applications']).toEqual(['volunteers.reviews.view', 'volunteers.reviews.manage']);
    expect(effectiveAnnualConferenceCapabilities({ role: 'volunteer', grants: ['volunteers.reviews.manage'] })).toEqual(['volunteers.reviews.view', 'volunteers.reviews.manage']);
    expect(effectiveAnnualConferenceCapabilities({ role: 'organizer', overrides: [
      { capability: 'volunteers.reviews.view', enabled: false },
      { capability: 'volunteers.reviews.manage', enabled: false },
    ] })).not.toContain('volunteers.reviews.manage');
  });
});

describe('annual conference capability gates', () => {
  it('evaluates nested AND and OR without deriving dependencies', () => {
    const gate = { all: [{ capability: 'registration.guests.view' }, { any: [
      { capability: 'registration.summary.view' }, { capability: 'registration.form.view' },
    ] }] };

    expect(evaluateAnnualConferenceCapabilityGate([], gate)).toBe(false);
    expect(evaluateAnnualConferenceCapabilityGate(['registration.guests.view'], gate)).toBe(false);
    expect(evaluateAnnualConferenceCapabilityGate(['registration.guests.view', 'registration.form.view'], gate)).toBe(true);
    expect(evaluateAnnualConferenceCapabilityGate(['registration.guests.manage'], { capability: 'registration.guests.view' })).toBe(false);
  });

  it('rejects every malformed tree even when an OR sibling passes', () => {
    const cycle: { any: unknown[] } = { any: [] };

    cycle.any.push(cycle);
    for (const invalid of [null, {}, { all: [] }, { any: [] }, { not: { capability: 'finance.view' } },
      { capability: 'registration.view' }, { capability: 'unknown' }, { capability: 'finance.view', any: [] }, cycle]) {
      expect(evaluateAnnualConferenceCapabilityGate(['finance.view'], invalid)).toBe(false);
      expect(evaluateAnnualConferenceCapabilityGate(['finance.view'], { any: [{ capability: 'finance.view' }, invalid] })).toBe(false);
    }
  });

  it('keeps workspace, read and sensitive ticket gates distinct', () => {
    const gates = ANNUAL_CONFERENCE_CAPABILITY_GATES;

    expect(evaluateAnnualConferenceCapabilityGate(['registration.emails.view'], gates['registration.workspace'])).toBe(true);
    expect(evaluateAnnualConferenceCapabilityGate(['registration.emails.view'], gates['registration.read'])).toBe(false);
    expect(evaluateAnnualConferenceCapabilityGate(['registration.guests.view', 'registration.emails.view'], gates['registration.ticketDetails'])).toBe(false);
    expect(evaluateAnnualConferenceCapabilityGate(['registration.guests.view', 'registration.emails.view', 'ticketing.check_in'], gates['registration.ticketDetails'])).toBe(true);
  });
});
