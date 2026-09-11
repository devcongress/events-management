<script setup lang="ts">
import { ref, onBeforeUnmount } from 'vue';
import AppCopyButton from './ui/AppCopyButton.vue';
import { copyTextToClipboard } from '@/src/lib/clipboard';
import { notify } from '@/src/lib/notify';

const props = defineProps<{ value: string; label: string; email?: boolean; profileHref?: string }>();
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
  <div class="flex min-w-0 items-center gap-2">
    <a v-if="email" :href="`mailto:${value}`" :title="value" class="min-w-0 flex-1 truncate font-medium text-dc-pink underline decoration-dc-pink/30 underline-offset-4">{{ value }}</a>
    <a v-else-if="profileHref" :href="profileHref" target="_blank" rel="noopener noreferrer" :title="value" class="min-w-0 flex-1 truncate text-dc-pink underline underline-offset-4">{{ value }}</a>
    <span v-else :title="value" class="min-w-0 flex-1 truncate">{{ value }}</span>
    <AppCopyButton
      icon-only
      :state="state"
      :label="`Copy ${label.toLowerCase()}`"
      class="h-11 w-11 shrink-0 rounded-md border border-dc-border bg-white text-dc-gray"
      @click="copy"
    />
  </div>
</template>
