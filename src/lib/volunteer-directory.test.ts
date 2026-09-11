import { describe, expect, it } from 'vitest';
import { buildVolunteerDirectoryRows, filterVolunteerDirectory, type VolunteerDirectorySearchRow } from './volunteer-directory';

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
