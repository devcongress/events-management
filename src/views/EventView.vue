<script setup lang="ts">
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { isEventSeriesType } from '@/lib/event-series';
import { canonicalizeSystemDesignSchedule, isSystemDesignSessionItem } from '@/lib/system-design';
import { fetchPreviewPublicMeetup, fetchPublicMeetup, queryKeys } from '@/src/lib/api';
import type { PublicMeetup, PublicMeetupScheduleItem, PublicMeetupSpeaker } from '@/types';

const route = useRoute();
const queryClient = useQueryClient();
const activeMeetupPhoto = ref(0);
const isMeetupPhotoShifting = ref(false);
let meetupPhotoTimer: number | undefined;
let meetupPhotoShiftTimer: number | undefined;

const isLumaPreview = computed(() => route.query.preview === 'luma' && typeof route.query.eventUrl === 'string');
const previewEventUrl = computed(() => (typeof route.query.eventUrl === 'string' ? route.query.eventUrl : ''));
const previewSeriesType = computed(() => (isEventSeriesType(route.query.seriesType) ? route.query.seriesType : undefined));
const meetupSlug = computed(() => String(route.params.slug ?? ''));
const backLink = computed(() => ({
  to: '/events',
  label: 'All meetups',
}));
const meetupQuery = useQuery({
  queryKey: computed(() => (isLumaPreview.value
    ? ['public-meetup-preview', previewEventUrl.value, previewSeriesType.value ?? 'default']
    : queryKeys.publicMeetup(meetupSlug.value))),
  queryFn: async () => {
    if (isLumaPreview.value && previewEventUrl.value) {
      const payload = await fetchPreviewPublicMeetup(previewEventUrl.value, previewSeriesType.value);
      return payload.data;
    }

    const payload = await fetchPublicMeetup(meetupSlug.value);
    return payload.data;
  },
  enabled: computed(() => (isLumaPreview.value ? Boolean(previewEventUrl.value) : Boolean(meetupSlug.value))),
  staleTime: 0,
});
const meetup = computed<PublicMeetup | null>(() => meetupQuery.data.value ?? null);
const loading = computed(() => meetupQuery.isPending.value);
const error = computed(() => meetupQuery.error.value?.message ?? null);
const scheduleItems = computed(() => canonicalizeSystemDesignSchedule(meetup.value?.schedule ?? []));
const imagePhotos = computed(() => (meetup.value?.photos ?? []).filter((photo) => !photo.type || photo.type === 'image'));
const folderPhotos = computed(() => (meetup.value?.photos ?? []).filter((photo) => photo.type === 'folder'));
const systemDesignArchivePath = computed(() => meetup.value ? `/archive/${meetup.value.id}` : '');
const stackedImagePhotos = computed(() => {
  const photos = imagePhotos.value;
  if (photos.length === 0) return [];

  const visibleCount = Math.min(3, photos.length);

  return Array.from({ length: visibleCount }, (_, offset) => {
    const photoIndex = (activeMeetupPhoto.value + offset) % photos.length;
    const photo = photos[photoIndex];

    return {
      ...photo,
      index: photoIndex,
      layer: offset,
    };
  }).map((photo) => ({
    ...photo,
    key: `${photo.url}-${photo.index}`,
  }));
});
const primaryGalleryLink = computed(() => folderPhotos.value[0]?.url ?? imagePhotos.value[0]?.url ?? null);
const galleryActionLabel = computed(() => (folderPhotos.value.length > 0 ? 'Open gallery' : 'Open photo'));
const activeMeetupPhotoNumber = computed(() => activeMeetupPhoto.value + 1);

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Accra',
    timeZoneName: 'short',
  }).format(new Date(value)).replace('GMT', 'UTC');
}

function statusBadgeClass(status: PublicMeetup['status']) {
  if (status === 'live') return 'border-dc-pink/80 text-white';
  return 'border-white/70 text-white/85';
}

function statusLabel(status: PublicMeetup['status']) {
  if (status === 'live') return 'Live now';
  if (status === 'upcoming') return 'Upcoming';
  return 'Past';
}

function systemDesignActionLabel(status: PublicMeetup['status']) {
  return status === 'past' ? 'View recap' : 'View details';
}

