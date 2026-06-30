<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import AppDropdown from '@/src/components/AppDropdown.vue';
import PublicFeedbackPageSkeleton from '@/src/components/ui/page-skeletons/PublicFeedbackPageSkeleton.vue';
import type { FeedbackCampaign, FeedbackQuestion } from '@/types';

interface FeedbackPublicResponse {
  event: {
    id: string;
    name: string;
    event_date: string;
  };
  campaign: {
    id: string;
    title: string;
    intro: string | null;
    questions: FeedbackQuestion[];
  };
  talks: {
    id: string;
    title: string;
    speaker_name: string;
  }[];
  preview_mode?: boolean;
}

interface PreviewDraftPayload {
  title: string;
  intro: string | null;
  questions: FeedbackCampaign['questions'];
}

const EVENT_FEEDBACK_COMMENT_MAX_CHARS = 1500;

const route = useRoute();
const loading = ref(true);
const submitting = ref(false);
const submitted = ref(false);
const duplicateSubmitted = ref(false);
const error = ref('');
const previewMode = ref(false);
const event = ref<FeedbackPublicResponse['event'] | null>(null);
const campaign = ref<FeedbackPublicResponse['campaign'] | null>(null);
const talks = ref<FeedbackPublicResponse['talks']>([]);
const respondent = reactive({
  name: '',
  email: '',
});
const answers = reactive<Record<string, string | number | boolean | null>>({});
const orderedQuestions = computed(() => [...(campaign.value?.questions ?? [])].sort((a, b) => a.order_index - b.order_index));
const talkOptions = computed(() => [
  { value: '', label: 'Choose a talk' },
  ...talks.value.map((talk) => ({ value: talk.id, label: `${talk.title} · ${talk.speaker_name}` })),
]);
const canSubmit = computed(() => (
  previewMode.value
  || (respondent.name.trim().length > 0 && respondent.email.trim().length > 0)
));

function eventIdParam(): string {
  return String(route.params.eventId ?? '');
}

function responseTokenStorageKey(): string {
  return `devcon:event-feedback:${eventIdParam()}:token`;
}

function submittedStorageKey(): string {
  return `devcon:event-feedback:${eventIdParam()}:submitted`;
}

function newResponseToken(): string {
  if (crypto.randomUUID) return crypto.randomUUID();

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function getOrCreateResponseToken(): string {
  try {
    const existing = window.localStorage.getItem(responseTokenStorageKey());
    if (existing) return existing;

    const token = newResponseToken();
    window.localStorage.setItem(responseTokenStorageKey(), token);
    return token;
  } catch {
    return newResponseToken();
  }
}

function markSubmitted() {
  try {
    window.localStorage.setItem(submittedStorageKey(), '1');
  } catch {
    // Storage can be unavailable in private or locked-down browsers; server-side dedupe still applies.
  }
}

function hasSubmittedMarker(): boolean {
  try {
    return window.localStorage.getItem(submittedStorageKey()) === '1';
  } catch {
    return false;
  }
}

function answerValue(questionId: string): string | number {
  const value = answers[questionId];
  return typeof value === 'string' || typeof value === 'number' ? value : '';
}

function choiceOptions(options: string[]) {
  return [
    { value: '', label: 'Choose one' },
    ...options.map((option) => ({ value: option, label: option })),
  ];
}

function normalizeQuestionLabel(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      if (word === word.toUpperCase() && word.length > 1) {
        return word.charAt(0) + word.slice(1).toLowerCase();
      }
      return word;
    })
    .join(' ');
}

function previewDraftStorageKey(): string {
  return `devcon:event-feedback-preview:${eventIdParam()}`;
}

function readPreviewDraft(): PreviewDraftPayload | null {
  try {
    const raw = window.localStorage.getItem(previewDraftStorageKey());
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PreviewDraftPayload>;
    if (!parsed || !Array.isArray(parsed.questions)) return null;
    return {
      title: typeof parsed.title === 'string' ? parsed.title : '',
      intro: typeof parsed.intro === 'string' || parsed.intro === null ? parsed.intro : null,
      questions: parsed.questions,
    };
  } catch {
    return null;
  }
}

