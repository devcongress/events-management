<script setup lang="ts">
import { useQueryClient } from '@tanstack/vue-query';
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import AppDropdown from '@/src/components/AppDropdown.vue';
import AdminEventOverviewPageSkeleton from '@/src/components/ui/page-skeletons/AdminEventOverviewPageSkeleton.vue';
import { EVENT_SERIES_HELP_TEXT, EVENT_SERIES_LABELS, EVENT_SERIES_TYPES, resolveEventSeriesType, type EventSeriesType } from '@/lib/event-series';
import { queryKeys } from '@/src/lib/api';
import {
  compressionSavingsPercent,
  compressMeetupImageForUpload,
  IMAGE_UPLOAD_ACCEPT,
  uploadEventMedia,
  validateMeetupImageFile,
} from '@/src/lib/meetup-media-client';
import { notify } from '@/src/lib/notify';
import type { Event as CommunityEvent, EventChecklistItem, EventChecklistPhase, EventStatus } from '@/types';

const route = useRoute();
const queryClient = useQueryClient();
const event = ref<CommunityEvent | null>(null);
const checklist = ref<EventChecklistItem[]>([]);
const loading = ref(true);
const checklistSavingId = ref<string | null>(null);
const publishSaving = ref(false);
const publishError = ref<string | null>(null);
const descriptionEditing = ref(false);
const descriptionSaving = ref(false);
const descriptionError = ref<string | null>(null);
const descriptionDraft = ref('');
const seriesTypeDraft = ref<EventSeriesType>('monthly');
const seriesTypeSaving = ref(false);
const seriesTypeError = ref<string | null>(null);
const photoSaving = ref(false);
const photoError = ref<string | null>(null);
const photoUrl = ref('');
const photoType = ref<'image' | 'folder'>('folder');
const mediaUploadPurpose = ref<'cover' | 'photo' | null>(null);
const photoTypeOptions = [
  { value: 'folder', label: 'Gallery / folder' },
  { value: 'image', label: 'Single image' },
];
const checklistPhaseOrder: EventChecklistPhase[] = ['setup', 'cfp', 'program', 'event_day', 'post_event'];
const checklistPhaseLabels: Record<EventChecklistPhase, string> = {
  setup: 'Event setup',
  cfp: 'Speaker / CFP',
  program: 'Program prep',
  event_day: 'Event day',
  post_event: 'Post-event',
};

const checklistProgress = computed(() => {
  const completed = checklist.value.filter((item) => item.completed).length;
  const total = checklist.value.length;

  return {
    completed,
    total,
    percent: total > 0 ? Math.round((completed / total) * 100) : 0,
  };
});
const nextChecklistItem = computed(() => checklist.value.find((item) => !item.completed) ?? null);
const eventPhotos = computed(() => event.value?.photos ?? []);
const isDraftEvent = computed(() => event.value?.status === 'draft');
const isPublishedEvent = computed(() => Boolean(event.value?.publish_to_website));
const checklistByPhase = computed(() => checklistPhaseOrder
  .map((phase) => ({
    phase,
    label: checklistPhaseLabels[phase],
    items: checklist.value.filter((item) => item.phase === phase),
  }))
  .filter((group) => group.items.length > 0));
const currentEventId = computed(() => String(route.params.eventId));
const eventSeriesTypeOptions = EVENT_SERIES_TYPES.map((value) => ({ value, label: EVENT_SERIES_LABELS[value] }));
const selectedSeriesTypeHelp = computed(() => EVENT_SERIES_HELP_TEXT[seriesTypeDraft.value]);

function broadcastPublicMeetupsRefresh() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('dc-public-meetups-refresh'));
  window.localStorage.setItem('dc-public-meetups-refresh', String(Date.now()));
}

async function invalidateEventQueries() {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.events }),
    queryClient.invalidateQueries({ queryKey: queryKeys.overview }),
    queryClient.invalidateQueries({ queryKey: queryKeys.publicMeetups }),
    queryClient.invalidateQueries({ queryKey: ['public-meetup'] }),
    queryClient.invalidateQueries({ queryKey: queryKeys.event(currentEventId.value) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.eventChecklist(currentEventId.value) }),
  ]);
  broadcastPublicMeetupsRefresh();
}

function syncDescriptionDraft() {
  descriptionDraft.value = event.value?.description ?? '';
}

function syncSeriesTypeDraft() {
  if (!event.value) return;
  seriesTypeDraft.value = resolveEventSeriesType(event.value);
}

