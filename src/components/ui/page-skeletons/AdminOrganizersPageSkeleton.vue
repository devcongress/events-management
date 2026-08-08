<template>
  <div
    class="view-skeleton mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start"
    aria-busy="true"
    aria-label="Loading access directory"
  >
    <section class="skeleton-panel min-w-0 overflow-hidden xl:col-start-1 xl:row-span-2 xl:row-start-1">
      <div class="flex items-center justify-between border-b border-dc-border p-4">
        <div class="space-y-2">
          <div class="skeleton-line skeleton-line--third" />
          <div class="skeleton-line skeleton-line--half" />
        </div>
        <div class="skeleton-form-card skeleton-form-card--compact w-16" />
      </div>
      <div class="border-b border-dc-border bg-dc-paper-warm px-5 py-3">
        <div class="skeleton-line skeleton-line--half" />
      </div>
      <div class="divide-y divide-dc-border">
        <div v-for="item in 8" :key="item" class="grid min-h-[4.4rem] grid-cols-[minmax(0,1fr)_4rem] items-center gap-4 px-5 py-3 sm:grid-cols-[minmax(0,1fr)_6rem_8rem_4rem]">
          <div class="flex items-center gap-3">
            <div class="h-9 w-9 shrink-0 rounded-full bg-dc-border/70" />
            <div class="min-w-0 flex-1 space-y-2">
              <div class="skeleton-line skeleton-line--half" />
              <div class="skeleton-line skeleton-line--third" />
            </div>
          </div>
          <div class="skeleton-line hidden sm:block" />
          <div class="skeleton-line hidden sm:block" />
          <div class="skeleton-button skeleton-button--secondary" />
        </div>
      </div>
    </section>

    <section class="skeleton-panel grid gap-3 p-4 xl:col-start-2 xl:row-start-1">
      <div class="skeleton-eyebrow" />
      <div class="skeleton-line skeleton-line--half" />
      <div v-for="field in 3" :key="field" class="skeleton-form-card skeleton-form-card--compact" />
      <div class="skeleton-button w-full" />
    </section>

    <section class="skeleton-panel grid gap-4 p-4 xl:col-start-2 xl:row-start-2">
      <div class="skeleton-line skeleton-line--half" />
      <div v-for="item in 3" :key="item" class="space-y-2 border-t border-dc-border pt-3">
        <div class="skeleton-line skeleton-line--third" />
        <div class="skeleton-line" />
      </div>
    </section>
  </div>
</template>
