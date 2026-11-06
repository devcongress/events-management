<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import SpeakerUploadStatus from './SpeakerUploadStatus.vue';
import ConfirmDialog from './ui/ConfirmDialog.vue';
import { uploadMultipart } from '../lib/upload-multipart';
import { canvasPng, loadSpeakerBadge, renderSpeakerBadge, saveBadgeFile, type SpeakerBadge } from '../lib/speaker-badge';

const props = defineProps<{ year: number; token: string }>();
const emit = defineEmits<{ photoChanged: [] }>();
const path = computed(() => `/api/conferences/${props.year}/speaker-intake/${encodeURIComponent(props.token)}/badge`);
const canvas = ref<HTMLCanvasElement | null>(null);
const previewCanvas = ref<HTMLCanvasElement | null>(null);
const previewDialog = ref<HTMLDialogElement | null>(null);
const previewTrigger = ref<HTMLButtonElement | null>(null);
const photoInput = ref<HTMLInputElement | null>(null);
const photoAction = ref<HTMLButtonElement | null>(null);
const confirmPhotoRemoval = ref(false);
const removingPhoto = ref(false);
const uploadProgress = ref<number | null>(null);
const uploading = ref(false);
const card = ref<SpeakerBadge | null>(null);
const photo = ref<File | null>(null);
const error = ref('');
const message = ref('');
const photoError = ref('');
const photoMessage = ref('');
const photoStatus = computed(() => {
  if (uploading.value) return uploadProgress.value === 100 ? 'Saving photo…' : 'Uploading photo…';
  if (photoMessage.value) return photoMessage.value;

  return card.value?.photo_available ? 'Photo saved to your badge' : 'No photo added';
});
const busy = ref(false);
const shareFile = ref<File | null>(null);
const canShare = computed(() => Boolean(shareFile.value && typeof navigator.share === 'function' && navigator.canShare?.({ files: [shareFile.value] })));
let shareRevision = 0;
const savedCard = ref('');
const hasUnsavedChanges = computed(() => busy.value || (card.value !== null && savedCard.value !== badgeFields(card.value)));

defineExpose({ hasUnsavedChanges });

function badgeFields(value: SpeakerBadge) {
  return JSON.stringify({ display_name: value.display_name, crop: value.crop });
}
let renderQueue: Promise<void> = Promise.resolve();

function draw() {
  const currentCard = card.value ? { ...card.value, crop: { ...card.value.crop } } : null;
  const currentPhoto = photo.value;

  renderQueue = renderQueue.catch(() => {}).then(async () => {
    await nextTick();
    if (canvas.value && currentCard) await renderSpeakerBadge(canvas.value, currentCard, currentPhoto);
    if (previewDialog.value?.open && previewCanvas.value && currentCard) {
      await renderSpeakerBadge(previewCanvas.value, currentCard, currentPhoto);
    }
  });

  return renderQueue;
}

async function prepareShare() {
  const revision = ++shareRevision;
  const currentCard = card.value ? { ...card.value, crop: { ...card.value.crop } } : null;
  const currentPhoto = photo.value;

  shareFile.value = null;
  if (!currentCard) return;
  try {
    const exportCanvas = document.createElement('canvas');

    await renderSpeakerBadge(exportCanvas, currentCard, currentPhoto);
    const blob = await canvasPng(exportCanvas);

    if (revision === shareRevision) shareFile.value = new File([blob], 'devcon26-speaker-badge.png', { type: 'image/png' });
  } catch {
    // The existing preview and download actions report rendering errors.
  }
}

watch([card, photo], () => { void prepareShare(); }, { deep: true, flush: 'sync' });

function share() {
  const file = shareFile.value;

  if (busy.value || !file || typeof navigator.share !== 'function' || !navigator.canShare?.({ files: [file] })) return;
  void navigator.share({ files: [file], title: 'DevCon26 speaker badge' }).catch((reason) => {
    if (reason?.name !== 'AbortError') error.value = 'Sharing was unavailable. Download your badge instead.';
  });
}

function refreshPreview() {
  void draw().then(() => { error.value = ''; }).catch((reason) => {
    error.value = reason instanceof Error ? reason.message : 'Unable to preview badge.';
  });
}

async function load() {
  try {
    const result = await loadSpeakerBadge(path.value);

    card.value = result.card;
    savedCard.value = badgeFields(result.card);
    photo.value = result.photo;
    await draw();
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : 'Unable to load badge.';
  }
}

