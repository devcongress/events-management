import { describe, expect, it } from 'vitest';
import { annualConferenceTaskCardDescription } from '@/lib/annual-conference-task-card';

describe('annual conference task card description', () => {
  it('uses plain or rich task details and omits empty, duplicate, or malformed descriptions', () => {
    expect(annualConferenceTaskCardDescription({
      title: 'Venue',
      details: 'Confirm the location, capacity, and breakout rooms.',
    })).toBe('Confirm the location, capacity, and breakout rooms.');
    expect(annualConferenceTaskCardDescription({
      title: 'Call for speakers',
      details_format: 'rich_text',
      details: JSON.stringify({
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Confirm the deadline and announce the call.' }] }],
      }),
    })).toBe('Confirm the deadline and announce the call.');
    expect(annualConferenceTaskCardDescription({ title: 'Venue', details: 'Venue' })).toBeNull();
    expect(annualConferenceTaskCardDescription({ title: 'Venue', details: '{not valid}', details_format: 'rich_text' })).toBeNull();
  });
});
