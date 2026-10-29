<script setup lang="ts">
import AppDropdown from '@/src/components/AppDropdown.vue';
import AnnualConferenceTaskBoard from '@/src/components/AnnualConferenceTaskBoard.vue';
import NaviiAvatar from '@/src/components/NaviiAvatar.vue';
import {
  ANNUAL_CONFERENCE_STATUS_LABELS,
  ANNUAL_CONFERENCE_TASK_STATUSES,
  type AnnualConferenceTask,
} from '@/lib/annual-conference-work-plan';

withDefaults(defineProps<{
  view: 'board' | 'ledger' | 'phone';
  assigned?: boolean;
}>(), {
  assigned: false,
});

const tasks: AnnualConferenceTask[] = ANNUAL_CONFERENCE_TASK_STATUSES.flatMap((status, index) =>
  Array.from({ length: 2 }, (_, row) => ({
    id: `loading-${status}-${row}`,
    edition_id: 'loading-edition',
    title: 'Prepare conference delivery',
    details: 'Confirm the next steps and coordinate with the responsible team.',
    internal_note: null,
    phase_id: 'loading-phase',
    workstream: 'programme_speakers',
    accountable_owner: 'organizer@example.com',
    collaborators: [],
    priority: 'high',
    target_date: '2026-12-01',
    status,
    dependency_task_ids: [],
    dependency_note: null,
    source: 'manual',
    source_row: null,
    sort_order: index * 2 + row,
    created_by_email: null,
    updated_by_email: null,
    completed_at: null,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
  })),
);
const organizerLabels = { 'organizer@example.com': 'Conference organizer' };
const ownerAvatarSeeds = new Map([['organizer@example.com', 'loading-organizer']]);
const phaseOptions = [{ value: 'all', label: 'All phases' }];
const statusOptions = [{ value: 'all', label: 'All statuses' }];
const workstreamOptions = [{ value: 'all', label: 'All workstreams' }];
const ownerOptions = [{ value: 'all', label: 'All owners' }];

function cannotChangeTask() {
  return false;
}
</script>

