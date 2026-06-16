<template>
  <div class="view-skeleton" aria-busy="true" aria-label="Loading event management">
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
    <section class="skeleton-panel p-5">
      <div class="mb-4 space-y-3">
        <div class="skeleton-eyebrow" />
        <div class="skeleton-line skeleton-line--heading" />
      </div>
      <div class="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <div v-for="item in 6" :key="item" class="skeleton-form-card skeleton-form-card--compact" />
      </div>
    </section>
    <section class="skeleton-table" :style="{ '--skeleton-rows': '6' }" />
  </div>
</template>
