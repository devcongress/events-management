<template>
  <div class="view-skeleton" aria-busy="true" aria-label="Loading attendance readout">
    <header class="skeleton-header">
      <div>
        <div class="skeleton-eyebrow" />
        <div class="skeleton-title" />
        <div class="mt-4 max-w-2xl space-y-3">
          <div class="skeleton-line" />
          <div class="skeleton-line skeleton-line--two-thirds" />
        </div>
      </div>
      <div class="skeleton-side-card" />
    </header>
    <section class="space-y-6">
      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div v-for="item in 4" :key="item" class="skeleton-stat-card" />
      </div>
      <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div class="skeleton-table" :style="{ '--skeleton-rows': '5' }" />
        <div class="space-y-4">
          <div class="skeleton-side-card" />
          <div class="skeleton-side-card" />
        </div>
      </div>
    </section>
  </div>
</template>
