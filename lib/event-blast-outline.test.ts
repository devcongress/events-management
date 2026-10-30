import { describe, expect, it } from 'vitest';
import { eventBlastOutline, eventBlastOutlineSchema } from './event-blast-outline';

describe('blast outline projection', () => {
  it('copies only titles and leads in order, without times or other session metadata', () => {
    const schedule = [{ time: '11:15AM - 11:45AM', title: ' Building AI ', lead: ' Samora ', type: 'talk' as const, resources: [], description: 'Details' }];
    const result = eventBlastOutline({ schedule });

    expect(result).toEqual([{ title: 'Building AI', lead: 'Samora' }]);
    schedule[0].title = 'Edited later';
    expect(result[0].title).toBe('Building AI');
    expect(eventBlastOutline(null)).toEqual([]);
    expect(eventBlastOutline({})).toEqual([]);
  });

  it('rejects empty outlines and extra fields such as times', () => {
    expect(eventBlastOutlineSchema.safeParse([]).success).toBe(false);
    expect(eventBlastOutlineSchema.safeParse([{ title: 'Talk', lead: null, time: '11AM' }]).success).toBe(false);
  });
});
