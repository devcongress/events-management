<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { RouterLink, useRouter, type RouteLocationRaw } from 'vue-router';
import MobileSectionPicker from '@/src/components/MobileSectionPicker.vue';

const props = defineProps<{
  active: string;
  label: string;
  items: Array<{ key: string; label: string; to: RouteLocationRaw; icon?: string; disabled?: boolean }>;
}>();
const router = useRouter();
const container = ref<HTMLElement | null>(null);
const measurement = ref<HTMLElement | null>(null);
const navigation = ref<HTMLElement | null>(null);
const phone = ref(false);
const overflows = ref(false);
const usePicker = computed(() => phone.value && (props.items.length > 3 || overflows.value));
const pickerOptions = computed(() => props.items.map(item => ({ value: item.key, label: item.label, disabled: item.disabled })));

function selectSection(key: string) {
  const item = props.items.find(candidate => candidate.key === key);

  if (item && !item.disabled && item.key !== props.active) void router.push(item.to);
}

function measureSections() {
  phone.value = window.matchMedia('(max-width: 767px)').matches;
  if (container.value && measurement.value) {
    if (navigation.value) measurement.value.style.gap = getComputedStyle(navigation.value).columnGap;
    overflows.value = measurement.value.scrollWidth > container.value.clientWidth + 1;
  }
}
const hasMoreSections = ref(false);
let resizeObserver: ResizeObserver | null = null;
let disposed = false;

function updateOverflow() {
  const viewport = navigation.value;

  hasMoreSections.value = Boolean(viewport && viewport.scrollLeft + viewport.clientWidth < viewport.scrollWidth - 1);
}

async function revealActiveLink() {
  await nextTick();
  if (disposed) return;
  measureSections();
  updateOverflow();
  const viewport = navigation.value;
  const active = viewport?.querySelector<HTMLElement>('[aria-current="page"]');

  if (!viewport || !active) return;

  const bounds = viewport.getBoundingClientRect();
  const selected = active.getBoundingClientRect();
  const availableRight = bounds.right - (hasMoreSections.value ? 24 : 0);
  const left = selected.left < bounds.left
    ? selected.left - bounds.left
    : selected.right > availableRight ? selected.right - availableRight : 0;

  if (left) viewport.scrollBy({ left, behavior: 'auto' });
  updateOverflow();
}

onMounted(() => {
  void revealActiveLink();
  if (typeof ResizeObserver !== 'undefined' && container.value) {
    resizeObserver = new ResizeObserver(() => { void revealActiveLink(); });
    resizeObserver.observe(container.value);
    if (measurement.value) resizeObserver.observe(measurement.value);
  }
  window.addEventListener('resize', revealActiveLink);
  void document.fonts?.ready.then(revealActiveLink);
});

onUnmounted(() => {
  disposed = true;
  resizeObserver?.disconnect();
  window.removeEventListener('resize', revealActiveLink);
});

watch([() => props.active, () => props.items], revealActiveLink);
</script>

<template>
  <nav ref="container" class="workspace-section-nav registration-workspace-tabs" :class="{ 'underline-section-nav': !usePicker, 'workspace-section-nav--picker': usePicker }" :aria-label="label">
    <div class="workspace-section-nav__measurement-clip" aria-hidden="true" inert>
      <div ref="measurement" class="workspace-section-nav__measurement">
        <span v-for="item in items" :key="item.key" class="workspace-section-nav__link underline-section-tab">
          <span class="underline-section-tab__content">
            <slot name="icon" :item="item" />
            <span>{{ item.label }}</span>
          </span>
        </span>
      </div>
    </div>
    <MobileSectionPicker v-if="usePicker" :model-value="active" :label="label" :options="pickerOptions" @update:model-value="selectSection" />
    <div v-else ref="navigation" class="workspace-section-nav__viewport underline-section-nav__viewport" @scroll.passive="updateOverflow">
      <RouterLink
        v-for="item in items"
        :key="item.key"
        :to="item.to"
        class="workspace-section-nav__link underline-section-tab"
        :aria-current-value="active === item.key ? 'page' : 'false'"
        :aria-current="active === item.key ? 'page' : 'false'"
      >
        <span class="underline-section-tab__content">
          <slot name="icon" :item="item" />
          <span>{{ item.label }}</span>
        </span>
      </RouterLink>
    </div>
    <span v-if="!usePicker && hasMoreSections" class="workspace-section-nav__more" aria-hidden="true">
      <svg viewBox="0 0 16 16" fill="none"><path d="m6 4 4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
    </span>
  </nav>
</template>

<style scoped src="@/src/styles/underline-section-nav.css"></style>

<style scoped>
.workspace-section-nav {
  position: relative;
  min-width: 0;
  padding: 0 0.125rem;
}

.workspace-section-nav.workspace-section-nav--picker {
  display: block;
}

.workspace-section-nav__measurement-clip {
  position: absolute;
  width: 0;
  height: 0;
  overflow: hidden;
  visibility: hidden;
  pointer-events: none;
}

.workspace-section-nav__measurement {
  position: absolute;
  top: 0;
  left: 0;
  display: flex;
  width: max-content;
  gap: 1.5rem;
  visibility: hidden;
  pointer-events: none;
}

.workspace-section-nav__viewport {
  display: flex;
  width: 100%;
  min-width: 0;
  gap: 1.5rem;
  overflow-x: auto;
  scrollbar-width: none;
}

.workspace-section-nav__viewport::-webkit-scrollbar {
  display: none;
}

.workspace-section-nav__more {
  position: absolute;
  inset: 0 0 1px auto;
  display: flex;
  width: 24px;
  align-items: center;
  justify-content: flex-end;
  border-left: 1px solid var(--dc-border, #d6d2c8);
  background: var(--dc-cream, #f5f2e8);
  color: var(--dc-gray, #6f6c65);
  pointer-events: none;
}

.workspace-section-nav__more svg {
  width: 16px;
  height: 16px;
}
</style>
