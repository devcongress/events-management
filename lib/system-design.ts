import type { PublicMeetupScheduleItem } from '@/types';

export function hasSystemDesignTitleMarker(title: string): boolean {
  const normalizedTitle = title.trim().toLowerCase();
  return normalizedTitle.includes('system design') || normalizedTitle.includes('architecture scenario');
}

export function systemDesignDisplayTitle(
  item: Pick<PublicMeetupScheduleItem, 'title' | 'system_design_title'>,
): string {
  return item.system_design_title?.trim() || item.title;
}

export function isSystemDesignSessionItem(
  item: Pick<PublicMeetupScheduleItem, 'type' | 'title' | 'system_design_title'>,
): boolean {
  if (item.type === 'system_design') return true;
  if (item.system_design_title?.trim()) return true;

  return hasSystemDesignTitleMarker(item.title);
}

export function canonicalizeSystemDesignSchedule<T extends PublicMeetupScheduleItem>(items: T[]): T[] {
  const outlineSlots = items.flatMap((item, index) => (
    item.type !== 'system_design' && isSystemDesignSessionItem(item) ? [{ item, index }] : []
  ));
  const explicitSessions = items.flatMap((item, index) => (
    item.type === 'system_design' ? [{ item, index }] : []
  ));

  if (outlineSlots.length === 0 || explicitSessions.length === 0) {
    return items;
  }

  const explicitIndexSet = new Set(explicitSessions.map(({ index }) => index));
  let explicitCursor = 0;

  const merged = items.flatMap((item, index) => {
    if (explicitIndexSet.has(index)) return [];

    if (item.type !== 'system_design' && isSystemDesignSessionItem(item) && explicitCursor < explicitSessions.length) {
      const explicit = explicitSessions[explicitCursor]?.item;
      explicitCursor += 1;

      if (!explicit) return [item];

      return [{
        ...item,
        lead: explicit.lead ?? item.lead,
        description: explicit.description ?? item.description,
        system_design_title: explicit.system_design_title?.trim() || explicit.title.trim() || item.system_design_title || null,
        resources: explicit.resources.length > 0 ? explicit.resources : item.resources,
      }];
    }

    return [item];
  });

  if (explicitCursor >= explicitSessions.length) {
    return merged;
  }

  return [
    ...merged,
    ...explicitSessions.slice(explicitCursor).map(({ item }) => item),
  ];
}
