<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{
  modelValue: number;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  suffix?: string;
  disabled?: boolean;
}>(), {
  step: 1,
});

const emit = defineEmits<{
  'update:modelValue': [value: number];
}>();

const canDecrease = computed(() => props.min === undefined || props.modelValue > props.min);
const canIncrease = computed(() => props.max === undefined || props.modelValue < props.max);

function clamp(value: number) {
  if (props.min !== undefined && value < props.min) return props.min;
  if (props.max !== undefined && value > props.max) return props.max;
  return value;
}

function update(value: number) {
  emit('update:modelValue', clamp(value));
}

function decrease() {
  if (!props.disabled && canDecrease.value) {
    update(props.modelValue - props.step);
  }
}

function increase() {
  if (!props.disabled && canIncrease.value) {
    update(props.modelValue + props.step);
  }
}
</script>

<template>
  <div class="block">
    <span v-if="label" class="editorial-label">{{ label }}</span>
    <div
      class="mt-2 grid min-h-[50px] grid-cols-[2.75rem_1fr_2.75rem] overflow-hidden rounded-md border-2 border-dc-ink bg-dc-paper text-dc-ink focus-within:border-dc-pink focus-within:shadow-[0_0_0_3px_rgba(17,17,17,0.16)]"
      :class="{ 'opacity-50': disabled }"
    >
      <button
        type="button"
        class="motion-press grid place-items-center border-r-2 border-dc-border font-mono text-xl font-semibold text-dc-pink hover:bg-dc-paper-warm disabled:cursor-not-allowed disabled:text-dc-gray"
        :disabled="disabled || !canDecrease"
        :aria-label="`Decrease ${label ?? 'value'}`"
        @click="decrease"
      >
        -
      </button>
      <div class="flex min-w-0 items-center justify-center gap-2 px-3 font-mono font-semibold tabular-nums">
        <span class="text-lg text-dc-ink">{{ modelValue }}</span>
        <span v-if="suffix" class="truncate text-[10px] uppercase tracking-[0.16em] text-dc-gray">{{ suffix }}</span>
      </div>
      <button
        type="button"
        class="motion-press grid place-items-center border-l-2 border-dc-border font-mono text-xl font-semibold text-dc-pink hover:bg-dc-paper-warm disabled:cursor-not-allowed disabled:text-dc-gray"
        :disabled="disabled || !canIncrease"
        :aria-label="`Increase ${label ?? 'value'}`"
        @click="increase"
      >
        +
      </button>
    </div>
  </div>
</template>
