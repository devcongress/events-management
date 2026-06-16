<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import AdminTalksPageSkeleton from '@/src/components/ui/page-skeletons/AdminTalksPageSkeleton.vue';
import type { Talk, TalkStatus } from '@/types';

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
    ? 'motion-press rounded-md border-2 border-dc-ink bg-dc-yellow px-4 py-2 font-mono text-xs font-bold uppercase tracking-wide text-dc-ink shadow-[2px_2px_0_#111111] disabled:opacity-40'
    : 'motion-press rounded-md border-2 border-dc-border bg-dc-paper px-4 py-2 font-mono text-xs font-bold uppercase tracking-wide text-dc-gray hover:border-dc-ink hover:text-dc-ink disabled:opacity-40';
}

onMounted(fetchTalks);
</script>

<template>
  <div class="editorial-page">
    <div class="editorial-wrap">
      <div class="editorial-header">
        <p class="editorial-eyebrow">program desk</p>
        <h1 class="editorial-title">Talk Management</h1>
        <p class="editorial-subtitle">Review submissions, accept speakers, and publish talks into the public archive.</p>
      </div>

      <div v-if="message" class="mb-4 rounded-md border border-dc-success bg-dc-success-soft px-4 py-3 text-sm font-semibold text-dc-success">{{ message }}</div>
      <div v-if="error" class="mb-4 rounded-md border-2 border-red-500 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{{ error }}</div>

      <AdminTalksPageSkeleton v-if="loading" />
      <template v-else>
        <section v-for="group in groupedTalks.filter((item) => item.talks.length > 0)" :key="group.label" class="mb-8">
          <h2 class="mb-3 flex items-center gap-3 text-lg font-black tracking-tight text-dc-ink">
            {{ group.label }}
            <span class="font-mono text-xs font-semibold text-dc-gray">({{ group.talks.length }})</span>
          </h2>
          <div class="ops-panel overflow-hidden">
            <article v-for="talk in group.talks" :key="talk.id" class="ops-row p-4">
              <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div class="min-w-0">
                  <div class="mb-2 flex flex-wrap items-center gap-2">
                    <h3 class="text-xl font-black tracking-tight text-dc-ink">{{ talk.title }}</h3>
                    <span class="rounded-md border border-dc-border bg-dc-paper-warm px-2.5 py-1 font-mono text-[11px] font-bold uppercase tracking-wide text-dc-gray">{{ talk.status.replace('_', ' ') }}</span>
                  </div>
                  <p class="text-sm text-dc-gray">{{ talk.speaker_name }} · {{ talk.speaker_email }}</p>
                  <p v-if="talk.abstract" class="mt-3 max-w-4xl text-sm leading-6 text-dc-gray">{{ talk.abstract }}</p>
                  <p class="mt-3 font-mono text-xs uppercase tracking-wide text-dc-gray">
                    {{ talk.topic || 'General' }} <span class="mx-2 text-dc-pink">/</span> {{ slideLabel(talk) }}
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
