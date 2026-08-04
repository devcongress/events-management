<script setup lang="ts">
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, onMounted, onUnmounted } from 'vue';
import CommunityMasthead from '@/src/components/CommunityMasthead.vue';
import PublicEventPreviewBar from '@/src/components/PublicEventPreviewBar.vue';
import EventsPageSkeleton from '@/src/components/ui/page-skeletons/EventsPageSkeleton.vue';
import { adminPath } from '@/src/admin-routes';
import { fetchAdminEventPreview, queryKeys } from '@/src/lib/api';
import type { PublicMeetup, PublicMeetupStatus } from '@/types';

const queryClient = useQueryClient();
const meetupsQuery = useQuery({
  queryKey: queryKeys.adminEventPreview,
  queryFn: fetchAdminEventPreview,
});
const meetups = computed<PublicMeetup[]>(() => meetupsQuery.data.value?.data ?? []);
const loading = computed(() => meetupsQuery.isPending.value);
const error = computed(() => meetupsQuery.error.value?.message ?? null);

const sortedMeetups = computed(() => {
  return [...meetups.value].sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime());
});
const totalPublishedTalks = computed(() => sortedMeetups.value.reduce((total, meetup) => total + meetup.published_talks_count, 0));

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function statusLabel(status: PublicMeetupStatus) {
  if (status === 'live') return '● Live';
  if (status === 'upcoming') return 'Upcoming';
  return 'Past';
}

function statusClass(status: PublicMeetupStatus) {
  if (status === 'live') return 'bg-dc-pink text-white';
  if (status === 'upcoming') return 'bg-dc-yellow text-dc-ink';
  return 'bg-dc-info-soft text-dc-info';
}

function eventPreviewPath(meetup: PublicMeetup): string {
  return adminPath(`website-preview/events/${encodeURIComponent(meetup.slug)}`);
}

function eventPreviewAction(status: PublicMeetupStatus): string {
  if (status === 'live') return 'See live event';
  if (status === 'upcoming') return 'Preview event';
  return 'View recap';
}

function handlePublicMeetupRefresh(event: StorageEvent) {
  if (event.key !== 'dc-public-meetups-refresh') return;
  void queryClient.invalidateQueries({ queryKey: queryKeys.adminEventPreview });
}

function handlePublicMeetupRefreshSignal() {
  void queryClient.invalidateQueries({ queryKey: queryKeys.adminEventPreview });
}

onMounted(() => {
  window.addEventListener('storage', handlePublicMeetupRefresh);
  window.addEventListener('dc-public-meetups-refresh', handlePublicMeetupRefreshSignal);
});

onUnmounted(() => {
  window.removeEventListener('storage', handlePublicMeetupRefresh);
  window.removeEventListener('dc-public-meetups-refresh', handlePublicMeetupRefreshSignal);
});
</script>

<template>
  <div class="editorial-page">
    <PublicEventPreviewBar
      endpoint="/api/admin/events-preview"
      :event-count="sortedMeetups.length"
    />

    <main class="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-12">
      <CommunityMasthead
        eyebrow="events"
        title="Where we show up"
        :description="loading ? 'Loading the community calendar.' : `${sortedMeetups.length} event${sortedMeetups.length !== 1 ? 's' : ''}, ${totalPublishedTalks} published talk${totalPublishedTalks !== 1 ? 's' : ''}, and the next rooms we are gathering in.`"
      />

      <EventsPageSkeleton v-if="loading" />

      <div v-else-if="error" class="rounded-lg border-2 border-red-500 bg-red-50 p-10 text-center font-mono text-red-700">
        {{ error }}
      </div>

      <div v-else-if="sortedMeetups.length === 0" class="editorial-panel p-10">
        <h2 class="text-2xl font-bold tracking-tight text-dc-ink">No events yet</h2>
        <p class="mt-2 text-dc-gray">Published events will appear here, including private-beta submissions.</p>
      </div>

      <div v-else class="grid gap-5 md:grid-cols-2">
        <article
          v-for="meetup in sortedMeetups"
          :key="meetup.id"
          class="motion-surface motion-lift flex min-h-full flex-col overflow-hidden rounded-lg border-2 border-dc-ink bg-dc-paper shadow-[3px_3px_0_#111111]"
        >
          <RouterLink
            :to="eventPreviewPath(meetup)"
            class="relative block aspect-video border-b-2 border-dc-ink bg-dc-ink"
            :aria-label="`Preview ${meetup.name}`"
          >
            <img :src="meetup.cover" :alt="`${meetup.name} cover`" class="absolute inset-0 size-full object-cover">
            <div class="absolute inset-x-4 bottom-4 flex items-end justify-between gap-3">
              <span class="rounded-md border-2 border-dc-ink px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider shadow-[2px_2px_0_#111111]" :class="statusClass(meetup.status)">
                {{ statusLabel(meetup.status) }}
              </span>
              <span v-if="meetup.photos.length > 0" class="rounded-md bg-dc-ink/75 px-3 py-1.5 font-mono text-[11px] font-semibold text-white">
                {{ meetup.photos.length }} photos
              </span>
            </div>
          </RouterLink>

          <div class="flex flex-1 flex-col gap-3 p-5 sm:p-6">
            <div class="flex flex-wrap items-center justify-between gap-2 font-mono text-xs font-semibold uppercase tracking-wide text-dc-gray">
              <time :datetime="meetup.start">{{ formatDate(meetup.start) }}</time>
              <span class="text-dc-pink">{{ meetup.location.label ?? meetup.location.name }}</span>
            </div>

            <h2 class="community-meetup-card-title text-2xl font-bold leading-tight tracking-tight text-dc-ink sm:text-3xl">
              <RouterLink :to="eventPreviewPath(meetup)" class="hover:text-dc-pink">
                {{ meetup.name }}
              </RouterLink>
            </h2>

            <p class="community-meetup-card-description flex-1 text-sm leading-6 text-dc-gray">
              {{ meetup.description }}
            </p>

            <div class="pt-2">
              <RouterLink
                :to="eventPreviewPath(meetup)"
                class="editorial-secondary-action group inline-flex items-center gap-2"
              >
                <span>{{ eventPreviewAction(meetup.status) }}</span>
                <span aria-hidden="true" class="text-base leading-none transition-transform duration-200 group-hover:translate-x-0.5">→</span>
              </RouterLink>
            </div>
          </div>
        </article>
      </div>
    </main>
  </div>
</template>
