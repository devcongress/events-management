<template>
  <div class="view-skeleton" aria-busy="true" aria-label="Loading dashboard">
    <section class="grid gap-10 lg:grid-cols-[1.2fr_0.8fr]">
      <div>
        <div class="skeleton-chip mb-7" />
        <div class="skeleton-line skeleton-line--hero" />
        <div class="skeleton-line skeleton-line--hero-short mt-3" />
        <div class="mt-8 max-w-2xl space-y-3">
          <div class="skeleton-line" />
          <div class="skeleton-line skeleton-line--two-thirds" />
        </div>
        <div class="mt-8 flex flex-wrap gap-3">
          <div class="skeleton-button" />
          <div class="skeleton-button skeleton-button--secondary" />
        </div>
      </div>
      <div class="skeleton-media" />
    </section>

    <section class="mt-12 space-y-8">
      <div class="grid gap-4 sm:grid-cols-2">
        <div class="skeleton-stat-card" />
        <div class="skeleton-stat-card" />
      </div>
      <div class="grid gap-8 lg:grid-cols-[1fr_360px]">
        <div class="space-y-3">
          <div class="skeleton-eyebrow" />
          <div class="skeleton-title" />
          <div class="skeleton-panel overflow-hidden">
            <div v-for="item in 4" :key="item" class="skeleton-row skeleton-row--article">
              <div class="space-y-3">
                <div class="skeleton-line skeleton-line--third" />
                <div class="skeleton-line skeleton-line--two-thirds" />
                <div class="skeleton-line" />
              </div>
              <div class="skeleton-button skeleton-button--secondary" />
            </div>
          </div>
        </div>
        <div class="skeleton-panel overflow-hidden">
          <div class="h-14 bg-dc-yellow" />
          <div v-for="item in 3" :key="item" class="skeleton-row skeleton-row--leaderboard">
            <div class="skeleton-rank" />
            <div class="skeleton-avatar" />
            <div class="flex-1 space-y-3">
              <div class="skeleton-line skeleton-line--half" />
              <div class="skeleton-line skeleton-line--third" />
            </div>
            <div class="skeleton-score" />
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
