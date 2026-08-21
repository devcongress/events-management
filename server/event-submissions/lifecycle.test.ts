import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEventSubmissionLifecycle, type EventSubmissionLifecycleRepository } from './lifecycle';

const submission = {
  id: 'submission-1',
  approved_event_id: 'event-1',
  review_status: 'approved',
  rejection_category: null,
  organizer_message: null,
  internal_note: null,
} as any;

const amendment = {
  id: 'amendment-1',
  submission_id: 'submission-1',
  status: 'approved',
} as any;

const submittedAmendment = {
  ...amendment,
  status: 'submitted',
};

const currentEvent = {
  starts_at: '2099-01-01T10:00:00.000Z',
  ends_at: '2099-01-01T12:00:00.000Z',
  location_type: 'online' as const,
  venue_name: 'Online',
  venue_address: 'Online',
  online_url: 'https://meet.example.com/event',
  registration_url: 'https://example.com/register',
  cover_url: 'https://example.com/cover.png',
};

function repository(): EventSubmissionLifecycleRepository {
  return {
    create: vi.fn(),
    list: vi.fn(),
    approve: vi.fn(async () => submission),
    reject: vi.fn(async (_id, _email, input) => ({ ...submission, review_status: 'rejected', ...input })),
    withdraw: vi.fn(async () => ({ ...submission, review_status: 'withdrawn' })),
    management: vi.fn(async () => ({ link_id: 'link-1', expires_at: '2099-01-01T00:00:00.000Z', submission, current_event: currentEvent, amendment: null })),
    activeManagementLink: vi.fn(async () => ({ id: 'link-1', expires_at: '2099-01-01T00:00:00.000Z' })),
    saveAmendment: vi.fn(async () => amendment),
    submitAmendment: vi.fn(async () => submittedAmendment),
    reviewAmendment: vi.fn(async () => amendment),
  };
}

describe('community event submission lifecycle', () => {
  const audit = vi.fn(async () => undefined);
  const queueEmail = vi.fn(async () => undefined);
  const announcePublished = vi.fn(async () => undefined);

  beforeEach(() => vi.clearAllMocks());

  it('keeps approval, audit, announcement, and delivery intent in one transition', async () => {
    const repo = repository();
    const lifecycle = createEventSubmissionLifecycle({ repository: repo, audit, queueEmail, announcePublished });

    await expect(lifecycle.review({
      submissionId: 'submission-1',
      actor: { email: 'owner@devcongress.org', role: 'owner' },
      command: { kind: 'approve', publish: true },
    })).resolves.toEqual({ submission, eventId: 'event-1' });

    expect(repo.approve).toHaveBeenCalledWith('submission-1', 'owner@devcongress.org', true);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'event_submission.approve_and_publish' }));
    expect(announcePublished).toHaveBeenCalledWith(submission);
    expect(queueEmail).toHaveBeenCalledWith({ submissionId: 'submission-1', kind: 'approved' });
  });

  it('delegates public intake and organizer listing without importing transport policy', async () => {
    const repo = repository();
    const created = { ...submission, review_status: 'pending' };
    vi.mocked(repo.create).mockResolvedValue(created);
    vi.mocked(repo.list).mockResolvedValue([created]);
    const lifecycle = createEventSubmissionLifecycle({ repository: repo, audit, queueEmail });
    const input = { title: 'Build a useful thing' } as any;

    await expect(lifecycle.submit(input)).resolves.toBe(created);
    await expect(lifecycle.list('pending')).resolves.toEqual([created]);

    expect(repo.create).toHaveBeenCalledWith(input);
    expect(repo.list).toHaveBeenCalledWith('pending');
    expect(audit).not.toHaveBeenCalled();
    expect(queueEmail).not.toHaveBeenCalled();
  });

  it('does not announce or queue an approval email when approval remains a draft', async () => {
    const repo = repository();
    const lifecycle = createEventSubmissionLifecycle({ repository: repo, audit, queueEmail, announcePublished });

    await lifecycle.review({
      submissionId: 'submission-1',
      actor: { email: 'organizer@devcongress.org', role: 'organizer' },
      command: { kind: 'approve', publish: false },
    });

    expect(announcePublished).not.toHaveBeenCalled();
    expect(queueEmail).not.toHaveBeenCalled();
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'event_submission.approve_as_draft' }));
  });

  it('keeps rejection reason metadata and email intent together', async () => {
    const repo = repository();
    const lifecycle = createEventSubmissionLifecycle({ repository: repo, audit, queueEmail });

    await lifecycle.review({
      submissionId: 'submission-1',
      actor: { email: 'owner@devcongress.org', role: 'owner' },
      command: { kind: 'reject', category: 'duplicate', organizerMessage: 'Please submit the current event only.' },
    });

    expect(repo.reject).toHaveBeenCalledWith('submission-1', 'owner@devcongress.org', expect.objectContaining({ category: 'duplicate' }));
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'event_submission.reject' }));
    expect(queueEmail).toHaveBeenCalledWith({ submissionId: 'submission-1', kind: 'rejected' });
  });

  it('checks management capability before saving or submitting an amendment', async () => {
    const repo = repository();
    const notifyAmendmentSubmitted = vi.fn(async () => undefined);
    const lifecycle = createEventSubmissionLifecycle({ repository: repo, audit, queueEmail, notifyAmendmentSubmitted });

    await lifecycle.management.saveDraft({
      linkId: 'link-1',
      changes: {
        starts_at: '2099-01-01T10:00:00.000Z',
        ends_at: '2099-01-01T12:00:00.000Z',
        location_type: 'online',
      },
    });
    await lifecycle.management.submit({ linkId: 'link-1' });

    expect(repo.management).toHaveBeenCalledTimes(2);
    expect(repo.saveAmendment).toHaveBeenCalledWith('submission-1', expect.any(Object));
    expect(repo.submitAmendment).toHaveBeenCalledWith('submission-1');
    expect(notifyAmendmentSubmitted).toHaveBeenCalledWith({
      management: expect.objectContaining({ submission }),
      amendment: submittedAmendment,
    });
    expect(queueEmail).not.toHaveBeenCalled();
  });

  it('records an amendment decision and schedules only its matching result email', async () => {
    const repo = repository();
    const lifecycle = createEventSubmissionLifecycle({ repository: repo, audit, queueEmail });

    await expect(lifecycle.management.review({
      amendmentId: 'amendment-1',
      actor: { email: 'owner@devcongress.org', role: 'owner' },
      approve: false,
      organizerMessage: 'The venue change needs more detail.',
    })).resolves.toBe(amendment);

    expect(repo.reviewAmendment).toHaveBeenCalledWith(
      'amendment-1',
      'owner@devcongress.org',
      false,
      'The venue change needs more detail.',
    );
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'event_submission_amendment.reject',
      targetId: 'amendment-1',
    }));
    expect(queueEmail).toHaveBeenCalledWith({ submissionId: 'submission-1', kind: 'amendment_rejected' });
  });
});
