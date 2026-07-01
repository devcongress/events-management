import { createRouter, createWebHistory } from 'vue-router';
import { ADMIN_OAUTH_REDIRECT_STORAGE_KEY, adminPath, isAdminPath } from './admin-routes';
import { fetchAdminSession, queryKeys, type AdminSessionResponse } from './lib/api';
import { queryClient } from './lib/query';

const COMMUNITY_TITLE = 'DevCongress | Community';
const ORGANIZER_TITLE = 'DevCongress | Organizers';
const ownerOnlyPaths = new Set([adminPath('audit-log')]);
const DashboardView = () => import('./views/DashboardView.vue');
const EventsView = () => import('./views/EventsView.vue');
const EventView = () => import('./views/EventView.vue');
const ArchiveView = () => import('./views/ArchiveView.vue');
const ArchiveEventView = () => import('./views/ArchiveEventView.vue');
const LeaderboardView = () => import('./views/LeaderboardView.vue');
const CfpView = () => import('./views/CfpView.vue');
const SpeakerTalkIntakeView = () => import('./views/SpeakerTalkIntakeView.vue');
const RouteFeedbackView = () => import('./views/RouteFeedbackView.vue');
const FeedbackView = () => import('./views/FeedbackView.vue');
const MyTalksView = () => import('./views/MyTalksView.vue');
const PlayView = () => import('./views/PlayView.vue');
const PlayCodeView = () => import('./views/PlayCodeView.vue');
const NotFoundView = () => import('./views/NotFoundView.vue');
const AdminAuthCallbackView = () => import('./views/admin/AdminAuthCallbackView.vue');
const AdminLoginView = () => import('./views/admin/AdminLoginView.vue');
const AdminEventsView = () => import('./views/admin/AdminEventsView.vue');
const AdminAttendanceOverviewView = () => import('./views/admin/AdminAttendanceOverviewView.vue');
const AdminAttendanceView = () => import('./views/admin/AdminAttendanceView.vue');
const AdminFeedbackOverviewView = () => import('./views/admin/AdminFeedbackOverviewView.vue');
const AdminFeedbackDisplayView = () => import('./views/admin/AdminFeedbackDisplayView.vue');
const AdminFeedbackView = () => import('./views/admin/AdminFeedbackView.vue');
const AdminOrganizersView = () => import('./views/admin/AdminOrganizersView.vue');
const AdminAuditLogView = () => import('./views/admin/AdminAuditLogView.vue');
const AdminEventView = () => import('./views/admin/AdminEventView.vue');
const AdminTalksView = () => import('./views/admin/AdminTalksView.vue');
const AdminSpeakersView = () => import('./views/admin/AdminSpeakersView.vue');
const AdminQuizView = () => import('./views/admin/AdminQuizView.vue');
const AdminSystemDesignView = () => import('./views/admin/AdminSystemDesignView.vue');

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
