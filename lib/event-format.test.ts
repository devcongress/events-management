import { describe, expect, it } from 'vitest';
import { EVENT_FORMAT_LABELS, EVENT_FORMATS, isEventFormat } from './event-format';

describe('event format taxonomy', () => {
  it('uses one canonical conference value with a conference/congress display label', () => {
    expect(EVENT_FORMATS).toContain('conference');
    expect(EVENT_FORMATS).not.toContain('congress');
    expect(EVENT_FORMAT_LABELS.conference).toBe('Conference / congress');
  });

  it('accepts only canonical event formats', () => {
    expect(isEventFormat('meetup')).toBe(true);
    expect(isEventFormat('hackathon')).toBe(true);
    expect(isEventFormat('congress')).toBe(false);
  });
});
