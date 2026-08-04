<script setup lang="ts">
import { computed } from 'vue';
import type { AdminRole } from '@/types/supabase';

const props = withDefaults(defineProps<{
  role: AdminRole;
  iconOnly?: boolean;
}>(), {
  iconOnly: false,
});

const label = computed(() => ({
  owner: 'Owner',
  organizer: 'Organizer',
  volunteer: 'Volunteer',
})[props.role]);
</script>

<template>
  <span
    class="inline-flex shrink-0 items-center justify-center border"
    :class="[
      iconOnly
        ? 'size-7 rounded-md'
        : 'rounded-sm px-1.5 py-1 font-mono text-[9px] font-semibold uppercase leading-none tracking-[0.1em]',
      {
        'border-dc-yellow/70 bg-dc-yellow/25 text-dc-ink': role === 'owner',
        'border-dc-pink/35 bg-dc-pink/10 text-dc-pink': role === 'organizer',
        'border-dc-info/30 bg-dc-info-soft text-dc-info': role === 'volunteer',
      },
    ]"
    :aria-hidden="iconOnly"
  >
    <svg v-if="iconOnly" class="size-3.5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <template v-if="role === 'owner'">
        <path d="M10 2.75 15.5 5v4.1c0 3.4-2.1 6.4-5.5 8.15-3.4-1.75-5.5-4.75-5.5-8.15V5L10 2.75Z" />
        <path d="m7.35 10 1.65 1.65 3.65-3.65" />
      </template>
      <template v-else-if="role === 'organizer'">
        <rect x="3" y="4.25" width="14" height="12.25" rx="1.5" />
        <path d="M6.5 2.75v3M13.5 2.75v3M3 8h14M7 12h2M11.5 12h1.75" />
      </template>
      <template v-else>
        <path d="M5.25 10.25V5.5a1.5 1.5 0 0 1 3 0V8m0-3.25a1.5 1.5 0 0 1 3 0V8m0-2.5a1.5 1.5 0 0 1 3 0v4.25" />
        <path d="M5.25 8.5 3.9 7.15a1.5 1.5 0 0 0-2.15 2.1l3.5 3.6v1.15c0 1.8 1.45 3.25 3.25 3.25h2c2.15 0 3.9-1.75 3.9-3.9v-2.1a1.5 1.5 0 0 0-3 0" />
      </template>
    </svg>
    <template v-else>{{ label }}</template>
  </span>
</template>

<style scoped>
svg {
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.65;
}
</style>
