import { describe, expect, it } from 'vitest';
import { buildEventFeedbackCsv } from './event-feedback-export';
import { EVENT_FEEDBACK_NOT_ATTENDED } from './event-feedback';
import type {
  EventFeedbackSubmission,
  FeedbackQuestion,
} from '@/types';

const questions: FeedbackQuestion[] = [
  {
    id: 'comment',
    type: 'text',
    label: 'Other comments',
    required: false,
    options: [],
    order_index: 2,
  },
  {
    id: 'rating',
    type: 'rating',
    label: 'Opening session',
    required: true,
    options: [],
    order_index: 0,
  },
  {
    id: 'return',
    type: 'yes_no',
    label: 'Would you attend again?',
    required: false,
    options: [],
    order_index: 1,
  },
];

function submission(
  id: string,
  createdAt: string,
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
    created_at: createdAt,
  };
}

describe('buildEventFeedbackCsv', () => {
  it('exports every submission newest-first with every question as a column', () => {
    const csv = buildEventFeedbackCsv(questions, [
      submission('older', '2026-07-25T12:00:00.000Z', [
        { question_id: 'rating', value: EVENT_FEEDBACK_NOT_ATTENDED },
        { question_id: 'return', value: false },
      ]),
      submission('newer', '2026-07-26T12:00:00.000Z', [
        { question_id: 'rating', value: 5 },
        { question_id: 'return', value: true },
        { question_id: 'comment', value: 'Great, thanks' },
      ]),
    ]);

    expect(csv.split('\r\n')).toEqual([
      'Response,Submitted at,Average rating,Sessions missed,Opening session,Would you attend again?,Other comments',
      '1,2026-07-26T12:00:00.000Z,5,0,5,Yes,\"Great, thanks\"',
      '2,2026-07-25T12:00:00.000Z,,1,Did not attend,No,No answer',
    ]);
  });

  it('neutralizes spreadsheet formulas in attendee-provided answers', () => {
    const csv = buildEventFeedbackCsv(questions, [
      submission('formula', '2026-07-26T12:00:00.000Z', [
        { question_id: 'comment', value: '=HYPERLINK("https://example.com")' },
      ]),
    ]);

    expect(csv).toContain('"\'=HYPERLINK(""https://example.com"")"');
  });
});
