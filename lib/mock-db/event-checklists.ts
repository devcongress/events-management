import { readData, writeData } from './index';
import {
  ARCHIVE_REQUESTS_CHECKLIST_LABEL,
  SYSTEM_DESIGN_CHECKLIST_LABEL,
} from '@/lib/event-checklist-policy';
import { resolveEventSeriesType } from '@/lib/event-series';
import { generateId, now } from '@/lib/utils';
import type { Event, EventChecklistItem, EventChecklistPhase, EventStatus } from '@/types';

const FILE = 'event-checklists';
const STATUS_ORDER: EventStatus[] = ['draft', 'cfp_open', 'cfp_closed', 'upcoming', 'live', 'completed'];

interface ChecklistTemplateItem {
  phase: EventChecklistPhase;
  label: string;
  description: string;
  status_on_complete: EventStatus | null;
  disabled_by_default?: boolean;
}

const DEFAULT_CHECKLIST: ChecklistTemplateItem[] = [
  {
    phase: 'setup',
    label: 'Create event shell',
    description: 'Confirm the monthly event date, title, and working description.',
    status_on_complete: 'draft',
  },
  {
    phase: 'cfp',
    label: 'Open CFP',
    description: 'Track that the speaker call has opened for this meetup.',
    status_on_complete: 'cfp_open',
  },
  {
    phase: 'cfp',
    label: 'Close CFP',
    description: 'Track that new speaker submissions have stopped and selection can begin.',
    status_on_complete: 'cfp_closed',
  },
  {
    phase: 'program',
    label: 'Confirm speakers and talks',
    description: 'Approve speakers, accept talks, and make the program clear.',
    status_on_complete: null,
  },
  {
    phase: 'program',
    label: 'Publish event details',
    description: 'Make sure attendees can see the page, topic, location, and timing.',
    status_on_complete: 'upcoming',
  },
  {
    phase: 'program',
    label: 'Collect slides and prep quiz',
    description: 'Gather speaker materials and prepare the community quiz.',
    status_on_complete: null,
  },
  {
    phase: 'program',
    label: ARCHIVE_REQUESTS_CHECKLIST_LABEL,
    description: 'Enable this only when organizers are ready to send new private archive requests.',
    status_on_complete: null,
    disabled_by_default: true,
  },
  {
    phase: 'program',
    label: SYSTEM_DESIGN_CHECKLIST_LABEL,
    description: 'Add the monthly architecture scenario, facilitator, and discussion slot.',
    status_on_complete: null,
  },
  {
    phase: 'event_day',
    label: 'Start event day',
    description: 'Mark the event as live when organizers begin running the room.',
    status_on_complete: 'live',
  },
  {
    phase: 'event_day',
    label: 'Run live quiz',
    description: 'Open the lobby, run questions, and finish the game.',
    status_on_complete: null,
  },
  {
    phase: 'post_event',
    label: 'Mark event completed',
    description: 'Close the event day and unlock post-event attendance and feedback work.',
    status_on_complete: 'completed',
  },
  {
    phase: 'post_event',
    label: 'Import attendance CSV',
    description: 'Upload Luma attendance so organizers can review check-ins and no-shows.',
    status_on_complete: null,
  },
  {
    phase: 'post_event',
    label: 'Open and review feedback',
    description: 'Let the feedback form collect responses, then review the monthly signal.',
    status_on_complete: null,
  },
  {
    phase: 'post_event',
    label: 'Publish archive',
    description: 'Make talks, slides, and the event recap easy to find later.',
    status_on_complete: null,
  },
];

const QUARTERLY_CHECKLIST: ChecklistTemplateItem[] = [
  {
    phase: 'setup',
    label: 'Create event shell',
    description: 'Confirm the quarterly meetup date, title, and working description.',
    status_on_complete: 'draft',
  },
  {
    phase: 'setup',
    label: 'Update with g-meet link from Edem',
    description: 'Add the Google Meet link once Edem shares it.',
    status_on_complete: 'upcoming',
  },
];

function checklistTemplateForEvent(event: Pick<Event, 'name' | 'series_type'> | null): ChecklistTemplateItem[] {
  return event && resolveEventSeriesType(event) === 'quarterly' ? QUARTERLY_CHECKLIST : DEFAULT_CHECKLIST;
}

function initialCompletedCutoff(template: ChecklistTemplateItem[], status: EventStatus | null): number {
  if (!status) return -1;

  const statusRank = STATUS_ORDER.indexOf(status);
  if (statusRank === -1) return -1;

  for (let index = template.length - 1; index >= 0; index -= 1) {
    const statusOnComplete = template[index].status_on_complete;
    if (statusOnComplete !== null && STATUS_ORDER.indexOf(statusOnComplete) <= statusRank) {
      return index;
    }
  }

  return -1;
}

function normalizeToTemplate(eventItems: EventChecklistItem[], template: ChecklistTemplateItem[]): EventChecklistItem[] {
  return template.flatMap((templateItem, index) => {
    const item = eventItems.find((candidate) => candidate.label === templateItem.label);
    if (!item) return [];

    return [{
      ...item,
      phase: templateItem.phase,
      description: templateItem.description,
      order_index: index,
      status_on_complete: templateItem.status_on_complete,
    }];
  });
}

