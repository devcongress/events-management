<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import NaviiAvatar from '@/src/components/NaviiAvatar.vue';
import DashboardPageSkeleton from '@/src/components/ui/page-skeletons/DashboardPageSkeleton.vue';
import { fetchPublicHome, queryKeys } from '@/src/lib/api';
import type { PublicArchiveTalk } from '@/types';

const homeQuery = useQuery({
  queryKey: queryKeys.publicHome,
  queryFn: fetchPublicHome,
});
const home = computed(() => homeQuery.data.value ?? null);
const error = computed(() => homeQuery.error.value?.message ?? null);
const loading = computed(() => homeQuery.isPending.value);
const activeMeetupPhoto = ref(0);
const isMeetupPhotoShifting = ref(false);
let meetupPhotoTimer: number | undefined;
let meetupPhotoShiftTimer: number | undefined;
const meetupPhotos = [
  {
    src: '/images/apr-meetup.jpg',
    alt: 'DevCongress community members gathered outside after the April meetup',
    caption: 'April meetup',
  },
  {
    src: '/images/fido-dev-0375.jpg',
    alt: 'DevCongress attendees seated during a community session',
    caption: 'Audience session',
  },
  {
    src: '/images/fido-dev-0539.jpg',
    alt: 'DevCongress attendees standing and listening during a meetup',
    caption: 'Community room',
  },
];

const completedEventsCount = computed(() => home.value?.completed_events_count ?? 0);
const publishedTalksCount = computed(() => home.value?.published_talks_count ?? 0);
const cfpOpenEvent = computed(() => home.value?.cfp_event ?? null);
const recentTalks = computed(() => home.value?.recent_talks ?? []);
const topRegulars = computed(() => home.value?.regulars ?? []);
const layeredMeetupPhotos = computed(() => {
  return meetupPhotos.map((photo, index) => ({
    ...photo,
    index,
    layer: (index - activeMeetupPhoto.value + meetupPhotos.length) % meetupPhotos.length,
  }));
});
const activeMeetupPhotoNumber = computed(() => activeMeetupPhoto.value + 1);

function eventNameForTalk(talk: PublicArchiveTalk): string {
  return talk.event_name;
}

function rankLabel(rank: number): string {
  if (rank === 1) return '01';
  if (rank === 2) return '02';
  if (rank === 3) return '03';
  return `#${rank}`;
}

function rotateMeetupPhotos() {
  if (isMeetupPhotoShifting.value) return;

  const nextMeetupPhoto = (activeMeetupPhoto.value + 1) % meetupPhotos.length;
  isMeetupPhotoShifting.value = true;

  if (meetupPhotoShiftTimer !== undefined) {
    window.clearTimeout(meetupPhotoShiftTimer);
  }
  meetupPhotoShiftTimer = window.setTimeout(() => {
    activeMeetupPhoto.value = nextMeetupPhoto;
    isMeetupPhotoShifting.value = false;
  }, 280);
}

onMounted(() => {
  const shouldReduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!shouldReduceMotion) {
    meetupPhotoTimer = window.setInterval(rotateMeetupPhotos, 3600);
  }
});

onUnmounted(() => {
  if (meetupPhotoTimer !== undefined) {
    window.clearInterval(meetupPhotoTimer);
  }
  if (meetupPhotoShiftTimer !== undefined) {
    window.clearTimeout(meetupPhotoShiftTimer);
  }
});
</script>

