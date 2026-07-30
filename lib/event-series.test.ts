import { describe, expect, it } from 'vitest';
import {
  eventSeriesBadgeLabel,
  eventSeriesSelectionToValue,
  eventSeriesValueToSelection,
  resolveEventSeriesType,
} from './event-series';

describe('event series classification', () => {
  it('preserves an explicit event with no DevCongress series', () => {
    expect(resolveEventSeriesType({ name: 'Community Demo Night', series_type: null })).toBeNull();
    expect(eventSeriesValueToSelection(null)).toBe('none');
  });

  it('keeps legacy inference only for records without a series field', () => {
    expect(resolveEventSeriesType({ name: 'Quarterly Checkpoint' })).toBe('quarterly');
    expect(resolveEventSeriesType({ name: 'August Meetup' })).toBe('monthly');
  });

  it('converts the form sentinel into a nullable stored value', () => {
    expect(eventSeriesSelectionToValue('none')).toBeNull();
    expect(eventSeriesSelectionToValue('special')).toBe('special');
  });

  it('omits a badge for an explicitly unclassified event', () => {
    expect(eventSeriesBadgeLabel({
      name: 'Community Demo Night',
      series_type: null,
    })).toBeNull();
    expect(eventSeriesBadgeLabel({
      name: 'DevCongress Monthly Meetup',
      series_type: 'monthly',
    })).toBe('Monthly');
  });
});
