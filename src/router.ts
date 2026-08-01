import { createRouter, createWebHistory } from 'vue-router';
import {
  ADMIN_OAUTH_REDIRECT_STORAGE_KEY,
  adminPath,
  isAdminPath,
  safeInternalAppPath,
} from './admin-routes';
import { annualConferencePath } from './annual-conference';
import { fetchAdminSession, queryKeys, type AdminSessionResponse } from './lib/api';
import { queryClient } from './lib/query';
import {
  SYSTEM_DESIGN_PARTICIPANT_ROUTE_NAME,
  systemDesignParticipantRoute,
} from './system-design-participant-route';
import { SYSTEM_DESIGN_PRESENTER_ROUTE_NAME } from './system-design-presenter-route';
import {
  matchesOrganizerPhoneViewport,
  ORGANIZER_PHONE_CHECK_IN_ROUTE_NAME,
  ORGANIZER_PHONE_ROUTE_PATH,
  organizerViewportRedirect,
} from './organizer-viewport';
import {
  SPEAKER_TALK_INTAKE_ROUTE_NAME,
  speakerTalkIntakeRoute,
} from './speaker-intake-route';

const ORGANIZER_TITLE = 'DevCongress | Organizers';
const FEEDBACK_TITLE = 'DevCongress | Feedback';
const FEEDBACK_DISPLAY_TITLE = 'DevCongress | Feedback Display';
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
const EventsView = () => import('./views/EventsView.vue');
const EventView = () => import('./views/EventView.vue');
const AdminAuthCallbackView = () => import('./views/admin/AdminAuthCallbackView.vue');
const AdminLoginView = () => import('./views/admin/AdminLoginView.vue');
const AdminMobileOrganizerView = () => import('./views/admin/AdminMobileOrganizerView.vue');
const AdminMobileCheckInView = () => import('./views/admin/AdminMobileCheckInView.vue');
const AdminEventsView = () => import('./views/admin/AdminEventsView.vue');
const AdminEventSubmissionsView = () => import('./views/admin/AdminEventSubmissionsView.vue');
const AdminAttendanceOverviewView = () => import('./views/admin/AdminAttendanceOverviewView.vue');
const AdminAttendanceView = () => import('./views/admin/AdminAttendanceView.vue');
const AdminFeedbackOverviewView = () => import('./views/admin/AdminFeedbackOverviewView.vue');
const AdminFeedbackDisplayView = () => import('./views/admin/AdminFeedbackDisplayView.vue');
const AdminAnnualConferenceView = () => import('./views/admin/AdminAnnualConferenceView.vue');
const AdminAnnualConferenceWorkPlanView = () => import('./views/admin/AdminAnnualConferenceWorkPlanView.vue');
const AdminVolunteerView = () => import('./views/admin/AdminVolunteerView.vue');
const AdminVolunteerDisplayView = () => import('./views/admin/AdminVolunteerDisplayView.vue');
const AdminFeedbackView = () => import('./views/admin/AdminFeedbackView.vue');
const AdminOrganizersView = () => import('./views/admin/AdminOrganizersView.vue');
const AdminAuditLogView = () => import('./views/admin/AdminAuditLogView.vue');
const AdminEventView = () => import('./views/admin/AdminEventView.vue');
const AdminTalksView = () => import('./views/admin/AdminTalksView.vue');
const AdminSpeakersView = () => import('./views/admin/AdminSpeakersView.vue');
const AdminQuizView = () => import('./views/admin/AdminQuizView.vue');
const AdminSystemDesignView = () => import('./views/admin/AdminSystemDesignView.vue');
const SystemDesignPresenterView = () => import('./views/SystemDesignPresenterView.vue');
const AdminRegistrationsView = () => import('./views/admin/AdminRegistrationsView.vue');

