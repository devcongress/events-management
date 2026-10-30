<script setup lang="ts">
import { useQuery } from "@tanstack/vue-query";
import {
  computed,
  defineAsyncComponent,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  watch,
} from "vue";
import { useRoute, useRouter } from "vue-router";
import OrganizerSessionPause from "./components/OrganizerSessionPause.vue";
import OrganizerRoleBadge from "./components/OrganizerRoleBadge.vue";
import PublicFormRouteFrame from "./components/PublicFormRouteFrame.vue";
import AppToaster from "./components/ui/AppToaster.vue";
import AppBootScreen from "./components/ui/AppBootScreen.vue";
import OrganizerBreadcrumbs from './components/OrganizerBreadcrumbs.vue';
import { isOrganizerBreadcrumbRoute } from './organizer-breadcrumbs';
import { fitNavigationLinkCount } from './navigation-fit';
import {
  ADMIN_OAUTH_REDIRECT_STORAGE_KEY,
  adminPath,
  isAdminPath,
} from "./admin-routes";
import {
  annualConferencePath,
  mobileAnnualConferencePath,
} from "./annual-conference";
import {
  fetchAdminSession,
  queryKeys,
  type AdminSessionResponse,
} from "./lib/api";
import { notify } from "./lib/notify";
import { shouldRedirectUnauthenticatedOrganizer } from "./lib/organizer-session-continuation";
import { shouldShowAuthenticatedAppHeader } from "./lib/app-shell";
import { queryClient } from "./lib/query";
import { isPublicFormRouteName } from "./public-form-routes";
import { SYSTEM_DESIGN_PARTICIPANT_ROUTE_NAME } from "./system-design-participant-route";
import {
  ORGANIZER_PHONE_MEDIA_QUERY,
  ORGANIZER_PHONE_ANNUAL_CONFERENCE_ROUTE_NAME,
  ORGANIZER_PHONE_CHECK_IN_ROUTE_NAME,
  ORGANIZER_PHONE_EVENTS_ROUTE_PATH,
  ORGANIZER_PHONE_ROUTE_NAME,
  ORGANIZER_PHONE_ROUTE_PATH,
  isOrganizerPhoneRouteName,
  organizerViewportRedirect,
} from "./organizer-viewport";
import {
  CONFERENCE_SPEAKER_INTAKE_ROUTE_NAME,
  SPEAKER_TALK_INTAKE_ROUTE_NAME,
} from "./speaker-intake-route";
import {
  isSystemDesignPresenterPath,
  SYSTEM_DESIGN_PRESENTER_ROUTE_NAME,
} from "./system-design-presenter-route";

interface NavLink {
  href: string;
  label: string;
  accent?: boolean;
}

const AdminEventTabs = defineAsyncComponent(
  () => import("./components/AdminEventTabs.vue"),
);
const AdminLoginView = defineAsyncComponent(
  () => import("./views/admin/AdminLoginView.vue"),
);
const route = useRoute();
const router = useRouter();
const initialBrowserPath =
  typeof window === "undefined" ? "/" : window.location.pathname;
const startedOnProtectedOrganizerRoute =
  (isAdminPath(initialBrowserPath) ||
    isSystemDesignPresenterPath(initialBrowserPath)) &&
  initialBrowserPath !== adminPath("login") &&
  initialBrowserPath !== adminPath("auth/callback");
const organizerPhoneMedia =
  typeof window === "undefined"
    ? null
    : window.matchMedia(ORGANIZER_PHONE_MEDIA_QUERY);
const routeTransitionName = ref("page");
const mobileMenuOpen = ref(false);
const appHeader = ref<HTMLElement | null>(null);
const mobileMenuToggle = ref<HTMLButtonElement | null>(null);
const primaryNavigation = ref<HTMLElement | null>(null);
const headerActions = ref<HTMLElement | null>(null);
const navigationMeasurement = ref<HTMLElement | null>(null);
const desktopMore = ref<HTMLElement | null>(null);
const desktopMoreToggle = ref<HTMLButtonElement | null>(null);
const desktopMenuOpen = ref(false);
const visibleNavigationCount = ref<number | null>(null);
const navigationMedia =
  typeof window === "undefined"
    ? null
    : window.matchMedia("(max-width: 960px)");
const navigationNarrowViewport = ref(navigationMedia?.matches ?? false);
const navigationCollapsed = computed(() => navigationNarrowViewport.value);
const phoneViewport = ref(organizerPhoneMedia?.matches ?? false);
const keyboardDismissVisible = ref(false);
const keyboardInset = ref(0);
const adminEventTabsShell = ref<HTMLElement | null>(null);
const adminEventTabsHeight = ref(0);
let mainScrollResetTimer: number | null = null;
let removeMainScrollResetInteractionListeners: (() => void) | null = null;
const logoSrc = "/brand/dev-con-logo.png";
const ORGANIZER_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const ORGANIZER_IDLE_WARNING_MS = 2 * 60 * 1000;
const ORGANIZER_SESSION_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const organizerSessionPauseState = ref<"warning" | null>(null);
const organizerWarningSeconds = ref(120);
const organizerStayBusy = ref(false);
const organizerStayError = ref<string | null>(null);
let keyboardFocusTimer: number | undefined;
let adminEventTabsResizeObserver: ResizeObserver | undefined;
let navigationResizeObserver: ResizeObserver | undefined;
let navigationMeasureFrame: number | undefined;
let organizerIdleWarningTimer: number | undefined;
let organizerIdleExpiryTimer: number | undefined;
let organizerAbsoluteExpiryTimer: number | undefined;
let organizerWarningTicker: number | undefined;
let organizerWarningDeadlineMs = 0;
let organizerLastActivityAt = 0;
let organizerNextSessionRefreshAt = 0;
let organizerSessionEnding = false;

