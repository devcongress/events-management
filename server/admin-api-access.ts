import type { AdminRole } from '@/lib/supabase/admin-auth';
import { annualConferenceRolesForAdmission } from '@/lib/annual-conference-access';

const ORGANIZER_ROLES: AdminRole[] = annualConferenceRolesForAdmission('organizer');
const OWNER_ROLES: AdminRole[] = ['owner'];
const CONFERENCE_MEMBER_ROLES: AdminRole[] = annualConferenceRolesForAdmission('member');
const ANNUAL_WORK_PLAN_PATH = /^\/api\/annual-conference\/\d{4}\/work-plan$/;
const ANNUAL_TASK_PATH = /^\/api\/annual-conference\/\d{4}\/work-plan\/[^/]+$/;
const ANNUAL_CONFERENCE_DELEGATED_PATH = /^\/api\/annual-conference\/\d{4}\/(?:work-plan|phases(?:\/order|\/[^/]+)?|team|task-members|volunteer-applications)$/;
const MEMBERSHIP_ROLE_PATH = /^\/api\/admin\/organizers\/[^/]+\/role$/;
const MEMBERSHIP_ENABLE_PATH = /^\/api\/admin\/organizers\/[^/]+\/enable$/;
const MEMBERSHIP_PERMANENT_REMOVE_PATH = /^\/api\/admin\/organizers\/[^/]+\/permanent$/;
const LOGOUT_PATH = '/api/auth/logout';

export function adminRolesForApiRequest(path: string, method: string): AdminRole[] {
  if (method === 'POST' && path === LOGOUT_PATH) {
    return CONFERENCE_MEMBER_ROLES;
  }

  if (method === 'PATCH' && MEMBERSHIP_ROLE_PATH.test(path)) {
    return OWNER_ROLES;
  }

  if (
    (method === 'POST' && MEMBERSHIP_ENABLE_PATH.test(path))
    || (method === 'DELETE' && MEMBERSHIP_PERMANENT_REMOVE_PATH.test(path))
  ) {
    return OWNER_ROLES;
  }

  if (method === 'GET' && ANNUAL_WORK_PLAN_PATH.test(path)) {
    return CONFERENCE_MEMBER_ROLES;
  }

  if (method === 'PATCH' && ANNUAL_TASK_PATH.test(path)) {
    return CONFERENCE_MEMBER_ROLES;
  }

  if (ANNUAL_CONFERENCE_DELEGATED_PATH.test(path)) {
    return CONFERENCE_MEMBER_ROLES;
  }

  return ORGANIZER_ROLES;
}