function storedAdminOAuthRedirect(): string {
  try {
    return safeInternalAppPath(window.sessionStorage.getItem(ADMIN_OAUTH_REDIRECT_STORAGE_KEY)) ?? adminPath('events');
  } catch {
    return adminPath('events');
  }
}

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: adminPath('events') },
    { path: '/feedback/:eventId', name: 'event-feedback', component: FeedbackView },
    { path: '/cfp/:eventId', name: 'event-cfp', component: CfpView },
    { path: '/r/:eventKey', name: 'event-registration-short', component: EventRegistrationView },
    { path: '/register/:eventId', name: 'event-registration', component: EventRegistrationView },
    systemDesignParticipantRoute,
    {
      path: '/present/system-design/:sessionId',
      name: SYSTEM_DESIGN_PRESENTER_ROUTE_NAME,
      component: SystemDesignPresenterView,
      meta: { requiresOrganizer: true },
    },
    speakerTalkIntakeRoute,
    { path: '/volunteer/december-mega-meetup', name: 'volunteer-intake', component: VolunteerIntakeView },
    { path: adminPath('auth/callback'), name: 'admin-auth-callback', component: AdminAuthCallbackView },
    { path: adminPath('login'), name: 'admin-login', component: AdminLoginView },
    { path: adminPath(), redirect: adminPath('events') },
    { path: ORGANIZER_PHONE_ROUTE_PATH, name: 'admin-mobile', component: AdminMobileOrganizerView },
    {
      path: adminPath('mobile/events/:eventId/check-in'),
      name: ORGANIZER_PHONE_CHECK_IN_ROUTE_NAME,
      component: AdminMobileCheckInView,
    },
    { path: adminPath('events'), name: 'admin-events', component: AdminEventsView },
    { path: adminPath('event-submissions'), name: 'admin-event-submissions', component: AdminEventSubmissionsView },
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
    { path: adminPath('annual-conference'), redirect: annualConferencePath() },
    { path: annualConferencePath(), name: 'admin-annual-conference', component: AdminAnnualConferenceView },
    { path: annualConferencePath('work-plan'), name: 'admin-annual-conference-work-plan', component: AdminAnnualConferenceWorkPlanView },
    { path: annualConferencePath('volunteers'), name: 'admin-annual-conference-volunteers', component: AdminVolunteerView },
    { path: annualConferencePath('volunteers/display'), name: 'admin-annual-conference-volunteer-display', component: AdminVolunteerDisplayView },
    { path: adminPath('volunteers'), redirect: annualConferencePath('volunteers') },
    { path: adminPath('volunteer-display'), redirect: annualConferencePath('volunteers/display') },
    { path: adminPath('organizers'), name: 'admin-organizers', component: AdminOrganizersView },
    { path: adminPath('audit-log'), name: 'admin-audit-log', component: AdminAuditLogView },
    { path: adminPath('events/new'), name: 'admin-events-new', component: AdminEventsView },
    { path: adminPath('events/:eventId'), name: 'admin-event', component: AdminEventView },
    { path: adminPath('events/:eventId/talks'), redirect: (to) => adminPath(`events/${String(to.params.eventId)}/talks/cfp`) },
    { path: adminPath('events/:eventId/talks/:talksSection(cfp|proposals|program|backfill)'), name: 'admin-talks', component: AdminTalksView },
    { path: adminPath('events/:eventId/speakers'), name: 'admin-speakers', component: AdminSpeakersView },
    { path: adminPath('events/:eventId/attendance'), name: 'admin-attendance', component: AdminAttendanceView },
    { path: adminPath('events/:eventId/registrations'), name: 'admin-registrations', component: AdminRegistrationsView },
    { path: adminPath('events/:eventId/quiz'), name: 'admin-quiz', component: AdminQuizView },
    { path: adminPath('events/:eventId/quiz/live'), name: 'admin-quiz-live', component: AdminQuizView },
    { path: adminPath('events/:eventId/system-design'), name: 'admin-system-design', component: AdminSystemDesignView },
    { path: adminPath('events/:eventId/system-design/learning-room'), redirect: (to) => adminPath(`events/${String(to.params.eventId)}/system-design`) },
    { path: adminPath('events/:eventId/system-design/learning-room/live'), redirect: (to) => adminPath(`events/${String(to.params.eventId)}/system-design`) },
    { path: adminPath('events/:eventId/feedback'), name: 'admin-feedback', component: AdminFeedbackView },
    { path: adminPath(':pathMatch(.*)*'), name: 'admin-not-found', component: NotFoundView },
    { path: '/:pathMatch(.*)*', redirect: adminPath('events') },
  ],
});

router.beforeEach(async (to, from) => {
  const oauthCode = typeof to.query.code === 'string' ? to.query.code : '';
  const oauthError = typeof to.query.error_description === 'string' ? to.query.error_description : '';

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

    const viewportRedirect = organizerViewportRedirect({
      authenticated: true,
      isAdminRoute: isAdminPath(to.path),
      isPhone: matchesOrganizerPhoneViewport(),
      routeName: to.name,
      eventId: typeof to.params.eventId === 'string' ? to.params.eventId : null,
    });
    if (viewportRedirect) return viewportRedirect;

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
      const viewportRedirect = organizerViewportRedirect({
        authenticated: true,
        isAdminRoute: isAdminPath(to.path),
        isPhone: matchesOrganizerPhoneViewport(),
        routeName: to.name,
        eventId: typeof to.params.eventId === 'string' ? to.params.eventId : null,
      });
      if (viewportRedirect) return viewportRedirect;

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
  } else if (to.name === SPEAKER_TALK_INTAKE_ROUTE_NAME) {
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
    || to.name === 'admin-annual-conference-volunteers'
  ) {
    document.title = ANNUAL_CONFERENCE_TITLE;
  } else {
    document.title = ORGANIZER_TITLE;
  }
});
