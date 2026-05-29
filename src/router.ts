import { createRouter, createWebHistory } from 'vue-router';
import ArchiveEventView from './views/ArchiveEventView.vue';
import ArchiveView from './views/ArchiveView.vue';
import AdminEventView from './views/admin/AdminEventView.vue';
import AdminEventsView from './views/admin/AdminEventsView.vue';
import AdminLoginView from './views/admin/AdminLoginView.vue';
import AdminQuizView from './views/admin/AdminQuizView.vue';
import AdminSpeakersView from './views/admin/AdminSpeakersView.vue';
import AdminTalksView from './views/admin/AdminTalksView.vue';
import CfpView from './views/CfpView.vue';
import DashboardView from './views/DashboardView.vue';
import LeaderboardView from './views/LeaderboardView.vue';
import MyTalksView from './views/MyTalksView.vue';
import NotFoundView from './views/NotFoundView.vue';
import PlayCodeView from './views/PlayCodeView.vue';
import PlayView from './views/PlayView.vue';
import { adminPath, isAdminPath } from './admin-routes';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'dashboard', component: DashboardView },
    { path: '/archive', name: 'archive', component: ArchiveView },
    { path: '/archive/:eventId', name: 'archive-event', component: ArchiveEventView },
    { path: '/leaderboard', name: 'leaderboard', component: LeaderboardView },
    { path: '/cfp/:eventId', name: 'cfp', component: CfpView },
    { path: '/my-talks', name: 'my-talks', component: MyTalksView },
    { path: '/play', name: 'play', component: PlayView },
    { path: '/play/:code', name: 'play-code', component: PlayCodeView },
    { path: adminPath('login'), name: 'admin-login', component: AdminLoginView },
    { path: adminPath(), redirect: adminPath('events') },
    { path: adminPath('events'), name: 'admin-events', component: AdminEventsView },
    { path: adminPath('events/new'), name: 'admin-events-new', component: AdminEventsView },
    { path: adminPath('events/:eventId'), name: 'admin-event', component: AdminEventView },
    { path: adminPath('events/:eventId/talks'), name: 'admin-talks', component: AdminTalksView },
    { path: adminPath('events/:eventId/speakers'), name: 'admin-speakers', component: AdminSpeakersView },
    { path: adminPath('events/:eventId/quiz'), name: 'admin-quiz', component: AdminQuizView },
    { path: adminPath('events/:eventId/quiz/live'), name: 'admin-quiz-live', component: AdminQuizView },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFoundView },
  ],
});

router.beforeEach(async (to) => {
  if (!isAdminPath(to.path) || to.path === adminPath('login')) {
    return true;
  }

  const response = await fetch('/api/auth/session');
  if (response.ok) {
    const session = await response.json();
    if (session.authenticated) {
      return true;
    }
  }

  return {
    path: adminPath('login'),
    query: { redirect: to.fullPath },
  };
});
