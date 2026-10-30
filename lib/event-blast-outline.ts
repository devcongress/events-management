import { z } from 'zod';
import type { Event } from '@/types';

export const eventBlastOutlineSchema = z.array(z.object({
  title: z.string().trim().min(1).max(500),
  lead: z.string().trim().max(300).nullable(),
}).strict()).min(1).max(300);

export type EventBlastOutlineItem = z.infer<typeof eventBlastOutlineSchema>[number];

/** Only public session titles and leads belong in an email outline. */
export function eventBlastOutline(event: Pick<Event, 'schedule'> | null | undefined): EventBlastOutlineItem[] {
  return (event?.schedule ?? []).filter((item) => item.title.trim()).map((item) => ({
    title: item.title.trim(),
    lead: item.lead?.trim() || null,
  }));
}

export function eventBlastOutlineText(outline: EventBlastOutlineItem[]): string {
  if (!outline.length) return '';

  return `What’s on the programme\n${outline.map((item) => `• ${item.title}${item.lead ? ` — ${item.lead}` : ''}`).join('\n')}`;
}
