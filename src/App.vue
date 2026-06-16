<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AdminEventTabs from './components/AdminEventTabs.vue';
import AppToaster from './components/ui/AppToaster.vue';
import FeedbackBot from './components/FeedbackBot.vue';
import { adminPath, isAdminPath } from './admin-routes';

interface NavLink {
  href: string;
  label: string;
  accent?: boolean;
}

interface AdminEventSummary {
  id: string;
  name: string;
}

interface ScrollDebugSnapshot {
  route: string;
  time: string;
  windowY: number;
  innerHeight: number;
  visualHeight: number | null;
  visualOffsetTop: number | null;
  docScrollHeight: number;
  docClientHeight: number;
  bodyScrollHeight: number;
  mainScrollTop: number | null;
  mainScrollHeight: number | null;
  mainClientHeight: number | null;
  mainOverflow: string | null;
  shellOverflow: string | null;
}

const route = useRoute();
const router = useRouter();
const quizAvailable = ref(false);
const adminEventNames = ref<Record<string, string>>({});
const routeTransitionName = ref('page');
const mobileMenuOpen = ref(false);
const scrollDebugEnabled = ref(false);
const scrollDebugSnapshot = ref<ScrollDebugSnapshot | null>(null);
const logoSrc = '/brand/dev-con-logo.png';
const showOrganizerLink = import.meta.env.VITE_SHOW_ORGANIZER_LINK !== 'false';
const feedbackBotEnabled = import.meta.env.VITE_SHOW_FEEDBACK_BOT === 'true';
let quizAvailabilityInterval: number | undefined;
let scrollDebugInterval: number | undefined;

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

const adminLinks: NavLink[] = [
  { href: adminPath('events'), label: 'Events' },
  { href: adminPath('attendance'), label: 'Attendance Hub' },
  { href: adminPath('feedback'), label: 'Feedback Hub' },
];