const adminBaseLinks: NavLink[] = [
  { href: adminPath("events"), label: "Events" },
  { href: adminPath("attendance"), label: "Attendance" },
  { href: adminPath("feedback"), label: "Feedback" },
  { href: annualConferencePath(), label: "Annual Conference" },
  { href: adminPath("organizers"), label: "People & Access" },
];
const ownerAdminLinks: NavLink[] = [
  { href: adminPath("present-forms"), label: "Present forms" },
  { href: adminPath("audit-log"), label: "Audit Log" },
];
const isAdminRoute = computed(() => isAdminPath(route.path));
const isOrganizerProtectedRoute = computed(
  () => isAdminRoute.value || route.meta.requiresOrganizer === true,
);
const isStandaloneRoute = computed(
  () =>
    route.name === "event-feedback" ||
    route.name === "admin-access-request" ||
    route.name === SYSTEM_DESIGN_PARTICIPANT_ROUTE_NAME ||
    route.name === "event-cfp" ||
    route.name === "monthly-cfp" ||
    route.name === "conference-cfp" ||
    route.name === "event-registration-short" ||
    route.name === "event-registration" ||
    route.name === ORGANIZER_PHONE_ANNUAL_CONFERENCE_ROUTE_NAME ||
    route.name === ORGANIZER_PHONE_CHECK_IN_ROUTE_NAME ||
    route.name === "admin-feedback-display" ||
    route.name === "admin-present-forms-display" ||
    route.name === "admin-registration-display" ||
    route.name === "admin-public-events-preview" ||
    route.name === "admin-public-event-preview" ||
    route.name === SPEAKER_TALK_INTAKE_ROUTE_NAME ||
    route.name === CONFERENCE_SPEAKER_INTAKE_ROUTE_NAME ||
    route.name === "volunteer-intake" ||
    route.name === "volunteer-follow-up" ||
    route.name === "volunteer-follow-up-test" ||
    route.name === "admin-volunteer-follow-up-form-preview" ||
    route.name === "admin-annual-conference-volunteer-display" ||
    route.name === SYSTEM_DESIGN_PRESENTER_ROUTE_NAME,
);
const isLoginRoute = computed(
  () =>
    route.path === adminPath("login") ||
    route.path === adminPath("auth/callback"),
);
const adminSessionQuery = useQuery({
  queryKey: queryKeys.adminSession,
  queryFn: fetchAdminSession,
  enabled: isOrganizerProtectedRoute,
});
const organizerAccessUnresolved = computed(
  () =>
    (isAdminRoute.value || startedOnProtectedOrganizerRoute) &&
    !isLoginRoute.value &&
    adminSessionQuery.data.value === undefined,
);
const showOrganizerAccessError = computed(
  () => organizerAccessUnresolved.value && adminSessionQuery.isError.value,
);
const showOrganizerAccessGate = computed(
  () => organizerAccessUnresolved.value && !adminSessionQuery.isError.value,
);
const showOrganizerAccessSurface = computed(
  () => showOrganizerAccessError.value || showOrganizerAccessGate.value,
);
const isOrganizerAuthenticated = computed(
  () => adminSessionQuery.data.value?.authenticated === true,
);
const isConferenceVolunteer = computed(
  () => adminSessionQuery.data.value?.user?.role === "volunteer",
);
const currentOrganizerRole = computed(
  () => adminSessionQuery.data.value?.user?.role ?? null,
);
const showOrganizerBreadcrumbs = computed(() => (
  isOrganizerAuthenticated.value
  && isAdminRoute.value
  && !isStandaloneRoute.value
  && !isLoginRoute.value
  && !showOrganizerAccessSurface.value
  && isOrganizerBreadcrumbRoute(route.name)
));
const showAppHeader = computed(() =>
  shouldShowAuthenticatedAppHeader({
    authenticated: isOrganizerAuthenticated.value,
    isLoginRoute: isLoginRoute.value,
    isStandaloneRoute: isStandaloneRoute.value,
  }),
);
const showPrimaryNavigation = computed(
  () =>
    showAppHeader.value &&
    isOrganizerAuthenticated.value &&
    !isConferenceVolunteer.value,
);
const adminLinks = computed(() => {
  const session = adminSessionQuery.data.value;

  if (session?.authenticated && session.user?.role === "volunteer") {
    return [];
  }

  if (session?.authenticated && session.user?.role === "owner") {
    return [
      ...adminBaseLinks,
      ...ownerAdminLinks.filter(
        (link) =>
          !phoneViewport.value || link.href !== adminPath("present-forms"),
      ),
    ];
  }

  return adminBaseLinks;
});
const adminEventId = computed(() => {
  const value = route.params.eventId;

  if (Array.isArray(value)) return value[0];

  return value || null;
});
const primaryLinks = computed(() => adminLinks.value);
const showOrganizerPhoneView = computed(
  () =>
    isOrganizerAuthenticated.value &&
    !isConferenceVolunteer.value &&
    isAdminRoute.value &&
    phoneViewport.value &&
    isOrganizerPhoneRouteName(route.name),
);
const navGroups = computed(() => {
  if (showOrganizerPhoneView.value) {
    return [
      [
        { href: ORGANIZER_PHONE_ROUTE_PATH, label: "Home" },
        { href: ORGANIZER_PHONE_EVENTS_ROUTE_PATH, label: "Events" },
        { href: mobileAnnualConferencePath(), label: "Conference" },
      ],
    ];
  }

  if (isAdminRoute.value) {
    return [primaryLinks.value];
  }

  return [];
});
const brandHomeLink = computed(() =>
  showOrganizerPhoneView.value
    ? ORGANIZER_PHONE_ROUTE_PATH
    : isConferenceVolunteer.value
      ? annualConferencePath()
      : adminPath("events"),
);
const navigationLinks = computed(() => navGroups.value.flat());
const visibleNavigationLinks = computed(() => navigationLinks.value.slice(0, visibleNavigationCount.value ?? navigationLinks.value.length));
const overflowNavigationLinks = computed(() => navigationLinks.value.slice(visibleNavigationCount.value ?? navigationLinks.value.length));
const activeOverflowLink = computed(() => overflowNavigationLinks.value.find(link => isActive(link.href)));
const showSignOut = computed(
  () => isOrganizerAuthenticated.value && !isLoginRoute.value,
);
const showHeaderActions = computed(() => showSignOut.value);
const keyboardDismissStyle = computed(() => ({
  transform: `translate3d(0, -${keyboardInset.value}px, 0)`,
}));
const adminReturnSource = computed(() => {
  const value = route.query.from;

  if (value === "attendance" || value === "feedback") return value;

  return null;
});
const adminFeedbackReturnMonth = computed(() => {
  const value = route.query.month;

  return typeof value === "string" && /^\d{4}-\d{2}$/.test(value)
    ? value
    : null;
});
const adminReturnLink = computed(() => {
  if (adminReturnSource.value === "attendance") {
    return { href: adminPath("attendance"), label: "Attendance" };
  }

  if (adminReturnSource.value === "feedback") {
    if (adminFeedbackReturnMonth.value) {
      const params = new URLSearchParams({
        month: adminFeedbackReturnMonth.value,
      });

      return {
        href: `${adminPath("feedback")}?${params.toString()}`,
        label: "Feedback",
      };
    }

    return { href: adminPath("feedback"), label: "Feedback" };
  }

  return null;
});
const activeNavHref = computed(() => {
  if (isAdminRoute.value && adminReturnLink.value && adminEventId.value) {
    return adminReturnLink.value.href;
  }

  return (
    navGroups.value
      .flat()
      .filter((link) => {
        if (link.href === "/") return route.path === "/";

        return (
          route.path === link.href || route.path.startsWith(`${link.href}/`)
        );
      })
      .sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null
  );
});
const showAdminEventTabs = computed(() =>
  Boolean(
    isOrganizerAuthenticated.value &&
    !showOrganizerPhoneView.value &&
    adminEventId.value &&
    route.name !== "admin-community-event" &&
    route.path.startsWith(adminPath(`events/${adminEventId.value}`)),
  ),
);
const appMainStyle = computed(() => ({
  "--admin-event-tabs-height": showAdminEventTabs.value
    ? `${adminEventTabsHeight.value}px`
    : "0px",
}));
const adminEventSectionOrder = [
  "",
  "registrations",
  "talks",
  "speakers",
  "attendance",
  "feedback",
];
const annualConferenceSectionOrder = ["", "work-plan", "volunteers"];

