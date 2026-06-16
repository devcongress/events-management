<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import CommunityMasthead from '@/src/components/CommunityMasthead.vue';
import EventsPageSkeleton from '@/src/components/ui/page-skeletons/EventsPageSkeleton.vue';

type MeetupStatus = 'upcoming' | 'live' | 'past';

interface PublicMeetup {
  id: string;
  slug: string;
  name: string;
  status: MeetupStatus;
  start: string;
  end: string;
  description: string;
  cover: string;
  location: {
    label?: string;
    name: string;
    url: string | null;
  };
  registration_url: string | null;
  stream_url: string | null;
  cfp_url: string | null;
  archive_url: string;
  speakers: {
    name: string;
    talk_title: string;
  }[];
  schedule: {
    title: string;
    type: string;
  }[];
  photos: {
    url: string;
    type: 'image' | 'folder';
  }[];
  talks_count: number;
  published_talks_count: number;
}

interface MeetupsResponse {
  data: PublicMeetup[];
}

const meetups = ref<PublicMeetup[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

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

function statusLabel(status: MeetupStatus) {
  if (status === 'live') return '● Live';
  if (status === 'upcoming') return 'Upcoming';
  return 'Past';
}

function statusClass(status: MeetupStatus) {
  if (status === 'live') return 'bg-dc-pink text-white';
  if (status === 'upcoming') return 'bg-dc-yellow text-dc-ink';
  return 'bg-dc-info-soft text-dc-info';
}

function primaryHref(meetup: PublicMeetup) {
  if (meetup.status === 'past') return `/archive/${meetup.id}`;
  return meetup.registration_url ?? meetup.cfp_url ?? meetup.stream_url ?? `/archive/${meetup.id}`;
}

function primaryLabel(meetup: PublicMeetup) {
  if (meetup.status === 'live') return meetup.stream_url ? 'Follow Live' : 'View Event';
  if (meetup.status === 'upcoming') return meetup.registration_url || meetup.cfp_url ? 'Register' : 'View Event';
  return 'View Recap';
}

function isInternalHref(href: string) {
  return href.startsWith('/');
}

onMounted(async () => {
  try {
    const response = await fetch('/api/public/meetups');
    if (!response.ok) {
      throw new Error(`Events request failed: ${response.status}`);
    }

    const payload = await response.json() as MeetupsResponse;
    meetups.value = payload.data;
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'Unable to load events';
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="editorial-page">
    <main class="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-12">
      <CommunityMasthead
        eyebrow="meetups"
        title="Where we show up"
        :description="loading ? 'Loading the community calendar.' : `${sortedMeetups.length} meetup${sortedMeetups.length !== 1 ? 's' : ''}, ${totalPublishedTalks} published talk${totalPublishedTalks !== 1 ? 's' : ''}, and the next rooms we are gathering in.`"
      />

      <EventsPageSkeleton v-if="loading" />

      <div v-else-if="error" class="rounded-lg border-2 border-red-500 bg-red-50 p-10 text-center font-mono text-red-700">
        {{ error }}
      </div>

      <div v-else-if="sortedMeetups.length === 0" class="editorial-panel p-10">
        <h2 class="text-2xl font-black tracking-tight text-dc-ink">No meetups yet</h2>
        <p class="mt-2 text-dc-gray">Published community meetups will appear here.</p>
      </div>

      <div v-else class="grid gap-5 md:grid-cols-2">
        <article
          v-for="meetup in sortedMeetups"
          :key="meetup.id"
          class="motion-surface motion-lift flex min-h-full flex-col overflow-hidden rounded-lg border-2 border-dc-ink bg-dc-paper shadow-[3px_3px_0_#111111]"
        >
          <div class="relative aspect-video border-b-2 border-dc-ink bg-dc-ink">
            <img :src="meetup.cover" :alt="`${meetup.name} cover`" class="absolute inset-0 size-full object-cover">
            <div class="absolute inset-x-4 bottom-4 flex items-end justify-between gap-3">
              <span class="rounded-md border-2 border-dc-ink px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider shadow-[2px_2px_0_#111111]" :class="statusClass(meetup.status)">
                {{ statusLabel(meetup.status) }}
              </span>
              <span v-if="meetup.photos.length > 0" class="rounded-md bg-dc-ink/75 px-3 py-1.5 font-mono text-[11px] font-bold text-white">
                {{ meetup.photos.length }} photos
              </span>
            </div>
          </div>

          <div class="flex flex-1 flex-col gap-3 p-5 sm:p-6">
            <div class="flex flex-wrap items-center justify-between gap-2 font-mono text-xs font-bold uppercase tracking-wide text-dc-gray">
              <time :datetime="meetup.start">{{ formatDate(meetup.start) }}</time>
              <span class="text-dc-pink">{{ meetup.location.label ?? meetup.location.name }}</span>
            </div>

            <h2 class="text-2xl font-black leading-tight tracking-tight text-dc-ink sm:text-3xl">
              {{ meetup.name }}
            </h2>

            <p class="line-clamp-3 flex-1 text-sm leading-6 text-dc-gray">
              {{ meetup.description }}
            </p>

            <div class="pt-2">
              <component
                :is="isInternalHref(primaryHref(meetup)) ? 'RouterLink' : 'a'"
                :to="isInternalHref(primaryHref(meetup)) ? primaryHref(meetup) : undefined"
                :href="!isInternalHref(primaryHref(meetup)) ? primaryHref(meetup) : undefined"
                :target="!isInternalHref(primaryHref(meetup)) ? '_blank' : undefined"
                :rel="!isInternalHref(primaryHref(meetup)) ? 'noopener noreferrer' : undefined"
                class="editorial-secondary-action inline-flex"
              >
                {{ primaryLabel(meetup) }}
              </component>
            </div>
          </div>
        </article>
      </div>
    </main>
  </div>
</template>
