import { describe, expect, it } from 'vitest';
import { eventBlastStarters } from './event-blast-workspace';

describe('event blast workspace', () => {
  it('keeps the desktop and phone starter copy in one shared source', () => {
    const starters = eventBlastStarters('August Meetup', '21 Aug 2026 at 6:00 pm');

    expect(starters.map((starter) => starter.id)).toEqual(['update', 'reminder', 'venue']);
    expect(starters[1]?.subject).toContain('August Meetup');
    expect(starters[1]?.body).toContain('21 Aug 2026 at 6:00 pm');
    expect(starters[2]?.body).toContain('[Add the new venue and any arrival details]');
  });
});