function getAdminEventSection(
  path: string,
): { eventId: string; index: number } | null {
  const eventsBase = `${adminPath("events")}/`;

  if (!path.startsWith(eventsBase)) return null;

  const [eventId, section = ""] = path.slice(eventsBase.length).split("/");

  if (!eventId || eventId === "new") return null;

  const index = adminEventSectionOrder.indexOf(section);

  if (index === -1) return null;

  return { eventId, index };
}

function getAnnualConferenceSection(
  path: string,
): { year: string; index: number } | null {
  const conferenceBase = `${adminPath("annual-conference")}/`;

  if (!path.startsWith(conferenceBase)) return null;

  const [year, section = "", extraSegment] = path
    .slice(conferenceBase.length)
    .split("/");

  if (!/^\d{4}$/.test(year) || extraSegment) return null;

  const index = annualConferenceSectionOrder.indexOf(section);

  if (index === -1) return null;

  return { year, index };
}

function updateRouteTransition(toPath: string, fromPath?: string) {
  if (!fromPath) {
    routeTransitionName.value = "page";

    return;
  }

  const toConferenceSection = getAnnualConferenceSection(toPath);
  const fromConferenceSection = getAnnualConferenceSection(fromPath);

  if (
    toConferenceSection &&
    fromConferenceSection &&
    toConferenceSection.year === fromConferenceSection.year &&
    toConferenceSection.index !== fromConferenceSection.index
  ) {
    routeTransitionName.value = "page-stable";

    return;
  }

  const toSection = getAdminEventSection(toPath);
  const fromSection = getAdminEventSection(fromPath);

  if (
    toSection &&
    fromSection &&
    toSection.eventId === fromSection.eventId &&
    toSection.index !== fromSection.index
  ) {
    routeTransitionName.value =
      toSection.index > fromSection.index
        ? "page-tab-forward"
        : "page-tab-back";

    return;
  }

  routeTransitionName.value = "page";
}

function isActive(href: string) {
  return activeNavHref.value === href;
}

function routeViewKey(routeForKey: typeof route) {
  if (
    routeForKey.name === "admin-annual-conference-registrations"
    || routeForKey.name === 'admin-annual-conference-ticketing'
    || routeForKey.name === ORGANIZER_PHONE_ANNUAL_CONFERENCE_ROUTE_NAME
  ) {
    return routeForKey.path;
  }

  if (routeForKey.name === "admin-login") {
    return "admin-login";
  }

  if (
    routeForKey.name === "admin-events" ||
    routeForKey.name === "admin-event-submissions"
  ) {
    return "admin-events-workspace";
  }

  if (routeForKey.name === "admin-talks") {
    const value = routeForKey.params.eventId;
    const eventId = Array.isArray(value) ? value[0] : value;

    return `admin-talks:${String(eventId ?? "")}`;
  }

  return routeForKey.fullPath;
}

