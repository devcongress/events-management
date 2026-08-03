import type { AdminRole } from '@/lib/supabase/admin-auth';

const ORGANIZER_ROLES: AdminRole[] = ['owner', 'organizer'];
const CONFERENCE_MEMBER_ROLES: AdminRole[] = ['owner', 'organizer', 'volunteer'];
const ANNUAL_WORK_PLAN_PATH = /^\/api\/annual-conference\/\d{4}\/work-plan$/;
const ANNUAL_TASK_PATH = /^\/api\/annual-conference\/\d{4}\/work-plan\/[^/]+$/;

export function adminRolesForApiRequest(path: string, method: string): AdminRole[] {
  if (method === 'GET' && ANNUAL_WORK_PLAN_PATH.test(path)) {
    return CONFERENCE_MEMBER_ROLES;
  }

  if (method === 'PATCH' && ANNUAL_TASK_PATH.test(path)) {
    return CONFERENCE_MEMBER_ROLES;
  }

  return ORGANIZER_ROLES;
}