async function save() {
  if (busy.value || !card.value) return;
  busy.value = true;
  error.value = '';
  message.value = '';
  try {
    const submittedCard = badgeFields(card.value);

    await draw();
    const result = await fetch(path.value, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: submittedCard });
    const body = await result.json();

    if (!result.ok) throw new Error(body.error || 'Unable to save badge.');
    savedCard.value = badgeFields(body.card);
    if (card.value && badgeFields(card.value) === submittedCard) card.value = body.card;
    message.value = card.value && badgeFields(card.value) !== savedCard.value
      ? 'Badge saved. You have newer changes to save.'
      : 'Badge saved.';
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : 'Unable to save badge.';
  } finally {
    busy.value = false;
  }
}

async function openPreview() {
  previewDialog.value?.showModal();
  await nextTick();
  try {
    await draw();
  } catch (reason) {
    previewDialog.value?.close();
    error.value = reason instanceof Error ? reason.message : 'Unable to preview badge.';
  }
}

function closePreview() {
  previewDialog.value?.close();
}

function restorePreviewFocus() {
  previewTrigger.value?.focus();
}

function updatePhotoCard(updated: SpeakerBadge) {
  const currentCard = card.value;
  const hadUnsavedChanges = currentCard !== null && badgeFields(currentCard) !== savedCard.value;

  card.value = hadUnsavedChanges && currentCard
    ? { ...updated, display_name: currentCard.display_name, crop: { ...currentCard.crop } }
    : updated;
  savedCard.value = badgeFields(updated);
}

async function removePhoto() {
  if (busy.value || !card.value?.photo_available) return;
  busy.value = true;
  removingPhoto.value = true;
  photoError.value = '';
  photoMessage.value = '';
  try {
    if (!card.value.photo_version) {
      throw new Error('The saved photo may have changed. Save your other edits and reload this page before removing it.');
    }

    const result = await fetch(`${path.value}/photo`, {
      method: 'DELETE',
      headers: { 'X-Badge-Photo-Version': card.value.photo_version },
    });
    const body = await result.json().catch(() => ({}));

    if (result.status === 409) {
      throw new Error('The photo changed in another session. Save your other edits and reload this page to see the latest photo.');
    }
    if (!result.ok) throw new Error(body.error || 'Unable to remove photo.');
    updatePhotoCard(body.card);
    photo.value = null;
    confirmPhotoRemoval.value = false;
    photoMessage.value = 'Photo removed.';
    emit('photoChanged');
    refreshPreview();
  } catch (reason) {
    confirmPhotoRemoval.value = false;
    photoError.value = reason instanceof Error ? reason.message : 'Unable to remove photo.';
  } finally {
    removingPhoto.value = false;
    busy.value = false;
    await nextTick();
    photoAction.value?.focus();
  }
}

async function upload(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];

  if (!file || busy.value) return;
  photoError.value = '';
  photoMessage.value = '';
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.type)) {
    photoError.value = 'Choose a JPEG, PNG, WebP or AVIF photo.';
    input.value = '';

    return;
  }
  if (file.size < 1 || file.size > 5 * 1024 * 1024) {
    photoError.value = 'Choose a non-empty photo that is 5 MB or smaller.';
    input.value = '';

    return;
  }

  busy.value = true;
  uploading.value = true;
  uploadProgress.value = null;
  try {
    const objectUrl = URL.createObjectURL(file);

    try {
      const image = new Image();

      image.src = objectUrl;
      await image.decode();
    } catch {
      throw new Error('This photo could not be opened. Choose another image and try again.');
    } finally {
      URL.revokeObjectURL(objectUrl);
    }

    const data = new FormData();

    data.set('photo', file);
    const body = await uploadMultipart<{ card: SpeakerBadge }>(`${path.value}/photo`, data, {
      onProgress: percent => { uploadProgress.value = percent; },
    });

    updatePhotoCard(body.card);
    photo.value = file;
    photoMessage.value = 'Photo saved.';
    emit('photoChanged');
    refreshPreview();
  } catch (reason) {
    photoError.value = reason instanceof Error ? reason.message : 'Unable to save photo.';
  } finally {
    uploading.value = false;
    uploadProgress.value = null;
    busy.value = false;
    input.value = '';
  }
}

