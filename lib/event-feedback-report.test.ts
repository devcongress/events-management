import { describe, expect, it } from 'vitest';
import { buildEventFeedbackReport } from './event-feedback-report';
import { EVENT_FEEDBACK_NOT_ATTENDED } from './event-feedback';
import type {
  EventFeedbackSubmission,
  FeedbackQuestion,
} from '@/types';

const questions: FeedbackQuestion[] = [
  {
    id: 'session-one',
    type: 'rating',
    label: 'Opening session',
    required: true,
    options: [],
    order_index: 0,
  },
  {
    id: 'session-two',
    type: 'rating',
    label: 'Closing session',
    required: true,
    options: [],
    order_index: 1,
  },
  {
    id: 'return',
    type: 'yes_no',
    label: 'Would you attend again?',
    required: false,
    options: [],
    order_index: 2,
  },
  {
    id: 'comment',
    type: 'text',
    label: 'Other comments',
    required: false,
    options: [],
    order_index: 3,
  },
];

function submission(
  id: string,
  answers: EventFeedbackSubmission['answers'],
): EventFeedbackSubmission {
  return {
    id,
    campaign_id: 'campaign',
    event_id: 'event',
    respondent_name: null,
    respondent_email: null,
    answers,
    page_path: null,
    user_agent: null,
    created_at: '2026-07-25T15:00:00.000Z',
  };
}

describe('buildEventFeedbackReport', () => {
  it('builds aggregate rating and distribution statistics', () => {
    const report = buildEventFeedbackReport(questions, [
      submission('one', [
        { question_id: 'session-one', value: 5 },
        { question_id: 'session-two', value: 4 },
      ]),
      submission('two', [
        { question_id: 'session-one', value: 3 },
        { question_id: 'session-two', value: 4 },
      ]),
    ]);

    expect(report.averageRating).toBe(4);
    expect(report.ratingCount).toBe(4);
    expect(report.ratingDistribution).toEqual([
      { rating: 1, count: 0, percent: 0 },
      { rating: 2, count: 0, percent: 0 },
      { rating: 3, count: 1, percent: 25 },
      { rating: 4, count: 2, percent: 50 },
      { rating: 5, count: 1, percent: 25 },
    ]);
  });

  it('keeps missed sessions separate from ratings', () => {
    const report = buildEventFeedbackReport(questions, [
      submission('one', [
        { question_id: 'session-one', value: EVENT_FEEDBACK_NOT_ATTENDED },
        { question_id: 'session-two', value: 5 },
      ]),
    ]);

    expect(report.averageRating).toBe(5);
    expect(report.ratingCount).toBe(1);
    expect(report.notAttended).toBe(1);
    expect(report.questionRatings[0]).toMatchObject({
      average: null,
      ratingCount: 0,
      missedCount: 1,
      positivePercent: null,
    });
  });

  it('summarizes every rating question independently', () => {
    const report = buildEventFeedbackReport(questions, [
      submission('one', [
        { question_id: 'session-one', value: 5 },
        { question_id: 'session-two', value: 2 },
      ]),
      submission('two', [
        { question_id: 'session-one', value: 4 },
        { question_id: 'session-two', value: 3 },
      ]),
    ]);

    expect(report.questionRatings).toEqual([
      {
        questionId: 'session-one',
        label: 'Opening session',
        average: 4.5,
        ratingCount: 2,
        missedCount: 0,
        positivePercent: 100,
      },
      {
        questionId: 'session-two',
        label: 'Closing session',
        average: 2.5,
        ratingCount: 2,
        missedCount: 0,
        positivePercent: 0,
      },
    ]);
  });

  it('summarizes yes/no answers and written comments', () => {
    const report = buildEventFeedbackReport(questions, [
      submission('one', [
        { question_id: 'return', value: true },
        { question_id: 'comment', value: 'Great meetup' },
      ]),
      submission('two', [
        { question_id: 'return', value: false },
        { question_id: 'comment', value: '   ' },
      ]),
      submission('three', [
        { question_id: 'return', value: true },
      ]),
    ]);

    expect(report.binaryQuestions[0]).toEqual({
      questionId: 'return',
      label: 'Would you attend again?',
      yesCount: 2,
      noCount: 1,
      total: 3,
      yesPercent: 67,
    });
    expect(report.comments).toBe(1);
  });

  it('returns explicit empty states when no responses exist', () => {
    const report = buildEventFeedbackReport(questions, []);

    expect(report.averageRating).toBeNull();
    expect(report.ratingCount).toBe(0);
    expect(report.ratingDistribution.every((item) => item.count === 0)).toBe(true);
    expect(report.questionRatings.every((item) => item.average === null)).toBe(true);
    expect(report.binaryQuestions[0]?.yesPercent).toBeNull();
  });
});
