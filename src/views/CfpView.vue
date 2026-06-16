<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import CfpPageSkeleton from '@/src/components/ui/page-skeletons/CfpPageSkeleton.vue';
import type { Event } from '@/types';

const route = useRoute();
const event = ref<Event | null>(null);
const loading = ref(true);
const submitting = ref(false);
const submitted = ref(false);
const emailValidated = ref(false);
const emailChecking = ref(false);
const error = ref<string | null>(null);

const form = reactive({
  speaker_name: '',
  speaker_email: '',
  github_username: '',
  title: '',
  abstract: '',
  bio: '',
});

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(value));
}

async function validateEmail() {
  if (!form.speaker_email) {
    emailValidated.value = false;
    return false;
  }

  emailChecking.value = true;
  error.value = null;
  const response = await fetch(`/api/events/${route.params.eventId}/validate-speaker`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: form.speaker_email }),
  });
  const data = await response.json();
  emailChecking.value = false;
  emailValidated.value = Boolean(data.valid);

  if (!data.valid) {
    error.value = 'This email is not on the approved speakers list. Contact the organizers.';
  }

  return Boolean(data.valid);
}

async function submitProposal() {
  error.value = null;
  if (!emailValidated.value && !(await validateEmail())) {
    return;
  }

  submitting.value = true;
  const response = await fetch('/api/cfp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event_id: route.params.eventId,
      ...form,
      github_username: form.github_username || null,
    }),
  });

  if (response.ok) {
    submitted.value = true;
  } else {
    const data = await response.json();
    error.value = data.error || 'Failed to submit CFP';
  }
  submitting.value = false;
}

onMounted(async () => {
  const response = await fetch(`/api/events/${route.params.eventId}`);
  if (response.ok) {
    event.value = await response.json();
  }
  loading.value = false;
});
</script>

<template>
  <div class="min-h-screen bg-dc-cream text-dc-ink">
    <div v-if="loading" class="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      <CfpPageSkeleton />
    </div>

    <div v-else-if="!event" class="flex min-h-screen items-center justify-center p-4 text-center">
      <p class="font-mono text-dc-ink">EVENT NOT FOUND</p>
    </div>

    <div v-else-if="event.status !== 'cfp_open'" class="flex min-h-screen items-center justify-center p-4">
      <div class="w-full max-w-md rounded-lg border-2 border-dc-ink bg-dc-paper p-8 text-center shadow-[3px_3px_0_#111111]">
        <h2 class="mb-2 font-mono text-2xl font-bold text-dc-ink">CFP CLOSED</h2>
        <p class="mb-6 font-mono text-dc-gray">Call for Presentations is not currently open for this event</p>
        <RouterLink to="/" class="inline-block rounded-md border-2 border-dc-ink bg-dc-yellow px-6 py-3 font-mono font-bold uppercase tracking-wide text-dc-ink shadow-[2px_2px_0_#111111] hover:bg-dc-yellow-glow">
          BACK TO HOME
        </RouterLink>
      </div>
    </div>

    <div v-else-if="submitted" class="flex min-h-screen items-center justify-center p-4">
      <div class="w-full max-w-md rounded-lg border-2 border-dc-ink bg-dc-paper p-8 text-center shadow-[3px_3px_0_#111111]">
        <div class="mb-6 font-mono text-6xl font-black text-dc-pink">OK</div>
        <h2 class="mb-4 font-mono text-3xl font-bold text-dc-ink">SUBMITTED</h2>
        <p class="mb-6 font-mono text-dc-gray">Your talk proposal has been received. We'll review it and notify you via email.</p>
        <div class="space-y-3">
          <RouterLink to="/my-talks" class="block rounded-md border-2 border-dc-ink bg-dc-pink px-6 py-3 font-mono font-bold uppercase tracking-wide text-white shadow-[2px_2px_0_#111111]">
            VIEW MY TALKS
          </RouterLink>
          <RouterLink to="/" class="block rounded-md border-2 border-dc-ink bg-dc-yellow px-6 py-3 font-mono font-bold uppercase tracking-wide text-dc-ink shadow-[2px_2px_0_#111111]">
            BACK TO HOME
          </RouterLink>
        </div>
      </div>
    </div>

    <div v-else class="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      <div class="editorial-header">
        <p class="editorial-eyebrow">Call for Presentations</p>
        <h1 class="editorial-title">Submit a Talk</h1>
        <p class="editorial-subtitle">
          {{ event.name }} · {{ formatDate(event.event_date) }}
        </p>
      </div>

      <div v-if="event.description" class="mb-8 rounded-lg border-2 border-dc-ink bg-dc-paper p-6 shadow-[3px_3px_0_#111111]">
        <p class="text-dc-gray">{{ event.description }}</p>
      </div>

      <form class="editorial-panel space-y-6 p-6 sm:p-8" @submit.prevent="submitProposal">
        <div v-if="error" class="border-2 border-red-700 bg-red-100 p-4 font-mono text-sm text-red-800">{{ error }}</div>

        <div>
          <label class="editorial-label">Your Name *</label>
          <input v-model="form.speaker_name" required class="editorial-input font-mono" />
        </div>
        <div>
          <label class="editorial-label">Email Address *</label>
          <input
            v-model="form.speaker_email"
            required
            type="email"
            class="editorial-input border font-mono"
            :class="emailValidated ? 'border-green-700' : emailChecking ? 'border-dc-pink' : 'border-dc-ink'"
            @input="emailValidated = false"
            @blur="validateEmail"
          />
          <p v-if="emailChecking" class="mt-1 font-mono text-xs text-dc-pink">Validating email...</p>
          <p v-if="emailValidated" class="mt-1 font-mono text-xs text-green-700">Email approved</p>
        </div>
        <div>
          <label class="editorial-label">GitHub Username (optional)</label>
          <input v-model="form.github_username" placeholder="octocat" class="editorial-input font-mono" />
        </div>
        <div>
          <label class="editorial-label">Talk Title *</label>
          <input v-model="form.title" required placeholder="Building Scalable APIs with GraphQL" class="editorial-input font-mono" />
        </div>
        <div>
          <label class="editorial-label">Abstract</label>
          <textarea v-model="form.abstract" rows="5" class="editorial-input resize-none font-mono" />
        </div>
        <div>
          <label class="editorial-label">Speaker Bio</label>
          <textarea v-model="form.bio" rows="3" class="editorial-input resize-none font-mono" />
        </div>
        <button type="submit" :disabled="submitting" class="motion-press w-full rounded-md border-2 border-dc-ink bg-dc-pink px-6 py-4 font-mono text-lg font-bold uppercase tracking-wide text-white shadow-[2px_2px_0_#111111] disabled:cursor-not-allowed disabled:opacity-50">
          {{ submitting ? 'SUBMITTING...' : 'SUBMIT PROPOSAL' }}
        </button>
      </form>
    </div>
  </div>
</template>
