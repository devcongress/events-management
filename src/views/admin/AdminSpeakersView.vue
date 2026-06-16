<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import AdminSpeakersPageSkeleton from '@/src/components/ui/page-skeletons/AdminSpeakersPageSkeleton.vue';
import type { Event, EventSpeaker } from '@/types';

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
      <AdminSpeakersPageSkeleton v-if="loading" />
      <template v-else>
        <div class="editorial-header">
          <p class="editorial-eyebrow">speaker access</p>
          <h1 class="editorial-title">Manage Speakers</h1>
          <p class="editorial-subtitle">{{ event?.name }}</p>
        </div>

        <section class="ops-panel mb-8 p-5">
          <h2 class="mb-4 text-2xl font-black tracking-tight text-dc-ink">Add Speaker</h2>
          <div v-if="error" class="mb-4 rounded-md border-2 border-red-500 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{{ error }}</div>
          <form class="space-y-4" @submit.prevent="addNewSpeaker">
            <input v-model="form.email" required type="email" placeholder="speaker@example.com" class="editorial-input font-mono" />
            <input v-model="form.name" required placeholder="Speaker Name" class="editorial-input font-mono" />
            <button type="submit" :disabled="adding" class="editorial-action disabled:opacity-50">{{ adding ? 'ADDING...' : 'ADD SPEAKER' }}</button>
          </form>
        </section>

        <section class="ops-panel p-5">
          <h2 class="mb-4 text-2xl font-black tracking-tight text-dc-ink">Approved Speakers <span class="text-base text-dc-gray">({{ speakers.length }})</span></h2>
          <p v-if="speakers.length === 0" class="py-8 text-center font-mono text-dc-gray">NO SPEAKERS ADDED YET</p>
          <div v-else class="space-y-3">
            <div v-for="speaker in speakers" :key="speaker.id" class="motion-colors flex items-center justify-between rounded-md border border-dc-border bg-dc-paper px-4 py-3 hover:bg-dc-paper-warm">
              <div>
                <p class="font-mono font-bold text-dc-ink">{{ speaker.name }}</p>
                <p class="font-mono text-sm text-dc-gray">{{ speaker.email }}</p>
              </div>
              <button class="motion-press rounded-md border-2 border-red-500 bg-red-50 px-4 py-2 font-mono text-sm font-bold uppercase text-red-700 hover:bg-red-100" @click="removeExistingSpeaker(speaker.id)">REMOVE</button>
            </div>
          </div>
        </section>
      </template>
    </div>
  </div>
</template>
