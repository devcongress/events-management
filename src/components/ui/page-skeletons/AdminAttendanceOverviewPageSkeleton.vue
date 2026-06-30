<template>
  <div class="view-skeleton" aria-busy="true" aria-label="Loading attendance overview">
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
    <section class="mb-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(19rem,0.42fr)]">
      <div class="skeleton-panel overflow-hidden">
        <div class="grid gap-0 divide-y divide-dc-border md:grid-cols-2 md:divide-x md:divide-y-0">
          <div v-for="item in 2" :key="item" class="p-5">
            <div class="skeleton-line skeleton-line--third" />
            <div class="skeleton-title mt-4" />
            <div class="skeleton-line mt-4" />
          </div>
        </div>
      </div>
      <div class="skeleton-side-card" />
    </section>
    <section class="skeleton-panel overflow-hidden">
      <div class="border-b border-dc-border p-5">
        <div class="skeleton-title" />
        <div class="mt-4 flex flex-wrap gap-2">
          <div v-for="item in 5" :key="item" class="skeleton-chip !mb-0" />
        </div>
      </div>
      <div class="skeleton-table" :style="{ '--skeleton-rows': '4' }" />
    </section>
  </div>
</template>
