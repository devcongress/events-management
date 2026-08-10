import type { Context } from 'hono';
import {
  approveEventSubmission,
  createEventSubmission,
  getActiveEventSubmissionManagementLink,
  getEventSubmissionManagement,
  listEventSubmissions,
  rejectEventSubmission,
  reviewEventSubmissionAmendment,
  saveEventSubmissionAmendment,
  submitEventSubmissionAmendment,
  withdrawEventSubmission,
} from '@/lib/supabase/event-submissions';
import type { EventSubmissionLifecycleRepository } from './lifecycle';

/**
 * Production adapter for the community-submission lifecycle. It is the only
 * place that knows today’s Supabase helper functions, leaving the lifecycle
 * free to move to RPC-backed or relational repositories without changing HTTP
 * routes or policy tests.
 */
export function createEventSubmissionRepository(c: Context): EventSubmissionLifecycleRepository {
  return {
    create: (input) => createEventSubmission(input, c),
    list: (status) => listEventSubmissions(status, c),
    approve: (submissionId, reviewerEmail, publish) => approveEventSubmission(submissionId, reviewerEmail, publish, c),
    reject: (submissionId, reviewerEmail, input) => rejectEventSubmission(submissionId, reviewerEmail, input, c),
    withdraw: (submissionId, reviewerEmail, organizerMessage) => withdrawEventSubmission(submissionId, reviewerEmail, organizerMessage, c),
    management: (linkId) => getEventSubmissionManagement(linkId, c),
    activeManagementLink: (submissionId) => getActiveEventSubmissionManagementLink(submissionId, c),
    saveAmendment: (submissionId, input) => saveEventSubmissionAmendment(submissionId, input, c),
    submitAmendment: (submissionId) => submitEventSubmissionAmendment(submissionId, c),
    reviewAmendment: (amendmentId, reviewerEmail, approve, organizerMessage) => reviewEventSubmissionAmendment(amendmentId, reviewerEmail, approve, organizerMessage, c),
  };
}
