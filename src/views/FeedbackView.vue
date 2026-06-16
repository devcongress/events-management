<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import AppDropdown from '@/src/components/AppDropdown.vue';
import PublicFeedbackPageSkeleton from '@/src/components/ui/page-skeletons/PublicFeedbackPageSkeleton.vue';
import type { Event as CommunityEvent, FeedbackCampaign, Talk } from '@/types';

interface FeedbackPublicResponse {
  event: CommunityEvent;
  campaign: FeedbackCampaign;
  talks: Talk[];
}

const route = useRoute();
const loading = ref(true);
const submitting = ref(false);
const submitted = ref(false);
const error = ref('');
const event = ref<CommunityEvent | null>(null);
const campaign = ref<FeedbackCampaign | null>(null);
const talks = ref<Talk[]>([]);
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

async function fetchFeedbackForm() {
  loading.value = true;
  error.value = '';

  const response = await fetch(`/api/feedback/events/${route.params.eventId}`);
  if (response.ok) {
    const data = await response.json() as FeedbackPublicResponse;
    event.value = data.event;
    campaign.value = data.campaign;
    talks.value = data.talks;
    for (const question of data.campaign.questions) {
      answers[question.id] = question.type === 'rating' ? null : '';
    }
  } else {
    const payload = await response.json().catch(() => ({}));
    error.value = payload.error ?? 'Feedback is not open for this event, or the 3-day response window has closed.';
  }

  loading.value = false;
}

async function submitFeedback() {
  if (!campaign.value) return;

  submitting.value = true;
  error.value = '';

  const response = await fetch(`/api/feedback/events/${route.params.eventId}/submissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      respondent_name: respondent.name,
      respondent_email: respondent.email,
      page_path: route.fullPath,
      answers: orderedQuestions.value.map((question) => ({
        question_id: question.id,
        value: answers[question.id] ?? null,
      })),
    }),
  });

  if (response.ok) {
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
          <h1 class="text-4xl font-black tracking-tight text-dc-ink">Thank you.</h1>
        </div>
        <div class="p-6">
          <p class="max-w-2xl text-lg leading-8 text-dc-gray">Your notes help shape the next DevCongress community session. Small comments here save a lot of guessing later.</p>
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

        <form class="space-y-5" @submit.prevent="submitFeedback">
          <div class="editorial-panel p-5">
            <div class="grid gap-4 md:grid-cols-2">
              <label class="block">
                <span class="editorial-label">Name optional</span>
                <input v-model="respondent.name" class="editorial-input" type="text" placeholder="Your name" />
              </label>
              <label class="block">
                <span class="editorial-label">Email optional</span>
                <input v-model="respondent.email" class="editorial-input" type="email" placeholder="you@example.com" />
              </label>
            </div>
          </div>

          <TransitionGroup name="feedback-question-list" tag="div" class="space-y-5">
          <section
            v-for="(question, index) in orderedQuestions"
            :key="question.id"
            class="feedback-public-question editorial-panel p-5"
            :style="{ zIndex: orderedQuestions.length - index }"
          >
            <label class="block">
              <span class="editorial-label">{{ question.label }} <span v-if="question.required" class="text-dc-pink">*</span></span>

              <div v-if="question.type === 'rating'" class="grid grid-cols-5 gap-2">
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

              <div v-else-if="question.type === 'yes_no'" class="grid grid-cols-2 gap-3">
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

              <textarea v-else v-model="answers[question.id] as string" class="editorial-input min-h-32 resize-none" placeholder="Write a few honest lines" />
            </label>
          </section>
          </TransitionGroup>

          <div v-if="error" class="rounded-md border-2 border-red-700 bg-red-50 p-4 text-sm font-semibold text-red-800">{{ error }}</div>

          <button type="submit" class="editorial-action w-full" :disabled="submitting">
            {{ submitting ? 'Sending...' : 'Submit Feedback' }}
          </button>
        </form>
      </template>
    </div>
  </div>
</template>
