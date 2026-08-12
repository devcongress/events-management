import { describe, expect, it } from 'vitest';
import { adminRolesForApiRequest } from './admin-api-access';

describe('admin API role policy', () => {
  it('admits volunteers only to assigned-work reads and task status updates', () => {
    expect(adminRolesForApiRequest('/api/annual-conference/2026/work-plan', 'GET')).toContain('volunteer');
    expect(adminRolesForApiRequest('/api/annual-conference/2026/work-plan/task-1', 'PATCH')).toContain('volunteer');
    expect(adminRolesForApiRequest('/api/auth/logout', 'POST')).toContain('volunteer');
  });

  it('admits conference members to capability-gated conference operations only', () => {
    expect(adminRolesForApiRequest('/api/annual-conference/2026/work-plan', 'POST')).toContain('volunteer');
    expect(adminRolesForApiRequest('/api/annual-conference/2026/phases', 'POST')).toContain('volunteer');
    expect(adminRolesForApiRequest('/api/annual-conference/2026/volunteer-applications', 'GET')).toContain('volunteer');
    expect(adminRolesForApiRequest('/api/admin/organizers', 'GET')).not.toContain('volunteer');
    expect(adminRolesForApiRequest('/api/admin/volunteer-applications', 'GET')).not.toContain('volunteer');
    expect(adminRolesForApiRequest('/api/events', 'GET')).toEqual(['owner', 'organizer']);
    expect(adminRolesForApiRequest('/api/annual-conference/2026/finance', 'GET')).toEqual(['owner', 'organizer']);
    expect(adminRolesForApiRequest('/api/annual-conference/2026/finance', 'GET')).not.toContain('volunteer');
    expect(adminRolesForApiRequest('/api/events/event-1/finance', 'GET')).toEqual(['owner', 'organizer']);
    expect(adminRolesForApiRequest('/api/events/event-1/finance', 'GET')).not.toContain('volunteer');
    expect(adminRolesForApiRequest('/api/events/event-1/finance/categories', 'POST')).toEqual(['owner', 'organizer']);
    expect(adminRolesForApiRequest('/api/events/event-1/finance/categories', 'POST')).not.toContain('volunteer');
    expect(adminRolesForApiRequest('/api/events/event-1/finance/expenses', 'POST')).toEqual(['owner', 'organizer']);
    expect(adminRolesForApiRequest('/api/events/event-1/finance/expenses', 'POST')).not.toContain('volunteer');
    expect(adminRolesForApiRequest('/api/events/event-1/finance/expenses/expense-1', 'PATCH')).toEqual(['owner', 'organizer']);
    expect(adminRolesForApiRequest('/api/events/event-1/finance/expenses/expense-1', 'PATCH')).not.toContain('volunteer');
    expect(adminRolesForApiRequest('/api/events/event-1/registrations/registration-1/check-in', 'POST')).toEqual(['owner', 'organizer']);
    expect(adminRolesForApiRequest('/api/events/event-1/registrations/registration-1/check-in', 'DELETE')).toEqual(['owner', 'organizer']);
    expect(adminRolesForApiRequest('/api/events/event-1/registrations/registration-1/check-in', 'DELETE')).not.toContain('volunteer');
  });

  it('keeps existing member role changes owner-only', () => {
    expect(adminRolesForApiRequest('/api/admin/organizers/member-1/role', 'PATCH')).toEqual(['owner']);
    expect(adminRolesForApiRequest('/api/admin/organizers/member-1/role', 'GET')).toEqual(['owner', 'organizer']);
    expect(adminRolesForApiRequest('/api/admin/organizers/member-1/enable', 'POST')).toEqual(['owner']);
    expect(adminRolesForApiRequest('/api/admin/organizers/member-1/permanent', 'DELETE')).toEqual(['owner']);
  });

  it('keeps permanent guest removal owner-only', () => {
    expect(adminRolesForApiRequest('/api/events/event-1/registrations/registration-1', 'DELETE')).toEqual(['owner']);
    expect(adminRolesForApiRequest('/api/events/event-1/registrations/registration-1', 'DELETE')).not.toContain('organizer');
    expect(adminRolesForApiRequest('/api/events/event-1/registrations/registration-1', 'DELETE')).not.toContain('volunteer');
    expect(adminRolesForApiRequest('/api/events/event-1/registrations/registration-1', 'GET')).toEqual(['owner', 'organizer']);
  });

  it('keeps event removal and restore owner-only', () => {
    expect(adminRolesForApiRequest('/api/events/event-1', 'DELETE')).toEqual(['owner']);
    expect(adminRolesForApiRequest('/api/events/event-1', 'DELETE')).not.toContain('organizer');
    expect(adminRolesForApiRequest('/api/events/event-1', 'DELETE')).not.toContain('volunteer');
    expect(adminRolesForApiRequest('/api/events/event-1/restore', 'POST')).toEqual(['owner']);
    expect(adminRolesForApiRequest('/api/events/event-1/restore', 'POST')).not.toContain('organizer');
    expect(adminRolesForApiRequest('/api/events/event-1/restore', 'POST')).not.toContain('volunteer');
    expect(adminRolesForApiRequest('/api/events/event-1/restore', 'GET')).toEqual(['owner', 'organizer']);
    expect(adminRolesForApiRequest('/api/admin/archived-events', 'GET')).toEqual(['owner']);
    expect(adminRolesForApiRequest('/api/admin/archived-events', 'GET')).not.toContain('organizer');
  });

  it('does not admit similarly prefixed or malformed paths', () => {
    expect(adminRolesForApiRequest('/api/annual-conference/2026/work-plan/export', 'GET')).not.toContain('volunteer');
    expect(adminRolesForApiRequest('/api/annual-conference/current/work-plan', 'GET')).not.toContain('volunteer');
    expect(adminRolesForApiRequest('/api/auth/logout/other', 'POST')).not.toContain('volunteer');
    expect(adminRolesForApiRequest('/api/auth/logout', 'GET')).not.toContain('volunteer');
  });
});