function closeMobileMenu(restoreFocus = false) {
  mobileMenuOpen.value = false;

  if (restoreFocus) mobileMenuToggle.value?.focus({ preventScroll: true });
}

function closeDesktopMenu(restoreFocus = false) {
  desktopMenuOpen.value = false;

  if (restoreFocus) desktopMoreToggle.value?.focus({ preventScroll: true });
}

function toggleDesktopMenu() {
  desktopMenuOpen.value = !navigationCollapsed.value && !desktopMenuOpen.value;
}

function handleNavigationKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && desktopMenuOpen.value) {
    event.preventDefault();
    closeDesktopMenu(true);

    return;
  }

  if (event.key !== "Escape" || !mobileMenuOpen.value) return;

  event.preventDefault();
  closeMobileMenu(true);
}

function handleNavigationPointerDown(event: PointerEvent) {
  if (desktopMenuOpen.value && event.target instanceof Node && !desktopMore.value?.contains(event.target)) {
    closeDesktopMenu();
  }

  if (
    mobileMenuOpen.value &&
    event.target instanceof Node &&
    !appHeader.value?.contains(event.target)
  ) {
    closeMobileMenu();
  }
}

function handleNavigationFocusOut(event: FocusEvent) {
  if (desktopMenuOpen.value && event.relatedTarget instanceof Node && !desktopMore.value?.contains(event.relatedTarget)) {
    closeDesktopMenu();
  }

  if (
    event.relatedTarget instanceof Node &&
    !appHeader.value?.contains(event.relatedTarget)
  ) {
    closeMobileMenu();
  }
}

function measureNavigationFit() {
  const header = appHeader.value?.querySelector<HTMLElement>(".app-header-inner");
  const navigation = primaryNavigation.value;
  const measurement = navigationMeasurement.value;
  const brand = appHeader.value?.querySelector<HTMLElement>(".app-brand-link");

  if (!header || !navigation || !measurement || !brand) return;

  const headerStyle = getComputedStyle(header);
  const navigationStyle = getComputedStyle(navigation);
  const links = [...measurement.querySelectorAll<HTMLElement>('[data-navigation-measure-link]')];
  const navigationGap = Number.parseFloat(navigationStyle.columnGap) || 0;
  const actionsWidth = headerActions.value?.getBoundingClientRect().width ?? 0;
  const headerGap = Number.parseFloat(headerStyle.columnGap) || 0;
  const horizontalPadding = Number.parseFloat(headerStyle.paddingLeft) + Number.parseFloat(headerStyle.paddingRight);
  const navigationMargin = Number.parseFloat(navigationStyle.marginLeft) || 0;
  const headerGaps = headerGap * (headerActions.value ? 2 : 1);
  const availableWidth = header.clientWidth - horizontalPadding - brand.getBoundingClientRect().width - actionsWidth - headerGaps - navigationMargin;

  const moreWidth = measurement.querySelector<HTMLElement>('[data-navigation-measure-more]')?.getBoundingClientRect().width ?? 0;
  const count = fitNavigationLinkCount(links.map(link => link.getBoundingClientRect().width), availableWidth, navigationGap, moreWidth);

  if (count === visibleNavigationCount.value) return;

  const focused = document.activeElement;
  const focusedHref = focused instanceof Element ? focused.closest('a[data-navigation-href]')?.getAttribute('data-navigation-href') : null;
  const focusedInMore = focused instanceof Node && desktopMore.value?.contains(focused);
  const movesToMore = focusedHref && navigationLinks.value.findIndex(link => link.href === focusedHref) >= count;

  visibleNavigationCount.value = count;
  closeDesktopMenu();

  if (!navigationCollapsed.value && (movesToMore || focusedInMore)) {
    void nextTick(() => {
      const direct = [...(primaryNavigation.value?.querySelectorAll<HTMLAnchorElement>('a[data-direct-navigation]') ?? [])];
      const target = movesToMore
        ? desktopMoreToggle.value
        : direct.find(link => link.getAttribute('data-navigation-href') === focusedHref) ?? direct[0] ?? desktopMoreToggle.value;

      target?.focus({ preventScroll: true });
    });
  }
}

function scheduleNavigationMeasurement() {
  window.cancelAnimationFrame(navigationMeasureFrame ?? 0);
  navigationMeasureFrame = window.requestAnimationFrame(() => {
    navigationMeasureFrame = undefined;
    measureNavigationFit();
  });
}

function observeNavigationFit() {
  navigationResizeObserver?.disconnect();

  for (const element of [appHeader.value, primaryNavigation.value, headerActions.value, navigationMeasurement.value]) {
    if (element) navigationResizeObserver?.observe(element);
  }

  scheduleNavigationMeasurement();
}

function focusVisibleNavigation() {
  const target = navigationCollapsed.value
    ? mobileMenuToggle.value
    : primaryNavigation.value?.querySelector<HTMLElement>("a[data-direct-navigation]") ?? desktopMoreToggle.value ??
      appHeader.value?.querySelector<HTMLElement>("a");

  target?.focus({ preventScroll: true });
}

function syncNavigationViewport() {
  const hadFocus = appHeader.value?.contains(document.activeElement);

  navigationNarrowViewport.value = navigationMedia?.matches ?? false;
  closeMobileMenu();
  closeDesktopMenu();
  scheduleNavigationMeasurement();

  if (hadFocus) void nextTick(focusVisibleNavigation);
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
    auth_mode: "supabase",
    auth_configured: true,
  });
}

function clearLocalSupabaseSession() {
  void import("@/lib/supabase/browser")
    .then(({ getSupabaseBrowserClient }) =>
      getSupabaseBrowserClient()?.auth.signOut({ scope: "local" }),
    )
    .catch(() => undefined);
}

