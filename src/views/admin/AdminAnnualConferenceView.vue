<script setup lang="ts">
import AnnualConferenceNav from '@/src/components/AnnualConferenceNav.vue';
import { ACTIVE_ANNUAL_CONFERENCE_EDITION, annualConferencePath } from '@/src/annual-conference';

const plannedWorkstreams = [
  {
    title: 'Work plan',
    description: 'Owners, tasks, dependencies, deadlines, and progress across the conference.',
  },
  {
    title: 'Programme and speakers',
    description: 'Keynotes, talks, workshops, panels, demos, rooms, and the running order.',
  },
  {
    title: 'Registration and ticketing',
    description: 'Attendee registration, capacity, ticketing, badges, and check-in.',
  },
  {
    title: 'Sponsors and partners',
    description: 'Packages, prospects, commitments, deliverables, and partner follow-up.',
  },
  {
    title: 'Production and logistics',
    description: 'Venue, catering, AV, connectivity, signage, media, and event-day operations.',
  },
  {
    title: 'Budget and expenses',
    description: 'Planned spend, approvals, actual costs, reimbursements, and reporting.',
  },
  {
    title: 'Feedback and reports',
    description: 'Conference feedback, outcomes, retrospective notes, and year-over-year learning.',
  },
];
</script>

<template>
  <div class="editorial-page">
    <div class="editorial-wrap">
      <AnnualConferenceNav />

      <header class="feedback-hub-hero">
        <div>
          <p class="editorial-eyebrow">Annual Conference · {{ ACTIVE_ANNUAL_CONFERENCE_EDITION.label }}</p>
          <h1 class="editorial-title">Conference workspace</h1>
          <p class="editorial-subtitle max-w-4xl">
            Plan the December conference without mixing its volunteers, programme, tasks, sponsors, and expenses into regular meetup operations.
          </p>
        </div>
        <span class="self-start rounded-md border-2 border-dc-ink bg-dc-yellow px-3 py-2 font-mono text-[11px] font-black uppercase tracking-[0.16em] text-dc-ink shadow-[2px_2px_0_#111111]">
          Planning
        </span>
      </header>

      <section class="mb-10 grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
        <RouterLink
          :to="annualConferencePath('volunteers')"
          class="editorial-panel motion-press group overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dc-pink/35"
        >
          <div class="border-b-2 border-dc-ink bg-dc-pink px-5 py-4 text-white sm:px-6">
            <p class="font-mono text-[11px] font-black uppercase tracking-[0.18em]">Active workstream</p>
          </div>
          <div class="p-5 sm:p-6">
            <div class="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 class="text-3xl font-black tracking-tight text-dc-ink">Volunteers</h2>
                <p class="mt-3 max-w-2xl text-base font-semibold leading-7 text-dc-gray">
                  Share the existing December 2026 sign-up form, display its QR code, and review volunteer applications in one place.
                </p>
              </div>
              <span class="rounded-md border-2 border-dc-ink bg-dc-yellow px-2.5 py-1 font-mono text-[10px] font-black uppercase tracking-[0.14em] text-dc-ink">
                Open
              </span>
            </div>
            <span class="mt-6 inline-flex border-b-4 border-dc-yellow font-mono text-sm font-black uppercase tracking-wide text-dc-ink">
              Open volunteers →
            </span>
          </div>
        </RouterLink>

        <aside class="editorial-panel p-5 sm:p-6">
          <p class="editorial-eyebrow mb-3">Edition</p>
          <h2 class="text-2xl font-black tracking-tight text-dc-ink">{{ ACTIVE_ANNUAL_CONFERENCE_EDITION.name }}</h2>
          <dl class="mt-5 divide-y divide-dc-border border-y-2 border-dc-ink">
            <div class="grid grid-cols-[7rem_1fr] gap-3 py-3">
              <dt class="font-mono text-[10px] font-black uppercase tracking-[0.14em] text-dc-gray">Edition</dt>
              <dd class="font-black text-dc-ink">{{ ACTIVE_ANNUAL_CONFERENCE_EDITION.label }}</dd>
            </div>
            <div class="grid grid-cols-[7rem_1fr] gap-3 py-3">
              <dt class="font-mono text-[10px] font-black uppercase tracking-[0.14em] text-dc-gray">Date</dt>
              <dd class="font-black text-dc-ink">To be confirmed</dd>
            </div>
            <div class="grid grid-cols-[7rem_1fr] gap-3 py-3">
              <dt class="font-mono text-[10px] font-black uppercase tracking-[0.14em] text-dc-gray">Venue</dt>
              <dd class="font-black text-dc-ink">To be confirmed</dd>
            </div>
          </dl>
        </aside>
      </section>

      <section>
        <div class="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p class="editorial-eyebrow mb-2">Workspace map</p>
            <h2 class="text-3xl font-black tracking-tight text-dc-ink">What comes next</h2>
          </div>
          <p class="max-w-xl text-sm font-semibold leading-6 text-dc-gray">
            These areas establish the conference structure. They become interactive only as each workflow is designed and implemented.
          </p>
        </div>

        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <article
            v-for="workstream in plannedWorkstreams"
            :key="workstream.title"
            class="editorial-panel p-5"
          >
            <div class="mb-4 flex items-center justify-between gap-3">
              <span class="h-3 w-3 rounded-full border-2 border-dc-ink bg-dc-yellow" aria-hidden="true" />
              <span class="font-mono text-[10px] font-black uppercase tracking-[0.14em] text-dc-gray">Planned</span>
            </div>
            <h3 class="text-xl font-black tracking-tight text-dc-ink">{{ workstream.title }}</h3>
            <p class="mt-2 text-sm font-semibold leading-6 text-dc-gray">{{ workstream.description }}</p>
          </article>
        </div>
      </section>
    </div>
  </div>
</template>
