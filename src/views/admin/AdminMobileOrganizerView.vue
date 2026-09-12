<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query';
import { computed } from 'vue';
import { RouterLink, type RouteLocationRaw } from 'vue-router';
import { ACTIVE_ANNUAL_CONFERENCE_EDITION, mobileAnnualConferencePath } from '@/src/annual-conference';
import {
  fetchAdminSession,
  fetchAnnualConferenceWorkPlan,
  fetchEvents,
  queryKeys,
} from '@/src/lib/api';
import {
  mobileOrganizerNextActions,
  type MobileOrganizerNextAction,
} from '@/src/lib/mobile-organizer-actions';
import {
  ORGANIZER_PHONE_EVENTS_ROUTE_PATH,
  organizerPhoneCheckInPath,
  organizerPhoneEventPath,
} from '@/src/organizer-viewport';

const sessionQuery = useQuery({ queryKey: queryKeys.adminSession, queryFn: fetchAdminSession });
const authenticated = computed(() => sessionQuery.data.value?.authenticated === true);
const role = computed(() => sessionQuery.data.value?.user?.role ?? 'organizer');
const canSeeEvents = computed(() => authenticated.value && role.value !== 'volunteer');
const eventsQuery = useQuery({
  queryKey: queryKeys.events,
  queryFn: fetchEvents,
  enabled: canSeeEvents,
});
const workPlanQuery = useQuery({
  queryKey: queryKeys.annualConferenceWorkPlan(ACTIVE_ANNUAL_CONFERENCE_EDITION.year),
  queryFn: () => fetchAnnualConferenceWorkPlan(ACTIVE_ANNUAL_CONFERENCE_EDITION.year),
  enabled: authenticated,
});
const firstName = computed(() => sessionQuery.data.value?.user?.display_name?.trim().split(/\s+/)[0] ?? 'organizer');
const greeting = computed(() => {
  const hour = new Date().getHours();

  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';

  return 'Good evening';
});
const todayLabel = new Intl.DateTimeFormat('en-GH', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
}).format(new Date());
const actionDateFormatter = new Intl.DateTimeFormat('en-GH', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
});
const taskDateFormatter = new Intl.DateTimeFormat('en-GH', {
  day: 'numeric',
  month: 'short',
});
const nextActions = computed(() => mobileOrganizerNextActions({
  role: role.value,
  events: canSeeEvents.value ? eventsQuery.data.value ?? [] : [],
  tasks: workPlanQuery.data.value?.tasks ?? [],
}));
const loadingActions = computed(() => (
  sessionQuery.isPending.value
  || (authenticated.value && workPlanQuery.isPending.value)
  || (canSeeEvents.value && eventsQuery.isPending.value)
));
const hasActionError = computed(() => (
  sessionQuery.isError.value
  || workPlanQuery.isError.value
  || (canSeeEvents.value && eventsQuery.isError.value)
));

function actionTarget(action: MobileOrganizerNextAction): RouteLocationRaw {
  if (action.target.kind === 'check_in') return organizerPhoneCheckInPath(action.target.eventId);
  if (action.target.kind === 'event') return organizerPhoneEventPath(action.target.eventId);

  return {
    path: mobileAnnualConferencePath(),
    query: {
      section: 'tasks',
      phase: 'all',
      task: action.target.taskId,
    },
  };
}

function actionDetail(action: MobileOrganizerNextAction): string {
  if (action.target.kind === 'event' && action.eyebrow === 'Next event') {
    return actionDateFormatter.format(new Date(action.detail));
  }
  if (action.target.kind === 'task' && /^\d{4}-\d{2}-\d{2}$/.test(action.detail)) {
    return `Due ${taskDateFormatter.format(new Date(`${action.detail}T12:00:00`))}`;
  }

  return action.detail;
}

function retryActions() {
  void sessionQuery.refetch();
  if (authenticated.value) void workPlanQuery.refetch();
  if (canSeeEvents.value) void eventsQuery.refetch();
}
</script>

