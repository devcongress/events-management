<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import AppDropdown from '@/src/components/AppDropdown.vue';
import CfpPageSkeleton from '@/src/components/ui/page-skeletons/CfpPageSkeleton.vue';
import type { Event } from '@/types';

const route = useRoute();
const event = ref<Event | null>(null);
const loading = ref(true);
const submitting = ref(false);
const submitted = ref(false);
const error = ref<string | null>(null);
const ABSTRACT_WORD_LIMIT = 120;
const BIO_WORD_LIMIT = 80;
const CUSTOM_TOPIC_VALUE = '__custom_topic__';
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
const topicPickerValue = ref<string>('');
const customTopic = ref('');
const topicOptions = [
  { value: '', label: 'Choose a topic' },
  ...popularTopics.map((topic) => ({ value: topic, label: topic })),
  { value: CUSTOM_TOPIC_VALUE, label: 'Add another topic' },
];

const form = reactive({
  speaker_name: '',
  speaker_email: '',
  github_username: '',
  title: '',
  topic: '',
  abstract: '',
  bio: '',
});

function wordCount(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

const abstractWordCount = computed(() => wordCount(form.abstract));
const bioWordCount = computed(() => wordCount(form.bio));
const abstractOverLimit = computed(() => abstractWordCount.value > ABSTRACT_WORD_LIMIT);
const bioOverLimit = computed(() => bioWordCount.value > BIO_WORD_LIMIT);
const speakerEmailValid = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.speaker_email.trim()));
const requiredFieldsComplete = computed(() => Boolean(
  form.speaker_name.trim()
  && speakerEmailValid.value
  && form.title.trim()
  && form.topic.trim()
  && form.abstract.trim()
  && form.bio.trim(),
));
const eventIsMonthly = computed(() => (
  event.value?.series_type ?? (event.value?.name?.toLowerCase().includes('quarterly') ? 'quarterly' : 'monthly')
) === 'monthly');
const eventIsUpcoming = computed(() => {
  if (!event.value?.event_date) return false;
  const eventDateMs = new Date(event.value.event_date).getTime();
  return Number.isFinite(eventDateMs) && eventDateMs > Date.now();
});
const cfpIsAvailable = computed(() => Boolean(event.value && event.value.status === 'cfp_open' && eventIsMonthly.value && eventIsUpcoming.value));
const canSubmitProposal = computed(() => cfpIsAvailable.value && requiredFieldsComplete.value && !abstractOverLimit.value && !bioOverLimit.value && !submitting.value);
const cfpClosedTitle = computed(() => {
  if (!eventIsMonthly.value || !eventIsUpcoming.value) return 'Speaker submissions are unavailable';
  return event.value?.status === 'cfp_closed' ? 'Speaker submissions are closed' : 'Speaker submissions are not open yet';
});
const cfpClosedMessage = computed(() => {
  if (!eventIsMonthly.value) {
    return 'This CFP form is only available for monthly meetups.';
  }

  if (!eventIsUpcoming.value) {
    return 'This event date has passed, so the CFP form is no longer available.';
  }

  if (event.value?.status === 'cfp_closed') {
    return 'Organizers have paused new talk proposals for this event. Thanks for checking in; keep an eye on future DevCongress calls for speakers.';
  }

  return 'This public CFP link is valid, but organizers have not opened submissions for this event yet.';
});
const usingCustomTopic = computed(() => topicPickerValue.value === CUSTOM_TOPIC_VALUE);

watch(topicPickerValue, (value) => {
  form.topic = value === CUSTOM_TOPIC_VALUE ? customTopic.value.trim() : value;
});

watch(customTopic, (value) => {
  if (usingCustomTopic.value) {
    form.topic = value.trim();
  }
});

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(value));
}