async function download() {
  if (!canvas.value) return;
  try {
    if (!card.value) return;
    const exportCanvas = document.createElement('canvas');

    await renderSpeakerBadge(exportCanvas, card.value, photo.value);
    saveBadgeFile(await canvasPng(exportCanvas), 'devcon26-speaker-badge.png');
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : 'Unable to download badge.';
  }
}

onMounted(load);
</script>

<template>
  <section class="speaker-badge" aria-labelledby="speaker-badge-title">
    <header class="speaker-badge__heading">
      <h2 id="speaker-badge-title">Your speaker badge</h2>
      <p>Photos save when uploaded. Save your display name and photo position before leaving.</p>
    </header>
    <p v-if="error" role="alert" class="speaker-badge__feedback">{{ error }}</p>
    <p v-if="message" role="status" class="speaker-badge__feedback">{{ message }}</p>
    <div v-if="card" class="speaker-badge__layout">
      <div class="speaker-badge__preview-wrap">
        <button ref="previewTrigger" type="button" class="speaker-badge__preview-button text-action" aria-label="View a larger badge preview" @click="openPreview">
          <canvas ref="canvas" class="speaker-badge__preview" aria-label="Speaker badge preview" />
          <span>Preview badge</span>
        </button>
      </div>
      <div class="speaker-badge__fields">
        <div class="speaker-badge__identity">
          <label>Display name <input v-model="card.display_name" class="editorial-input" maxlength="120" @keydown.enter.prevent="save" @input="refreshPreview"></label>
          <div class="speaker-badge__photo">
            <p class="speaker-badge__photo-label">Photo</p>
            <SpeakerUploadStatus :busy="uploading" :progress="uploadProgress" :error="photoError" :status="photoStatus" label="Photo upload progress" />
            <div class="speaker-badge__photo-actions">
              <button ref="photoAction" type="button" :disabled="busy" @click="photoInput?.click()">{{ card.photo_available ? 'Replace photo' : 'Add photo' }}</button>
              <button v-if="card.photo_available" type="button" :disabled="busy" @click="confirmPhotoRemoval = true">Remove photo</button>
            </div>
            <input ref="photoInput" type="file" hidden accept="image/jpeg,image/png,image/webp,image/avif" :disabled="busy" @change="upload">
            <p>JPEG, PNG, WebP or AVIF, up to 5 MB. Changes save immediately.</p>
          </div>

        </div>
        <div class="speaker-badge__adjustments">
          <p class="speaker-badge__adjustments-title">Adjust photo</p>
          <label>Zoom <input v-model.number="card.crop.scale" type="range" class="app-form-control-range" min="1" max="4" step="0.01" @input="refreshPreview"></label>
          <label>Horizontal position <input v-model.number="card.crop.x" type="range" class="app-form-control-range" min="0" max="1" step="0.01" @input="refreshPreview"></label>
          <label>Vertical position <input v-model.number="card.crop.y" type="range" class="app-form-control-range" min="0" max="1" step="0.01" @input="refreshPreview"></label>
        </div>
        <div class="speaker-badge__actions">
          <button type="button" class="speaker-badge__save" :disabled="busy" @click="save">Save badge</button>
          <button v-if="canShare" type="button" class="motion-press" :disabled="busy" @click="share">Share badge</button>
          <button type="button" :disabled="busy" @click="download">Download PNG</button>
        </div>
      </div>
    </div>
    <ConfirmDialog
      :open="confirmPhotoRemoval"
      title="Remove badge photo?"
      message="Your photo will be removed from your speaker badge. You can add another photo later."
      confirm-label="Remove photo"
      busy-label="Removing…"
      :busy="removingPhoto"
      danger
      mobile-sheet
      @cancel="confirmPhotoRemoval = false"
      @confirm="removePhoto"
    />
    <Teleport to="body">
      <dialog ref="previewDialog" class="speaker-badge-dialog" aria-labelledby="speaker-badge-preview-title" @close="restorePreviewFocus">
        <header class="speaker-badge-dialog__header">
          <h2 id="speaker-badge-preview-title">Badge preview</h2>
          <button type="button" class="speaker-badge-dialog__close" aria-label="Close badge preview" autofocus @click="closePreview">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </header>
        <canvas ref="previewCanvas" class="speaker-badge-dialog__canvas" aria-label="Larger speaker badge preview" />
      </dialog>
    </Teleport>
  </section>
</template>

<style scoped>
.speaker-badge {
  margin-top: 24px;
  padding: clamp(1.25rem, 2.5vw, 2rem);
  border: 1px solid #e0ddd4;
  border-radius: 8px;
  background: white;
}

