<script setup lang="ts">
import { useRoute } from 'vue-router';
import { ACTIVE_ANNUAL_CONFERENCE_EDITION, annualConferencePath } from '@/src/annual-conference';

const route = useRoute();
const links = [
  { href: annualConferencePath(), label: 'Overview' },
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
  <section class="mb-8 overflow-hidden rounded-lg border-2 border-dc-ink bg-dc-paper shadow-[4px_4px_0_#111111]">
    <div class="flex flex-wrap items-center justify-between gap-3 border-b-2 border-dc-ink bg-dc-yellow px-4 py-3 sm:px-5">
      <p class="font-mono text-[11px] font-black uppercase tracking-[0.18em] text-dc-ink">
        Annual Conference
      </p>
      <span class="rounded-md border-2 border-dc-ink bg-dc-paper px-2.5 py-1 font-mono text-[10px] font-black uppercase tracking-[0.16em] text-dc-ink">
        {{ ACTIVE_ANNUAL_CONFERENCE_EDITION.label }}
      </span>
    </div>

    <nav class="flex flex-wrap gap-2 p-3 sm:p-4" aria-label="Annual Conference workspace">
      <RouterLink
        v-for="link in links"
        :key="link.href"
        :to="link.href"
        class="motion-press min-h-11 rounded-md border-2 px-4 py-2.5 font-mono text-[11px] font-black uppercase tracking-[0.14em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dc-pink/35"
        :class="isActive(link.href)
          ? 'border-dc-ink bg-dc-pink text-white shadow-[2px_2px_0_#111111]'
          : 'border-dc-border bg-dc-paper text-dc-gray hover:border-dc-ink hover:bg-dc-paper-warm hover:text-dc-ink'"
        :aria-current="isActive(link.href) ? 'page' : undefined"
      >
        {{ link.label }}
      </RouterLink>
    </nav>
  </section>
</template>
