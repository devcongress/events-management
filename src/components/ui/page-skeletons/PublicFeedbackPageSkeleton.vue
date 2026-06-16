<template>
  <div class="view-skeleton" aria-busy="true" aria-label="Loading feedback form">
    <header class="skeleton-header">
      <div>
        <div class="skeleton-eyebrow" />
        <div class="skeleton-title" />
        <div class="skeleton-line skeleton-line--third mt-4" />
        <div class="mt-4 max-w-2xl space-y-3">
          <div class="skeleton-line" />
          <div class="skeleton-line skeleton-line--two-thirds" />
        </div>
      </div>
    </header>
    <div class="space-y-5">
      <div class="skeleton-panel p-5">
        <div class="grid gap-4 md:grid-cols-2">
          <div class="skeleton-form-card skeleton-form-card--compact" />
          <div class="skeleton-form-card skeleton-form-card--compact" />
        </div>
      </div>
      <div v-for="item in 4" :key="item" class="skeleton-panel p-5">
        <div class="skeleton-line skeleton-line--two-thirds" />
        <div class="mt-4 grid gap-3 sm:grid-cols-4">
          <div v-for="option in 4" :key="option" class="skeleton-option" />
        </div>
      </div>
      <div class="skeleton-button" />
    </div>
  </div>
</template>
