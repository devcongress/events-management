<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query';
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import type { ComponentPublicInstance } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { adminPath } from '@/src/admin-routes';
import { isSystemDesignWorkspaceDisabled } from '@/lib/event-checklist-policy';
import { resolveEventSeriesType } from '@/lib/event-series';
import { isSystemDesignSessionItem } from '@/lib/system-design';
import { fetchAdminSession, fetchEventById, fetchEventChecklist, queryKeys } from '@/src/lib/api';

const props = defineProps<{
  eventId: string;
}>();

type AdminEventTab = {
  href: string;
  label: string;
  disabled?: boolean;
  disabledReason?: string;
};

const route = useRoute();
const tabsTrack = ref<HTMLElement | null>(null);
const tabElements = ref<HTMLElement[]>([]);
const indicator = ref({ left: 0, width: 0, ready: false });

const quarterlyTabs: AdminEventTab[] = [
  { href: '', label: 'Overview' },
  { href: 'registrations', label: 'Registration' },
  { href: 'feedback', label: 'Feedback' },
];
const eventQuery = useQuery({
  queryKey: queryKeys.event(props.eventId),
  queryFn: () => fetchEventById(props.eventId),
  enabled: Boolean(props.eventId),
});
const checklistQuery = useQuery({
  queryKey: queryKeys.eventChecklist(props.eventId),
  queryFn: () => fetchEventChecklist(props.eventId),
  enabled: Boolean(props.eventId),
});
const adminSessionQuery = useQuery({
  queryKey: queryKeys.adminSession,
  queryFn: fetchAdminSession,
});
const isQuarterlyEvent = computed(() => eventQuery.data.value ? resolveEventSeriesType(eventQuery.data.value) === 'quarterly' : false);
const isMonthlyEvent = computed(() => eventQuery.data.value ? resolveEventSeriesType(eventQuery.data.value) === 'monthly' : false);
const canViewMonthlyFinance = computed(() => {
  const role = adminSessionQuery.data.value?.user?.role;
  return role === 'owner' || role === 'organizer';
});
const hasSavedSystemDesignSource = computed(() => (
  eventQuery.data.value?.schedule?.some((item) => (
    isSystemDesignSessionItem(item)
    && item.resources.some((resource) => Boolean(resource.url?.trim()))
  )) ?? false
));
const systemDesignDisabled = computed(() => isSystemDesignWorkspaceDisabled(
  checklistQuery.data.value?.items ?? [],
  hasSavedSystemDesignSource.value,
));
const fullTabs = computed<AdminEventTab[]>(() => [
  { href: '', label: 'Overview' },
  { href: 'registrations', label: 'Registration' },
  { href: 'talks', label: 'Archive' },
  { href: 'quiz', label: 'Quiz', disabled: true, disabledReason: 'Quiz is unavailable for this event.' },
  {
    href: 'system-design',
    label: 'System Design',
    disabled: systemDesignDisabled.value,
    disabledReason: systemDesignDisabled.value ? 'No system design session this month.' : undefined,
  },
  { href: 'feedback', label: 'Feedback' },
  { href: 'attendance', label: 'Attendance' },
  ...(isMonthlyEvent.value && canViewMonthlyFinance.value ? [{ href: 'finance', label: 'Finance' }] : []),
]);
const tabs = computed<AdminEventTab[]>(() => (isQuarterlyEvent.value ? quarterlyTabs : fullTabs.value));

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

function tabElementRef(index: number) {
  return (element: Element | ComponentPublicInstance | null) => setTabElement(element, index);
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
    <div ref="tabsTrack" class="admin-event-tabs-track flex min-w-max gap-2 border-b-2 border-dc-border pb-3 font-mono text-xs font-semibold uppercase tracking-wide">
      <span class="admin-event-tabs-indicator" :style="indicatorStyle" aria-hidden="true" />
      <component
        v-for="(tab, index) in tabs"
        :key="tab.href"
        :is="tab.disabled ? 'span' : RouterLink"
        :ref="tabElementRef(index)"
        :to="tab.disabled ? undefined : tabTo(tab.href)"
        class="admin-event-tab motion-press"
        :class="[
          tab.disabled
            ? 'admin-event-tab--disabled'
            : isActive(tab.href)
              ? 'text-dc-ink'
              : 'border-dc-border bg-dc-paper text-dc-gray hover:border-dc-ink hover:bg-dc-paper-warm hover:text-dc-ink',
        ]"
        :aria-current="!tab.disabled && isActive(tab.href) ? 'page' : undefined"
        :aria-disabled="tab.disabled ? 'true' : undefined"
        :title="tab.disabledReason"
      >
        <span>{{ tab.label }}</span>
      </component>
    </div>
  </nav>
</template>
