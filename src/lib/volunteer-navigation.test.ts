import { describe, expect, it } from 'vitest';
import { resolveVolunteerCampaignTab, resolveVolunteerView } from './volunteer-navigation';

describe('volunteer navigation', () => {
  it('restores permitted workspace views and falls back when access is absent', () => {
    expect(resolveVolunteerView('campaign', true, true)).toBe('campaign');
    expect(resolveVolunteerView('reviews', true, false)).toBe('reviews');
    expect(resolveVolunteerView('campaign', true, false)).toBe('directory');
    expect(resolveVolunteerView('reviews', false, false)).toBe('directory');
    expect(resolveVolunteerView(['reviews'], true, true)).toBe('directory');
  });

  it('accepts only the known campaign tabs', () => {
    for (const tab of ['updates', 'outcomes', 'invitations', 'settings'] as const) {
      expect(resolveVolunteerCampaignTab(tab)).toBe(tab);
    }

    expect(resolveVolunteerCampaignTab(['settings'])).toBe('updates');
    expect(resolveVolunteerCampaignTab('unknown')).toBe('updates');
  });
});
