<template>
  <div class="view-skeleton" aria-busy="true" aria-label="Loading events">
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
    <section class="grid gap-5 md:grid-cols-2">
      <article v-for="item in 4" :key="item" class="skeleton-card overflow-hidden">
        <div class="skeleton-card-media aspect-video" />
        <div class="space-y-4 p-5">
          <div class="flex items-center justify-between gap-3">
            <div class="skeleton-line skeleton-line--third" />
            <div class="skeleton-line skeleton-line--third" />
          </div>
          <div class="skeleton-title" />
          <div class="space-y-3">
            <div class="skeleton-line" />
            <div class="skeleton-line skeleton-line--two-thirds" />
          </div>
          <div class="skeleton-button skeleton-button--secondary" />
        </div>
      </article>
    </section>
  </div>
</template>
