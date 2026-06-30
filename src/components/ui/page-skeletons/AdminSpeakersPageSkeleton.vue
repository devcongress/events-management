<template>
  <div class="view-skeleton" aria-busy="true" aria-label="Loading speaker management">
    <header class="skeleton-header">
      <div>
        <div class="skeleton-eyebrow" />
        <div class="skeleton-title" />
        <div class="skeleton-line skeleton-line--third mt-4" />
      </div>
    </header>
    <section class="skeleton-panel p-5">
      <div class="skeleton-title mb-4" />
      <div class="space-y-4">
        <div class="skeleton-form-card skeleton-form-card--compact" />
        <div class="skeleton-form-card skeleton-form-card--compact" />
        <div class="skeleton-button" />
      </div>
    </section>
    <section class="skeleton-panel mt-8 overflow-hidden">
      <div class="skeleton-panel-header" />
      <div v-for="item in 3" :key="item" class="skeleton-row skeleton-row--action">
        <div class="flex-1 space-y-3">
          <div class="skeleton-line skeleton-line--half" />
          <div class="skeleton-line skeleton-line--third" />
        </div>
        <div class="skeleton-button skeleton-button--secondary" />
      </div>
    </section>
  </div>
</template>
