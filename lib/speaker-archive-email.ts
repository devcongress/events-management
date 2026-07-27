import { isSystemDesignSessionItem } from '@/lib/system-design';
import type {
  ArchiveItemKind,
  EventSpeaker,
  PublicMeetupScheduleItem,
  SpeakerSubmission,
  Talk,
} from '@/types';

export type ArchiveRequestProgramItem = {
  index: number;
  value: string;
  title: string;
  speakerName: string;
  kind: ArchiveItemKind;
  label: string;
};

export type SpeakerEmailResolution =
  | { status: 'resolved'; email: string }
  | { status: 'missing'; email: null }
  | { status: 'ambiguous'; email: null };

type SpeakerEmailCandidate = {
  name: string;
  email: string;
  title?: string | null;
};

function normalizedText(value: string | null | undefined): string {
  return value?.trim().toLocaleLowerCase().replace(/\s+/g, ' ') ?? '';
}

function uniqueValidEmails(candidates: SpeakerEmailCandidate[]): string[] {
  return [...new Set(candidates
    .map((candidate) => candidate.email.trim().toLocaleLowerCase())
    .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))];
}

function resolveCandidateGroup(candidates: SpeakerEmailCandidate[]): SpeakerEmailResolution | null {
  const emails = uniqueValidEmails(candidates);
  if (emails.length === 1) return { status: 'resolved', email: emails[0] };
  if (emails.length > 1) return { status: 'ambiguous', email: null };
  return null;
}

export function archiveRequestProgramItems(
  schedule: PublicMeetupScheduleItem[] | null | undefined,
): ArchiveRequestProgramItem[] {
  return (schedule ?? []).flatMap((item, index) => {
    const title = item.title.trim();
    const speakerName = item.lead?.trim() ?? '';

    if (
      !title
      || !speakerName
      || /^welcome address\b/i.test(title)
      || isSystemDesignSessionItem(item)
    ) {
      return [];
    }

    return [{
      index,
      value: `program-item-${index}`,
      title,
      speakerName,
      kind: item.type === 'product_demo' ? 'product_demo' : 'talk',
      label: `${title} — ${speakerName}`,
    }];
  });
}

export function resolveSpeakerEmail(input: {
  speakerName: string;
  talkTitle: string;
  submissions: SpeakerSubmission[];
  speakers: EventSpeaker[];
  talks: Talk[];
}): SpeakerEmailResolution {
  const normalizedName = normalizedText(input.speakerName);
  const normalizedTitle = normalizedText(input.talkTitle);
  const activeSubmissions = input.submissions.filter((submission) => (
    submission.status !== 'not_selected' && submission.status !== 'withdrawn'
  ));

  const selectedExactTitle = activeSubmissions
    .filter((submission) => (
      submission.status === 'selected'
      && normalizedText(submission.speaker_name) === normalizedName
      && normalizedText(submission.title) === normalizedTitle
    ))
    .map((submission) => ({
      name: submission.speaker_name,
      email: submission.speaker_email,
      title: submission.title,
    }));
  const talkExactTitle = input.talks
    .filter((talk) => (
      normalizedText(talk.speaker_name) === normalizedName
      && normalizedText(talk.title) === normalizedTitle
    ))
    .map((talk) => ({
      name: talk.speaker_name,
      email: talk.speaker_email,
      title: talk.title,
    }));
  const submissionExactTitle = activeSubmissions
    .filter((submission) => (
      normalizedText(submission.speaker_name) === normalizedName
      && normalizedText(submission.title) === normalizedTitle
    ))
    .map((submission) => ({
      name: submission.speaker_name,
      email: submission.speaker_email,
      title: submission.title,
    }));
  const eventSpeakerExactName = input.speakers
    .filter((speaker) => normalizedText(speaker.name) === normalizedName)
    .map((speaker) => ({
      name: speaker.name,
      email: speaker.email,
    }));
  const allExactName = [
    ...activeSubmissions
      .filter((submission) => normalizedText(submission.speaker_name) === normalizedName)
      .map((submission) => ({
        name: submission.speaker_name,
        email: submission.speaker_email,
        title: submission.title,
      })),
    ...input.talks
      .filter((talk) => normalizedText(talk.speaker_name) === normalizedName)
      .map((talk) => ({
        name: talk.speaker_name,
        email: talk.speaker_email,
        title: talk.title,
      })),
  ];

  for (const candidates of [
    selectedExactTitle,
    talkExactTitle,
    submissionExactTitle,
    eventSpeakerExactName,
    allExactName,
  ]) {
    const resolution = resolveCandidateGroup(candidates);
    if (resolution) return resolution;
  }

  return { status: 'missing', email: null };
}

export function sameArchiveProgramIdentity(
  link: {
    kind?: ArchiveItemKind;
    speaker_email?: string | null;
    talk_title?: string | null;
  },
  item: {
    kind: ArchiveItemKind;
    speakerEmail: string;
    title: string;
  },
): boolean {
  return (link.kind === 'product_demo' ? 'product_demo' : 'talk') === item.kind
    && normalizedText(link.speaker_email) === normalizedText(item.speakerEmail)
    && normalizedText(link.talk_title) === normalizedText(item.title);
}
