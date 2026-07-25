<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import AppDropdown from '@/src/components/AppDropdown.vue';
import CfpPageSkeleton from '@/src/components/ui/page-skeletons/CfpPageSkeleton.vue';
import type { Event, SpeakerIntakeLinkPurpose } from '@/types';

type IntakeEvent = Pick<Event, 'id' | 'name' | 'description' | 'event_date' | 'status'>;
type IntakePrefill = {
  speaker_name?: string;
  speaker_email?: string;
  github_username?: string;
  title?: string;
  topic?: string;
  abstract?: string;
  bio?: string;
};

const route = useRoute();
const event = ref<IntakeEvent | null>(null);
const expiresAt = ref<string | null>(null);
const linkPurpose = ref<SpeakerIntakeLinkPurpose>('archive_backfill');
const loading = ref(true);
const submitting = ref(false);
const submitted = ref(false);
const unavailableMessage = ref<string | null>(null);
const error = ref<string | null>(null);
const popularTopics = [
  'Frontend Engineering',
  'Backend Engineering',
  'Cloud Infrastructure',
  'DevOps',
  'AI/ML',
  'Data Engineering',
  'Security',
  'Open Source',
  'Product Engineering',
  'Career Growth',
];
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
const topicOptions = computed(() => {
  const baseOptions = [
    { value: '', label: 'General' },
    ...popularTopics.map((topic) => ({ value: topic, label: topic })),
  ];
  const currentTopic = form.topic.trim();

  if (currentTopic && !popularTopics.includes(currentTopic)) {
    return [
      ...baseOptions,
      { value: currentTopic, label: currentTopic },
    ];
  }

  return baseOptions;
});

function isSelectedSpeakerLink() {
  return linkPurpose.value === 'selected_speaker_confirmation';
}

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
  const payload = isSelectedSpeakerLink()
    ? { slides_url: form.slides_url }
    : {
      github_username: form.github_username,
      title: form.title,
      topic: form.topic,
      abstract: form.abstract,
      bio: form.bio,
      slides_url: form.slides_url,
    };

  try {
    const response = await fetch(`/api/events/${route.params.eventId}/speaker-intake/${route.params.token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
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
      linkPurpose.value = data.link?.purpose ?? 'archive_backfill';
      applyPrefill(data.prefill ?? {});
    } else {
      unavailableMessage.value = data.error || 'This speaker form link is no longer available.';
    }
  } finally {
    loading.value = false;
  }
});

function applyPrefill(prefill: IntakePrefill) {
  form.speaker_name = prefill.speaker_name || form.speaker_name;
  form.speaker_email = prefill.speaker_email || form.speaker_email;
  form.github_username = prefill.github_username || form.github_username;
  form.title = prefill.title || form.title;
  form.topic = prefill.topic || form.topic;
  form.abstract = prefill.abstract || form.abstract;
  form.bio = prefill.bio || form.bio;
}
</script>

<template>
  <div class="min-h-screen bg-dc-cream text-dc-ink">
    <div v-if="loading" class="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      <CfpPageSkeleton />
    </div>

    <div v-else-if="unavailableMessage" class="flex min-h-screen items-center justify-center p-4">
      <div class="w-full max-w-md rounded-lg border-2 border-dc-ink bg-dc-paper p-8 text-center shadow-[3px_3px_0_#111111]">
        <h2 class="mb-3 font-mono text-2xl font-bold text-dc-ink">LINK CLOSED</h2>
        <p class="font-mono text-dc-gray">{{ unavailableMessage }}</p>
        <p class="mt-4 font-mono text-sm text-dc-gray">You can close this tab.</p>
      </div>
    </div>

    <div v-else-if="!event" class="flex min-h-screen items-center justify-center p-4 text-center">
      <p class="font-mono text-dc-ink">EVENT NOT FOUND</p>
    </div>

    <div v-else-if="submitted" class="flex min-h-screen items-center justify-center p-4">
      <div class="w-full max-w-md rounded-lg border-2 border-dc-ink bg-dc-paper p-8 text-center shadow-[3px_3px_0_#111111]">
        <div class="mb-6 font-mono text-6xl font-black text-dc-pink">OK</div>
        <h2 class="mb-4 font-mono text-3xl font-bold text-dc-ink">RECEIVED</h2>
        <p class="mb-6 font-mono text-dc-gray">
          {{ isSelectedSpeakerLink() ? 'Your slides link has been sent to the organizers. This link is now closed.' : 'Your talk details have been sent to the organizers. This link is now closed.' }}
        </p>
        <p class="font-mono text-sm text-dc-gray">You can close this tab.</p>
      </div>
    </div>

    <div v-else class="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      <div class="editorial-header">
        <p class="editorial-eyebrow">{{ linkPurpose === 'selected_speaker_confirmation' ? 'selected speaker' : 'speaker archive' }}</p>
        <h1 class="editorial-title">{{ linkPurpose === 'selected_speaker_confirmation' ? 'Send Your Slides' : 'Share Talk Details' }}</h1>
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

        <div v-if="isSelectedSpeakerLink()" class="rounded-md border border-dc-border bg-dc-paper-warm p-5">
          <p class="editorial-eyebrow">Selected talk</p>
          <h2 class="mt-2 text-2xl font-black tracking-tight text-dc-ink">{{ form.title }}</h2>
          <p class="mt-2 font-mono text-xs font-bold uppercase tracking-wide text-dc-gray">
            {{ form.speaker_name }} <span class="mx-2 text-dc-pink">/</span> {{ form.topic || 'General' }}
          </p>
          <p v-if="form.abstract" class="mt-4 text-sm leading-6 text-dc-gray">{{ form.abstract }}</p>
        </div>

        <template v-else>
          <section class="rounded-md border border-dc-border bg-dc-paper-warm p-5">
            <p class="editorial-eyebrow">Invited speaker</p>
            <p class="mt-2 text-xl font-black tracking-tight text-dc-ink">{{ form.speaker_name }}</p>
            <p class="mt-1 font-mono text-xs font-bold text-dc-gray">{{ form.speaker_email }}</p>
          </section>

          <div class="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(12rem,1fr)]">
            <label class="block">
              <span class="editorial-label">Talk title *</span>
              <input v-model="form.title" required placeholder="Talk title" class="editorial-input font-mono" />
            </label>
            <div class="block">
              <span class="editorial-label">Topic</span>
              <AppDropdown
                v-model="form.topic"
                :options="topicOptions"
                menu-class="cfp-topic-menu"
              />
            </div>
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
        </template>

        <label class="block">
          <span class="editorial-label">Slides URL<span v-if="isSelectedSpeakerLink()"> *</span></span>
          <input v-model="form.slides_url" :required="isSelectedSpeakerLink()" type="url" placeholder="https://..." class="editorial-input font-mono" />
        </label>

        <button type="submit" :disabled="submitting" class="motion-press w-full rounded-md border-2 border-dc-ink bg-dc-pink px-6 py-4 font-mono text-lg font-bold uppercase tracking-wide text-white shadow-[2px_2px_0_#111111] disabled:cursor-not-allowed disabled:opacity-50">
          {{ submitting ? 'SUBMITTING...' : isSelectedSpeakerLink() ? 'SEND SLIDES' : 'SEND DETAILS' }}
        </button>
      </form>
    </div>
  </div>
</template>
