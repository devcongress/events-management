<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query';
import { computed, defineAsyncComponent, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import OrganizerSessionPause from './components/OrganizerSessionPause.vue';
import AppToaster from './components/ui/AppToaster.vue';
import AppBootScreen from './components/ui/AppBootScreen.vue';
import { ADMIN_OAUTH_REDIRECT_STORAGE_KEY, adminPath, isAdminPath } from './admin-routes';
import { annualConferencePath } from './annual-conference';
import { fetchAdminSession, queryKeys, type AdminSessionResponse } from './lib/api';
import { notify } from './lib/notify';
import { queryClient } from './lib/query';
import { SYSTEM_DESIGN_PARTICIPANT_ROUTE_NAME } from './system-design-participant-route';
import {
  ORGANIZER_PHONE_MEDIA_QUERY,
  ORGANIZER_PHONE_CHECK_IN_ROUTE_NAME,
  ORGANIZER_PHONE_ROUTE_NAME,
  ORGANIZER_PHONE_ROUTE_PATH,
  isOrganizerPhoneRouteName,
  organizerViewportRedirect,
} from './organizer-viewport';
import { SPEAKER_TALK_INTAKE_ROUTE_NAME } from './speaker-intake-route';
import { isSystemDesignPresenterPath, SYSTEM_DESIGN_PRESENTER_ROUTE_NAME } from './system-design-presenter-route';

interface NavLink {
  href: string;
  label: string;
  accent?: boolean;
}

const AdminEventTabs = defineAsyncComponent(() => import('./components/AdminEventTabs.vue'));
const AdminLoginView = defineAsyncComponent(() => import('./views/admin/AdminLoginView.vue'));
const route = useRoute();
const router = useRouter();
const initialBrowserPath = typeof window === 'undefined' ? '/' : window.location.pathname;
const startedOnProtectedOrganizerRoute = (
  (isAdminPath(initialBrowserPath) || isSystemDesignPresenterPath(initialBrowserPath))
  && initialBrowserPath !== adminPath('login')
  && initialBrowserPath !== adminPath('auth/callback')
);
const organizerPhoneMedia = typeof window === 'undefined'
  ? null
  : window.matchMedia(ORGANIZER_PHONE_MEDIA_QUERY);
const routeTransitionName = ref('page');
const mobileMenuOpen = ref(false);
const phoneViewport = ref(organizerPhoneMedia?.matches ?? false);
const keyboardDismissVisible = ref(false);
const keyboardInset = ref(0);
const adminEventTabsShell = ref<HTMLElement | null>(null);
const adminEventTabsHeight = ref(0);
const logoSrc = '/brand/dev-con-logo.png';
const ORGANIZER_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const ORGANIZER_IDLE_WARNING_MS = 2 * 60 * 1000;
const ORGANIZER_SESSION_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const organizerSessionPauseState = ref<'warning' | 'locked' | null>(null);
const organizerWarningSeconds = ref(120);
let keyboardFocusTimer: number | undefined;
let adminEventTabsResizeObserver: ResizeObserver | undefined;
let organizerIdleWarningTimer: number | undefined;
let organizerIdleExpiryTimer: number | undefined;
let organizerAbsoluteExpiryTimer: number | undefined;
let organizerWarningTicker: number | undefined;
let organizerWarningDeadlineMs = 0;
let organizerLastActivityAt = 0;
let organizerNextSessionRefreshAt = 0;
let organizerSessionEnding = false;

const adminBaseLinks: NavLink[] = [
  { href: adminPath('events'), label: 'Events' },
  { href: adminPath('attendance'), label: 'Attendance Hub' },
  { href: adminPath('feedback'), label: 'Feedback Hub' },
  { href: annualConferencePath(), label: 'Annual Conference' },
  { href: adminPath('organizers'), label: 'People & Access' },
];
const ownerAdminLinks: NavLink[] = [
  { href: adminPath('audit-log'), label: 'Audit Log' },
];
const isAdminRoute = computed(() => isAdminPath(route.path));
const isOrganizerProtectedRoute = computed(() => isAdminRoute.value || route.meta.requiresOrganizer === true);
const isStandaloneRoute = computed(() => (
  route.name === 'event-feedback'
  || route.name === SYSTEM_DESIGN_PARTICIPANT_ROUTE_NAME
  || route.name === 'event-cfp'
  || route.name === 'event-registration-short'
  || route.name === 'event-registration'
  || route.name === ORGANIZER_PHONE_CHECK_IN_ROUTE_NAME
  || route.name === 'admin-feedback-display'
  || route.name === 'admin-public-events-preview'
  || route.name === 'admin-public-event-preview'
  || route.name === SPEAKER_TALK_INTAKE_ROUTE_NAME
  || route.name === 'volunteer-intake'
  || route.name === 'admin-annual-conference-volunteer-display'
  || route.name === SYSTEM_DESIGN_PRESENTER_ROUTE_NAME
));
const isLoginRoute = computed(() => route.path === adminPath('login') || route.path === adminPath('auth/callback'));
const adminSessionQuery = useQuery({
  queryKey: queryKeys.adminSession,
  queryFn: fetchAdminSession,
  enabled: isOrganizerProtectedRoute,
});
const organizerAccessUnresolved = computed(() => (
  (isAdminRoute.value || startedOnProtectedOrganizerRoute)
  && !isLoginRoute.value
  && adminSessionQuery.data.value === undefined
));
const showOrganizerAccessError = computed(() => (
  organizerAccessUnresolved.value && adminSessionQuery.isError.value
));
const showOrganizerAccessGate = computed(() => (
  organizerAccessUnresolved.value && !adminSessionQuery.isError.value
));
const showOrganizerAccessSurface = computed(() => (
  showOrganizerAccessError.value || showOrganizerAccessGate.value
));
const isOrganizerAuthenticated = computed(() => adminSessionQuery.data.value?.authenticated === true);
const isConferenceVolunteer = computed(() => adminSessionQuery.data.value?.user?.role === 'volunteer');
const showAppHeader = computed(() => !isStandaloneRoute.value && isOrganizerAuthenticated.value);
const showPrimaryNavigation = computed(() => (
  showAppHeader.value
  && isOrganizerAuthenticated.value
  && !isConferenceVolunteer.value
));
const adminLinks = computed(() => {
  const session = adminSessionQuery.data.value;
  if (session?.authenticated && session.user?.role === 'volunteer') {
    return [];
  }

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
const primaryLinks = computed(() => adminLinks.value);
const showOrganizerPhoneView = computed(() => (
  isOrganizerAuthenticated.value
  && !isConferenceVolunteer.value
  && isAdminRoute.value
  && phoneViewport.value
  && isOrganizerPhoneRouteName(route.name)
));
const navGroups = computed(() => {
  if (showOrganizerPhoneView.value) {
    return [[{ href: ORGANIZER_PHONE_ROUTE_PATH, label: 'Mobile Ops' }]];
  }

  if (isAdminRoute.value) {
    return [primaryLinks.value];
  }

  return [];
});
const brandHomeLink = computed(() => (
  showOrganizerPhoneView.value
    ? ORGANIZER_PHONE_ROUTE_PATH
    : isConferenceVolunteer.value
      ? annualConferencePath()
      : adminPath('events')
));
const showSignOut = computed(() => isOrganizerAuthenticated.value && !isLoginRoute.value);
const showHeaderActions = computed(() => showSignOut.value);
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
const adminReturnLink = computed(() => {
  if (adminReturnSource.value === 'attendance') {
    return { href: adminPath('attendance'), label: 'Attendance Hub' };
  }

  if (adminReturnSource.value === 'feedback') {
    if (adminFeedbackReturnMonth.value) {
      const params = new URLSearchParams({ month: adminFeedbackReturnMonth.value });
      return { href: `${adminPath('feedback')}?${params.toString()}`, label: 'Feedback Hub' };
    }

    return { href: adminPath('feedback'), label: 'Feedback Hub' };
  }

  return null;
});
const activeNavHref = computed(() => {
  if (showOrganizerPhoneView.value) {
    return ORGANIZER_PHONE_ROUTE_PATH;
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
const showAdminEventTabs = computed(() => Boolean(
  isOrganizerAuthenticated.value
  && !showOrganizerPhoneView.value
  && adminEventId.value
  && route.path.startsWith(adminPath(`events/${adminEventId.value}`)),
));
const appMainStyle = computed(() => ({
  '--admin-event-tabs-height': showAdminEventTabs.value ? `${adminEventTabsHeight.value}px` : '0px',
}));
const adminEventSectionOrder = ['', 'registrations', 'talks', 'speakers', 'attendance', 'quiz', 'feedback'];
const annualConferenceSectionOrder = ['', 'work-plan', 'timeline', 'volunteers'];

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

function getAnnualConferenceSection(path: string): { year: string; index: number } | null {
  const conferenceBase = `${adminPath('annual-conference')}/`;
  if (!path.startsWith(conferenceBase)) return null;

  const [year, section = '', extraSegment] = path.slice(conferenceBase.length).split('/');
  if (!/^\d{4}$/.test(year) || extraSegment) return null;

  const index = annualConferenceSectionOrder.indexOf(section);
  if (index === -1) return null;

  return { year, index };
}

function updateRouteTransition(toPath: string, fromPath?: string) {
  if (!fromPath) {
    routeTransitionName.value = 'page';
    return;
  }

  const toConferenceSection = getAnnualConferenceSection(toPath);
  const fromConferenceSection = getAnnualConferenceSection(fromPath);

  if (
    toConferenceSection
    && fromConferenceSection
    && toConferenceSection.year === fromConferenceSection.year
    && toConferenceSection.index !== fromConferenceSection.index
  ) {
    routeTransitionName.value = 'page-stable';
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

function routeViewKey(routeForKey: typeof route) {
  if (routeForKey.name === 'admin-login') {
    return 'admin-login';
  }

  if (routeForKey.name === 'admin-events' || routeForKey.name === 'admin-event-submissions') {
    return 'admin-events-workspace';
  }

  if (routeForKey.name === 'admin-talks') {
    const value = routeForKey.params.eventId;
    const eventId = Array.isArray(value) ? value[0] : value;
    return `admin-talks:${String(eventId ?? '')}`;
  }

  return routeForKey.fullPath;
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

function retryOrganizerAccess() {
  void adminSessionQuery.refetch();
}

function clearOrganizerIdleTimers() {
  window.clearTimeout(organizerIdleWarningTimer);
  window.clearTimeout(organizerIdleExpiryTimer);
  window.clearInterval(organizerWarningTicker);
  organizerIdleWarningTimer = undefined;
  organizerIdleExpiryTimer = undefined;
  organizerWarningTicker = undefined;
}

function clearOrganizerSessionTimers() {
  clearOrganizerIdleTimers();
  window.clearTimeout(organizerAbsoluteExpiryTimer);
  organizerAbsoluteExpiryTimer = undefined;
}

function clearOrganizerCachedData() {
  queryClient.removeQueries({
    predicate: (query) => query.queryKey[0] !== queryKeys.adminSession[0],
  });
  queryClient.setQueryData<AdminSessionResponse>(queryKeys.adminSession, {
    authenticated: false,
    auth_mode: 'supabase',
    auth_configured: true,
  });
}

function clearLocalSupabaseSession() {
  void import('@/lib/supabase/browser')
    .then(({ getSupabaseBrowserClient }) => getSupabaseBrowserClient()?.auth.signOut({ scope: 'local' }))
    .catch(() => undefined);
}

function lockOrganizerSession() {
  if (organizerSessionEnding) return;
  organizerSessionEnding = true;
  clearOrganizerSessionTimers();
  clearOrganizerCachedData();
  window.sessionStorage.removeItem(ADMIN_OAUTH_REDIRECT_STORAGE_KEY);
  clearLocalSupabaseSession();
  organizerSessionPauseState.value = 'locked';
  void fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'include',
    keepalive: true,
  }).catch(() => undefined);
}

function updateOrganizerWarningCountdown() {
  organizerWarningSeconds.value = Math.max(0, Math.ceil((organizerWarningDeadlineMs - Date.now()) / 1000));
}

function showOrganizerIdleWarning() {
  if (!isOrganizerAuthenticated.value || organizerSessionEnding) return;
  organizerWarningDeadlineMs = Date.now() + ORGANIZER_IDLE_WARNING_MS;
  updateOrganizerWarningCountdown();
  organizerSessionPauseState.value = 'warning';
  organizerWarningTicker = window.setInterval(updateOrganizerWarningCountdown, 1000);
}

function scheduleOrganizerIdleExpiry() {
  clearOrganizerIdleTimers();
  if (!isOrganizerAuthenticated.value || organizerSessionEnding) return;

  const elapsedMs = Math.max(0, Date.now() - organizerLastActivityAt);
  const warningDelayMs = Math.max(0, ORGANIZER_IDLE_TIMEOUT_MS - ORGANIZER_IDLE_WARNING_MS - elapsedMs);
  const expiryDelayMs = Math.max(0, ORGANIZER_IDLE_TIMEOUT_MS - elapsedMs);

  organizerIdleWarningTimer = window.setTimeout(showOrganizerIdleWarning, warningDelayMs);
  organizerIdleExpiryTimer = window.setTimeout(lockOrganizerSession, expiryDelayMs);
}

function scheduleOrganizerAbsoluteExpiry(expiresAt: string | undefined) {
  window.clearTimeout(organizerAbsoluteExpiryTimer);
  organizerAbsoluteExpiryTimer = undefined;
  if (!expiresAt || organizerSessionEnding) return;

  const expiresAtMs = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiresAtMs)) return;
  organizerAbsoluteExpiryTimer = window.setTimeout(lockOrganizerSession, Math.max(0, expiresAtMs - Date.now()));
}

async function revalidateOrganizerSession() {
  try {
    const session = await queryClient.fetchQuery({
      queryKey: queryKeys.adminSession,
      queryFn: fetchAdminSession,
      staleTime: 0,
    });
    if (!session.authenticated) lockOrganizerSession();
  } catch {
    // A transient network error must not extend the server-side expiry.
  }
}

async function staySignedIn() {
  try {
    const session = await queryClient.fetchQuery({
      queryKey: queryKeys.adminSession,
      queryFn: fetchAdminSession,
      staleTime: 0,
    });
    if (!session.authenticated) {
      lockOrganizerSession();
      return;
    }

    organizerSessionPauseState.value = null;
    organizerLastActivityAt = Date.now();
    organizerNextSessionRefreshAt = organizerLastActivityAt + ORGANIZER_SESSION_REFRESH_INTERVAL_MS;
    scheduleOrganizerIdleExpiry();
    scheduleOrganizerAbsoluteExpiry(session.expires_at);
  } catch {
    lockOrganizerSession();
  }
}

function recordOrganizerActivity(forceRefresh = false) {
  if (!isOrganizerAuthenticated.value || organizerSessionEnding || organizerSessionPauseState.value) return;

  organizerLastActivityAt = Date.now();
  scheduleOrganizerIdleExpiry();
  if (forceRefresh || organizerLastActivityAt >= organizerNextSessionRefreshAt) {
    organizerNextSessionRefreshAt = organizerLastActivityAt + ORGANIZER_SESSION_REFRESH_INTERVAL_MS;
    void revalidateOrganizerSession();
  }
}

function handleOrganizerActivity() {
  recordOrganizerActivity();
}

function handleOrganizerVisibilityChange() {
  if (document.visibilityState === 'visible') recordOrganizerActivity(true);
}

function signInAfterSessionPause() {
  organizerSessionPauseState.value = null;
  organizerSessionEnding = false;
  void router.replace({
    path: adminPath('login'),
    query: { redirect: route.fullPath },
  });
}

function returnToOrganizerSignIn() {
  void router.replace({
    path: adminPath('login'),
    query: { redirect: route.fullPath },
  });
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
  return organizerPhoneMedia?.matches ?? false;
}

function syncPhoneViewport() {
  phoneViewport.value = organizerPhoneMedia?.matches ?? false;
  syncOrganizerViewportRoute();
}

function syncOrganizerViewportRoute() {
  if (isConferenceVolunteer.value) return;

  const redirect = organizerViewportRedirect({
    authenticated: isOrganizerAuthenticated.value,
    isAdminRoute: isAdminRoute.value,
    isPhone: phoneViewport.value,
    routeName: route.name,
    eventId: typeof adminEventId.value === 'string' ? adminEventId.value : null,
  });

  if (redirect && redirect !== route.path) {
    void router.replace(redirect);
  }
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
  try {
    const response = await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
    });

    if (!response.ok) {
      notify.error('Sign-out could not be completed. Please try again.');
      return;
    }

    clearOrganizerSessionTimers();
    organizerSessionPauseState.value = null;
    const cachedSession = queryClient.getQueryData<AdminSessionResponse>(queryKeys.adminSession);
    queryClient.removeQueries({
      predicate: (query) => query.queryKey[0] !== queryKeys.adminSession[0],
    });
    queryClient.setQueryData<AdminSessionResponse>(queryKeys.adminSession, {
      authenticated: false,
      auth_mode: cachedSession?.auth_mode ?? 'supabase',
      auth_configured: cachedSession?.auth_configured ?? true,
    });
    window.sessionStorage.removeItem(ADMIN_OAUTH_REDIRECT_STORAGE_KEY);

    // The app session is the authorization boundary, but clearing this
    // tab-scoped Supabase session prevents a stale OAuth session from
    // immediately re-establishing browser auth after sign-out.
    try {
      const { getSupabaseBrowserClient } = await import('@/lib/supabase/browser');
      const supabase = getSupabaseBrowserClient();
      if (supabase) {
        const { error } = await supabase.auth.signOut({ scope: 'local' });
        if (error) console.warn('Unable to clear the local Supabase browser session.', error);
      }
    } catch (error) {
      // The app-owned session is already revoked above. A best-effort
      // Supabase cleanup must not strand the organizer in the console.
      console.warn('Unable to clear the local Supabase browser session.', error);
    }

    await router.replace(adminPath('login'));
  } catch {
    notify.error('Sign-out could not be completed. Please try again.');
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
  window.addEventListener('resize', updateAdminEventTabsHeight);
  window.visualViewport?.addEventListener('resize', updateKeyboardInset);
  window.visualViewport?.addEventListener('scroll', updateKeyboardInset);
  organizerPhoneMedia?.addEventListener('change', syncPhoneViewport);
  document.addEventListener('pointerdown', handleOrganizerActivity, { capture: true });
  document.addEventListener('keydown', handleOrganizerActivity, { capture: true });
  document.addEventListener('focusin', handleOrganizerActivity, { capture: true });
  window.addEventListener('scroll', handleOrganizerActivity, { capture: true, passive: true });
  document.addEventListener('visibilitychange', handleOrganizerVisibilityChange);
  syncPhoneViewport();
  void nextTick(syncAdminEventTabsObserver);
});

watch(() => route.path, (toPath, fromPath) => {
  closeMobileMenu();
  dismissMobileKeyboard();
  resetMainScroll();
  updateRouteTransition(toPath, fromPath);
  void nextTick(syncAdminEventTabsObserver);
});

watch(
  () => ({
    authenticated: adminSessionQuery.data.value?.authenticated,
    routePath: route.path,
    routeFullPath: route.fullPath,
  }),
  ({ authenticated, routePath, routeFullPath }) => {
    if ((!isAdminPath(routePath) && !isSystemDesignPresenterPath(routePath)) || routePath === adminPath('login') || routePath === adminPath('auth/callback')) {
      return;
    }

    if (authenticated === false && organizerSessionPauseState.value !== 'locked') {
      void router.replace({
        path: adminPath('login'),
        query: { redirect: routeFullPath },
      });
      return;
    }

    if (authenticated === true) syncOrganizerViewportRoute();
  },
);

watch(() => ({
  authenticated: isOrganizerAuthenticated.value,
  expiresAt: adminSessionQuery.data.value?.expires_at,
}), ({ authenticated, expiresAt }) => {
  if (!authenticated) {
    clearOrganizerSessionTimers();
    if (organizerSessionPauseState.value !== 'locked') organizerSessionEnding = false;
    return;
  }

  organizerLastActivityAt = Date.now();
  organizerNextSessionRefreshAt = organizerLastActivityAt + ORGANIZER_SESSION_REFRESH_INTERVAL_MS;
  scheduleOrganizerIdleExpiry();
  scheduleOrganizerAbsoluteExpiry(expiresAt);
}, { immediate: true });

onUnmounted(() => {
  window.clearTimeout(keyboardFocusTimer);
  clearOrganizerSessionTimers();
  adminEventTabsResizeObserver?.disconnect();
  document.removeEventListener('pointerdown', handleDocumentPointerDown, { capture: true });
  document.removeEventListener('focusin', syncKeyboardDismissVisibility);
  document.removeEventListener('focusout', syncKeyboardDismissVisibility);
  window.removeEventListener('resize', syncKeyboardDismissVisibility);
  window.removeEventListener('resize', updateAdminEventTabsHeight);
  window.visualViewport?.removeEventListener('resize', updateKeyboardInset);
  window.visualViewport?.removeEventListener('scroll', updateKeyboardInset);
  organizerPhoneMedia?.removeEventListener('change', syncPhoneViewport);
  document.removeEventListener('pointerdown', handleOrganizerActivity, { capture: true });
  document.removeEventListener('keydown', handleOrganizerActivity, { capture: true });
  document.removeEventListener('focusin', handleOrganizerActivity, { capture: true });
  window.removeEventListener('scroll', handleOrganizerActivity, { capture: true });
  document.removeEventListener('visibilitychange', handleOrganizerVisibilityChange);
});
</script>

<template>
  <div
    class="app-shell flex flex-col overflow-hidden bg-dc-cream text-dc-ink"
    :class="{
      'app-shell--login': isLoginRoute || showOrganizerAccessSurface,
      'app-shell--standalone': isStandaloneRoute,
    }"
  >
    <header v-if="showAppHeader" class="app-header z-50 border-b-2 border-dc-ink bg-dc-cream/96 backdrop-blur-md">
      <div class="app-header-inner grid w-full grid-cols-[1fr_auto] gap-x-4 gap-y-3 px-4 py-4 sm:px-6 lg:grid-cols-[auto_1fr_auto] lg:items-center lg:gap-8 lg:px-8">
        <RouterLink :to="brandHomeLink" class="group flex min-h-11 items-center">
          <img
            :src="logoSrc"
            alt="DevCongress"
            class="app-brand-logo h-8 w-auto max-w-[13rem] object-contain sm:h-9 sm:max-w-[15rem]"
          >
        </RouterLink>

        <div v-if="showHeaderActions" class="app-header-actions flex items-center justify-end gap-3 lg:order-3">
          <span class="hidden h-8 w-px rounded-full bg-dc-ink/30 sm:block" />
          <button
            v-if="showSignOut"
            class="motion-press flex min-h-11 items-center rounded-md border-2 border-dc-ink bg-dc-paper px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-wider text-dc-ink shadow-[2px_2px_0_#111111] hover:bg-dc-yellow"
            @click="logout"
          >
            Sign Out
          </button>
        </div>

        <button
          v-if="showPrimaryNavigation"
          class="app-mobile-menu-toggle motion-press hidden min-h-11 items-center justify-center rounded-md border-2 border-dc-ink bg-dc-paper px-3 font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-dc-ink shadow-[2px_2px_0_#111111]"
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

        <nav v-if="showPrimaryNavigation" class="app-primary-nav col-span-2 flex min-w-0 items-center gap-2 overflow-x-auto font-mono text-[11px] font-semibold uppercase tracking-wide sm:gap-3 sm:text-xs lg:order-2 lg:col-span-1" aria-label="Primary">
          <template v-for="(group, groupIndex) in navGroups" :key="groupIndex">
            <RouterLink
              v-for="link in group"
              :key="link.href"
              :to="link.href"
              class="app-nav-link motion-press relative flex min-h-11 shrink-0 items-center rounded-md border-2 px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dc-ink/25"
              :class="[link.accent ? 'sm:px-3' : '', linkClass(link)]"
              :aria-current="isActive(link.href) ? 'page' : undefined"
            >
              <span class="relative z-10">{{ link.label }}</span>
            </RouterLink>
          </template>
        </nav>
      </div>
    </header>

    <Transition name="mobile-menu">
      <div
        v-if="mobileMenuOpen && showPrimaryNavigation"
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
            </RouterLink>
          </template>
        </nav>

        <div class="app-mobile-menu-footer">
          <p>DevCongress Organizer Console</p>
        </div>
      </div>
    </Transition>

    <main
      class="app-main page-transition-host min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
      :class="{
        'app-main--with-event-tabs': showAdminEventTabs,
        'app-main--login': isLoginRoute || showOrganizerAccessSurface,
      }"
      :style="appMainStyle"
    >
      <div v-if="showAdminEventTabs && adminEventId" ref="adminEventTabsShell" class="admin-event-tabs-shell bg-dc-cream text-dc-ink">
        <div class="editorial-wrap event-tabs-wrap pb-0">
          <RouterLink
            v-if="adminReturnLink"
            :to="adminReturnLink.href"
            class="mb-3 inline-flex items-center rounded-md border-2 border-dc-ink bg-dc-paper px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-wide text-dc-ink shadow-[2px_2px_0_#111111] hover:bg-dc-yellow"
          >
            Back to {{ adminReturnLink.label }}
          </RouterLink>
          <AdminEventTabs :event-id="adminEventId" />
        </div>
      </div>

      <div class="page-route-stack">
        <AdminLoginView
          v-if="showOrganizerAccessError"
          class="page-view"
          managed
          access-title="Access check unavailable."
          access-description="The organizer session service did not complete the access check."
          :action-label="adminSessionQuery.isFetching.value ? 'Checking session…' : 'Try session check again'"
          access-note="Access remains closed until the server confirms an active organizer session."
          error="Unable to verify organizer access. Check your connection and try again."
          :busy="adminSessionQuery.isFetching.value"
          :action-disabled="adminSessionQuery.isFetching.value"
          secondary-action-label="Return to Google sign-in"
          @primary="retryOrganizerAccess"
          @secondary="returnToOrganizerSignIn"
        />

        <AppBootScreen
          v-else-if="showOrganizerAccessGate"
          class="page-view"
          title="Opening the workspace."
          copy="Checking your organizer access and restoring this page."
        />

        <RouterView v-else v-slot="{ Component, route }">
          <Transition :name="routeTransitionName" @after-enter="resetMainScroll">
            <component :is="Component" :key="routeViewKey(route)" class="page-view" />
          </Transition>
        </RouterView>
      </div>
    </main>

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
    <Transition name="organizer-session-pause">
      <OrganizerSessionPause
        v-if="organizerSessionPauseState"
        :state="organizerSessionPauseState"
        :remaining-seconds="organizerWarningSeconds"
        @stay="staySignedIn"
        @sign-in="signInAfterSessionPause"
        @sign-out="logout"
      />
    </Transition>
    <AppToaster />
  </div>
</template>
