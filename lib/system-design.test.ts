import { describe, expect, it } from 'vitest';
import { findSystemDesignSource } from './system-design';
import type { PublicMeetupScheduleItem } from '@/types';

describe('findSystemDesignSource', () => {
  it('finds a saved source even when it is not the first resource', () => {
    const schedule: PublicMeetupScheduleItem[] = [{
      time: '18:00',
      title: 'Architecture scenario',
      type: 'open_discussion',
      lead: null,
      resources: [
        { title: 'Empty legacy resource', url: '' },
        { title: 'Prompt deck', url: 'https://docs.google.com/presentation/d/example' },
      ],
    }];

    expect(findSystemDesignSource(schedule)).toEqual(schedule[0]?.resources[1]);
  });

  it('ignores links belonging to non-System Design schedule items', () => {
    expect(findSystemDesignSource([{
      title: 'Community announcements',
      type: 'networking',
      resources: [{ title: 'Community link', url: 'https://example.com' }],
    }])).toBeNull();
  });
});
