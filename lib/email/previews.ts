import { EMAIL_SCENARIOS, EMAIL_SENDERS, emailSubjects } from '@/lib/email/scenarios';
import { eventBlastEmail } from '@/lib/email/templates/event-blast';
import { communityEventSubmissionEmail } from '@/lib/email/templates/community-event-submission';
import { eventRegistrationConfirmationEmail } from '@/lib/email/templates/event-registration-confirmation';
import { monthlyArchiveRequestEmail } from '@/lib/email/templates/monthly-archive-request';
import type { EventSubmissionEmailKind } from '@/types';

export type EmailPreviewCategory = 'Registration' | 'Event updates' | 'Community listings' | 'Speaker archive';

export type RenderedEmailPreview = {
  id: string;
  label: string;
  category: EmailPreviewCategory;
  recipient: string;
  trigger: string;
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type PlannedEmailScenario = {
  id: string;
  recipient: string;
  subject_pattern: string;
  from: string;
};

export type EmailPreviewCatalog = {
  previews: RenderedEmailPreview[];
  planned: PlannedEmailScenario[];
};

const sampleEvent = {
  name: 'DevCongress Accra Meetup — September',
  date: '2026-09-26T15:00:00.000Z',
  endDate: '2026-09-26T18:00:00.000Z',
  locationName: 'Impact Hub Accra, Osu',
  locationUrl: 'https://maps.google.com/?q=Impact+Hub+Accra',
  eventUrl: 'https://devcongress.org/events/devcongress-accra-meetup-september/',
  calendarUrl: 'https://em.devcongress.org/api/registration/events/devcongress-accra-meetup-september/calendar.ics',
};

const sampleCommunityEvent = {
  organizerName: 'Ama',
  eventTitle: 'Accra Cloud Native Community Day',
  startsAt: '2026-10-10T09:00:00.000Z',
  timezone: 'Africa/Accra',
  communityCalendarUrl: 'https://devcongress.org/events/',
  submissionUrl: 'https://devcongress.org/events/submit/',
  registrationUrl: 'https://example.com/accra-cloud-native-day',
  managementUrl: 'https://em.devcongress.org/event-amendments/sample-capability',
};

function registrationPreview(input: {
  id: string;
  label: string;
  recipient: string;
  trigger: string;
  status: 'confirmed' | 'waitlisted';
  kind?: 'confirmation' | 'promotion';
}): RenderedEmailPreview {
  const content = eventRegistrationConfirmationEmail({
    attendeeName: 'Kwame',
    eventName: sampleEvent.name,
    eventDate: sampleEvent.date,
    eventEndDate: sampleEvent.endDate,
    locationName: sampleEvent.locationName,
    locationUrl: sampleEvent.locationUrl,
    eventUrl: sampleEvent.eventUrl,
    calendarDownloadUrl: sampleEvent.calendarUrl,
    status: input.status,
    kind: input.kind,
  });

  return {
    ...input,
    category: 'Registration',
    from: EMAIL_SENDERS.events.from,
    to: 'Kwame Mensah <kwame@example.com>',
    ...content,
  };
}

function communityPreview(input: {
  id: string;
  label: string;
  recipient: string;
  trigger: string;
  kind: EventSubmissionEmailKind;
  rejectionCategory?: 'calendar_fit' | 'insufficient_information' | 'duplicate' | 'event_passed' | 'other';
  organizerMessage?: string;
}): RenderedEmailPreview {
  const content = communityEventSubmissionEmail({
    ...sampleCommunityEvent,
    kind: input.kind,
    rejectionCategory: input.rejectionCategory,
    organizerMessage: input.organizerMessage,
    amendmentStartsAt: '2026-10-10T10:00:00.000Z',
    amendmentTimezone: 'Africa/Accra',
  });

  return {
    id: input.id,
    label: input.label,
    category: 'Community listings',
    recipient: input.recipient,
    trigger: input.trigger,
    from: EMAIL_SENDERS.events.from,
    to: 'Ama Boateng <ama@example.com>',
    ...content,
  };
}

function speakerPreview(input: {
  id: string;
  label: string;
  trigger: string;
  talkTitle: string;
}): RenderedEmailPreview {
  const content = monthlyArchiveRequestEmail({
    eventName: sampleEvent.name,
    speakerName: 'Efua Owusu',
    talkTitle: input.talkTitle,
    privateUrl: 'https://em.devcongress.org/speaker-talks/sample-event/sample-token',
    expiresAt: '2026-10-10T23:59:59.000Z',
  });

  return {
    id: input.id,
    label: input.label,
    category: 'Speaker archive',
    recipient: 'Speaker',
    trigger: input.trigger,
    from: EMAIL_SENDERS.speakers.from,
    to: 'Efua Owusu <efua@example.com>',
    ...content,
  };
}

export function emailPreviewCatalog(): EmailPreviewCatalog {
  const blastSubject = emailSubjects.eventReminder(sampleEvent.name);
  const blastContent = eventBlastEmail({
    subject: blastSubject,
    body: 'Hi everyone,\n\nA quick reminder that we meet this Saturday. Doors open at 2:30 PM, and the first session starts at 3:00 PM. Bring a friend and come ready to learn.',
    unsubscribeUrl: 'https://example.com/unsubscribe/sample',
    eventName: sampleEvent.name,
    eventDate: sampleEvent.date,
    eventEndDate: sampleEvent.endDate,
    locationName: sampleEvent.locationName,
    locationUrl: sampleEvent.locationUrl,
    eventUrl: sampleEvent.eventUrl,
    calendarDownloadUrl: sampleEvent.calendarUrl,
  });

  const previews: RenderedEmailPreview[] = [
    registrationPreview({
      id: 'registration_confirmed',
      label: 'Registration confirmed',
      recipient: 'Confirmed attendee',
      trigger: 'Sent after a guest registers and receives an available place.',
      status: 'confirmed',
      kind: 'confirmation',
    }),
    registrationPreview({
      id: 'registration_waitlisted',
      label: 'Added to waitlist',
      recipient: 'Waitlisted attendee',
      trigger: 'Sent when event capacity is full and the guest joins the waitlist.',
      status: 'waitlisted',
      kind: 'confirmation',
    }),
    registrationPreview({
      id: 'registration_promoted',
      label: 'Promoted from waitlist',
      recipient: 'Promoted attendee',
      trigger: 'Sent when a confirmed guest cancels and the oldest waitlisted guest gets the place.',
      status: 'confirmed',
      kind: 'promotion',
    }),
    {
      id: 'event_blast',
      label: 'Event update',
      category: 'Event updates',
      recipient: 'Confirmed attendees',
      trigger: 'Sent or scheduled by an organizer from an event’s Blasts workspace. Subject and message are editable.',
      from: EMAIL_SENDERS.events.from,
      to: 'Confirmed guests for this event',
      subject: blastSubject,
      ...blastContent,
    },
    communityPreview({
      id: 'community_submission_receipt',
      label: 'Submission received',
      recipient: 'Community event submitter',
      trigger: 'Sent immediately after a public community-event proposal enters the review queue.',
      kind: 'receipt',
    }),
    communityPreview({
      id: 'community_submission_approved',
      label: 'Submission approved',
      recipient: 'Community event submitter',
      trigger: 'Sent after an organizer approves and publishes a proposed event.',
      kind: 'approved',
    }),
    communityPreview({
      id: 'community_submission_rejected',
      label: 'Submission rejected',
      recipient: 'Community event submitter',
      trigger: 'Sent after an organizer rejects a proposed event.',
      kind: 'rejected',
      rejectionCategory: 'insufficient_information',
      organizerMessage: 'We could not verify the venue or find a public registration page. You are welcome to submit again once those details are available.',
    }),
    communityPreview({
      id: 'community_amendment_approved',
      label: 'Event changes approved',
      recipient: 'Community event submitter',
      trigger: 'Sent after requested changes to a published community event are approved.',
      kind: 'amendment_approved',
    }),
    communityPreview({
      id: 'community_amendment_rejected',
      label: 'Event changes rejected',
      recipient: 'Community event submitter',
      trigger: 'Sent when requested changes are declined and the existing listing remains unchanged.',
      kind: 'amendment_rejected',
      organizerMessage: 'The new date falls outside the event’s published registration window. Please update the registration page first, then submit the change again.',
    }),
    communityPreview({
      id: 'community_submission_withdrawn',
      label: 'Listing removed',
      recipient: 'Community event submitter',
      trigger: 'Sent when the DevCongress team removes a previously published community listing.',
      kind: 'withdrawn',
    }),
    speakerPreview({
      id: 'speaker_archive_request',
      label: 'Speaker archive request',
      trigger: 'Sent to a selected meetup speaker to collect the final talk resources for the archive.',
      talkTitle: 'Designing Reliable Event-Driven Systems',
    }),
    speakerPreview({
      id: 'speaker_archive_materials_follow_up',
      label: 'Missing archive materials',
      trigger: 'Sent by an owner when a published talk is still missing slides, a recording, or other archive details.',
      talkTitle: 'Designing Reliable Event-Driven Systems — archive follow-up',
    }),
  ];

  const planned = EMAIL_SCENARIOS
    .filter((scenario) => scenario.status === 'planned')
    .map((scenario) => ({
      id: scenario.id,
      recipient: scenario.recipient,
      subject_pattern: scenario.subjectPattern,
      from: EMAIL_SENDERS[scenario.sender].from,
    }));

  return { previews, planned };
}
