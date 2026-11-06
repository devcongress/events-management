<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import SpeakerUploadStatus from './SpeakerUploadStatus.vue';
import { uploadMultipart } from '../lib/upload-multipart';

type HeadshotResponse = {
  headshot: { source: 'none' | 'link' | 'photo'; url: string | null; revision: number; photo_available: boolean };
  badge_photo: { available: boolean; version: string | null };
};

const props = defineProps<{ year: number; token: string }>();
const path = computed(() => `/api/conferences/${props.year}/speaker-intake/${encodeURIComponent(props.token)}/headshot`);
const data = ref<HeadshotResponse | null>(null);
const link = ref('');
const savedLink = ref('');
const busy = ref(false);
const loading = ref(false);
const uploading = ref(false);
const progress = ref<number | null>(null);
const error = ref('');
const status = ref('');
const input = ref<HTMLInputElement | null>(null);
const photoUrl = ref('');
const photoError = ref('');
let photoRequest = 0;
const hasUnsavedChanges = computed(() => busy.value || link.value !== savedLink.value);

defineExpose({ hasUnsavedChanges, refresh });

async function refresh(preserveDraft = true) {
  loading.value = true;
  error.value = '';
  try {
    const response = await fetch(path.value);
    const result = await response.json();

    if (!response.ok) throw new Error(result.error || 'Unable to load your headshot.');
    data.value = result;
    if (!preserveDraft || link.value === savedLink.value) {
      link.value = result.headshot.source === 'link' ? result.headshot.url || '' : '';
      savedLink.value = link.value;
    }

    return true;
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : 'Unable to load your headshot.';

    return false;
  } finally {
    loading.value = false;
  }
}

async function conflict() {
  await refresh();
  error.value = 'Your headshot changed in another session. The latest saved version is shown; your link draft is preserved. Please review and try again.';
}

async function mutate(method: 'PATCH' | 'DELETE', body?: object) {
  if (!data.value || busy.value) return;
  busy.value = true;
  error.value = '';
  status.value = '';
  try {
    const response = await fetch(path.value, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Headshot-Revision': String(data.value.headshot.revision) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const result = await response.json().catch(() => ({}));

    if (response.status === 409) {
      await conflict();

      return;
    }
    if (!response.ok) throw new Error(result.error || 'Unable to save your headshot.');
    data.value = result;
    if (method === 'DELETE' || (body && 'source' in body && body.source === 'badge')) {
      if (link.value === savedLink.value) link.value = '';
      savedLink.value = '';
    } else {
      savedLink.value = link.value;
    }
    status.value = method === 'DELETE' ? 'Headshot removed.' : 'Headshot saved.';
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : 'Unable to save your headshot.';
  } finally {
    busy.value = false;
  }
}

async function saveLink() {
  try {
    const url = new URL(link.value.trim());

    if (url.protocol !== 'https:') throw new Error();
    await mutate('PATCH', { source: 'link', url: url.toString() });
  } catch {
    error.value = 'Enter a valid HTTPS link.';
  }
}

async function reuseBadge() {
  if (!await refresh()) return;
  if (!data.value?.badge_photo.available || !data.value.badge_photo.version) {
    error.value = 'No saved badge photo is available yet.';

    return;
  }
  await mutate('PATCH', { source: 'badge', badge_version: data.value.badge_photo.version });
}

async function upload(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];

  if (!file || !data.value || busy.value) return;
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.type) || !file.size || file.size > 5 * 1024 * 1024) {
    error.value = 'Choose a JPEG, PNG, WebP or AVIF photo up to 5 MB.';
    target.value = '';

    return;
  }
  busy.value = true;
  uploading.value = true;
  progress.value = null;
  error.value = '';
  status.value = '';
  try {
    const body = new FormData();

    body.set('file', file);
    data.value = await uploadMultipart<HeadshotResponse>(`${path.value}/photo`, body, {
      headers: { 'X-Headshot-Revision': String(data.value.headshot.revision) },
      onProgress: value => { progress.value = value; },
    });
    if (link.value === savedLink.value) link.value = '';
    savedLink.value = '';
    status.value = 'Headshot saved.';
  } catch (reason) {
    if (reason instanceof Error && 'status' in reason && reason.status === 409) await conflict();
    else error.value = reason instanceof Error ? reason.message : 'Unable to upload your headshot.';
  } finally {
    busy.value = false;
    uploading.value = false;
    progress.value = null;
    target.value = '';
  }
}

