import type { AdminRole } from "@/lib/supabase/admin-auth";
import { annualConferenceRolesForAdmission } from "@/lib/annual-conference-access";

const ORGANIZER_ROLES: AdminRole[] =
  annualConferenceRolesForAdmission("organizer");
const OWNER_ROLES: AdminRole[] = ["owner"];
const CONFERENCE_MEMBER_ROLES: AdminRole[] =
  annualConferenceRolesForAdmission("member");
const ANNUAL_WORK_PLAN_PATH = /^\/api\/annual-conference\/\d{4}\/work-plan$/;
const ANNUAL_TASK_PATH = /^\/api\/annual-conference\/\d{4}\/work-plan\/[^/]+$/;
const ANNUAL_TASK_RESOURCES_PATH =
  /^\/api\/annual-conference\/\d{4}\/work-plan\/[^/]+\/resources(?:\/[^/]+)?$/;
const ANNUAL_CONFERENCE_DELEGATED_PATH =
  /^\/api\/annual-conference\/\d{4}\/(?:work-plan|phases(?:\/order|\/[^/]+)?|team|task-members|volunteer-applications)$/;
const VOLUNTEER_FOLLOW_UP_REVIEW_PATH =
  /^\/api\/annual-conference\/2026\/volunteer-follow-up\/reviews$/;
const VOLUNTEER_FOLLOW_UP_REVIEW_UPDATE_PATH =
  /^\/api\/annual-conference\/2026\/volunteer-follow-up\/recipients\/[^/]+\/review$/;
const VOLUNTEER_FOLLOW_UP_OWNER_PATH =
  /^\/api\/annual-conference\/2026\/volunteer-follow-up(?:\/preview|\/settings|\/control)?$/;
const MEMBERSHIP_ROLE_PATH = /^\/api\/admin\/organizers\/[^/]+\/role$/;
const MEMBERSHIP_ENABLE_PATH = /^\/api\/admin\/organizers\/[^/]+\/enable$/;
const MEMBERSHIP_PERMANENT_REMOVE_PATH =
  /^\/api\/admin\/organizers\/[^/]+\/permanent$/;
const RESTRICTED_CONFERENCE_ROLES: AdminRole[] = ['owner', 'organizer', 'volunteer', 'member'];
// These route families enforce their precise edition capability in their handlers.
const DELEGATED_CONFERENCE_PATH = /^\/api\/annual-conference\/\d{4}\/(?:programme|speaker-outcomes|speaker-updates|speakers|speaker-submissions|speaker-headshots|volunteer-follow-up|phases|registrations)(?:\/.*)?$/;
const DELEGATED_TICKETING_PATH = /^\/api\/annual-conference\/\d{4}\/ticketing\/(?:test-coupons|complimentary|flexible)(?:\/.*)?$/;
const RESTRICTED_READ_PATH = /^\/api\/annual-conference\/\d{4}\/(?:work-plan(?:\/[^/]+\/resources)?|task-members|team|volunteer-applications|volunteer-follow-up\/reviews|speakers|speaker-headshots\/[^/]+\/photo|finance|ticketing(?:\/(?:orders|sponsor-allocations|email-deliveries))?|registrations|check-in\/attendees)$/;
const RESTRICTED_WRITE_PATHS = [
  ['POST', /^\/api\/annual-conference\/\d{4}\/(?:work-plan(?:\/[^/]+\/resources)?|registrations\/[^/]+\/cancel|check-in\/(?:search|admit)|ticketing\/(?:check-in|sponsor-allocations|email-deliveries\/[^/]+\/retry|orders\/[^/]+\/paystack-check))$/],
  ['PATCH', /^\/api\/annual-conference\/\d{4}\/(?:work-plan\/[^/]+(?:\/resources\/[^/]+)?|volunteer-follow-up\/recipients\/[^/]+\/review|speakers\/(?:call|logistics-deadline)|speaker-submissions\/[^/]+|ticketing\/(?:capacity|prices))$/],
  ['DELETE', /^\/api\/annual-conference\/\d{4}\/work-plan\/[^/]+(?:\/resources\/[^/]+)?$/],
] as const;
const LOGOUT_PATH = "/api/auth/logout";
const EVENT_DELETE_PATH = /^\/api\/events\/[^/]+$/;
const EVENT_RESTORE_PATH = /^\/api\/events\/[^/]+\/restore$/;
const ARCHIVED_EVENTS_PATH = "/api/admin/archived-events";
const EMAIL_PREVIEWS_PATH = "/api/admin/email-previews";
const EMAIL_PREVIEW_DOCUMENT_PATH =
  /^\/api\/admin\/email-previews\/[^/]+\/html$/;
