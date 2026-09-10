<script setup lang="ts">
import { computed } from 'vue';

defineOptions({ inheritAttrs: false });

const props = withDefaults(defineProps<{
  state: 'idle' | 'copying' | 'copied';
  label?: string;
  copyingLabel?: string;
  copiedLabel?: string;
  disabled?: boolean;
  iconOnly?: boolean;
}>(), {
  label: 'Copy link',
  copyingLabel: 'Copying…',
  copiedLabel: 'Copied',
  disabled: false,
  iconOnly: false,
});

const emit = defineEmits<{
  click: [event: MouseEvent];
}>();

const activeLabel = computed(() => {
  if (props.state === 'copying') return props.copyingLabel;
  if (props.state === 'copied') return props.copiedLabel;
  return '';
});
</script>

<template>
  <button
    v-bind="$attrs"
    type="button"
    class="app-copy-button motion-press inline-flex items-center justify-center"
    :data-copy-state="state"
    :disabled="disabled || state !== 'idle'"
    :aria-label="label"
    :aria-busy="state === 'copying'"
    @click="emit('click', $event)"
  >
    <span class="app-copy-button__states" aria-hidden="true">
      <span class="app-copy-button__state" :class="{ 'app-copy-button__state--active': state === 'idle' }">
        <svg viewBox="0 0 20 20" fill="none">
          <rect x="3.5" y="6.5" width="10" height="10" rx="1.75" />
          <path d="M6.5 6.5V4.75A1.75 1.75 0 0 1 8.25 3h7A1.75 1.75 0 0 1 17 4.75v7a1.75 1.75 0 0 1-1.75 1.75H13.5" />
        </svg>
        <span v-if="!iconOnly">{{ label }}</span>
      </span>
      <span class="app-copy-button__state" :class="{ 'app-copy-button__state--active': state === 'copying' }">
        <svg viewBox="0 0 20 20" fill="none">
          <rect x="3.5" y="6.5" width="10" height="10" rx="1.75" />
          <path d="M6.5 6.5V4.75A1.75 1.75 0 0 1 8.25 3h7A1.75 1.75 0 0 1 17 4.75v7a1.75 1.75 0 0 1-1.75 1.75H13.5" />
        </svg>
        <span v-if="!iconOnly">{{ copyingLabel }}</span>
      </span>
      <span class="app-copy-button__state" :class="{ 'app-copy-button__state--active': state === 'copied' }">
        <svg viewBox="0 0 20 20" fill="none">
          <path d="m4.5 10.25 3.5 3.5 7.5-8" />
        </svg>
        <span v-if="!iconOnly">{{ copiedLabel }}</span>
      </span>
    </span>
  </button>
  <span class="sr-only" role="status" aria-live="polite">{{ activeLabel }}</span>
</template>

<style scoped>
.app-copy-button__states {
  display: inline-grid;
  align-items: center;
}

.app-copy-button__state {
  grid-area: 1 / 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: .45rem;
  opacity: 0;
  transform: translateY(2px);
  transition: opacity 120ms cubic-bezier(.4, 0, .2, 1), transform 120ms cubic-bezier(.4, 0, .2, 1);
}

.app-copy-button__state--active {
  opacity: 1;
  transform: translateY(0);
}

.app-copy-button__state svg {
  width: 1rem;
  height: 1rem;
  flex: 0 0 auto;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.app-copy-button[data-copy-state='copying'] {
  cursor: progress;
  opacity: .72;
}

.app-copy-button[data-copy-state='copied'] {
  border-color: #15803d;
  background: #dcfce7;
  color: #166534;
  box-shadow: 2px 2px 0 #166534;
}

@media (prefers-reduced-motion: reduce) {
  .app-copy-button__state {
    transform: none;
    transition-duration: .01ms;
  }
}
</style>
