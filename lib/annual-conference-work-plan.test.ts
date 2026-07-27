import { describe, expect, it } from 'vitest';
import {
  ANNUAL_CONFERENCE_2026_EDITION,
  ANNUAL_CONFERENCE_2026_SEED_TASKS,
  ANNUAL_CONFERENCE_TASK_CREATOR_EMAIL,
  ANNUAL_CONFERENCE_TASK_STATUSES,
  annualConferenceOwnershipNeedsActiveOrganizerLookup,
  canCreateAnnualConferenceTask,
  summarizeAnnualConferenceWorkPlan,
  validateAnnualConferenceTaskOwnership,
} from './annual-conference-work-plan';

describe('annual conference work plan', () => {
  it('seeds the 26 non-empty spreadsheet rows once', () => {
    expect(ANNUAL_CONFERENCE_2026_SEED_TASKS).toHaveLength(26);
    expect(new Set(ANNUAL_CONFERENCE_2026_SEED_TASKS.map((task) => task.source_row)).size).toBe(26);
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

  it('makes the first listed owner accountable and the rest collaborators', () => {
    const venue = ANNUAL_CONFERENCE_2026_SEED_TASKS.find((task) => task.title === 'Venue');
    const sponsorship = ANNUAL_CONFERENCE_2026_SEED_TASKS.find((task) => task.title === 'Sponsorship Packages');
    const theme = ANNUAL_CONFERENCE_2026_SEED_TASKS.find((task) => task.title === 'Theme');

    expect(venue).toMatchObject({
      accountable_owner: 'Angela',
      collaborators: ['Elijah', 'Elvis'],
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
    const venue = ANNUAL_CONFERENCE_2026_SEED_TASKS.find((task) => task.title === 'Venue');
    expect(venue).toBeDefined();

    const update = {
      title: 'Venue shortlist',
      accountable_owner: ' angela ',
      collaborators: ['ELVIS', 'Elijah', 'elvis'],
    };

    expect(annualConferenceOwnershipNeedsActiveOrganizerLookup(update, venue)).toBe(false);
    expect(validateAnnualConferenceTaskOwnership(update, [], venue)).toEqual({
      ok: true,
      value: {
        title: 'Venue shortlist',
        accountable_owner: 'Angela',
        collaborators: ['Elijah', 'Elvis'],
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
    const venue = ANNUAL_CONFERENCE_2026_SEED_TASKS.find((task) => task.title === 'Venue');
    expect(venue).toBeDefined();

    const update = {
      collaborators: ['ELIJAH'],
    };

    expect(annualConferenceOwnershipNeedsActiveOrganizerLookup(update, venue)).toBe(false);
    expect(validateAnnualConferenceTaskOwnership(update, [], venue)).toEqual({
      ok: true,
      value: {
        collaborators: ['Elijah'],
      },
    });
  });

  it('summarizes the imported starting point', () => {
    expect(summarizeAnnualConferenceWorkPlan(ANNUAL_CONFERENCE_2026_SEED_TASKS)).toEqual({
      total: 26,
      done: 2,
      in_progress: 0,
      blocked: 0,
      not_started: 24,
      unassigned: 11,
      completion_percent: 8,
    });
  });
});
