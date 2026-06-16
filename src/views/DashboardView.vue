<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import NaviiAvatar from '@/src/components/NaviiAvatar.vue';
import ViewSkeleton from '@/src/components/ui/ViewSkeleton.vue';
import { fetchOverview, queryKeys } from '@/src/lib/api';
import type { Event, LeaderboardEntry, Talk } from '@/types';

const overviewQuery = useQuery({
  queryKey: queryKeys.overview,
  queryFn: fetchOverview,
});
const overview = computed(() => overviewQuery.data.value ?? null);
const error = computed(() => overviewQuery.error.value?.message ?? null);
const loading = computed(() => overviewQuery.isPending.value);
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

const completedEvents = computed(() => {
  return [...(overview.value?.events ?? [])]
    .filter((event) => event.status === 'completed')
    .sort((a, b) => new Date(b.event_date).getTime() - new Date(a.event_date).getTime());
});

const cfpOpenEvent = computed(() => {
  return (overview.value?.events ?? []).find((event) => event.status === 'cfp_open') ?? null;
});

const publishedTalks = computed(() => {
  return [...(overview.value?.talks ?? [])]
    .filter((talk) => talk.status === 'published')
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
});

const recentTalks = computed(() => publishedTalks.value.slice(0, 4));
const topMembers = computed(() => (overview.value?.leaderboard ?? []).slice(0, 3));
const leaderboardPreviewMembers = computed(() => {
  const members = topMembers.value;

  if (members.length > 0) return members;

  return [
    { user_id: 'preview-1', nickname: 'First meetup player', rank: 1, total_score: 0, streak_count: 0 },
    { user_id: 'preview-2', nickname: 'Speaker streak', rank: 2, total_score: 0, streak_count: 0 },
    { user_id: 'preview-3', nickname: 'Community regular', rank: 3, total_score: 0, streak_count: 0 },
  ];
});
const layeredMeetupPhotos = computed(() => {
  return meetupPhotos.map((photo, index) => ({
    ...photo,
    index,
    layer: (index - activeMeetupPhoto.value + meetupPhotos.length) % meetupPhotos.length,
  }));
});
const activeMeetupPhotoNumber = computed(() => activeMeetupPhoto.value + 1);

function eventForTalk(talk: Talk): Event | null {
  return overview.value?.events.find((event) => event.id === talk.event_id) ?? null;
}

function memberSeed(member: LeaderboardEntry): string {
  return member.user_id || `${member.nickname}-${member.rank}`;
}

function memberMedal(rank: number): string {
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
    <div class="home-hero relative overflow-hidden border-b-2 border-dc-ink">
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
        <ViewSkeleton v-if="loading" variant="dashboard" class="lg:col-span-2" />

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
      <section class="home-summary-grid grid gap-4 sm:grid-cols-2">
        <article class="editorial-panel p-5">
          <p class="editorial-eyebrow">events</p>
          <p class="font-mono text-4xl font-bold text-dc-ink">{{ completedEvents.length }}</p>
          <p class="mt-2 text-sm text-dc-gray">completed community nights</p>
        </article>
        <article class="editorial-panel p-5">
          <p class="editorial-eyebrow">talks</p>
          <p class="font-mono text-4xl font-bold text-dc-ink">{{ publishedTalks.length }}</p>
          <p class="mt-2 text-sm text-dc-gray">published sessions in the archive</p>
        </article>
      </section>

      <section class="mt-8 grid items-start gap-8 lg:grid-cols-[1fr_360px]">
        <div>
          <div class="editorial-header mb-6">
            <p class="editorial-eyebrow">from the archive</p>
            <h2 class="editorial-title text-3xl sm:text-4xl">Recent Community Talks</h2>
          </div>

          <div v-if="recentTalks.length === 0" class="editorial-panel p-8">
            <h3 class="text-xl font-black text-dc-ink">No published talks yet</h3>
            <p class="mt-2 text-dc-gray">When talks are published, this becomes the front-page reading list.</p>
          </div>

          <div v-else class="space-y-3">
            <RouterLink
              v-for="talk in recentTalks"
              :key="talk.id"
              :to="`/archive/${talk.event_id}`"
              class="motion-colors group block border-b-2 border-dc-border py-5 hover:border-dc-ink"
            >
              <p class="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-dc-pink">
                {{ talk.topic || 'General' }}
              </p>
              <h3 class="mt-2 text-2xl font-black tracking-tight text-dc-ink group-hover:text-dc-pink">
                {{ talk.title }}
              </h3>
              <p class="mt-2 text-sm text-dc-gray">
                {{ talk.speaker_name }} <span v-if="eventForTalk(talk)">· {{ eventForTalk(talk)?.name }}</span>
              </p>
            </RouterLink>
          </div>
        </div>

        <aside class="editorial-panel coming-soon-card self-start p-6 pt-12">
          <div class="community-masthead-ribbon">Coming soon</div>
          <p class="editorial-eyebrow">community board</p>
          <h2 class="mb-5 text-2xl font-black tracking-tight text-dc-ink">Top Members</h2>
          <div v-if="topMembers.length === 0" class="mb-4 text-sm text-dc-gray">
            Rankings will come back once the live quiz feature is ready for community sessions.
          </div>
          <ol class="space-y-4">
            <li v-for="member in leaderboardPreviewMembers" :key="member.user_id || member.nickname" class="flex items-center gap-4 border-b-2 border-dc-border pb-4 opacity-70 last:border-b-0 last:pb-0">
              <span class="w-9 shrink-0 font-mono text-xl font-black leading-none text-dc-pink" :aria-label="`Rank ${member.rank}`">{{ memberMedal(member.rank) }}</span>
              <NaviiAvatar :seed="memberSeed(member)" :title="`${member.nickname} avatar`" :size="44" />
              <div class="min-w-0">
                <p class="truncate font-bold text-dc-ink">{{ member.nickname }}</p>
                <p class="font-mono text-xs uppercase tracking-wide text-dc-gray">community member</p>
              </div>
            </li>
          </ol>
        </aside>
      </section>
    </div>
  </div>
</template>
