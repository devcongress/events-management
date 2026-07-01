<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query';
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { adminPath } from '@/src/admin-routes';
import { fetchEvents, fetchFeedbackMonths, queryKeys } from '@/src/lib/api';
import { resolveEventSeriesType } from '@/lib/event-series';
import type { Event as CommunityEvent, EventStatus } from '@/types';

interface MobileEventAction {
  label: string;
  href: string;
  external?: boolean;
  primary?: boolean;
}

const eventsQuery = useQuery({
  queryKey: queryKeys.events,
  queryFn: fetchEvents,
});

const feedbackMonthsQuery = useQuery({
  queryKey: queryKeys.feedbackMonths,
  queryFn: fetchFeedbackMonths,
});

const events = computed(() => [...(eventsQuery.data.value ?? [])].sort((first, second) => (
  new Date(first.event_date).getTime() - new Date(second.event_date).getTime()
)));
const feedbackOpenEventIds = computed(() => new Set(
  (feedbackMonthsQuery.data.value?.months ?? [])
    .flatMap((month) => month.events)
    .filter((item) => item.is_open)
    .map((item) => item.event.id),
));
const todayStart = computed(() => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.getTime();
});
const liveEvents = computed(() => events.value.filter((event) => event.status === 'live'));
const upcomingEvents = computed(() => events.value.filter((event) => (
  event.status !== 'completed'
  && event.status !== 'live'
  && new Date(event.event_date).getTime() >= todayStart.value
)));
const recentCompletedEvents = computed(() => [...events.value]
  .filter((event) => event.status === 'completed')
  .sort((first, second) => new Date(second.event_date).getTime() - new Date(first.event_date).getTime()));
const priorityEvents = computed(() => {
  const seen = new Set<string>();
  const ordered = [...liveEvents.value, ...upcomingEvents.value, ...recentCompletedEvents.value];

  return ordered.filter((event) => {
    if (seen.has(event.id)) return false;
    seen.add(event.id);
    return true;
  }).slice(0, 4);
});
const blockedWorkspaces = [
  'Event import and editing',
  'Program schedules and media',
  'Feedback configuration',
  'Attendance ledgers and CSV review',
  'Audit logs and organizer management',
];

function eventHasStarted(event: CommunityEvent): boolean {
  return new Date(event.event_date).getTime() <= Date.now();
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function eventStatusLabel(status: EventStatus): string {
  const labels: Record<EventStatus, string> = {
    draft: 'Draft',
    cfp_open: 'Submissions open',
    cfp_closed: 'Review',
    upcoming: 'Upcoming',
    live: 'Live now',
    completed: 'Completed',
  };

  return labels[status];
}

function eventStatusClass(status: EventStatus): string {
  if (status === 'live') return 'mobile-ops-status--live';
  if (status === 'completed') return 'mobile-ops-status--done';
  if (status === 'draft') return 'mobile-ops-status--draft';
  return 'mobile-ops-status--upcoming';
}

function eventSeriesLabel(event: CommunityEvent): string {
  const labels = {
    monthly: 'Monthly',
    quarterly: 'Quarterly',
    special: 'Special',
  };

  return labels[resolveEventSeriesType(event)];
}

function eventActions(event: CommunityEvent): MobileEventAction[] {
  const actions: MobileEventAction[] = [];

  if (feedbackOpenEventIds.value.has(event.id) && eventHasStarted(event)) {
    actions.push({
      label: 'Show feedback QR',
      href: adminPath(`feedback-display/${event.id}`),
      primary: true,
    });
  }

  if (event.publish_to_website && event.slug) {
    actions.push({
      label: event.status === 'completed' ? 'View recap' : 'Open public page',
      href: `/events/${event.slug}`,
    });
  }

  if (event.registration_url && event.status !== 'completed') {
    actions.push({
      label: 'Open registration',
      href: event.registration_url,
      external: true,
    });
  }

  if (event.external_url) {
    actions.push({
      label: 'Open source event',
      href: event.external_url,
      external: true,
    });
  }

  return actions.slice(0, 3);
}
</script>

<template>
  <section class="mobile-ops-page">
    <div class="mobile-ops-wrap">
      <header class="mobile-ops-hero">
        <p class="editorial-eyebrow">organizer phone view</p>
        <h1>Mobile ops</h1>
        <p>Quick event checks stay available here. Full organizer tools are available on tablet or laptop.</p>
      </header>

      <div v-if="eventsQuery.isPending.value" class="mobile-ops-panel p-4">
        <p class="font-mono text-[11px] font-bold uppercase tracking-wide text-dc-gray">Loading organizer events...</p>
      </div>

      <div v-else-if="eventsQuery.error.value" class="mobile-ops-panel mobile-ops-panel--warning p-4">
        <p class="font-mono text-[11px] font-bold uppercase tracking-wide text-dc-pink">Unable to load events</p>
        <p class="mt-2 text-sm leading-6 text-dc-gray">Try again on a stronger connection, or use the tablet/laptop console.</p>
      </div>

      <template v-else>
        <section class="mobile-ops-panel">
          <div class="mobile-ops-section-header">
            <div>
              <p class="editorial-eyebrow">events</p>
              <h2>Now and next</h2>
            </div>
            <span>{{ events.length }}</span>
          </div>

          <div v-if="priorityEvents.length === 0" class="p-4 text-sm leading-6 text-dc-gray">
            No organizer events are available yet. Create or import events from a tablet or laptop.
          </div>

          <article
            v-for="event in priorityEvents"
            :key="event.id"
            class="mobile-ops-event"
          >
            <div class="mobile-ops-event-top">
              <span class="mobile-ops-status" :class="eventStatusClass(event.status)">
                {{ eventStatusLabel(event.status) }}
              </span>
              <span class="mobile-ops-kind">{{ eventSeriesLabel(event) }}</span>
            </div>
            <h3>{{ event.name }}</h3>
            <p class="mobile-ops-meta">{{ formatDate(event.event_date) }}</p>
            <p v-if="event.location?.label || event.location?.name" class="mobile-ops-location">
              {{ event.location.label ?? event.location.name }}
            </p>

            <div v-if="eventActions(event).length > 0" class="mobile-ops-actions">
              <template v-for="action in eventActions(event)" :key="`${event.id}-${action.label}`">
                <a
                  v-if="action.external"
                  :href="action.href"
                  target="_blank"
                  rel="noreferrer"
                  class="mobile-ops-action"
                  :class="{ 'mobile-ops-action--primary': action.primary }"
                >
                  {{ action.label }}
                </a>
                <RouterLink
                  v-else
                  :to="action.href"
                  class="mobile-ops-action"
                  :class="{ 'mobile-ops-action--primary': action.primary }"
                >
                  {{ action.label }}
                </RouterLink>
              </template>
            </div>
          </article>
        </section>

        <section class="mobile-ops-panel">
          <div class="mobile-ops-section-header">
            <div>
              <p class="editorial-eyebrow">tablet or laptop</p>
              <h2>Full console</h2>
            </div>
          </div>
          <ul class="mobile-ops-blocked-list">
            <li v-for="item in blockedWorkspaces" :key="item">
              {{ item }}
            </li>
          </ul>
        </section>
      </template>
    </div>
  </section>
</template>
