import { describe, expect, it } from 'vitest';

import {
  eventTestModeEnabled,
  isTestEventTitle,
  markTestEventTitle,
} from './event-test-mode';

describe('event test mode', () => {
  it('is disabled by default and accepts explicit booleans', () => {
    expect(eventTestModeEnabled(undefined)).toBe(false);
    expect(eventTestModeEnabled('false')).toBe(false);
    expect(eventTestModeEnabled(' TRUE ')).toBe(true);
  });

  it('fails closed on an invalid value', () => {
    expect(() => eventTestModeEnabled('yes')).toThrow('EVENT_TEST_MODE must be either true or false.');
  });

  it('adds the marker once without changing live titles', () => {
    expect(markTestEventTitle('Community workshop', true)).toBe('[TEST] Community workshop');
    expect(markTestEventTitle('[test] Community workshop', true)).toBe('[test] Community workshop');
    expect(markTestEventTitle('Community workshop', false)).toBe('Community workshop');
    expect(isTestEventTitle('[TEST] Community workshop')).toBe(true);
  });
});
