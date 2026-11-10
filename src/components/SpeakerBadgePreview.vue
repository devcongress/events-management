<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { loadDigitalBadgeAssets } from '../lib/devcon26-digital-badge';
import { canvasPng, loadSpeakerBadge, renderSpeakerBadge, saveBadgeFile } from '../lib/speaker-badge';

const props = defineProps<{ year: number; sessionId: string }>();
const canvas = ref<HTMLCanvasElement | null>(null);
const error = ref('');
const exportError = ref('');
const loading = ref(true);
const downloading = ref(false);

onMounted(async () => {
  try {
    const [{ card, photo }] = await Promise.all([
      loadSpeakerBadge(`/api/annual-conference/${props.year}/speaker-badges/${encodeURIComponent(props.sessionId)}`),
      loadDigitalBadgeAssets(),
    ]);

    if (!canvas.value) throw new Error('Unable to prepare badge preview.');
    await renderSpeakerBadge(canvas.value, card, photo);
    loading.value = false;
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : 'Unable to load badge.';
    loading.value = false;
  }
});

async function download() {
  if (!canvas.value || downloading.value || loading.value || error.value) return;
  downloading.value = true;
  exportError.value = '';

  try {
    saveBadgeFile(await canvasPng(canvas.value), 'devcon26-speaker-badge.png');
  } catch (reason) {
    exportError.value = reason instanceof Error ? reason.message : 'Unable to export badge.';
  } finally {
    downloading.value = false;
  }
}
</script>

<template>
  <div class="speaker-badge-preview">
    <div class="badge-frame bg-dc-paper-warm text-dc-gray" :aria-busy="loading">
      <canvas v-show="!loading && !error" ref="canvas" aria-label="Speaker badge preview" />
      <p v-if="loading" class="px-3 text-center text-sm">Loading badge…</p>
      <p v-else-if="error" class="px-3 text-center text-sm" role="alert">{{ error }}</p>
    </div>
    <button v-if="!loading && !error" type="button" class="motion-press min-h-11 rounded-md border border-dc-border bg-dc-paper px-4 text-sm font-semibold text-dc-ink hover:bg-dc-paper-warm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dc-pink" :disabled="downloading" @click="download">{{ downloading ? 'Preparing PNG…' : 'Download badge PNG' }}</button>
    <p v-if="exportError" class="text-sm text-red-700" role="alert">{{ exportError }}</p>
  </div>
</template>

<style scoped>
.speaker-badge-preview {
  display: grid;
  justify-items: start;
  gap: 12px;
}

.badge-frame {
  display: grid;
  width: min(100%, 200px);
  aspect-ratio: 4 / 5;
  place-items: center;
}

.speaker-badge-preview canvas {
  width: 100%;
  height: auto;
}
</style>
