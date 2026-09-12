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
const homeStateLabel = computed(() => {
  if (loadingActions.value) return 'Syncing work';
  if (hasActionError.value) return 'Needs refresh';

  return 'Ops ready';
});

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
          <span><i aria-hidden="true"></i> {{ homeStateLabel }}</span>
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

        <div v-if="loadingActions" class="mobile-home-state" role="status">
          <span class="mobile-home-state__icon" aria-hidden="true">↻</span>
          <div>
            <h3>Loading your work</h3>
            <p>Checking event-day operations and conference tasks.</p>
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
              v-for="(action, index) in nextActions"
              :key="action.id"
              :to="actionTarget(action)"
              class="mobile-home-action"
              :class="`mobile-home-action--${action.tone}`"
            >
              <div class="mobile-home-action__meta">
                <span>{{ action.eyebrow }}</span>
                <span>0{{ index + 1 }}</span>
              </div>
              <h3>{{ action.title }}</h3>
              <footer>
                <span>{{ actionDetail(action) }}</span>
                <strong aria-hidden="true">→</strong>
              </footer>
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
.mobile-home-wrap { display: grid; width: min(100%, 42rem); margin: 0 auto; gap: 1.25rem; padding: 1rem max(1rem, env(safe-area-inset-right)) max(1.5rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left)); }
.mobile-home-intro { position: relative; overflow: hidden; min-height: 14rem; border-radius: 12px; background: #111; padding: 1.2rem; color: #fff; }
.mobile-home-intro::after { position: absolute; right: -4.5rem; bottom: -5rem; width: 12rem; height: 12rem; border: 2.5rem solid #e8117f; border-radius: 50%; content: ''; opacity: .92; }
.mobile-home-intro__meta { position: relative; z-index: 1; display: flex; align-items: center; justify-content: space-between; gap: .75rem; }
.mobile-home-intro__meta > span, .mobile-home-actions > header > span, .mobile-home-action__meta { font-family: var(--font-mono), monospace; font-size: .6rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; }
.mobile-home-intro__meta > span { color: #c6c2ba; }
.mobile-home-intro__meta > span:last-child { display: inline-flex; align-items: center; gap: .35rem; color: #fff; }
.mobile-home-intro__meta i { width: .45rem; height: .45rem; border-radius: 50%; background: #f5e642; }
.mobile-home-intro h1 { position: relative; z-index: 1; margin: 2.6rem 0 0; max-width: 10ch; font-size: clamp(2.35rem, 11vw, 3.2rem); font-weight: var(--font-weight-display); letter-spacing: -.045em; line-height: .94; }
.mobile-home-intro p { position: relative; z-index: 1; margin: .85rem 0 0; color: #c6c2ba; font-size: .92rem; font-weight: var(--font-weight-emphasis); line-height: 1.45; }
.mobile-home-intro__mark { position: absolute; z-index: 1; right: 1.15rem; bottom: 1rem; color: #111; font-family: var(--font-mono), monospace; font-size: 1.1rem; font-weight: 800; letter-spacing: -.08em; }
.mobile-home-actions > header { display: flex; align-items: end; justify-content: space-between; gap: 1rem; padding: 0 .15rem; }
.mobile-home-actions > header > span { color: #77736b; }
.mobile-home-actions h2 { margin: 0; font-size: 1.15rem; letter-spacing: -.02em; }
.mobile-home-action-list { display: grid; overflow: hidden; margin-top: .8rem; border: 1px solid #111; border-radius: 12px; background: #fff; }
.mobile-home-action { display: grid; min-height: 10rem; gap: 1rem; border-bottom: 1px solid #d9d5cc; padding: 1rem; color: #111; text-decoration: none; transition: transform 120ms cubic-bezier(.4, 0, .2, 1), background-color 160ms cubic-bezier(.4, 0, .2, 1); }
.mobile-home-action:last-child { border-bottom: 0; }
.mobile-home-action--urgent { background: #fce7f3; }
.mobile-home-action--active { background: #f5e642; }
.mobile-home-action--upcoming { background: #fff; }
.mobile-home-action__meta { display: flex; align-items: center; justify-content: space-between; gap: 1rem; color: #5f5b54; }
.mobile-home-action h3 { margin: 0; max-width: 24ch; align-self: end; font-size: 1.35rem; letter-spacing: -.025em; line-height: 1.12; }
.mobile-home-action footer { display: flex; min-height: 2.2rem; align-items: end; justify-content: space-between; gap: 1rem; border-top: 1px solid currentColor; padding-top: .65rem; color: #5f5b54; font-size: .78rem; font-weight: var(--font-weight-emphasis); }
.mobile-home-action footer strong { color: #111; font-size: 1.15rem; }
.mobile-home-state { display: flex; gap: .85rem; margin-top: .8rem; border: 1px solid #d9d5cc; border-radius: 12px; background: #fff; padding: 1rem; }
.mobile-home-state--warning { border-color: #e8117f; background: #fce7f3; }
.mobile-home-state--clear { background: #f5e642; }
.mobile-home-state__icon { display: grid; width: 2.5rem; height: 2.5rem; flex: 0 0 auto; place-items: center; border: 1px solid currentColor; border-radius: 8px; font-family: var(--font-mono), monospace; font-weight: 800; }
.mobile-home-state h3 { margin: 0; font-size: 1rem; }
.mobile-home-state p { margin: .35rem 0 0; color: #5f5b54; font-size: .8rem; line-height: 1.45; }
.mobile-home-state button { min-height: 2.5rem; margin-top: .75rem; border: 1px solid #111; border-radius: 8px; background: #fff; padding: 0 .8rem; font-family: var(--font-mono), monospace; font-size: .65rem; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
.mobile-home-shortcuts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); overflow: hidden; border: 1px solid #d9d5cc; border-radius: 12px; background: #fff; }
.mobile-home-shortcuts a { display: flex; min-height: 3.75rem; align-items: center; justify-content: space-between; gap: .6rem; border-right: 1px solid #d9d5cc; padding: .8rem; color: #111; font-family: var(--font-mono), monospace; font-size: .62rem; font-weight: 700; letter-spacing: .05em; text-decoration: none; text-transform: uppercase; transition: transform 120ms cubic-bezier(.4, 0, .2, 1), background-color 160ms cubic-bezier(.4, 0, .2, 1); }
.mobile-home-shortcuts a:last-child { border-right: 0; }
.mobile-home-shortcuts a:only-child { grid-column: 1 / -1; }
.mobile-home-shortcuts strong { font-size: 1rem; }
.mobile-home-action:active, .mobile-home-shortcuts a:active, .mobile-home-state button:active { transform: scale(.97); }
@media (hover: hover) and (pointer: fine) { .mobile-home-action:hover, .mobile-home-shortcuts a:hover { background-color: #fff7c9; } }
@media (max-width: 23rem) { .mobile-home-shortcuts { grid-template-columns: 1fr; }.mobile-home-shortcuts a { border-right: 0; border-bottom: 1px solid #d9d5cc; }.mobile-home-shortcuts a:last-child { border-bottom: 0; } }
@media (prefers-reduced-motion: reduce) { .mobile-home-action, .mobile-home-shortcuts a { transition: none; } }
</style>
