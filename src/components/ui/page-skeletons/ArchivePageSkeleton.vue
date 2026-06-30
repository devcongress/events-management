<template>
  <div class="view-skeleton" aria-busy="true" aria-label="Loading archive">
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

    <section class="flex flex-col gap-10 lg:flex-row lg:gap-14">
      <aside class="lg:w-64">
        <div class="skeleton-panel space-y-2 p-3">
          <div v-for="item in 4" :key="item" class="rounded-md p-3">
            <div class="skeleton-line skeleton-line--half" />
          </div>
        </div>
      </aside>

      <main class="min-w-0 flex-1 space-y-6">
        <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div class="space-y-3">
            <div class="skeleton-eyebrow" />
            <div class="skeleton-line skeleton-line--hero-short" />
          </div>
          <div class="flex gap-2">
            <div class="skeleton-button skeleton-button--secondary" />
            <div class="skeleton-button skeleton-button--secondary" />
          </div>
        </div>
        <div class="skeleton-panel grid gap-3 p-3 md:grid-cols-[1fr_180px_220px_auto]">
          <div class="skeleton-form-card skeleton-form-card--compact" />
          <div class="skeleton-form-card skeleton-form-card--compact" />
          <div class="skeleton-form-card skeleton-form-card--compact" />
          <div class="skeleton-button skeleton-button--secondary" />
        </div>
        <div class="space-y-4">
          <article v-for="item in 2" :key="item" class="skeleton-panel p-4">
            <div class="grid gap-5 lg:grid-cols-[116px_1fr]">
              <div class="space-y-3">
                <div class="skeleton-stat-card h-[76px]" />
                <div class="skeleton-line skeleton-line--third" />
              </div>
              <div class="space-y-4">
                <div class="skeleton-title" />
                <div class="skeleton-line" />
                <div class="flex flex-wrap gap-2">
                  <div v-for="tag in 3" :key="tag" class="skeleton-chip !mb-0" />
                </div>
                <div class="grid gap-2">
                  <div v-for="talk in 1" :key="talk" class="skeleton-form-card skeleton-form-card--compact" />
                </div>
              </div>
            </div>
          </article>
        </div>
      </main>
    </section>
  </div>
</template>