<template>
  <section class="mobile-home-page">
    <div class="mobile-home-wrap">
      <header class="mobile-home-intro">
        <div class="mobile-home-intro__meta">
          <span>{{ todayLabel }}</span>
        </div>
        <h1>{{ greeting }}, {{ firstName }}.</h1>
        <p>{{ loadingActions ? 'Finding what needs you now.' : 'Here is what needs your attention next.' }}</p>
        <span class="mobile-home-intro__mark" aria-hidden="true">DC</span>
      </header>

      <main class="mobile-home-actions" aria-labelledby="mobile-home-actions-title" aria-live="polite">
        <header>
          <span>Priority queue</span>
          <h2 id="mobile-home-actions-title">Next actions</h2>
        </header>

        <div v-if="loadingActions" class="mobile-home-action-list" role="status" aria-busy="true" aria-label="Loading your work">
          <span class="sr-only">Loading your work</span>
          <div v-for="placeholder in 2" :key="placeholder" class="mobile-home-action mobile-home-action--skeleton" aria-hidden="true">
            <span class="mobile-home-action__meta"><span class="action-bone action-bone--label"></span></span>
            <h3><span class="action-bone action-bone--title"></span></h3>
            <p class="mobile-home-action__detail"><span class="action-bone action-bone--date"></span></p>
            <span class="mobile-home-action__arrow"><span class="action-bone action-bone--icon"></span></span>
          </div>
        </div>

        <template v-else>
          <div v-if="hasActionError" class="mobile-home-state mobile-home-state--warning" role="alert">
            <span class="mobile-home-state__icon" aria-hidden="true">!</span>
            <div>
              <h3>Some actions could not load</h3>
              <p>You can still use any actions shown below.</p>
              <button type="button" @click="retryActions">Try again</button>
            </div>
          </div>

          <div v-if="nextActions.length" class="mobile-home-action-list">
            <RouterLink
              v-for="action in nextActions"
              :key="action.id"
              :to="actionTarget(action)"
              class="mobile-home-action"
              :class="`mobile-home-action--${action.tone}`"
            >
              <div class="mobile-home-action__meta">
                <span>{{ action.eyebrow }}</span>
              </div>
              <h3>{{ action.title }}</h3>
              <p class="mobile-home-action__detail">{{ actionDetail(action) }}</p>
              <span class="mobile-home-action__arrow" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>
              </span>
            </RouterLink>
          </div>

          <div v-else-if="!hasActionError" class="mobile-home-state mobile-home-state--clear">
            <span class="mobile-home-state__icon" aria-hidden="true">✓</span>
            <div>
              <h3>You are clear for now</h3>
              <p>No event-day operation or unfinished conference task needs attention.</p>
            </div>
          </div>
        </template>
      </main>

      <nav class="mobile-home-shortcuts" aria-label="Organizer workspaces">
        <RouterLink v-if="canSeeEvents" :to="ORGANIZER_PHONE_EVENTS_ROUTE_PATH">
          <span>All events</span><strong aria-hidden="true">↗</strong>
        </RouterLink>
        <RouterLink :to="mobileAnnualConferencePath()">
          <span>{{ role === 'volunteer' ? 'My conference work' : 'Conference overview' }}</span><strong aria-hidden="true">↗</strong>
        </RouterLink>
      </nav>
    </div>
  </section>
</template>