async function loadPhoto() {
  const request = ++photoRequest;
  const previous = photoUrl.value;

  photoUrl.value = '';
  if (previous) URL.revokeObjectURL(previous);
  photoError.value = '';
  if (!data.value?.headshot.photo_available) return;
  try {
    const response = await fetch(`${path.value}/photo`, { credentials: 'include' });

    if (!response.ok) throw new Error('Unable to load the saved photo preview.');
    const blob = await response.blob();

    if (request === photoRequest) photoUrl.value = URL.createObjectURL(blob);
  } catch {
    if (request === photoRequest) photoError.value = 'Unable to load the saved photo preview.';
  }
}

watch(() => [data.value?.headshot.photo_available, data.value?.headshot.revision], () => { void loadPhoto(); });
onBeforeUnmount(() => {
  photoRequest += 1;
  if (photoUrl.value) URL.revokeObjectURL(photoUrl.value);
});

onMounted(() => refresh(false));
</script>

<template>
  <div class="min-w-0 space-y-3">
    <div>
      <h3 class="font-bold">Headshot</h3>
      <p class="text-sm text-dc-gray">Organizers use the original photo for speaker publicity. Your headshot saves separately from your other details.</p>
    </div>
    <button v-if="!data && error" type="button" :disabled="loading" class="headshot-action" @click="refresh(false)">{{ loading ? 'Loading…' : 'Retry loading headshot' }}</button>
    <div v-if="data" class="rounded-md border border-dc-border p-3">
      <p class="text-sm font-semibold">{{ data.headshot.source === 'none' ? 'No headshot added' : 'Current headshot' }}</p>
      <img v-if="photoUrl" :src="photoUrl" alt="Your saved headshot" class="mt-2 max-h-40 max-w-full rounded-md object-contain" />
      <p v-if="photoError" class="mt-2 text-sm text-red-700">{{ photoError }} <button type="button" class="underline" @click="loadPhoto">Retry preview</button></p>
      <a v-else-if="data.headshot.source === 'link' && data.headshot.url" :href="data.headshot.url" target="_blank" rel="noopener noreferrer nofollow" class="mt-2 block break-all text-sm font-semibold text-dc-pink underline">Open saved headshot link ↗</a>
      <button v-if="data.headshot.source !== 'none'" type="button" :disabled="busy" class="mt-2 text-sm font-semibold text-dc-pink underline disabled:opacity-50" @click="mutate('DELETE')">Remove headshot</button>
    </div>
    <div class="flex flex-wrap gap-2">
      <button type="button" :disabled="busy || !data" class="headshot-action headshot-action--primary" @click="input?.click()">{{ data?.headshot.source === 'photo' ? 'Replace photo' : 'Upload photo' }}</button>
      <button type="button" :disabled="busy || !data?.badge_photo.available" class="headshot-action" @click="reuseBadge">Use saved badge photo</button>
      <input ref="input" type="file" hidden accept="image/jpeg,image/png,image/webp,image/avif" :disabled="busy" @change="upload">
    </div>
    <p class="text-sm text-dc-gray">JPEG, PNG, WebP or AVIF, up to 5 MB. Reusing a badge photo makes a separate copy.</p>
    <label class="block">
      <span class="editorial-label">Or use an HTTPS headshot link</span>
      <input v-model="link" type="text" maxlength="2048" inputmode="url" placeholder="https://…" class="editorial-input" :disabled="busy" />
    </label>
    <button type="button" :disabled="busy || !data || !link.trim()" class="headshot-action" @click="saveLink">Save headshot link</button>
    <SpeakerUploadStatus :busy="uploading" :progress="progress" :status="uploading ? (progress === 100 ? 'Saving photo…' : 'Uploading photo…') : status" :error="error" label="Headshot upload progress" />
  </div>
</template>

<style scoped>
.headshot-action {
  min-height: 44px;
  padding: 0.5rem 1rem;
  border: 1px solid #bcb8ae;
  border-radius: 6px;
  background: white;
  font-weight: 600;
  white-space: nowrap;
}

.headshot-action--primary {
  border-color: #e8117f;
  background: #e8117f;
  color: white;
}

.headshot-action:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.headshot-action:focus-visible {
  outline: 2px solid #e8117f;
  outline-offset: 2px;
}
</style>
