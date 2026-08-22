import type {
  EventSubmission,
  EventSubmissionAmendment,
  EventSubmissionEmailKind,
  EventSubmissionRejectionCategory,
  EventSubmissionQueueFilter,
} from '@/types';
import type {
  ActiveEventSubmissionManagementLink,
  CreateEventSubmissionInput,
  EventSubmissionManagement,
} from '@/lib/supabase/event-submissions';

/**
 * The community-submission lifecycle is deliberately independent of Hono.
 * Transport code verifies sessions, signed capabilities, Turnstile, and rate
 * limits before reaching this boundary; this module owns the related domain
 * transition plus the durable follow-up intent.
 */
export type EventSubmissionActor = {
  email: string;
  userId?: string | null;
  role?: 'owner' | 'organizer' | 'volunteer' | null;
};

export type EventSubmissionAuditEvent = {
  action: string;
  targetType: 'event_submission' | 'event_submission_amendment';
  targetId: string;
  metadata?: Record<string, unknown>;
};

export type EventSubmissionReviewCommand =
  | { kind: 'approve'; publish: boolean }
  | {
    kind: 'reject';
    category: EventSubmissionRejectionCategory;
    organizerMessage?: string;
    internalNote?: string;
  }
  | { kind: 'withdraw'; organizerMessage: string };

export type EventSubmissionLifecycleRepository = {
  create(input: CreateEventSubmissionInput): Promise<EventSubmission>;
  list(status?: EventSubmissionQueueFilter): Promise<EventSubmission[]>;
  approve(submissionId: string, reviewerEmail: string, publish: boolean): Promise<EventSubmission>;
  reject(
    submissionId: string,
    reviewerEmail: string,
    input: { category: EventSubmissionRejectionCategory; organizer_message?: string; internal_note?: string },
  ): Promise<EventSubmission>;
  withdraw(submissionId: string, reviewerEmail: string, organizerMessage: string): Promise<EventSubmission>;
  management(linkId: string): Promise<EventSubmissionManagement>;
  activeManagementLink(submissionId: string): Promise<ActiveEventSubmissionManagementLink>;
  saveAmendment(
    submissionId: string,
    input: Pick<EventSubmissionAmendment, 'starts_at' | 'ends_at' | 'location_type'> & {
      venue_name?: string;
      venue_address?: string;
      online_url?: string;
      registration_url?: string;
      cover_url?: string | null;
      organizer_note?: string;
    },
  ): Promise<EventSubmissionAmendment>;
  submitAmendment(submissionId: string): Promise<EventSubmissionAmendment>;
  reviewAmendment(
    amendmentId: string,
    reviewerEmail: string,
    approve: boolean,
    organizerMessage: string,
  ): Promise<EventSubmissionAmendment>;
};

export type EventSubmissionLifecycleDependencies = {
  repository: EventSubmissionLifecycleRepository;
  audit(event: EventSubmissionAuditEvent): Promise<void>;
  queueEmail(input: { submissionId: string; kind: EventSubmissionEmailKind }): Promise<void>;
  announcePublished?(submission: EventSubmission): Promise<void>;
  notifyAmendmentSubmitted?(input: {
    management: EventSubmissionManagement;
    amendment: EventSubmissionAmendment;
  }): Promise<void>;
  rebaselineApprovedEventMonitor?(input: { submissionId: string }): Promise<void>;
};

