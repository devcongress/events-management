import { readData, updateData } from './index';
import type { SpeakerSubmission, SpeakerSubmissionStatus } from '@/types';
import { generateId, now } from '@/lib/utils';

const FILE = 'speaker-submissions';

export async function getSpeakerSubmissionsByEvent(eventId: string): Promise<SpeakerSubmission[]> {
  const submissions = await readData<SpeakerSubmission>(FILE);
  return submissions
    .filter((submission) => submission.event_id === eventId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export async function getSpeakerSubmissionById(id: string): Promise<SpeakerSubmission | undefined> {
  const submissions = await readData<SpeakerSubmission>(FILE);
  return submissions.find((submission) => submission.id === id);
}

export async function createSpeakerSubmission(
  data: Omit<
    SpeakerSubmission,
    | 'id'
    | 'status'
    | 'internal_note'
    | 'selected_intake_link_id'
    | 'selected_talk_id'
    | 'decided_at'
    | 'created_at'
    | 'updated_at'
  >,
): Promise<SpeakerSubmission> {
  const createdAt = now();
  const submission: SpeakerSubmission = {
    ...data,
    id: generateId(),
    status: 'submitted',
    internal_note: null,
    selected_intake_link_id: null,
    selected_talk_id: null,
    decided_at: null,
    created_at: createdAt,
    updated_at: createdAt,
  };

  await updateData<SpeakerSubmission, SpeakerSubmission>(FILE, (submissions) => {
    const duplicate = submissions.find((item) => (
      item.event_id === submission.event_id
      && item.speaker_email.toLowerCase() === submission.speaker_email.toLowerCase()
      && item.title.trim().toLowerCase() === submission.title.trim().toLowerCase()
      && item.status !== 'withdrawn'
    ));

    if (duplicate) {
      throw new Error('This speaker proposal has already been submitted for this event');
    }

    return {
      data: [...submissions, submission],
      result: submission,
    };
  });

  return submission;
}

export async function updateSpeakerSubmission(
  id: string,
  updates: Partial<Omit<SpeakerSubmission, 'id' | 'created_at'>>,
): Promise<SpeakerSubmission> {
  return updateData<SpeakerSubmission, SpeakerSubmission>(FILE, (submissions) => {
    const index = submissions.findIndex((submission) => submission.id === id);

    if (index === -1) {
      throw new Error(`Speaker submission ${id} not found`);
    }

    const statusChanged = updates.status && updates.status !== submissions[index].status;
    const next: SpeakerSubmission = {
      ...submissions[index],
      ...updates,
      decided_at: statusChanged && isDecisionStatus(updates.status) ? now() : updates.decided_at ?? submissions[index].decided_at,
      updated_at: now(),
    };

    const nextSubmissions = [...submissions];
    nextSubmissions[index] = next;

    return {
      data: nextSubmissions,
      result: next,
    };
  });
}

function isDecisionStatus(status: SpeakerSubmissionStatus | undefined): boolean {
  return status === 'selected' || status === 'not_selected';
}
