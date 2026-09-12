import { describe, expect, it } from 'vitest';
import type { AnnualConferenceTask } from '@/lib/annual-conference-work-plan';
import type { Event as CommunityEvent } from '@/types';
import { mobileOrganizerNextActions } from './mobile-organizer-actions';

const now = new Date('2026-09-26T12:00:00Z');

function event(overrides: Partial<CommunityEvent> = {}): CommunityEvent {
  return {
    id: 'event-1',
    name: 'September Meetup',
    description: null,
    event_date: '2026-09-26T09:00:00Z',
    end_date: '2026-09-26T16:00:00Z',
    status: 'upcoming',
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    timezone: 'Africa/Accra',
    registration_url: 'https://example.com/register',
    ...overrides,
  };
}

function task(overrides: Partial<AnnualConferenceTask> = {}): AnnualConferenceTask {
  return {
    id: 'task-1',
    edition_id: 'edition-1',
    title: 'Confirm the venue',
    details: null,
    internal_note: null,
    phase_id: 'phase-1',
    workstream: 'venue_production_logistics',
    accountable_owner: 'owner@example.com',
    collaborators: [],
    priority: 'medium',
    target_date: '2026-09-30',
    status: 'not_started',
    dependency_task_ids: [],
    dependency_note: null,
    source: 'manual',
    source_row: null,
    sort_order: 1,
    created_by_email: 'owner@example.com',
    updated_by_email: 'owner@example.com',
    completed_at: null,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    ...overrides,
  };
}

describe('mobile organizer next actions', () => {
  it('prioritizes native event-day check-in before conference work', () => {
    const actions = mobileOrganizerNextActions({
      role: 'organizer',
      events: [event()],
      tasks: [task()],
      now,
    });

    expect(actions[0]).toMatchObject({
      eyebrow: 'Event day',
      target: { kind: 'check_in', eventId: 'event-1' },
    });
    expect(actions[1]?.target).toEqual({ kind: 'task', taskId: 'task-1' });
  });

  it('never exposes event operations to volunteers', () => {
    const actions = mobileOrganizerNextActions({
      role: 'volunteer',
      events: [event()],
      tasks: [task()],
      now,
    });

    expect(actions).toHaveLength(1);
    expect(actions[0]?.target).toEqual({ kind: 'task', taskId: 'task-1' });
  });

  it('orders blocked, overdue, unassigned, and active work ahead of ordinary tasks', () => {
    const actions = mobileOrganizerNextActions({
      role: 'organizer',
      events: [],
      tasks: [
        task({ id: 'ordinary', sort_order: 5 }),
        task({ id: 'active', status: 'in_progress', sort_order: 4 }),
        task({ id: 'unassigned', accountable_owner: null, sort_order: 3 }),
        task({ id: 'overdue', target_date: '2026-09-20', sort_order: 2 }),
        task({ id: 'blocked', status: 'blocked', sort_order: 1 }),
      ],
      now,
      limit: 5,
    });

    expect(actions.map((action) => action.target)).toEqual([
      { kind: 'task', taskId: 'blocked' },
      { kind: 'task', taskId: 'overdue' },
      { kind: 'task', taskId: 'unassigned' },
      { kind: 'task', taskId: 'active' },
      { kind: 'task', taskId: 'ordinary' },
    ]);
  });

  it('uses the nearest unfinished event when today has no event', () => {
    const actions = mobileOrganizerNextActions({
      role: 'owner',
      events: [
        event({ id: 'past', event_date: '2026-09-20T09:00:00Z', end_date: '2026-09-20T16:00:00Z', status: 'draft' }),
        event({ id: 'next', event_date: '2026-10-03T09:00:00Z', end_date: '2026-10-03T16:00:00Z' }),
      ],
      tasks: [],
      now,
    });

    expect(actions[0]).toMatchObject({
      eyebrow: 'Next event',
      target: { kind: 'event', eventId: 'next' },
    });
  });
});
