<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { Event, Talk } from '@/types';

interface OverviewResponse {
  events: Event[];
  talks: Talk[];
}

const overview = ref<OverviewResponse | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const selectedYear = ref<number | null>(null);
const query = ref('');
const selectedTopic = ref('');
const selectedSpeaker = ref('');

const completedEvents = computed(() => {
  return [...(overview.value?.events ?? [])]
    .filter((event) => event.status === 'completed')
    .sort((a, b) => new Date(b.event_date).getTime() - new Date(a.event_date).getTime());
});

const years = computed(() => {
  return [...new Set(completedEvents.value.map((event) => new Date(event.event_date).getFullYear()))].sort((a, b) => b - a);
});

const activeYear = computed(() => selectedYear.value ?? years.value[0] ?? new Date().getFullYear());
const publishedTalks = computed(() => (overview.value?.talks ?? []).filter((talk) => talk.status === 'published'));

const topics = computed(() => {
  return [...new Set(publishedTalks.value.map((talk) => talk.topic).filter(Boolean))].sort((a, b) => a.localeCompare(b));
});

const speakers = computed(() => {
  return [...new Set(publishedTalks.value.map((talk) => talk.speaker_name).filter(Boolean))].sort((a, b) => a.localeCompare(b));
});

const selectedYearEvents = computed(() => {
  const normalizedQuery = query.value.trim().toLowerCase();

  return completedEvents.value
    .filter((event) => new Date(event.event_date).getFullYear() === activeYear.value)
    .filter((event) => {
      const talks = publishedTalksFor(event.id);
      const matchesTopic = !selectedTopic.value || talks.some((talk) => talk.topic === selectedTopic.value);
      const matchesSpeaker = !selectedSpeaker.value || talks.some((talk) => talk.speaker_name === selectedSpeaker.value);

      if (!matchesTopic || !matchesSpeaker) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const haystack = [
        event.name,
        event.description,
        ...talks.flatMap((talk) => [talk.title, talk.abstract ?? '', talk.speaker_name, talk.topic ?? '']),
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
});

const hasActiveFilters = computed(() => query.value.trim() !== '' || selectedTopic.value !== '' || selectedSpeaker.value !== '');

function publishedTalksFor(eventId: string): Talk[] {
  return publishedTalks.value.filter((talk) => talk.event_id === eventId);
}

function tagsFor(eventId: string): string[] {
  const counts = new Map<string, number>();
  for (const talk of publishedTalksFor(eventId)) {
    if (talk.topic) {
      counts.set(talk.topic, (counts.get(talk.topic) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([topic]) => topic)
    .slice(0, 4);
}

function eventDateParts(value: string) {
  const date = new Date(value);
  return {
    month: date.toLocaleDateString('en-US', { month: 'short' }),
    day: date.getDate(),
    year: date.getFullYear(),
  };
}

function clearFilters() {
  query.value = '';
  selectedTopic.value = '';
  selectedSpeaker.value = '';
}

onMounted(async () => {
  try {
    const response = await fetch('/api/overview');
    if (!response.ok) {
      throw new Error(`Archive request failed: ${response.status}`);
    }
    overview.value = await response.json();
    selectedYear.value = years.value[0] ?? null;
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'Unable to load archive';
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="editorial-page">
    <div class="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
      <div class="mb-10 border-b border-dc-yellow/10 pb-8 lg:mb-12">
        <div class="flex items-start justify-between gap-8">
          <div>
            <p class="editorial-eyebrow">community memory</p>
            <h1 class="editorial-title mt-3">
              Archive
            </h1>
            <p class="editorial-subtitle mt-4">
              Find the talks, speakers, topics, and slide decks that keep the community useful after event night.
            </p>
          </div>
          <div v-if="completedEvents.length > 0" class="hidden flex-col items-end gap-1 font-mono text-xs uppercase tracking-wider sm:flex">
            <div class="font-bold text-dc-yellow">{{ completedEvents.length }}</div>
            <div class="text-dc-gray/60">Events</div>
          </div>
        </div>
      </div>

      <div v-if="loading" class="editorial-panel p-12 text-center font-mono text-dc-gray">
        Loading archive...
      </div>
      <div v-else-if="error" class="border-2 border-red-500/60 bg-red-950/30 p-12 text-center font-mono text-red-100">
        {{ error }}
      </div>
      <div v-else-if="completedEvents.length === 0" class="editorial-panel p-12 text-center">
        <p class="font-mono text-dc-gray">No completed events yet. Check back soon.</p>
      </div>

      <div v-else class="flex flex-col gap-10 lg:flex-row lg:gap-14">
        <aside class="lg:sticky lg:top-24 lg:w-56 lg:self-start">
          <div class="-mx-4 flex gap-3 overflow-x-auto px-4 pb-4 lg:hidden">
            <button
              v-for="year in years"
              :key="year"
              class="shrink-0 px-5 py-3 font-mono text-sm font-bold transition-all"
              :class="activeYear === year ? 'bg-dc-yellow text-dc-dark' : 'border border-dc-yellow/20 text-dc-gray hover:border-dc-yellow/40 hover:text-white'"
              @click="selectedYear = year"
            >
              {{ year }}
            </button>
          </div>

          <nav class="hidden lg:block">
            <div class="mb-6 font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-dc-yellow/40">
              Years
            </div>
            <ul class="space-y-0.5">
              <li v-for="year in years" :key="year">
                <button
                  class="group relative w-full px-4 py-3 text-left transition-all"
                  :class="activeYear === year ? 'text-dc-yellow' : 'text-dc-gray hover:text-white'"
                  @click="selectedYear = year"
                >
                  <div class="absolute left-0 top-1/2 h-8 w-0.5 -translate-y-1/2" :class="activeYear === year ? 'bg-dc-yellow' : 'bg-transparent'" />
                  <div class="mb-1.5 flex items-baseline justify-between gap-3">
                    <span class="font-mono text-2xl font-bold tracking-tight">{{ year }}</span>
                  </div>
                  <div class="font-mono text-[11px] tracking-wide text-dc-gray/60">
                    {{ completedEvents.filter((event) => new Date(event.event_date).getFullYear() === year).length }} events
                  </div>
                </button>
              </li>
            </ul>
          </nav>
        </aside>

        <main class="min-w-0 flex-1">
          <header class="mb-8 lg:mb-10">
            <h2 class="mb-4 text-6xl font-black leading-none tracking-tighter text-white sm:text-7xl lg:text-8xl">
              {{ activeYear }}
            </h2>
            <div class="h-px bg-dc-yellow/10" />
          </header>

          <section class="editorial-panel mb-10 grid gap-4 p-4 md:grid-cols-[1fr_180px_220px_auto] md:items-end">
            <label class="block">
              <span class="editorial-label">Search archive</span>
              <input
                v-model="query"
                class="editorial-input mt-2"
                type="search"
                placeholder="Search event, talk, speaker, topic"
              >
            </label>

            <label class="block">
              <span class="editorial-label">Topic</span>
              <select v-model="selectedTopic" class="editorial-input mt-2">
                <option value="">All topics</option>
                <option v-for="topic in topics" :key="topic" :value="topic">{{ topic }}</option>
              </select>
            </label>

            <label class="block">
              <span class="editorial-label">Speaker</span>
              <select v-model="selectedSpeaker" class="editorial-input mt-2">
                <option value="">All speakers</option>
                <option v-for="speaker in speakers" :key="speaker" :value="speaker">{{ speaker }}</option>
              </select>
            </label>

            <button
              class="editorial-secondary-action justify-center px-4 py-3 disabled:cursor-not-allowed disabled:opacity-40"
              type="button"
              :disabled="!hasActiveFilters"
              @click="clearFilters"
            >
              Clear
            </button>
          </section>

          <div v-if="selectedYearEvents.length === 0" class="editorial-panel p-8">
            <h3 class="text-2xl font-black tracking-tight text-white">No archive matches</h3>
            <p class="mt-2 text-dc-gray-light">Try a broader topic, speaker, or search term.</p>
          </div>

          <div class="space-y-0">
            <RouterLink
              v-for="(event, index) in selectedYearEvents"
              :key="event.id"
              :to="`/archive/${event.id}`"
              class="group block border-b border-dc-yellow/[0.08] transition-all duration-200 hover:border-dc-yellow/20"
              :class="index === 0 ? 'mb-10 pb-10' : 'py-6'"
            >
              <article :class="index === 0 ? '' : 'grid gap-6 md:grid-cols-[120px_1fr]'">
                <time class="font-mono text-sm font-bold text-dc-yellow" :class="index === 0 ? 'mb-4 block' : ''">
                  {{ eventDateParts(event.event_date).month }} {{ eventDateParts(event.event_date).day }}, {{ eventDateParts(event.event_date).year }}
                </time>

                <div class="flex flex-wrap gap-2">
                  <div
                    v-for="tag in tagsFor(event.id)"
                    :key="tag"
                    class="rounded-sm border border-dc-yellow/10 bg-dc-yellow/5 px-2.5 py-1.5 transition-colors group-hover:border-dc-yellow/20 group-hover:bg-dc-yellow/10"
                  >
                    <span class="font-mono text-xs font-bold uppercase tracking-wider text-dc-yellow">{{ tag }}</span>
                  </div>
                  <span v-if="publishedTalksFor(event.id).length === 0" class="font-mono text-xs uppercase tracking-wider text-dc-gray">
                    No published talks
                  </span>
                </div>
              </article>
            </RouterLink>
          </div>
        </main>
      </div>
    </div>
  </div>
</template>
