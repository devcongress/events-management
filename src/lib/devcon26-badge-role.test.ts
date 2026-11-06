import { describe, expect, it } from 'vitest';
import { badgeRoleDots } from './devcon26-badge-role';

describe('DevCon26 badge role lettering', () => {
  it('renders volunteer lettering within the existing badge role area', () => {
    const dots = badgeRoleDots('volunteer');

    expect(dots.length).toBeGreaterThan(0);
    expect(Math.min(...dots.map(dot => dot.x))).toBeGreaterThan(434);
    expect(Math.max(...dots.map(dot => dot.x))).toBeLessThanOrEqual(944);
    expect(dots.every(dot => dot.y >= 1195 && dot.y <= 1237)).toBe(true);
  });

  it('continues to render attendee and speaker lettering', () => {
    expect(badgeRoleDots('attendee').length).toBeGreaterThan(0);
    expect(badgeRoleDots('speaker').length).toBeGreaterThan(0);
  });
});
