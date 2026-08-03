import { describe, expect, it } from 'vitest';
import { adminRolesForApiRequest } from './admin-api-access';

describe('admin API role policy', () => {
  it('admits volunteers only to assigned-work reads and task status updates', () => {
    expect(adminRolesForApiRequest('/api/annual-conference/2026/work-plan', 'GET')).toContain('volunteer');
    expect(adminRolesForApiRequest('/api/annual-conference/2026/work-plan/task-1', 'PATCH')).toContain('volunteer');
  });

  it('keeps conference task creation and organizer APIs organizer-only', () => {
    expect(adminRolesForApiRequest('/api/annual-conference/2026/work-plan', 'POST')).not.toContain('volunteer');
    expect(adminRolesForApiRequest('/api/admin/organizers', 'GET')).not.toContain('volunteer');
    expect(adminRolesForApiRequest('/api/admin/volunteer-applications', 'GET')).not.toContain('volunteer');
    expect(adminRolesForApiRequest('/api/events', 'GET')).toEqual(['owner', 'organizer']);
  });

  it('does not admit similarly prefixed or malformed paths', () => {
    expect(adminRolesForApiRequest('/api/annual-conference/2026/work-plan/export', 'GET')).not.toContain('volunteer');
    expect(adminRolesForApiRequest('/api/annual-conference/current/work-plan', 'GET')).not.toContain('volunteer');
  });
});
