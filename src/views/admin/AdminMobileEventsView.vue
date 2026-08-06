<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query';
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { eventSeriesBadgeLabel } from '@/lib/event-series';
import { adminPath } from '@/src/admin-routes';
import { fetchEvents, queryKeys } from '@/src/lib/api';
import { organizerPhoneCheckInPath } from '@/src/organizer-viewport';
import type { Event as CommunityEvent, EventStatus } from '@/types';

interface MobileEventAction {
  label: string;
  href: string;
  external?: boolean;
  primary?: boolean;
}

const EVENT_DATE_FORMATTER = new Intl.DateTimeFormat('en', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});
const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  draft: 'Draft',
  cfp_open: 'Submissions open',
  cfp_closed: 'Review',
  upcoming: 'Upcoming',
  live: 'Live now',
  completed: 'Completed',
};

const eventsQuery = useQuery({ queryKey: queryKeys.events, queryFn: fetchEvents });
const events = computed(() => [...(eventsQuery.data.value ?? [])].sort((first, second) => {
  const firstCompleted = first.status === 'completed';
  const secondCompleted = second.status === 'completed';
  if (firstCompleted !== secondCompleted) return firstCompleted ? 1 : -1;
  return firstCompleted
    ? new Date(second.event_date).getTime() - new Date(first.event_date).getTime()
    : new Date(first.event_date).getTime() - new Date(second.event_date).getTime();
}));

function formatDate(value: string): string {
  return EVENT_DATE_FORMATTER.format(new Date(value));
}

function eventStatusClass(status: EventStatus): string {
  if (status === 'live') return 'mobile-ops-status--live';
  if (status === 'completed') return 'mobile-ops-status--done';
  if (status === 'draft') return 'mobile-ops-status--draft';
  return 'mobile-ops-status--upcoming';
}

function eventActions(event: CommunityEvent): MobileEventAction[] {
  const actions: MobileEventAction[] = [];
  if (event.registration_url && event.external_source !== 'luma') {
    actions.push({ label: 'Check in guests', href: organizerPhoneCheckInPath(event.id), primary: true });
  }
  if (event.registration_url && event.status !== 'completed') {
    actions.push({ label: 'Open registration', href: event.registration_url, external: true });
  }
  if (event.registration_url && event.external_source !== 'luma' && event.status !== 'completed') {
    actions.push({ label: 'Show registration QR', href: adminPath(`registration-display/${encodeURIComponent(event.id)}`) });
  }
  if (event.external_url) {
    actions.push({ label: 'Open source event', href: event.external_url, external: true });
  }
  return actions.slice(0, 3);
}
</script>

<template>
  <section class="mobile-ops-page">
    <div class="mobile-ops-wrap">
      <header class="mobile-events-intro">
        <span>Event operations</span>
        <div><h1>Events</h1><strong v-if="!eventsQuery.isPending.value">{{ events.length }}</strong></div>
        <p>Event-day links and guest check-in, ready from your phone.</p>
      </header>

      <div v-if="eventsQuery.isPending.value" class="mobile-ops-panel p-4">
        <p class="font-mono text-[11px] font-semibold uppercase tracking-wide text-dc-gray">Loading events…</p>
      </div>
      <div v-else-if="eventsQuery.isError.value" class="mobile-ops-panel mobile-ops-panel--warning p-4">
        <p class="font-mono text-[11px] font-semibold uppercase tracking-wide text-dc-pink">Unable to load events</p>
        <p class="mt-2 text-sm leading-6 text-dc-gray">Check your connection and try again.</p>
      </div>
      <section v-else class="mobile-ops-panel">
        <p v-if="events.length === 0" class="p-4 text-sm leading-6 text-dc-gray">No organizer events are available yet.</p>
        <article v-for="event in events" :key="event.id" class="mobile-ops-event">
          <div class="mobile-ops-event-top">
            <span class="mobile-ops-status" :class="eventStatusClass(event.status)">{{ EVENT_STATUS_LABELS[event.status] }}</span>
            <span v-if="eventSeriesBadgeLabel(event)" class="mobile-ops-kind">{{ eventSeriesBadgeLabel(event) }}</span>
          </div>
          <h2>{{ event.name }}</h2>
          <p class="mobile-ops-meta">{{ formatDate(event.event_date) }}</p>
          <p v-if="event.location?.label || event.location?.name" class="mobile-ops-location">{{ event.location?.label ?? event.location?.name }}</p>

          <div v-if="eventActions(event).length" class="mobile-ops-actions">
            <template v-for="action in eventActions(event)" :key="`${event.id}-${action.label}`">
              <a v-if="action.external" :href="action.href" target="_blank" rel="noreferrer" class="mobile-ops-action" :class="{ 'mobile-ops-action--primary': action.primary }">{{ action.label }}</a>
              <RouterLink v-else :to="action.href" class="mobile-ops-action" :class="{ 'mobile-ops-action--primary': action.primary }">{{ action.label }}</RouterLink>
            </template>
          </div>
        </article>
      </section>
    </div>
  </section>
</template>

<style scoped>
.mobile-events-intro { padding: .35rem 0 .5rem; }
.mobile-events-intro > span { color: #77736b; font-family: var(--font-mono), monospace; font-size: .6rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; }
.mobile-events-intro > div { display: flex; align-items: end; justify-content: space-between; gap: 1rem; margin-top: .35rem; }
.mobile-events-intro h1 { margin: 0; font-size: 2rem; letter-spacing: -.035em; line-height: 1; }
.mobile-events-intro strong { display: grid; min-width: 2rem; min-height: 2rem; place-items: center; border: 1px solid #d9d5cc; border-radius: 7px; background: #fff; font-family: var(--font-mono), monospace; font-size: .72rem; }
.mobile-events-intro p { margin: .65rem 0 0; color: #5f5b54; font-size: .84rem; font-weight: var(--font-weight-emphasis); line-height: 1.5; }
.mobile-ops-event h2 { margin: 0; font-size: 1.05rem; font-weight: 700; letter-spacing: 0; line-height: 1.25; }
</style>
