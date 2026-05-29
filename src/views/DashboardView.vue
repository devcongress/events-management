<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { Event, LeaderboardEntry, QuizSession, Talk } from '@/types';

interface OverviewResponse {
  events: Event[];
  talks: Talk[];
  leaderboard: LeaderboardEntry[];
  activeSession: QuizSession | null;
}

const overview = ref<OverviewResponse | null>(null);
const error = ref<string | null>(null);
const loading = ref(true);

const completedEvents = computed(() => {
  return [...(overview.value?.events ?? [])]
    .filter((event) => event.status === 'completed')
    .sort((a, b) => new Date(b.event_date).getTime() - new Date(a.event_date).getTime());
});

const upcomingEvent = computed(() => {
  return [...(overview.value?.events ?? [])]
    .filter((event) => event.status === 'live' || event.status === 'upcoming')
    .sort((a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime())[0] ?? null;
});

const cfpOpenEvent = computed(() => {
  return (overview.value?.events ?? []).find((event) => event.status === 'cfp_open') ?? null;
});

const featuredEvent = computed(() => cfpOpenEvent.value ?? upcomingEvent.value ?? completedEvents.value[0] ?? null);

const publishedTalks = computed(() => {
  return [...(overview.value?.talks ?? [])]
    .filter((talk) => talk.status === 'published')
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
});

const recentTalks = computed(() => publishedTalks.value.slice(0, 4));
const topMembers = computed(() => (overview.value?.leaderboard ?? []).slice(0, 5));

function eventForTalk(talk: Talk): Event | null {
  return overview.value?.events.find((event) => event.id === talk.event_id) ?? null;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}

onMounted(async () => {
  try {
    const response = await fetch('/api/overview');
    if (!response.ok) {
      throw new Error(`Overview request failed: ${response.status}`);
    }
    overview.value = await response.json();
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'Unable to load community hub';
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="editorial-page">
    <div class="relative overflow-hidden border-b border-dc-yellow/10">
      <div class="absolute inset-0 bg-gradient-to-br from-dc-dark-1 via-dc-dark to-dc-dark opacity-70" />
      <div
        class="absolute inset-0 opacity-70"
        style="
          background-image:
            linear-gradient(rgba(249, 225, 94, 0.035) 1px, transparent 1px),
            linear-gradient(90deg, rgba(249, 225, 94, 0.035) 1px, transparent 1px);
          background-size: 44px 44px;
        "
      />

      <div class="relative mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.2fr_0.8fr] lg:px-8 lg:py-20">
        <div v-if="loading" class="font-mono text-sm uppercase tracking-[0.25em] text-dc-gray-light">
          Loading DevCon-Comm...
        </div>

        <div v-else-if="error" class="max-w-xl border border-red-500/70 bg-red-950/30 p-6 font-mono text-red-100">
          {{ error }}
        </div>

        <template v-else>
          <section>
            <div class="mb-6 inline-flex items-center gap-2 border border-dc-yellow/30 bg-dc-dark-2/80 px-3 py-2 font-mono text-xs uppercase tracking-[0.22em] text-dc-yellow">
              <span class="size-1.5 bg-dc-yellow" />
              Community tech talks
            </div>

            <h1 class="font-mono text-5xl font-black leading-none tracking-tight text-white sm:text-7xl lg:text-8xl">
              <span>DEV</span><span class="text-dc-yellow">::</span><span>CON</span><span class="text-dc-gray">[]</span>
            </h1>

            <p class="mt-7 max-w-2xl text-xl font-medium leading-8 text-dc-gray-light">
              A community-run space for talks, live quizzes, shared slides, and reputation earned by showing up.
            </p>

            <div class="mt-8 flex flex-col gap-3 sm:flex-row">
              <RouterLink
                :to="cfpOpenEvent ? `/cfp/${cfpOpenEvent.id}` : '/archive'"
                class="editorial-action"
              >
                {{ cfpOpenEvent ? 'Submit a Talk' : 'Explore Talks' }}
              </RouterLink>
              <RouterLink
                v-if="overview?.activeSession"
                :to="`/play/${overview.activeSession.join_code}`"
                class="editorial-secondary-action border-dc-yellow text-dc-yellow"
              >
                Join Live Quiz
              </RouterLink>
              <RouterLink to="/leaderboard" class="editorial-secondary-action">
                See Rankings
              </RouterLink>
            </div>
          </section>

          <aside class="editorial-panel self-end p-6">
            <p class="editorial-eyebrow">right now</p>
            <h2 class="text-2xl font-black tracking-tight text-white">
              {{ featuredEvent?.name ?? 'Community program loading' }}
            </h2>
            <p v-if="featuredEvent" class="mt-3 text-dc-gray-light">
              {{ featuredEvent.description }}
            </p>
            <div v-if="featuredEvent" class="mt-6 flex flex-wrap gap-2 font-mono text-xs uppercase tracking-wide">
              <span class="border border-dc-yellow/20 px-3 py-2 text-dc-gray-light">{{ formatDate(featuredEvent.event_date) }}</span>
              <span class="border border-dc-yellow/40 px-3 py-2 text-dc-yellow">{{ featuredEvent.status.replace('_', ' ') }}</span>
            </div>
            <RouterLink
              v-if="cfpOpenEvent"
              :to="`/cfp/${cfpOpenEvent.id}`"
              class="mt-6 inline-flex font-mono text-sm font-bold uppercase tracking-wide text-dc-yellow hover:text-dc-yellow-glow"
            >
              CFP is open &rarr;
            </RouterLink>
          </aside>
        </template>
      </div>
    </div>

    <div v-if="!loading && !error" class="editorial-wrap">
      <section class="grid gap-4 sm:grid-cols-3">
        <article class="editorial-panel p-5">
          <p class="editorial-eyebrow">events</p>
          <p class="font-mono text-4xl font-bold text-dc-yellow">{{ completedEvents.length }}</p>
          <p class="mt-2 text-sm text-dc-gray-light">completed community nights</p>
        </article>
        <article class="editorial-panel p-5">
          <p class="editorial-eyebrow">talks</p>
          <p class="font-mono text-4xl font-bold text-dc-yellow">{{ publishedTalks.length }}</p>
          <p class="mt-2 text-sm text-dc-gray-light">published sessions in the archive</p>
        </article>
        <article class="editorial-panel p-5">
          <p class="editorial-eyebrow">players</p>
          <p class="font-mono text-4xl font-bold text-dc-yellow">{{ topMembers.length }}</p>
          <p class="mt-2 text-sm text-dc-gray-light">ranked members with quiz points</p>
        </article>
      </section>

      <section class="mt-12 grid gap-8 lg:grid-cols-[1fr_360px]">
        <div>
          <div class="editorial-header mb-6">
            <p class="editorial-eyebrow">from the archive</p>
            <h2 class="editorial-title text-3xl sm:text-4xl">Recent Community Talks</h2>
          </div>

          <div v-if="recentTalks.length === 0" class="editorial-panel p-8">
            <h3 class="text-xl font-black text-white">No published talks yet</h3>
            <p class="mt-2 text-dc-gray-light">When talks are published, this becomes the front-page reading list.</p>
          </div>

          <div v-else class="space-y-3">
            <RouterLink
              v-for="talk in recentTalks"
              :key="talk.id"
              :to="`/archive/${talk.event_id}`"
              class="group block border-b border-dc-yellow/10 py-5 transition-colors hover:border-dc-yellow/40"
            >
              <p class="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-dc-yellow">
                {{ talk.topic || 'General' }}
              </p>
              <h3 class="mt-2 text-2xl font-black tracking-tight text-white group-hover:text-dc-yellow">
                {{ talk.title }}
              </h3>
              <p class="mt-2 text-sm text-dc-gray-light">
                {{ talk.speaker_name }} <span v-if="eventForTalk(talk)">· {{ eventForTalk(talk)?.name }}</span>
              </p>
            </RouterLink>
          </div>
        </div>

        <aside class="editorial-panel p-6">
          <p class="editorial-eyebrow">community board</p>
          <h2 class="mb-5 text-2xl font-black tracking-tight text-white">Top Members</h2>
          <div v-if="topMembers.length === 0" class="text-sm text-dc-gray-light">
            Quiz points will show up here after the next live session.
          </div>
          <ol v-else class="space-y-4">
            <li v-for="member in topMembers" :key="member.user_id" class="flex items-center justify-between gap-4 border-b border-dc-yellow/10 pb-4">
              <div>
                <p class="font-bold text-white">{{ member.rank }}. {{ member.nickname }}</p>
                <p class="font-mono text-xs uppercase tracking-wide text-dc-gray">member score</p>
              </div>
              <span class="font-mono text-lg font-bold text-dc-yellow">{{ member.total_score }}</span>
            </li>
          </ol>
        </aside>
      </section>
    </div>
  </div>
</template>
