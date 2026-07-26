<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { adminPath } from '@/src/admin-routes';

const route = useRoute();

const missingPath = computed(() => route.fullPath);
const primaryLink = computed(() => adminPath('events'));
const secondaryLinks = computed(() => [
  { href: adminPath('attendance'), label: 'Attendance Hub', detail: 'Check Luma imports and post-event readouts.' },
  { href: adminPath('feedback'), label: 'Feedback Hub', detail: 'Review event feedback windows and responses.' },
  { href: adminPath('events/new'), label: 'Create Event', detail: 'Start a new monthly event record.' },
]);
</script>

<template>
  <div class="not-found-page editorial-page">
    <section class="not-found-wrap editorial-wrap flex min-h-[calc(100svh-6rem)] items-center py-10 lg:py-14">
      <div class="not-found-inner w-full">
        <div class="not-found-grid grid gap-8 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-end">
          <div class="not-found-copy min-w-0">
            <p class="editorial-eyebrow">organizer route</p>
            <div class="not-found-title-row mt-4 flex flex-col gap-5 border-b-2 border-dc-ink pb-7 sm:flex-row sm:items-end sm:justify-between">
              <h1 class="not-found-title max-w-4xl text-5xl font-black leading-none tracking-tight text-dc-ink sm:text-6xl lg:text-7xl">
                This organizer page is not available.
              </h1>
              <span class="not-found-code shrink-0 font-mono text-6xl font-black leading-none text-dc-pink sm:text-7xl">404</span>
            </div>
            <p class="not-found-description mt-6 max-w-2xl text-lg leading-8 text-dc-gray">
              The address does not match an event, attendance, feedback, quiz, speaker, or talk management screen.
            </p>

            <div class="not-found-request mt-6 max-w-3xl rounded-md border-2 border-dc-ink bg-dc-paper px-4 py-3 font-mono text-xs font-bold uppercase tracking-wide text-dc-gray shadow-[2px_2px_0_#111111]">
              <span class="text-dc-pink">Requested</span>
              <span class="mx-2 text-dc-border">/</span>
              <span class="break-all text-dc-ink">{{ missingPath }}</span>
            </div>

            <div class="not-found-actions mt-8 flex flex-col gap-3 sm:flex-row">
              <RouterLink :to="primaryLink" class="editorial-action">
                Organizer Console
              </RouterLink>
              <RouterLink :to="adminPath('events')" class="editorial-secondary-action">
                View Events
              </RouterLink>
            </div>
          </div>

          <aside class="not-found-suggestions overflow-hidden rounded-lg border-2 border-dc-ink bg-dc-paper shadow-[3px_3px_0_#111111]">
            <div class="border-b-2 border-dc-ink bg-dc-yellow px-5 py-4">
              <p class="font-mono text-xs font-black uppercase tracking-[0.22em] text-dc-ink">Try instead</p>
            </div>
            <div class="divide-y divide-dc-border">
              <RouterLink
                v-for="link in secondaryLinks"
                :key="link.href"
                :to="link.href"
                class="group grid grid-cols-[minmax(0,1fr)_1rem] gap-4 px-5 py-5 hover:bg-dc-paper-warm"
              >
                <span class="min-w-0">
                  <span class="block font-mono text-sm font-black uppercase tracking-wide text-dc-ink group-hover:text-dc-pink">{{ link.label }}</span>
                  <span class="mt-2 block text-sm leading-6 text-dc-gray">{{ link.detail }}</span>
                </span>
                <span class="font-mono text-sm font-black text-dc-yellow transition-transform duration-150 ease-[var(--motion-fast)] group-hover:translate-x-0.5">→</span>
              </RouterLink>
            </div>
          </aside>
        </div>
      </div>
    </section>
  </div>
</template>
