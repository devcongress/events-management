import { describe, expect, it } from 'vitest';
import { isCommunitySubmissionEvent } from './community-submission-event';

describe('isCommunitySubmissionEvent', () => {
  it('recognizes both current source markers and pre-marker promoted records', () => {
    expect(isCommunitySubmissionEvent({ submission_source: 'public_submission', source_submission_id: null })).toBe(true);
    expect(isCommunitySubmissionEvent({ submission_source: 'internal', source_submission_id: '00000000-0000-4000-8000-000000000001' })).toBe(true);
  });

  it('keeps ordinary internal events in the normal workspace', () => {
    expect(isCommunitySubmissionEvent({ submission_source: 'internal', source_submission_id: null })).toBe(false);
  });
});
