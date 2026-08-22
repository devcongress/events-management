import type { Context } from 'hono';
import type { Event, EventSubmissionAmendment, EventSubmissionEmailKind } from '@/types';
import type { EventSubmissionManagement } from '@/lib/supabase/event-submissions';
import { createEventSubmissionLifecycle } from './lifecycle';
import { createEventSubmissionRepository } from './repository';

/**
 * Request-scoped composition point for the community-submission domain.
 * `server/app.ts` supplies only app-wide adapters (audit, async delivery, and
 * the optional published-event announcement); the domain owns its repository
 * and lifecycle wiring.
 */
export function createEventSubmissionRequestAdapter(
  c: Context,
  dependencies: {
    audit(event: { action: string; targetType?: string | null; targetId?: string | null; metadata?: Record<string, unknown> }): Promise<void>;
    queueEmail(input: { submissionId: string; kind: EventSubmissionEmailKind }): Promise<void>;
    findEvent(eventId: string): Promise<Event | null>;
    announcePublished(event: Event): Promise<void>;
    notifyAmendmentSubmitted(input: {
      management: EventSubmissionManagement;
      amendment: EventSubmissionAmendment;
    }): Promise<void>;
    refreshApprovedEventMonitor(input: { submissionId: string }): Promise<void>;
  },
) {
  return createEventSubmissionLifecycle({
    repository: createEventSubmissionRepository(c),
    audit: dependencies.audit,
    queueEmail: dependencies.queueEmail,
    announcePublished: async (submission) => {
      if (!submission.approved_event_id) return;
      const event = await dependencies.findEvent(submission.approved_event_id);
      if (event) await dependencies.announcePublished(event);
    },
    notifyAmendmentSubmitted: dependencies.notifyAmendmentSubmitted,
    refreshApprovedEventMonitor: dependencies.refreshApprovedEventMonitor,
  });
}
