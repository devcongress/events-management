import type { Event } from '@/types';

/**
 * A promoted community submission is distinct from a manually created
 * external listing. Older promoted rows can predate the source marker, but
 * always retain their source-submission reference.
 */
export function isCommunitySubmissionEvent(event: Pick<Event, 'submission_source' | 'source_submission_id'> | null | undefined): boolean {
  return event?.submission_source === 'public_submission' || Boolean(event?.source_submission_id);
}
