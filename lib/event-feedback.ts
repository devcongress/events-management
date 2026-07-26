import type { FeedbackAnswer, FeedbackQuestion } from '@/types';

export const EVENT_FEEDBACK_NOT_ATTENDED = 'not_attended' as const;

export type NormalizedEventFeedbackAnswer =
  | { valid: true; value: FeedbackAnswer['value'] }
  | { valid: false };

export function isEventFeedbackRating(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isInteger(value)
    && value >= 1
    && value <= 5;
}

export function isEventFeedbackNotAttended(value: unknown): value is typeof EVENT_FEEDBACK_NOT_ATTENDED {
  return value === EVENT_FEEDBACK_NOT_ATTENDED;
}

export function isEventFeedbackAnswerPresent(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  return typeof value !== 'string' || value.trim().length > 0;
}

export function normalizeEventFeedbackAnswer(
  question: Pick<FeedbackQuestion, 'type' | 'options'>,
  rawValue: unknown,
): NormalizedEventFeedbackAnswer {
  if (!isEventFeedbackAnswerPresent(rawValue)) {
    return { valid: true, value: null };
  }

  switch (question.type) {
    case 'rating':
      return isEventFeedbackRating(rawValue) || isEventFeedbackNotAttended(rawValue)
        ? { valid: true, value: rawValue }
        : { valid: false };
    case 'yes_no':
      return typeof rawValue === 'boolean'
        ? { valid: true, value: rawValue }
        : { valid: false };
    case 'choice': {
      if (typeof rawValue !== 'string') return { valid: false };
      const value = rawValue.trim();
      return question.options.includes(value)
        ? { valid: true, value }
        : { valid: false };
    }
    case 'talk_select':
      return typeof rawValue === 'string'
        ? { valid: true, value: rawValue.trim() }
        : { valid: false };
    case 'text':
      return typeof rawValue === 'string'
        ? { valid: true, value: rawValue.trim() }
        : { valid: false };
    default:
      return { valid: false };
  }
}
