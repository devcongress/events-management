import { describe, expect, it } from 'vitest';
import {
  changedRegistrationSettings,
  type RegistrationSettingsDraft,
} from './registration-settings';

const baseline: RegistrationSettingsDraft = {
  status: 'draft',
  description: '',
  capacity: 100,
  opens_at: '2026-07-28T08:11',
  closes_at: '2026-07-29T08:11',
};

describe('registration settings change review', () => {
  it('keeps an unchanged campaign clean', () => {
    expect(changedRegistrationSettings(baseline, { ...baseline })).toEqual([]);
  });

  it('returns only fields whose saved values changed', () => {
    expect(changedRegistrationSettings(baseline, {
      ...baseline,
      status: 'open',
      description: 'Bring your questions and a laptop.',
      capacity: 150,
    })).toEqual(['status', 'description', 'capacity']);
  });
});
