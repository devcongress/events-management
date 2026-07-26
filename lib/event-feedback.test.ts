import { describe, expect, it } from 'vitest';
import {
  EVENT_FEEDBACK_NOT_ATTENDED,
  isEventFeedbackAnswerPresent,
  isEventFeedbackRating,
  normalizeEventFeedbackAnswer,
} from '@/lib/event-feedback';

describe('event feedback answers', () => {
  it('accepts only the five rating values', () => {
    expect(isEventFeedbackRating(1)).toBe(true);
    expect(isEventFeedbackRating(5)).toBe(true);
    expect(isEventFeedbackRating(0)).toBe(false);
    expect(isEventFeedbackRating(6)).toBe(false);
    expect(isEventFeedbackRating(3.5)).toBe(false);
    expect(isEventFeedbackRating('5')).toBe(false);
  });

  it('keeps non-attendance separate from numeric ratings', () => {
    const result = normalizeEventFeedbackAnswer(
      { type: 'rating', options: [] },
      EVENT_FEEDBACK_NOT_ATTENDED,
    );

    expect(result).toEqual({ valid: true, value: EVENT_FEEDBACK_NOT_ATTENDED });
    expect(isEventFeedbackRating(EVENT_FEEDBACK_NOT_ATTENDED)).toBe(false);
  });

  it('treats false as an answered yes/no question', () => {
    expect(isEventFeedbackAnswerPresent(false)).toBe(true);
    expect(normalizeEventFeedbackAnswer(
      { type: 'yes_no', options: [] },
      false,
    )).toEqual({ valid: true, value: false });
  });

  it('rejects values that do not match the question type', () => {
    expect(normalizeEventFeedbackAnswer(
      { type: 'rating', options: [] },
      'excellent',
    )).toEqual({ valid: false });
    expect(normalizeEventFeedbackAnswer(
      { type: 'choice', options: ['Talk', 'Workshop'] },
      'Panel',
    )).toEqual({ valid: false });
  });
});
