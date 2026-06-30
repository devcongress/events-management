<script setup lang="ts">
import CommunityMasthead from '@/src/components/CommunityMasthead.vue';
const mastheadStats = [
  { value: 'Soon', label: 'quiz', tone: 'yellow' as const },
  { value: '5MB', label: 'future PDF cap', tone: 'info' as const },
  { value: 'Links', label: 'slides', tone: 'warm' as const },
];
</script>

<template>
  <div class="editorial-page">
    <div class="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8 lg:py-12">
      <CommunityMasthead
        eyebrow="live quiz"
        title="Play"
        description="Live quiz is coming soon after the low-cost launch foundations are stable."
        ribbon="Coming soon"
        :stats="mastheadStats"
      />
    </div>

    <section class="editorial-wrap flex items-center pb-10 lg:pb-14">
      <div class="grid w-full gap-8 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-end">
        <div>
          <div class="mt-4 border-b-2 border-dc-ink pb-7">
            <h1 class="max-w-4xl text-5xl font-black leading-none tracking-tight text-dc-ink sm:text-6xl lg:text-7xl">
              Live quiz is paused for phase one.
            </h1>
          </div>
          <p class="mt-6 max-w-2xl text-lg leading-8 text-dc-gray">
            We are keeping the quiz path, but it is not part of the first low-cost launch. Events, CFP, speaker slide links, feedback, and attendance CSVs come first.
          </p>

          <div class="mt-8 flex flex-col gap-3 sm:flex-row">
            <RouterLink to="/events" class="editorial-action">
              View Events
            </RouterLink>
            <RouterLink to="/my-talks" class="editorial-secondary-action">
              Speaker Desk
            </RouterLink>
          </div>
        </div>

        <aside class="overflow-hidden rounded-lg border-2 border-dc-ink bg-dc-paper shadow-[3px_3px_0_#111111]">
          <div class="border-b-2 border-dc-ink bg-dc-yellow px-5 py-4">
            <p class="font-mono text-xs font-black uppercase tracking-[0.22em] text-dc-ink">What this means</p>
          </div>
          <div class="divide-y divide-dc-border">
            <div class="px-5 py-5">
              <p class="font-mono text-sm font-black uppercase tracking-wide text-dc-ink">Cost-first launch</p>
              <p class="mt-2 text-sm leading-6 text-dc-gray">Realtime rooms can wait until the community needs them.</p>
            </div>
            <div class="px-5 py-5">
              <p class="font-mono text-sm font-black uppercase tracking-wide text-dc-ink">Feature path preserved</p>
              <p class="mt-2 text-sm leading-6 text-dc-gray">The code remains in the repo so we can revive it deliberately.</p>
            </div>
            <div class="px-5 py-5">
              <p class="font-mono text-sm font-black uppercase tracking-wide text-dc-ink">No file storage pressure</p>
              <p class="mt-2 text-sm leading-6 text-dc-gray">Slides stay as links, and future quiz PDFs stay small.</p>
            </div>
          </div>
        </aside>
      </div>
    </section>
  </div>
</template>