async function fetchOverview() {
  const eventId = route.params.eventId;
  const [eventResponse, checklistResponse] = await Promise.all([
    fetch(`/api/events/${eventId}`),
    fetch(`/api/events/${eventId}/checklist`),
  ]);

  if (eventResponse.ok) {
    event.value = await eventResponse.json();
    syncDescriptionDraft();
    syncSeriesTypeDraft();
  }
  if (checklistResponse.ok) {
    const payload = await checklistResponse.json();
    checklist.value = payload.items ?? [];
  }
  loading.value = false;
}

function publishStatusForEvent(currentEvent: CommunityEvent): EventStatus {
  const startsAt = new Date(currentEvent.event_date);
  const endsAt = new Date(currentEvent.end_date ?? currentEvent.event_date);
  const nowMs = Date.now();
  const startsAtMs = startsAt.getTime();
  const endsAtMs = endsAt.getTime();

  if (!Number.isFinite(startsAtMs) || !Number.isFinite(endsAtMs)) {
    return 'upcoming';
  }

  if (nowMs < startsAtMs) return 'upcoming';
  if (nowMs <= endsAtMs) return 'live';
  return 'completed';
}

async function publishEvent() {
  if (!event.value || publishSaving.value) return;

  publishSaving.value = true;
  publishError.value = null;

  try {
    const response = await fetch(`/api/events/${route.params.eventId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        publish_to_website: true,
        status: isDraftEvent.value ? publishStatusForEvent(event.value) : event.value.status,
      }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error ?? 'Failed to publish event');
    }

    event.value = await response.json();
    await invalidateEventQueries();
    notify.success('Event published to community');
  } catch (error) {
    publishError.value = error instanceof Error ? error.message : 'Failed to publish event';
    notify.error(publishError.value);
  } finally {
    publishSaving.value = false;
  }
}

function startDescriptionEdit() {
  syncDescriptionDraft();
  descriptionError.value = null;
  descriptionEditing.value = true;
}

function cancelDescriptionEdit() {
  if (descriptionSaving.value) return;
  syncDescriptionDraft();
  descriptionError.value = null;
  descriptionEditing.value = false;
}

async function saveDescription() {
  if (!event.value || descriptionSaving.value) return;

  const nextDescription = descriptionDraft.value.trim();
  if (!nextDescription) {
    descriptionError.value = 'Add the public About copy before saving.';
    return;
  }

  descriptionSaving.value = true;
  descriptionError.value = null;

  try {
    const response = await fetch(`/api/events/${route.params.eventId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: nextDescription }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error ?? 'Failed to update the event description');
    }

    event.value = await response.json();
    syncDescriptionDraft();
    descriptionEditing.value = false;
    await invalidateEventQueries();
    notify.success('About copy updated');
  } catch (error) {
    descriptionError.value = error instanceof Error ? error.message : 'Failed to update the event description';
    notify.error(descriptionError.value);
  } finally {
    descriptionSaving.value = false;
  }
}

async function saveSeriesType() {
  if (!event.value || seriesTypeSaving.value) return;

  const currentSeriesType = resolveEventSeriesType(event.value);
  if (seriesTypeDraft.value === currentSeriesType) {
    seriesTypeError.value = null;
    return;
  }

  seriesTypeSaving.value = true;
  seriesTypeError.value = null;

  try {
    const response = await fetch(`/api/events/${route.params.eventId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ series_type: seriesTypeDraft.value }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error ?? 'Failed to update the event series type');
    }

    event.value = await response.json();
    syncSeriesTypeDraft();
    await invalidateEventQueries();
    notify.success('Event series updated');
  } catch (error) {
    seriesTypeError.value = error instanceof Error ? error.message : 'Failed to update the event series type';
    notify.error(seriesTypeError.value);
  } finally {
    seriesTypeSaving.value = false;
  }
}

async function toggleChecklistItem(item: EventChecklistItem) {
  if (checklistSavingId.value) return;

  checklistSavingId.value = item.id;
  try {
    const response = await fetch(`/api/events/${route.params.eventId}/checklist/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: !item.completed }),
    });

    if (response.ok) {
      const payload = await response.json();
      checklist.value = payload.items ?? checklist.value;
      if (payload.event) event.value = payload.event;
      await invalidateEventQueries();
    }
  } finally {
    checklistSavingId.value = null;
  }
}

function isWebsitePhotoUrl(value: string): boolean {
  return value.startsWith('/') || URL.canParse(value);
}

