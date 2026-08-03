import { describe, expect, it } from 'vitest';
import { calculateFloatingPosition } from './floating-placement';

const viewport = { top: 0, left: 0, width: 1000, height: 800 };

describe('calculateFloatingPosition', () => {
  it('opens below when the panel fits there', () => {
    expect(calculateFloatingPosition({
      anchor: { top: 100, right: 500, bottom: 150, left: 200, width: 300, height: 50 },
      viewport,
      panelHeight: 420,
    })).toEqual({
      placement: 'bottom',
      top: 158,
      left: 200,
      width: 304,
      maxHeight: 634,
    });
  });

  it('opens above when the lower viewport is constrained', () => {
    expect(calculateFloatingPosition({
      anchor: { top: 690, right: 500, bottom: 740, left: 200, width: 300, height: 50 },
      viewport,
      panelHeight: 420,
    })).toEqual({
      placement: 'top',
      top: 262,
      left: 200,
      width: 304,
      maxHeight: 674,
    });
  });

  it('uses the roomier side and limits height when neither side fits', () => {
    expect(calculateFloatingPosition({
      anchor: { top: 330, right: 600, bottom: 380, left: 300, width: 300, height: 50 },
      viewport: { top: 100, left: 0, width: 800, height: 500 },
      panelHeight: 500,
    })).toMatchObject({
      placement: 'top',
      top: 108,
      maxHeight: 214,
    });
  });

  it('clamps the panel inside narrow and offset visual viewports', () => {
    expect(calculateFloatingPosition({
      anchor: { top: 200, right: 490, bottom: 250, left: 420, width: 70, height: 50 },
      viewport: { top: 40, left: 20, width: 460, height: 700 },
      panelHeight: 420,
    })).toMatchObject({
      left: 168,
      width: 304,
    });
  });

  it('right-aligns a menu to its anchor without leaving the viewport', () => {
    expect(calculateFloatingPosition({
      anchor: { top: 100, right: 900, bottom: 150, left: 700, width: 200, height: 50 },
      viewport,
      panelHeight: 160,
      preferredWidth: 288,
      align: 'right',
    })).toMatchObject({
      placement: 'bottom',
      left: 612,
      width: 288,
    });
  });

  it('caps a floating panel independently from a wide anchor', () => {
    expect(calculateFloatingPosition({
      anchor: { top: 100, right: 920, bottom: 150, left: 120, width: 800, height: 50 },
      viewport,
      panelHeight: 420,
      preferredWidth: 328,
      maxWidth: 360,
    })).toMatchObject({
      left: 120,
      width: 360,
    });
  });
});