<style scoped>
.mobile-home-page { min-height: 100%; background: #f5f2e8; color: #111; }
.mobile-home-wrap { display: grid; width: min(100%, 42rem); margin: 0 auto; gap: 1.25rem; padding: 1rem max(1rem, env(safe-area-inset-right)) calc(6rem + env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left)); }
.mobile-home-intro { position: relative; overflow: hidden; min-height: 14rem; border: 1px solid #111; border-radius: 12px; background: var(--surface-paper); padding: 1.2rem; color: #111; }
.mobile-home-intro::after { position: absolute; bottom: 1.2rem; left: 1.2rem; width: 4rem; height: .35rem; background: #f5e642; content: ''; }
.mobile-home-intro__meta { position: relative; z-index: 1; display: flex; align-items: center; justify-content: space-between; gap: .75rem; }
.mobile-home-intro__meta > span, .mobile-home-actions > header > span, .mobile-home-action__meta { font-family: var(--font-mono), monospace; font-size: .6rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; }
.mobile-home-intro__meta > span { color: #555; }
.mobile-home-intro h1 { position: relative; z-index: 1; margin: 2.6rem 0 0; max-width: 10ch; font-size: clamp(2.35rem, 11vw, 3.2rem); font-weight: var(--font-weight-display); letter-spacing: -.045em; line-height: .94; }
.mobile-home-intro p { position: relative; z-index: 1; margin: .85rem 0 0; color: #555; font-size: .92rem; font-weight: var(--font-weight-emphasis); line-height: 1.45; }
.mobile-home-intro__mark { position: absolute; z-index: 1; right: 1.15rem; bottom: 1rem; color: #e8117f; font-family: var(--font-mono), monospace; font-size: 1.1rem; font-weight: 800; letter-spacing: -.08em; }
.mobile-home-actions > header { display: flex; align-items: end; justify-content: space-between; gap: 1rem; padding: 0 .15rem; }
.mobile-home-actions > header > span { color: #77736b; }
.mobile-home-actions h2 { margin: 0; font-size: 1.15rem; letter-spacing: -.02em; }
.mobile-home-action-list { display: grid; gap: .65rem; margin-top: .8rem; }
.mobile-home-action { display: grid; grid-template-columns: minmax(0, 1fr) 2.5rem; column-gap: .85rem; row-gap: .45rem; align-items: center; border: 1px solid var(--border-subtle); border-radius: 12px; padding: 1rem; color: #111; text-decoration: none; transition: transform 120ms cubic-bezier(.4, 0, .2, 1), background-color 160ms cubic-bezier(.4, 0, .2, 1); }
.mobile-home-action:focus-visible { outline: 2px solid #e8117f; outline-offset: 3px; }
.mobile-home-action--urgent, .mobile-home-action--active, .mobile-home-action--upcoming { background: var(--surface-paper); }
.mobile-home-action--urgent .mobile-home-action__meta > span:first-child { color: #e8117f; }
.mobile-home-action--active .mobile-home-action__meta > span:first-child { background: #f5e642; color: #111; }
.mobile-home-action__meta { grid-column: 1; display: flex; align-items: center; color: #555; }
.mobile-home-action h3 { grid-column: 1; margin: 0; overflow-wrap: anywhere; font-size: 1.08rem; font-weight: var(--font-weight-heading); letter-spacing: -.02em; line-height: 1.3; }
.mobile-home-action__detail { grid-column: 1; margin: .1rem 0 0; color: #555; font-size: .78rem; line-height: 1.4; }
.mobile-home-action__arrow { grid-column: 2; grid-row: 1 / 4; display: grid; width: 2.5rem; height: 2.5rem; place-items: center; border: 1px solid var(--border-subtle); border-radius: 8px; background: var(--surface-warm); }
.mobile-home-action__arrow svg { width: 1.1rem; height: 1.1rem; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.mobile-home-action--skeleton { background: var(--surface-paper); }
.mobile-home-action--skeleton .mobile-home-action__arrow { background: var(--surface-paper); }
.action-bone { display: block; border-radius: 4px; background: var(--skeleton-base); }
.action-bone--label { width: 6.5rem; height: .75rem; }
.action-bone--title { width: 85%; height: 1.4rem; }
.action-bone--date { width: 9rem; max-width: 100%; height: 1.1rem; }
.action-bone--icon { width: 1.1rem; height: 1.1rem; }
.mobile-home-state { display: flex; gap: .85rem; margin-top: .8rem; border: 1px solid #d9d5cc; border-radius: 12px; background: #fff; padding: 1rem; }
.mobile-home-state--warning { border-color: #e8117f; }
.mobile-home-state--warning .mobile-home-state__icon { color: #e8117f; }
.mobile-home-state--clear .mobile-home-state__icon { background: #f5e642; }
.mobile-home-state__icon { display: grid; width: 2.5rem; height: 2.5rem; flex: 0 0 auto; place-items: center; border: 1px solid currentColor; border-radius: 8px; font-family: var(--font-mono), monospace; font-weight: 800; }
.mobile-home-state h3 { margin: 0; font-size: 1rem; }
.mobile-home-state p { margin: .35rem 0 0; color: #5f5b54; font-size: .8rem; line-height: 1.45; }
.mobile-home-state button { min-height: 2.5rem; margin-top: .75rem; border: 1px solid #111; border-radius: 8px; background: #fff; padding: 0 .8rem; font-family: var(--font-mono), monospace; font-size: .65rem; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
.mobile-home-shortcuts { position: fixed; z-index: 30; bottom: 0; left: 0; right: 0; display: grid; width: min(100%, 42rem); margin-inline: auto; grid-template-columns: repeat(2, minmax(0, 1fr)); border-top: 1px solid #d9d5cc; background: #fff; padding: .35rem max(.5rem, env(safe-area-inset-right)) max(.35rem, env(safe-area-inset-bottom)) max(.5rem, env(safe-area-inset-left)); }
.mobile-home-shortcuts a { display: flex; min-height: 3.75rem; align-items: center; justify-content: space-between; gap: .6rem; border-right: 1px solid #d9d5cc; padding: .8rem; color: #111; font-family: var(--font-mono), monospace; font-size: .62rem; font-weight: 700; letter-spacing: .05em; text-decoration: none; text-transform: uppercase; transition: transform 120ms cubic-bezier(.4, 0, .2, 1), background-color 160ms cubic-bezier(.4, 0, .2, 1); }
.mobile-home-shortcuts a:last-child { border-right: 0; }
.mobile-home-shortcuts a:only-child { grid-column: 1 / -1; }
.mobile-home-shortcuts strong { font-size: 1rem; }
.mobile-home-action:active, .mobile-home-shortcuts a:active, .mobile-home-state button:active { transform: scale(.97); }
@media (hover: hover) and (pointer: fine) { .mobile-home-action:hover, .mobile-home-shortcuts a:hover { background-color: var(--surface-warm); } }
@media (max-width: 23rem) { .mobile-home-shortcuts a { padding: .65rem .45rem; font-size: .55rem; } }
@media (prefers-reduced-motion: reduce) { .mobile-home-action, .mobile-home-shortcuts a { transition: none; } }
</style>
