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
  </div>
</template>
