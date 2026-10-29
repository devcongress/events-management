import { describe, expect, it } from 'vitest';
import { fitNavigationLinkCount } from './navigation-fit';

describe('desktop navigation partition', () => {
  it('shows every destination without reserving an unused More control', () => {
    expect(fitNavigationLinkCount([80, 90, 120], 322, 16, 60)).toBe(3);
  });

  it('reserves More and its gap when destinations overflow', () => {
    expect(fitNavigationLinkCount([80, 90, 120], 300, 16, 60)).toBe(2);
  });

  it('keeps the remaining destinations available through More at tight widths', () => {
    expect(fitNavigationLinkCount([80, 90], 70, 16, 60)).toBe(0);
  });

  it('uses measured fractional widths without oscillating at a rounded boundary', () => {
    expect(fitNavigationLinkCount([80.25, 90.25], 185.5, 16, 60)).toBe(2);
  });

  it('does not manufacture a More control for an empty role-specific list', () => {
    expect(fitNavigationLinkCount([], 0, 16, 60)).toBe(0);
  });
});
