<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { RouterLink, type RouteLocationRaw } from 'vue-router';

const props = defineProps<{
  active: string;
  label: string;
  items: Array<{ key: string; label: string; to: RouteLocationRaw; icon?: string }>;
}>();
const navigation = ref<HTMLElement | null>(null);
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
  if (typeof ResizeObserver !== 'undefined' && navigation.value) {
    resizeObserver = new ResizeObserver(() => { void revealActiveLink(); });
    resizeObserver.observe(navigation.value);
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
  <nav class="workspace-section-nav registration-workspace-tabs" :aria-label="label">
    <div ref="navigation" class="workspace-section-nav__viewport" @scroll.passive="updateOverflow">
      <RouterLink
        v-for="item in items"
        :key="item.key"
        :to="item.to"
        class="workspace-section-nav__link registration-workspace-tab"
        :aria-current-value="active === item.key ? 'page' : 'false'"
        :aria-current="active === item.key ? 'page' : 'false'"
      >
        <slot name="icon" :item="item" />
        <span>{{ item.label }}</span>
      </RouterLink>
    </div>
    <span v-if="hasMoreSections" class="workspace-section-nav__more" aria-hidden="true">
      <svg viewBox="0 0 16 16" fill="none"><path d="m6 4 4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
    </span>
  </nav>
</template>

<style scoped>
.workspace-section-nav {
  position: relative;
  min-width: 0;
  border-bottom: 1px solid var(--dc-border, #d6d2c8);
  padding: 0 0.125rem;
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

.workspace-section-nav__link {
  display: inline-flex;
  min-width: 44px;
  min-height: 46px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  border-bottom: 2px solid transparent;
  color: var(--dc-gray, #6f6c65);
  font-size: 0.8125rem;
  font-weight: var(--font-weight-label);
  text-decoration: none;
  transition: transform 100ms cubic-bezier(0.4, 0, 0.2, 1);
}

.workspace-section-nav__link[aria-current='page'] {
  border-bottom-color: var(--dc-pink, #e8117f);
  color: var(--dc-ink, #111111);
}

.workspace-section-nav__link:focus-visible {
  border-radius: 6px;
  outline: 2px solid var(--dc-pink, #e8117f);
  outline-offset: -2px;
}

.workspace-section-nav__link:active {
  transform: scale(0.97);
}

@media (prefers-reduced-motion: reduce) {
  .workspace-section-nav__link {
    transition: none;
  }

  .workspace-section-nav__link:active {
    transform: none;
  }
}
</style>