<template>
  <section v-if="view === 'phone'" class="loading-phone-work-plan">
    <header class="loading-phone-work-plan__intro">
      <div>
        <span>{{ assigned ? 'Assigned work' : 'Work plan' }}</span>
        <h1>{{ assigned ? 'My tasks' : 'Conference tasks' }}</h1>
        <p>8 of 8 shown</p>
      </div>
      <button v-if="!assigned" class="loading-phone-work-plan__primary" disabled>Add task</button>
    </header>

    <label class="loading-phone-work-plan__search">
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="8.5" cy="8.5" r="5.5" />
        <path d="m13 13 4 4" />
      </svg>
      <input type="search" value="" placeholder="Search tasks" disabled />
    </label>

    <div v-if="!assigned" class="loading-phone-work-plan__filters">
      <AppDropdown model-value="all" label="Phase" :options="phaseOptions" density="compact" disabled />
      <AppDropdown model-value="all" label="Status" :options="statusOptions" density="compact" disabled />
      <AppDropdown class="loading-phone-work-plan__wide" model-value="all" label="Workstream" :options="workstreamOptions" density="compact" disabled />
      <AppDropdown class="loading-phone-work-plan__wide" model-value="all" label="Owner" :options="ownerOptions" density="compact" disabled />
      <button class="loading-phone-work-plan__wide loading-phone-work-plan__clear" disabled>Clear filters</button>
    </div>
    <div v-else class="loading-phone-work-plan__assigned">
      <div class="loading-phone-work-plan__owner">
        <span>Tasks for</span>
        <strong>Conference volunteer</strong>
      </div>
      <AppDropdown model-value="all" label="Status" :options="statusOptions" density="compact" disabled />
    </div>

    <div class="loading-phone-work-plan__list">
      <article v-for="task in tasks.slice(0, 3)" :key="task.id" class="loading-phone-work-plan__task">
        <span class="loading-phone-work-plan__status">{{ ANNUAL_CONFERENCE_STATUS_LABELS[task.status] }}</span>
        <strong>{{ task.title }}</strong>
        <small>Programme and speakers</small>
        <span class="loading-phone-work-plan__meta"><span>Conference organizer</span><span>1 Dec</span></span>
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m8 5 5 5-5 5" /></svg>
      </article>
    </div>
  </section>

  <div v-else class="loading-work-plan">
    <section class="border-2 border-dc-ink bg-dc-paper">
      <div class="flex flex-wrap items-center justify-between gap-4 border-b border-dc-ink bg-dc-paper px-4 py-3.5">
        <div class="min-w-0">
          <p class="font-sans text-[9px] font-semibold uppercase tracking-[0.12em] text-dc-pink">Viewing phase</p>
          <div class="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 class="text-xl font-semibold text-dc-ink">Entire conference</h2>
          </div>
          <p class="mt-1 text-xs text-dc-gray">8 tasks in this view</p>
        </div>
        <div class="flex w-full flex-wrap items-center justify-end gap-3 lg:w-auto">
          <section class="min-w-[11rem] flex-1 sm:flex-none">
            <p class="font-sans text-[8px] font-semibold uppercase tracking-[0.1em] text-dc-gray">Delivery pace</p>
            <div class="mt-0.5 flex items-baseline justify-between gap-3">
              <p class="text-lg font-semibold leading-none text-dc-ink">25<span class="text-xs text-dc-gray">%</span></p>
              <span class="text-[11px] font-medium text-dc-gray">2 of 8 complete</span>
            </div>
            <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-dc-border"><div class="h-full w-1/4 bg-[#0f766e]" /></div>
            <p class="mt-1.5 text-[10px] font-medium text-dc-gray">Across this view</p>
          </section>
          <span class="hidden h-10 w-px bg-dc-border lg:block" />
          <span v-if="!assigned" class="inline-flex min-h-10 items-center gap-1.5 px-1 text-[10px] font-semibold text-[#0f766e]">All assigned</span>
          <div class="w-full sm:w-52">
            <AppDropdown model-value="all" :options="phaseOptions" density="compact" disabled />
          </div>
          <div v-if="!assigned" class="w-full sm:w-auto">
            <div class="flex w-fit items-center rounded-full border border-dc-border bg-dc-paper-warm p-1">
              <NaviiAvatar v-for="owner in 3" :key="owner" :seed="`loading-owner-${owner}`" title="" :size="30" :class="owner > 1 ? '-ml-2.5' : ''" />
              <span class="ml-1 px-1.5 text-[11px] text-dc-gray">+4</span>
            </div>
          </div>
          <div class="flex w-full flex-wrap items-center justify-end gap-2 lg:w-auto">
            <button class="min-h-10 rounded-md border border-transparent px-3 font-sans text-[10px] font-semibold uppercase tracking-[0.1em] text-dc-gray/45" disabled>Clear</button>
          </div>
        </div>
      </div>
    </section>

    <section class="rounded-b-lg border-x-2 border-b-2 border-dc-ink bg-dc-paper">
      <div v-if="view === 'board'" class="hidden lg:block">
        <AnnualConferenceTaskBoard
          :tasks="tasks"
          :organizer-labels="organizerLabels"
          :owner-avatar-seeds="ownerAvatarSeeds"
          :can-delete-task="cannotChangeTask"
          :can-move-task="cannotChangeTask"
        />
      </div>
      <div :class="{ 'lg:hidden': view === 'board' }">
        <div class="hidden border-b border-dc-border bg-dc-paper-warm px-4 py-2 md:grid md:grid-cols-[minmax(0,1.6fr)_8.5rem_10rem_7rem_2.5rem] md:gap-3">
          <span v-for="label in ['Task', 'Status', 'Accountable', 'Target', '']" :key="label" class="font-sans text-[9px] font-semibold uppercase tracking-[0.12em] text-dc-gray">{{ label }}</span>
        </div>
        <article v-for="task in tasks.slice(0, 5)" :key="task.id" class="border-b border-dc-border last:border-b-0">
          <div class="grid min-h-14 grid-cols-[minmax(0,1fr)_2.5rem] items-center gap-3 px-4 py-2 md:grid-cols-[minmax(0,1.6fr)_8.5rem_10rem_7rem_2.5rem]">
            <div class="min-w-0 py-1">
              <span class="block truncate text-sm font-semibold text-dc-ink">{{ task.title }}</span>
              <span class="mt-0.5 flex min-w-0 items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.08em] text-dc-gray"><span class="truncate">Programme and speakers</span><span class="text-dc-pink">High</span><span>No phase</span></span>
              <span class="mt-1 flex items-center gap-2 md:hidden"><span class="rounded border px-1.5 py-0.5 text-[8px] font-semibold uppercase">Not started</span><span class="truncate text-[11px] text-dc-gray">Conference organizer</span></span>
            </div>
            <span class="hidden w-fit rounded-md border-2 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] md:inline-flex">Not started</span>
            <span class="hidden truncate text-xs font-semibold md:block">Conference organizer</span>
            <span class="hidden text-xs font-medium text-dc-gray md:block">1 Dec 2026</span>
            <span class="grid min-h-10 min-w-10 place-items-center">↗</span>
          </div>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped>
.loading-work-plan {
  min-width: 0;
}

.loading-phone-work-plan {
  display: grid;
  gap: 1rem;
  min-width: 0;
}

.loading-phone-work-plan__intro {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.15rem 0 0.35rem;
}

.loading-phone-work-plan__intro > div > span,
.loading-phone-work-plan__owner > span {
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.loading-phone-work-plan__intro h1 {
  margin: 0.35rem 0 0;
  font-size: 1.8rem;
  font-weight: 700;
  letter-spacing: -0.035em;
  line-height: 1.04;
}

.loading-phone-work-plan__intro p {
  margin: 0.55rem 0 0;
  color: #787774;
  font-size: 0.84rem;
  font-weight: 500;
  line-height: 1.5;
}

.loading-phone-work-plan__primary,
.loading-phone-work-plan__clear {
  min-height: 2.75rem;
  border-radius: 8px;
  padding: 0.55rem 0.85rem;
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.loading-phone-work-plan__primary {
  border: 1.5px solid #e8117f;
  background: #e8117f;
  color: white;
}

.loading-phone-work-plan__clear {
  background: transparent;
  color: #aaa;
}

.loading-phone-work-plan__search {
  display: grid;
  min-height: 3rem;
  grid-template-columns: 1.2rem minmax(0, 1fr);
  align-items: center;
  gap: 0.65rem;
  border: 1.5px solid #8f8b83;
  border-radius: 10px;
  background: white;
  padding: 0 0.8rem;
}

.loading-phone-work-plan__search svg,
.loading-phone-work-plan__task > svg {
  width: 20px;
  height: 20px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
}

.loading-phone-work-plan__search input {
  min-width: 0;
  border: 0;
  background: transparent;
  font-size: 1rem;
}

.loading-phone-work-plan__filters {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.7rem;
  border: 1px solid #ddd9d0;
  border-radius: 10px;
  background: white;
  padding: 0.8rem;
}

.loading-phone-work-plan__wide {
  grid-column: 1 / -1;
}

.loading-phone-work-plan__assigned {
  display: grid;
  gap: 0.7rem;
}

.loading-phone-work-plan__owner {
  border: 1px solid #ddd9d0;
  border-radius: 10px;
  background: white;
  padding: 0.75rem 0.85rem;
}

.loading-phone-work-plan__owner > span,
.loading-phone-work-plan__owner > strong {
  display: block;
}

.loading-phone-work-plan__owner > strong {
  margin-top: 0.2rem;
  font-size: 0.95rem;
}

.loading-phone-work-plan__list {
  overflow: hidden;
  border: 1px solid #ddd9d0;
  border-radius: 12px;
  background: white;
}

.loading-phone-work-plan__task {
  display: grid;
  min-height: 5.5rem;
  grid-template-columns: minmax(0, 1fr) 1.2rem;
  gap: 0.2rem 0.75rem;
  border-bottom: 1px solid #ddd9d0;
  padding: 0.85rem 1rem;
}

.loading-phone-work-plan__task > strong,
.loading-phone-work-plan__task > small,
.loading-phone-work-plan__meta {
  grid-column: 1;
}

.loading-phone-work-plan__task > strong {
  margin-top: 0.15rem;
  font-size: 0.92rem;
  line-height: 1.3;
}

.loading-phone-work-plan__task > small,
.loading-phone-work-plan__meta {
  color: #787774;
  font-size: 0.68rem;
  font-weight: 600;
}

.loading-phone-work-plan__task > svg {
  grid-column: 2;
  grid-row: 1 / 5;
  align-self: center;
}

.loading-phone-work-plan__meta {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
}

.loading-phone-work-plan__status {
  grid-column: 1;
  width: fit-content;
  border: 1px solid #bdb9b0;
  border-radius: 999px;
  padding: 0.18rem 0.42rem;
  font-size: 0.5rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
</style>