const EMAIL_PREVIEW_SEND_PATH = /^\/api\/admin\/email-previews\/[^/]+\/send-test$/;
const EVENT_REGISTRATION_PERMANENT_REMOVE_PATH =
  /^\/api\/events\/[^/]+\/registrations\/[^/]+$/;
const MONTHLY_MEETUP_FINANCE_READ_PATH = /^\/api\/events\/[^/]+\/finance$/;
const MONTHLY_MEETUP_FINANCE_CATEGORY_CREATE_PATH =
  /^\/api\/events\/[^/]+\/finance\/categories$/;
const MONTHLY_MEETUP_FINANCE_CREATE_PATH =
  /^\/api\/events\/[^/]+\/finance\/expenses$/;
const MONTHLY_MEETUP_FINANCE_UPDATE_PATH =
  /^\/api\/events\/[^/]+\/finance\/expenses\/[^/]+$/;
const SELECTED_SPEAKER_EMAIL_TEST_PATH =
  /^\/api\/events\/[^/]+\/selected-speaker-emails\/test$/;
const OWNER_TEST_SPEAKER_SUBMISSION_PATH =
  /^\/api\/events\/[^/]+\/speaker-submissions\/test$/;
const ACCESS_REQUEST_DECISION_PATH =
  /^\/api\/admin\/access-requests\/[^/]+\/(approve|decline)$/;

export function adminRolesForApiRequest(
  path: string,
  method: string,
): AdminRole[] {
  if ((method === 'PATCH' && VOLUNTEER_FOLLOW_UP_REVIEW_PATH.test(path))
    || (method === 'GET' && VOLUNTEER_FOLLOW_UP_REVIEW_UPDATE_PATH.test(path))) {
    return ORGANIZER_ROLES;
  }
  if ((DELEGATED_CONFERENCE_PATH.test(path) || DELEGATED_TICKETING_PATH.test(path)) && ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) {
    return RESTRICTED_CONFERENCE_ROLES;
  }
  if ((method === 'GET' && /^\/api\/annual-conference\/\d{4}\/(?:registrations(?:\/blasts)?|ticketing\/(?:capacity|email-deliveries|flexible\/community-pool(?:\/purchases)?))$/.test(path))
    || (method === 'PATCH' && /^\/api\/annual-conference\/\d{4}\/(?:registrations\/settings|ticketing\/capacity)$/.test(path))
    || (method === 'POST' && /^\/api\/annual-conference\/\d{4}\/(?:registrations\/(?:[^/]+\/(?:cancel|recover)|blasts(?:\/[^/]+\/send)?)|ticketing\/(?:email-deliveries\/[^/]+\/retry|flexible\/community-pool\/assign))$/.test(path))) {
    return RESTRICTED_CONFERENCE_ROLES;
  }
  if (method === 'POST' && path === LOGOUT_PATH) return RESTRICTED_CONFERENCE_ROLES;
  if (method === 'GET' && (path === '/api/annual-conference/my-access' || RESTRICTED_READ_PATH.test(path))) {
    return [...adminRolesForLegacyApiRequest(path, method), 'member'];
  }
  if (RESTRICTED_WRITE_PATHS.some(([verb, pattern]) => method === verb && pattern.test(path))) {
    return [...adminRolesForLegacyApiRequest(path, method), 'member'];
  }

  return adminRolesForLegacyApiRequest(path, method);
}

