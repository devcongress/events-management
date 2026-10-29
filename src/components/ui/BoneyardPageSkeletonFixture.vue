<script setup lang="ts">
import { computed } from 'vue';
import { getSkeletonSection } from '@/src/boneyard/sections';
import BoneyardSkeletonBlocks from './BoneyardSkeletonBlocks.vue';

const props = defineProps<{ name: string; label: string }>();
const section = computed(() => getSkeletonSection(props.name));
</script>

<template>
  <div
    v-if="section"
    class="ems-loading-fixture"
    :data-loading-fixture="name"
    :style="{ '--loading-gap': `${section.capture.gap ?? 24}px` }"
    aria-hidden="true"
    inert
  >
    <BoneyardSkeletonBlocks :blocks="section.blocks" />
  </div>
  <div v-else class="ems-loading-fixture" aria-hidden="true" inert>
    <h2>{{ label }}</h2>
    <div class="ems-loading-unavailable" />
  </div>
</template>

<style scoped>
.ems-loading-fixture {
  width: 100%;
  min-width: 0;
  font-family: var(--font-sans), system-ui, sans-serif;
  font-size: 16px;
  line-height: 1.5;
}

.ems-loading-unavailable {
  height: 80px;
  border: 1px solid currentColor;
  border-radius: 8px;
}
</style>
