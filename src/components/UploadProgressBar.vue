<script setup lang="ts">
withDefaults(defineProps<{
  percent: number | null;
  label?: string;
}>(), {
  label: 'Uploading image',
});
</script>

<template>
  <div class="border-t border-dc-line bg-dc-paper-warm px-4 py-3" aria-live="polite">
    <div class="flex items-center justify-between gap-3 font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-dc-gray">
      <span>{{ label }}</span>
      <span>{{ percent === null ? 'WORKING…' : `${percent}%` }}</span>
    </div>
    <div
      class="mt-2 h-1.5 overflow-hidden rounded-full bg-dc-line"
      role="progressbar"
      :aria-label="label"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-valuenow="percent ?? undefined"
      :aria-valuetext="percent === null ? 'Preparing image upload' : `${percent}% uploaded`"
    >
      <span
        class="block h-full w-full origin-left bg-dc-pink transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
        :style="{ transform: `scaleX(${Math.max(0.04, (percent ?? 8) / 100)})` }"
      />
    </div>
  </div>
</template>
