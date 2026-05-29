<script setup lang="ts">
import { useRoute } from 'vue-router';
import { adminPath } from '@/src/admin-routes';

const props = defineProps<{
  eventId: string;
}>();

const route = useRoute();

const tabs = [
  { href: '', label: 'Overview' },
  { href: 'talks', label: 'Talks' },
  { href: 'speakers', label: 'Speakers' },
  { href: 'quiz', label: 'Quiz' },
  { href: 'quiz/live', label: 'Live' },
];

function tabPath(href: string) {
  return href ? adminPath(`events/${props.eventId}/${href}`) : adminPath(`events/${props.eventId}`);
}

function isActive(href: string) {
  const path = tabPath(href);
  if (!href) return route.path === path;
  return route.path === path || route.path.startsWith(`${path}/`);
}
</script>

<template>
  <nav class="mb-8 overflow-x-auto border-b border-dc-yellow/10 pb-4">
    <div class="flex min-w-max gap-2 font-mono text-xs font-bold uppercase tracking-wide">
      <RouterLink
        v-for="tab in tabs"
        :key="tab.href"
        :to="tabPath(tab.href)"
        class="rounded-md border px-4 py-2 transition-all"
        :class="isActive(tab.href) ? 'border-dc-yellow bg-dc-yellow text-dc-dark shadow-[0_10px_28px_rgba(249,225,94,0.16)]' : 'border-dc-yellow/10 bg-dc-yellow/[0.03] text-dc-gray-light hover:border-dc-yellow/35 hover:bg-dc-yellow/[0.06] hover:text-white'"
      >
        {{ tab.label }}
      </RouterLink>
    </div>
  </nav>
</template>
