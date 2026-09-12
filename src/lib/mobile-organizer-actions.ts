import { isEventCheckInDay } from '@/lib/event-check-in';
import { resolveEventStatus } from '@/lib/event-status';
import type { AnnualConferenceTask } from '@/lib/annual-conference-work-plan';
import type { Event as CommunityEvent } from '@/types';

export type MobileOrganizerActionTarget =
  | { kind: 'check_in'; eventId: string }
  | { kind: 'event'; eventId: string }
  | { kind: 'task'; taskId: string };

export interface MobileOrganizerNextAction {
  id: string;
  eyebrow: string;
  title: string;
  detail: string;
  tone: 'urgent' | 'active' | 'upcoming';
  target: MobileOrganizerActionTarget;
}

interface MobileOrganizerActionInput {
  role: 'owner' | 'organizer' | 'volunteer';
  events: CommunityEvent[];
  tasks: AnnualConferenceTask[];
  now?: Date;
  limit?: number;
}

const TASK_STATUS_WEIGHT: Record<AnnualConferenceTask['status'], number> = {
  blocked: 0,
  in_progress: 3,
  not_started: 5,
  done: 6,
};

function accraDate(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Accra',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function taskWeight(task: AnnualConferenceTask, today: string): number {
  if (task.status === 'blocked') return 0;
  if (task.target_date && task.target_date < today) return 1;
  if (!task.accountable_owner) return 2;

  return TASK_STATUS_WEIGHT[task.status];
}

function taskEyebrow(task: AnnualConferenceTask, today: string): string {
  if (task.status === 'blocked') return 'Blocked task';
  if (task.target_date && task.target_date < today) return 'Overdue task';
  if (!task.accountable_owner) return 'Needs an owner';
  if (task.status === 'in_progress') return 'In progress';

  return 'Conference task';
}

function taskTone(task: AnnualConferenceTask, today: string): MobileOrganizerNextAction['tone'] {
  if (task.status === 'blocked' || (task.target_date && task.target_date < today)) return 'urgent';
  if (task.status === 'in_progress' || !task.accountable_owner) return 'active';

  return 'upcoming';
}

function relevantEventAction(events: CommunityEvent[], now: Date): MobileOrganizerNextAction | null {
  const orderedEvents = [...events].sort(
    (first, second) => new Date(first.event_date).getTime() - new Date(second.event_date).getTime(),
  );
  const eventToday = orderedEvents.find((event) => isEventCheckInDay(event, now));

  if (eventToday) {
    const canCheckIn = Boolean(eventToday.registration_url && eventToday.external_source !== 'luma');

    return {
      id: `event-day-${eventToday.id}`,
      eyebrow: 'Event day',
      title: canCheckIn ? `Check in guests for ${eventToday.name}` : `Run ${eventToday.name}`,
      detail: canCheckIn ? 'Open the event-day guest list.' : 'Open the event workspace for today.',
      tone: 'active',
      target: canCheckIn
        ? { kind: 'check_in', eventId: eventToday.id }
        : { kind: 'event', eventId: eventToday.id },
    };
  }

  const nextEvent = orderedEvents.find((event) => (
    new Date(event.event_date).getTime() >= now.getTime()
    && resolveEventStatus(event, now.getTime()) !== 'completed'
  ));

  if (!nextEvent) return null;

  return {
    id: `next-event-${nextEvent.id}`,
    eyebrow: 'Next event',
    title: nextEvent.name,
    detail: nextEvent.event_date,
    tone: 'upcoming',
    target: { kind: 'event', eventId: nextEvent.id },
  };
}

export function mobileOrganizerNextActions({
  role,
  events,
  tasks,
  now = new Date(),
  limit = 3,
}: MobileOrganizerActionInput): MobileOrganizerNextAction[] {
  const today = accraDate(now);
  const actions: MobileOrganizerNextAction[] = [];

  if (role !== 'volunteer') {
    const eventAction = relevantEventAction(events, now);

    if (eventAction) actions.push(eventAction);
  }

  const taskActions = tasks
    .filter((task) => task.status !== 'done')
    .sort((first, second) => {
      const weightDifference = taskWeight(first, today) - taskWeight(second, today);

      if (weightDifference) return weightDifference;

      return (first.target_date ?? '9999-12-31').localeCompare(second.target_date ?? '9999-12-31')
        || first.sort_order - second.sort_order;
    })
    .map((task): MobileOrganizerNextAction => ({
      id: `conference-task-${task.id}`,
      eyebrow: taskEyebrow(task, today),
      title: task.title,
      detail: task.target_date ?? 'No target date',
      tone: taskTone(task, today),
      target: { kind: 'task', taskId: task.id },
    }));

  return [...actions, ...taskActions].slice(0, Math.max(0, limit));
}