.speaker-badge__heading h2 {
  font-size: 1.3rem;
  font-weight: 600;
}

.speaker-badge__heading p,
.speaker-badge__identity p {
  color: #555;
}

.speaker-badge__feedback {
  margin-top: 0.75rem;
}

.speaker-badge__layout {
  display: grid;
  grid-template-columns: minmax(0, 220px) minmax(0, 1fr);
  gap: clamp(1.25rem, 3vw, 2.5rem);
  margin-top: 1.5rem;
}

.speaker-badge__preview-wrap {
  min-width: 0;
}

.speaker-badge__preview-button {
  display: grid;
  justify-items: start;
  gap: 0.5rem;
  width: 100%;
  color: #555;
  font-size: 0.875rem;
  font-weight: 600;
  text-align: left;
}

.speaker-badge__preview-button span {
  text-decoration: underline;
  text-underline-offset: 3px;
}

.speaker-badge__preview-button:focus-visible {
  outline: 2px solid #e8117f;
  outline-offset: 4px;
}

.speaker-badge__preview {
  display: block;
  width: 100%;
  max-width: 220px;
  height: auto;
}

.speaker-badge__fields,
.speaker-badge__identity,
.speaker-badge__adjustments {
  display: grid;
  min-width: 0;
  align-content: start;
  gap: 1rem;
}

.speaker-badge__fields label {
  display: grid;
  min-width: 0;
  gap: 0.375rem;
  font-weight: 600;
}

.speaker-badge__identity input {
  width: 100%;
  min-width: 0;
  border: 1px solid #aaa;
  border-radius: 6px;
  padding: 0.5rem;
}

.speaker-badge__identity p {
  margin-top: -0.5rem;
  font-size: 0.875rem;
}

.speaker-badge__photo {
  display: grid;
  gap: 0.5rem;
}

.speaker-badge__photo .speaker-badge__photo-label {
  margin: 0;
  color: #111;
  font-size: 1rem;
  font-weight: 600;
}

.speaker-badge__photo p {
  margin: 0;
}

.speaker-badge__photo-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.speaker-badge__photo-actions button {
  min-height: 44px;
  padding: 0.5rem 0.875rem;
  border: 1px solid #aaa;
  border-radius: 6px;
}

.speaker-badge__adjustments-title {
  font-weight: 600;
}

.speaker-badge__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.speaker-badge__actions button {
  min-height: 44px;
  padding: 0.5rem 1rem;
  border: 1px solid #111;
  border-radius: 6px;
  white-space: nowrap;
}

.speaker-badge__actions .speaker-badge__save {
  background: #e8117f;
  color: white;
}

.speaker-badge-dialog {
  margin: auto;
  width: min(28rem, calc(100% - 2rem));
  max-height: min(90dvh, 48rem);
  padding: 1.25rem;
  border: 1px solid #e0ddd4;
  border-radius: 12px;
  background: white;
}

.speaker-badge-dialog::backdrop {
  background: rgb(17 17 17 / 45%);
}

.speaker-badge-dialog__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}

.speaker-badge-dialog__header h2 {
  font-size: 1.25rem;
  font-weight: 600;
}

.speaker-badge-dialog__close {
  display: grid;
  place-items: center;
  min-width: 44px;
  min-height: 44px;
  padding: 0.5rem;
  color: var(--color-dc-pink, #e8117f);
}

.speaker-badge-dialog__close:hover:not(:focus-visible) {
  outline: none;
}

.speaker-badge-dialog__close:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 2px;
}

.speaker-badge-dialog__canvas {
  display: block;
  width: auto;
  max-width: 100%;
  max-height: calc(90dvh - 7rem);
  margin: 0 auto;
}

@media (min-width: 64rem) {
  .speaker-badge__fields {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    column-gap: clamp(1.5rem, 3vw, 3rem);
  }

  .speaker-badge__actions {
    grid-column: 1 / -1;
  }
}

@media (max-width: 600px) {
  .speaker-badge-dialog {
    inset: auto 0 0;
    width: 100%;
    max-height: 90dvh;
    margin: 0;
    padding-bottom: max(1.25rem, env(safe-area-inset-bottom));
    border-radius: 12px 12px 0 0;
  }

  .speaker-badge__layout {
    grid-template-columns: 1fr;
  }
}
</style>
