<template>
  <div class="view-skeleton" aria-busy="true" aria-label="Loading event overview">
    <section class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.46fr)] xl:items-start">
      <div>
        <div class="mb-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(16rem,22rem)] sm:items-end">
          <div class="space-y-3">
            <div class="skeleton-eyebrow" />
            <div class="skeleton-line skeleton-line--heading" />
          </div>
          <div class="space-y-2">
            <div class="skeleton-line" />
            <div class="skeleton-line skeleton-line--two-thirds" />
          </div>
        </div>
        <div class="skeleton-panel overflow-hidden">
          <div v-for="item in 5" :key="item" class="skeleton-row skeleton-row--program">
            <div class="space-y-3">
              <div class="skeleton-line skeleton-line--half" />
              <div class="skeleton-line skeleton-line--two-thirds" />
            </div>
            <div class="skeleton-number-pair" />
          </div>
        </div>
      </div>
      <aside class="space-y-4 xl:mt-20">
        <div class="skeleton-panel overflow-hidden">
          <div class="skeleton-panel-header" />
          <div v-for="item in 4" :key="item" class="skeleton-row skeleton-row--action">
            <div class="skeleton-dot" />
            <div class="flex-1 space-y-3">
              <div class="skeleton-line skeleton-line--half" />
              <div class="skeleton-line" />
            </div>
          </div>
        </div>
        <div class="skeleton-side-card" />
        <div class="skeleton-side-card" />
      </aside>
    </section>
  </div>
</template>
