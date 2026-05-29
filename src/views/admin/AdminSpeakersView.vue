<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import type { Event, EventSpeaker } from '@/types';
import AdminEventTabs from '@/src/components/AdminEventTabs.vue';

const route = useRoute();
const event = ref<Event | null>(null);
const speakers = ref<EventSpeaker[]>([]);
const loading = ref(true);
const adding = ref(false);
const error = ref<string | null>(null);
const form = reactive({ email: '', name: '' });

async function fetchAll() {
  const [eventResponse, speakersResponse] = await Promise.all([
    fetch(`/api/events/${route.params.eventId}`),
    fetch(`/api/events/${route.params.eventId}/speakers`),
  ]);
  if (eventResponse.ok) event.value = await eventResponse.json();
  if (speakersResponse.ok) speakers.value = await speakersResponse.json();
  loading.value = false;
}

async function addNewSpeaker() {
  adding.value = true;
  error.value = null;
  const response = await fetch(`/api/events/${route.params.eventId}/speakers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(form),
  });
  if (response.ok) {
    form.email = '';
    form.name = '';
    await fetchAll();
  } else {
    const data = await response.json();
    error.value = data.error || 'Failed to add speaker';
  }
  adding.value = false;
}

async function removeExistingSpeaker(speakerId: string) {
  const response = await fetch(`/api/events/${route.params.eventId}/speakers/${speakerId}`, { method: 'DELETE' });
  if (response.ok) await fetchAll();
}

onMounted(fetchAll);
</script>

<template>
  <div class="editorial-page">
    <div class="editorial-wrap">
      <RouterLink :to="`/admin/events/${route.params.eventId}`" class="mb-6 inline-flex items-center gap-2 font-mono text-dc-yellow hover:text-dc-yellow-glow">
        <span>&larr;</span> BACK TO EVENT
      </RouterLink>
      <AdminEventTabs :event-id="String(route.params.eventId)" />

      <div v-if="loading" class="py-12 text-center font-mono text-white">LOADING...</div>
      <template v-else>
        <div class="editorial-header">
          <p class="editorial-eyebrow">speaker access</p>
          <h1 class="editorial-title">Manage Speakers</h1>
          <p class="editorial-subtitle">{{ event?.name }}</p>
        </div>

        <section class="editorial-panel mb-8 p-6">
          <h2 class="mb-4 text-2xl font-black tracking-tight text-white">Add Speaker</h2>
          <div v-if="error" class="mb-4 border border-red-500/50 bg-red-500/10 px-4 py-3 text-red-200">{{ error }}</div>
          <form class="space-y-4" @submit.prevent="addNewSpeaker">
            <input v-model="form.email" required type="email" placeholder="speaker@example.com" class="editorial-input font-mono" />
            <input v-model="form.name" required placeholder="Speaker Name" class="editorial-input font-mono" />
            <button type="submit" :disabled="adding" class="editorial-action disabled:opacity-50">{{ adding ? 'ADDING...' : 'ADD SPEAKER' }}</button>
          </form>
        </section>

        <section class="editorial-panel p-6">
          <h2 class="mb-4 text-2xl font-black tracking-tight text-white">Approved Speakers <span class="text-base text-dc-gray">({{ speakers.length }})</span></h2>
          <p v-if="speakers.length === 0" class="py-8 text-center font-mono text-dc-gray-light">NO SPEAKERS ADDED YET</p>
          <div v-else class="space-y-3">
            <div v-for="speaker in speakers" :key="speaker.id" class="group flex items-center justify-between rounded-md border border-dc-yellow/10 bg-dc-yellow/[0.03] p-4 transition-colors hover:border-dc-yellow/30">
              <div>
                <p class="font-mono font-bold text-white">{{ speaker.name }}</p>
                <p class="font-mono text-sm text-dc-gray-light">{{ speaker.email }}</p>
              </div>
              <button class="rounded-md border border-red-700/70 bg-red-900/40 px-4 py-2 font-mono text-sm uppercase text-red-200 transition-all hover:border-red-500 hover:bg-red-900/60" @click="removeExistingSpeaker(speaker.id)">REMOVE</button>
            </div>
          </div>
        </section>
      </template>
    </div>
  </div>
</template>
