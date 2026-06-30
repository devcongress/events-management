<template>
  <div class="view-skeleton" aria-busy="true" aria-label="Loading feedback campaign">
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
    <section class="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div class="space-y-6">
        <div class="skeleton-panel p-5">
          <div class="grid gap-4 md:grid-cols-2">
            <div class="skeleton-form-card skeleton-form-card--compact md:col-span-2" />
            <div class="skeleton-form-card skeleton-form-card--compact md:col-span-2" />
            <div class="skeleton-form-card skeleton-form-card--compact" />
            <div class="skeleton-form-card skeleton-form-card--compact" />
          </div>
        </div>
        <div v-for="item in 2" :key="item" class="skeleton-panel p-5">
          <div class="mb-4 flex items-center justify-between gap-3">
            <div class="skeleton-line skeleton-line--third" />
            <div class="skeleton-button skeleton-button--secondary" />
          </div>
          <div class="grid gap-4 md:grid-cols-[180px_minmax(0,1fr)]">
            <div class="skeleton-form-card skeleton-form-card--compact" />
            <div class="skeleton-form-card skeleton-form-card--compact" />
          </div>
          <div class="mt-4 space-y-3">
            <div class="skeleton-form-card skeleton-form-card--compact" />
            <div class="skeleton-form-card skeleton-form-card--compact" />
          </div>
        </div>
      </div>
      <div class="space-y-4">
        <div class="skeleton-side-card" />
        <div class="skeleton-side-card" />
      </div>
    </section>
  </div>
</template>