async function submitProposal() {
  if (!canSubmitProposal.value) return;

  error.value = null;

  submitting.value = true;
  const response = await fetch('/api/cfp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event_id: route.params.eventId,
      speaker_name: form.speaker_name.trim(),
      speaker_email: form.speaker_email.trim(),
      github_username: form.github_username.trim() || null,
      title: form.title.trim(),
      topic: form.topic.trim(),
      abstract: form.abstract.trim(),
      bio: form.bio.trim(),
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
  <div class="cfp-public-page min-h-screen bg-dc-cream text-dc-ink">
    <div v-if="loading" class="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      <CfpPageSkeleton />
    </div>

    <div v-else-if="!event" class="flex min-h-screen items-center justify-center p-4 text-center">
      <p class="font-mono text-dc-ink">EVENT NOT FOUND</p>
    </div>

    <div v-else-if="!cfpIsAvailable" class="flex min-h-screen items-center justify-center p-4">
      <div class="w-full max-w-2xl overflow-hidden rounded-lg border-2 border-dc-ink bg-dc-paper shadow-[4px_4px_0_#111111]">
        <div class="border-b-2 border-dc-ink bg-dc-paper-warm px-6 py-4 sm:px-8">
          <p class="editorial-eyebrow">Call for Presentations</p>
          <h1 class="mt-2 text-3xl font-black leading-tight tracking-tight text-dc-ink sm:text-5xl">{{ cfpClosedTitle }}</h1>
        </div>
        <div class="p-6 sm:p-8">
          <div class="mb-6 rounded-md border border-dc-border bg-dc-cream p-4">
            <p class="font-mono text-xs font-bold uppercase tracking-wide text-dc-pink">{{ event.name }}</p>
            <p class="mt-2 text-sm font-semibold text-dc-gray">{{ formatDate(event.event_date) }}</p>
          </div>
          <p class="text-lg font-semibold leading-8 text-dc-gray">{{ cfpClosedMessage }}</p>
          <div class="mt-8 flex flex-col gap-3 sm:flex-row">
            <RouterLink to="/events" class="motion-press inline-flex min-h-12 items-center justify-center rounded-md border-2 border-dc-ink bg-dc-yellow px-5 font-mono text-sm font-bold uppercase tracking-wide text-dc-ink shadow-[2px_2px_0_#111111] hover:bg-dc-yellow-glow">
              View events
            </RouterLink>
            <RouterLink to="/" class="motion-press inline-flex min-h-12 items-center justify-center rounded-md border-2 border-dc-border bg-white px-5 font-mono text-sm font-bold uppercase tracking-wide text-dc-gray hover:border-dc-ink hover:text-dc-ink">
              Back home
            </RouterLink>
          </div>
        </div>
      </div>
    </div>

    <div v-else-if="submitted" class="cfp-success-shell">
      <div class="cfp-success-card">
        <div class="cfp-success-visual" aria-hidden="true"></div>
        <div class="cfp-success-body">
          <div class="cfp-success-brand-row" aria-hidden="true">
            <span>dev:congress{}</span>
          </div>

          <div class="cfp-success-topline">
            <div class="cfp-success-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="m5 12.5 4.2 4.2L19 6.8" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </div>
            <p>Proposal received</p>
          </div>

          <h2>You're in.</h2>
          <p class="cfp-success-copy">
            Thanks for submitting to {{ event.name }}. Organizers will review proposals together and contact selected speakers.
          </p>

          <div class="cfp-success-pass">
            <div>
              <span>Talk title</span>
              <strong>{{ form.title }}</strong>
            </div>
          </div>

          <p class="cfp-success-footnote">No extra steps needed. You can close this tab.</p>
        </div>
      </div>
    </div>

    <div v-else class="mx-auto max-w-3xl px-4 py-5 sm:py-12">
      <div class="editorial-header">
        <p class="editorial-eyebrow">Call for Presentations</p>
        <h1 class="editorial-title">Submit a Talk</h1>
        <p class="editorial-subtitle">
          {{ event.name }} · {{ formatDate(event.event_date) }}
        </p>
      </div>

      <div v-if="event.description" class="mb-5 rounded-lg border-2 border-dc-ink bg-dc-paper p-4 shadow-[3px_3px_0_#111111] sm:mb-8 sm:p-6">
        <p class="text-dc-gray">{{ event.description }}</p>
      </div>

      <form class="editorial-panel space-y-5 p-4 sm:space-y-6 sm:p-8" @submit.prevent="submitProposal">
        <div v-if="error" class="border-2 border-red-700 bg-red-100 p-4 font-mono text-sm text-red-800">{{ error }}</div>

        <div class="grid gap-4 sm:grid-cols-2">
          <label class="block">
            <span class="editorial-label">Your Name <span class="text-red-600">*</span></span>
            <input v-model="form.speaker_name" required class="editorial-input font-mono" />
          </label>
          <label class="block">
            <span class="editorial-label">Email Address <span class="text-red-600">*</span></span>
            <input
              v-model="form.speaker_email"
              required
              type="email"
              class="editorial-input border border-dc-ink font-mono"
            />
          </label>
        </div>
        <label class="block">
          <span class="editorial-label">Talk Title <span class="text-red-600">*</span></span>
          <input v-model="form.title" required placeholder="Building Scalable APIs with GraphQL" class="editorial-input font-mono" />
        </label>
        <div class="grid gap-4 sm:grid-cols-2">
          <div class="block">
            <span class="editorial-label">Topic <span class="text-red-600">*</span></span>
            <AppDropdown
              v-model="topicPickerValue"
              :options="topicOptions"
              menu-class="cfp-topic-menu"
            />
            <label v-if="usingCustomTopic" class="mt-3 block">
              <span class="editorial-label">Custom topic <span class="text-red-600">*</span></span>
              <input v-model="customTopic" required placeholder="e.g. Technical Writing" class="editorial-input font-mono" />
            </label>
            <span class="mt-2 block text-sm font-semibold text-dc-gray">Pick a popular topic or type your own.</span>
          </div>
          <label class="block">
            <span class="editorial-label">GitHub Username (optional)</span>
            <input v-model="form.github_username" placeholder="octocat" class="editorial-input font-mono" />
          </label>
        </div>
        <div>
          <div class="mb-2 flex items-end justify-between gap-4">
            <label for="cfp-abstract" class="editorial-label">Abstract <span class="text-red-600">*</span></label>
            <span class="font-mono text-xs font-bold uppercase tracking-wide" :class="abstractOverLimit ? 'text-red-700' : 'text-dc-gray'">
              {{ abstractWordCount }}/{{ ABSTRACT_WORD_LIMIT }} words
            </span>
          </div>
          <textarea
            id="cfp-abstract"
            v-model="form.abstract"
            required
            rows="5"
            class="editorial-input resize-none font-mono"
            :class="{ 'cfp-input-error border-red-700 bg-red-50': abstractOverLimit }"
          />
        </div>
        <div>
          <div class="mb-2 flex items-end justify-between gap-4">
            <label for="cfp-bio" class="editorial-label">Speaker Bio <span class="text-red-600">*</span></label>
            <span class="font-mono text-xs font-bold uppercase tracking-wide" :class="bioOverLimit ? 'text-red-700' : 'text-dc-gray'">
              {{ bioWordCount }}/{{ BIO_WORD_LIMIT }} words
            </span>
          </div>
          <textarea
            id="cfp-bio"
            v-model="form.bio"
            required
            rows="3"
            class="editorial-input resize-none font-mono"
            :class="{ 'cfp-input-error border-red-700 bg-red-50': bioOverLimit }"
          />
        </div>
        <button type="submit" :disabled="!canSubmitProposal" class="motion-press w-full rounded-md border-2 border-dc-ink bg-dc-pink px-6 py-4 font-mono text-lg font-bold uppercase tracking-wide text-white shadow-[2px_2px_0_#111111] disabled:cursor-not-allowed disabled:opacity-50">
          {{ submitting ? 'SUBMITTING...' : 'SUBMIT PROPOSAL' }}
        </button>
      </form>
    </div>
  </div>
</template>