function adminRolesForLegacyApiRequest(path: string, method: string): AdminRole[] {
  if (method === "GET" && /^\/api\/annual-conference\/\d{4}\/check-in\/attendees$/.test(path)) {
    return CONFERENCE_MEMBER_ROLES;
  }

  if (method === 'POST' && /^\/api\/annual-conference\/\d{4}\/(?:ticketing\/check-in|check-in\/(?:search|admit))$/.test(path)) {
    return CONFERENCE_MEMBER_ROLES;
  }
  if (
    (method === 'GET' && path === '/api/admin/access-requests')
    || (method === 'POST' && ACCESS_REQUEST_DECISION_PATH.test(path))
  ) {
    return OWNER_ROLES;
  }
  if (path === "/api/admin/presentation-forms") {
    return OWNER_ROLES;
  }

  if (
    method === "POST" &&
    (SELECTED_SPEAKER_EMAIL_TEST_PATH.test(path) ||
      OWNER_TEST_SPEAKER_SUBMISSION_PATH.test(path))
  ) {
    return OWNER_ROLES;
  }

  if (method === "DELETE" && EVENT_DELETE_PATH.test(path)) {
    return OWNER_ROLES;
  }

  if (method === "POST" && EVENT_RESTORE_PATH.test(path)) {
    return OWNER_ROLES;
  }

  if (method === "GET" && path === ARCHIVED_EVENTS_PATH) {
    return OWNER_ROLES;
  }

  if (
    method === "GET" &&
    (path === EMAIL_PREVIEWS_PATH || EMAIL_PREVIEW_DOCUMENT_PATH.test(path))
  ) {
    return OWNER_ROLES;
  }

  if (method === "POST" && EMAIL_PREVIEW_SEND_PATH.test(path)) {
    return OWNER_ROLES;
  }

  if (
    (method === "GET" && VOLUNTEER_FOLLOW_UP_OWNER_PATH.test(path)) ||
    (method === "PATCH" &&
      path === "/api/annual-conference/2026/volunteer-follow-up/settings") ||
    (method === "POST" &&
      path === "/api/annual-conference/2026/volunteer-follow-up/control")
  ) {
    return OWNER_ROLES;
  }

  if (method === "GET" && MONTHLY_MEETUP_FINANCE_READ_PATH.test(path)) {
    return ORGANIZER_ROLES;
  }

  if (
    method === "POST" &&
    MONTHLY_MEETUP_FINANCE_CATEGORY_CREATE_PATH.test(path)
  ) {
    return ORGANIZER_ROLES;
  }

  if (method === "POST" && MONTHLY_MEETUP_FINANCE_CREATE_PATH.test(path)) {
    return ORGANIZER_ROLES;
  }

  if (method === "PATCH" && MONTHLY_MEETUP_FINANCE_UPDATE_PATH.test(path)) {
    return ORGANIZER_ROLES;
  }

  if (
    method === "DELETE" &&
    EVENT_REGISTRATION_PERMANENT_REMOVE_PATH.test(path)
  ) {
    return OWNER_ROLES;
  }

  if (method === "POST" && path === LOGOUT_PATH) {
    return CONFERENCE_MEMBER_ROLES;
  }

  if (method === "PATCH" && MEMBERSHIP_ROLE_PATH.test(path)) {
    return OWNER_ROLES;
  }

  if (
    (method === "POST" && MEMBERSHIP_ENABLE_PATH.test(path)) ||
    (method === "DELETE" && MEMBERSHIP_PERMANENT_REMOVE_PATH.test(path))
  ) {
    return OWNER_ROLES;
  }

  if (method === "GET" && ANNUAL_WORK_PLAN_PATH.test(path)) {
    return CONFERENCE_MEMBER_ROLES;
  }

  if (method === "PATCH" && ANNUAL_TASK_PATH.test(path)) {
    return CONFERENCE_MEMBER_ROLES;
  }

  if (
    ANNUAL_TASK_RESOURCES_PATH.test(path) &&
    ["GET", "POST", "PATCH", "DELETE"].includes(method)
  ) {
    return CONFERENCE_MEMBER_ROLES;
  }

  if (ANNUAL_CONFERENCE_DELEGATED_PATH.test(path)) {
    return CONFERENCE_MEMBER_ROLES;
  }

  if (
    (method === "GET" && VOLUNTEER_FOLLOW_UP_REVIEW_PATH.test(path)) ||
    (method === "PATCH" && VOLUNTEER_FOLLOW_UP_REVIEW_UPDATE_PATH.test(path))
  ) {
    return CONFERENCE_MEMBER_ROLES;
  }

  return ORGANIZER_ROLES;
}
