<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query';
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import type { ComponentPublicInstance } from 'vue';
import { useRoute } from 'vue-router';
import { adminPath } from '@/src/admin-routes';
import { fetchEventById, queryKeys } from '@/src/lib/api';
import { resolveEventSeriesType } from '@/lib/event-series';

const props = defineProps<{
  eventId: string;
}>();

type AdminEventTab = {
  href: string;
  label: string;
  disabled?: boolean;
};

const route = useRoute();
const tabsTrack = ref<HTMLElement | null>(null);
const tabElements = ref<HTMLElement[]>([]);
const indicator = ref({ left: 0, width: 0, ready: false });

const fullTabs: AdminEventTab[] = [
  { href: '', label: 'Overview' },
  { href: 'talks', label: 'Talks' },
  { href: 'speakers', label: 'Speakers', disabled: true },
  { href: 'quiz', label: 'Quiz', disabled: true },
  { href: 'system-design', label: 'System Design' },
  { href: 'feedback', label: 'Feedback' },
  { href: 'attendance', label: 'Attendance' },
];
const quarterlyTabs: AdminEventTab[] = [
  { href: '', label: 'Overview' },
  { href: 'feedback', label: 'Feedback' },
];
const eventQuery = useQuery({
  queryKey: queryKeys.event(props.eventId),
  queryFn: () => fetchEventById(props.eventId),
  enabled: Boolean(props.eventId),
});
const isQuarterlyEvent = computed(() => eventQuery.data.value ? resolveEventSeriesType(eventQuery.data.value) === 'quarterly' : false);
const tabs = computed<AdminEventTab[]>(() => (isQuarterlyEvent.value ? quarterlyTabs : fullTabs));

function tabPath(href: string) {
  return href ? adminPath(`events/${props.eventId}/${href}`) : adminPath(`events/${props.eventId}`);
}

function tabTo(href: string) {
  const from = route.query.from;
  const month = route.query.month;
  const path = tabPath(href);

  if (from === 'attendance' || from === 'feedback') {
    const query: { from: 'attendance' | 'feedback'; month?: string } = { from };
    if (from === 'feedback' && typeof month === 'string' && /^\d{4}-\d{2}$/.test(month)) {
      query.month = month;
    }
    return { path, query };
  }

  return path;
}

function isActive(href: string) {
  const path = tabPath(href);
  if (!href) return route.path === path;
  return route.path === path || route.path.startsWith(`${path}/`);
}

const activeIndex = computed(() => tabs.value.findIndex((tab) => !tab.disabled && isActive(tab.href)));
const indicatorStyle = computed(() => ({
  opacity: indicator.value.ready ? '1' : '0',
  transform: `translate3d(${indicator.value.left}px, 0, 0)`,
  width: `${indicator.value.width}px`,
}));

function setTabElement(element: Element | ComponentPublicInstance | null, index: number) {
  if (element instanceof HTMLElement) {
    tabElements.value[index] = element;
    return;
  }

  if (element && !(element instanceof Element)) {
    const componentElement = element.$el;
    if (componentElement instanceof HTMLElement) {
      tabElements.value[index] = componentElement;
    }
  }
}

function updateIndicator() {
  const index = activeIndex.value;
  const element = index >= 0 ? tabElements.value[index] : null;

  if (!element) {
    indicator.value = { left: 0, width: 0, ready: false };
    return;
  }

  indicator.value = {
    left: element.offsetLeft,
    width: element.offsetWidth,
    ready: true,
  };
}

onMounted(() => {
  void nextTick(updateIndicator);
  window.addEventListener('resize', updateIndicator);
});

onUnmounted(() => {
  window.removeEventListener('resize', updateIndicator);
});

watch(() => route.path, () => {
  void nextTick(updateIndicator);
});

watch(tabs, () => {
  tabElements.value = [];
  void nextTick(updateIndicator);
});
</script>

<template>
  <nav class="mb-5 overflow-x-auto">
    <div ref="tabsTrack" class="admin-event-tabs-track flex min-w-max gap-2 border-b-2 border-dc-border pb-3 font-mono text-xs font-bold uppercase tracking-wide">
      <span class="admin-event-tabs-indicator" :style="indicatorStyle" aria-hidden="true" />
      <RouterLink
        v-for="(tab, index) in tabs"
        :key="tab.href"
        :ref="(element) => setTabElement(element, index)"
        :to="tabTo(tab.href)"
        class="admin-event-tab motion-press"
        :class="[
          tab.disabled
            ? 'admin-event-tab--disabled'
            : isActive(tab.href)
              ? 'text-dc-ink'
              : 'border-dc-border bg-dc-paper text-dc-gray hover:border-dc-ink hover:bg-dc-paper-warm hover:text-dc-ink',
        ]"
        :aria-current="isActive(tab.href) ? 'page' : undefined"
        :aria-disabled="tab.disabled ? 'true' : undefined"
      >
        <span>{{ tab.label }}</span>
      </RouterLink>
    </div>
  </nav>
</template>