function lockOrganizerSession() {
  if (organizerSessionEnding) return;
  const redirectPath = isLoginRoute.value
    ? adminPath("events")
    : route.fullPath;

  organizerSessionEnding = true;
  clearOrganizerSessionTimers();
  organizerSessionPauseState.value = null;
  organizerStayBusy.value = false;
  organizerStayError.value = null;
  clearOrganizerCachedData();
  window.sessionStorage.removeItem(ADMIN_OAUTH_REDIRECT_STORAGE_KEY);
  clearLocalSupabaseSession();
  void fetch("/api/auth/logout", {
    method: "POST",
    credentials: "include",
    keepalive: true,
  }).catch(() => undefined);
  if (!isLoginRoute.value) {
    void router.replace({
      path: adminPath("login"),
      query: { redirect: redirectPath },
    });
  }
}

function updateOrganizerWarningCountdown() {
  organizerWarningSeconds.value = Math.max(
    0,
    Math.ceil((organizerWarningDeadlineMs - Date.now()) / 1000),
  );
}

function showOrganizerIdleWarning() {
  if (!isOrganizerAuthenticated.value || organizerSessionEnding) return;
  organizerWarningDeadlineMs = Date.now() + ORGANIZER_IDLE_WARNING_MS;
  updateOrganizerWarningCountdown();
  organizerStayBusy.value = false;
  organizerStayError.value = null;
  organizerSessionPauseState.value = "warning";
  organizerWarningTicker = window.setInterval(
    updateOrganizerWarningCountdown,
    1000,
  );
}

function scheduleOrganizerIdleExpiry() {
  clearOrganizerIdleTimers();
  if (!isOrganizerAuthenticated.value || organizerSessionEnding) return;

  const elapsedMs = Math.max(0, Date.now() - organizerLastActivityAt);
  const warningDelayMs = Math.max(
    0,
    ORGANIZER_IDLE_TIMEOUT_MS - ORGANIZER_IDLE_WARNING_MS - elapsedMs,
  );
  const expiryDelayMs = Math.max(0, ORGANIZER_IDLE_TIMEOUT_MS - elapsedMs);

  organizerIdleWarningTimer = window.setTimeout(
    showOrganizerIdleWarning,
    warningDelayMs,
  );
  organizerIdleExpiryTimer = window.setTimeout(
    lockOrganizerSession,
    expiryDelayMs,
  );
}

function scheduleOrganizerAbsoluteExpiry(expiresAt: string | undefined) {
  window.clearTimeout(organizerAbsoluteExpiryTimer);
  organizerAbsoluteExpiryTimer = undefined;
  if (!expiresAt || organizerSessionEnding) return;

  const expiresAtMs = new Date(expiresAt).getTime();

  if (!Number.isFinite(expiresAtMs)) return;
  organizerAbsoluteExpiryTimer = window.setTimeout(
    lockOrganizerSession,
    Math.max(0, expiresAtMs - Date.now()),
  );
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
  if (organizerStayBusy.value) return;
  organizerStayBusy.value = true;
  organizerStayError.value = null;
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
    organizerNextSessionRefreshAt =
      organizerLastActivityAt + ORGANIZER_SESSION_REFRESH_INTERVAL_MS;
    scheduleOrganizerIdleExpiry();
    scheduleOrganizerAbsoluteExpiry(session.expires_at);
  } catch {
    organizerStayError.value =
      "We could not confirm your session. Check your connection and try again.";
  } finally {
    organizerStayBusy.value = false;
  }
}

function recordOrganizerActivity(forceRefresh = false) {
  if (
    !isOrganizerAuthenticated.value ||
    organizerSessionEnding ||
    organizerSessionPauseState.value
  )
    return;

  organizerLastActivityAt = Date.now();
  scheduleOrganizerIdleExpiry();
  if (
    forceRefresh ||
    organizerLastActivityAt >= organizerNextSessionRefreshAt
  ) {
    organizerNextSessionRefreshAt =
      organizerLastActivityAt + ORGANIZER_SESSION_REFRESH_INTERVAL_MS;
    void revalidateOrganizerSession();
  }
}

function handleOrganizerActivity() {
  recordOrganizerActivity();
}

function handleOrganizerVisibilityChange() {
  if (document.visibilityState === "visible") recordOrganizerActivity(true);
}

function returnToOrganizerSignIn() {
  void router.replace({
    path: adminPath("login"),
    query: { redirect: route.fullPath },
  });
}

function toggleMobileMenu() {
  mobileMenuOpen.value = navigationCollapsed.value && !mobileMenuOpen.value;
}

function clearMainScrollResetTimer() {
  if (mainScrollResetTimer !== null) {
    window.clearTimeout(mainScrollResetTimer);
    mainScrollResetTimer = null;
  }

  removeMainScrollResetInteractionListeners?.();
  removeMainScrollResetInteractionListeners = null;
}

function resetMainScroll() {
  clearMainScrollResetTimer();

  const scrollToTop = () => {
    document
      .querySelector(".app-main")
      ?.scrollTo({ top: 0, left: 0, behavior: "instant" });
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  };

  scrollToTop();
  void nextTick(scrollToTop);
  window.requestAnimationFrame(scrollToTop);

  const cancelResetOnInteraction = () => clearMainScrollResetTimer();

  window.addEventListener("pointerdown", cancelResetOnInteraction, true);
  window.addEventListener("keydown", cancelResetOnInteraction, true);
  window.addEventListener("focusin", cancelResetOnInteraction, true);
  window.addEventListener("wheel", cancelResetOnInteraction, { passive: true });
  window.addEventListener("touchstart", cancelResetOnInteraction, {
    passive: true,
  });

  removeMainScrollResetInteractionListeners = () => {
    window.removeEventListener("pointerdown", cancelResetOnInteraction, true);
    window.removeEventListener("keydown", cancelResetOnInteraction, true);
    window.removeEventListener("focusin", cancelResetOnInteraction, true);
    window.removeEventListener("wheel", cancelResetOnInteraction);
    window.removeEventListener("touchstart", cancelResetOnInteraction);
  };

  mainScrollResetTimer = window.setTimeout(() => {
    mainScrollResetTimer = null;
    removeMainScrollResetInteractionListeners?.();
    removeMainScrollResetInteractionListeners = null;
    scrollToTop();
  }, 280);
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
    eventId: typeof adminEventId.value === "string" ? adminEventId.value : null,
    conferenceYear:
      typeof route.params.year === "string" ? route.params.year : null,
    query: route.query,
  });

  if (redirect && redirect.path !== route.path) {
    void router.replace(redirect);
  }
}

