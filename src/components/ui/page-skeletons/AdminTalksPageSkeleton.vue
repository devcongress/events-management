<template>
  <div class="view-skeleton" aria-busy="true" aria-label="Loading talk management">
    <header class="skeleton-header">
      <div>
        <div class="skeleton-eyebrow" />
        <div class="skeleton-title" />
        <div class="mt-4 max-w-2xl space-y-3">
          <div class="skeleton-line" />
          <div class="skeleton-line skeleton-line--two-thirds" />
        </div>
      </div>
    </header>
    <section v-for="group in 3" :key="group" class="mb-8">
      <div class="mb-3 flex items-center gap-3">
        <div class="skeleton-line skeleton-line--half" />
        <div class="skeleton-line skeleton-line--third" />
      </div>
      <div class="skeleton-panel overflow-hidden">
        <div v-for="item in 2" :key="item" class="skeleton-row p-4">
          <div class="space-y-3">
            <div class="skeleton-title" />
            <div class="skeleton-line skeleton-line--half" />
            <div class="skeleton-line" />
          </div>
          <div class="mt-4 flex flex-wrap gap-2">
            <div v-for="action in 4" :key="action" class="skeleton-button skeleton-button--secondary" />
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
