<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query';
import { computed, defineAsyncComponent, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AdminEventTabs from './components/AdminEventTabs.vue';
import AppToaster from './components/ui/AppToaster.vue';
import FeedbackBot from './components/FeedbackBot.vue';
import { adminPath, isAdminPath } from './admin-routes';
import { fetchAdminSession, fetchEventById, fetchRouteFeedbackInbox, queryKeys, type RouteFeedbackSummary } from './lib/api';
import { queryClient } from './lib/query';

interface NavLink {
  href: string;
  label: string;
  accent?: boolean;
}

interface AdminEventSummary {
  id: string;
  name: string;
}

const AdminMobileOrganizerView = defineAsyncComponent(() => import('./views/admin/AdminMobileOrganizerView.vue'));
const route = useRoute();
const router = useRouter();
const quizAvailable = ref(false);
const adminEventNames = ref<Record<string, string>>({});
const routeTransitionName = ref('page');
const mobileMenuOpen = ref(false);
const phoneViewport = ref(typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches);
const keyboardDismissVisible = ref(false);
const keyboardInset = ref(0);
const adminEventTabsShell = ref<HTMLElement | null>(null);
const adminEventTabsHeight = ref(0);
const logoSrc = '/brand/dev-con-logo.png';
const showOrganizerLink = import.meta.env.VITE_SHOW_ORGANIZER_LINK !== 'false';
const feedbackBotEnabled = import.meta.env.VITE_SHOW_FEEDBACK_BOT !== 'false';
let quizAvailabilityInterval: number | undefined;
let keyboardFocusTimer: number | undefined;
let adminEventTabsResizeObserver: ResizeObserver | undefined;

const publicLinks: NavLink[] = [
  { href: '/', label: 'Home' },
  { href: '/events', label: 'Events' },
  { href: '/archive', label: 'Archive' },
  { href: '/leaderboard', label: 'Leaderboard' },
];

const speakerLinks: NavLink[] = [
  { href: '/my-talks', label: 'My Talks' },
];

const playLinks: NavLink[] = [
  { href: '/play', label: 'Play', accent: true },
];

const adminBaseLinks: NavLink[] = [
  { href: adminPath('events'), label: 'Events' },
  { href: adminPath('attendance'), label: 'Attendance Hub' },
  { href: adminPath('feedback'), label: 'Feedback Hub' },
  { href: adminPath('organizers'), label: 'Organizers' },
];
const ownerAdminLinks: NavLink[] = [
  { href: adminPath('audit-log'), label: 'Audit Log' },
];

const isAdminRoute = computed(() => isAdminPath(route.path));
const adminSessionQuery = useQuery({
  queryKey: queryKeys.adminSession,
  queryFn: fetchAdminSession,
  enabled: isAdminRoute,
});
const adminLinks = computed(() => {
  const session = adminSessionQuery.data.value;
  if (session?.authenticated && session.user?.role === 'owner') {
    return [...adminBaseLinks, ...ownerAdminLinks];
  }

  return adminBaseLinks;
});
const adminEventId = computed(() => {
  const value = route.params.eventId;
  if (Array.isArray(value)) return value[0];
  return value || null;
});
const primaryLinks = computed(() => (isAdminRoute.value ? adminLinks.value : publicLinks));
const visiblePlayLinks = computed(() => (quizAvailable.value ? playLinks : []));
const isOrganizerPhoneBypassRoute = computed(() => (
  route.path === adminPath('login')
  || route.path === adminPath('auth/callback')
  || route.path.startsWith(adminPath('feedback-display/'))
));
const showOrganizerPhoneView = computed(() => isAdminRoute.value && phoneViewport.value && !isOrganizerPhoneBypassRoute.value);
const navGroups = computed(() => {
  if (showOrganizerPhoneView.value) {
    return [[{ href: adminPath('events'), label: 'Mobile Ops' }]];
  }

  if (isAdminRoute.value) {
    return [primaryLinks.value];
  }

  return [
    primaryLinks.value,
    speakerLinks,
    visiblePlayLinks.value,
  ].filter((group) => group.length > 0);
});
const modeSwitchLink = computed(() => (isAdminRoute.value ? '/' : adminPath('events')));
const modeSwitchLabel = computed(() => (isAdminRoute.value ? 'Community' : 'Organizer'));
const brandHomeLink = computed(() => (isAdminRoute.value ? adminPath('events') : '/'));
const showModeSwitch = computed(() => isAdminRoute.value || showOrganizerLink);
const showSignOut = computed(() => isAdminRoute.value && route.path !== adminPath('login'));
const showHeaderActions = computed(() => showModeSwitch.value || showSignOut.value);
const showFeedbackBot = computed(() => feedbackBotEnabled && !isAdminRoute.value && !route.path.startsWith('/feedback'));
const shouldLoadRouteFeedbackSummary = computed(() => (
  isAdminRoute.value
  && !showOrganizerPhoneView.value
  && route.path !== adminPath('login')
  && route.path !== adminPath('feedback')
));
const routeFeedbackInboxQuery = useQuery({
  queryKey: queryKeys.routeFeedbackInbox,
  queryFn: fetchRouteFeedbackInbox,
  enabled: shouldLoadRouteFeedbackSummary,
});
const routeFeedbackSummary = computed<RouteFeedbackSummary | null>(() => {
  if (!shouldLoadRouteFeedbackSummary.value) return null;
  return routeFeedbackInboxQuery.data.value?.summary ?? null;
});
const routeFeedbackBadgeCount = computed(() => routeFeedbackSummary.value?.new ?? 0);
const keyboardDismissStyle = computed(() => ({
  transform: `translate3d(0, -${keyboardInset.value}px, 0)`,
}));
const adminReturnSource = computed(() => {
  const value = route.query.from;
  if (value === 'attendance' || value === 'feedback') return value;
  return null;
});
const adminFeedbackReturnMonth = computed(() => {
  const value = route.query.month;
  return typeof value === 'string' && /^\d{4}-\d{2}$/.test(value) ? value : null;
});
const adminReturnSearch = computed(() => {
  if (!adminReturnSource.value) return '';

  const params = new URLSearchParams({ from: adminReturnSource.value });
  if (adminReturnSource.value === 'feedback' && adminFeedbackReturnMonth.value) {
    params.set('month', adminFeedbackReturnMonth.value);
  }
  return params.toString();
});
const adminReturnLink = computed(() => {
  if (adminReturnSource.value === 'attendance') {
    return { href: adminPath('attendance'), label: 'Attendance Hub' };
  }

  if (adminReturnSource.value === 'feedback') {
    if (adminFeedbackReturnMonth.value) {
      const params = new URLSearchParams({
        stream: 'event',
        month: adminFeedbackReturnMonth.value,
      });
      return { href: `${adminPath('feedback')}?${params.toString()}`, label: 'Feedback Hub' };
    }

    return { href: adminPath('feedback'), label: 'Feedback Hub' };
  }

  return null;
});
const activeNavHref = computed(() => {
  if (showOrganizerPhoneView.value) {
    return adminPath('events');
  }

  if (isAdminRoute.value && adminReturnLink.value && adminEventId.value) {
    return adminReturnLink.value.href;
  }

  return navGroups.value
    .flat()
    .filter((link) => {
      if (link.href === '/') return route.path === '/';
      return route.path === link.href || route.path.startsWith(`${link.href}/`);
    })
    .sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null;
});
const currentEventLabel = computed(() => {
  if (!adminEventId.value) return 'Event';
  return adminEventNames.value[adminEventId.value] ?? 'Event';
});
const showAdminEventTabs = computed(() => Boolean(
  !showOrganizerPhoneView.value
  && adminEventId.value
  && route.path.startsWith(adminPath(`events/${adminEventId.value}`)),
));
const appMainStyle = computed(() => ({
  '--admin-event-tabs-height': showAdminEventTabs.value ? `${adminEventTabsHeight.value}px` : '0px',
}));
const breadcrumbItems = computed(() => {
  const items: { label: string; href?: string }[] = [];
  const path = route.path;

  if (path === '/' || path === adminPath('login')) return items;

  if (isAdminRoute.value) {
    items.push({ label: 'Organizer', href: adminPath('events') });

    if (path === adminPath('events')) {
      items.push({ label: 'Events' });
      return items;
    }

    if (path === adminPath('attendance')) {
      items.push({ label: 'Attendance' });
      return items;
    }

    if (path === adminPath('feedback')) {
      items.push({ label: 'Feedback' });
      return items;
    }

    if (path === adminPath('organizers')) {
      items.push({ label: 'Organizers' });
      return items;
    }

    if (path === adminPath('audit-log')) {
      items.push({ label: 'Audit Log' });
      return items;
    }

    if (path === adminPath('events/new')) {
      items.push({ label: 'Events', href: adminPath('events') });
      items.push({ label: 'Create event' });
      return items;
    }

    if (adminEventId.value) {
      if (adminReturnLink.value) {
        items.push({ label: adminReturnLink.value.label, href: adminReturnLink.value.href });
      } else {
        items.push({ label: 'Events', href: adminPath('events') });
      }

      const eventHref = adminReturnSource.value && adminReturnSearch.value
        ? `${adminPath(`events/${adminEventId.value}`)}?${adminReturnSearch.value}`
        : adminPath(`events/${adminEventId.value}`);
      items.push({ label: currentEventLabel.value, href: eventHref });

      if (path.includes('/talks')) items.push({ label: 'Talks' });
      else if (path.includes('/speakers')) items.push({ label: 'Speakers' });
      else if (path.includes('/attendance')) items.push({ label: 'Attendance' });
      else if (path.includes('/quiz/live')) items.push({ label: 'Live quiz' });
      else if (path.includes('/quiz')) items.push({ label: 'Quiz' });
      else if (path.includes('/feedback')) items.push({ label: 'Feedback' });
      else items[items.length - 1] = { label: currentEventLabel.value };
    }

    return items;
  }

  items.push({ label: 'Home', href: '/' });

  if (path === '/events') items.push({ label: 'Events' });
  else if (path === '/archive') items.push({ label: 'Archive' });
  else if (path.startsWith('/archive/')) {
    items.push({ label: 'Archive', href: '/archive' });
    items.push({ label: 'Event' });
  } else if (path === '/leaderboard') items.push({ label: 'Leaderboard' });
  else if (path === '/my-talks') items.push({ label: 'My Talks' });
  else if (path.startsWith('/cfp/')) items.push({ label: 'Call for proposals' });
  else if (path === '/feedback' || path.startsWith('/feedback/')) items.push({ label: 'Feedback' });
  else if (path === '/play') items.push({ label: 'Play' });
  else if (path.startsWith('/play/')) {
    items.push({ label: 'Play', href: '/play' });
    items.push({ label: 'Join code' });
  }

  return items;
});
const showBreadcrumbs = computed(() => !showOrganizerPhoneView.value && isAdminRoute.value && breadcrumbItems.value.length > 1);

const adminEventSectionOrder = ['', 'talks', 'speakers', 'attendance', 'quiz', 'feedback'];

function getAdminEventSection(path: string): { eventId: string; index: number } | null {
  const eventsBase = `${adminPath('events')}/`;
  if (!path.startsWith(eventsBase)) return null;

  const [eventId, section = ''] = path.slice(eventsBase.length).split('/');
  if (!eventId || eventId === 'new') return null;

  const normalizedSection = section === 'quiz' ? 'quiz' : section;
  const index = adminEventSectionOrder.indexOf(normalizedSection);
  if (index === -1) return null;

  return { eventId, index };
}

function updateRouteTransition(toPath: string, fromPath?: string) {
  if (!fromPath) {
    routeTransitionName.value = 'page';
    return;
  }

  const toSection = getAdminEventSection(toPath);
  const fromSection = getAdminEventSection(fromPath);

  if (toSection && fromSection && toSection.eventId === fromSection.eventId && toSection.index !== fromSection.index) {
    routeTransitionName.value = toSection.index > fromSection.index ? 'page-tab-forward' : 'page-tab-back';
    return;
  }

  routeTransitionName.value = 'page';
}

function isActive(href: string) {
  return activeNavHref.value === href;
}

function isFeedbackHubLink(link: NavLink) {
  return link.href === adminPath('feedback');
}

function linkClass(link: NavLink) {
  if (isActive(link.href)) {
    return link.accent
      ? 'border-dc-ink bg-dc-pink text-white shadow-[2px_2px_0_#111111]'
      : 'border-dc-ink bg-dc-yellow text-dc-ink shadow-[2px_2px_0_#111111]';
  }

  if (link.accent) {
    return 'border-dc-ink bg-dc-yellow text-dc-ink hover:bg-dc-yellow-glow';
  }

  return 'border-transparent text-dc-gray hover:border-dc-border hover:bg-dc-paper-warm hover:text-dc-ink';
}

function closeMobileMenu() {
  mobileMenuOpen.value = false;
}

function toggleMobileMenu() {
  mobileMenuOpen.value = !mobileMenuOpen.value;
}

function resetMainScroll() {
  const scrollToTop = () => {
    document.querySelector('.app-main')?.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  };

  scrollToTop();
  void nextTick(scrollToTop);
  window.requestAnimationFrame(scrollToTop);
  window.setTimeout(scrollToTop, 280);
}

function isMobileViewport() {
  return window.matchMedia('(max-width: 640px)').matches;
}

function syncPhoneViewport() {
  phoneViewport.value = window.matchMedia('(max-width: 767px)').matches;
}

function isEditableElement(element: Element | null): element is HTMLElement {
  if (!(element instanceof HTMLElement)) return false;
  if (element.isContentEditable) return true;
  return element.matches('input:not([type="hidden"]):not([readonly]):not([disabled]), textarea:not([readonly]):not([disabled]), select:not([disabled])');
}

function updateKeyboardInset() {
  const visualViewport = window.visualViewport;
  if (!visualViewport) {
    keyboardInset.value = 0;
    return;
  }

  keyboardInset.value = Math.max(0, Math.round(window.innerHeight - visualViewport.height - visualViewport.offsetTop));
}

function syncKeyboardDismissVisibility() {
  window.clearTimeout(keyboardFocusTimer);
  keyboardFocusTimer = window.setTimeout(() => {
    keyboardDismissVisible.value = isMobileViewport() && isEditableElement(document.activeElement);
    updateKeyboardInset();
  }, 0);
}

function dismissMobileKeyboard() {
  if (isEditableElement(document.activeElement)) {
    document.activeElement.blur();
  }
  keyboardDismissVisible.value = false;
  keyboardInset.value = 0;
}

function updateAdminEventTabsHeight() {
  adminEventTabsHeight.value = adminEventTabsShell.value?.offsetHeight ?? 0;
}

function syncAdminEventTabsObserver() {
  adminEventTabsResizeObserver?.disconnect();

  if (!adminEventTabsShell.value) {
    updateAdminEventTabsHeight();
    return;
  }

  adminEventTabsResizeObserver?.observe(adminEventTabsShell.value);
  updateAdminEventTabsHeight();
}

function handleDocumentPointerDown(event: PointerEvent) {
  if (!isMobileViewport() || !isEditableElement(document.activeElement)) return;

  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest('.keyboard-dismiss-control')) return;
  if (isEditableElement(target) || target.closest('input, textarea, select, [contenteditable="true"]')) return;

  dismissMobileKeyboard();
}