function isEditableElement(element: Element | null): element is HTMLElement {
  if (!(element instanceof HTMLElement)) return false;
  if (element.isContentEditable) return true;

  return element.matches(
    'input:not([type="hidden"]):not([readonly]):not([disabled]), textarea:not([readonly]):not([disabled]), select:not([disabled])',
  );
}

function updateKeyboardInset() {
  const visualViewport = window.visualViewport;

  if (!visualViewport) {
    keyboardInset.value = 0;

    return;
  }

  keyboardInset.value = Math.max(
    0,
    Math.round(
      window.innerHeight - visualViewport.height - visualViewport.offsetTop,
    ),
  );
}

function syncKeyboardDismissVisibility() {
  window.clearTimeout(keyboardFocusTimer);
  keyboardFocusTimer = window.setTimeout(() => {
    keyboardDismissVisible.value =
      isMobileViewport() && isEditableElement(document.activeElement);
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
  if (target.closest(".keyboard-dismiss-control")) return;
  if (
    isEditableElement(target) ||
    target.closest('input, textarea, select, [contenteditable="true"]')
  )
    return;

  dismissMobileKeyboard();
}

async function logout() {
  closeMobileMenu();
  try {
    const response = await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    });

    if (!response.ok) {
      notify.error("Sign-out could not be completed. Please try again.");

      return;
    }

    clearOrganizerSessionTimers();
    organizerSessionPauseState.value = null;
    const cachedSession = queryClient.getQueryData<AdminSessionResponse>(
      queryKeys.adminSession,
    );

    queryClient.removeQueries({
      predicate: (query) => query.queryKey[0] !== queryKeys.adminSession[0],
    });
    queryClient.setQueryData<AdminSessionResponse>(queryKeys.adminSession, {
      authenticated: false,
      auth_mode: cachedSession?.auth_mode ?? "supabase",
      auth_configured: cachedSession?.auth_configured ?? true,
    });
    window.sessionStorage.removeItem(ADMIN_OAUTH_REDIRECT_STORAGE_KEY);

    // The app session is the authorization boundary, but clearing this
    // tab-scoped Supabase session prevents a stale OAuth session from
    // immediately re-establishing browser auth after sign-out.
    try {
      const { getSupabaseBrowserClient } =
        await import("@/lib/supabase/browser");
      const supabase = getSupabaseBrowserClient();

      if (supabase) {
        const { error } = await supabase.auth.signOut({ scope: "local" });

        if (error)
          console.warn(
            "Unable to clear the local Supabase browser session.",
            error,
          );
      }
    } catch (error) {
      // The app-owned session is already revoked above. A best-effort
      // Supabase cleanup must not strand the organizer in the console.
      console.warn(
        "Unable to clear the local Supabase browser session.",
        error,
      );
    }

    await router.replace(adminPath("login"));
  } catch {
    notify.error("Sign-out could not be completed. Please try again.");
  }
}

onMounted(() => {
  if (typeof ResizeObserver !== "undefined") {
    adminEventTabsResizeObserver = new ResizeObserver(
      updateAdminEventTabsHeight,
    );
    navigationResizeObserver = new ResizeObserver(scheduleNavigationMeasurement);
  }

  document.addEventListener("pointerdown", handleDocumentPointerDown, {
    capture: true,
  });
  document.addEventListener("pointerdown", handleNavigationPointerDown);
  document.addEventListener("keydown", handleNavigationKeydown);
  navigationMedia?.addEventListener("change", syncNavigationViewport);
  window.addEventListener("resize", scheduleNavigationMeasurement);
  void document.fonts.ready.then(scheduleNavigationMeasurement);
  document.addEventListener("focusin", syncKeyboardDismissVisibility);
  document.addEventListener("focusout", syncKeyboardDismissVisibility);
  window.addEventListener("resize", syncKeyboardDismissVisibility);
  window.addEventListener("resize", updateAdminEventTabsHeight);
  window.visualViewport?.addEventListener("resize", updateKeyboardInset);
  window.visualViewport?.addEventListener("scroll", updateKeyboardInset);
  organizerPhoneMedia?.addEventListener("change", syncPhoneViewport);
  document.addEventListener("pointerdown", handleOrganizerActivity, {
    capture: true,
  });
  document.addEventListener("keydown", handleOrganizerActivity, {
    capture: true,
  });
  document.addEventListener("focusin", handleOrganizerActivity, {
    capture: true,
  });
  window.addEventListener("scroll", handleOrganizerActivity, {
    capture: true,
    passive: true,
  });
  document.addEventListener(
    "visibilitychange",
    handleOrganizerVisibilityChange,
  );
  syncPhoneViewport();
  void nextTick(syncAdminEventTabsObserver);
  observeNavigationFit();
});

watch([appHeader, primaryNavigation, headerActions, navigationMeasurement, navGroups], observeNavigationFit, { flush: "post" });

