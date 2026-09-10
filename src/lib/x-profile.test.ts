import { describe, expect, it } from 'vitest';
import { xProfile } from './x-profile';

describe('xProfile', () => {
  it.each(['@mariamasalifu12', 'mariamasalifu12', 'https://x.com/mariamasalifu12?s=21', 'twitter.com/mariamasalifu12/'])('normalizes %s', (value) => {
    expect(xProfile(value)).toEqual({ label: '@mariamasalifu12', href: 'https://x.com/mariamasalifu12' });
  });
  it.each([null, '', 'javascript:alert(1)', 'https://evil.com/person', 'https://x.com/person/status/123', 'not a handle'])('does not link invalid input %s', (value) => {
    expect(xProfile(value)).toBeNull();
  });
});
