<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { canonicalizeSystemDesignSchedule, isSystemDesignSessionItem, systemDesignDisplayTitle } from '@/lib/system-design';
import { fetchPublicArchiveEvent } from '@/src/lib/api';
import ArchiveEventPageSkeleton from '@/src/components/ui/page-skeletons/ArchiveEventPageSkeleton.vue';
import type { PublicArchiveEvent, PublicArchiveTalk, PublicMeetupScheduleItem } from '@/types';

const route = useRoute();
const event = ref<PublicArchiveEvent | null>(null);
const talks = ref<PublicArchiveTalk[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const feedbackAvailable = ref(false);
const feedbackClosesAt = ref<string | null>(null);

const publishedTalks = computed(() => talks.value);
const scheduleItems = computed(() => canonicalizeSystemDesignSchedule(event.value?.schedule ?? []));
const systemDesignItems = computed(() => scheduleItems.value.filter((item) => isSystemDesignSessionItem(item)));

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}

function slidesUrl(talk: PublicArchiveTalk): string | null {
  return talk.slides_url;
}

function systemDesignResourceTitle(resource: PublicMeetupScheduleItem['resources'][number], index: number): string {
  const label = resource.title.trim();
  if (!label || (index === 0 && label.toLowerCase() === 'view scenario prompt')) {
    return index === 0 ? 'Prompt deck' : 'Resource link';
  }

  return label;
}

function systemDesignResourceActionLabel(resource: PublicMeetupScheduleItem['resources'][number], index: number): string {
  const title = resource.title.toLowerCase();
  const url = resource.url.toLowerCase();

  if (title.includes('sheet') || url.includes('/spreadsheets/')) return 'Open source sheet';
  if (title.includes('deck') || url.includes('/presentation/') || index === 0) return 'Open prompt deck';
  return 'Open resource';
}

onMounted(async () => {
  try {
    const eventId = String(route.params.eventId);
    const payload = await fetchPublicArchiveEvent(eventId);
    event.value = payload.event;
    talks.value = payload.talks;
    feedbackAvailable.value = payload.feedback.available;
    feedbackClosesAt.value = payload.feedback.closes_at;
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

        <section v-if="systemDesignItems.length > 0" class="mb-12">
          <div class="archive-event-section-header mb-5 flex items-end justify-between gap-4">
            <div>
              <p class="editorial-eyebrow mb-2">system design</p>
              <h2 class="archive-event-section-title text-2xl font-black tracking-tight text-dc-ink">
                Monthly Architecture Scenario
              </h2>
            </div>
          </div>

          <div class="grid gap-4">
            <article
              v-for="(session, index) in systemDesignItems"
              :key="`${session.time}-${session.title}-${index}`"
              class="flex flex-col rounded-lg border-2 border-dc-ink bg-dc-paper p-5 shadow-[3px_3px_0_#111111] sm:p-6"
            >
              <div>
                <div>
                  <p class="font-mono text-xs font-bold uppercase tracking-wide text-dc-gray">{{ session.time }}</p>
                  <h3 class="mt-2 text-2xl font-black tracking-tight text-dc-ink">
                    {{ systemDesignDisplayTitle(session) }}
                  </h3>
                  <p v-if="session.lead" class="mt-2 text-sm font-semibold text-dc-gray">
                    Led by {{ session.lead }}
                  </p>
                </div>
              </div>
              <p v-if="session.description" class="mt-5 max-w-4xl whitespace-pre-line text-base leading-8 text-dc-gray">
                {{ session.description }}
              </p>
              <p v-else class="mt-5 max-w-4xl text-base leading-8 text-dc-gray">
                This meetup included a system design scenario, but the public recap has not been added yet.
              </p>
              <div v-if="session.resources.length > 0" class="mt-8 flex flex-wrap justify-start gap-3 sm:justify-end">
                <div
                  v-for="(resource, resourceIndex) in session.resources"
                  :key="resource.url"
                  class="flex max-w-full flex-col items-start gap-2 sm:items-end"
                >
                  <a
                    :href="resource.url"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="editorial-secondary-action group max-w-full gap-2 whitespace-nowrap"
                    :aria-label="`${systemDesignResourceActionLabel(resource, resourceIndex)}: ${systemDesignResourceTitle(resource, resourceIndex)}`"
                  >
                    <span>{{ systemDesignResourceActionLabel(resource, resourceIndex) }}</span>
                    <span class="transition-transform group-hover:translate-x-0.5" aria-hidden="true">&nearr;</span>
                  </a>
                </div>
              </div>
            </article>
          </div>
        </section>

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
