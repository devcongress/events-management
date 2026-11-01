import { describe, expect, it } from 'vitest';
import { suggestProgrammeSummary } from './programme-summary';

describe('suggestProgrammeSummary', () => {
  it('extracts opening sentences without inventing claims', () => {
    const description = 'Learn how teams trace slow requests. We will explore profiling with real examples. Participants will leave with a practical checklist for their own services.';
    const result = suggestProgrammeSummary(description);

    expect(result).toBe('Learn how teams trace slow requests. We will explore profiling with real examples.');
    expect(result.length).toBeLessThan(description.length);
  });

  it('handles long single sentences and removes dash punctuation', () => {
    const description = `Explore event driven systems with examples ${'from production systems '.repeat(30)}and learn how they recover.`;
    const result = suggestProgrammeSummary(description);

    expect(result.length).toBeLessThanOrEqual(300);
    expect(result).not.toMatch(/[-\u2010-\u2015]/);
    expect(result).toContain('event driven systems');
  });

  it('handles empty and short descriptions', () => {
    expect(suggestProgrammeSummary('  ')).toBe('');
    expect(suggestProgrammeSummary('A hands-on workshop.')).toBe('A hands on workshop.');
  });
});