watch(navigationCollapsed, () => {
  const hadFocus = appHeader.value?.contains(document.activeElement);

  closeMobileMenu();
  closeDesktopMenu();

  if (hadFocus) void nextTick(focusVisibleNavigation);
});

watch(
  () => route.path,
  (toPath, fromPath) => {
    closeMobileMenu();
    closeDesktopMenu();
    dismissMobileKeyboard();
    resetMainScroll();
    updateRouteTransition(toPath, fromPath);
    void nextTick(syncAdminEventTabsObserver);
  },
);

watch(
  () => ({
    authenticated: adminSessionQuery.data.value?.authenticated,
    routePath: route.path,
    routeFullPath: route.fullPath,
  }),
  ({ authenticated, routePath, routeFullPath }) => {
    if (
      (!isAdminPath(routePath) && !isSystemDesignPresenterPath(routePath)) ||
      routePath === adminPath("login") ||
      routePath === adminPath("auth/callback")
    ) {
      return;
    }

    if (
      shouldRedirectUnauthenticatedOrganizer({
        authenticated,
        warningOpen: organizerSessionPauseState.value === "warning",
        sessionEnding: organizerSessionEnding,
      })
    ) {
      void router.replace({
        path: adminPath("login"),
        query: { redirect: routeFullPath },
      });

      return;
    }

    if (authenticated === true) syncOrganizerViewportRoute();
  },
);

watch(
  () => ({
    authenticated: isOrganizerAuthenticated.value,
    expiresAt: adminSessionQuery.data.value?.expires_at,
  }),
  ({ authenticated, expiresAt }) => {
    if (!authenticated) {
      clearOrganizerSessionTimers();

      return;
    }

    organizerSessionEnding = false;
    organizerLastActivityAt = Date.now();
    organizerNextSessionRefreshAt =
      organizerLastActivityAt + ORGANIZER_SESSION_REFRESH_INTERVAL_MS;
    scheduleOrganizerIdleExpiry();
    scheduleOrganizerAbsoluteExpiry(expiresAt);
  },
  { immediate: true },
);

