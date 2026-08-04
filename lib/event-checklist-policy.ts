import type { EventChecklistItem } from '@/types';

export const SYSTEM_DESIGN_CHECKLIST_LABEL = 'Prepare system design session';
export const ARCHIVE_REQUESTS_CHECKLIST_LABEL = 'Request archive materials';

export function isSystemDesignChecklistItem(
  item: Pick<EventChecklistItem, 'label'>,
): boolean {
  return item.label === SYSTEM_DESIGN_CHECKLIST_LABEL;
}

export function isArchiveRequestsChecklistItem(
  item: Pick<EventChecklistItem, 'label'>,
): boolean {
  return item.label === ARCHIVE_REQUESTS_CHECKLIST_LABEL;
}

export function isSystemDesignDisabledForEvent(
  items: Pick<EventChecklistItem, 'label' | 'disabled_at'>[],
): boolean {
  return items.some((item) => (
    isSystemDesignChecklistItem(item)
    && Boolean(item.disabled_at)
  ));
}

export function isSystemDesignWorkspaceDisabled(
  items: Pick<EventChecklistItem, 'label' | 'disabled_at'>[],
  hasSavedSystemDesignSource: boolean,
): boolean {
  return !hasSavedSystemDesignSource && isSystemDesignDisabledForEvent(items);
}

// A missing row is deliberately treated as disabled. getEventChecklist backfills
// it for every event, but this keeps a direct API call fail-closed during rollout.
export function isArchiveRequestsDisabledForEvent(
  items: Pick<EventChecklistItem, 'label' | 'disabled_at'>[],
): boolean {
  const archiveRequestsItem = items.find(isArchiveRequestsChecklistItem);
  return !archiveRequestsItem || Boolean(archiveRequestsItem.disabled_at);
}

export function canChangeChecklistItemAvailability(
  item: Pick<EventChecklistItem, 'label' | 'completed' | 'disabled_at'>,
  isPublishedEvent: boolean,
): boolean {
  if (isArchiveRequestsChecklistItem(item) && item.disabled_at) return true;
  if (item.completed) return false;

  return !isPublishedEvent
    || isSystemDesignChecklistItem(item)
    || isArchiveRequestsChecklistItem(item);
}
