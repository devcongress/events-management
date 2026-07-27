<script setup lang="ts">
import { computed, ref } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import AnnualConferenceNav from '@/src/components/AnnualConferenceNav.vue';
import {
  DECEMBER_2026_VOLUNTEER_PUBLIC_PATH,
  annualConferencePath,
} from '@/src/annual-conference';
import { fetchVolunteerApplications, queryKeys } from '@/src/lib/api';
import { notify } from '@/src/lib/notify';

const volunteerQuery = useQuery({
  queryKey: queryKeys.volunteerApplications,
  queryFn: fetchVolunteerApplications,
});
const applications = computed(() => volunteerQuery.data.value?.applications ?? []);
const publicUrl = `${window.location.origin}${DECEMBER_2026_VOLUNTEER_PUBLIC_PATH}`;
const copied = ref(false);

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

async function copyPublicUrl() {
  try {
    await navigator.clipboard.writeText(publicUrl);
    copied.value = true;
    window.setTimeout(() => { copied.value = false; }, 1800);
  } catch {
    notify.error('Unable to copy the volunteer form link.');
  }
}

function openVolunteerDisplay() {
  window.open(annualConferencePath('volunteers/display'), '_blank', 'noopener,noreferrer');
}
</script>

<template>
  <div class="editorial-page">
    <div class="editorial-wrap">
      <AnnualConferenceNav
        title="Volunteers"
        description="Share the sign-up, show its QR code, and review applications."
      >
        <template #actions>
        <div class="flex flex-wrap items-center gap-2" aria-label="Volunteer form actions">
          <button
            type="button"
            class="motion-press min-h-10 rounded-md border-2 border-dc-ink bg-dc-pink px-4 py-2 font-mono text-[10px] font-black uppercase tracking-[0.1em] text-white shadow-[2px_2px_0_#111111]"
            @click="openVolunteerDisplay"
          >
            Show QR
          </button>
          <button
            type="button"
            class="motion-press min-h-10 rounded-md border-2 border-dc-ink bg-dc-paper px-4 py-2 font-mono text-[10px] font-black uppercase tracking-[0.1em] text-dc-ink hover:bg-dc-yellow"
            @click="copyPublicUrl"
          >
            {{ copied ? 'Copied' : 'Copy link' }}
          </button>
          <a
            :href="publicUrl"
            target="_blank"
            rel="noreferrer"
            class="motion-press inline-flex min-h-10 items-center rounded-md border-2 border-dc-ink bg-dc-paper px-4 py-2 font-mono text-[10px] font-black uppercase tracking-[0.1em] text-dc-ink hover:bg-dc-yellow"
          >
            Open form
          </a>
        </div>
        </template>
      </AnnualConferenceNav>

      <section class="editorial-panel overflow-hidden">
        <div class="flex flex-wrap items-end justify-between gap-4 border-b border-dc-border px-5 py-5 sm:px-6">
          <div>
            <p class="editorial-eyebrow mb-2">Volunteer applications</p>
            <h2 class="text-2xl font-black tracking-tight text-dc-ink">{{ applications.length }} signed up</h2>
          </div>
        </div>

        <div v-if="volunteerQuery.isPending.value" class="p-6 text-dc-gray">Loading applications…</div>
        <div v-else-if="volunteerQuery.isError.value" class="p-6 text-red-800">Unable to load volunteer applications.</div>
        <div v-else-if="applications.length === 0" class="p-6 text-dc-gray">No volunteer applications yet.</div>
        <div v-else class="divide-y divide-dc-border">
          <article v-for="application in applications" :key="application.id" class="grid gap-3 px-5 py-5 sm:px-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-center">
            <div>
              <h3 class="text-lg font-black tracking-tight text-dc-ink">{{ application.name }}</h3>
              <a :href="`mailto:${application.email}`" class="font-semibold text-dc-pink underline decoration-dc-yellow decoration-2 underline-offset-4">{{ application.email }}</a>
            </div>
            <p class="font-mono text-sm font-semibold text-dc-gray">X: {{ application.x_handle }}</p>
            <p class="font-mono text-sm font-semibold text-dc-gray">Slack: {{ application.slack_name }}</p>
            <time class="font-mono text-[11px] font-bold uppercase tracking-wide text-dc-gray">{{ formatDate(application.created_at) }}</time>
          </article>
        </div>
      </section>
    </div>
  </div>
</template>
