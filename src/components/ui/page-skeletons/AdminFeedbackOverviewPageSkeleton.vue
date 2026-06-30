<template>
  <div class="view-skeleton" aria-busy="true" aria-label="Loading feedback overview">
    <header class="skeleton-header">
      <div>
        <div class="skeleton-eyebrow" />
        <div class="skeleton-title" />
        <div class="mt-4 max-w-2xl space-y-3">
          <div class="skeleton-line" />
          <div class="skeleton-line skeleton-line--two-thirds" />
        </div>
      </div>
      <div class="skeleton-button" />
    </header>
    <section class="skeleton-panel overflow-hidden">
      <div class="h-24 bg-dc-yellow/65" />
      <div class="p-5">
        <div class="grid grid-cols-4 gap-2">
          <div v-for="item in 4" :key="item" class="skeleton-stat-card" />
        </div>
      </div>
      <div class="divide-y divide-dc-border">
        <div v-for="item in 2" :key="item" class="skeleton-row skeleton-row--action">
          <div class="flex-1 space-y-3">
            <div class="skeleton-line skeleton-line--half" />
            <div class="skeleton-line" />
            <div class="skeleton-line skeleton-line--two-thirds" />
          </div>
          <div class="flex flex-wrap gap-2">
            <div v-for="action in 3" :key="action" class="skeleton-button skeleton-button--secondary" />
          </div>
        </div>
      </div>
    </section>
    <section class="mt-8 space-y-6">
      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div v-for="item in 4" :key="item" class="skeleton-stat-card" />
      </div>
      <div class="skeleton-table" :style="{ '--skeleton-rows': '3' }" />
    </section>
  </div>
</template>
