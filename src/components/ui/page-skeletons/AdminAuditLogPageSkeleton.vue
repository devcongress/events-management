<template>
  <div class="view-skeleton" aria-busy="true" aria-label="Loading audit log">
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
    <section class="skeleton-panel grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_13rem_11rem_auto] md:items-end">
      <div class="skeleton-form-card skeleton-form-card--compact" />
      <div class="skeleton-form-card skeleton-form-card--compact" />
      <div class="skeleton-form-card skeleton-form-card--compact" />
      <div class="skeleton-button skeleton-button--secondary" />
    </section>
    <section class="skeleton-table mt-6" :style="{ '--skeleton-rows': '6' }" />
  </div>
</template>
