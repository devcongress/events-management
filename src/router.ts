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
import PlayCodeView from './views/PlayCodeView.vue';
import PlayView from './views/PlayView.vue';

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
    { path: '/admin/login', name: 'admin-login', component: AdminLoginView },
    { path: '/admin', redirect: '/admin/events' },
    { path: '/admin/events', name: 'admin-events', component: AdminEventsView },
    { path: '/admin/events/new', name: 'admin-events-new', component: AdminEventsView },
    { path: '/admin/events/:eventId', name: 'admin-event', component: AdminEventView },
    { path: '/admin/events/:eventId/talks', name: 'admin-talks', component: AdminTalksView },
    { path: '/admin/events/:eventId/speakers', name: 'admin-speakers', component: AdminSpeakersView },
    { path: '/admin/events/:eventId/quiz', name: 'admin-quiz', component: AdminQuizView },
    { path: '/admin/events/:eventId/quiz/live', name: 'admin-quiz-live', component: AdminQuizView },
  ],
});

router.beforeEach(async (to) => {
  if (!to.path.startsWith('/admin') || to.path === '/admin/login') {
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
    path: '/admin/login',
    query: { redirect: to.fullPath },
  };
});
