<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import type { ComponentPublicInstance } from 'vue';
import { useRoute } from 'vue-router';
import { adminPath } from '@/src/admin-routes';

const route = useRoute();
const submissionsPath = adminPath('events/submissions');
const submissionsActive = computed(() => route.path === submissionsPath);
const linkElements = ref<HTMLElement[]>([]);
const indicator = ref({ left: 0, baseWidth: 0, scale: 1, ready: false });

const indicatorStyle = computed(() => ({
  width: `${indicator.value.baseWidth}px`,
  opacity: indicator.value.ready ? '1' : '0',
  transform: `translate3d(${indicator.value.left}px, 0, 0) scaleX(${indicator.value.scale})`,
}));

function setLinkElement(element: Element | ComponentPublicInstance | null, index: number) {
  if (element instanceof HTMLElement) {
    linkElements.value[index] = element;
    return;
  }

  if (element && !(element instanceof Element) && element.$el instanceof HTMLElement) {
    linkElements.value[index] = element.$el;
  }
}

function updateIndicator() {
  const first = linkElements.value[0];
  const active = linkElements.value[submissionsActive.value ? 1 : 0];
  if (!first || !active || first.offsetWidth === 0) {
    indicator.value = { left: 0, baseWidth: 0, scale: 1, ready: false };
    return;
  }

  indicator.value = {
    left: active.offsetLeft,
    baseWidth: first.offsetWidth,
    scale: active.offsetWidth / first.offsetWidth,
    ready: true,
  };
}

onMounted(() => {
  void nextTick(updateIndicator);
  window.addEventListener('resize', updateIndicator);
});

onUnmounted(() => window.removeEventListener('resize', updateIndicator));

watch(submissionsActive, () => void nextTick(updateIndicator));
</script>

<template>
  <nav class="events-workspace-nav" aria-label="Events workspace">
    <span class="events-workspace-indicator" :style="indicatorStyle" aria-hidden="true" />
    <RouterLink
      :ref="(element) => setLinkElement(element, 0)"
      :to="adminPath('events')"
      class="events-workspace-link motion-press"
      :aria-current="submissionsActive ? undefined : 'page'"
    >
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <span>All events</span>
    </RouterLink>
    <RouterLink
      :ref="(element) => setLinkElement(element, 1)"
      :to="submissionsPath"
      class="events-workspace-link motion-press"
      :aria-current="submissionsActive ? 'page' : undefined"
    >
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5v-11Z" stroke="currentColor" stroke-width="1.8" />
        <path d="m5 7 7 5 7-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <span>Community submissions</span>
    </RouterLink>
  </nav>
</template>