async function logout() {
  closeMobileMenu();
  await fetch('/api/auth/logout', { method: 'POST' });
  await router.push('/');
}

async function refreshQuizAvailability() {
  quizAvailable.value = false;
}

async function refreshAdminEventNames() {
  if (showOrganizerPhoneView.value) {
    return;
  }

  if (!isAdminRoute.value || route.path === adminPath('login')) {
    return;
  }

  const eventId = adminEventId.value;
  if (!eventId) return;

  const cachedEventName = adminEventNames.value[eventId]
    ?? queryClient.getQueryData<AdminEventSummary[]>(queryKeys.events)?.find((event) => event.id === eventId)?.name
    ?? queryClient.getQueryData<AdminEventSummary>(queryKeys.event(eventId))?.name;

  if (cachedEventName) {
    adminEventNames.value = {
      ...adminEventNames.value,
      [eventId]: cachedEventName,
    };
    return;
  }

  try {
    const event = await queryClient.fetchQuery({
      queryKey: queryKeys.event(eventId),
      queryFn: () => fetchEventById(eventId),
    });
    if (adminEventId.value !== eventId) return;
    adminEventNames.value = {
      ...adminEventNames.value,
      [eventId]: event.name,
    };
  } catch {
    adminEventNames.value = {
      ...adminEventNames.value,
      [eventId]: 'Event',
    };
  }
}

