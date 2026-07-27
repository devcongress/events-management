import { describe, expect, it } from 'vitest';
import { archiveRequestProgramItems, resolveSpeakerEmail } from './speaker-archive-email';
import type { EventSpeaker, PublicMeetupScheduleItem, SpeakerSubmission, Talk } from '@/types';

const schedule: PublicMeetupScheduleItem[] = [
  {
    time: '11:00',
    title: 'Welcome address',
    type: 'talk',
    lead: 'Organizer',
    resources: [],
  },
  {
    time: '11:10',
    title: 'Build reliable Workers',
    type: 'talk',
    lead: 'Ama Mensah',
    resources: [],
  },
  {
    time: '12:00',
    title: 'Design a URL shortener',
    type: 'system_design',
    lead: 'Facilitator',
    resources: [],
  },
];

describe('speaker archive email matching', () => {
  it('keeps eligible program speakers while excluding welcome and system-design items', () => {
    expect(archiveRequestProgramItems(schedule)).toEqual([
      expect.objectContaining({
        index: 1,
        title: 'Build reliable Workers',
        speakerName: 'Ama Mensah',
        kind: 'talk',
      }),
    ]);
  });

  it('prefers the selected proposal with the exact program title', () => {
    const submissions = [{
      id: 'submission-1',
      event_id: 'event-1',
      speaker_name: 'Ama Mensah',
      speaker_email: 'proposal@example.com',
      github_username: null,
      title: 'Build reliable Workers',
      topic: 'Cloud',
      abstract: 'Abstract',
      bio: 'Bio',
      status: 'selected',
      internal_note: null,
      selected_intake_link_id: null,
      selected_talk_id: null,
      decided_at: null,
      created_at: '2026-07-01T00:00:00.000Z',
      updated_at: '2026-07-01T00:00:00.000Z',
    }] satisfies SpeakerSubmission[];
    const speakers = [{
      id: 'speaker-1',
      event_id: 'event-1',
      name: 'Ama Mensah',
      email: 'older@example.com',
      added_at: '2026-07-01T00:00:00.000Z',
    }] satisfies EventSpeaker[];

    expect(resolveSpeakerEmail({
      speakerName: ' Ama  Mensah ',
      talkTitle: 'Build reliable Workers',
      submissions,
      speakers,
      talks: [],
    })).toEqual({
      status: 'resolved',
      email: 'proposal@example.com',
    });
  });

  it('refuses to guess when same-priority records disagree on the email', () => {
    const talks = [
      {
        speaker_name: 'Ama Mensah',
        speaker_email: 'one@example.com',
        title: 'Build reliable Workers',
      },
      {
        speaker_name: 'Ama Mensah',
        speaker_email: 'two@example.com',
        title: 'Build reliable Workers',
      },
    ] as Talk[];

    expect(resolveSpeakerEmail({
      speakerName: 'Ama Mensah',
      talkTitle: 'Build reliable Workers',
      submissions: [],
      speakers: [],
      talks,
    })).toEqual({ status: 'ambiguous', email: null });
  });
});
