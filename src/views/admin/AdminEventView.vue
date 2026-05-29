<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import type { Event, EventStatus } from '@/types';
import AdminEventTabs from '@/src/components/AdminEventTabs.vue';
import { adminPath } from '@/src/admin-routes';

const route = useRoute();
const event = ref<Event | null>(null);
const loading = ref(true);
const statusFlow: EventStatus[] = ['draft', 'cfp_open', 'cfp_closed', 'upcoming', 'live', 'completed'];

async function fetchEvent() {
  const response = await fetch(`/api/events/${route.params.eventId}`);
  if (response.ok) event.value = await response.json();
  loading.value = false;
}

async function updateStatus(status: EventStatus) {
  const response = await fetch(`/api/events/${route.params.eventId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (response.ok) await fetchEvent();
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(value));
}

onMounted(fetchEvent);
</script>

<template>
  <div class="editorial-page">
    <div class="editorial-wrap">
      <RouterLink :to="adminPath('events')" class="mb-6 inline-flex items-center gap-2 font-mono text-dc-yellow hover:text-dc-yellow-glow">
        <span>&larr;</span> BACK TO EVENTS
      </RouterLink>

      <div v-if="loading" class="py-12 text-center font-mono text-white">LOADING...</div>
      <div v-else-if="!event" class="py-12 text-center font-mono text-dc-gray">EVENT NOT FOUND</div>

      <template v-else>
        <AdminEventTabs :event-id="event.id" />

        <div class="mb-8 flex flex-col gap-4 border-b border-dc-yellow/10 pb-7 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p class="editorial-eyebrow">event control</p>
            <h1 class="text-4xl font-black tracking-tight text-white sm:text-5xl">{{ event.name }}</h1>
            <p v-if="event.description" class="mt-4 max-w-3xl text-base leading-7 text-dc-gray-light">{{ event.description }}</p>
          </div>
          <div class="flex flex-wrap gap-2 font-mono text-xs uppercase tracking-wide">
            <span class="rounded-md border border-dc-yellow/10 bg-dc-yellow/[0.03] px-3 py-2 text-dc-gray-light">{{ formatDate(event.event_date) }}</span>
            <span class="rounded-md border border-dc-yellow/30 bg-dc-yellow/[0.08] px-3 py-2 font-bold text-dc-yellow">{{ event.status.replace('_', ' ') }}</span>
          </div>
        </div>

        <section class="editorial-panel max-w-4xl p-5 sm:p-6">
          <div class="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p class="editorial-eyebrow mb-2">status</p>
              <h2 class="text-xl font-black tracking-tight text-white">Lifecycle</h2>
            </div>
            <p class="font-mono text-xs uppercase tracking-wide text-dc-gray">
              Current: <span class="font-bold text-dc-yellow">{{ event.status.replace('_', ' ') }}</span>
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="status in statusFlow"
              :key="status"
              class="rounded-md px-4 py-2 font-mono text-sm font-bold uppercase transition-all"
              :class="event.status === status ? 'bg-dc-yellow text-dc-dark shadow-[0_12px_30px_rgba(249,225,94,0.18)]' : 'border border-dc-yellow/10 bg-dc-yellow/[0.03] text-dc-gray-light hover:border-dc-yellow/35 hover:bg-dc-yellow/[0.06] hover:text-white'"
              @click="updateStatus(status)"
            >
              {{ status.replace('_', ' ') }}
            </button>
          </div>
        </section>
      </template>
    </div>
  </div>
</template>
