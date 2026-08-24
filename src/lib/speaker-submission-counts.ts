import type { SpeakerSubmission, SpeakerSubmissionStatus } from '@/types';

export type ReviewableSpeakerSubmissionStatus = Extract<
  SpeakerSubmissionStatus,
  'submitted' | 'selected' | 'not_selected'
>;

export type SpeakerSubmissionReviewCounts = Record<ReviewableSpeakerSubmissionStatus, number>;

export function countSpeakerSubmissionsByReviewStatus(
  submissions: ReadonlyArray<Pick<SpeakerSubmission, 'status'>>,
): SpeakerSubmissionReviewCounts {
  const counts: SpeakerSubmissionReviewCounts = {
    submitted: 0,
    selected: 0,
    not_selected: 0,
  };

  for (const submission of submissions) {
    if (submission.status in counts) counts[submission.status as ReviewableSpeakerSubmissionStatus] += 1;
  }

  return counts;
}

export function totalReviewableSpeakerSubmissions(counts: SpeakerSubmissionReviewCounts): number {
  return counts.submitted + counts.selected + counts.not_selected;
}

export function formatSpeakerSubmissionCount(count: number): string {
  return count > 99 ? '99+' : String(count);
}