function primaryAction(meetupItem: PublicMeetup): { href: string | null; label: string | null } {
  if (meetupItem.status === 'upcoming') {
    if (meetupItem.registration_url) return { href: meetupItem.registration_url, label: 'Register' };
    if (meetupItem.cfp_url) return { href: meetupItem.cfp_url, label: 'Register' };
  }

  if (meetupItem.status === 'live' && meetupItem.stream_url) {
    return { href: meetupItem.stream_url, label: meetupItem.embed_stream ? 'Watch stream' : 'Follow live' };
  }

  if (meetupItem.status === 'past' && meetupItem.archive_url) {
    return { href: meetupItem.archive_url, label: 'View recap' };
  }

  return { href: null, label: null };
}

function isInternalAppHref(value: string) {
  if (value.startsWith('/')) return true;

  try {
    const url = new URL(value);
    return url.origin === window.location.origin;
  } catch {
    return false;
  }
}

function toInternalAppPath(value: string) {
  if (value.startsWith('/')) return value;

  const url = new URL(value);
  return `${url.pathname}${url.search}${url.hash}`;
}

function speakerSocialLabel(platform: PublicMeetupSpeaker['socials'][number]['platform']) {
  if (platform === 'github') return 'GitHub';
  return 'Website';
}

function scheduleTypeLabel(type: PublicMeetupScheduleItem['type']) {
  return {
    networking: 'Networking',
    talk: 'Talk',
    panel: 'Panel',
    workshop: 'Workshop',
    system_design: 'System design',
    open_discussion: 'Open discussion',
    break: 'Break',
  }[type];
}

function stopMeetupPhotoRotation() {
  if (meetupPhotoTimer !== undefined) {
    window.clearInterval(meetupPhotoTimer);
    meetupPhotoTimer = undefined;
  }

  if (meetupPhotoShiftTimer !== undefined) {
    window.clearTimeout(meetupPhotoShiftTimer);
    meetupPhotoShiftTimer = undefined;
  }

  isMeetupPhotoShifting.value = false;
}

function rotateMeetupPhotos() {
  if (isMeetupPhotoShifting.value || imagePhotos.value.length <= 1) return;

  const nextMeetupPhoto = (activeMeetupPhoto.value + 1) % imagePhotos.value.length;
  isMeetupPhotoShifting.value = true;

  meetupPhotoShiftTimer = window.setTimeout(() => {
    activeMeetupPhoto.value = nextMeetupPhoto;
    isMeetupPhotoShifting.value = false;
  }, 280);
}

function startMeetupPhotoRotation() {
  stopMeetupPhotoRotation();

  if (typeof window === 'undefined' || imagePhotos.value.length <= 1) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  meetupPhotoTimer = window.setInterval(rotateMeetupPhotos, 3600);
}

function refreshMeetupQueries() {
  void queryClient.invalidateQueries({ queryKey: queryKeys.publicMeetups });

  if (!isLumaPreview.value && meetupSlug.value) {
    void queryClient.invalidateQueries({ queryKey: queryKeys.publicMeetup(meetupSlug.value) });
  }
}

function handlePublicMeetupRefresh(event: StorageEvent) {
  if (event.key !== 'dc-public-meetups-refresh') return;
  refreshMeetupQueries();
}

function handlePublicMeetupRefreshSignal() {
  refreshMeetupQueries();
}

watch(meetup, () => {
  activeMeetupPhoto.value = 0;
  startMeetupPhotoRotation();
});

onMounted(() => {
  window.addEventListener('storage', handlePublicMeetupRefresh);
  window.addEventListener('dc-public-meetups-refresh', handlePublicMeetupRefreshSignal);
});

onUnmounted(() => {
  window.removeEventListener('storage', handlePublicMeetupRefresh);
  window.removeEventListener('dc-public-meetups-refresh', handlePublicMeetupRefreshSignal);
  stopMeetupPhotoRotation();
});

const meetupPrimaryAction = computed(() => (meetup.value ? primaryAction(meetup.value) : { href: null, label: null }));
</script>