onMounted(() => {
  if (typeof ResizeObserver !== 'undefined') {
    adminEventTabsResizeObserver = new ResizeObserver(updateAdminEventTabsHeight);
  }

  document.addEventListener('pointerdown', handleDocumentPointerDown, { capture: true });
  document.addEventListener('focusin', syncKeyboardDismissVisibility);
  document.addEventListener('focusout', syncKeyboardDismissVisibility);
  window.addEventListener('resize', syncKeyboardDismissVisibility);
  window.addEventListener('resize', syncPhoneViewport);
  window.addEventListener('resize', updateAdminEventTabsHeight);
  window.visualViewport?.addEventListener('resize', updateKeyboardInset);
  window.visualViewport?.addEventListener('scroll', updateKeyboardInset);
  syncPhoneViewport();
  void nextTick(syncAdminEventTabsObserver);
  void refreshQuizAvailability();
  void refreshAdminEventNames();
  quizAvailabilityInterval = window.setInterval(() => {
    void refreshQuizAvailability();
  }, 15000);
});

watch(() => route.path, (toPath, fromPath) => {
  closeMobileMenu();
  dismissMobileKeyboard();
  resetMainScroll();
  updateRouteTransition(toPath, fromPath);
  void nextTick(syncAdminEventTabsObserver);
  void refreshAdminEventNames();
});

