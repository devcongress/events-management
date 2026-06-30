import { createRouter, createWebHistory } from 'vue-router';
import ArchiveEventView from './views/ArchiveEventView.vue';
import ArchiveView from './views/ArchiveView.vue';
import FeedbackView from './views/FeedbackView.vue';
import RouteFeedbackView from './views/RouteFeedbackView.vue';
import SpeakerTalkIntakeView from './views/SpeakerTalkIntakeView.vue';
import AdminAttendanceOverviewView from './views/admin/AdminAttendanceOverviewView.vue';
import AdminAttendanceView from './views/admin/AdminAttendanceView.vue';
import AdminAuditLogView from './views/admin/AdminAuditLogView.vue';
import AdminEventView from './views/admin/AdminEventView.vue';
import AdminAuthCallbackView from './views/admin/AdminAuthCallbackView.vue';
import AdminEventsView from './views/admin/AdminEventsView.vue';
import AdminFeedbackOverviewView from './views/admin/AdminFeedbackOverviewView.vue';
import AdminFeedbackDisplayView from './views/admin/AdminFeedbackDisplayView.vue';
import AdminFeedbackView from './views/admin/AdminFeedbackView.vue';
import AdminLoginView from './views/admin/AdminLoginView.vue';
import AdminOrganizersView from './views/admin/AdminOrganizersView.vue';
import AdminQuizView from './views/admin/AdminQuizView.vue';
import AdminSpeakersView from './views/admin/AdminSpeakersView.vue';
import AdminSystemDesignView from './views/admin/AdminSystemDesignView.vue';
import AdminTalksView from './views/admin/AdminTalksView.vue';
import CfpView from './views/CfpView.vue';
import DashboardView from './views/DashboardView.vue';
import EventsView from './views/EventsView.vue';
import EventView from './views/EventView.vue';
import LeaderboardView from './views/LeaderboardView.vue';
import MyTalksView from './views/MyTalksView.vue';
import NotFoundView from './views/NotFoundView.vue';
import PlayCodeView from './views/PlayCodeView.vue';
import PlayView from './views/PlayView.vue';
import { ADMIN_OAUTH_REDIRECT_STORAGE_KEY, adminPath, isAdminPath } from './admin-routes';
import { fetchAdminSession, queryKeys, type AdminSessionResponse } from './lib/api';
import { queryClient } from './lib/query';

const COMMUNITY_TITLE = 'DevCongress | Community';
const ORGANIZER_TITLE = 'DevCongress | Organizers';
const ownerOnlyPaths = new Set([adminPath('audit-log')]);

function safeInternalRedirect(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  return value;
}

function storedAdminOAuthRedirect(): string {
  try {
    return safeInternalRedirect(window.sessionStorage.getItem(ADMIN_OAUTH_REDIRECT_STORAGE_KEY)) ?? adminPath('events');
  } catch {
    return adminPath('events');
  }
}

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'dashboard', component: DashboardView },
    { path: '/events', name: 'events', component: EventsView },
    { path: '/events/:slug', name: 'event', component: EventView },
    { path: '/archive', name: 'archive', component: ArchiveView },
    { path: '/archive/:eventId', name: 'archive-event', component: ArchiveEventView },
    { path: '/leaderboard', name: 'leaderboard', component: LeaderboardView },
    { path: '/cfp/:eventId', name: 'cfp', component: CfpView },
    { path: '/speaker-talks/:eventId/:token', name: 'speaker-talk-intake', component: SpeakerTalkIntakeView },
    { path: '/feedback', name: 'route-feedback', component: RouteFeedbackView },
    { path: '/feedback/:eventId', name: 'feedback', component: FeedbackView },
    { path: '/my-talks', name: 'my-talks', component: MyTalksView },
    { path: '/play', name: 'play', component: PlayView },
    { path: '/play/:code', name: 'play-code', component: PlayCodeView },
    { path: adminPath('auth/callback'), name: 'admin-auth-callback', component: AdminAuthCallbackView },
    { path: adminPath('login'), name: 'admin-login', component: AdminLoginView },
    { path: adminPath(), redirect: adminPath('events') },
    { path: adminPath('events'), name: 'admin-events', component: AdminEventsView },
    { path: adminPath('attendance'), name: 'admin-attendance-overview', component: AdminAttendanceOverviewView },
    { path: adminPath('feedback'), name: 'admin-feedback-overview', component: AdminFeedbackOverviewView },
    { path: adminPath('feedback-display/:eventId'), name: 'admin-feedback-display', component: AdminFeedbackDisplayView },
    { path: adminPath('organizers'), name: 'admin-organizers', component: AdminOrganizersView },
    { path: adminPath('audit-log'), name: 'admin-audit-log', component: AdminAuditLogView },
    { path: adminPath('events/new'), name: 'admin-events-new', component: AdminEventsView },
    { path: adminPath('events/:eventId'), name: 'admin-event', component: AdminEventView },
    { path: adminPath('events/:eventId/talks'), name: 'admin-talks', component: AdminTalksView },
    { path: adminPath('events/:eventId/speakers'), name: 'admin-speakers', component: AdminSpeakersView },
    { path: adminPath('events/:eventId/attendance'), name: 'admin-attendance', component: AdminAttendanceView },
    { path: adminPath('events/:eventId/quiz'), name: 'admin-quiz', component: AdminQuizView },
    { path: adminPath('events/:eventId/quiz/live'), name: 'admin-quiz-live', component: AdminQuizView },
    { path: adminPath('events/:eventId/system-design'), name: 'admin-system-design', component: AdminSystemDesignView },
    { path: adminPath('events/:eventId/feedback'), name: 'admin-feedback', component: AdminFeedbackView },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFoundView },
  ],
});

router.beforeEach(async (to, from) => {
  const oauthCode = typeof to.query.code === 'string' ? to.query.code : '';
  const oauthError = typeof to.query.error_description === 'string' ? to.query.error_description : '';

  if ((oauthCode || oauthError) && to.path !== adminPath('auth/callback')) {
    return {
      path: adminPath('auth/callback'),
      query: {
        next: safeInternalRedirect(to.query.next) ?? safeInternalRedirect(to.query.redirect) ?? storedAdminOAuthRedirect(),
        ...(oauthCode ? { code: oauthCode } : {}),
        ...(oauthError ? { error: oauthError } : {}),
      },
    };
  }

  if (!isAdminPath(to.path) || to.path === adminPath('login') || to.path === adminPath('auth/callback')) {
    return true;
  }

  const cachedSession = queryClient.getQueryData<AdminSessionResponse>(queryKeys.adminSession);
  if (cachedSession?.authenticated) {
    void queryClient.fetchQuery({
      queryKey: queryKeys.adminSession,
      queryFn: fetchAdminSession,
      staleTime: 0,
    }).catch(() => undefined);

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
  document.title = isAdminPath(to.path) ? ORGANIZER_TITLE : COMMUNITY_TITLE;
});
