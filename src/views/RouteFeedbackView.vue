<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import AppDropdown from '@/src/components/AppDropdown.vue';
import type { FeedbackKind } from '@/types/supabase';

const route = useRoute();
const name = ref('');
const submitAnonymously = ref(false);
const feedbackType = ref<FeedbackKind>('confusing');
const message = ref('');
const feedbackTextarea = ref<HTMLTextAreaElement | null>(null);
const submitting = ref(false);
const submitted = ref(false);
const error = ref<string | null>(null);
const FEEDBACK_MAX_LENGTH = 4000;
const FEEDBACK_TEXTAREA_MAX_HEIGHT = 240;

const feedbackTypeOptions: { value: FeedbackKind; label: string }[] = [
  { value: 'confusing', label: 'Confusing' },
  { value: 'bug', label: 'Bug' },
  { value: 'suggestion', label: 'Suggestion' },
];

const testerName = computed(() => submitAnonymously.value ? 'Anonymous' : name.value.trim());
const canSubmit = computed(() => testerName.value.length > 0 && message.value.trim().length > 0 && !submitting.value);
const feedbackLengthLabel = computed(() => `${message.value.length}/${FEEDBACK_MAX_LENGTH}`);
const pagePath = computed(() => {
  const from = route.query.from;
  return typeof from === 'string' && from ? from : route.fullPath;
});

function syncFeedbackTextareaHeight() {
  const element = feedbackTextarea.value;
  if (!element) return;

  element.style.height = 'auto';
  const nextHeight = Math.min(element.scrollHeight, FEEDBACK_TEXTAREA_MAX_HEIGHT);
  element.style.height = `${nextHeight}px`;
  element.style.overflowY = element.scrollHeight > FEEDBACK_TEXTAREA_MAX_HEIGHT ? 'auto' : 'hidden';
}

async function submitFeedback() {
  if (!canSubmit.value) return;

  submitting.value = true;
  error.value = null;
  submitted.value = false;

  try {
    const response = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tester_id: null,
        tester_name: testerName.value,
        type: feedbackType.value,
        message: message.value.trim(),
        page_path: pagePath.value,
        viewport_width: window.innerWidth,
        viewport_height: window.innerHeight,
      }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new Error(data?.error ?? 'Unable to send feedback');
    }

    submitted.value = true;
    message.value = '';
    feedbackType.value = 'confusing';
    name.value = '';
    submitAnonymously.value = false;
    void nextTick(syncFeedbackTextareaHeight);
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'Unable to send feedback';
  }

  submitting.value = false;
}

watch(submitAnonymously, (isAnonymous) => {
  if (isAnonymous) name.value = '';
});

watch(message, () => {
  void nextTick(syncFeedbackTextareaHeight);
});
</script>

<template>
  <div class="editorial-page route-feedback-page">
    <div class="route-feedback-wrap mx-auto max-w-2xl px-4 py-6 sm:px-6 lg:px-8 lg:py-12">
      <header class="route-feedback-header">
        <p class="editorial-eyebrow">field notes</p>
        <h1 class="text-3xl font-black tracking-tight text-dc-ink sm:text-5xl">Tell us what felt off.</h1>
        <p class="mt-3 text-sm leading-6 text-dc-gray sm:text-base">
          Send quick feedback about this app. Bugs, confusing moments, and suggestions all help shape the next pass.
        </p>
      </header>

      <section v-if="submitted" class="editorial-panel mt-5 p-5">
        <p class="font-mono text-xs font-bold uppercase tracking-wide text-dc-pink">feedback sent</p>
        <h2 class="mt-2 text-2xl font-black text-dc-ink">Thank you.</h2>
        <p class="mt-2 text-sm leading-6 text-dc-gray">Your note is in the organizer inbox.</p>
        <RouterLink to="/" class="editorial-secondary-action mt-5">Back Home</RouterLink>
      </section>

      <form v-else class="route-feedback-form editorial-panel mt-5 p-5" @submit.prevent="submitFeedback">
        <div class="grid gap-4">
          <label class="block">
            <span class="editorial-label">Your name</span>
            <input
              v-model="name"
              class="editorial-input mt-2"
              type="text"
              placeholder="Type your name"
              :disabled="submitAnonymously || submitting"
            >
          </label>

          <label class="feedback-bot-check">
            <input
              v-model="submitAnonymously"
              type="checkbox"
              :disabled="submitting"
            >
            <span>Send anonymously</span>
          </label>

          <AppDropdown
            v-model="feedbackType"
            label="Kind"
            :options="feedbackTypeOptions"
            :disabled="submitting"
          />

          <label class="block">
            <span class="editorial-label">Feedback</span>
            <textarea
              ref="feedbackTextarea"
              v-model="message"
              class="editorial-input mt-2 min-h-36 resize-none"
              :maxlength="FEEDBACK_MAX_LENGTH"
              placeholder="What happened? What should be clearer?"
              aria-describedby="route-feedback-count"
              :disabled="submitting"
            />
            <span id="route-feedback-count" class="feedback-bot-textarea-meta">
              {{ feedbackLengthLabel }}
            </span>
          </label>

          <p class="font-mono text-[11px] uppercase tracking-wide text-dc-gray">
            Page: <span class="feedback-bot-route break-all">{{ pagePath }}</span>
          </p>

          <div v-if="error" class="rounded-md border border-red-700/40 bg-red-50 p-3 text-sm font-semibold text-red-800">
            {{ error }}
          </div>

          <button type="submit" class="editorial-action w-full" :disabled="!canSubmit">
            {{ submitting ? 'Sending...' : 'Send feedback' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
