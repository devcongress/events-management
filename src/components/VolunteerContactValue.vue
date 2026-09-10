<script setup lang="ts">
import { ref, onBeforeUnmount } from 'vue';
import AppCopyButton from './ui/AppCopyButton.vue';
import { copyTextToClipboard } from '@/src/lib/clipboard';
import { notify } from '@/src/lib/notify';

const props = defineProps<{ value: string; label: string; email?: boolean }>();
const state = ref<'idle' | 'copying' | 'copied'>('idle');
let timer: ReturnType<typeof setTimeout> | undefined;
onBeforeUnmount(() => clearTimeout(timer));
async function copy() {
  state.value = 'copying';
  try {
    await copyTextToClipboard(props.value);
    state.value = 'copied';
    timer = setTimeout(() => { state.value = 'idle'; }, 1800);
  } catch {
    state.value = 'idle';
    notify.error(`Unable to copy ${props.label.toLowerCase()}.`);
  }
}
</script>

<template>
  <details class="min-w-0">
    <summary class="cursor-pointer truncate py-2 font-medium text-dc-pink underline decoration-dc-pink/30 underline-offset-4" :aria-label="`View ${label}: ${value}`">{{ value }}</summary>
    <div class="mt-1 rounded-md border border-dc-border bg-dc-paper-warm p-2">
      <a v-if="email" :href="`mailto:${value}`" class="block [overflow-wrap:anywhere] text-dc-pink">{{ value }}</a>
      <p v-else class="[overflow-wrap:anywhere]">{{ value }}</p>
      <AppCopyButton :state="state" :label="`Copy ${label.toLowerCase()}`" class="mt-2 min-h-11 max-w-full rounded-md border border-dc-border bg-white px-2 text-xs" @click="copy" />
    </div>
  </details>
</template>
