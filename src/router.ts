import { createRouter, createWebHistory } from 'vue-router';
import {
  ADMIN_OAUTH_REDIRECT_STORAGE_KEY,
  adminPath,
  isAdminPath,
  safeInternalAppPath,
} from './admin-routes';
import {
  ACTIVE_ANNUAL_CONFERENCE_EDITION,
  annualConferencePath,
  mobileAnnualConferencePath,
  volunteerCanAccessOrganizerPath,
} from './annual-conference';
import {
  fetchAdminSession,
  fetchAnnualConferenceWorkPlan,
  fetchEventById,
  queryKeys,
  type AdminSessionResponse,
} from './lib/api';
import { isCommunitySubmissionEvent } from './lib/community-submission-event';
import { queryClient } from './lib/query';
import {
  SYSTEM_DESIGN_PARTICIPANT_ROUTE_NAME,
  systemDesignParticipantRoute,
} from './system-design-participant-route';
import { SYSTEM_DESIGN_PRESENTER_ROUTE_NAME } from './system-design-presenter-route';
import {
  matchesOrganizerPhoneViewport,
  ORGANIZER_PHONE_CHECK_IN_ROUTE_NAME,
  ORGANIZER_PHONE_EVENTS_ROUTE_NAME,
  ORGANIZER_PHONE_EVENTS_ROUTE_PATH,
  ORGANIZER_PHONE_ANNUAL_CONFERENCE_ROUTE_NAME,
  ORGANIZER_PHONE_ROUTE_PATH,
  organizerViewportRedirect,
} from './organizer-viewport';
import {
  CONFERENCE_SPEAKER_INTAKE_ROUTE_NAME,
  SPEAKER_TALK_INTAKE_ROUTE_NAME,
  conferenceSpeakerIntakeRoute,
  speakerTalkIntakeRoute,
} from './speaker-intake-route';

const ORGANIZER_TITLE = 'DevCongress | Organizers';
const FEEDBACK_TITLE = 'DevCongress | Feedback';
const FEEDBACK_DISPLAY_TITLE = 'DevCongress | Feedback Display';
const REGISTRATION_DISPLAY_TITLE = 'DevCongress | Registration Display';
const SPEAKER_TALK_INTAKE_TITLE = 'DevCongress | Archive Details';
const CFP_TITLE = 'DevCongress | Call for Presentations';
const REGISTRATION_TITLE = 'DevCongress | Registration';
const VOLUNTEER_TITLE = 'DevCongress | Volunteer';
const VOLUNTEER_DISPLAY_TITLE = 'DevCongress | Volunteer Display';
const ANNUAL_CONFERENCE_TITLE = 'DevCongress | Annual Conference';
const SYSTEM_DESIGN_PARTICIPANT_TITLE = 'DevCongress | System Design Learning Room';
const ownerOnlyPaths = new Set([adminPath('audit-log')]);
const NotFoundView = () => import('./views/NotFoundView.vue');
const FeedbackView = () => import('./views/FeedbackView.vue');
const CfpView = () => import('./views/CfpView.vue');
const VolunteerIntakeView = () => import('./views/VolunteerIntakeView.vue');
const EventRegistrationView = () => import('./views/EventRegistrationView.vue');
const EventAmendmentView = () => import('./views/EventAmendmentView.vue');
const EventsView = () => import('./views/EventsView.vue');
const EventView = () => import('./views/EventView.vue');
const AdminAuthCallbackView = () => import('./views/admin/AdminAuthCallbackView.vue');
const AdminLoginView = () => import('./views/admin/AdminLoginView.vue');
const AdminMobileOrganizerView = () => import('./views/admin/AdminMobileOrganizerView.vue');
const AdminMobileEventsView = () => import('./views/admin/AdminMobileEventsView.vue');
const AdminMobileCheckInView = () => import('./views/admin/AdminMobileCheckInView.vue');
const AdminMobileAnnualConferenceView = () => import('./views/admin/AdminMobileAnnualConferenceView.vue');
const AdminEventsWorkspaceView = () => import('./views/admin/AdminEventsWorkspaceView.vue');
const AdminEventsView = () => import('./views/admin/AdminEventsView.vue');
const AdminEventSubmissionsView = () => import('./views/admin/AdminEventSubmissionsView.vue');
const AdminAttendanceOverviewView = () => import('./views/admin/AdminAttendanceOverviewView.vue');
const AdminAttendanceView = () => import('./views/admin/AdminAttendanceView.vue');
const AdminFeedbackOverviewView = () => import('./views/admin/AdminFeedbackOverviewView.vue');
const AdminFeedbackDisplayView = () => import('./views/admin/AdminFeedbackDisplayView.vue');
const AdminRegistrationDisplayView = () => import('./views/admin/AdminRegistrationDisplayView.vue');
const AdminAnnualConferenceView = () => import('./views/admin/AdminAnnualConferenceView.vue');
const AdminAnnualConferenceWorkPlanView = () => import('./views/admin/AdminAnnualConferenceWorkPlanView.vue');
const AdminAnnualConferenceTimelineView = () => import('./views/admin/AdminAnnualConferenceTimelineView.vue');
const AdminAnnualConferenceFinanceView = () => import('./views/admin/AdminAnnualConferenceFinanceView.vue');
const AdminVolunteerView = () => import('./views/admin/AdminVolunteerView.vue');
const AdminVolunteerDisplayView = () => import('./views/admin/AdminVolunteerDisplayView.vue');
const AdminFeedbackView = () => import('./views/admin/AdminFeedbackView.vue');
const AdminOrganizersView = () => import('./views/admin/AdminOrganizersView.vue');
const AdminAuditLogView = () => import('./views/admin/AdminAuditLogView.vue');
const AdminEventView = () => import('./views/admin/AdminEventView.vue');
const AdminCommunityEventView = () => import('./views/admin/AdminCommunityEventView.vue');
const AdminTalksView = () => import('./views/admin/AdminTalksView.vue');
const AdminSpeakersView = () => import('./views/admin/AdminSpeakersView.vue');
const AdminQuizView = () => import('./views/admin/AdminQuizView.vue');
const AdminSystemDesignView = () => import('./views/admin/AdminSystemDesignView.vue');
const SystemDesignPresenterView = () => import('./views/SystemDesignPresenterView.vue');
const SystemDesignRecapView = () => import('./views/SystemDesignRecapView.vue');
const AdminRegistrationsView = () => import('./views/admin/AdminRegistrationsView.vue');