const isAdminRoute = computed(() => isAdminPath(route.path));
const adminEventId = computed(() => {
  const value = route.params.eventId;
  if (Array.isArray(value)) return value[0];
  return value || null;
});
const primaryLinks = computed(() => (isAdminRoute.value ? adminLinks : publicLinks));
const visiblePlayLinks = computed(() => (quizAvailable.value ? playLinks : []));
const navGroups = computed(() => {
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
const showModeSwitch = computed(() => isAdminRoute.value || showOrganizerLink);
const showSignOut = computed(() => isAdminRoute.value && route.path !== adminPath('login'));
const showHeaderActions = computed(() => showModeSwitch.value || showSignOut.value);
const showFeedbackBot = computed(() => feedbackBotEnabled && !isAdminRoute.value && !route.path.startsWith('/feedback'));
const scrollDebugRows = computed(() => {
  const snapshot = scrollDebugSnapshot.value;
  if (!snapshot) return [];

  return [
    ['route', snapshot.route],
    ['time', snapshot.time],
    ['winY', snapshot.windowY],
    ['innerH', snapshot.innerHeight],
    ['vvH', snapshot.visualHeight ?? 'n/a'],
    ['vvTop', snapshot.visualOffsetTop ?? 'n/a'],
    ['docH', snapshot.docScrollHeight],
    ['docClient', snapshot.docClientHeight],
    ['bodyH', snapshot.bodyScrollHeight],
    ['mainTop', snapshot.mainScrollTop ?? 'n/a'],
    ['mainH', snapshot.mainScrollHeight ?? 'n/a'],
    ['mainClient', snapshot.mainClientHeight ?? 'n/a'],
    ['mainOv', snapshot.mainOverflow ?? 'n/a'],
    ['shellOv', snapshot.shellOverflow ?? 'n/a'],
  ];
});
const adminReturnSource = computed(() => {
  const value = route.query.from;
  if (value === 'attendance' || value === 'feedback') return value;
  return null;
});
const adminReturnLink = computed(() => {
  if (adminReturnSource.value === 'attendance') {
    return { href: adminPath('attendance'), label: 'Attendance Hub' };
  }

  if (adminReturnSource.value === 'feedback') {
    return { href: adminPath('feedback'), label: 'Feedback Hub' };
  }

  return null;
});
const activeNavHref = computed(() => {
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
const showAdminEventTabs = computed(() => Boolean(adminEventId.value && route.path.startsWith(adminPath(`events/${adminEventId.value}`))));
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

      const eventHref = adminReturnSource.value
        ? `${adminPath(`events/${adminEventId.value}`)}?from=${adminReturnSource.value}`
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
const showBreadcrumbs = computed(() => isAdminRoute.value && breadcrumbItems.value.length > 1);

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
    updateScrollDebugSnapshot();
  };

  scrollToTop();
  void nextTick(scrollToTop);
  window.requestAnimationFrame(scrollToTop);
  window.setTimeout(scrollToTop, 280);
}

function readScrollDebugQuery() {
  return route.query.debugScroll === '1' || new URLSearchParams(window.location.search).get('debugScroll') === '1';
}

function enableScrollDebug() {
  scrollDebugEnabled.value = true;
  window.sessionStorage.setItem('devcon-scroll-debug', '1');
  updateScrollDebugSnapshot();
}

function disableScrollDebug() {
  scrollDebugEnabled.value = false;
  scrollDebugSnapshot.value = null;
  window.sessionStorage.removeItem('devcon-scroll-debug');
}

function updateScrollDebugSnapshot() {
  if (!scrollDebugEnabled.value) return;

  const main = document.querySelector<HTMLElement>('.app-main');
  const shell = document.querySelector<HTMLElement>('.app-shell');
  const visualViewport = window.visualViewport;

  scrollDebugSnapshot.value = {
    route: route.fullPath,
    time: new Date().toLocaleTimeString(),
    windowY: Math.round(window.scrollY),
    innerHeight: Math.round(window.innerHeight),
    visualHeight: visualViewport ? Math.round(visualViewport.height) : null,
    visualOffsetTop: visualViewport ? Math.round(visualViewport.offsetTop) : null,
    docScrollHeight: document.documentElement.scrollHeight,
    docClientHeight: document.documentElement.clientHeight,
    bodyScrollHeight: document.body.scrollHeight,
    mainScrollTop: main ? Math.round(main.scrollTop) : null,
    mainScrollHeight: main?.scrollHeight ?? null,
    mainClientHeight: main?.clientHeight ?? null,
    mainOverflow: main ? window.getComputedStyle(main).overflowY : null,
    shellOverflow: shell ? window.getComputedStyle(shell).overflowY : null,
  };
}

async function copyScrollDebugSnapshot() {
  if (!scrollDebugSnapshot.value) return;

  try {
    await navigator.clipboard.writeText(JSON.stringify(scrollDebugSnapshot.value, null, 2));
  } catch {
    // Ignore clipboard failures; screenshots still capture the visible values.
  }
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
  if (!isAdminRoute.value || route.path === adminPath('login')) {
    return;
  }

  try {
    const eventsResponse = await fetch('/api/events');
    if (!eventsResponse.ok) return;

    const events = (await eventsResponse.json()) as AdminEventSummary[];
    adminEventNames.value = Object.fromEntries(events.map((event) => [event.id, event.name]));
  } catch {
    adminEventNames.value = {};
  }
}

onMounted(() => {
  if (readScrollDebugQuery() || window.sessionStorage.getItem('devcon-scroll-debug') === '1') {
    enableScrollDebug();
  }

  window.addEventListener('scroll', updateScrollDebugSnapshot, { passive: true });
  window.addEventListener('resize', updateScrollDebugSnapshot);
  window.visualViewport?.addEventListener('resize', updateScrollDebugSnapshot);
  window.visualViewport?.addEventListener('scroll', updateScrollDebugSnapshot);
  scrollDebugInterval = window.setInterval(updateScrollDebugSnapshot, 500);

  void refreshQuizAvailability();
  void refreshAdminEventNames();
  quizAvailabilityInterval = window.setInterval(() => {
    void refreshQuizAvailability();
  }, 15000);
});

watch(() => route.path, (toPath, fromPath) => {
  closeMobileMenu();
  if (readScrollDebugQuery()) {
    enableScrollDebug();
  }
  resetMainScroll();
  updateRouteTransition(toPath, fromPath);
  void refreshAdminEventNames();
});

onUnmounted(() => {
  if (quizAvailabilityInterval !== undefined) {
    window.clearInterval(quizAvailabilityInterval);
  }
  if (scrollDebugInterval !== undefined) {
    window.clearInterval(scrollDebugInterval);
  }
  window.removeEventListener('scroll', updateScrollDebugSnapshot);
  window.removeEventListener('resize', updateScrollDebugSnapshot);
  window.visualViewport?.removeEventListener('resize', updateScrollDebugSnapshot);
  window.visualViewport?.removeEventListener('scroll', updateScrollDebugSnapshot);
});
</script>

<template>
  <div class="app-shell flex flex-col overflow-hidden bg-dc-cream text-dc-ink" :class="{ 'app-shell--community': !isAdminRoute }">
    <header class="app-header sticky top-0 z-50 border-b-2 border-dc-ink bg-dc-cream/96 backdrop-blur-md">
      <div class="app-header-inner grid w-full grid-cols-[1fr_auto] gap-x-4 gap-y-3 px-4 py-4 sm:px-6 lg:grid-cols-[auto_1fr_auto] lg:items-center lg:gap-8 lg:px-8">
        <RouterLink to="/" class="group flex min-h-11 items-center">
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
              class="app-nav-link motion-press relative flex min-h-11 shrink-0 items-center overflow-hidden rounded-md border-2 px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dc-pink/35"
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
              {{ link.label }}
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

    <main class="app-main page-transition-host flex-1 overflow-y-auto overflow-x-hidden">
      <div v-if="showAdminEventTabs && adminEventId" class="bg-dc-cream text-dc-ink">
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
        <RouterView v-slot="{ Component, route }">
          <Transition :name="routeTransitionName" @after-enter="resetMainScroll">
            <component :is="Component" :key="route.fullPath" class="page-view" />
          </Transition>
        </RouterView>
      </div>
    </main>

    <FeedbackBot v-if="showFeedbackBot" />
    <AppToaster />
    <aside v-if="scrollDebugEnabled && !mobileMenuOpen" class="scroll-debug-panel" aria-label="Scroll debug values">
      <div class="scroll-debug-header">
        <strong>Scroll Debug</strong>
        <div class="scroll-debug-actions">
          <button type="button" @click="copyScrollDebugSnapshot">Copy</button>
          <button type="button" aria-label="Close scroll debug" @click="disableScrollDebug">x</button>
        </div>
      </div>
      <dl class="scroll-debug-grid">
        <template v-for="[label, value] in scrollDebugRows" :key="label">
          <dt>{{ label }}</dt>
          <dd>{{ value }}</dd>
        </template>
      </dl>
    </aside>
  </div>
</template>
