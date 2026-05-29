<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import type { Talk, TalkStatus } from '@/types';
import AdminEventTabs from '@/src/components/AdminEventTabs.vue';

const route = useRoute();
const talks = ref<Talk[]>([]);
const loading = ref(true);
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
  const response = await fetch(`/api/talks/${talkId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (response.ok) await fetchTalks();
}

onMounted(fetchTalks);
</script>

<template>
  <div class="editorial-page">
    <div class="editorial-wrap">
      <RouterLink :to="`/admin/events/${route.params.eventId}`" class="mb-6 inline-flex items-center gap-2 font-mono text-dc-yellow hover:text-dc-yellow-glow">
        <span>&larr;</span> BACK TO EVENT
      </RouterLink>
      <div class="editorial-header">
        <p class="editorial-eyebrow">program desk</p>
        <h1 class="editorial-title">Talk Management</h1>
        <p class="editorial-subtitle">Review submissions, accept speakers, and publish talks into the public archive.</p>
      </div>
      <AdminEventTabs :event-id="String(route.params.eventId)" />

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
              <div class="flex flex-wrap gap-2 border-t-2 border-dc-dark-3 pt-4">
                <button class="bg-green-900/30 px-4 py-2 font-mono text-sm font-bold text-green-400" @click="setStatus(talk.id, 'accepted')">ACCEPT</button>
                <button class="bg-red-900/30 px-4 py-2 font-mono text-sm font-bold text-red-400" @click="setStatus(talk.id, 'rejected')">REJECT</button>
                <button class="bg-purple-900/30 px-4 py-2 font-mono text-sm font-bold text-purple-400" @click="setStatus(talk.id, 'published')">PUBLISH</button>
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
