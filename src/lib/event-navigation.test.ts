import { describe, expect, it } from 'vitest';
import { eventNavigationTabs } from './event-navigation';

describe('event navigation availability', () => {
  it('omits unavailable modules from ordinary events', () => {
    expect(eventNavigationTabs(false, false).map(tab => tab.href))
      .toEqual(['', 'registrations', 'talks', 'feedback', 'attendance']);
  });

  it('includes eligible System Design without exposing Quiz', () => {
    expect(eventNavigationTabs(false, true).map(tab => tab.href))
      .toEqual(['', 'registrations', 'talks', 'system-design', 'feedback', 'attendance']);
  });

  it('keeps quarterly navigation limited to supported modules', () => {
    expect(eventNavigationTabs(true, true).map(tab => tab.href))
      .toEqual(['', 'registrations', 'feedback']);
  });
});
