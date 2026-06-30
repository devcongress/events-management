<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import CfpPageSkeleton from '@/src/components/ui/page-skeletons/CfpPageSkeleton.vue';
import type { Event } from '@/types';

type IntakeEvent = Pick<Event, 'id' | 'name' | 'description' | 'event_date' | 'status'>;

const route = useRoute();
const event = ref<IntakeEvent | null>(null);
const expiresAt = ref<string | null>(null);
const loading = ref(true);
const submitting = ref(false);
const submitted = ref(false);
const unavailableMessage = ref<string | null>(null);
const error = ref<string | null>(null);
const form = reactive({
  speaker_name: '',
  speaker_email: '',
  github_username: '',
  title: '',
  topic: '',
  abstract: '',
  bio: '',
  slides_url: '',
});

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(value));
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('en', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

async function submitTalkDetails() {
  submitting.value = true;
  error.value = null;

  try {
    const response = await fetch(`/api/events/${route.params.eventId}/speaker-intake/${route.params.token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });

    if (response.ok) {
      submitted.value = true;
    } else {
      const data = await response.json();
      error.value = data.error || 'Failed to submit talk details';
    }
  } catch {
    error.value = 'Failed to submit talk details';
  } finally {
    submitting.value = false;
  }
}

onMounted(async () => {
  try {
    const response = await fetch(`/api/events/${route.params.eventId}/speaker-intake/${route.params.token}`);
    const data = await response.json().catch(() => ({}));
    if (response.ok) {
      event.value = data.event;
      expiresAt.value = data.link?.expires_at ?? null;
    } else {
      unavailableMessage.value = data.error || 'This speaker form link is no longer available.';
    }
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="min-h-screen bg-dc-cream text-dc-ink">
    <div v-if="loading" class="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      <CfpPageSkeleton />
    </div>

    <div v-else-if="unavailableMessage" class="flex min-h-screen items-center justify-center p-4">
      <div class="w-full max-w-md rounded-lg border-2 border-dc-ink bg-dc-paper p-8 text-center shadow-[3px_3px_0_#111111]">
        <h2 class="mb-3 font-mono text-2xl font-bold text-dc-ink">LINK CLOSED</h2>
        <p class="mb-6 font-mono text-dc-gray">{{ unavailableMessage }}</p>
        <RouterLink to="/" class="inline-block rounded-md border-2 border-dc-ink bg-dc-yellow px-6 py-3 font-mono font-bold uppercase tracking-wide text-dc-ink shadow-[2px_2px_0_#111111]">
          BACK TO HOME
        </RouterLink>
      </div>
    </div>

    <div v-else-if="!event" class="flex min-h-screen items-center justify-center p-4 text-center">
      <p class="font-mono text-dc-ink">EVENT NOT FOUND</p>
    </div>

    <div v-else-if="submitted" class="flex min-h-screen items-center justify-center p-4">
      <div class="w-full max-w-md rounded-lg border-2 border-dc-ink bg-dc-paper p-8 text-center shadow-[3px_3px_0_#111111]">
        <div class="mb-6 font-mono text-6xl font-black text-dc-pink">OK</div>
        <h2 class="mb-4 font-mono text-3xl font-bold text-dc-ink">RECEIVED</h2>
        <p class="mb-6 font-mono text-dc-gray">Your talk details have been sent to the organizers. This link is now closed.</p>
        <RouterLink to="/" class="block rounded-md border-2 border-dc-ink bg-dc-yellow px-6 py-3 font-mono font-bold uppercase tracking-wide text-dc-ink shadow-[2px_2px_0_#111111]">
          BACK TO HOME
        </RouterLink>
      </div>
    </div>

    <div v-else class="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      <div class="editorial-header">
        <p class="editorial-eyebrow">speaker archive</p>
        <h1 class="editorial-title">Share Talk Details</h1>
        <p class="editorial-subtitle">
          {{ event.name }} · {{ formatDate(event.event_date) }}
        </p>
      </div>

      <div v-if="event.description || expiresAt" class="mb-8 rounded-lg border-2 border-dc-ink bg-dc-paper p-6 shadow-[3px_3px_0_#111111]">
        <p v-if="event.description" class="text-dc-gray">{{ event.description }}</p>
        <p v-if="expiresAt" class="mt-4 font-mono text-xs font-bold uppercase tracking-wide text-dc-pink">
          Link expires {{ formatDateTime(expiresAt) }}
        </p>
      </div>

      <form class="editorial-panel space-y-6 p-6 sm:p-8" @submit.prevent="submitTalkDetails">
        <div v-if="error" class="rounded-md border-2 border-red-700 bg-red-100 p-4 font-mono text-sm text-red-800">{{ error }}</div>

        <div class="grid gap-4 sm:grid-cols-2">
          <label class="block">
            <span class="editorial-label">Your name *</span>
            <input v-model="form.speaker_name" required placeholder="Speaker Name" class="editorial-input font-mono" />
          </label>
          <label class="block">
            <span class="editorial-label">Email address *</span>
            <input v-model="form.speaker_email" required type="email" placeholder="speaker@example.com" class="editorial-input font-mono" />
          </label>
        </div>

        <div class="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(12rem,1fr)]">
          <label class="block">
            <span class="editorial-label">Talk title *</span>
            <input v-model="form.title" required placeholder="Talk title" class="editorial-input font-mono" />
          </label>
          <label class="block">
            <span class="editorial-label">Topic</span>
            <input v-model="form.topic" placeholder="General" class="editorial-input font-mono" />
          </label>
        </div>

        <label class="block">
          <span class="editorial-label">GitHub username</span>
          <input v-model="form.github_username" placeholder="octocat" class="editorial-input font-mono" />
        </label>

        <label class="block">
          <span class="editorial-label">Abstract</span>
          <textarea v-model="form.abstract" rows="5" class="editorial-input min-h-36 resize-y font-mono" />
        </label>

        <label class="block">
          <span class="editorial-label">Speaker bio</span>
          <textarea v-model="form.bio" rows="4" class="editorial-input min-h-28 resize-y font-mono" />
        </label>

        <label class="block">
          <span class="editorial-label">Slides URL</span>
          <input v-model="form.slides_url" type="url" placeholder="https://..." class="editorial-input font-mono" />
        </label>

        <button type="submit" :disabled="submitting" class="motion-press w-full rounded-md border-2 border-dc-ink bg-dc-pink px-6 py-4 font-mono text-lg font-bold uppercase tracking-wide text-white shadow-[2px_2px_0_#111111] disabled:cursor-not-allowed disabled:opacity-50">
          {{ submitting ? 'SUBMITTING...' : 'SEND DETAILS' }}
        </button>
      </form>
    </div>
  </div>
</template>
