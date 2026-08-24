import { describe, expect, it } from 'vitest';
import {
  countSpeakerSubmissionsByReviewStatus,
  formatSpeakerSubmissionCount,
  totalReviewableSpeakerSubmissions,
} from './speaker-submission-counts';

describe('speaker submission review counts', () => {
  it('moves proposals between review buckets without changing the visible total', () => {
    const counts = countSpeakerSubmissionsByReviewStatus([
      { status: 'submitted' },
      { status: 'submitted' },
      { status: 'selected' },
      { status: 'not_selected' },
      { status: 'withdrawn' },
    ]);

    expect(counts).toEqual({ submitted: 2, selected: 1, not_selected: 1 });
    expect(totalReviewableSpeakerSubmissions(counts)).toBe(4);
  });

  it('caps badge copy without changing the underlying count', () => {
    expect(formatSpeakerSubmissionCount(0)).toBe('0');
    expect(formatSpeakerSubmissionCount(42)).toBe('42');
    expect(formatSpeakerSubmissionCount(100)).toBe('99+');
  });
});
