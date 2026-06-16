<template>
  <div class="view-skeleton" aria-busy="true" aria-label="Loading leaderboard">
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
    <section class="skeleton-panel overflow-hidden">
      <div class="h-14 bg-dc-yellow" />
      <div v-for="item in 8" :key="item" class="skeleton-row skeleton-row--leaderboard">
        <div class="skeleton-rank" />
        <div class="skeleton-avatar" />
        <div class="flex-1 space-y-3">
          <div class="skeleton-line skeleton-line--half" />
          <div class="skeleton-line skeleton-line--third" />
        </div>
        <div class="skeleton-score" />
      </div>
    </section>
  </div>
</template>
