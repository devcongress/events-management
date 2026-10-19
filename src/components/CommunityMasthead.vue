<script setup lang="ts">
defineProps<{
  eyebrow: string;
  title: string;
  description: string;
  ribbon?: string;
  stats?: Array<{
    value: string | number;
    label: string;
    tone?: 'yellow' | 'info' | 'warm';
  }>;
}>();

function statClass(tone: 'yellow' | 'info' | 'warm' = 'warm') {
  const tones = {
    yellow: 'border-dc-ink bg-dc-yellow text-dc-ink',
    info: 'border-dc-info bg-dc-info-soft text-dc-info',
    warm: 'border-dc-border bg-dc-paper-warm text-dc-gray',
  };

  return tones[tone];
}
</script>

<template>
  <div class="community-masthead mb-8 rounded-lg border-2 border-dc-ink bg-dc-paper p-5 shadow-[3px_3px_0_#111111] sm:p-7 lg:mb-10">
    <div v-if="ribbon" class="coming-soon-ribbon">
      {{ ribbon }}
    </div>
    <div class="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between" :class="{ 'pl-16 sm:pl-20': ribbon }">
      <div class="min-w-0">
        <p class="editorial-eyebrow">{{ eyebrow }}</p>
        <h1 class="community-masthead-title mt-2 text-4xl font-bold leading-[1.08] text-dc-ink sm:text-5xl">{{ title }}</h1>
        <p class="community-masthead-description mt-3 max-w-[65ch] text-base leading-7 text-dc-gray">
          {{ description }}
        </p>
      </div>
      <div v-if="stats?.length" class="community-masthead-stats grid grid-cols-2 gap-3 sm:min-w-[360px] sm:grid-cols-3">
        <div
          v-for="stat in stats"
          :key="`${stat.label}-${stat.value}`"
          class="community-masthead-stat rounded-md border-2 p-3"
          :class="statClass(stat.tone)"
        >
          <div class="font-mono text-xl font-semibold text-dc-ink">{{ stat.value }}</div>
          <div class="mt-1 font-mono text-xs font-medium uppercase tracking-wide" :class="stat.tone === 'info' ? 'text-dc-info' : 'text-dc-gray'">{{ stat.label }}</div>
        </div>
      </div>
    </div>
  </div>
</template>