<template>
  <div class="editorial-page">
    <div v-if="loading" class="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8 lg:py-12">
      <div class="view-skeleton space-y-6" aria-busy="true" aria-label="Loading meetup">
        <div class="skeleton-line skeleton-line--third h-12" />
        <div class="skeleton-media aspect-[16/7] min-h-0" />
        <div class="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
          <div class="skeleton-panel h-48" />
          <div class="skeleton-panel h-48" />
        </div>
      </div>
    </div>

    <div v-else-if="error || !meetup" class="mx-auto flex min-h-[60vh] max-w-5xl items-center justify-center px-4 py-12 text-center sm:px-6 lg:px-8">
      <div>
        <p class="editorial-eyebrow">meetup</p>
        <h1 class="mt-3 text-4xl font-black tracking-tight text-dc-ink">Meetup not found</h1>
        <p class="mt-3 text-sm leading-6 text-dc-gray">{{ error ?? 'This meetup could not be loaded.' }}</p>
        <RouterLink to="/events" class="editorial-secondary-action mt-6 inline-flex">Back to Events</RouterLink>
      </div>
    </div>

    <template v-else>
      <section
        class="relative min-h-[36rem] overflow-hidden border-b-2 border-dc-ink bg-dc-ink sm:min-h-[40rem] lg:min-h-[44rem] xl:min-h-[48rem]"
        :style="{ backgroundImage: `url('${meetup.cover}')`, backgroundSize: 'cover', backgroundPosition: 'center' }"
      >
        <div class="absolute inset-0 bg-[linear-gradient(180deg,rgba(17,17,17,0.34)_0%,rgba(17,17,17,0.28)_38%,rgba(17,17,17,0.78)_100%)]" />
        <div class="relative mx-auto flex min-h-[36rem] max-w-7xl items-end px-4 pb-10 pt-32 sm:min-h-[40rem] sm:px-6 sm:pb-12 lg:min-h-[44rem] lg:px-8 lg:pb-16 xl:min-h-[48rem]">
          <div class="max-w-3xl">
            <span
              class="inline-flex rounded-full border-2 bg-black/10 px-5 py-2 font-mono text-xs font-bold uppercase tracking-wider backdrop-blur-sm"
              :class="statusBadgeClass(meetup.status)"
            >
              {{ statusLabel(meetup.status) }}
            </span>
            <h1 class="mt-6 max-w-3xl font-sans text-4xl font-black leading-none tracking-tight text-white drop-shadow-sm sm:text-5xl lg:text-6xl">
              {{ meetup.name }}
            </h1>
            <div class="mt-5 flex flex-wrap items-center gap-x-8 gap-y-2 text-sm font-semibold text-white/85 drop-shadow-sm sm:text-base">
              <span>{{ formatDate(meetup.start) }} · {{ formatTime(meetup.start) }}</span>
              <span class="inline-flex items-center gap-2">
                <span class="font-mono text-dc-pink" aria-hidden="true">•</span>
                <a
                  v-if="meetup.location.url"
                  :href="meetup.location.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="underline decoration-white/60 underline-offset-4 hover:text-dc-yellow"
                >
                  {{ meetup.location.label ?? meetup.location.name }}
                </a>
                <span v-else>{{ meetup.location.label ?? meetup.location.name }}</span>
              </span>
            </div>
          </div>
        </div>
      </section>

      <main class="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-12">
        <RouterLink v-if="!isLumaPreview" :to="backLink.to" class="mb-8 inline-flex items-center gap-2 font-mono text-sm font-bold uppercase tracking-wide text-dc-gray transition-colors hover:text-dc-pink">
          <span>&larr;</span> {{ backLink.label }}
        </RouterLink>

        <section v-if="isLumaPreview" class="mb-8 rounded-lg border border-dc-border bg-dc-paper-warm px-5 py-4">
          <p class="editorial-eyebrow">preview mode</p>
          <p class="mt-2 max-w-3xl text-sm leading-6 text-dc-gray">
            This is the public meetup page shell from the current Luma import. Schedule, speakers, gallery, and recap details can be added later after the event shell is imported.
          </p>
        </section>

        <section class="grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
          <div>
            <p class="editorial-eyebrow">about</p>
            <p class="mt-3 max-w-3xl text-base leading-8 text-dc-gray sm:text-lg">
              {{ meetup.description }}
            </p>

            <div class="mt-6 flex flex-wrap gap-2 font-mono text-xs uppercase tracking-wide text-dc-gray">
              <span class="rounded-md border-2 border-dc-ink bg-dc-paper px-3 py-2">{{ meetup.published_talks_count }} published talks</span>
              <span class="rounded-md border-2 border-dc-ink bg-dc-paper px-3 py-2">{{ meetup.photos.length }} photos</span>
              <span class="rounded-md border-2 border-dc-ink bg-dc-paper px-3 py-2">{{ scheduleItems.length }} schedule items</span>
            </div>
          </div>

          <div class="lg:pt-8">
            <component
              :is="meetupPrimaryAction.href && isInternalAppHref(meetupPrimaryAction.href) ? 'RouterLink' : 'a'"
              v-if="meetupPrimaryAction.href && meetupPrimaryAction.label"
              :to="meetupPrimaryAction.href && isInternalAppHref(meetupPrimaryAction.href) ? toInternalAppPath(meetupPrimaryAction.href) : undefined"
              :href="meetupPrimaryAction.href && !isInternalAppHref(meetupPrimaryAction.href) ? meetupPrimaryAction.href : undefined"
              :target="meetupPrimaryAction.href && !isInternalAppHref(meetupPrimaryAction.href) ? '_blank' : undefined"
              :rel="meetupPrimaryAction.href && !isInternalAppHref(meetupPrimaryAction.href) ? 'noopener noreferrer' : undefined"
              class="editorial-secondary-action group inline-flex items-center gap-2 whitespace-nowrap bg-white px-8 py-3"
            >
              <span>{{ meetupPrimaryAction.label }}</span>
              <span aria-hidden="true" class="text-lg leading-none transition-transform duration-200 group-hover:translate-x-0.5">→</span>
            </component>
          </div>
        </section>

        <section v-if="meetup.speakers.length > 0" class="mt-12">
          <div class="mb-5">
            <p class="editorial-eyebrow">speakers</p>
            <h2 class="mt-2 text-3xl font-black tracking-tight text-dc-ink">Who is on this meetup</h2>
          </div>

          <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <article
              v-for="speaker in meetup.speakers"
              :key="`${speaker.name}-${speaker.talk_title}`"
              class="rounded-lg border-2 border-dc-ink bg-dc-paper overflow-hidden shadow-[3px_3px_0_#111111]"
            >
              <img :src="speaker.image" :alt="speaker.name" class="aspect-[4/3] w-full object-cover bg-dc-border">
              <div class="p-5">
                <h3 class="text-xl font-black tracking-tight text-dc-ink">{{ speaker.name }}</h3>
                <p class="mt-1 text-sm font-semibold text-dc-gray">{{ speaker.title }}</p>
                <p class="mt-3 text-sm leading-6 text-dc-gray">{{ speaker.bio }}</p>

                <div v-if="speaker.talk_title" class="mt-4 border-t border-dc-border pt-4">
                  <p class="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-dc-pink">Talk</p>
                  <p class="mt-2 text-base font-bold text-dc-ink">{{ speaker.talk_title }}</p>
                  <p v-if="speaker.talk_description" class="mt-2 text-sm leading-6 text-dc-gray">{{ speaker.talk_description }}</p>
                </div>

                <div v-if="speaker.socials.length > 0" class="mt-4 flex flex-wrap gap-2">
                  <a
                    v-for="social in speaker.socials"
                    :key="`${speaker.name}-${social.platform}`"
                    :href="social.url"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="rounded-md border border-dc-border px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wide text-dc-gray hover:border-dc-ink hover:text-dc-ink"
                  >
                    {{ speakerSocialLabel(social.platform) }}
                  </a>
                </div>
              </div>
            </article>
          </div>
        </section>

        <section v-if="scheduleItems.length > 0" class="mt-12">
          <div class="mb-5">
            <p class="editorial-eyebrow">{{ meetup.status === 'past' ? 'recap' : 'schedule' }}</p>
            <h2 class="mt-2 text-3xl font-black tracking-tight text-dc-ink">
              {{ meetup.status === 'past' ? 'How the meetup went' : 'How the meetup will flow' }}
            </h2>
          </div>

          <ol class="space-y-3">
            <li
              v-for="(item, index) in scheduleItems"
              :key="`${item.time}-${item.title}-${index}`"
              class="grid gap-4 rounded-lg border border-dc-border bg-dc-paper px-4 py-4 md:grid-cols-[160px_1fr]"
            >
              <div class="font-mono text-sm font-bold uppercase tracking-wide text-dc-gray">{{ item.time }}</div>
              <div>
                <div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px] sm:items-center">
                  <h3 class="min-w-0 text-lg font-black tracking-tight text-dc-ink">{{ item.title }}</h3>
                  <span class="w-fit justify-self-start rounded-sm border border-dc-border bg-dc-paper-warm px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-wide text-dc-gray">
                    {{ scheduleTypeLabel(item.type) }}
                  </span>
                </div>
                <p v-if="item.lead" class="mt-2 text-sm text-dc-gray">Led by {{ item.lead }}</p>
                <div v-if="isSystemDesignSessionItem(item) && systemDesignArchivePath" class="mt-3 flex flex-wrap gap-2">
                  <RouterLink
                    :to="systemDesignArchivePath"
                    class="rounded-md border border-dc-border px-3 py-1.5 text-sm font-semibold text-dc-ink hover:bg-dc-paper-warm"
                  >
                    {{ systemDesignActionLabel(meetup.status) }}
                  </RouterLink>
                </div>
                <div v-else-if="item.resources.length > 0" class="mt-3 flex flex-wrap gap-2">
                  <a
                    v-for="resource in item.resources"
                    :key="resource.url"
                    :href="resource.url"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="rounded-md border border-dc-border px-3 py-1.5 text-sm font-semibold text-dc-ink hover:bg-dc-paper-warm"
                  >
                    {{ resource.title }}
                  </a>
                </div>
              </div>
            </li>
          </ol>
        </section>

        <section v-if="imagePhotos.length > 0 || folderPhotos.length > 0" class="mt-12">
          <div class="mb-5">
            <p class="editorial-eyebrow">photos</p>
            <h2 class="mt-2 text-3xl font-black tracking-tight text-dc-ink">Moments from the meetup</h2>
          </div>

          <div class="grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-end">
            <div v-if="stackedImagePhotos.length > 0" class="meetup-contact-sheet !mx-0 !w-full !max-w-3xl">
              <div
                class="meetup-photo-stack"
                :class="{ 'meetup-photo-stack--shifting': isMeetupPhotoShifting }"
                aria-label="Rotating meetup photo stack"
              >
                <div class="meetup-photo-spacer" aria-hidden="true" />
                <figure
                  v-for="photo in stackedImagePhotos"
                  :key="photo.key"
                  class="meetup-photo-print"
                  :class="[
                    photo.layer === 0 ? 'meetup-photo-print--front' : '',
                    photo.layer === 1 ? 'meetup-photo-print--middle' : '',
                    photo.layer === 2 ? 'meetup-photo-print--back' : '',
                  ]"
                  :aria-hidden="photo.layer !== 0"
                >
                  <a
                    :href="photo.url"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="block aspect-[16/10] overflow-hidden bg-dc-ink"
                    :tabindex="photo.layer === 0 ? undefined : -1"
                  >
                    <img
                      :src="photo.url"
                      :alt="photo.layer === 0 ? `${meetup.name} meetup photo` : ''"
                      class="size-full object-cover"
                      draggable="false"
                    >
                  </a>
                </figure>
              </div>

              <div class="meetup-photo-credit">
                <span>{{ imagePhotos.length }} moments captured</span>
                <span>{{ activeMeetupPhotoNumber }}/{{ imagePhotos.length }}</span>
              </div>
            </div>

            <aside class="flex flex-col gap-3 lg:items-start lg:pb-2">
              <p class="max-w-xs text-sm leading-6 text-dc-gray">
                Open the full gallery to browse the rest of the room, speaker moments, and post-event shots.
              </p>
              <a
                v-if="primaryGalleryLink"
                :href="primaryGalleryLink"
                target="_blank"
                rel="noopener noreferrer"
                class="editorial-action"
              >
                {{ galleryActionLabel }}
              </a>
              <p v-if="folderPhotos.length > 1" class="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-dc-gray">
                {{ folderPhotos.length }} gallery links available
              </p>
            </aside>
          </div>
        </section>
      </main>
    </template>
  </div>
</template>