function storedAdminOAuthRedirect(): string {
  try {
    return safeInternalAppPath(window.sessionStorage.getItem(ADMIN_OAUTH_REDIRECT_STORAGE_KEY)) ?? adminPath('events');
  } catch {
    return adminPath('events');
  }
}

async function redirectCommunitySubmissionWorkspace(to: { params: Record<string, unknown> }) {
  const eventId = typeof to.params.eventId === 'string' ? to.params.eventId : '';
  if (!eventId) return true;

  try {
    const event = await queryClient.fetchQuery({
      queryKey: queryKeys.event(eventId),
      queryFn: () => fetchEventById(eventId),
    });
    return isCommunitySubmissionEvent(event)
      ? { path: adminPath(`events/${eventId}`) }
      : true;
  } catch {
    // Let the target view present its normal fetch/auth error rather than
    // replacing it with a routing failure.
    return true;
  }
}

async function redirectCommunitySubmissionEvent(to: { params: Record<string, unknown> }) {
  const eventId = typeof to.params.eventId === 'string' ? to.params.eventId : '';
  if (!eventId) return true;

  try {
    const event = await queryClient.fetchQuery({
      queryKey: queryKeys.event(eventId),
      queryFn: () => fetchEventById(eventId),
    });
    if (isCommunitySubmissionEvent(event)) {
      return { path: adminPath(`events/${eventId}/community`) };
    }
  } catch {
    // The standard event route owns the visible retry state when the event
    // cannot be read; do not turn a temporary API failure into a bad route.
  }

  return true;
}

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: adminPath('events') },
    { path: '/feedback/:eventId', name: 'event-feedback', component: FeedbackView },
    { path: '/cfp/:eventId', name: 'event-cfp', component: CfpView },
    { path: '/speak/m/:eventId', name: 'monthly-cfp', component: CfpView },
    { path: '/speak/c/:year(\\d{4})', name: 'conference-cfp', component: CfpView },
    { path: '/r/:eventKey', name: 'event-registration-short', component: EventRegistrationView },
    { path: '/register/:eventId', name: 'event-registration', component: EventRegistrationView },
    { path: '/event-amendments', name: 'event-amendment', component: EventAmendmentView },
    { path: '/event-amendments/:capability', name: 'event-amendment-legacy', component: EventAmendmentView },
    systemDesignParticipantRoute,
    { path: '/system-design/:eventId', name: 'system-design-recap', component: SystemDesignRecapView },
    {
      path: '/present/system-design/:sessionId',
      name: SYSTEM_DESIGN_PRESENTER_ROUTE_NAME,
      component: SystemDesignPresenterView,
      meta: { requiresOrganizer: true },
    },
    speakerTalkIntakeRoute,
    conferenceSpeakerIntakeRoute,
    { path: '/volunteer/december-mega-meetup', name: 'volunteer-intake', component: VolunteerIntakeView },
    { path: adminPath('auth/callback'), name: 'admin-auth-callback', component: AdminAuthCallbackView },
    { path: adminPath('login'), name: 'admin-login', component: AdminLoginView },
    { path: adminPath(), redirect: adminPath('events') },
    { path: ORGANIZER_PHONE_ROUTE_PATH, name: 'admin-mobile', component: AdminMobileOrganizerView },
    { path: ORGANIZER_PHONE_EVENTS_ROUTE_PATH, name: ORGANIZER_PHONE_EVENTS_ROUTE_NAME, component: AdminMobileEventsView },
    {
      path: adminPath('mobile/events/:eventId/check-in'),
      name: ORGANIZER_PHONE_CHECK_IN_ROUTE_NAME,
      component: AdminMobileCheckInView,
      beforeEnter: redirectCommunitySubmissionWorkspace,
    },
    {
      path: adminPath('mobile/annual-conference/:year(\\d{4})'),
      name: ORGANIZER_PHONE_ANNUAL_CONFERENCE_ROUTE_NAME,
      component: AdminMobileAnnualConferenceView,
    },
    {
      path: adminPath('events'),
      component: AdminEventsWorkspaceView,
      children: [
        { path: '', name: 'admin-events', component: AdminEventsView, props: { embedded: true } },
        { path: 'submissions', name: 'admin-event-submissions', component: AdminEventSubmissionsView },
      ],
    },
    { path: adminPath('event-submissions'), redirect: adminPath('events/submissions') },
    {
      path: adminPath('website-preview/events'),
      name: 'admin-public-events-preview',
      component: EventsView,
    },
    {
      path: adminPath('website-preview/events/:slug'),
      name: 'admin-public-event-preview',
      component: EventView,
    },
    { path: adminPath('attendance'), name: 'admin-attendance-overview', component: AdminAttendanceOverviewView },
    { path: adminPath('feedback'), name: 'admin-feedback-overview', component: AdminFeedbackOverviewView },
    { path: adminPath('feedback-display/:eventId'), name: 'admin-feedback-display', component: AdminFeedbackDisplayView },
    { path: adminPath('registration-display/:eventId'), name: 'admin-registration-display', component: AdminRegistrationDisplayView },
    { path: adminPath('annual-conference'), redirect: annualConferencePath() },
    { path: adminPath('annual-conference/:year(\\d{4})'), name: 'admin-annual-conference', component: AdminAnnualConferenceView },
    { path: adminPath('annual-conference/:year(\\d{4})/work-plan'), name: 'admin-annual-conference-work-plan', component: AdminAnnualConferenceWorkPlanView },
    { path: adminPath('annual-conference/:year(\\d{4})/timeline'), name: 'admin-annual-conference-timeline', component: AdminAnnualConferenceTimelineView },
    { path: adminPath('annual-conference/:year(\\d{4})/speakers'), name: 'admin-annual-conference-speakers', component: () => import('./views/admin/AdminAnnualConferenceSpeakersView.vue') },
    { path: adminPath('annual-conference/:year(\\d{4})/finance'), name: 'admin-annual-conference-finance', component: AdminAnnualConferenceFinanceView },
    { path: adminPath('annual-conference/:year(\\d{4})/volunteers'), name: 'admin-annual-conference-volunteers', component: AdminVolunteerView },
    { path: adminPath('annual-conference/:year(\\d{4})/volunteers/display'), name: 'admin-annual-conference-volunteer-display', component: AdminVolunteerDisplayView },
    { path: adminPath('volunteers'), redirect: annualConferencePath('volunteers') },
    { path: adminPath('volunteer-display'), redirect: annualConferencePath('volunteers/display') },
    { path: adminPath('organizers'), name: 'admin-organizers', component: AdminOrganizersView },
    { path: adminPath('audit-log'), name: 'admin-audit-log', component: AdminAuditLogView },
    { path: adminPath('events/new'), name: 'admin-events-new', component: AdminEventsView },
    // Standard events retain their established workspace. The guard only
    // diverts promoted public submissions to their deliberately smaller
    // community-listing workspace.
    { path: adminPath('events/:eventId'), name: 'admin-event', component: AdminEventView, beforeEnter: redirectCommunitySubmissionEvent },
    { path: adminPath('events/:eventId/community'), name: 'admin-community-event', component: AdminCommunityEventView },
    { path: adminPath('events/:eventId/talks'), redirect: (to) => adminPath(`events/${String(to.params.eventId)}/talks/cfp`) },
    { path: adminPath('events/:eventId/talks/:talksSection(cfp|proposals|program|backfill)'), name: 'admin-talks', component: AdminTalksView, beforeEnter: redirectCommunitySubmissionWorkspace },
    { path: adminPath('events/:eventId/speakers'), name: 'admin-speakers', component: AdminSpeakersView, beforeEnter: redirectCommunitySubmissionWorkspace },
    { path: adminPath('events/:eventId/attendance'), name: 'admin-attendance', component: AdminAttendanceView, beforeEnter: redirectCommunitySubmissionWorkspace },
    { path: adminPath('events/:eventId/finance'), name: 'admin-monthly-meetup-finance', component: () => import('./views/admin/AdminMonthlyMeetupFinanceView.vue'), beforeEnter: redirectCommunitySubmissionWorkspace },
    { path: adminPath('events/:eventId/registrations'), name: 'admin-registrations', component: AdminRegistrationsView, beforeEnter: redirectCommunitySubmissionWorkspace },
    { path: adminPath('events/:eventId/quiz'), name: 'admin-quiz', component: AdminQuizView, beforeEnter: redirectCommunitySubmissionWorkspace },
    { path: adminPath('events/:eventId/quiz/live'), name: 'admin-quiz-live', component: AdminQuizView, beforeEnter: redirectCommunitySubmissionWorkspace },
    { path: adminPath('events/:eventId/system-design'), name: 'admin-system-design', component: AdminSystemDesignView, beforeEnter: redirectCommunitySubmissionWorkspace },
    { path: adminPath('events/:eventId/system-design/learning-room'), redirect: (to) => adminPath(`events/${String(to.params.eventId)}/system-design`) },
    { path: adminPath('events/:eventId/system-design/learning-room/live'), redirect: (to) => adminPath(`events/${String(to.params.eventId)}/system-design`) },
    { path: adminPath('events/:eventId/feedback'), name: 'admin-feedback', component: AdminFeedbackView, beforeEnter: redirectCommunitySubmissionWorkspace },
    { path: adminPath(':pathMatch(.*)*'), name: 'admin-not-found', component: NotFoundView },
    { path: '/:pathMatch(.*)*', redirect: adminPath('events') },
  ],
});

