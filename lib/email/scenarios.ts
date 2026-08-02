import { isTestEventTitle, TEST_EVENT_PREFIX } from '@/lib/event-test-mode';

export const EMAIL_SUBJECT_MAX_LENGTH = 160;

export const EMAIL_SENDERS = {
  events: {
    displayName: 'DevCongress Events',
    address: 'events@updates.devcongress.org',
    from: 'DevCongress Events <events@updates.devcongress.org>',
  },
  speakers: {
    displayName: 'DevCongress Speakers',
    address: 'speakers@updates.devcongress.org',
    from: 'DevCongress Speakers <speakers@updates.devcongress.org>',
  },
} as const;

export type EmailSenderKey = keyof typeof EMAIL_SENDERS;
export type EmailScenarioStatus = 'active' | 'planned';

function subjectText(value: string, fallback: string): string {
  const normalized = value
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || fallback;
  const characters = Array.from(normalized);
  if (characters.length <= EMAIL_SUBJECT_MAX_LENGTH) return normalized;
  return `${characters.slice(0, EMAIL_SUBJECT_MAX_LENGTH - 1).join('').trimEnd()}…`;
}

function eventSubject(prefix: string, eventName: string, fallback = 'DevCongress event'): string {
  const normalizedName = subjectText(eventName, fallback);
  if (isTestEventTitle(normalizedName)) {
    const unmarkedName = normalizedName.slice(TEST_EVENT_PREFIX.length).trim() || fallback;
    return subjectText(`${TEST_EVENT_PREFIX} ${prefix}${unmarkedName}`, `${TEST_EVENT_PREFIX} ${prefix}${fallback}`);
  }
  return subjectText(`${prefix}${normalizedName}`, `${prefix}${fallback}`);
}

export const emailSubjects = {
  registrationConfirmed: (eventName: string) => eventSubject('You are registered for ', eventName),
  registrationWaitlisted: (eventName: string) => eventSubject('You are on the waitlist for ', eventName),
  registrationPromoted: (eventName: string) => eventSubject('A place opened up for ', eventName),
  eventUpdate: (eventName: string) => eventSubject('', `${subjectText(eventName, 'This event')} — quick update`),
  eventReminder: (eventName: string) => eventSubject('', `${subjectText(eventName, 'This event')} — see you soon`),
  eventVenueChange: (eventName: string) => eventSubject('', `${subjectText(eventName, 'This event')} — venue update`),
  customEventBlast: (subject: string) => subjectText(subject, 'Event update'),
  speakerArchiveRequest: (eventName: string) => eventSubject('Share your talk resources: ', eventName),
  communitySubmissionReceipt: (eventTitle: string) => eventSubject('We received your event submission: ', eventTitle),
  communitySubmissionApproved: (eventTitle: string) => eventSubject('Your event is now listed: ', eventTitle),
  communitySubmissionRejected: (eventTitle: string) => eventSubject('Update on your event submission: ', eventTitle),
  conferenceSpeakerInvitation: (edition: string) => eventSubject('Invitation to speak at DevCongress ', edition, 'conference'),
  conferenceSpeakerProposalReceipt: (edition: string) => eventSubject('We received your DevCongress ', `${edition} proposal`, 'conference proposal'),
  conferenceSpeakerAccepted: (edition: string) => eventSubject('Your session was accepted for DevCongress ', edition, 'conference'),
  conferenceSpeakerDeclined: (edition: string) => eventSubject('Update on your DevCongress ', `${edition} proposal`, 'conference proposal'),
  conferenceRegistration: (edition: string) => eventSubject('You are registered for DevCongress ', edition, 'conference'),
} as const;

export const EMAIL_SCENARIOS: ReadonlyArray<{
  id: string;
  status: EmailScenarioStatus;
  sender: EmailSenderKey;
  recipient: string;
  subjectPattern: string;
}> = [
  { id: 'registration_confirmed', status: 'active', sender: 'events', recipient: 'confirmed attendee', subjectPattern: 'You are registered for {event name}' },
  { id: 'registration_waitlisted', status: 'active', sender: 'events', recipient: 'waitlisted attendee', subjectPattern: 'You are on the waitlist for {event name}' },
  { id: 'registration_promoted', status: 'active', sender: 'events', recipient: 'promoted attendee', subjectPattern: 'A place opened up for {event name}' },
  { id: 'event_blast', status: 'active', sender: 'events', recipient: 'confirmed attendees', subjectPattern: 'Organizer-defined; normalized to one line and limited to 160 characters' },
  { id: 'speaker_archive_request', status: 'active', sender: 'speakers', recipient: 'selected speaker', subjectPattern: 'Share your talk resources: {event name}' },
  { id: 'community_submission_receipt', status: 'active', sender: 'events', recipient: 'community event submitter', subjectPattern: 'We received your event submission: {event title}' },
  { id: 'community_submission_approved', status: 'active', sender: 'events', recipient: 'community event submitter', subjectPattern: 'Your event is now listed: {event title}' },
  { id: 'community_submission_rejected', status: 'active', sender: 'events', recipient: 'community event submitter', subjectPattern: 'Update on your event submission: {event title}' },
  { id: 'conference_speaker_invitation', status: 'planned', sender: 'speakers', recipient: 'prospective conference speaker', subjectPattern: 'Invitation to speak at DevCongress {edition}' },
  { id: 'conference_speaker_proposal_receipt', status: 'planned', sender: 'speakers', recipient: 'conference speaker applicant', subjectPattern: 'We received your DevCongress {edition} proposal' },
  { id: 'conference_speaker_accepted', status: 'planned', sender: 'speakers', recipient: 'accepted conference speaker', subjectPattern: 'Your session was accepted for DevCongress {edition}' },
  { id: 'conference_speaker_declined', status: 'planned', sender: 'speakers', recipient: 'conference speaker applicant', subjectPattern: 'Update on your DevCongress {edition} proposal' },
  { id: 'conference_registration', status: 'planned', sender: 'events', recipient: 'conference attendee', subjectPattern: 'You are registered for DevCongress {edition}' },
];
