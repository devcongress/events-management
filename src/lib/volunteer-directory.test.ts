import { describe, expect, it } from 'vitest';
import {
  buildVolunteerDirectoryRows,
  filterVolunteerDirectory,
  volunteerDirectoryActions,
  volunteerDirectoryAssignments,
  type VolunteerDirectoryRow,
  type VolunteerDirectorySearchRow,
} from './volunteer-directory';

const rows: VolunteerDirectorySearchRow[] = [
  {
    name: 'Abena Davidson',
    email: null,
    xHandle: null,
    slackName: null,
    status: 'active',
  },
  {
    name: 'Mariam Yakubu',
    email: 'mariam@example.com',
    xHandle: '@mariamyakubu',
    slackName: 'Mariam Y',
    status: 'applicant',
  },
];

describe('volunteer directory filtering', () => {
  it.each([
    ['name', 'yakubu'],
    ['email', 'MARIAM@EXAMPLE.COM'],
    ['X handle', '@mariamyak'],
    ['Slack name', 'mariam y'],
  ])('matches a volunteer by %s', (_field, search) => {
    expect(filterVolunteerDirectory(rows, { search, status: 'all' })).toEqual([rows[1]]);
  });

  it('combines lifecycle and contact search filters', () => {
    expect(filterVolunteerDirectory(rows, { search: 'mariam', status: 'active' })).toEqual([]);
    expect(filterVolunteerDirectory(rows, { search: 'mariam', status: 'applicant' })).toEqual([rows[1]]);
  });

  it('returns the complete selected lifecycle when search is blank', () => {
    expect(filterVolunteerDirectory(rows, { search: '   ', status: 'active' })).toEqual([rows[0]]);
  });

  it('merges applications with direct team members without duplicating active memberships', () => {
    const directory = buildVolunteerDirectoryRows([
      {
        id: 'application-1',
        membership_id: 'member-1',
        name: 'Mariam Yakubu',
        email: 'mariam@example.com',
        x_handle: '@mariamyakubu',
        slack_name: 'Mariam Y',
        created_at: '2026-09-10T10:00:00.000Z',
        status: 'active',
      },
    ], [
      { id: 'member-1', display_name: 'Mariam Yakubu' },
      { id: 'member-2', display_name: 'Abena Davidson' },
    ]);

    expect(directory).toHaveLength(2);
    expect(directory.map((row) => row.name)).toEqual(['Abena Davidson', 'Mariam Yakubu']);
    expect(directory.find((row) => row.name === 'Mariam Yakubu')?.email).toBe('mariam@example.com');
  });
});

describe('volunteer responsibility matching', () => {
  const volunteer: VolunteerDirectoryRow = {
    id: 'application-1',
    membershipId: 'member-1',
    name: 'Mariam Yakubu',
    email: 'mariam@example.com',
    xHandle: null,
    slackName: null,
    signedUpAt: null,
    status: 'active',
  };
  const task = (overrides: Partial<{
    id: string;
    title: string;
    status: string;
    accountable_owner: string | null;
    collaborators: string[];
  }> = {}) => ({
    id: 'task-1',
    title: 'Venue walkthrough',
    status: 'not_started',
    accountable_owner: null,
    collaborators: [],
    ...overrides,
  });

  it('finds work assigned by email, display name, or collaborator identity', () => {
    const tasks = [
      task({ id: 'email', accountable_owner: 'MARIAM@example.com' }),
      task({ id: 'name', accountable_owner: 'Mariam Yakubu' }),
      task({ id: 'collaborator', collaborators: ['mariam@example.com'] }),
      task({ id: 'other', accountable_owner: 'someone@example.com' }),
    ];

    expect(volunteerDirectoryAssignments(volunteer, tasks).map((item) => item.id))
      .toEqual(['email', 'name', 'collaborator']);
  });

  it('returns no assignments before a person is selected', () => {
    expect(volunteerDirectoryAssignments(null, [task()])).toEqual([]);
  });
});

describe('volunteer next actions', () => {
  const applicant: VolunteerDirectoryRow = {
    id: 'application:application-1',
    membershipId: null,
    name: 'Mariam Yakubu',
    email: 'mariam@example.com',
    xHandle: null,
    slackName: null,
    signedUpAt: '2026-09-10T10:00:00.000Z',
    status: 'applicant',
  };
  const options = {
    role: 'organizer' as const,
    year: '2026',
    canViewAllTasks: true,
    canAssignTasks: true,
    workPlanPath: '/conference/2026/work-plan',
    accessPath: '/people',
  };

  it('keeps access setup explicit and separate from assignment', () => {
    const actions = volunteerDirectoryActions(applicant, options);

    expect(actions.map((action) => action.label)).toEqual([
      'Review or assign work',
      'Set up workspace access',
    ]);
    expect(actions[1]?.href).toContain('volunteer_application=application-1');
    expect(actions[1]?.description).toContain('does not approve automatically');
  });

  it('does not expose organizer actions to volunteers', () => {
    expect(volunteerDirectoryActions(applicant, { ...options, role: 'volunteer' })).toEqual([]);
  });

  it('only lets owners manage an active member’s delegated responsibilities', () => {
    const active = { ...applicant, id: 'member:member-1', membershipId: 'member-1', status: 'active' as const };

    expect(volunteerDirectoryActions(active, options).some((action) => action.label === 'Manage responsibilities')).toBe(false);
    expect(volunteerDirectoryActions(active, { ...options, role: 'owner' }).at(-1)?.href)
      .toContain('member=member-1');
  });
});
