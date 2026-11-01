<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue';
import { canvasPng, loadSpeakerBadge, renderSpeakerBadge, saveBadgeFile, type SpeakerBadge } from '../lib/speaker-badge';

const props = defineProps<{ year: number; sessionId: string }>();
const canvas = ref<HTMLCanvasElement | null>(null);
const error = ref('');
const loading = ref(true);
let badge: SpeakerBadge | null = null;
let badgePhoto: File | null = null;

onMounted(async () => {
  try {
    const { card, photo } = await loadSpeakerBadge(`/api/annual-conference/${props.year}/speaker-badges/${encodeURIComponent(props.sessionId)}`);

    badge = card;
    badgePhoto = photo;
    loading.value = false;
    await nextTick();
    if (canvas.value) await renderSpeakerBadge(canvas.value, card, photo);
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : 'Unable to load badge.';
    loading.value = false;
  }
});

async function download() {
  if (!badge) return;
  const exportCanvas = document.createElement('canvas');

  await renderSpeakerBadge(exportCanvas, badge, badgePhoto);
  saveBadgeFile(await canvasPng(exportCanvas), 'devcon26-speaker-badge.png');
}
</script>

<template>
  <div class="speaker-badge-preview">
    <p v-if="loading">Loading badge…</p>
    <p v-else-if="error" role="alert">{{ error }}</p>
    <template v-else>
      <canvas ref="canvas" aria-label="Speaker badge preview" />
      <button type="button" @click="download">Download badge PNG</button>
    </template>
  </div>
</template>

<style scoped>
.speaker-badge-preview { display: grid; justify-items: start; gap: 12px; }
.speaker-badge-preview canvas { width: min(100%, 240px); height: auto; }
.speaker-badge-preview button { min-height: 44px; border: 1px solid #111; border-radius: 6px; padding: 8px 14px; }
</style>
