<script setup lang="ts">
import AppDropdown from '@/src/components/AppDropdown.vue';
import NaviiAvatar from '@/src/components/NaviiAvatar.vue';

withDefaults(defineProps<{
  view: 'events' | 'access';
  owner?: boolean;
}>(), {
  owner: false,
});

const lifecycle = ['Draft', 'Call for proposals', 'Program ready', 'Live', 'Completed'];
const months = [{ value: 'all', label: 'All months' }];
const eventTypes = [{ value: 'all', label: 'All event types' }];
const roles = [{ value: 'organizer', label: 'Organizer' }];
const members = [{ value: 'member', label: 'Choose a person' }];
</script>

<template>
  <div v-if="view === 'events'">
    <section class="mb-4 rounded-lg border border-dc-border bg-dc-paper px-4 py-3">
      <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div class="shrink-0">
          <p class="editorial-eyebrow">Lifecycle</p>
          <h2 class="mt-1 text-lg font-bold tracking-tight text-dc-ink">Event lifecycle</h2>
          <p class="mt-1 text-xs font-medium text-dc-gray">From draft to completed.</p>
        </div>
        <ol class="lifecycle-track">
          <li v-for="(stage, index) in lifecycle" :key="stage" class="lifecycle-stage-card">
            <button class="lifecycle-stage-trigger" disabled><span class="lifecycle-stage-index">{{ index + 1 }}</span><span>{{ stage }}</span></button>
          </li>
        </ol>
      </div>
    </section>

    <section class="ops-panel">
      <div class="border-b border-dc-border bg-dc-paper-warm px-4 py-3">
        <div class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div><p class="editorial-eyebrow">Filter</p><p class="mt-1 text-sm font-medium text-dc-gray">4 events in all months</p></div>
          <div class="grid gap-3 sm:grid-cols-2 lg:w-[26rem]">
            <AppDropdown model-value="all" label="Month" :options="months" density="compact" disabled />
            <AppDropdown model-value="all" label="Type" :options="eventTypes" density="compact" disabled />
          </div>
        </div>
      </div>
      <div class="overflow-hidden">
        <div class="min-w-[900px]">
          <div class="ops-panel-header event-list-grid">
            <div v-for="label in ['Event', 'Tags', 'Date', 'Status', 'Actions']" :key="label" class="ops-label">{{ label }}</div>
          </div>
          <div v-for="row in 4" :key="row" class="ops-row event-list-grid min-h-[64px]">
            <div><div class="event-list-title">Community meetup</div><div class="event-list-meta">December 2026</div></div>
            <div class="event-list-tags"><span class="rounded-sm border px-2 py-0.5 text-[10px] font-semibold uppercase">Meetup</span></div>
            <div class="event-list-date">19 Dec 2026</div>
            <div class="event-list-status"><div class="event-list-dots"><span v-for="dot in 5" :key="dot" class="event-list-dot" /></div><span class="event-list-status-label">Draft</span></div>
            <div class="event-list-actions"><span class="event-list-primary-action">Open event →</span><button class="event-list-remove-action" disabled>Remove</button></div>
          </div>
        </div>
      </div>
    </section>
  </div>

  <div v-else class="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
    <section v-if="owner" class="min-w-0 overflow-hidden rounded-lg border border-dc-border bg-dc-paper xl:col-span-2">
      <div class="flex flex-wrap items-end justify-between gap-4 border-b border-dc-border p-4 sm:px-5">
        <div>
          <p class="editorial-eyebrow">Review queue</p>
          <h2 class="mt-1 text-lg font-semibold text-dc-ink">Access requests</h2>
          <p class="mt-1 text-xs leading-5 text-dc-gray">Review each request, then choose a workspace role when approving.</p>
        </div>
        <input class="editorial-input w-full !min-h-11 !rounded-md !px-3 !py-2 !text-sm sm:!w-72" placeholder="Search name, email or reason" disabled />
      </div>
      <table class="block w-full text-left text-sm sm:table">
        <thead class="hidden border-b border-dc-border bg-dc-paper-warm text-xs text-dc-gray sm:table-header-group"><tr><th v-for="label in ['Person', 'How they’d like to help', 'Requested', 'Review']" :key="label" class="px-5 py-3 font-medium">{{ label }}</th></tr></thead>
        <tbody class="block divide-y divide-dc-border sm:table-row-group">
          <tr v-for="row in 2" :key="row" class="block p-4 sm:table-row sm:p-0">
            <td class="block break-words pb-2 sm:table-cell sm:w-1/4 sm:px-5 sm:py-4"><p class="font-semibold">Community member</p><p class="mt-0.5 text-xs text-dc-gray">member@example.com</p></td>
            <td class="block pb-2 text-xs leading-5 text-dc-gray sm:table-cell sm:w-2/5 sm:px-5 sm:py-4">Help organize community events.</td>
            <td class="block pb-3 text-xs text-dc-gray sm:table-cell sm:px-5 sm:py-4">28 Oct 2026</td>
            <td class="block sm:table-cell sm:px-5 sm:py-3"><button class="min-h-11 rounded-md border border-dc-border px-3 text-xs font-semibold" disabled>Review →</button></td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="rounded-lg border border-dc-border bg-dc-paper p-4 xl:col-start-2 xl:row-start-2">
      <p class="editorial-eyebrow">Invite</p>
      <h2 class="mt-1 text-lg font-semibold text-dc-ink">Add access</h2>
      <p class="mt-1 text-xs leading-5 text-dc-gray">Add one person and choose the access they need.</p>
      <div class="mt-3 grid gap-2.5">
        <label><span class="editorial-label">Email</span><input class="editorial-input mt-1.5 !min-h-10 !rounded-md !px-3 !py-2 !text-sm" placeholder="person@devcongress.org" disabled /></label>
        <label><span class="editorial-label">Display name</span><input class="editorial-input mt-1.5 !min-h-10 !rounded-md !px-3 !py-2 !text-sm" placeholder="Full name" disabled /></label>
        <AppDropdown model-value="organizer" label="Role" :options="roles" density="compact" disabled />
        <button class="editorial-action min-h-10 w-full justify-center" disabled>Add person</button>
      </div>
    </section>

    <section v-if="owner" class="rounded-lg border border-dc-border bg-dc-paper p-4 xl:col-start-2 xl:row-start-3">
      <p class="editorial-eyebrow">Delegation</p>
      <h2 class="mt-1 text-lg font-semibold text-dc-ink">Conference responsibilities</h2>
      <p class="mt-1 text-xs leading-5 text-dc-gray">Give a member access to specific Annual Conference sections without changing their role.</p>
      <div class="mt-3 grid gap-2.5"><AppDropdown model-value="member" label="Team member" :options="members" density="compact" disabled /><button class="editorial-action min-h-10 w-full justify-center" disabled>Open delegation</button></div>
      <p class="mt-3 border-t border-dc-border pt-3 text-[11px] leading-4 text-dc-gray">Volunteers remain limited to assigned tasks.</p>
    </section>

    <section class="min-w-0 overflow-hidden rounded-lg border border-dc-border bg-dc-paper xl:col-start-1 xl:row-span-2 xl:row-start-2">
      <div class="flex items-center justify-between gap-4 border-b border-dc-border px-4 py-3 sm:px-5">
        <div><h2 class="text-lg font-semibold text-dc-ink">Team access</h2><p class="mt-0.5 text-xs text-dc-gray">Names, roles, and recent sign-in activity.</p></div>
        <span class="text-[11px] font-semibold uppercase text-dc-gray">4 total</span>
      </div>
      <div class="overflow-hidden">
        <table class="w-full min-w-[46rem] border-collapse text-left">
          <thead class="bg-dc-paper-warm"><tr class="text-[9px] font-semibold uppercase tracking-[0.12em] text-dc-gray"><th v-for="label in ['Person', 'Role', 'Last sign-in', 'Status', '']" :key="label" class="px-5 py-2.5">{{ label }}</th></tr></thead>
          <tbody class="divide-y divide-dc-border">
            <tr v-for="row in 4" :key="row">
              <td class="px-5 py-3"><span class="flex items-center gap-3"><NaviiAvatar :seed="`loading-team-${row}`" title="" :size="36" /><span><strong class="block text-sm font-semibold">Community organizer</strong><span class="mt-0.5 block text-xs text-dc-gray">Email hidden</span></span></span></td>
              <td class="px-3 py-3 text-xs"><span class="rounded-md border border-dc-border px-2 py-1">Organizer</span></td>
              <td class="px-3 py-3 text-xs text-dc-gray">28 Oct 2026</td>
              <td class="px-3 py-3 text-xs">Active</td>
              <td class="px-5 py-3 text-right"><button class="rounded-md border border-dc-border px-3 py-2 text-[10px] font-semibold uppercase" disabled>Access</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>
