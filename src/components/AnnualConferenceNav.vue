<script setup lang="ts">
import { useRoute } from 'vue-router';
import { ACTIVE_ANNUAL_CONFERENCE_EDITION, annualConferencePath } from '@/src/annual-conference';

withDefaults(defineProps<{
  title?: string;
  description?: string;
  showPageHeading?: boolean;
}>(), {
  showPageHeading: true,
});

const route = useRoute();
const links = [
  { href: annualConferencePath(), label: 'Overview' },
  { href: annualConferencePath('work-plan'), label: 'Work plan' },
  { href: annualConferencePath('volunteers'), label: 'Volunteers' },
];

function isActive(href: string): boolean {
  if (href === annualConferencePath()) {
    return route.path === href;
  }

  return route.path === href || route.path.startsWith(`${href}/`);
}
</script>

<template>
  <section
    class="mb-6"
    :class="showPageHeading ? 'border-b-2 border-dc-ink pb-5' : ''"
  >
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div class="flex flex-wrap items-center gap-3">
        <p class="font-mono text-[11px] font-black uppercase tracking-[0.18em] text-dc-ink">
          Annual Conference
        </p>
        <span class="rounded-md border border-dc-yellow bg-dc-paper-warm px-2.5 py-1 font-mono text-[10px] font-black uppercase tracking-[0.16em] text-dc-ink">
          {{ ACTIVE_ANNUAL_CONFERENCE_EDITION.label }}
        </span>
      </div>

      <nav class="flex flex-wrap gap-2" aria-label="Annual Conference workspace">
        <RouterLink
          v-for="link in links"
          :key="link.href"
          :to="link.href"
          class="motion-press inline-flex min-h-10 items-center justify-center rounded-md border px-4 py-2 font-mono text-[10px] font-black uppercase leading-none tracking-[0.14em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dc-pink/35"
          :class="isActive(link.href)
            ? 'border-dc-ink bg-dc-pink text-white shadow-[2px_2px_0_#111111]'
            : 'border-dc-border bg-dc-paper text-dc-gray hover:border-dc-ink hover:bg-dc-paper-warm hover:text-dc-ink'"
          :aria-current="isActive(link.href) ? 'page' : undefined"
        >
          {{ link.label }}
        </RouterLink>
      </nav>
    </div>

    <div
      v-if="showPageHeading"
      class="mt-4 flex flex-wrap items-start justify-between gap-4 border-t border-dc-border pt-4"
    >
      <div class="min-w-0 flex-1">
        <h1 v-if="title" class="text-3xl font-black tracking-tight text-dc-ink sm:text-4xl">{{ title }}</h1>
        <slot name="description">
          <p v-if="description" class="mt-1 max-w-4xl text-xs font-semibold leading-5 text-dc-gray">
            {{ description }}
          </p>
        </slot>
      </div>
      <slot name="actions" />
    </div>
  </section>
</template>
