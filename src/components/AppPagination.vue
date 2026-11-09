<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{
  page: number;
  pageCount?: number;
  hasNext?: boolean;
  disabled?: boolean;
  total?: number;
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

const pageCount = computed(() => props.pageCount === undefined ? undefined : Math.max(1, props.pageCount));
const currentPage = computed(() => pageCount.value === undefined ? Math.max(1, props.page) : Math.min(pageCount.value, Math.max(1, props.page)));
const canGoNext = computed(() => pageCount.value === undefined ? Boolean(props.hasNext) : currentPage.value < pageCount.value);
const summary = computed(() => props.total === undefined
  ? `Showing ${props.rangeStart}-${props.rangeEnd} ${props.itemLabel}`
  : `Showing ${props.rangeStart}-${props.rangeEnd} of ${props.total} ${props.itemLabel}`);

function goToPage(nextPage: number) {
  if (props.disabled) return;

  if (nextPage > currentPage.value && !canGoNext.value) return;

  emit('update:page', pageCount.value === undefined ? Math.max(1, nextPage) : Math.min(pageCount.value, Math.max(1, nextPage)));
}
</script>

<template>
  <nav
    v-if="pageCount === undefined ? currentPage > 1 || canGoNext : pageCount > 1"
    class="app-pagination"
    :aria-label="ariaLabel"
  >
    <p class="sr-only" aria-live="polite">{{ summary }}</p>
    <button
      type="button"
      class="app-pagination__button motion-press justify-self-start"
      :disabled="disabled || currentPage === 1"
      aria-label="Previous page"
      @click="goToPage(currentPage - 1)"
    >
      <span aria-hidden="true">‹</span>
      Previous
    </button>
    <span class="app-pagination__count" aria-live="polite">Page {{ currentPage }}<template v-if="pageCount !== undefined"> of {{ pageCount }}</template></span>
    <button
      type="button"
      class="app-pagination__button motion-press justify-self-end"
      :disabled="disabled || !canGoNext"
      aria-label="Next page"
      @click="goToPage(currentPage + 1)"
    >
      Next
      <span aria-hidden="true">›</span>
    </button>
  </nav>
</template>
