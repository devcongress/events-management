<script setup lang="ts">
import { useQueryClient } from '@tanstack/vue-query';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import {
  readOrganizerBreadcrumbLabels,
  resolveOrganizerBreadcrumbs,
  type OrganizerBreadcrumbRole,
} from '@/src/organizer-breadcrumbs';

const props = withDefaults(defineProps<{
  role: OrganizerBreadcrumbRole;
  embedded?: boolean;
  phone?: boolean;
  localTrail?: string[];
}>(), {
  embedded: false,
  phone: false,
});
const emit = defineEmits<{ navigate: [index: number] }>();
const route = useRoute();
const client = useQueryClient();
const cacheRevision = ref(0);
const breadcrumbElement = ref<HTMLElement | null>(null);
const reportEventTrail = computed(() => Boolean(route.params.eventId && (route.query.from === 'attendance' || route.query.from === 'feedback')));
let breadcrumbResizeObserver: ResizeObserver | undefined;
let scrollContainer: HTMLElement | null = null;

watch(breadcrumbElement, (element) => {
  breadcrumbResizeObserver?.disconnect();
  scrollContainer?.style.removeProperty('--organizer-breadcrumb-height');
  scrollContainer = props.embedded ? null : element?.closest<HTMLElement>('.app-main') ?? null;

  if (!element || props.embedded || !scrollContainer) return;

  const measure = () => {
    scrollContainer?.style.setProperty('--organizer-breadcrumb-height', `${element.getBoundingClientRect().height}px`);
  };

  measure();
  breadcrumbResizeObserver = new ResizeObserver(measure);
  breadcrumbResizeObserver.observe(element);
}, { flush: 'post' });
let unsubscribe: (() => void) | undefined;
const labels = computed(() => {
  void cacheRevision.value;

  return readOrganizerBreadcrumbLabels(route, key => client.getQueryData(key));
});
const breadcrumbs = computed(() => props.localTrail
  ? props.localTrail.map((label, index) => ({ label, action: index < props.localTrail!.length - 1 }))
  : resolveOrganizerBreadcrumbs({
  name: route.name,
  params: route.params,
  query: route.query,
  role: props.role,
  phone: props.phone,
  labels: labels.value,
}));

onMounted(() => {
  unsubscribe = client.getQueryCache().subscribe(event => {
    if (['events', 'event-registrations', 'annual-conference-work-plan', 'annual-conference-editions'].includes(String(event.query.queryKey[0]))) {
      cacheRevision.value += 1;
    }
  });
});

onUnmounted(() => {
  unsubscribe?.();
  breadcrumbResizeObserver?.disconnect();
  scrollContainer?.style.removeProperty('--organizer-breadcrumb-height');
});
</script>

<template>
  <nav
    v-if="breadcrumbs.length"
    ref="breadcrumbElement"
    class="organizer-breadcrumbs"
    :class="{ 'organizer-breadcrumbs--embedded': embedded, 'organizer-breadcrumbs--report-event': reportEventTrail, 'organizer-breadcrumbs--phone': phone }"
    aria-label="Breadcrumb"
  >
    <ol>
      <li
        v-for="(breadcrumb, index) in breadcrumbs"
        :key="index"
        :class="{ 'organizer-breadcrumbs__earlier': index < breadcrumbs.length - (reportEventTrail ? 3 : 2) }"
      >
        <svg v-if="index > 0" class="organizer-breadcrumbs__separator" viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" /></svg>
        <button v-if="'action' in breadcrumb && breadcrumb.action" type="button" @click="emit('navigate', index)"><span class="organizer-breadcrumbs__link-label">{{ breadcrumb.label }}</span></button>
        <RouterLink v-else-if="'to' in breadcrumb && breadcrumb.to && index < breadcrumbs.length - 1" :to="breadcrumb.to" :title="breadcrumb.label" aria-current-value="false"><span class="organizer-breadcrumbs__link-label">{{ breadcrumb.label }}</span></RouterLink>
        <span v-else :aria-current="index === breadcrumbs.length - 1 ? 'page' : undefined" :title="breadcrumb.label">{{ breadcrumb.label }}</span>
      </li>
    </ol>
  </nav>
</template>

<style scoped src="./organizer-breadcrumbs.css" />