export function createEventSubmissionLifecycle(dependencies: EventSubmissionLifecycleDependencies) {
  const { repository } = dependencies;

  async function audit(event: EventSubmissionAuditEvent): Promise<void> {
    await dependencies.audit(event);
  }

  return {
    async submit(input: CreateEventSubmissionInput): Promise<EventSubmission> {
      return repository.create(input);
    },

    async list(status?: EventSubmissionQueueFilter): Promise<EventSubmission[]> {
      return repository.list(status);
    },

    async review(input: {
      submissionId: string;
      actor: EventSubmissionActor;
      command: EventSubmissionReviewCommand;
    }): Promise<{ submission: EventSubmission; eventId: string | null }> {
      const { submissionId, actor, command } = input;

      if (command.kind === 'approve') {
        const submission = await repository.approve(submissionId, actor.email, command.publish);
        await audit({
          action: command.publish ? 'event_submission.approve_and_publish' : 'event_submission.approve_as_draft',
          targetType: 'event_submission',
          targetId: submission.id,
          metadata: { approved_event_id: submission.approved_event_id },
        });
        if (command.publish) {
          if (dependencies.announcePublished) await dependencies.announcePublished(submission);
          await dependencies.queueEmail({ submissionId: submission.id, kind: 'approved' });
        }
        return { submission, eventId: submission.approved_event_id };
      }

      if (command.kind === 'reject') {
        const submission = await repository.reject(submissionId, actor.email, {
          category: command.category,
          organizer_message: command.organizerMessage,
          internal_note: command.internalNote,
        });
        await audit({
          action: 'event_submission.reject',
          targetType: 'event_submission',
          targetId: submission.id,
          metadata: {
            category: submission.rejection_category,
            organizer_message_provided: Boolean(submission.organizer_message),
            internal_note_provided: Boolean(submission.internal_note),
          },
        });
        await dependencies.queueEmail({ submissionId: submission.id, kind: 'rejected' });
        return { submission, eventId: null };
      }

      const submission = await repository.withdraw(submissionId, actor.email, command.organizerMessage);
      await audit({
        action: 'event_submission.withdraw',
        targetType: 'event_submission',
        targetId: submission.id,
        metadata: { approved_event_id: submission.approved_event_id },
      });
      await dependencies.queueEmail({ submissionId: submission.id, kind: 'withdrawn' });
      return { submission, eventId: submission.approved_event_id };
    },

    management: {
      async open(linkId: string): Promise<EventSubmissionManagement> {
        return repository.management(linkId);
      },

      async copyLink(input: { submissionId: string; actor: EventSubmissionActor }): Promise<ActiveEventSubmissionManagementLink> {
        const link = await repository.activeManagementLink(input.submissionId);
        await audit({
          action: 'event_submission.management_link_copied',
          targetType: 'event_submission',
          targetId: input.submissionId,
          metadata: { expires_at: link.expires_at },
        });
        return link;
      },

      async saveDraft(input: {
        linkId: string;
        changes: Parameters<EventSubmissionLifecycleRepository['saveAmendment']>[1];
      }): Promise<EventSubmissionAmendment> {
        const management = await repository.management(input.linkId);
        return repository.saveAmendment(management.submission.id, input.changes);
      },

      async submit(input: { linkId: string }): Promise<EventSubmissionAmendment> {
        const management = await repository.management(input.linkId);
        const amendment = await repository.submitAmendment(management.submission.id);
        if (dependencies.notifyAmendmentSubmitted) {
          await dependencies.notifyAmendmentSubmitted({ management, amendment });
        }
        return amendment;
      },

      async review(input: {
        amendmentId: string;
        actor: EventSubmissionActor;
        approve: boolean;
        organizerMessage: string;
      }): Promise<EventSubmissionAmendment> {
        const amendment = await repository.reviewAmendment(
          input.amendmentId,
          input.actor.email,
          input.approve,
          input.organizerMessage,
        );
        await audit({
          action: input.approve ? 'event_submission_amendment.approve' : 'event_submission_amendment.reject',
          targetType: 'event_submission_amendment',
          targetId: amendment.id,
          metadata: { submission_id: amendment.submission_id },
        });
        await dependencies.queueEmail({
          submissionId: amendment.submission_id,
          kind: input.approve ? 'amendment_approved' : 'amendment_rejected',
        });
        if (input.approve && dependencies.rebaselineApprovedEventMonitor) {
          await dependencies.rebaselineApprovedEventMonitor({ submissionId: amendment.submission_id }).catch(() => undefined);
        }
        return amendment;
      },
    },
  };
}

export type EventSubmissionLifecycle = ReturnType<typeof createEventSubmissionLifecycle>;
