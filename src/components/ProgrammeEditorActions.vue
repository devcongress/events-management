<script setup lang="ts">
defineProps<{ busy: boolean; saving: boolean; conflict: boolean; full: boolean }>();
defineEmits<{ add: []; save: []; cancel: [] }>();
</script>

<template>
  <div class="programme-editor-actions" role="group" aria-label="Outline actions">
    <button type="button" class="programme-action programme-action--add" :disabled="busy || full" @click="$emit('add')">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
      Add row
    </button>
    <button type="button" class="programme-action programme-action--primary" :disabled="busy || conflict" @click="$emit('save')">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h12l2 2v16H5zM8 3v6h8V3M8 21v-8h8v8" /></svg>
      {{ saving ? 'Saving…' : 'Save outline' }}
    </button>
    <button type="button" class="programme-action" :disabled="busy" @click="$emit('cancel')">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
      Cancel
    </button>
  </div>
</template>

<style scoped>
.programme-editor-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.programme-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 36px;
  padding: 6px 10px;
  border: 1px solid #c9c5bb;
  border-radius: 6px;
  background: hsl(var(--muted));
  font-size: 15px;
  font-weight: 600;
}

.programme-action--add {
  border-color: hsl(var(--accent) / .25);
  background: color-mix(in srgb, hsl(var(--accent)) 10%, white);
  color: #8a1450;
}

.programme-action--primary {
  border-color: hsl(var(--primary) / .8);
  background: color-mix(in srgb, hsl(var(--primary)) 60%, white);
}

.programme-action svg {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.programme-action:disabled {
  opacity: .5;
}

@media (prefers-reduced-motion: no-preference) {
  .programme-action:not(:disabled):active {
    transform: scale(.97);
  }
}

@media (max-width: 767px), (pointer: coarse) {
  .programme-editor-actions {
    gap: 6px;
  }

  .programme-action {
    min-height: 44px;
    padding: 8px 8px;
  }
}
</style>
