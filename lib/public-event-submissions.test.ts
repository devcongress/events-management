import { describe, expect, it } from 'vitest';
import {
  publicEventSubmissionsEnabled,
  publicEventSubmissionsPublicDiscoveryEnabled,
} from './public-event-submissions';

describe('public event submission launch gate', () => {
  it.each(['true', ' TRUE ', 'True'])('enables submissions only for an explicit true value: %s', (value) => {
    expect(publicEventSubmissionsEnabled(value)).toBe(true);
  });

  it.each([undefined, '', 'false', '1', 'yes', 'enabled'])('fails closed for any other value: %s', (value) => {
    expect(publicEventSubmissionsEnabled(value)).toBe(false);
  });
});

describe('public event submission discovery gate', () => {
  it.each(['true', ' TRUE ', 'True'])('enables public discovery only for an explicit true value: %s', (value) => {
    expect(publicEventSubmissionsPublicDiscoveryEnabled(value)).toBe(true);
  });

  it.each([undefined, '', 'false', '1', 'yes', 'enabled'])('fails closed for any other value: %s', (value) => {
    expect(publicEventSubmissionsPublicDiscoveryEnabled(value)).toBe(false);
  });
});
