<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import type { Talk, TalkStatus } from '@/types';
import AdminEventTabs from '@/src/components/AdminEventTabs.vue';
import { adminPath } from '@/src/admin-routes';

const route = useRoute();
const talks = ref<Talk[]>([]);
const loading = ref(true);
const message = ref<string | null>(null);
const error = ref<string | null>(null);
const groups: { label: string; statuses: TalkStatus[] }[] = [
  { label: 'Pending review', statuses: ['submitted'] },
  { label: 'Accepted', statuses: ['accepted', 'slides_received'] },
  { label: 'Published', statuses: ['published'] },
  { label: 'Rejected', statuses: ['rejected'] },
];

const groupedTalks = computed(() => groups.map((group) => ({
  ...group,
  talks: talks.value.filter((talk) => group.statuses.includes(talk.status)),
})));

async function fetchTalks() {
  const response = await fetch(`/api/events/${route.params.eventId}/talks`);
  if (response.ok) talks.value = await response.json();
  loading.value = false;
}

async function setStatus(talkId: string, status: TalkStatus) {
  message.value = null;
  error.value = null;
  const response = await fetch(`/api/talks/${talkId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (response.ok) {
    await fetchTalks();
  } else {
    const data = await response.json();
    error.value = data.error || 'Failed to update talk';
  }
}

async function sendReminder(talkId: string) {
  message.value = null;
  error.value = null;

  const response = await fetch(`/api/talks/${talkId}/reminder`, { method: 'POST' });
  if (response.ok) {
    message.value = 'Reminder logged for speaker follow-up.';
    await fetchTalks();
  } else {
    const data = await response.json();
    error.value = data.error || 'Failed to send reminder';
  }
}

function slideLabel(talk: Talk): string {
  if (talk.slides_uploaded_at) {
    return `Slides received ${new Date(talk.slides_uploaded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  }

  if (talk.status === 'accepted') {
    return talk.reminder_sent_count > 0
      ? `${talk.reminder_sent_count} reminder${talk.reminder_sent_count === 1 ? '' : 's'} sent`
      : 'Needs slides';
  }

  return 'Slides not required yet';
}

function actionClass(isPrimary = false): string {
  return isPrimary
    ? 'rounded-md bg-dc-yellow px-4 py-2 font-mono text-xs font-bold uppercase tracking-wide text-dc-dark transition-all hover:shadow-glow disabled:opacity-40'
    : 'rounded-md border border-dc-yellow/10 bg-dc-yellow/[0.03] px-4 py-2 font-mono text-xs font-bold uppercase tracking-wide text-dc-gray-light transition-colors hover:border-dc-yellow/35 hover:text-white disabled:opacity-40';
}

onMounted(fetchTalks);
</script>

<template>
  <div class="editorial-page">
    <div class="editorial-wrap">
      <RouterLink :to="adminPath(`events/${route.params.eventId}`)" class="mb-6 inline-flex items-center gap-2 font-mono text-dc-yellow hover:text-dc-yellow-glow">
        <span>&larr;</span> BACK TO EVENT
      </RouterLink>
      <AdminEventTabs :event-id="String(route.params.eventId)" />
      <div class="editorial-header">
        <p class="editorial-eyebrow">program desk</p>
        <h1 class="editorial-title">Talk Management</h1>
        <p class="editorial-subtitle">Review submissions, accept speakers, and publish talks into the public archive.</p>
      </div>

      <div v-if="message" class="mb-4 rounded-md border border-dc-yellow/20 bg-dc-yellow/[0.06] px-4 py-3 text-sm text-dc-gray-light">{{ message }}</div>
      <div v-if="error" class="mb-4 rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{{ error }}</div>

      <div v-if="loading" class="py-12 text-center font-mono text-white">LOADING...</div>
      <template v-else>
        <section v-for="group in groupedTalks.filter((item) => item.talks.length > 0)" :key="group.label" class="mb-8">
          <h2 class="mb-3 flex items-center gap-3 text-lg font-black tracking-tight text-white">
            {{ group.label }}
            <span class="font-mono text-xs font-semibold text-dc-gray">({{ group.talks.length }})</span>
          </h2>
          <div class="overflow-hidden rounded-lg border border-dc-yellow/10 bg-[#151514]/80">
            <article v-for="talk in group.talks" :key="talk.id" class="border-b border-dc-yellow/10 p-5 last:border-b-0">
              <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div class="min-w-0">
                  <div class="mb-2 flex flex-wrap items-center gap-2">
                    <h3 class="text-xl font-black tracking-tight text-white">{{ talk.title }}</h3>
                    <span class="rounded-md border border-dc-yellow/15 bg-dc-yellow/[0.04] px-2.5 py-1 font-mono text-[11px] font-bold uppercase tracking-wide text-dc-gray-light">{{ talk.status.replace('_', ' ') }}</span>
                  </div>
                  <p class="text-sm text-dc-gray-light">{{ talk.speaker_name }} · {{ talk.speaker_email }}</p>
                  <p v-if="talk.abstract" class="mt-3 max-w-4xl text-sm leading-6 text-dc-gray-light">{{ talk.abstract }}</p>
                  <p class="mt-3 font-mono text-xs uppercase tracking-wide text-dc-gray">
                    {{ talk.topic || 'General' }} <span class="mx-2 text-dc-yellow/30">/</span> {{ slideLabel(talk) }}
                  </p>
                </div>
                <div class="flex shrink-0 flex-wrap gap-2 lg:justify-end">
                  <button :class="actionClass()" @click="setStatus(talk.id, 'accepted')">Accept</button>
                  <button :class="actionClass()" @click="setStatus(talk.id, 'rejected')">Reject</button>
                  <button :class="actionClass(true)" @click="setStatus(talk.id, 'published')">Publish</button>
                  <button
                    v-if="talk.status === 'accepted' && !talk.slides_uploaded_at"
                    :class="actionClass()"
                    @click="sendReminder(talk.id)"
                  >
                    Remind
                  </button>
                </div>
              </div>
            </article>
          </div>
        </section>
        <div v-if="talks.length === 0" class="editorial-panel p-12 text-center">
          <p class="font-mono text-dc-gray">No talk submissions yet</p>
        </div>
      </template>
    </div>
  </div>
</template>
