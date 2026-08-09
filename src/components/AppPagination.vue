<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{
  page: number;
  pageCount: number;
  total: number;
  rangeStart: number;
  rangeEnd: number;
  itemLabel?: string;
  ariaLabel?: string;
}>(), {
  itemLabel: 'items',
  ariaLabel: 'Pagination',
});

const emit = defineEmits<{
  'update:page': [page: number];
}>();

const pageCount = computed(() => Math.max(1, props.pageCount));
const currentPage = computed(() => Math.min(pageCount.value, Math.max(1, props.page)));
const summary = computed(() => `Showing ${props.rangeStart}-${props.rangeEnd} of ${props.total} ${props.itemLabel}`);

function goToPage(nextPage: number) {
  emit('update:page', Math.min(pageCount.value, Math.max(1, nextPage)));
}
</script>

<template>
  <nav
    v-if="pageCount > 1"
    class="app-pagination"
    :aria-label="ariaLabel"
  >
    <p class="sr-only" aria-live="polite">{{ summary }}</p>
    <button
      type="button"
      class="app-pagination__button motion-press justify-self-start"
      :disabled="currentPage === 1"
      aria-label="Previous page"
      @click="goToPage(currentPage - 1)"
    >
      <span aria-hidden="true">‹</span>
      Previous
    </button>
    <span class="app-pagination__count" aria-live="polite">Page {{ currentPage }} of {{ pageCount }}</span>
    <button
      type="button"
      class="app-pagination__button motion-press justify-self-end"
      :disabled="currentPage === pageCount"
      aria-label="Next page"
      @click="goToPage(currentPage + 1)"
    >
      Next
      <span aria-hidden="true">›</span>
    </button>
  </nav>
</template>
