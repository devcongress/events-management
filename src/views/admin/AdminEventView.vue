<script setup lang="ts">
import { useQueryClient } from '@tanstack/vue-query';
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import AppDropdown from '@/src/components/AppDropdown.vue';
import ViewSkeleton from '@/src/components/ui/ViewSkeleton.vue';
import { queryKeys } from '@/src/lib/api';
import { notify } from '@/src/lib/notify';
import type { Event as CommunityEvent, EventChecklistItem, EventChecklistPhase, EventStatus } from '@/types';

const route = useRoute();
const queryClient = useQueryClient();
const event = ref<CommunityEvent | null>(null);
const checklist = ref<EventChecklistItem[]>([]);
const loading = ref(true);
const checklistSavingId = ref<string | null>(null);
const photoSaving = ref(false);
const photoError = ref<string | null>(null);
const photoUrl = ref('');
const photoType = ref<'image' | 'folder'>('folder');
const mediaUploadPurpose = ref<'cover' | 'photo' | null>(null);
const photoTypeOptions = [
  { value: 'folder', label: 'Gallery / folder' },
  { value: 'image', label: 'Single image' },
];
const SOURCE_IMAGE_MAX_BYTES = 15 * 1024 * 1024;
const TARGET_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
const OUTPUT_IMAGE_MAX_EDGE = 1600;
const IMAGE_UPLOAD_TYPES = new Set(['image/avif', 'image/jpeg', 'image/png', 'image/webp']);
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
const checklistByPhase = computed(() => checklistPhaseOrder
  .map((phase) => ({
    phase,
    label: checklistPhaseLabels[phase],
    items: checklist.value.filter((item) => item.phase === phase),
  }))
  .filter((group) => group.items.length > 0));
const currentEventId = computed(() => String(route.params.eventId));

async function invalidateEventQueries() {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.events }),
    queryClient.invalidateQueries({ queryKey: queryKeys.overview }),
    queryClient.invalidateQueries({ queryKey: queryKeys.event(currentEventId.value) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.eventChecklist(currentEventId.value) }),
  ]);
}

async function fetchOverview() {
  const eventId = route.params.eventId;
  const [eventResponse, checklistResponse] = await Promise.all([
    fetch(`/api/events/${eventId}`),
    fetch(`/api/events/${eventId}/checklist`),
  ]);

  if (eventResponse.ok) event.value = await eventResponse.json();
  if (checklistResponse.ok) {
    const payload = await checklistResponse.json();
    checklist.value = payload.items ?? [];
  }
  loading.value = false;
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

function validateImageFile(file: File): string | null {
  if (file.size > SOURCE_IMAGE_MAX_BYTES) {
    return 'Image must be 15MB or smaller before compression.';
  }

  if (!IMAGE_UPLOAD_TYPES.has(file.type)) {
    return 'Use an AVIF, JPEG, PNG, or WebP image.';
  }

  return null;
}

function compressedFileName(file: File, mimeType: string): string {
  const extension = mimeType === 'image/webp' ? 'webp' : 'jpg';
  const baseName = file.name
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'event-image';

  return `${baseName}.${extension}`;
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Could not compress this image'));
    }, mimeType, quality);
  });
}

async function loadImageSource(file: File): Promise<HTMLImageElement | ImageBitmap> {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file, { imageOrientation: 'from-image' });
  }

  const imageUrl = URL.createObjectURL(file);
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(imageUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(imageUrl);
      reject(new Error('Could not read this image'));
    };
    img.src = imageUrl;
  });
}

async function browserSupportsWebpEncoding(): Promise<boolean> {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const blob = await canvasToBlob(canvas, 'image/webp', 0.8).catch(() => null);
  return blob?.type === 'image/webp';
}

async function compressImageForUpload(file: File): Promise<File> {
  const image = await loadImageSource(file);
  const sourceWidth = 'naturalWidth' in image ? image.naturalWidth : image.width;
  const sourceHeight = 'naturalHeight' in image ? image.naturalHeight : image.height;
  const scale = Math.min(1, OUTPUT_IMAGE_MAX_EDGE / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d', { alpha: false });
  if (!context) {
    throw new Error('Could not prepare image compression');
  }

  context.drawImage(image, 0, 0, width, height);
  if ('close' in image) image.close();

  const mimeType = await browserSupportsWebpEncoding() ? 'image/webp' : 'image/jpeg';
  const qualities = [0.82, 0.74, 0.66, 0.58];
  let bestBlob: Blob | null = null;

  for (const quality of qualities) {
    const blob = await canvasToBlob(canvas, mimeType, quality);
    bestBlob = blob;
    if (blob.size <= TARGET_IMAGE_MAX_BYTES) {
      break;
    }
  }

  if (!bestBlob) {
    throw new Error('Could not compress this image');
  }

  if (bestBlob.size > 5 * 1024 * 1024) {
    throw new Error('Compressed image is still over 5MB. Try a smaller image.');
  }

  return new File([bestBlob], compressedFileName(file, mimeType), {
    type: mimeType,
    lastModified: Date.now(),
  });
}

async function uploadMediaFile(file: File, purpose: 'cover' | 'photo') {
  if (!event.value || mediaUploadPurpose.value) return;

  const validationError = validateImageFile(file);
  if (validationError) {
    photoError.value = validationError;
    notify.error(validationError);
    return;
  }

  mediaUploadPurpose.value = purpose;
  photoError.value = null;

  try {
    const compressedFile = await compressImageForUpload(file);
    const formData = new FormData();
    formData.append('file', compressedFile);
    formData.append('purpose', purpose);

    const response = await fetch(`/api/events/${route.params.eventId}/media`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error ?? 'Failed to upload image');
    }

    const payload = await response.json();
    event.value = payload.event ?? event.value;
    await invalidateEventQueries();
    const savedPercent = file.size > 0 ? Math.max(0, Math.round((1 - compressedFile.size / file.size) * 100)) : 0;
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
      <ViewSkeleton v-if="loading" variant="event-overview" />
      <div v-else-if="!event" class="py-12 text-center font-mono text-dc-gray">EVENT NOT FOUND</div>

      <template v-else>
        <div class="event-overview-hero border-b border-dc-border">
          <div class="min-w-0">
            <p class="editorial-eyebrow">event control</p>
            <h1 class="event-overview-title font-black tracking-tight text-dc-ink">{{ event.name }}</h1>
            <p v-if="event.description" class="mt-2 max-w-3xl text-sm leading-6 text-dc-gray">{{ event.description }}</p>
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
                  accept="image/avif,image/jpeg,image/png,image/webp"
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
                  accept="image/avif,image/jpeg,image/png,image/webp"
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
