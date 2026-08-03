import { describe, expect, it } from 'vitest';
import {
  ANNUAL_CONFERENCE_2026_EDITION,
  ANNUAL_CONFERENCE_2026_PHASES,
  ANNUAL_CONFERENCE_2026_SEED_TASKS,
  ANNUAL_CONFERENCE_TASK_CREATOR_EMAIL,
  ANNUAL_CONFERENCE_TASK_STATUSES,
  annualConferenceOwnershipNeedsActiveOrganizerLookup,
  calculateAnnualConferenceHealth,
  canCreateAnnualConferenceTask,
  canManageAnnualConferencePlanning,
  defaultAnnualConferencePhaseScope,
  filterAnnualConferenceTasksByPhase,
  summarizeAnnualConferenceWorkPlan,
  validateAnnualConferenceTaskOwnership,
  validateAnnualConferencePhaseDates,
  validateAnnualConferenceTaskSchedule,
} from './annual-conference-work-plan';

describe('annual conference work plan', () => {
  it('seeds the 26 spreadsheet rows and the Phase 1 volunteer recruitment task once', () => {
    expect(ANNUAL_CONFERENCE_2026_SEED_TASKS).toHaveLength(27);
    expect(new Set(ANNUAL_CONFERENCE_2026_SEED_TASKS.map((task) => task.source_row)).size).toBe(27);
    expect(ANNUAL_CONFERENCE_2026_EDITION.provisional_date).toBe('2026-12-19');
    expect(ANNUAL_CONFERENCE_2026_EDITION.date_status).toBe('provisional');
  });

  it('uses exactly the four approved statuses', () => {
    expect(ANNUAL_CONFERENCE_TASK_STATUSES).toEqual([
      'not_started',
      'in_progress',
      'blocked',
      'done',
    ]);
  });

  it('seeds the fixed 2026 phases and the confirmed Phase 1 work', () => {
    expect(ANNUAL_CONFERENCE_2026_PHASES.map((phase) => ({
      name: phase.name,
      starts_on: phase.starts_on,
      ends_on: phase.ends_on,
    }))).toEqual([
      { name: 'Phase 1', starts_on: '2026-08-01', ends_on: '2026-08-31' },
      { name: 'Phase 2', starts_on: '2026-09-01', ends_on: '2026-12-19' },
    ]);
    expect(ANNUAL_CONFERENCE_2026_SEED_TASKS
      .filter((task) => task.phase_id === ANNUAL_CONFERENCE_2026_PHASES[0].id)
      .map((task) => task.title)).toEqual([
      'Venue',
      'Keynote speaker(s)',
      'Call for Speakers (announce)',
      'Call for Volunteers',
      'Flyer Designs',
      'Backdrop/Stage Designs',
      'Website/Registration Page',
      'Sponsorship Packages',
      'Call for sponsors and partners',
      'Photography',
      'Videography/Livestream',
      'Volunteer recruitment',
    ]);
    expect(ANNUAL_CONFERENCE_2026_SEED_TASKS.filter((task) => task.phase_id === null)).toHaveLength(15);
  });

  it('defaults phase-scoped views to the current delivery phase', () => {
    expect(defaultAnnualConferencePhaseScope(ANNUAL_CONFERENCE_2026_PHASES, '2026-08-03'))
      .toBe(ANNUAL_CONFERENCE_2026_PHASES[0].id);
    expect(defaultAnnualConferencePhaseScope(ANNUAL_CONFERENCE_2026_PHASES, '2026-10-01'))
      .toBe(ANNUAL_CONFERENCE_2026_PHASES[1].id);
    expect(defaultAnnualConferencePhaseScope(ANNUAL_CONFERENCE_2026_PHASES, '2026-07-01'))
      .toBe(ANNUAL_CONFERENCE_2026_PHASES[0].id);
  });

  it('uses the same phase scope for every page-level task calculation', () => {
    expect(filterAnnualConferenceTasksByPhase(
      ANNUAL_CONFERENCE_2026_SEED_TASKS,
      ANNUAL_CONFERENCE_2026_PHASES[0].id,
    )).toHaveLength(12);
    expect(filterAnnualConferenceTasksByPhase(ANNUAL_CONFERENCE_2026_SEED_TASKS, 'unassigned')).toHaveLength(15);
    expect(filterAnnualConferenceTasksByPhase(ANNUAL_CONFERENCE_2026_SEED_TASKS, 'all')).toHaveLength(27);
  });

  it('makes the first listed owner accountable and the rest collaborators', () => {
    const venue = ANNUAL_CONFERENCE_2026_SEED_TASKS.find((task) => task.title === 'Venue');
    const sponsorship = ANNUAL_CONFERENCE_2026_SEED_TASKS.find((task) => task.title === 'Sponsorship Packages');
    const theme = ANNUAL_CONFERENCE_2026_SEED_TASKS.find((task) => task.title === 'Theme');

    expect(venue).toMatchObject({
      accountable_owner: 'Elijah',
      collaborators: ['Elvis'],
    });
    expect(sponsorship).toMatchObject({
      accountable_owner: 'Dede',
      collaborators: ['Angela', 'Philipa'],
    });
    expect(theme).toMatchObject({
      accountable_owner: null,
      collaborators: [],
    });
  });

  it('treats the live volunteer form as done without collapsing later volunteer work', () => {
    const volunteerForm = ANNUAL_CONFERENCE_2026_SEED_TASKS.find(
      (task) => task.title === 'Volunteer Submission Form (Website)',
    );

    expect(volunteerForm?.status).toBe('done');
    expect(volunteerForm?.details).toContain('review, assignment, briefing, and communications');
  });

  it('allows only the named organizer to add tasks', () => {
    expect(canCreateAnnualConferenceTask(ANNUAL_CONFERENCE_TASK_CREATOR_EMAIL)).toBe(true);
    expect(canCreateAnnualConferenceTask('  ANGELATEYVI@GMAIL.COM ')).toBe(true);
    expect(canCreateAnnualConferenceTask('another-organizer@devcongress.org')).toBe(false);
    expect(canCreateAnnualConferenceTask(null)).toBe(false);
    expect(canCreateAnnualConferenceTask('new-owner@devcongress.org', 'new-owner@devcongress.org')).toBe(true);
    expect(canManageAnnualConferencePlanning('ANGELA@DEVCONGRESS.ORG', 'angela@devcongress.org')).toBe(true);
  });

  it('rejects overlapping phases and target dates beyond a selected phase', () => {
    expect(validateAnnualConferencePhaseDates({
      starts_on: '2026-08-15',
      ends_on: '2026-09-15',
    }, ANNUAL_CONFERENCE_2026_PHASES)).toBe('Phase dates cannot overlap another phase.');

    expect(validateAnnualConferenceTaskSchedule({
      phase_id: ANNUAL_CONFERENCE_2026_PHASES[0].id,
      target_date: '2026-09-01',
    }, ANNUAL_CONFERENCE_2026_PHASES)).toContain('on or before 2026-08-31');

    expect(validateAnnualConferenceTaskSchedule({
      phase_id: ANNUAL_CONFERENCE_2026_PHASES[1].id,
      target_date: null,
    }, ANNUAL_CONFERENCE_2026_PHASES)).toBeNull();
    expect(validateAnnualConferenceTaskSchedule({ phase_id: null, target_date: null }, ANNUAL_CONFERENCE_2026_PHASES)).toBeNull();
  });

  it('normalizes ownership emails and deduplicates collaborators case-insensitively', () => {
    const result = validateAnnualConferenceTaskOwnership(
      {
        accountable_owner: ' ANGELA@DEVCONGRESS.ORG ',
        collaborators: [
          'elijah@devcongress.org',
          ' ELIJAH@DEVCONGRESS.ORG ',
          'elvis@devcongress.org',
        ],
      },
      [
        'angela@devcongress.org',
        'elijah@devcongress.org',
        'elvis@devcongress.org',
      ],
    );

    expect(result).toEqual({
      ok: true,
      value: {
        accountable_owner: 'angela@devcongress.org',
        collaborators: [
          'elijah@devcongress.org',
          'elvis@devcongress.org',
        ],
      },
    });
  });

  it('rejects inactive accountable owners and collaborators', () => {
    const inactiveOwner = validateAnnualConferenceTaskOwnership(
      {
        accountable_owner: 'inactive@devcongress.org',
        collaborators: [],
      },
      ['angela@devcongress.org'],
    );
    const inactiveCollaborator = validateAnnualConferenceTaskOwnership(
      {
        accountable_owner: 'angela@devcongress.org',
        collaborators: ['inactive@devcongress.org'],
      },
      ['angela@devcongress.org'],
    );

    expect(inactiveOwner).toEqual({
      ok: false,
      error: '"inactive@devcongress.org" is not an active organizer and cannot be the accountable owner.',
    });
    expect(inactiveCollaborator).toEqual({
      ok: false,
      error: 'These collaborators are not active organizers: inactive@devcongress.org.',
    });
  });

  it('rejects an accountable owner who is also a collaborator', () => {
    expect(validateAnnualConferenceTaskOwnership(
      {
        accountable_owner: 'angela@devcongress.org',
        collaborators: ['ANGELA@DEVCONGRESS.ORG'],
      },
      ['angela@devcongress.org'],
    )).toEqual({
      ok: false,
      error: 'The accountable owner cannot also be a collaborator.',
    });
  });

  it('preserves unchanged legacy name assignments without an organizer lookup', () => {
    const sponsorship = ANNUAL_CONFERENCE_2026_SEED_TASKS.find((task) => task.title === 'Sponsorship Packages');
    expect(sponsorship).toBeDefined();

    const update = {
      title: 'Sponsorship package shortlist',
      accountable_owner: ' dede ',
      collaborators: ['PHILIPA', 'Angela', 'philipa'],
    };

    expect(annualConferenceOwnershipNeedsActiveOrganizerLookup(update, sponsorship)).toBe(false);
    expect(validateAnnualConferenceTaskOwnership(update, [], sponsorship)).toEqual({
      ok: true,
      value: {
        title: 'Sponsorship package shortlist',
        accountable_owner: 'Dede',
        collaborators: ['Angela', 'Philipa'],
      },
    });
  });

  it('requires active organizer verification when a legacy assignment changes', () => {
    const venue = ANNUAL_CONFERENCE_2026_SEED_TASKS.find((task) => task.title === 'Venue');
    expect(venue).toBeDefined();

    const update = {
      accountable_owner: 'new-owner@devcongress.org',
      collaborators: ['elijah@devcongress.org', 'ELIJAH@DEVCONGRESS.ORG'],
    };

    expect(annualConferenceOwnershipNeedsActiveOrganizerLookup(update, venue)).toBe(true);
    expect(validateAnnualConferenceTaskOwnership(
      update,
      ['new-owner@devcongress.org', 'elijah@devcongress.org'],
      venue,
    )).toEqual({
      ok: true,
      value: {
        accountable_owner: 'new-owner@devcongress.org',
        collaborators: ['elijah@devcongress.org'],
      },
    });
  });

  it('allows a legacy collaborator to remain while another legacy collaborator is removed', () => {
    const sponsorship = ANNUAL_CONFERENCE_2026_SEED_TASKS.find((task) => task.title === 'Sponsorship Packages');
    expect(sponsorship).toBeDefined();

    const update = {
      collaborators: ['PHILIPA'],
    };

    expect(annualConferenceOwnershipNeedsActiveOrganizerLookup(update, sponsorship)).toBe(false);
    expect(validateAnnualConferenceTaskOwnership(update, [], sponsorship)).toEqual({
      ok: true,
      value: {
        collaborators: ['Philipa'],
      },
    });
  });

  it('summarizes the imported starting point', () => {
    expect(summarizeAnnualConferenceWorkPlan(ANNUAL_CONFERENCE_2026_SEED_TASKS)).toEqual({
      total: 27,
      done: 2,
      in_progress: 0,
      blocked: 0,
      not_started: 25,
      unassigned: 15,
      completion_percent: 7,
    });
  });

  it('keeps readiness in planning mode while dates or phase assignments are missing', () => {
    const snapshot = calculateAnnualConferenceHealth(
      ANNUAL_CONFERENCE_2026_SEED_TASKS,
      ANNUAL_CONFERENCE_2026_PHASES,
      '2026-08-02',
    );

    expect(snapshot).toMatchObject({
      readiness: 'needs_planning',
      total: 27,
      done: 2,
      completion_percent: 7,
      scheduled: 0,
      classified: 12,
      planning_confidence_percent: 30,
      overdue: 0,
      due_soon: 0,
    });
    expect(snapshot.phase_health).toEqual([
      {
        phase_id: ANNUAL_CONFERENCE_2026_PHASES[0].id,
        total: 12,
        done: 0,
        completion_percent: 0,
        time_elapsed_percent: 6,
      },
      {
        phase_id: ANNUAL_CONFERENCE_2026_PHASES[1].id,
        total: 0,
        done: 0,
        completion_percent: 0,
        time_elapsed_percent: 0,
      },
    ]);
  });

  it('marks a fully planned schedule off track when unfinished work is overdue', () => {
    const tasks = ANNUAL_CONFERENCE_2026_SEED_TASKS.slice(0, 2).map((task, index) => ({
      ...task,
      phase_id: ANNUAL_CONFERENCE_2026_PHASES[0].id,
      accountable_owner: 'Angela',
      target_date: index === 0 ? '2026-08-01' : '2026-08-08',
      status: index === 0 ? 'not_started' as const : 'in_progress' as const,
    }));

    expect(calculateAnnualConferenceHealth(tasks, ANNUAL_CONFERENCE_2026_PHASES, '2026-08-02')).toMatchObject({
      readiness: 'off_track',
      scheduled: 2,
      classified: 2,
      assigned: 2,
      planning_confidence_percent: 100,
      overdue: 1,
      due_soon: 1,
    });
  });
});