async function savePhotos(photos: NonNullable<CommunityEvent['photos']>, successMessage: string) {
  if (!event.value || photoSaving.value) return;

  photoSaving.value = true;
  photoError.value = null;

  try {
    const response = await fetch(`/api/events/${route.params.eventId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photos }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error ?? 'Failed to update photos');
    }

    event.value = await response.json();
    await invalidateEventQueries();
    notify.success(successMessage);
  } catch (error) {
    photoError.value = error instanceof Error ? error.message : 'Failed to update photos';
    notify.error(photoError.value);
  } finally {
    photoSaving.value = false;
  }
}

async function addPhotoLink() {
  if (!event.value) return;

  const url = photoUrl.value.trim();
  if (!url) {
    photoError.value = 'Add a photo or gallery link first.';
    return;
  }

  if (!isWebsitePhotoUrl(url)) {
    photoError.value = 'Use a full URL or a site-local path starting with /.';
    return;
  }

  const nextPhotos = [
    ...eventPhotos.value,
    {
      url,
      type: photoType.value,
    },
  ];

  await savePhotos(nextPhotos, 'Photo link added');
  if (!photoError.value) {
    photoUrl.value = '';
    photoType.value = 'folder';
  }
}

async function removePhotoLink(index: number) {
  if (!event.value) return;

  const nextPhotos = eventPhotos.value.filter((_, photoIndex) => photoIndex !== index);
  await savePhotos(nextPhotos, 'Photo link removed');
}

async function uploadMediaFile(file: File, purpose: 'cover' | 'photo') {
  if (!event.value || mediaUploadPurpose.value) return;

  const validationError = validateMeetupImageFile(file);
  if (validationError) {
    photoError.value = validationError;
    notify.error(validationError);
    return;
  }

  mediaUploadPurpose.value = purpose;
  photoError.value = null;

  try {
    const compressedFile = await compressMeetupImageForUpload(file);
    const payload = await uploadEventMedia(String(route.params.eventId), compressedFile, purpose);
    event.value = payload.event ?? event.value;
    await invalidateEventQueries();
    const savedPercent = compressionSavingsPercent(file, compressedFile);
    notify.success(
      purpose === 'cover'
        ? `Cover compressed and uploaded${savedPercent > 0 ? ` (${savedPercent}% smaller)` : ''}`
        : `Photo compressed and uploaded${savedPercent > 0 ? ` (${savedPercent}% smaller)` : ''}`,
    );
  } catch (error) {
    photoError.value = error instanceof Error ? error.message : 'Failed to upload image';
    notify.error(photoError.value);
  } finally {
    mediaUploadPurpose.value = null;
  }
}

async function handleMediaUpload(event: Event, purpose: 'cover' | 'photo') {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0] ?? null;
  input.value = '';

  if (file) {
    await uploadMediaFile(file, purpose);
  }
}

function formatShortDateTime(value: string): string {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatStatus(status: EventStatus): string {
  return status.replace('_', ' ');
}

onMounted(fetchOverview);
</script>

<template>
  <div class="editorial-page event-overview-page">
    <div class="editorial-wrap event-overview-wrap">
      <AdminEventOverviewPageSkeleton v-if="loading" />
      <div v-else-if="!event" class="py-12 text-center font-mono text-dc-gray">EVENT NOT FOUND</div>

      <template v-else>
        <div class="event-overview-hero border-b border-dc-border">
          <div class="min-w-0">
            <p class="editorial-eyebrow">event control</p>
            <div class="event-overview-title-row">
              <h1 class="event-overview-title font-black tracking-tight text-dc-ink">{{ event.name }}</h1>
              <button
                v-if="!isPublishedEvent"
                type="button"
                class="event-overview-publish-action"
                :disabled="publishSaving"
                @click="publishEvent"
              >
                {{ publishSaving ? 'Publishing...' : 'Publish' }}
              </button>
              <span
                v-else
                class="event-overview-publish-chip"
              >
                Published
              </span>
            </div>
            <p v-if="publishError" class="event-overview-copy-error mt-3">{{ publishError }}</p>
            <div class="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
              <div class="rounded-lg border border-dc-border bg-dc-paper p-4">
                <div class="event-overview-copy-header">
                  <div class="min-w-0">
                    <p class="font-mono text-[11px] font-bold uppercase tracking-wide text-dc-pink">About page</p>
                    <p class="mt-1 text-sm leading-6 text-dc-gray">This copy appears in the public meetup About section.</p>
                  </div>
                  <button
                    v-if="!descriptionEditing"
                    type="button"
                    class="event-overview-copy-action"
                    @click="startDescriptionEdit"
                  >
                    Edit
                  </button>
                </div>

                <div v-if="descriptionEditing" class="mt-4 space-y-3">
                  <label class="sr-only" for="event-about-copy">About page copy</label>
                  <textarea
                    id="event-about-copy"
                    v-model="descriptionDraft"
                    class="event-overview-copy-input"
                    rows="7"
                    placeholder="Write the public About copy for this meetup."
                  />
                  <p v-if="descriptionError" class="event-overview-copy-error">{{ descriptionError }}</p>
                  <div class="event-overview-copy-actions">
                    <button
                      type="button"
                      class="editorial-action"
                      :disabled="descriptionSaving"
                      @click="saveDescription"
                    >
                      {{ descriptionSaving ? 'SAVING...' : 'SAVE ABOUT COPY' }}
                    </button>
                    <button
                      type="button"
                      class="event-overview-copy-cancel"
                      :disabled="descriptionSaving"
                      @click="cancelDescriptionEdit"
                    >
                      Cancel
                    </button>
                  </div>
                </div>

                <p v-else-if="event.description" class="mt-4 text-sm leading-7 text-dc-gray">{{ event.description }}</p>
                <p v-else class="mt-4 text-sm leading-6 text-dc-gray">No About copy yet. Add the text you want people to read on the public event page.</p>
              </div>

              <aside class="rounded-lg border border-dc-border bg-dc-paper p-4">
                <p class="font-mono text-[11px] font-bold uppercase tracking-wide text-dc-pink">Event profile</p>
                <h2 class="mt-1 text-lg font-black tracking-tight text-dc-ink">Series type</h2>
                <p class="mt-2 text-sm leading-6 text-dc-gray">{{ selectedSeriesTypeHelp }}</p>
                <div class="mt-4 space-y-3">
                  <AppDropdown
                    v-model="seriesTypeDraft"
                    label="Series type"
                    :options="eventSeriesTypeOptions"
                    :disabled="seriesTypeSaving"
                  />
                  <button
                    type="button"
                    class="editorial-action w-full justify-center"
                    :disabled="seriesTypeSaving"
                    @click="saveSeriesType"
                  >
                    {{ seriesTypeSaving ? 'SAVING...' : 'SAVE SERIES TYPE' }}
                  </button>
                  <p v-if="seriesTypeError" class="event-overview-copy-error">{{ seriesTypeError }}</p>
                </div>
              </aside>
            </div>
          </div>
        </div>

        <section class="event-checklist-panel">
          <div class="event-checklist-header">
            <div class="min-w-0">
              <p class="editorial-eyebrow">event timeline</p>
              <h2 class="event-checklist-title">Chronological checklist</h2>
              <p class="mt-2 max-w-3xl text-sm leading-6 text-dc-gray">
                Everyone sees the same run sheet. Check off a milestone once it is done; status-changing milestones update the event state automatically.
              </p>
            </div>
            <div class="event-checklist-meter" aria-label="Checklist progress">
              <span class="event-checklist-meter-value">{{ checklistProgress.completed }}/{{ checklistProgress.total }}</span>
              <span class="event-checklist-meter-label">complete</span>
            </div>
          </div>

          <div class="event-checklist-progress-track" aria-hidden="true">
            <span
              class="event-checklist-progress-fill"
              :style="{ transform: `scaleX(${checklistProgress.percent / 100})` }"
            />
          </div>

          <div v-if="nextChecklistItem" class="event-checklist-next">
            <span class="event-checklist-next-label">Next up</span>
            <span class="event-checklist-next-copy">{{ nextChecklistItem.label }}</span>
          </div>
          <div v-else class="event-checklist-next event-checklist-next--done">
            <span class="event-checklist-next-label">Run sheet</span>
            <span class="event-checklist-next-copy">All checklist items are complete.</span>
          </div>

          <div class="event-checklist-phases">
            <div
              v-for="group in checklistByPhase"
              :key="group.phase"
              class="event-checklist-phase"
            >
              <div class="event-checklist-phase-heading">
                <span>{{ group.label }}</span>
              </div>
              <div class="event-checklist-items">
                <button
                  v-for="item in group.items"
                  :key="item.id"
                  type="button"
                  class="event-checklist-item motion-colors"
                  :class="{ 'event-checklist-item--done': item.completed }"
                  :aria-pressed="item.completed"
                  :disabled="checklistSavingId === item.id"
                  @click="toggleChecklistItem(item)"
                >
                  <span class="event-checklist-check" aria-hidden="true">
                    <span v-if="item.completed">✓</span>
                  </span>
                  <span class="min-w-0 text-left">
                    <span class="event-checklist-item-label">{{ item.label }}</span>
                    <span class="event-checklist-item-description">{{ item.description }}</span>
                    <span v-if="item.completed_at" class="event-checklist-item-meta">
                      Done by {{ item.completed_by ?? 'Organizer' }} · {{ formatShortDateTime(item.completed_at) }}
                    </span>
                  </span>
                  <span v-if="item.status_on_complete" class="event-checklist-status-chip">
                    sets {{ formatStatus(item.status_on_complete) }}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </section>

        <section class="event-media-panel">
          <div class="event-media-header">
            <div class="min-w-0">
              <p class="editorial-eyebrow">event media</p>
              <h2 class="event-media-title">Media</h2>
              <p class="mt-2 max-w-3xl text-sm leading-6 text-dc-gray">
                Upload selected images or add post-event gallery links. Uploaded images are compressed in the browser before Supabase Storage receives them.
              </p>
            </div>
            <span class="event-media-count">{{ eventPhotos.length }} saved</span>
          </div>

          <div class="event-media-upload-grid">
            <div class="event-media-upload-card">
              <div class="min-w-0">
                <p class="event-media-upload-title">Cover image</p>
                <p class="event-media-upload-copy">Upload an event cover. The browser resizes it to a web-friendly image first.</p>
                <a v-if="event.cover" :href="event.cover" target="_blank" rel="noreferrer" class="event-media-upload-current">Current cover</a>
              </div>
              <label class="event-media-upload-button" :class="{ 'opacity-60': mediaUploadPurpose === 'cover' }">
                <input
                  type="file"
                  :accept="IMAGE_UPLOAD_ACCEPT"
                  class="sr-only"
                  :disabled="Boolean(mediaUploadPurpose)"
                  @change="handleMediaUpload($event, 'cover')"
                >
                {{ mediaUploadPurpose === 'cover' ? 'Uploading...' : 'Upload cover' }}
              </label>
            </div>
            <div class="event-media-upload-card">
              <div class="min-w-0">
                <p class="event-media-upload-title">Event photo</p>
                <p class="event-media-upload-copy">Upload selected event images. Large albums should stay as folder links.</p>
              </div>
              <label class="event-media-upload-button" :class="{ 'opacity-60': mediaUploadPurpose === 'photo' }">
                <input
                  type="file"
                  :accept="IMAGE_UPLOAD_ACCEPT"
                  class="sr-only"
                  :disabled="Boolean(mediaUploadPurpose)"
                  @change="handleMediaUpload($event, 'photo')"
                >
                {{ mediaUploadPurpose === 'photo' ? 'Uploading...' : 'Upload photo' }}
              </label>
            </div>
          </div>

          <form class="event-media-form" @submit.prevent="addPhotoLink">
            <div class="event-media-url-field">
              <label class="editorial-label">Photo or gallery URL</label>
              <input
                v-model="photoUrl"
                class="editorial-input font-mono"
                placeholder="https://drive.google.com/drive/folders/... or /images/event-photo.jpg"
              />
            </div>
            <AppDropdown
              v-model="photoType"
              label="Type"
              :options="photoTypeOptions"
              class="event-media-type-field"
            />
            <button type="submit" class="editorial-action event-media-add" :disabled="photoSaving">
              {{ photoSaving ? 'SAVING...' : 'ADD LINK' }}
            </button>
          </form>

          <p v-if="photoError" class="event-media-error">{{ photoError }}</p>

          <div v-if="eventPhotos.length === 0" class="event-media-empty">
            No event photos have been added yet.
          </div>
          <div v-else class="event-media-list">
            <div
              v-for="(photo, index) in eventPhotos"
              :key="`${photo.url}-${index}`"
              class="event-media-row"
            >
              <div class="event-media-preview" :class="{ 'event-media-preview--folder': photo.type === 'folder' }">
                <img v-if="photo.type === 'image'" :src="photo.url" alt="" loading="lazy" />
                <span v-else aria-hidden="true">DIR</span>
              </div>
              <div class="min-w-0">
                <p class="event-media-row-title">{{ photo.type === 'folder' ? 'Gallery folder' : 'Single image' }}</p>
                <a class="event-media-row-url" :href="photo.url" target="_blank" rel="noreferrer">{{ photo.url }}</a>
              </div>
              <button
                type="button"
                class="event-media-remove"
                :disabled="photoSaving"
                @click="removePhotoLink(index)"
              >
                Remove
              </button>
            </div>
          </div>
        </section>

      </template>
    </div>
  </div>
</template>
