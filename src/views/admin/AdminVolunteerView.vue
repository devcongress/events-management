<script setup lang="ts">
import { computed, ref } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { adminPath } from '@/src/admin-routes';
import { fetchVolunteerApplications, queryKeys } from '@/src/lib/api';
import { notify } from '@/src/lib/notify';

const volunteerQuery = useQuery({
  queryKey: queryKeys.volunteerApplications,
  queryFn: fetchVolunteerApplications,
});
const applications = computed(() => volunteerQuery.data.value?.applications ?? []);
const publicUrl = `${window.location.origin}/volunteer/december-mega-meetup`;
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
  window.open(adminPath('volunteer-display'), '_blank', 'noopener,noreferrer');
}
</script>

<template>
  <div class="editorial-page">
    <div class="editorial-wrap">
      <header class="feedback-hub-hero">
        <div>
          <p class="editorial-eyebrow">December Mega Meetup</p>
          <h1 class="editorial-title">Volunteers</h1>
          <p class="editorial-subtitle max-w-3xl">Share the form or put the QR display on screen, then review the people who signed up to help.</p>
        </div>
      </header>

      <section class="editorial-panel mb-8 overflow-hidden">
        <div class="border-b-2 border-dc-ink bg-dc-yellow px-5 py-4 sm:px-6">
          <p class="editorial-eyebrow mb-1 text-dc-ink">Volunteer drive</p>
          <h2 class="text-2xl font-black tracking-tight text-dc-ink">Share the sign-up.</h2>
        </div>
        <div class="flex flex-wrap items-center gap-3 p-5 sm:p-6">
          <button type="button" class="editorial-action motion-press" @click="openVolunteerDisplay">Show QR</button>
          <button type="button" class="editorial-secondary-action motion-press" @click="copyPublicUrl">{{ copied ? 'Copied' : 'Copy form link' }}</button>
          <a :href="publicUrl" target="_blank" rel="noreferrer" class="editorial-secondary-action">Open form</a>
        </div>
      </section>

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