watch(
  () => ({
    authenticated: adminSessionQuery.data.value?.authenticated,
    routePath: route.path,
    routeFullPath: route.fullPath,
  }),
  ({ authenticated, routePath, routeFullPath }) => {
    if (!isAdminPath(routePath) || routePath === adminPath('login') || routePath === adminPath('auth/callback')) {
      return;
    }

    if (authenticated === false) {
      void router.replace({
        path: adminPath('login'),
        query: { redirect: routeFullPath },
      });
    }
  },
);

onUnmounted(() => {
  window.clearTimeout(keyboardFocusTimer);
  adminEventTabsResizeObserver?.disconnect();
  document.removeEventListener('pointerdown', handleDocumentPointerDown, { capture: true });
  document.removeEventListener('focusin', syncKeyboardDismissVisibility);
  document.removeEventListener('focusout', syncKeyboardDismissVisibility);
  window.removeEventListener('resize', syncKeyboardDismissVisibility);
  window.removeEventListener('resize', syncPhoneViewport);
  window.removeEventListener('resize', updateAdminEventTabsHeight);
  window.visualViewport?.removeEventListener('resize', updateKeyboardInset);
  window.visualViewport?.removeEventListener('scroll', updateKeyboardInset);
  if (quizAvailabilityInterval !== undefined) {
    window.clearInterval(quizAvailabilityInterval);
  }
});
</script>

