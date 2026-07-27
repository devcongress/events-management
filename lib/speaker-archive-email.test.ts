import { describe, expect, it } from 'vitest';
import {
  archiveRequestProgramItems,
  sameArchiveProgramIdentity,
  sameArchiveProgramItemIdentity,
} from './speaker-archive-email';
import type { PublicMeetupScheduleItem } from '@/types';

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

  it('matches a sent request to its program item without depending on an email address', () => {
    expect(sameArchiveProgramItemIdentity({
      kind: 'talk',
      speaker_name: ' Ama  Mensah ',
      talk_title: 'BUILD RELIABLE WORKERS',
    }, {
      kind: 'talk',
      speakerName: 'ama mensah',
      title: 'Build reliable Workers',
    })).toBe(true);
  });

  it('requires the same email address when deciding whether a failed request can be reused', () => {
    const link = {
      kind: 'talk' as const,
      speaker_name: 'Ama Mensah',
      speaker_email: 'ama@example.com',
      talk_title: 'Build reliable Workers',
    };
    const item = {
      kind: 'talk' as const,
      speakerName: 'Ama Mensah',
      title: 'Build reliable Workers',
    };

    expect(sameArchiveProgramIdentity(link, {
      ...item,
      speakerEmail: 'AMA@example.com',
    })).toBe(true);
    expect(sameArchiveProgramIdentity(link, {
      ...item,
      speakerEmail: 'corrected@example.com',
    })).toBe(false);
  });
});
