<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { Event, LeaderboardEntry, Talk } from '@/types';

interface OverviewResponse {
  events: Event[];
  talks: Talk[];
  leaderboard: LeaderboardEntry[];
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

const talksCount = computed(() => {
  return (overview.value?.talks ?? []).filter((talk) => ['accepted', 'slides_received', 'published'].includes(talk.status)).length;
});

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
    error.value = caught instanceof Error ? caught.message : 'Unable to load project overview';
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="h-full overflow-hidden bg-dc-dark">
    <div class="relative flex h-full items-center justify-center">
      <div class="absolute inset-0 bg-gradient-to-br from-dc-dark-1 via-dc-dark to-dc-dark opacity-50" />
      <div
        class="absolute inset-0"
        style="
          background-image:
            linear-gradient(rgba(249, 225, 94, 0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(249, 225, 94, 0.03) 1px, transparent 1px);
          background-size: 40px 40px;
        "
      />

      <div class="relative mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8">
        <div v-if="loading" class="text-center font-mono text-sm uppercase tracking-[0.25em] text-dc-gray-light">
          Loading DevCon-Comm...
        </div>

        <div v-else-if="error" class="mx-auto max-w-xl border-2 border-red-500/70 bg-red-950/30 p-6 text-center font-mono text-red-100">
          {{ error }}
        </div>

        <div v-else class="space-y-6 text-center sm:space-y-8">
          <div
            v-if="upcomingEvent"
            class="inline-flex items-center gap-2 rounded border border-dc-yellow/30 bg-dc-dark-2 px-3 py-1.5 font-mono text-xs text-dc-yellow shadow-glow-sm sm:px-4 sm:py-2 sm:text-sm"
          >
            <span class="inline-block size-1.5 animate-pulse rounded-full bg-dc-yellow" />
            <span class="text-dc-gray">Next:</span>
            <span class="font-bold">{{ formatDate(upcomingEvent.event_date) }}</span>
          </div>

          <h1 class="font-mono text-5xl font-black leading-none tracking-tight sm:text-7xl md:text-8xl lg:text-9xl">
            <span class="text-white">DEV</span><span class="text-dc-yellow">::</span><span class="text-white">CON</span><span class="text-dc-gray">[]</span>
          </h1>

          <p class="mx-auto max-w-2xl text-base font-medium text-dc-gray-light sm:whitespace-nowrap sm:text-xl md:text-2xl">
            Community tech talks &bull; Learn from experts &bull; Share knowledge
          </p>

          <div class="flex flex-col items-center justify-center gap-3 pt-2 sm:flex-row sm:pt-4">
            <RouterLink
              :to="cfpOpenEvent ? `/cfp/${cfpOpenEvent.id}` : '/archive'"
              class="inline-flex items-center gap-2 bg-dc-yellow px-6 py-3 font-mono text-sm font-bold uppercase tracking-wider text-dc-dark transition-all hover:shadow-glow sm:gap-3 sm:px-10 sm:py-5 sm:text-lg"
            >
              <span class="inline-block size-1.5 animate-pulse bg-dc-dark sm:size-2" />
              {{ cfpOpenEvent ? 'Submit Talk' : 'View Talks' }}
            </RouterLink>
            <RouterLink
              to="/archive"
              class="inline-flex items-center gap-2 border border-dc-yellow/30 px-5 py-3 font-mono text-sm font-bold uppercase tracking-wider text-dc-yellow transition-all hover:border-dc-yellow hover:bg-dc-yellow/10 sm:px-7 sm:py-5"
            >
              Browse Archive
            </RouterLink>
          </div>

          <div class="flex items-center justify-center gap-6 pt-8 sm:gap-8 sm:pt-12">
            <div class="text-center">
              <div class="mb-1 font-mono text-3xl font-bold text-dc-yellow sm:mb-2 sm:text-5xl md:text-6xl">
                {{ completedEvents.length }}
              </div>
              <div class="font-mono text-xs uppercase tracking-wider text-dc-gray sm:text-sm">
                Events
              </div>
            </div>

            <div class="h-12 w-px bg-dc-yellow/20 sm:h-16" />

            <div class="text-center">
              <div class="mb-1 font-mono text-3xl font-bold text-dc-yellow sm:mb-2 sm:text-5xl md:text-6xl">
                {{ talksCount }}
              </div>
              <div class="font-mono text-xs uppercase tracking-wider text-dc-gray sm:text-sm">
                Talks
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="absolute inset-x-0 bottom-0 border-t border-dc-yellow/20 bg-dc-dark-1/50 backdrop-blur-sm">
        <div class="mx-auto max-w-7xl px-4 py-4 sm:py-6">
          <p class="text-center font-mono text-xs text-dc-gray sm:text-sm">
            <span class="text-dc-yellow">&copy;</span> DevCon-Comm - Community Presentations & Kahoot Sessions
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
