<template>
  <div class="view-skeleton" aria-busy="true" aria-label="Loading quiz builder">
    <section class="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
      <div class="space-y-6">
        <div class="skeleton-form-card skeleton-form-card--tall" />
        <div class="skeleton-panel overflow-hidden">
          <div class="skeleton-panel-header" />
          <div v-for="item in 3" :key="item" class="skeleton-row skeleton-row--question">
            <div class="skeleton-line skeleton-line--two-thirds" />
            <div class="mt-4 grid gap-3 sm:grid-cols-4">
              <div v-for="option in 4" :key="option" class="skeleton-option" />
            </div>
          </div>
        </div>
      </div>
      <aside class="space-y-4">
        <div class="skeleton-side-card skeleton-side-card--qr" />
        <div class="skeleton-side-card" />
        <div class="skeleton-side-card" />
      </aside>
    </section>
  </div>
</template>
