<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import ArchiveEventPageSkeleton from '@/src/components/ui/page-skeletons/ArchiveEventPageSkeleton.vue';
import type { Event, Talk } from '@/types';

const route = useRoute();
const event = ref<Event | null>(null);
const talks = ref<Talk[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const feedbackAvailable = ref(false);
const feedbackClosesAt = ref<string | null>(null);

const publishedTalks = computed(() => talks.value.filter((talk) => talk.status === 'published'));

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}

function slidesUrl(talk: Talk): string | null {
  if (talk.slides_type === 'file' && talk.storage_path) {
    return talk.storage_path;
  }
  if (talk.slides_type === 'url' && talk.slides_url) {
    return talk.slides_url;
  }
  return null;
}

onMounted(async () => {
  try {
    const eventId = String(route.params.eventId);
    const [eventResponse, talksResponse] = await Promise.all([
      fetch(`/api/events/${eventId}`),
      fetch(`/api/events/${eventId}/talks`),
    ]);

    if (!eventResponse.ok) {
      throw new Error('Event not found');
    }
    if (!talksResponse.ok) {
      throw new Error('Unable to load event talks');
    }

    event.value = await eventResponse.json();
    talks.value = await talksResponse.json();

    const feedbackResponse = await fetch(`/api/feedback/events/${eventId}/status`);
    if (feedbackResponse.ok) {
      const feedbackStatus = await feedbackResponse.json();
      feedbackAvailable.value = Boolean(feedbackStatus.available);
      feedbackClosesAt.value = feedbackStatus.feedback_window?.closes_at ?? null;
    }
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'Unable to load event';
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="archive-event-page editorial-page">
    <div class="archive-event-wrap mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
      <RouterLink to="/archive" class="archive-event-back motion-colors mb-10 inline-flex items-center gap-2 font-mono text-sm font-bold uppercase tracking-wide text-dc-pink hover:text-dc-ink">
        <span>&larr;</span> BACK TO ARCHIVE
      </RouterLink>

      <ArchiveEventPageSkeleton v-if="loading" />
      <div v-else-if="error || !event" class="flex min-h-[50vh] items-center justify-center p-4">
        <div class="text-center">
          <p class="font-mono text-dc-ink">EVENT NOT FOUND</p>
          <RouterLink to="/archive" class="mt-6 inline-block font-mono text-dc-pink hover:text-dc-ink">
            BACK TO ARCHIVE
          </RouterLink>
        </div>
      </div>

      <template v-else>
        <header class="archive-event-hero mb-14 rounded-lg border-2 border-dc-ink bg-dc-paper p-6 shadow-[3px_3px_0_#111111] sm:p-8">
          <p class="editorial-eyebrow">archive issue</p>
          <h1 class="archive-event-title max-w-4xl text-4xl font-black tracking-tight text-dc-ink sm:text-5xl">
            {{ event.name }}
          </h1>
          <p class="archive-event-date mt-4 font-mono text-sm uppercase tracking-wide text-dc-gray">
            {{ formatDate(event.event_date) }}
          </p>
          <p v-if="event.description" class="archive-event-description mt-6 max-w-3xl text-lg leading-8 text-dc-gray">
            {{ event.description }}
          </p>
          <div v-if="feedbackAvailable" class="mt-7 flex flex-col gap-3 border-t-2 border-dc-border pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p class="max-w-xl text-sm leading-6 text-dc-gray">
              Feedback is open<span v-if="feedbackClosesAt"> until {{ formatDate(feedbackClosesAt) }}</span>.
            </p>
            <RouterLink :to="`/feedback/${event.id}`" class="editorial-action shrink-0">
              Give Feedback
            </RouterLink>
          </div>
        </header>

        <div class="archive-event-section-header mb-5 flex items-end justify-between gap-4">
          <div>
            <p class="editorial-eyebrow mb-2">presentations</p>
            <h2 class="archive-event-section-title text-2xl font-black tracking-tight text-dc-ink">
              Published Talks
            </h2>
          </div>
          <span class="archive-event-count rounded-md border-2 border-dc-ink bg-dc-yellow px-3 py-2 font-mono text-sm font-bold text-dc-ink">{{ publishedTalks.length }} total</span>
        </div>

        <div v-if="publishedTalks.length === 0" class="archive-event-empty editorial-panel p-12 text-center">
          <p class="font-mono text-dc-gray">No presentations published yet</p>
        </div>

        <div v-else class="divide-y-2 divide-dc-border border-y-2 border-dc-ink">
          <article
            v-for="talk in publishedTalks"
            :key="talk.id"
            class="py-7"
          >
            <div class="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-start">
              <div>
                <p class="mb-2 font-mono text-xs uppercase tracking-wide text-dc-gray">
                  {{ talk.topic || 'General' }}
                </p>
                <h3 class="text-2xl font-black tracking-tight text-dc-ink">
                  {{ talk.title }}
                </h3>
                <p class="mt-2 text-sm text-dc-gray">
                  {{ talk.speaker_name }}<span v-if="talk.bio">, {{ talk.bio }}</span>
                </p>
                <p v-if="talk.abstract" class="mt-5 max-w-3xl text-base leading-7 text-dc-gray">
                  {{ talk.abstract }}
                </p>
              </div>

              <a
                v-if="slidesUrl(talk)"
                :href="slidesUrl(talk) ?? undefined"
                target="_blank"
                rel="noopener noreferrer"
                class="motion-press inline-flex rounded-md border-2 border-dc-ink bg-dc-yellow px-4 py-2 font-mono text-sm font-bold uppercase tracking-wide text-dc-ink shadow-[2px_2px_0_#111111] hover:bg-dc-yellow-glow"
              >
                Slides &rarr;
              </a>
            </div>
          </article>
        </div>
      </template>
    </div>
  </div>
</template>
