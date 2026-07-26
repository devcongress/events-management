import {
  isEventFeedbackNotAttended,
  isEventFeedbackRating,
} from '@/lib/event-feedback';
import type {
  EventFeedbackSubmission,
  FeedbackQuestion,
} from '@/types';

export interface FeedbackRatingDistributionItem {
  rating: 1 | 2 | 3 | 4 | 5;
  count: number;
  percent: number;
}

export interface FeedbackQuestionRatingInsight {
  questionId: string;
  label: string;
  average: number | null;
  ratingCount: number;
  missedCount: number;
  positivePercent: number | null;
}

export interface FeedbackBinaryInsight {
  questionId: string;
  label: string;
  yesCount: number;
  noCount: number;
  total: number;
  yesPercent: number | null;
}

export interface EventFeedbackReport {
  averageRating: number | null;
  ratingCount: number;
  ratingDistribution: FeedbackRatingDistributionItem[];
  questionRatings: FeedbackQuestionRatingInsight[];
  binaryQuestions: FeedbackBinaryInsight[];
  comments: number;
  notAttended: number;
}

function roundedAverage(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

function roundedPercent(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 100);
}

export function buildEventFeedbackReport(
  questions: FeedbackQuestion[],
  submissions: EventFeedbackSubmission[],
): EventFeedbackReport {
  const questionsById = new Map(questions.map((question) => [question.id, question]));
  const ratingsByQuestion = new Map<string, number[]>();
  const missedByQuestion = new Map<string, number>();
  const binaryByQuestion = new Map<string, { yes: number; no: number }>();
  const ratingCounts = new Map<number, number>([1, 2, 3, 4, 5].map((rating) => [rating, 0]));
  const ratings: number[] = [];
  let comments = 0;
  let notAttended = 0;

  for (const submission of submissions) {
    for (const answer of submission.answers) {
      const question = questionsById.get(answer.question_id);
      if (!question) continue;

      if (question.type === 'rating' && isEventFeedbackRating(answer.value)) {
        ratings.push(answer.value);
        ratingCounts.set(answer.value, (ratingCounts.get(answer.value) ?? 0) + 1);
        const questionRatings = ratingsByQuestion.get(question.id) ?? [];
        questionRatings.push(answer.value);
        ratingsByQuestion.set(question.id, questionRatings);
      }

      if (question.type === 'rating' && isEventFeedbackNotAttended(answer.value)) {
        notAttended += 1;
        missedByQuestion.set(question.id, (missedByQuestion.get(question.id) ?? 0) + 1);
      }

      if (question.type === 'yes_no' && typeof answer.value === 'boolean') {
        const counts = binaryByQuestion.get(question.id) ?? { yes: 0, no: 0 };
        counts[answer.value ? 'yes' : 'no'] += 1;
        binaryByQuestion.set(question.id, counts);
      }

      if (question.type === 'text' && typeof answer.value === 'string' && answer.value.trim()) {
        comments += 1;
      }
    }
  }

  const ratingDistribution = ([1, 2, 3, 4, 5] as const).map((rating) => {
    const count = ratingCounts.get(rating) ?? 0;
    return {
      rating,
      count,
      percent: roundedPercent(count, ratings.length) ?? 0,
    };
  });

  const questionRatings = questions
    .filter((question) => question.type === 'rating')
    .sort((left, right) => left.order_index - right.order_index)
    .map((question) => {
      const questionRatings = ratingsByQuestion.get(question.id) ?? [];
      return {
        questionId: question.id,
        label: question.label,
        average: roundedAverage(questionRatings),
        ratingCount: questionRatings.length,
        missedCount: missedByQuestion.get(question.id) ?? 0,
        positivePercent: roundedPercent(
          questionRatings.filter((rating) => rating >= 4).length,
          questionRatings.length,
        ),
      };
    });

  const binaryQuestions = questions
    .filter((question) => question.type === 'yes_no')
    .sort((left, right) => left.order_index - right.order_index)
    .map((question) => {
      const counts = binaryByQuestion.get(question.id) ?? { yes: 0, no: 0 };
      const total = counts.yes + counts.no;
      return {
        questionId: question.id,
        label: question.label,
        yesCount: counts.yes,
        noCount: counts.no,
        total,
        yesPercent: roundedPercent(counts.yes, total),
      };
    });

  return {
    averageRating: roundedAverage(ratings),
    ratingCount: ratings.length,
    ratingDistribution,
    questionRatings,
    binaryQuestions,
    comments,
    notAttended,
  };
}
