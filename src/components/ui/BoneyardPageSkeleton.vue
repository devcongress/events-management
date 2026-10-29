<script setup lang="ts">
import Skeleton from "boneyard-js/vue";
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { getSkeletonSection } from '@/src/boneyard/sections';
import "@/src/bones/registry";
import BoneyardPageSkeletonFixture from "./BoneyardPageSkeletonFixture.vue";

type SkeletonLayout =
  | "cards"
  | "dashboard"
  | "detail"
  | "learning-room"
  | "form"
  | "list"
  | "mobile-actions"
  | "mobile-blasts"
  | "mobile-check-in"
  | "mobile-conference"
  | "mobile-event"
  | "mobile-events"
  | "registration"
  | "submissions"
  | "form-board"
  | "table"
  | "volunteer-follow-up"
  | "workspace";

const props = withDefaults(
  defineProps<{
    label: string;
    fixtureCount?: number;
    layout?: SkeletonLayout;
    name: string;
    showHeader?: boolean;
    previewMaxHeight?: string;
  }>(),
  {
    layout: "workspace",
    showHeader: true,
    fixtureCount: 3,
  },
);

const region = ref<HTMLElement | null>(null);
const top = ref(0);
const bottomSpace = ref(24);
const viewport = ref(0);
let observer: ResizeObserver | undefined;
const section = computed(() => getSkeletonSection(props.name));
const bounded = computed(() => ['page', 'phone', 'standalone'].includes(section.value?.capture.context ?? 'page'));
const viewportBand = computed(() => [390, 640, 768, 960, 1024, 1280].filter((width) => width <= viewport.value).at(-1) ?? 390);

function measureViewport() {
  if (typeof window === 'undefined') return;

  top.value = Math.max(0, region.value?.getBoundingClientRect().top ?? 0);
  viewport.value = window.innerWidth;

  let ancestor = region.value?.parentElement;
  let trailingSpace = 24;

  while (ancestor && ancestor !== document.body) {
    const style = window.getComputedStyle(ancestor);

    trailingSpace += (parseFloat(style.paddingBottom) || 0) + (parseFloat(style.marginBottom) || 0);

    if (style.overflowY === 'auto' || style.overflowY === 'scroll') break;

    ancestor = ancestor.parentElement;
  }

  bottomSpace.value = trailingSpace;
}

onMounted(() => {
  if (typeof window === 'undefined') return;

  measureViewport();
  window.addEventListener('resize', measureViewport);

  if (typeof ResizeObserver !== 'undefined' && region.value?.parentElement) {
    observer = new ResizeObserver(measureViewport);
    observer.observe(region.value.parentElement);
  }
});

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') window.removeEventListener('resize', measureViewport);

  observer?.disconnect();
});
</script>

<template>
  <section
    ref="region"
    class="ems-loading-region"
    :class="{ 'ems-loading-region--bounded': bounded || previewMaxHeight }"
    :style="{
      '--loading-top': `${top}px`,
      '--loading-bottom': `${bottomSpace}px`,
      '--loading-preview-height': previewMaxHeight,
    }"
    :data-loading-section="name"
    role="status"
    aria-busy="true"
    :aria-label="`Loading ${label}`"
  >
    <Skeleton
      :key="`${name}-${viewportBand}`"
      :loading="true"
      :name="name"
      animate="pulse"
      color="rgba(22, 22, 22, 0.09)"
      dark-color="rgba(229, 229, 229, 0.12)"
      class="ems-loading-measured"
    >
      <template #fixture>
        <BoneyardPageSkeletonFixture :name="name" :label="label" />
      </template>

      <BoneyardPageSkeletonFixture :name="name" :label="label" />

      <template #fallback>
        <div class="ems-loading-fallback"><BoneyardPageSkeletonFixture :name="name" :label="label" /></div>
      </template>
    </Skeleton>
  </section>
</template>

<style scoped>
.ems-loading-region {
  min-width: 0;
  width: 100%;
  overflow: hidden;
  pointer-events: none;
}

.ems-loading-region--bounded {
  --loading-preview-height: max(0px, calc(100svh - var(--loading-top, 100px) - var(--loading-bottom, 24px)));
  max-height: var(--loading-preview-height);
  mask-image: linear-gradient(to bottom, #000 calc(var(--loading-preview-height) - 24px), transparent var(--loading-preview-height));
}

.ems-loading-measured {
  min-width: 0;
  width: 100%;
}

.ems-loading-fallback {
  color: transparent;
  opacity: 0.5;
}

.ems-loading-fallback :deep(*) {
  color: transparent !important;
  text-shadow: none !important;
}

.ems-loading-fallback :deep(:is(h1, h2, h3, h4, h5, h6, p, span, strong, small)) {
  background: rgba(128, 128, 128, 0.15);
  border-radius: 6px;
}

.ems-loading-fallback :deep(input)::placeholder,
.ems-loading-fallback :deep(textarea)::placeholder {
  color: transparent;
}

.ems-loading-fallback :deep(:is(svg, img)) {
  visibility: hidden;
}

@media (prefers-reduced-motion: reduce) {
  .ems-loading-region :deep([data-boneyard-bone] > div) {
    animation: none !important;
  }
}
</style>
