import {
  EVENT_FEEDBACK_NOT_ATTENDED,
  isEventFeedbackNotAttended,
  isEventFeedbackRating,
} from '@/lib/event-feedback';
import type {
  EventFeedbackSubmission,
  FeedbackQuestion,
} from '@/types';

function answerValueCopy(answer: EventFeedbackSubmission['answers'][number]): string {
  if (answer.value === null || answer.value === '') return 'No answer';
  if (answer.value === EVENT_FEEDBACK_NOT_ATTENDED) return 'Did not attend';
  if (typeof answer.value === 'boolean') return answer.value ? 'Yes' : 'No';
  return String(answer.value);
}

function submissionAverageRating(
  submission: EventFeedbackSubmission,
  questionsById: Map<string, FeedbackQuestion>,
): number | null {
  const ratings = submission.answers
    .map((answer) => (
      questionsById.get(answer.question_id)?.type === 'rating'
      && isEventFeedbackRating(answer.value)
        ? answer.value
        : null
    ))
    .filter((value): value is number => value !== null);

  if (ratings.length === 0) return null;
  return Math.round((ratings.reduce((sum, value) => sum + value, 0) / ratings.length) * 10) / 10;
}

function submissionNotAttendedCount(
  submission: EventFeedbackSubmission,
  questionsById: Map<string, FeedbackQuestion>,
): number {
  return submission.answers.filter((answer) => (
    questionsById.get(answer.question_id)?.type === 'rating'
    && isEventFeedbackNotAttended(answer.value)
  )).length;
}

function safeSpreadsheetCell(value: string | number): string {
  const normalized = String(value);
  const formulaSafe = /^[=+\-@\t\r]/.test(normalized) ? `'${normalized}` : normalized;
  return /[",\n\r]/.test(formulaSafe) ? `"${formulaSafe.replace(/"/g, '""')}"` : formulaSafe;
}

export function buildEventFeedbackCsv(
  questions: FeedbackQuestion[],
  submissions: EventFeedbackSubmission[],
): string {
  const orderedQuestions = [...questions].sort((left, right) => left.order_index - right.order_index);
  const questionsById = new Map(orderedQuestions.map((question) => [question.id, question]));
  const orderedSubmissions = [...submissions].sort(
    (left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
  );
  const header = [
    'Response',
    'Submitted at',
    'Average rating',
    'Sessions missed',
    ...orderedQuestions.map((question) => question.label),
  ];
  const rows = orderedSubmissions.map((submission, index) => {
    const answersByQuestionId = new Map(
      submission.answers.map((answer) => [answer.question_id, answer]),
    );

    return [
      index + 1,
      new Date(submission.created_at).toISOString(),
      submissionAverageRating(submission, questionsById) ?? '',
      submissionNotAttendedCount(submission, questionsById),
      ...orderedQuestions.map((question) => {
        const answer = answersByQuestionId.get(question.id);
        return answer ? answerValueCopy(answer) : 'No answer';
      }),
    ];
  });

  return [header, ...rows]
    .map((row) => row.map((cell) => safeSpreadsheetCell(cell)).join(','))
    .join('\r\n');
}