<template>
  <div class="app-shell flex flex-col overflow-hidden bg-dc-cream text-dc-ink" :class="{ 'app-shell--community': !isAdminRoute }">
    <header class="app-header z-50 border-b-2 border-dc-ink bg-dc-cream/96 backdrop-blur-md">
      <div class="app-header-inner grid w-full grid-cols-[1fr_auto] gap-x-4 gap-y-3 px-4 py-4 sm:px-6 lg:grid-cols-[auto_1fr_auto] lg:items-center lg:gap-8 lg:px-8">
        <RouterLink :to="brandHomeLink" class="group flex min-h-11 items-center">
          <img
            :src="logoSrc"
            alt="DevCongress"
            class="app-brand-logo h-8 w-auto max-w-[13rem] object-contain sm:h-9 sm:max-w-[15rem]"
          >
        </RouterLink>

        <div v-if="showHeaderActions" class="app-header-actions flex items-center justify-end gap-3 lg:order-3">
          <span v-if="showModeSwitch || showSignOut" class="hidden h-8 w-px rounded-full bg-dc-ink/30 sm:block" />
          <RouterLink
            v-if="showModeSwitch"
            :to="modeSwitchLink"
            class="motion-press flex min-h-11 items-center rounded-md border-2 border-dc-ink bg-dc-paper px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-dc-ink shadow-[2px_2px_0_#111111] hover:bg-dc-yellow"
          >
            {{ modeSwitchLabel }}
          </RouterLink>
          <button
            v-if="showSignOut"
            class="motion-press flex min-h-11 items-center rounded-md border-2 border-dc-ink bg-dc-paper px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-wider text-dc-ink shadow-[2px_2px_0_#111111] hover:bg-dc-yellow"
            @click="logout"
          >
            Sign Out
          </button>
        </div>

        <button
          class="app-mobile-menu-toggle motion-press hidden min-h-11 items-center justify-center rounded-md border-2 border-dc-ink bg-dc-paper px-3 font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-dc-ink shadow-[2px_2px_0_#111111]"
          type="button"
          :aria-expanded="mobileMenuOpen"
          aria-controls="mobile-menu-panel"
          aria-label="Open navigation menu"
          @click="toggleMobileMenu"
        >
          <span class="app-mobile-menu-icon" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span>Menu</span>
        </button>

        <nav class="app-primary-nav col-span-2 flex min-w-0 items-center gap-2 overflow-x-auto font-mono text-[11px] font-semibold uppercase tracking-wide sm:gap-3 sm:text-xs lg:order-2 lg:col-span-1" aria-label="Primary">
          <template v-for="(group, groupIndex) in navGroups" :key="groupIndex">
            <RouterLink
              v-for="link in group"
              :key="link.href"
              :to="link.href"
              class="app-nav-link motion-press relative flex min-h-11 shrink-0 items-center rounded-md border-2 px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dc-pink/35"
              :class="[link.accent ? 'sm:px-3' : '', linkClass(link)]"
              :aria-current="isActive(link.href) ? 'page' : undefined"
            >
              <span class="relative z-10">{{ link.label }}</span>
              <span
                v-if="isFeedbackHubLink(link) && routeFeedbackBadgeCount > 0"
                class="app-nav-badge"
                aria-label="New route feedback"
              >
                {{ routeFeedbackBadgeCount > 99 ? '99+' : routeFeedbackBadgeCount }}
              </span>
            </RouterLink>
          </template>
        </nav>
      </div>
    </header>

    <Transition name="mobile-menu">
      <div
        v-if="mobileMenuOpen"
        id="mobile-menu-panel"
        class="app-mobile-menu"
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        @keydown.esc="closeMobileMenu"
      >
        <div class="app-mobile-menu-bar">
          <img :src="logoSrc" alt="DevCongress" class="app-mobile-menu-logo">
          <button
            class="app-mobile-menu-close motion-press"
            type="button"
            aria-label="Close navigation menu"
            @click="closeMobileMenu"
          >
            <span aria-hidden="true">x</span>
          </button>
        </div>

        <div class="app-mobile-menu-actions">
          <RouterLink
            v-if="showModeSwitch"
            :to="modeSwitchLink"
            class="app-mobile-menu-action"
            @click="closeMobileMenu"
          >
            {{ modeSwitchLabel }}
          </RouterLink>
          <button
            v-if="showSignOut"
            class="app-mobile-menu-action"
            type="button"
            @click="logout"
          >
            Sign Out
          </button>
        </div>

        <nav class="app-mobile-menu-nav" aria-label="Mobile primary">
          <template v-for="(group, groupIndex) in navGroups" :key="groupIndex">
            <RouterLink
              v-for="link in group"
              :key="link.href"
              :to="link.href"
              class="app-mobile-menu-link motion-press"
              :class="{ 'app-mobile-menu-link--active': isActive(link.href), 'app-mobile-menu-link--accent': link.accent }"
              :aria-current="isActive(link.href) ? 'page' : undefined"
              @click="closeMobileMenu"
            >
              <span>{{ link.label }}</span>
              <span
                v-if="isFeedbackHubLink(link) && routeFeedbackBadgeCount > 0"
                class="app-mobile-menu-badge"
                aria-label="New route feedback"
              >
                {{ routeFeedbackBadgeCount > 99 ? '99+' : routeFeedbackBadgeCount }}
              </span>
            </RouterLink>
          </template>
        </nav>

        <div class="app-mobile-menu-footer">
          <p>DevCongress Community</p>
          <RouterLink to="/feedback" @click="closeMobileMenu">
            Send feedback
          </RouterLink>
        </div>
      </div>
    </Transition>

    <nav
      v-if="showBreadcrumbs"
      class="border-b border-dc-border/70 bg-dc-cream px-4 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] sm:px-6 lg:px-8"
      aria-label="Breadcrumb"
    >
      <ol class="flex min-w-0 items-center gap-2 overflow-x-auto font-mono text-[11px] font-bold uppercase tracking-wide text-dc-gray">
        <li
          v-for="(item, index) in breadcrumbItems"
          :key="`${item.label}-${index}`"
          class="flex shrink-0 items-center gap-2"
        >
          <RouterLink
            v-if="item.href && index < breadcrumbItems.length - 1"
            :to="item.href"
            class="app-breadcrumb-link"
          >
            {{ item.label }}
          </RouterLink>
          <span
            v-else
            class="app-breadcrumb-current"
            aria-current="page"
          >
            {{ item.label }}
          </span>
          <span
            v-if="index < breadcrumbItems.length - 1"
            class="app-breadcrumb-separator"
            aria-hidden="true"
          >
            ›
          </span>
        </li>
      </ol>
    </nav>

    <main
      class="app-main page-transition-host min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
      :class="{ 'app-main--with-event-tabs': showAdminEventTabs }"
      :style="appMainStyle"
    >
      <div v-if="showAdminEventTabs && adminEventId" ref="adminEventTabsShell" class="admin-event-tabs-shell bg-dc-cream text-dc-ink">
        <div class="editorial-wrap event-tabs-wrap pb-0">
          <RouterLink
            v-if="adminReturnLink"
            :to="adminReturnLink.href"
            class="mb-3 inline-flex items-center rounded-md border-2 border-dc-ink bg-dc-paper px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-wide text-dc-ink shadow-[2px_2px_0_#111111] hover:bg-dc-yellow"
          >
            Back to {{ adminReturnLink.label }}
          </RouterLink>
          <AdminEventTabs :event-id="adminEventId" />
        </div>
      </div>

      <div class="page-route-stack">
        <AdminMobileOrganizerView v-if="showOrganizerPhoneView" class="page-view" />
        <RouterView v-else v-slot="{ Component, route }">
          <Transition :name="routeTransitionName" @after-enter="resetMainScroll">
            <component :is="Component" :key="route.fullPath" class="page-view" />
          </Transition>
        </RouterView>
      </div>
    </main>

    <FeedbackBot v-if="showFeedbackBot" />
    <button
      v-if="keyboardDismissVisible"
      class="keyboard-dismiss-control motion-press"
      type="button"
      :style="keyboardDismissStyle"
      aria-label="Dismiss keyboard"
      @pointerdown.prevent="dismissMobileKeyboard"
      @click="dismissMobileKeyboard"
    >
      Done
    </button>
    <AppToaster />
  </div>
</template>
