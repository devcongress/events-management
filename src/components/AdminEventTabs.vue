<script setup lang="ts">
import { useRoute } from 'vue-router';

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
  return href ? `/admin/events/${props.eventId}/${href}` : `/admin/events/${props.eventId}`;
}

function isActive(href: string) {
  const path = tabPath(href);
  if (!href) return route.path === path;
  return route.path === path || route.path.startsWith(`${path}/`);
}
</script>

<template>
  <nav class="mb-8 overflow-x-auto border-b border-dc-yellow/10 pb-3">
    <div class="flex min-w-max gap-2 font-mono text-xs font-bold uppercase tracking-wide">
      <RouterLink
        v-for="tab in tabs"
        :key="tab.href"
        :to="tabPath(tab.href)"
        class="border px-4 py-2 transition-all"
        :class="isActive(tab.href) ? 'border-dc-yellow bg-dc-yellow text-dc-dark' : 'border-dc-dark-3 bg-dc-dark-1 text-dc-gray-light hover:border-dc-yellow/40 hover:text-white'"
      >
        {{ tab.label }}
      </RouterLink>
    </div>
  </nav>
</template>
