import { readData, writeData } from './index';
import { generateId, now } from '@/lib/utils';
import type { EventChecklistItem, EventChecklistPhase, EventStatus } from '@/types';

const FILE = 'event-checklists';
const STATUS_ORDER: EventStatus[] = ['draft', 'cfp_open', 'cfp_closed', 'upcoming', 'live', 'completed'];

interface ChecklistTemplateItem {
  phase: EventChecklistPhase;
  label: string;
  description: string;
  status_on_complete: EventStatus | null;
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
    description: 'Start accepting talk submissions for this meetup.',
    status_on_complete: 'cfp_open',
  },
  {
    phase: 'cfp',
    label: 'Close CFP',
    description: 'Stop new submissions and move into review/selection.',
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

function initialCompletedCutoff(status: EventStatus | null): number {
  if (!status) return -1;

  const statusRank = STATUS_ORDER.indexOf(status);
  if (statusRank === -1) return -1;

  for (let index = DEFAULT_CHECKLIST.length - 1; index >= 0; index -= 1) {
    const statusOnComplete = DEFAULT_CHECKLIST[index].status_on_complete;
    if (statusOnComplete !== null && STATUS_ORDER.indexOf(statusOnComplete) <= statusRank) {
      return index;
    }
  }

  return -1;
}

function createDefaultChecklist(eventId: string, status: EventStatus | null = null): EventChecklistItem[] {
  const timestamp = now();
  const completedCutoff = initialCompletedCutoff(status);

  return DEFAULT_CHECKLIST.map((item, index) => ({
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
    updated_at: timestamp,
  }));
}

export async function getEventChecklist(eventId: string, status: EventStatus | null = null): Promise<EventChecklistItem[]> {
  const items = await readData<EventChecklistItem>(FILE);
  const eventItems = items
    .filter((item) => item.event_id === eventId)
    .sort((a, b) => a.order_index - b.order_index);

  if (eventItems.length > 0) {
    if (status && status !== 'draft' && eventItems.every((item) => !item.completed)) {
      const completedCutoff = initialCompletedCutoff(status);
      const timestamp = now();
      const nextItems = items.map((item) => {
        if (item.event_id !== eventId) return item;

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
      return nextItems
        .filter((item) => item.event_id === eventId)
        .sort((a, b) => a.order_index - b.order_index);
    }

    return eventItems;
  }

  const defaults = createDefaultChecklist(eventId, status);
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