<template>
  <div class="editorial-page">
    <div class="home-hero relative border-b-2 border-dc-ink" :class="loading ? 'home-hero--loading overflow-visible' : 'overflow-hidden'">
      <div class="absolute inset-0 bg-dc-cream" />
      <div
        class="absolute inset-0 opacity-100"
        style="
          background-image:
            linear-gradient(rgba(17, 17, 17, 0.055) 1px, transparent 1px),
            linear-gradient(90deg, rgba(17, 17, 17, 0.055) 1px, transparent 1px);
          background-size: 44px 44px;
        "
      />

      <div class="home-hero-inner relative mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.2fr_0.8fr] lg:px-8 lg:py-20">
        <DashboardPageSkeleton v-if="loading" class="lg:col-span-2" />

        <div v-else-if="error" class="max-w-xl border-2 border-dc-ink bg-dc-paper p-6 font-mono text-dc-pink shadow-[3px_3px_0_#111111]">
          {{ error }}
        </div>

        <template v-else>
          <section>
            <div class="home-hero-kicker mb-6 inline-flex items-center gap-2 border-2 border-dc-ink bg-dc-yellow px-3 py-2 font-mono text-xs uppercase tracking-[0.22em] text-dc-ink shadow-[2px_2px_0_#111111]">
              <span class="size-1.5 bg-dc-pink" />
              Community tech talks
            </div>

            <h1 class="home-hero-title font-mono text-5xl font-black leading-none tracking-tight text-dc-ink sm:text-7xl lg:text-8xl">
              <span>DEV</span><span class="text-dc-yellow">::</span><span>CON</span><span class="text-dc-gray">[]</span>
            </h1>

            <p class="home-hero-lede mt-7 max-w-2xl text-xl font-medium leading-8 text-dc-gray">
              A community-run space for talks, event archives, speaker slide links, and monthly meetup operations.
            </p>

            <div class="home-hero-actions mt-8 flex flex-col gap-3 sm:flex-row">
              <RouterLink
                :to="cfpOpenEvent ? `/cfp/${cfpOpenEvent.id}` : '/archive'"
                class="editorial-action"
              >
                {{ cfpOpenEvent ? 'Submit a Talk' : 'Explore Talks' }}
              </RouterLink>
              <RouterLink to="/leaderboard" class="editorial-secondary-action">
                Rankings Preview
              </RouterLink>
            </div>
          </section>

          <aside class="self-end">
            <div class="meetup-contact-sheet">
              <div
                class="meetup-photo-stack"
                :class="{ 'meetup-photo-stack--shifting': isMeetupPhotoShifting }"
                aria-label="Rotating meetup photo stack"
              >
                <div class="meetup-photo-spacer" aria-hidden="true" />
                <figure
                  v-for="photo in layeredMeetupPhotos"
                  :key="photo.src"
                  class="meetup-photo-print"
                  :aria-hidden="photo.layer !== 0"
                  :class="[
                    photo.layer === 0 ? 'meetup-photo-print--front' : '',
                    photo.layer === 1 ? 'meetup-photo-print--middle' : '',
                    photo.layer === 2 ? 'meetup-photo-print--back' : '',
                  ]"
                >
                  <div class="aspect-[16/10] overflow-hidden bg-dc-ink">
                    <img
                      :src="photo.src"
                      :alt="photo.layer === 0 ? photo.alt : ''"
                      class="size-full object-cover"
                      draggable="false"
                    >
                  </div>
                </figure>
              </div>
              <div class="meetup-photo-credit" aria-live="polite">
                <span>{{ meetupPhotos[activeMeetupPhoto].caption }}</span>
                <span>{{ activeMeetupPhotoNumber }}/{{ meetupPhotos.length }}</span>
              </div>
            </div>
          </aside>
        </template>
      </div>
    </div>

    <div v-if="!loading && !error" class="editorial-wrap">
      <section class="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          <div class="home-summary-grid mb-8 grid max-w-4xl gap-4 sm:grid-cols-2">
            <article class="editorial-panel px-5 py-4">
              <p class="editorial-eyebrow">events</p>
              <p class="mt-2 font-mono text-3xl font-bold leading-none text-dc-ink">{{ completedEventsCount }}</p>
              <p class="mt-1 text-sm text-dc-gray">completed community nights</p>
            </article>
            <article class="editorial-panel px-5 py-4">
              <p class="editorial-eyebrow">talks</p>
              <p class="mt-2 font-mono text-3xl font-bold leading-none text-dc-ink">{{ publishedTalksCount }}</p>
              <p class="mt-1 text-sm text-dc-gray">published sessions in the archive</p>
            </article>
          </div>

          <div class="mb-5 border-b border-dc-ink pb-4">
            <p class="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-dc-pink">from the archive</p>
            <h2 class="mt-2 text-3xl font-black tracking-tight text-dc-ink">Recent Community Talks</h2>
          </div>

          <div v-if="recentTalks.length === 0" class="editorial-panel p-8">
            <h3 class="text-xl font-black text-dc-ink">No published talks yet</h3>
            <p class="mt-2 text-dc-gray">When talks are published, this becomes the front-page reading list.</p>
          </div>

          <div v-else class="divide-y divide-dc-border">
            <RouterLink
              v-for="talk in recentTalks"
              :key="talk.id"
              :to="`/archive/${talk.event_id}`"
              class="motion-colors group block py-4"
            >
              <h3 class="text-xl font-black tracking-tight text-dc-ink/90 group-hover:text-dc-pink">
                {{ talk.title }}
              </h3>
              <p class="mt-1 text-sm leading-6 text-dc-gray">
                {{ talk.speaker_name }}
                <span class="mx-1 text-dc-border">/</span>
                <span class="font-mono text-[11px] font-bold uppercase tracking-wide text-dc-pink">{{ talk.topic || 'General' }}</span>
                <span class="mx-1 text-dc-border">/</span>
                <span>{{ eventNameForTalk(talk) }}</span>
              </p>
            </RouterLink>
          </div>
        </div>

        <div class="space-y-4">
          <aside class="editorial-panel self-start p-6">
            <p class="editorial-eyebrow">attendance board</p>
            <h2 class="mb-5 text-2xl font-black tracking-tight text-dc-ink">Top Regulars</h2>
            <div v-if="topRegulars.length === 0" class="mb-4 text-sm text-dc-gray">
              Repeat attendance will appear after a few monthly CSV uploads.
            </div>
            <ol v-else class="space-y-4">
              <li v-for="(regular, index) in topRegulars" :key="regular.key" class="flex items-center gap-4 border-b-2 border-dc-border pb-4 last:border-b-0 last:pb-0">
                <span class="w-9 shrink-0 font-mono text-xl font-black leading-none text-dc-pink" :aria-label="`Rank ${index + 1}`">{{ rankLabel(index + 1) }}</span>
                <NaviiAvatar :seed="regular.key" :title="`${regular.name} avatar`" :size="44" />
                <div class="min-w-0">
                  <p class="truncate font-bold text-dc-ink">{{ regular.name }}</p>
                </div>
              </li>
            </ol>
          </aside>

          <aside class="editorial-panel relative self-start overflow-hidden border-dc-border bg-dc-paper-warm p-6 opacity-75">
            <div class="coming-soon-ribbon">Coming soon</div>
            <div class="mb-5 flex items-start justify-between gap-3 pl-16 sm:pl-20">
              <div>
                <p class="editorial-eyebrow">kahoot board</p>
                <h2 class="mt-1 text-2xl font-black tracking-tight text-dc-ink">Kahoot Leaderboard</h2>
              </div>
            </div>
            <div class="rounded-md border border-dashed border-dc-border bg-dc-paper px-4 py-5">
              <p class="text-sm font-semibold leading-6 text-dc-gray">
                Kahoot rankings will land here once the phase-one board is ready to publish.
              </p>
            </div>
          </aside>
        </div>
      </section>
    </div>
  </div>
</template>
