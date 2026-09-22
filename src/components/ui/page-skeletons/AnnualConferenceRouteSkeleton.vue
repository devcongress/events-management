<script setup lang="ts">
defineProps<{
  variant: 'overview' | 'work-plan' | 'volunteers' | 'speakers' | 'finance';
}>();
</script>

<template>
  <section class="view-skeleton" aria-busy="true" :aria-label="`Loading ${variant} workspace`">
    <template v-if="variant === 'overview'">
      <div class="skeleton-panel p-6 sm:p-8">
        <div class="flex flex-wrap justify-between gap-5">
          <div class="min-w-[14rem] flex-1">
            <div class="skeleton-eyebrow" />
            <div class="skeleton-title mt-4 w-2/3" />
          </div>
          <div class="skeleton-button" />
        </div>
        <div class="mt-8 grid gap-4 lg:grid-cols-[minmax(0,1fr)_14rem]">
          <div class="skeleton-form-card skeleton-form-card--tall" />
          <div class="skeleton-side-card" />
        </div>
      </div>
      <div class="mt-5 grid gap-4 lg:grid-cols-2">
        <div class="skeleton-panel h-52" />
        <div class="skeleton-panel h-52" />
      </div>
    </template>

    <template v-else-if="variant === 'work-plan'">
      <div class="skeleton-panel overflow-hidden">
        <div class="flex flex-wrap items-center justify-between gap-4 border-b border-dc-border p-5">
          <div class="min-w-[15rem] flex-1">
            <div class="skeleton-eyebrow" />
            <div class="skeleton-title mt-3 w-2/5" />
            <div class="skeleton-line skeleton-line--third mt-3" />
          </div>
          <div class="flex gap-3">
            <div class="skeleton-button" />
            <div class="skeleton-button skeleton-button--secondary" />
          </div>
        </div>
        <div class="p-4 lg:hidden">
          <div class="skeleton-table" :style="{ '--skeleton-rows': '5' }" />
        </div>
        <div class="hidden gap-3 p-4 lg:grid lg:grid-cols-4">
          <div v-for="column in 4" :key="column" class="skeleton-panel overflow-hidden">
            <div class="skeleton-panel-header" />
            <div class="grid gap-3 p-3">
              <div v-for="card in 2" :key="card" class="skeleton-form-card skeleton-form-card--compact" />
            </div>
          </div>
        </div>
      </div>
    </template>

    <template v-else-if="variant === 'volunteers'">
      <div class="skeleton-panel overflow-hidden">
        <div class="flex flex-wrap items-center justify-between gap-4 border-b border-dc-border p-5">
          <div>
            <div class="skeleton-eyebrow" />
            <div class="skeleton-title mt-3 w-44" />
          </div>
          <div class="skeleton-button" />
        </div>
        <div class="flex items-center justify-between gap-4 border-b border-dc-border bg-dc-paper-warm p-4">
          <div class="skeleton-form-card skeleton-form-card--compact w-80 max-w-full" />
          <div class="skeleton-line skeleton-line--short" />
        </div>
        <div class="skeleton-table rounded-none border-x-0 border-b-0" :style="{ '--skeleton-rows': '5' }" />
      </div>
    </template>

    <template v-else-if="variant === 'speakers'">
      <header class="skeleton-header">
        <div>
          <div class="skeleton-eyebrow" />
          <div class="skeleton-title mt-4 w-64" />
          <div class="skeleton-line skeleton-line--two-thirds mt-4" />
        </div>
        <div class="flex gap-3">
          <div class="skeleton-button" />
          <div class="skeleton-button skeleton-button--secondary" />
        </div>
      </header>
      <div class="skeleton-panel mt-5 p-4">
        <div class="skeleton-form-card skeleton-form-card--compact" />
      </div>
      <div class="skeleton-table mt-6" :style="{ '--skeleton-rows': '5' }" />
    </template>

    <template v-else>
      <header class="skeleton-header">
        <div>
          <div class="skeleton-eyebrow" />
          <div class="skeleton-title mt-4 w-64" />
          <div class="skeleton-line skeleton-line--two-thirds mt-4" />
        </div>
        <div class="flex gap-3">
          <div class="skeleton-button" />
          <div class="skeleton-button skeleton-button--secondary" />
        </div>
      </header>
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div v-for="card in 4" :key="card" class="skeleton-stat-card h-32" />
      </div>
      <div class="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div class="skeleton-table" :style="{ '--skeleton-rows': '5' }" />
        <div class="skeleton-side-card" />
      </div>
    </template>
  </section>
</template>
