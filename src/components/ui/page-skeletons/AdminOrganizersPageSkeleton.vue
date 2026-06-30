<template>
  <div class="view-skeleton" aria-busy="true" aria-label="Loading organizer access">
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
    <section class="skeleton-panel grid gap-4 p-5 md:grid-cols-[1.2fr_1fr_160px_auto] md:items-end">
      <div class="skeleton-form-card skeleton-form-card--compact" />
      <div class="skeleton-form-card skeleton-form-card--compact" />
      <div class="skeleton-form-card skeleton-form-card--compact" />
      <div class="skeleton-button" />
    </section>
    <section class="skeleton-panel mt-6 overflow-hidden">
      <div class="border-b-2 border-dc-border bg-dc-paper-warm p-5">
        <div class="skeleton-eyebrow" />
        <div class="skeleton-title mt-3" />
      </div>
      <div class="divide-y-2 divide-dc-border">
        <div v-for="item in 3" :key="item" class="grid gap-4 p-5 md:grid-cols-[1fr_150px_150px_auto] md:items-center">
          <div class="space-y-3">
            <div class="skeleton-line skeleton-line--half" />
            <div class="skeleton-line skeleton-line--third" />
            <div class="skeleton-line skeleton-line--third" />
          </div>
          <div class="skeleton-form-card skeleton-form-card--compact" />
          <div class="skeleton-form-card skeleton-form-card--compact" />
          <div class="skeleton-button skeleton-button--secondary" />
        </div>
      </div>
    </section>
  </div>
</template>
