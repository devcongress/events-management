<template>
  <div class="view-skeleton flex w-full flex-1 min-h-0 flex-col" aria-busy="true" aria-label="Loading audit log">
    <section class="mb-5 flex gap-6 border-b border-dc-border px-1">
      <div v-for="tab in 2" :key="tab" class="flex h-[2.875rem] items-center gap-2">
        <div class="skeleton-option h-4 w-4" />
        <div class="skeleton-line h-4" :class="tab === 1 ? 'w-16' : 'w-28'" />
      </div>
    </section>

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
        <div class="grid grid-cols-[minmax(0,13fr)_minmax(2rem,6fr)_minmax(0,28fr)_minmax(0,47fr)_minmax(2.5rem,6fr)] gap-3">
          <div v-for="column in 5" :key="column" class="skeleton-line h-3" />
        </div>
      </div>

      <div class="divide-y divide-dc-border">
        <div
          v-for="row in 4"
          :key="row"
          class="grid min-h-12 grid-cols-[minmax(0,13fr)_minmax(2rem,6fr)_minmax(0,28fr)_minmax(0,47fr)_minmax(2.5rem,6fr)] items-center gap-3 px-4 py-2"
        >
          <div class="space-y-2">
            <div class="skeleton-line h-3" />
          </div>
          <div class="skeleton-option size-4 justify-self-center" />
          <div class="skeleton-line h-3 w-4/5" />
          <div class="skeleton-line h-3 w-3/4 self-center" />
          <div class="skeleton-option size-4 justify-self-end self-center" />
        </div>
      </div>

      <div class="app-pagination shrink-0">
        <div class="skeleton-button skeleton-button--secondary h-10 w-28" />
        <div class="skeleton-line h-3 w-20 justify-self-center" />
        <div class="skeleton-button skeleton-button--secondary h-10 w-20 justify-self-end" />
      </div>
    </section>
  </div>
</template>