async function volunteerCanOpenRoute(path: string, yearParam: unknown): Promise<boolean> {
  const year = typeof yearParam === 'string' ? yearParam : ACTIVE_ANNUAL_CONFERENCE_EDITION.year;
  try {
    const workspace = await queryClient.fetchQuery({
      queryKey: queryKeys.annualConferenceWorkPlan(year),
      queryFn: () => fetchAnnualConferenceWorkPlan(year),
    });
    return volunteerCanAccessOrganizerPath(path, workspace.permissions.capabilities);
  } catch {
    return volunteerCanAccessOrganizerPath(path);
  }
}

router.beforeEach(async (to, from) => {
  const oauthCode = typeof to.query.code === 'string' ? to.query.code : '';
  const oauthError = typeof to.query.error_description === 'string' ? 'oauth_failed' : '';

  if ((oauthCode || oauthError) && to.path !== adminPath('auth/callback')) {
    return {
      path: adminPath('auth/callback'),
      query: {
        next: safeInternalAppPath(to.query.next) ?? safeInternalAppPath(to.query.redirect) ?? storedAdminOAuthRedirect(),
        ...(oauthCode ? { code: oauthCode } : {}),
        ...(oauthError ? { error: oauthError } : {}),
      },
    };
  }

  const requiresOrganizer = isAdminPath(to.path) || to.meta.requiresOrganizer === true;
  if (!requiresOrganizer || to.path === adminPath('login') || to.path === adminPath('auth/callback')) {
    return true;
  }

  const cachedSession = queryClient.getQueryData<AdminSessionResponse>(queryKeys.adminSession);
  if (cachedSession?.authenticated) {
    // Background revalidation on navigation, deduped by the default 30s
    // staleTime so tab-hopping within an event doesn't fire a request per click.
    void queryClient.fetchQuery({
      queryKey: queryKeys.adminSession,
      queryFn: fetchAdminSession,
    }).catch(() => undefined);

    const isPhone = matchesOrganizerPhoneViewport();
    if (
      cachedSession.user?.role === 'volunteer'
      && isPhone
      && to.name !== ORGANIZER_PHONE_ANNUAL_CONFERENCE_ROUTE_NAME
      && to.name !== 'admin-annual-conference-volunteer-display'
    ) {
      return mobileAnnualConferencePath(typeof to.params.year === 'string' ? to.params.year : undefined);
    }

    const viewportRedirect = organizerViewportRedirect({
      authenticated: true,
      isAdminRoute: isAdminPath(to.path),
      isPhone,
      routeName: to.name,
      eventId: typeof to.params.eventId === 'string' ? to.params.eventId : null,
      conferenceYear: typeof to.params.year === 'string' ? to.params.year : null,
    });
    if (viewportRedirect) return viewportRedirect;

    if (cachedSession.user?.role === 'volunteer') {
      return await volunteerCanOpenRoute(to.path, to.params.year) ? true : annualConferencePath();
    }

    if (ownerOnlyPaths.has(to.path) && cachedSession.user?.role !== 'owner') {
      return adminPath('events');
    }

    return true;
  }

  try {
    const session = await queryClient.fetchQuery({
      queryKey: queryKeys.adminSession,
      queryFn: fetchAdminSession,
    });
    if (session.authenticated) {
      const isPhone = matchesOrganizerPhoneViewport();
      if (
        session.user?.role === 'volunteer'
        && isPhone
        && to.name !== ORGANIZER_PHONE_ANNUAL_CONFERENCE_ROUTE_NAME
        && to.name !== 'admin-annual-conference-volunteer-display'
      ) {
        return mobileAnnualConferencePath(typeof to.params.year === 'string' ? to.params.year : undefined);
      }

      const viewportRedirect = organizerViewportRedirect({
        authenticated: true,
        isAdminRoute: isAdminPath(to.path),
        isPhone,
        routeName: to.name,
        eventId: typeof to.params.eventId === 'string' ? to.params.eventId : null,
        conferenceYear: typeof to.params.year === 'string' ? to.params.year : null,
      });
      if (viewportRedirect) return viewportRedirect;

      if (session.user?.role === 'volunteer') {
        return await volunteerCanOpenRoute(to.path, to.params.year) ? true : annualConferencePath();
      }

      if (ownerOnlyPaths.has(to.path) && session.user?.role !== 'owner') {
        return adminPath('events');
      }

      return true;
    }
  } catch {
    // Fall through to login when the hosted API/session check is unreachable.
  }

  return {
    path: adminPath('login'),
    query: { redirect: to.fullPath },
  };
});

