import type { EventChecklistItem } from '@/types';

export const SYSTEM_DESIGN_CHECKLIST_LABEL = 'Prepare system design session';

export function isSystemDesignChecklistItem(
  item: Pick<EventChecklistItem, 'label'>,
): boolean {
  return item.label === SYSTEM_DESIGN_CHECKLIST_LABEL;
}

export function isSystemDesignDisabledForEvent(
  items: Pick<EventChecklistItem, 'label' | 'disabled_at'>[],
): boolean {
  return items.some((item) => (
    isSystemDesignChecklistItem(item)
    && Boolean(item.disabled_at)
  ));
}

export function canChangeChecklistItemAvailability(
  item: Pick<EventChecklistItem, 'label' | 'completed'>,
  isPublishedEvent: boolean,
): boolean {
  return !item.completed && (
    !isPublishedEvent
    || isSystemDesignChecklistItem(item)
  );
}
