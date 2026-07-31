<script setup lang="ts">
import { onUnmounted, ref, useId, watch } from 'vue';
import { searchGhanaVenues, type GhanaVenueSuggestion } from '@/src/lib/api';

const props = defineProps<{
  modelValue: string;
  placeId: string;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
  'update:placeId': [value: string];
}>();

const inputId = 'ghana-venue-' + useId();
const inputValue = ref(props.modelValue);
const suggestions = ref<GhanaVenueSuggestion[]>([]);
const loading = ref(false);
const open = ref(false);
const error = ref('');
const activeIndex = ref(-1);
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let searchController: AbortController | null = null;

watch(() => props.modelValue, (value) => {
  if (value !== inputValue.value) inputValue.value = value;
});

function clearPendingSearch() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = null;
  searchController?.abort();
  searchController = null;
}

onUnmounted(clearPendingSearch);

async function runSearch() {
  const query = inputValue.value.trim();
  if (query.length < 2) {
    suggestions.value = [];
    open.value = false;
    error.value = '';
    return;
  }

  searchController?.abort();
  const controller = new AbortController();
  searchController = controller;
  loading.value = true;
  error.value = '';

  try {
    const response = await searchGhanaVenues(query, controller.signal);
    if (controller.signal.aborted) return;
    suggestions.value = response.venues;
    activeIndex.value = response.venues.length ? 0 : -1;
    open.value = true;
  } catch (searchError) {
    if (controller.signal.aborted) return;
    suggestions.value = [];
    open.value = true;
    error.value = searchError instanceof Error ? searchError.message : 'Venue search is unavailable.';
  } finally {
    if (searchController === controller) {
      loading.value = false;
      searchController = null;
    }
  }
}

function scheduleSearch() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(runSearch, 250);
}

function handleInput(event: Event) {
  const value = (event.target as HTMLInputElement).value;
  inputValue.value = value;
  emit('update:modelValue', value);
  emit('update:placeId', '');
  scheduleSearch();
}

function selectVenue(venue: GhanaVenueSuggestion) {
  clearPendingSearch();
  inputValue.value = venue.label;
  emit('update:modelValue', venue.label);
  emit('update:placeId', venue.placeId);
  suggestions.value = [];
  error.value = '';
  open.value = false;
  activeIndex.value = -1;
}

function handleKeydown(event: KeyboardEvent) {
  if (!open.value || !suggestions.value.length) {
    if (event.key === 'ArrowDown' && inputValue.value.trim().length >= 2) {
      event.preventDefault();
      void runSearch();
    }
    return;
  }

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    activeIndex.value = (activeIndex.value + 1) % suggestions.value.length;
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    activeIndex.value = (activeIndex.value - 1 + suggestions.value.length) % suggestions.value.length;
  } else if (event.key === 'Enter' && activeIndex.value >= 0) {
    event.preventDefault();
    const venue = suggestions.value[activeIndex.value];
    if (venue) selectVenue(venue);
  } else if (event.key === 'Escape') {
    event.preventDefault();
    open.value = false;
  }
}

function handleFocus() {
  if (!props.placeId && inputValue.value.trim().length >= 2) void runSearch();
}

function handleBlur() {
  window.setTimeout(() => {
    open.value = false;
  }, 120);
}
</script>

<template>
  <div class="relative z-20">
    <label :for="inputId" class="editorial-label">Venue name <span class="text-red-600">*</span></label>
    <div class="relative mt-2">
      <input
        :id="inputId"
        :value="inputValue"
        type="search"
        class="editorial-input pr-12"
        role="combobox"
        autocomplete="off"
        placeholder="Start typing a Ghana venue"
        required
        :disabled="disabled"
        :aria-expanded="open"
        :aria-controls="inputId + '-listbox'"
        :aria-activedescendant="activeIndex >= 0 ? inputId + '-option-' + activeIndex : undefined"
        :aria-busy="loading"
        aria-autocomplete="list"
        @input="handleInput"
        @keydown="handleKeydown"
        @focus="handleFocus"
        @blur="handleBlur"
      >
      <span v-if="loading" class="absolute inset-y-0 right-4 grid place-items-center font-mono text-xs font-semibold uppercase text-dc-gray" aria-hidden="true">
        ···
      </span>
      <span v-else-if="placeId" class="absolute inset-y-0 right-4 grid place-items-center text-green-700" aria-label="Verified Ghana venue">
        <svg viewBox="0 0 20 20" class="size-5" fill="none" aria-hidden="true">
          <path d="m4 10.5 3.4 3.4L16 5.8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </span>
    </div>

    <div
      v-if="open"
      :id="inputId + '-listbox'"
      class="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 overflow-hidden rounded-md border border-dc-border bg-white shadow-[0_18px_36px_rgba(17,17,17,0.14)]"
      role="listbox"
    >
      <div v-if="error" class="px-4 py-3 text-sm leading-6 text-red-700" role="status">{{ error }}</div>
      <div v-else-if="!loading && !suggestions.length" class="px-4 py-3 text-sm leading-6 text-dc-gray" role="status">
        No matching Ghana venues found. Try a fuller venue or neighbourhood name.
      </div>
      <button
        v-for="(venue, index) in suggestions"
        :id="inputId + '-option-' + index"
        :key="venue.placeId"
        type="button"
        class="flex w-full items-start gap-3 border-b border-dc-border px-4 py-3 text-left last:border-b-0"
        :class="index === activeIndex ? 'bg-dc-paper-warm' : 'bg-white hover:bg-dc-paper-warm'"
        role="option"
        :aria-selected="index === activeIndex"
        @pointerdown.prevent="selectVenue(venue)"
        @mouseenter="activeIndex = index"
      >
        <span class="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md border border-dc-ink bg-dc-yellow text-dc-ink" aria-hidden="true">
          <svg viewBox="0 0 20 20" class="size-4" fill="none">
            <path d="M10 17s5-4.7 5-9a5 5 0 1 0-10 0c0 4.3 5 9 5 9Z" stroke="currentColor" stroke-width="1.8" />
            <circle cx="10" cy="8" r="1.7" fill="currentColor" />
          </svg>
        </span>
        <span class="min-w-0 flex-1">
          <span class="block truncate text-sm font-bold text-dc-ink">{{ venue.name }}</span>
          <span v-if="venue.address" class="mt-0.5 block truncate text-xs text-dc-gray">{{ venue.address }}</span>
        </span>
      </button>
      <div class="flex justify-end border-t border-dc-border bg-dc-paper-warm px-3 py-2">
        <img src="https://maps.gstatic.com/mapfiles/api-3/images/powered-by-google-on-white3.png" alt="Powered by Google" class="h-[14px] w-auto">
      </div>
    </div>

    <p class="mt-2 text-xs leading-5 text-dc-gray">
      Select a result from Google Places. Results are restricted to Ghana.
    </p>
  </div>
</template>
