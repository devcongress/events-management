<template>
  <div class="view-skeleton" aria-busy="true" aria-label="Loading archive event">
    <div class="skeleton-line skeleton-line--third mb-8" />
    <section class="skeleton-panel p-6 sm:p-8">
      <div class="skeleton-eyebrow" />
      <div class="skeleton-line skeleton-line--hero mt-5" />
      <div class="skeleton-line skeleton-line--third mt-5" />
      <div class="mt-7 space-y-3">
        <div class="skeleton-line" />
        <div class="skeleton-line skeleton-line--two-thirds" />
      </div>
      <div class="mt-8 flex items-center justify-between gap-4 border-t-2 border-dc-border pt-5">
        <div class="skeleton-line skeleton-line--half" />
        <div class="skeleton-button" />
      </div>
    </section>
    <section class="mt-10 space-y-4">
      <div class="flex items-end justify-between gap-4">
        <div class="space-y-3">
          <div class="skeleton-eyebrow" />
          <div class="skeleton-title" />
        </div>
        <div class="skeleton-button skeleton-button--secondary" />
      </div>
      <div class="skeleton-panel overflow-hidden">
        <div v-for="item in 3" :key="item" class="skeleton-row skeleton-row--article">
          <div class="space-y-3">
            <div class="skeleton-line skeleton-line--third" />
            <div class="skeleton-line skeleton-line--two-thirds" />
            <div class="skeleton-line" />
          </div>
          <div class="skeleton-button skeleton-button--secondary" />
        </div>
      </div>
    </section>
  </div>
</template>