function createDefaultChecklist(
  eventId: string,
  status: EventStatus | null = null,
  event: Pick<Event, 'name' | 'series_type'> | null = null,
): EventChecklistItem[] {
  const timestamp = now();
  const template = checklistTemplateForEvent(event);
  const completedCutoff = initialCompletedCutoff(template, status);

  return template.map((item, index) => ({
    id: generateId(),
    event_id: eventId,
    phase: item.phase,
    label: item.label,
    description: item.description,
    order_index: index,
    status_on_complete: item.status_on_complete,
    completed: completedCutoff >= index,
    completed_at: completedCutoff >= index ? timestamp : null,
    completed_by: completedCutoff >= index ? 'System' : null,
    disabled_at: item.disabled_by_default ? timestamp : null,
    disabled_by: item.disabled_by_default ? 'System' : null,
    updated_at: timestamp,
  }));
}

async function backfillMissingTemplateItems(
  allItems: EventChecklistItem[],
  eventItems: EventChecklistItem[],
  eventId: string,
  template: ChecklistTemplateItem[],
  status: EventStatus | null,
): Promise<EventChecklistItem[]> {
  const existingLabels = new Set(eventItems.map((item) => item.label));
  const missingTemplateItems = template.filter((item) => !existingLabels.has(item.label));

  if (missingTemplateItems.length === 0) {
    return normalizeToTemplate(eventItems, template);
  }

  const timestamp = now();
  const nextOrderIndex = eventItems.reduce((max, item) => Math.max(max, item.order_index), -1) + 1;
  const completedCutoff = initialCompletedCutoff(template, status);
  const missingItems = missingTemplateItems.map((item, index) => {
    const templateIndex = template.findIndex((templateItem) => templateItem.label === item.label);
    const completed = completedCutoff >= templateIndex;

    return {
      id: generateId(),
      event_id: eventId,
      phase: item.phase,
      label: item.label,
      description: item.description,
      order_index: nextOrderIndex + index,
      status_on_complete: item.status_on_complete,
      completed,
      completed_at: completed ? timestamp : null,
      completed_by: completed ? 'System' : null,
      disabled_at: item.disabled_by_default ? timestamp : null,
      disabled_by: item.disabled_by_default ? 'System' : null,
      updated_at: timestamp,
    };
  });

  await writeData<EventChecklistItem>(FILE, [...allItems, ...missingItems]);

  return normalizeToTemplate([...eventItems, ...missingItems], template);
}

export async function getEventChecklist(
  eventId: string,
  status: EventStatus | null = null,
  event: Pick<Event, 'name' | 'series_type'> | null = null,
): Promise<EventChecklistItem[]> {
  const items = await readData<EventChecklistItem>(FILE);
  const template = checklistTemplateForEvent(event);
  const eventItems = items
    .filter((item) => item.event_id === eventId)
    .sort((a, b) => a.order_index - b.order_index);

  if (eventItems.length > 0) {
    const activeEventItems = eventItems.filter((item) => !item.disabled_at);
    if (status && status !== 'draft' && activeEventItems.length > 0 && activeEventItems.every((item) => !item.completed)) {
      const completedCutoff = initialCompletedCutoff(template, status);
      const timestamp = now();
      const nextItems = items.map((item) => {
        if (item.event_id !== eventId || item.disabled_at) return item;

        const completed = item.order_index <= completedCutoff;
        return {
          ...item,
          completed,
          completed_at: completed ? timestamp : null,
          completed_by: completed ? 'System' : null,
          updated_at: timestamp,
        };
      });
      await writeData(FILE, nextItems);
      const nextEventItems = nextItems
        .filter((item) => item.event_id === eventId)
        .sort((a, b) => a.order_index - b.order_index);

      return backfillMissingTemplateItems(nextItems, nextEventItems, eventId, template, status);
    }

    return backfillMissingTemplateItems(items, eventItems, eventId, template, status);
  }

  const defaults = createDefaultChecklist(eventId, status, event);
  await writeData(FILE, [...items, ...defaults]);
  return defaults;
}

export async function updateEventChecklistItem(
  eventId: string,
  itemId: string,
  updates: Pick<EventChecklistItem, 'completed'> & { completed_by?: string | null },
): Promise<EventChecklistItem> {
  const items = await readData<EventChecklistItem>(FILE);
  let eventItems = items.filter((item) => item.event_id === eventId);

  if (eventItems.length === 0) {
    eventItems = createDefaultChecklist(eventId);
    items.push(...eventItems);
  }

  const index = items.findIndex((item) => item.event_id === eventId && item.id === itemId);
  if (index === -1) {
    throw new Error(`Checklist item ${itemId} not found`);
  }
  if (items[index].disabled_at) {
    throw new Error(`Checklist item ${itemId} is disabled`);
  }

  const timestamp = now();
  items[index] = {
    ...items[index],
    completed: updates.completed,
    completed_at: updates.completed ? timestamp : null,
    completed_by: updates.completed ? updates.completed_by ?? 'Organizer' : null,
    updated_at: timestamp,
  };

  await writeData(FILE, items);
  return items[index];
}

export async function setEventChecklistItemDisabled(
  eventId: string,
  itemId: string,
  disabled: boolean,
  disabledBy = 'Organizer',
): Promise<EventChecklistItem> {
  const items = await readData<EventChecklistItem>(FILE);
  const index = items.findIndex((item) => item.event_id === eventId && item.id === itemId);

  if (index === -1) {
    throw new Error(`Checklist item ${itemId} not found`);
  }

  if (disabled && items[index].completed) {
    throw new Error('Completed checklist items cannot be disabled');
  }

  const timestamp = now();
  items[index] = {
    ...items[index],
    disabled_at: disabled ? timestamp : null,
    disabled_by: disabled ? disabledBy : null,
    updated_at: timestamp,
  };

  await writeData(FILE, items);
  return items[index];
}
