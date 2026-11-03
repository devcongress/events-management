<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import { canvasPng, loadSpeakerBadge, renderSpeakerBadge, saveBadgeFile, type SpeakerBadge } from '../lib/speaker-badge';

const props = defineProps<{ year: number; token: string }>();
const path = computed(() => `/api/conferences/${props.year}/speaker-intake/${encodeURIComponent(props.token)}/badge`);
const canvas = ref<HTMLCanvasElement | null>(null);
const card = ref<SpeakerBadge | null>(null);
const photo = ref<File | null>(null);
const error = ref('');
const message = ref('');
const busy = ref(false);
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
  });

  return renderQueue;
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

async function upload(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];

  if (!file) return;
  busy.value = true;
  error.value = '';
  try {
    const data = new FormData();

    data.set('photo', file);
    const result = await fetch(`${path.value}/photo`, { method: 'POST', body: data });
    const body = await result.json();

    if (!result.ok) throw new Error(body.error || 'Unable to save photo.');
    const currentCard = card.value;
    const hadUnsavedChanges = currentCard !== null && badgeFields(currentCard) !== savedCard.value;

    card.value = hadUnsavedChanges && currentCard
      ? { ...body.card, display_name: currentCard.display_name, crop: { ...currentCard.crop } }
      : body.card;
    savedCard.value = badgeFields(body.card);
    photo.value = file;
    await draw();
    message.value = 'Photo saved.';
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : 'Unable to save photo.';
  } finally {
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
      <p>Save your display name and photo position here, then download your badge to share.</p>
    </header>
    <p v-if="error" role="alert" class="speaker-badge__feedback">{{ error }}</p>
    <p v-if="message" role="status" class="speaker-badge__feedback">{{ message }}</p>
    <div v-if="card" class="speaker-badge__layout">
      <div class="speaker-badge__preview-wrap">
        <canvas ref="canvas" class="speaker-badge__preview" aria-label="Speaker badge preview" />
      </div>
      <div class="speaker-badge__fields">
        <div class="speaker-badge__identity">
          <label>Display name <input v-model="card.display_name" class="editorial-input" maxlength="120" @keydown.enter.prevent="save" @input="refreshPreview"></label>
          <label>Photo <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" :disabled="busy" @change="upload"></label>
          <p>JPEG, PNG, WebP or AVIF, up to 5 MB.</p>
        </div>
        <div class="speaker-badge__adjustments">
          <p class="speaker-badge__adjustments-title">Adjust photo</p>
          <label>Zoom <input v-model.number="card.crop.scale" type="range" class="app-form-control-range" min="1" max="4" step="0.01" @input="refreshPreview"></label>
          <label>Horizontal position <input v-model.number="card.crop.x" type="range" class="app-form-control-range" min="0" max="1" step="0.01" @input="refreshPreview"></label>
          <label>Vertical position <input v-model.number="card.crop.y" type="range" class="app-form-control-range" min="0" max="1" step="0.01" @input="refreshPreview"></label>
        </div>
        <div class="speaker-badge__actions">
          <button type="button" class="speaker-badge__save" :disabled="busy" @click="save">Save badge</button>
          <button type="button" :disabled="busy" @click="download">Download PNG</button>
        </div>
      </div>
    </div>
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
  .speaker-badge__layout {
    grid-template-columns: 1fr;
  }
}
</style>
