<template>
  <div class="view-skeleton" aria-busy="true" aria-label="Loading proposal form">
    <header class="skeleton-header">
      <div>
        <div class="skeleton-eyebrow" />
        <div class="skeleton-title" />
        <div class="skeleton-line skeleton-line--third mt-4" />
      </div>
    </header>
    <div class="skeleton-panel p-6">
      <div class="skeleton-line" />
      <div class="skeleton-line skeleton-line--two-thirds mt-3" />
    </div>
    <div class="skeleton-panel p-6 sm:p-8">
      <div v-for="item in 4" :key="item" class="mb-5 space-y-3 last:mb-0">
        <div class="skeleton-eyebrow" />
        <div class="skeleton-form-card skeleton-form-card--compact" />
      </div>
      <div class="skeleton-button mt-6" />
    </div>
  </div>
</template>
