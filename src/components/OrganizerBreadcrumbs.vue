<script setup lang="ts">
import { useQueryClient } from '@tanstack/vue-query';
import { computed, onMounted, onUnmounted, ref } from 'vue';
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
}>(), {
  embedded: false,
  phone: false,
});
const route = useRoute();
const client = useQueryClient();
const cacheRevision = ref(0);
let unsubscribe: (() => void) | undefined;
const labels = computed(() => {
  void cacheRevision.value;

  return readOrganizerBreadcrumbLabels(route, key => client.getQueryData(key));
});
const breadcrumbs = computed(() => resolveOrganizerBreadcrumbs({
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

onUnmounted(() => unsubscribe?.());
</script>

<template>
  <nav
    v-if="breadcrumbs.length"
    class="organizer-breadcrumbs"
    :class="{ 'organizer-breadcrumbs--embedded': embedded }"
    aria-label="Breadcrumb"
  >
    <ol>
      <li
        v-for="(breadcrumb, index) in breadcrumbs"
        :key="index"
        :class="{ 'organizer-breadcrumbs__earlier': index < breadcrumbs.length - 2 }"
      >
        <svg v-if="index > 0" class="organizer-breadcrumbs__separator" viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" /></svg>
        <RouterLink v-if="breadcrumb.to && index < breadcrumbs.length - 1" :to="breadcrumb.to" :title="breadcrumb.label" aria-current-value="false">{{ breadcrumb.label }}</RouterLink>
        <span v-else :aria-current="index === breadcrumbs.length - 1 ? 'page' : undefined" :title="breadcrumb.label">{{ breadcrumb.label }}</span>
      </li>
    </ol>
  </nav>
</template>

<style scoped src="./organizer-breadcrumbs.css" />
