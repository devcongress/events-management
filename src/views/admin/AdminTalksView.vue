<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import type { Talk, TalkStatus } from '@/types';
import AdminEventTabs from '@/src/components/AdminEventTabs.vue';

const route = useRoute();
const talks = ref<Talk[]>([]);
const loading = ref(true);
const message = ref<string | null>(null);
const error = ref<string | null>(null);
const groups: { label: string; statuses: TalkStatus[]; accent: string }[] = [
  { label: 'PENDING_REVIEW', statuses: ['submitted'], accent: 'text-dc-yellow' },
  { label: 'ACCEPTED_TALKS', statuses: ['accepted', 'slides_received'], accent: 'text-green-400' },
  { label: 'PUBLISHED', statuses: ['published'], accent: 'text-purple-400' },
  { label: 'REJECTED', statuses: ['rejected'], accent: 'text-red-400' },
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

onMounted(fetchTalks);
</script>

<template>
  <div class="editorial-page">
    <div class="editorial-wrap">
      <RouterLink :to="`/admin/events/${route.params.eventId}`" class="mb-6 inline-flex items-center gap-2 font-mono text-dc-yellow hover:text-dc-yellow-glow">
        <span>&larr;</span> BACK TO EVENT
      </RouterLink>
      <AdminEventTabs :event-id="String(route.params.eventId)" />
      <div class="editorial-header">
        <p class="editorial-eyebrow">program desk</p>
        <h1 class="editorial-title">Talk Management</h1>
        <p class="editorial-subtitle">Review submissions, accept speakers, and publish talks into the public archive.</p>
      </div>

      <div v-if="message" class="mb-4 border border-green-500/50 bg-green-500/10 px-4 py-3 text-sm text-green-200">{{ message }}</div>
      <div v-if="error" class="mb-4 border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm text-red-200">{{ error }}</div>

      <div v-if="loading" class="py-12 text-center font-mono text-white">LOADING...</div>
      <template v-else>
        <section v-for="group in groupedTalks.filter((item) => item.talks.length > 0)" :key="group.label" class="mb-8">
          <h2 class="mb-4 flex items-center gap-3 font-mono text-xl font-bold text-white">
            <span :class="group.accent">&gt;</span> {{ group.label }}
            <span class="text-base text-dc-gray">({{ group.talks.length }})</span>
          </h2>
          <div class="space-y-4">
            <article v-for="talk in group.talks" :key="talk.id" class="editorial-panel p-6">
              <div class="mb-4 flex items-start justify-between gap-4">
                <div>
                  <h3 class="mb-2 font-mono text-xl font-bold text-white">{{ talk.title }}</h3>
                  <p class="font-mono text-sm text-dc-yellow">{{ talk.speaker_name }} &lt;{{ talk.speaker_email }}&gt;</p>
                </div>
                <span class="border border-current px-3 py-1 font-mono text-xs font-bold uppercase text-dc-yellow">{{ talk.status.replace('_', ' ') }}</span>
              </div>
              <p v-if="talk.abstract" class="mb-4 text-sm leading-relaxed text-white/80">{{ talk.abstract }}</p>
              <div class="mb-4 grid gap-3 border-y border-dc-yellow/10 py-4 text-sm sm:grid-cols-3">
                <div>
                  <p class="editorial-label">topic</p>
                  <p class="mt-1 font-semibold text-white">{{ talk.topic || 'General' }}</p>
                </div>
                <div>
                  <p class="editorial-label">slides</p>
                  <p class="mt-1 font-semibold" :class="talk.slides_uploaded_at ? 'text-green-300' : talk.status === 'accepted' ? 'text-dc-yellow' : 'text-dc-gray-light'">
                    {{ slideLabel(talk) }}
                  </p>
                </div>
                <div v-if="talk.last_reminder_sent_at">
                  <p class="editorial-label">last reminder</p>
                  <p class="mt-1 font-semibold text-dc-gray-light">
                    {{ new Date(talk.last_reminder_sent_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) }}
                  </p>
                </div>
              </div>
              <div class="flex flex-wrap gap-2 border-t-2 border-dc-dark-3 pt-4">
                <button class="bg-green-900/30 px-4 py-2 font-mono text-sm font-bold text-green-400" @click="setStatus(talk.id, 'accepted')">ACCEPT</button>
                <button class="bg-red-900/30 px-4 py-2 font-mono text-sm font-bold text-red-400" @click="setStatus(talk.id, 'rejected')">REJECT</button>
                <button class="bg-purple-900/30 px-4 py-2 font-mono text-sm font-bold text-purple-400" @click="setStatus(talk.id, 'published')">PUBLISH</button>
                <button
                  v-if="talk.status === 'accepted' && !talk.slides_uploaded_at"
                  class="border border-dc-yellow/40 px-4 py-2 font-mono text-sm font-bold text-dc-yellow"
                  @click="sendReminder(talk.id)"
                >
                  REMIND SLIDES
                </button>
              </div>
            </article>
          </div>
        </section>
        <div v-if="talks.length === 0" class="border-2 border-dc-dark-3 bg-dc-dark-1 p-12 text-center">
          <p class="font-mono text-dc-gray">No talk submissions yet</p>
        </div>
      </template>
    </div>
  </div>
</template>
