<template>
  <div class="view-skeleton flex flex-1 min-h-0 flex-col" aria-busy="true" aria-label="Loading audit log">
    <section class="mb-5 bg-dc-cream/95 pb-3 pt-1">
      <div class="skeleton-panel p-4">
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,16rem)_minmax(0,16rem)_auto_auto] lg:items-end">
          <div class="space-y-2">
            <div class="skeleton-line skeleton-line--third h-3" />
            <div class="skeleton-option" />
          </div>
          <div class="space-y-2">
            <div class="skeleton-line skeleton-line--third h-3" />
            <div class="skeleton-option" />
          </div>
          <div class="skeleton-button h-[50px] w-full lg:w-44" />
          <div class="skeleton-button skeleton-button--secondary h-[50px] w-full lg:w-28" />
        </div>
      </div>
    </section>

    <section class="skeleton-panel flex flex-col overflow-hidden">
      <div class="flex flex-col gap-2 border-b border-dc-border bg-dc-paper-warm px-4 py-3 sm:flex-row sm:items-end sm:justify-between">
        <div class="space-y-2">
          <div class="skeleton-eyebrow h-3 w-24" />
          <div class="skeleton-line skeleton-line--heading h-7 w-56" />
        </div>
        <div class="skeleton-line h-3 w-20" />
      </div>

      <div class="border-b border-dc-border bg-dc-paper-warm px-4 py-2.5">
        <div class="grid grid-cols-[10%_22%_18%_18%_24%_8%] gap-4">
          <div v-for="column in 6" :key="column" class="skeleton-line h-3" />
        </div>
      </div>

      <div class="divide-y divide-dc-border">
        <div
          v-for="row in 4"
          :key="row"
          class="grid min-h-[4.1rem] grid-cols-[10%_22%_18%_18%_24%_8%] gap-4 px-4 py-2.5"
        >
          <div class="space-y-2">
            <div class="skeleton-line h-3" />
            <div class="skeleton-line skeleton-line--two-thirds h-3" />
          </div>
          <div class="space-y-2">
            <div class="skeleton-line" />
            <div class="skeleton-line skeleton-line--half h-3" />
          </div>
          <div class="skeleton-line h-3" />
          <div class="space-y-2">
            <div class="skeleton-line h-3" />
            <div class="skeleton-line skeleton-line--two-thirds h-3" />
          </div>
          <div class="skeleton-line" />
          <div class="skeleton-line h-3" />
        </div>
      </div>

      <div class="pagination-footer shrink-0">
        <div class="skeleton-line h-3 w-40" />
        <div class="skeleton-button skeleton-button--secondary h-10 w-64" />
      </div>
    </section>
  </div>
</template>