onUnmounted(() => {
  window.clearTimeout(keyboardFocusTimer);
  clearOrganizerSessionTimers();
  adminEventTabsResizeObserver?.disconnect();
  navigationResizeObserver?.disconnect();
  window.cancelAnimationFrame(navigationMeasureFrame ?? 0);
  window.removeEventListener("resize", scheduleNavigationMeasurement);
  document.removeEventListener("pointerdown", handleDocumentPointerDown, {
    capture: true,
  });
  document.removeEventListener("pointerdown", handleNavigationPointerDown);
  document.removeEventListener("keydown", handleNavigationKeydown);
  navigationMedia?.removeEventListener("change", syncNavigationViewport);
  document.removeEventListener("focusin", syncKeyboardDismissVisibility);
  document.removeEventListener("focusout", syncKeyboardDismissVisibility);
  window.removeEventListener("resize", syncKeyboardDismissVisibility);
  window.removeEventListener("resize", updateAdminEventTabsHeight);
  window.visualViewport?.removeEventListener("resize", updateKeyboardInset);
  window.visualViewport?.removeEventListener("scroll", updateKeyboardInset);
  organizerPhoneMedia?.removeEventListener("change", syncPhoneViewport);
  document.removeEventListener("pointerdown", handleOrganizerActivity, {
    capture: true,
  });
  document.removeEventListener("keydown", handleOrganizerActivity, {
    capture: true,
  });
  document.removeEventListener("focusin", handleOrganizerActivity, {
    capture: true,
  });
  window.removeEventListener("scroll", handleOrganizerActivity, {
    capture: true,
  });
  document.removeEventListener(
    "visibilitychange",
    handleOrganizerVisibilityChange,
  );
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
    <header
      v-if="showAppHeader"
      ref="appHeader"
      class="app-header"
      :class="{ 'app-header--collapsed': navigationCollapsed }"
      @focusout="handleNavigationFocusOut"
    >
      <div class="app-header-inner">
        <RouterLink
          :to="brandHomeLink"
          class="app-brand-link"
          aria-label="DevCongress organizer home"
        >
          <img :src="logoSrc" alt="DevCongress" class="app-brand-logo" />
        </RouterLink>

        <nav
          v-if="showPrimaryNavigation"
          ref="primaryNavigation"
          class="app-primary-nav"
          aria-label="Primary"
          :aria-hidden="navigationCollapsed"
          :inert="navigationCollapsed"
        >
            <RouterLink
              v-for="link in visibleNavigationLinks"
              :key="link.href"
              :to="link.href"
              class="app-nav-link"
              data-direct-navigation
              :data-navigation-href="link.href"
              :aria-current="isActive(link.href) ? 'page' : undefined"
            >
              <span class="app-nav-link-label">{{ link.label }}</span>
            </RouterLink>
          <div v-if="overflowNavigationLinks.length" ref="desktopMore" class="app-nav-more">
            <button
              ref="desktopMoreToggle"
              type="button"
              class="app-nav-link app-nav-more-toggle motion-press"
              :aria-label="activeOverflowLink ? `More navigation, current section: ${activeOverflowLink.label}` : 'More navigation'"
              :aria-expanded="desktopMenuOpen"
              aria-controls="desktop-navigation-more"
              :data-active="activeOverflowLink ? 'true' : undefined"
              @click="toggleDesktopMenu"
            >
              <span class="app-nav-link-label">More</span>
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
            </button>
            <Transition name="desktop-navigation">
              <div
                v-show="desktopMenuOpen"
                id="desktop-navigation-more"
                class="app-nav-more-panel"
                :aria-hidden="!desktopMenuOpen"
                :inert="!desktopMenuOpen"
              >
                <RouterLink
                  v-for="link in overflowNavigationLinks"
                  :key="link.href"
                  :to="link.href"
                  class="app-nav-more-link"
                  :data-navigation-href="link.href"
                  :aria-current="isActive(link.href) ? 'page' : undefined"
                  @click="closeDesktopMenu(true)"
                >{{ link.label }}</RouterLink>
              </div>
            </Transition>
          </div>
        </nav>

        <div v-if="showPrimaryNavigation" class="app-navigation-measurement" aria-hidden="true" inert>
          <div ref="navigationMeasurement" class="app-navigation-measure-rail">
            <span v-for="link in navigationLinks" :key="link.href" class="app-nav-link" data-navigation-measure-link>
              <span class="app-nav-link-label">{{ link.label }}</span>
            </span>
            <span class="app-nav-link app-nav-more-toggle" data-navigation-measure-more>
              <span class="app-nav-link-label">More</span>
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
            </span>
          </div>
        </div>

        <div
          v-if="showHeaderActions"
          ref="headerActions"
          class="app-header-actions"
          :aria-hidden="navigationCollapsed"
          :inert="navigationCollapsed"
        >
          <OrganizerRoleBadge v-if="currentOrganizerRole" :role="currentOrganizerRole" />
          <button v-if="showSignOut" class="app-nav-button" type="button" @click="logout">
            <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M6 2H3v12h3M9.5 4.5 13 8l-3.5 3.5M6 8h7" />
            </svg>
            <span>Sign out</span>
          </button>
        </div>

        <button
          v-if="showPrimaryNavigation || showHeaderActions"
          ref="mobileMenuToggle"
          class="app-mobile-menu-toggle"
          type="button"
          :aria-expanded="mobileMenuOpen"
          aria-controls="mobile-menu-panel"
          :aria-label="mobileMenuOpen ? 'Close menu' : 'Open menu'"
          @click="toggleMobileMenu"
        >
          <span aria-hidden="true" />
          <span aria-hidden="true" />
          <span aria-hidden="true" />
        </button>
      </div>

      <Transition name="mobile-menu">
        <div
          v-show="mobileMenuOpen"
          id="mobile-menu-panel"
          class="app-mobile-menu"
          :aria-hidden="!mobileMenuOpen"
          :inert="!mobileMenuOpen"
        >
          <nav v-if="showPrimaryNavigation" class="app-mobile-menu-nav" aria-label="Mobile primary">
            <template v-for="(group, groupIndex) in navGroups" :key="groupIndex">
              <RouterLink
                v-for="link in group"
                :key="link.href"
                :to="link.href"
                class="app-mobile-menu-link"
                :aria-current="isActive(link.href) ? 'page' : undefined"
                @click="closeMobileMenu(true)"
              >
                <span class="app-nav-link-label">{{ link.label }}</span>
                <span aria-hidden="true">↗</span>
              </RouterLink>
            </template>
          </nav>
          <div v-if="showHeaderActions" class="app-mobile-menu-actions">
            <OrganizerRoleBadge v-if="currentOrganizerRole" :role="currentOrganizerRole" />
            <button v-if="showSignOut" class="app-nav-button" type="button" @click="logout">
              <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M6 2H3v12h3M9.5 4.5 13 8l-3.5 3.5M6 8h7" />
              </svg>
              <span>Sign out</span>
            </button>
          </div>
        </div>
      </Transition>
    </header>

    <main
      class="app-main page-transition-host min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
      :class="{
        'app-main--with-event-tabs': showAdminEventTabs,
        'app-main--login': isLoginRoute || showOrganizerAccessSurface,
        'app-main--with-breadcrumbs': showOrganizerBreadcrumbs,
      }"
      :style="appMainStyle"
    >
      <div
        v-if="showAdminEventTabs && adminEventId"
        ref="adminEventTabsShell"
        class="admin-event-tabs-shell bg-dc-cream text-dc-ink"
      >
        <div class="editorial-wrap event-tabs-wrap pb-0">
          <OrganizerBreadcrumbs v-if="showOrganizerBreadcrumbs" :role="currentOrganizerRole" :phone="phoneViewport" embedded />
          <AdminEventTabs :event-id="adminEventId" />
        </div>
      </div>

      <OrganizerBreadcrumbs v-if="showOrganizerBreadcrumbs && !showAdminEventTabs" :role="currentOrganizerRole" :phone="phoneViewport" />

      <div class="page-route-stack">
        <AdminLoginView
          v-if="showOrganizerAccessError"
          class="page-view"
          managed
          access-title="Access check unavailable."
          access-description="The organizer session service did not complete the access check."
          :action-label="
            adminSessionQuery.isFetching.value
              ? 'Checking session…'
              : 'Try session check again'
          "
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
          <Transition
            :name="routeTransitionName"
            @after-enter="resetMainScroll"
          >
            <PublicFormRouteFrame
              v-if="isPublicFormRouteName(route.name)"
              :key="routeViewKey(route)"
              :center-content="route.name === 'event-registration' || route.name === 'event-registration-short'"
            >
              <component :is="Component" class="page-view" />
            </PublicFormRouteFrame>
            <component
              v-else
              :is="Component"
              :key="routeViewKey(route)"
              class="page-view"
            />
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
        :remaining-seconds="organizerWarningSeconds"
        :busy="organizerStayBusy"
        :error="organizerStayError"
        @stay="staySignedIn"
        @sign-out="logout"
      />
    </Transition>
    <AppToaster />
  </div>
</template>

<style scoped>
.app-main--with-breadcrumbs {
  display: flex;
  flex-direction: column;
}

.app-main--with-breadcrumbs > .page-route-stack {
  flex: 1 0 auto;
  min-height: 0;
}

.app-main--with-breadcrumbs > .page-route-stack > :deep(.page-view) {
  min-height: 0;
}
</style>
