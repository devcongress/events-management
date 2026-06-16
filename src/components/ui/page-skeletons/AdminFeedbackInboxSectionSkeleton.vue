<template>
  <div class="space-y-4">
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div v-for="index in 4" :key="`summary-${index}`" class="rounded-md border border-dc-border bg-dc-paper px-3 py-2">
        <div class="skeleton-line skeleton-line--short mb-2" />
        <div class="skeleton-line skeleton-line--tiny" />
      </div>
    </div>

    <div class="space-y-3">
      <article
        v-for="index in 3"
        :key="`item-${index}`"
        class="rounded-lg border border-dc-border bg-dc-paper px-4 py-4"
      >
        <div class="mb-3 flex flex-wrap gap-2">
          <div class="skeleton-chip" />
          <div class="skeleton-chip" />
          <div class="skeleton-chip skeleton-chip--sm" />
        </div>
        <div class="space-y-2">
          <div class="skeleton-line" />
          <div class="skeleton-line skeleton-line--long" />
          <div class="skeleton-line skeleton-line--medium" />
        </div>
        <div class="mt-4 grid gap-2 md:grid-cols-2">
          <div class="skeleton-line skeleton-line--short" />
          <div class="skeleton-line skeleton-line--short" />
          <div class="skeleton-line skeleton-line--long md:col-span-2" />
        </div>
      </article>
    </div>
  </div>
</template>
