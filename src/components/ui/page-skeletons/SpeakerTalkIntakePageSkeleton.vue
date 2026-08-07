<template>
  <div class="view-skeleton" aria-busy="true" aria-label="Loading talk details form">
    <header class="skeleton-header">
      <div>
        <div class="skeleton-eyebrow" />
        <div class="skeleton-title mt-4" />
        <div class="skeleton-line skeleton-line--third mt-4" />
      </div>
    </header>

    <section class="skeleton-panel p-6 sm:p-8">
      <div class="grid gap-5 sm:grid-cols-2">
        <div class="skeleton-form-card skeleton-form-card--compact" />
        <div class="skeleton-form-card skeleton-form-card--compact" />
      </div>
      <div class="skeleton-form-card skeleton-form-card--compact mt-5" />
      <div class="skeleton-form-card skeleton-form-card--compact mt-5" />
      <div class="skeleton-form-card mt-5" />
      <div class="skeleton-button mt-6 w-full" />
    </section>
  </div>
</template>