router.afterEach((to) => {
  if (to.name === 'event-feedback') {
    document.title = FEEDBACK_TITLE;
  } else if (to.name === 'event-cfp') {
    document.title = CFP_TITLE;
  } else if (to.name === 'event-registration' || to.name === 'event-registration-short') {
    document.title = REGISTRATION_TITLE;
  } else if (to.name === 'admin-feedback-display') {
    document.title = FEEDBACK_DISPLAY_TITLE;
  } else if (to.name === 'admin-registration-display') {
    document.title = REGISTRATION_DISPLAY_TITLE;
  } else if (to.name === SPEAKER_TALK_INTAKE_ROUTE_NAME || to.name === CONFERENCE_SPEAKER_INTAKE_ROUTE_NAME) {
    document.title = SPEAKER_TALK_INTAKE_TITLE;
  } else if (to.name === 'volunteer-intake') {
    document.title = VOLUNTEER_TITLE;
  } else if (to.name === 'admin-annual-conference-volunteer-display') {
    document.title = VOLUNTEER_DISPLAY_TITLE;
  } else if (to.name === SYSTEM_DESIGN_PRESENTER_ROUTE_NAME) {
    document.title = 'DevCongress | System Design Presentation';
  } else if (to.name === SYSTEM_DESIGN_PARTICIPANT_ROUTE_NAME) {
    document.title = SYSTEM_DESIGN_PARTICIPANT_TITLE;
  } else if (
    to.name === 'admin-annual-conference'
    || to.name === 'admin-annual-conference-work-plan'
    || to.name === 'admin-annual-conference-timeline'
    || to.name === 'admin-annual-conference-finance'
    || to.name === 'admin-annual-conference-volunteers'
    || to.name === ORGANIZER_PHONE_ANNUAL_CONFERENCE_ROUTE_NAME
  ) {
    document.title = ANNUAL_CONFERENCE_TITLE;
  } else {
    document.title = ORGANIZER_TITLE;
  }
});
