import { describe, expect, it } from 'vitest';
import {
  changedRegistrationSettings,
  isInitialRegistrationSetupState,
  type RegistrationSettingsDraft,
} from './registration-settings';

const baseline: RegistrationSettingsDraft = {
  status: 'draft',
  capacity: 100,
  opens_at: '2026-07-28T08:11',
  closes_at: '2026-07-29T08:11',
  auto_confirm: true,
  waitlist_enabled: true,
};

describe('registration settings change review', () => {
  it('keeps an unchanged campaign clean', () => {
    expect(changedRegistrationSettings(baseline, { ...baseline })).toEqual([]);
  });

  it('returns only fields whose saved values changed', () => {
    expect(changedRegistrationSettings(baseline, {
      ...baseline,
      status: 'open',
      capacity: 150,
      waitlist_enabled: false,
    })).toEqual(['status', 'capacity', 'waitlist_enabled']);
  });

  it('recognizes only the explicit one-time creation handoff', () => {
    expect(isInitialRegistrationSetupState({ registrationSetup: true })).toBe(true);
    expect(isInitialRegistrationSetupState({ registrationSetup: false })).toBe(false);
    expect(isInitialRegistrationSetupState(null)).toBe(false);
  });
});
