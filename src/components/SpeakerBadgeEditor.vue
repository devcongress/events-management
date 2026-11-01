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
    photo.value = result.photo;
    await draw();
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : 'Unable to load badge.';
  }
}

async function save() {
  if (!card.value) return;
  busy.value = true;
  error.value = '';
  message.value = '';
  try {
    await draw();
    const result = await fetch(path.value, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ display_name: card.value.display_name, crop: card.value.crop }) });
    const body = await result.json();

    if (!result.ok) throw new Error(body.error || 'Unable to save badge.');
    card.value = body.card;
    message.value = 'Badge saved.';
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
    card.value = body.card;
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
    <h2 id="speaker-badge-title">Your speaker badge</h2>
    <p>Personalize your badge and download it to share. Your changes are saved privately.</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="message" role="status">{{ message }}</p>
    <div v-if="card" class="speaker-badge__layout">
      <canvas ref="canvas" class="speaker-badge__preview" aria-label="Speaker badge preview" />
      <div class="speaker-badge__fields">
        <label>Display name <input v-model="card.display_name" class="editorial-input" maxlength="120" @input="refreshPreview"></label>
        <label>Photo <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" :disabled="busy" @change="upload"></label>
        <p>JPEG, PNG, WebP or AVIF, up to 5 MB.</p>
        <label>Zoom <input v-model.number="card.crop.scale" type="range" class="editorial-input" min="1" max="4" step="0.01" @input="refreshPreview"></label>
        <label>Horizontal position <input v-model.number="card.crop.x" type="range" class="editorial-input" min="0" max="1" step="0.01" @input="refreshPreview"></label>
        <label>Vertical position <input v-model.number="card.crop.y" type="range" class="editorial-input" min="0" max="1" step="0.01" @input="refreshPreview"></label>
        <div class="speaker-badge__actions">
          <button type="button" :disabled="busy" @click="save">Save badge</button>
          <button type="button" :disabled="busy" @click="download">Download PNG</button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.speaker-badge { margin-top: 24px; padding: 20px; border: 1px solid #e0ddd4; border-radius: 8px; background: white; }
.speaker-badge h2 { font-size: 1.3rem; font-weight: 600; }
.speaker-badge__layout { display: grid; grid-template-columns: minmax(0, 260px) minmax(0, 1fr); gap: 24px; margin-top: 16px; }
.speaker-badge__preview { width: 100%; height: auto; }
.speaker-badge__fields { display: grid; align-content: start; gap: 12px; }
.speaker-badge__fields label { display: grid; gap: 4px; font-weight: 600; }
.speaker-badge__fields input:not([type='range']) { width: 100%; border: 1px solid #aaa; border-radius: 6px; padding: 8px; }
.speaker-badge__actions { display: flex; flex-wrap: wrap; gap: 8px; }
.speaker-badge__actions button { min-height: 44px; padding: 8px 14px; border: 1px solid #111; border-radius: 6px; }
@media (max-width: 600px) { .speaker-badge__layout { grid-template-columns: 1fr; } .speaker-badge__preview { max-width: 260px; } }
</style>