async function fetchFeedbackForm() {
  loading.value = true;
  error.value = '';

  const previewQuery = route.query.preview === '1' ? '?preview=1' : '';
  const response = await fetch(`/api/feedback/events/${route.params.eventId}${previewQuery}`);
  if (response.ok) {
    const data = await response.json() as FeedbackPublicResponse;
    event.value = data.event;
    previewMode.value = Boolean(data.preview_mode);
    const previewDraft = previewMode.value ? readPreviewDraft() : null;
    campaign.value = previewDraft
      ? {
        ...data.campaign,
        title: previewDraft.title,
        intro: previewDraft.intro,
        questions: previewDraft.questions,
      }
      : data.campaign;
    talks.value = data.talks;
    for (const question of campaign.value.questions) {
      answers[question.id] = question.type === 'rating' ? null : '';
    }
    if (!previewMode.value && hasSubmittedMarker()) {
      duplicateSubmitted.value = true;
      submitted.value = true;
    }
  } else {
    const payload = await response.json().catch(() => ({}));
    error.value = payload.error ?? 'Feedback is not open for this event, or the 3-day response window has closed.';
  }

  loading.value = false;
}

async function submitFeedback() {
  if (!campaign.value || previewMode.value) return;

  submitting.value = true;
  error.value = '';

  const response = await fetch(`/api/feedback/events/${route.params.eventId}/submissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      respondent_name: respondent.name,
      respondent_email: respondent.email,
      page_path: route.fullPath,
      response_token: getOrCreateResponseToken(),
      answers: orderedQuestions.value.map((question) => ({
        question_id: question.id,
        value: answers[question.id] ?? null,
      })),
    }),
  });

  if (response.ok) {
    duplicateSubmitted.value = false;
    markSubmitted();
    submitted.value = true;
  } else if (response.status === 409) {
    duplicateSubmitted.value = true;
    markSubmitted();
    submitted.value = true;
  } else {
    const payload = await response.json().catch(() => ({}));
    error.value = payload.error ?? 'Unable to submit feedback';
  }

  submitting.value = false;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(value));
}

onMounted(fetchFeedbackForm);
</script>

<template>
  <div class="editorial-page">
    <div class="editorial-wrap max-w-4xl">
      <PublicFeedbackPageSkeleton v-if="loading" />

      <section v-else-if="submitted" class="editorial-panel overflow-hidden">
        <div class="border-b-2 border-dc-ink bg-dc-yellow p-6">
          <p class="editorial-eyebrow mb-2 text-dc-ink">feedback received</p>
          <h1 class="text-4xl font-black tracking-tight text-dc-ink">{{ duplicateSubmitted ? 'Already received.' : 'Thank you.' }}</h1>
        </div>
        <div class="p-6">
          <p class="max-w-2xl text-lg leading-8 text-dc-gray">
            {{ duplicateSubmitted ? 'This browser has already sent feedback for this event. Thanks for helping us keep the signal clean.' : 'Your notes help shape the next DevCongress community session. Small comments here save a lot of guessing later.' }}
          </p>
          <RouterLink to="/" class="editorial-secondary-action mt-6">Back Home</RouterLink>
        </div>
      </section>

      <section v-else-if="error" class="editorial-panel p-6">
        <p class="editorial-eyebrow">feedback</p>
        <h1 class="text-3xl font-black tracking-tight text-dc-ink">Form unavailable</h1>
        <p class="mt-4 text-base leading-7 text-dc-gray">{{ error }}</p>
      </section>

      <template v-else-if="event && campaign">
        <header class="editorial-header">
          <p class="editorial-eyebrow">community feedback</p>
          <h1 class="editorial-title">{{ campaign.title }}</h1>
          <p class="mt-3 font-mono text-xs font-bold uppercase tracking-wide text-dc-pink">{{ event.name }} · {{ formatDate(event.event_date) }}</p>
          <p v-if="campaign.intro" class="editorial-subtitle">{{ campaign.intro }}</p>
        </header>

        <section v-if="previewMode" class="editorial-panel mb-5 border-dc-pink p-5">
          <p class="font-mono text-xs font-bold uppercase tracking-wide text-dc-pink">Preview mode</p>
          <p class="mt-2 text-sm leading-6 text-dc-gray">This is the attendee-facing form preview from organizer configure. Submission is disabled here.</p>
        </section>

        <form class="space-y-5" @submit.prevent="submitFeedback">
          <div class="editorial-panel p-5">
            <div class="grid gap-4 md:grid-cols-2">
              <label class="block">
                <span class="editorial-label">Name <span class="text-dc-pink">*</span></span>
                <input v-model="respondent.name" required class="editorial-input" type="text" placeholder="Your name" />
              </label>
              <label class="block">
                <span class="editorial-label">Email <span class="text-dc-pink">*</span></span>
                <input v-model="respondent.email" required class="editorial-input" type="email" placeholder="you@example.com" />
              </label>
            </div>
          </div>

          <TransitionGroup name="feedback-question-list" tag="div" class="space-y-5">
          <fieldset
            v-for="(question, index) in orderedQuestions"
            :key="question.id"
            class="feedback-public-question editorial-panel p-5"
            :style="{ zIndex: orderedQuestions.length - index }"
          >
            <div class="feedback-public-question-header">
              <span class="feedback-public-question-title">
                {{ normalizeQuestionLabel(question.label) }} <span v-if="question.required" class="text-dc-pink">*</span>
              </span>
            </div>

              <div v-if="question.type === 'rating'" class="mt-3 grid grid-cols-5 gap-2">
                <button
                  v-for="rating in [1, 2, 3, 4, 5]"
                  :key="rating"
                  type="button"
                  class="motion-press rounded-md border-2 border-dc-ink px-3 py-4 font-mono text-lg font-black shadow-[2px_2px_0_#111111]"
                  :class="answers[question.id] === rating ? 'bg-dc-pink text-white' : 'bg-dc-paper hover:bg-dc-yellow'"
                  @click="answers[question.id] = rating"
                >
                  {{ rating }}
                </button>
              </div>

              <AppDropdown
                v-else-if="question.type === 'talk_select'"
                :model-value="answerValue(question.id)"
                :options="talkOptions"
                menu-class="md:min-w-[32rem]"
                @update:model-value="answers[question.id] = $event"
              />

              <div v-else-if="question.type === 'yes_no'" class="mt-3 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  class="motion-press rounded-md border-2 border-dc-ink px-4 py-3 font-mono text-sm font-black uppercase tracking-wide shadow-[2px_2px_0_#111111]"
                  :class="answers[question.id] === true ? 'bg-dc-pink text-white' : 'bg-dc-paper hover:bg-dc-yellow'"
                  @click="answers[question.id] = true"
                >
                  Yes
                </button>
                <button
                  type="button"
                  class="motion-press rounded-md border-2 border-dc-ink px-4 py-3 font-mono text-sm font-black uppercase tracking-wide shadow-[2px_2px_0_#111111]"
                  :class="answers[question.id] === false ? 'bg-dc-pink text-white' : 'bg-dc-paper hover:bg-dc-yellow'"
                  @click="answers[question.id] = false"
                >
                  No
                </button>
              </div>

              <AppDropdown
                v-else-if="question.type === 'choice'"
                :model-value="answerValue(question.id)"
                :options="choiceOptions(question.options)"
                @update:model-value="answers[question.id] = $event"
              />

              <div v-else>
                <textarea
                  v-model="answers[question.id] as string"
                  class="editorial-input min-h-32 resize-none"
                  :maxlength="question.type === 'text' ? EVENT_FEEDBACK_COMMENT_MAX_CHARS : undefined"
                  placeholder="Write a few honest lines"
                />
                <p v-if="question.type === 'text'" class="mt-2 text-right font-mono text-[11px] font-bold uppercase tracking-wide text-dc-gray">
                  {{ String(answers[question.id] ?? '').length }}/{{ EVENT_FEEDBACK_COMMENT_MAX_CHARS }}
                </p>
              </div>
          </fieldset>
          </TransitionGroup>

          <div v-if="error" class="rounded-md border-2 border-red-700 bg-red-50 p-4 text-sm font-semibold text-red-800">{{ error }}</div>

          <button type="submit" class="editorial-action w-full" :disabled="submitting || !canSubmit">
            {{ previewMode ? 'Preview Only' : submitting ? 'Sending...' : 'Submit Feedback' }}
          </button>
        </form>
      </template>
    </div>
  </div>
</template>
