<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppDropdown from '@/src/components/AppDropdown.vue';
import TurnstileWidget from '@/src/components/TurnstileWidget.vue';
import { FEEDBACK_TYPE_PLACEHOLDER, feedbackFormSchema, feedbackTypeOptions } from '@/src/lib/feedback-form';
import { ROUTE_FEEDBACK_TURNSTILE_ACTION, turnstileEnabled } from '@/src/lib/turnstile';
import type { FeedbackKind } from '@/types/supabase';

const route = useRoute();
const router = useRouter();
const name = ref('');
const submitAnonymously = ref(false);
const feedbackType = ref<FeedbackKind | typeof FEEDBACK_TYPE_PLACEHOLDER>(FEEDBACK_TYPE_PLACEHOLDER);
const message = ref('');
const feedbackTextarea = ref<HTMLTextAreaElement | null>(null);
const turnstileWidget = ref<InstanceType<typeof TurnstileWidget> | null>(null);
const open = ref(false);
const visible = ref(false);
const submitting = ref(false);
const submitted = ref(false);
const submissionTimestamps = ref<number[]>([]);
const feedbackNow = ref(Date.now());
const error = ref<string | null>(null);
const turnstileToken = ref('');
const turnstileError = ref<string | null>(null);
const FEEDBACK_MAX_LENGTH = 4000;
const FEEDBACK_TEXTAREA_MAX_HEIGHT = 160;
const FEEDBACK_SHOW_AFTER_VIEWS = 2;
const FEEDBACK_SNOOZE_VIEWS = 3;
const FEEDBACK_SESSION_VIEWS_KEY = 'devcon-feedback-route-views';
const FEEDBACK_NEXT_VIEW_KEY = 'devcon-feedback-next-view';
const FEEDBACK_SUBMISSIONS_KEY = 'devcon-feedback-bot-submissions';
const FEEDBACK_COOLDOWN_MS = 10 * 60 * 1000;
const FEEDBACK_DAILY_LIMIT = 3;
const FEEDBACK_DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;

const feedbackTypeSelectOptions = [
  { value: FEEDBACK_TYPE_PLACEHOLDER, label: 'Select feedback type' },
  ...feedbackTypeOptions,
];

const testerName = computed(() => {
  return submitAnonymously.value ? 'Anonymous' : name.value.trim();
});
const turnstileActive = turnstileEnabled();
const feedbackFormValidation = computed(() => {
  return feedbackFormSchema.safeParse({
    tester_name: testerName.value,
    type: feedbackType.value,
    message: message.value,
  });
});
const validationMessage = computed(() => {
  if (feedbackFormValidation.value.success) {
    return '';
  }

  return feedbackFormValidation.value.error.issues[0]?.message ?? 'Check the feedback form and try again.';
});

const canSubmit = computed(() => {
  return feedbackFormValidation.value.success
    && !submitting.value
    && !feedbackLimitMessage.value
    && (!turnstileActive || turnstileToken.value.length > 0);
});
const feedbackLengthLabel = computed(() => `${message.value.length}/${FEEDBACK_MAX_LENGTH}`);
const feedbackLimitMessage = computed(() => {
  const now = feedbackNow.value;
  const recent = recentSubmissionTimestamps(now);
  const latest = recent[0] ?? 0;
  const cooldownRemaining = latest + FEEDBACK_COOLDOWN_MS - now;

  if (cooldownRemaining > 0) {
    const minutes = Math.max(1, Math.ceil(cooldownRemaining / 60000));
    return `Feedback received. You can send another note in about ${minutes} minute${minutes === 1 ? '' : 's'}.`;
  }

  if (recent.length >= FEEDBACK_DAILY_LIMIT) {
    return 'Thanks for all the notes. This browser has reached today\'s feedback limit.';
  }

  return '';
});
const feedbackReceiptMessages = computed(() => {
  const messages: string[] = [];

  if (submitted.value) {
    messages.push('Feedback sent. Thank you.');
  }

  if (feedbackLimitMessage.value) {
    messages.push(feedbackLimitMessage.value);
  }

  return messages;
});
const hasFeedbackReceipt = computed(() => feedbackReceiptMessages.value.length > 0);
const botBubbleText = computed(() => submitted.value ? 'Feedback received. We will check it out.' : 'Got feedback?');
const botAriaLabel = computed(() => submitted.value ? 'Feedback received' : 'Open feedback bot');
let feedbackLimitTimer: number | undefined;

function toggleOpen() {
  if (isMobileViewport()) {
    snoozeFeedbackBot();
    void router.push({
      path: '/feedback',
      query: { from: route.fullPath },
    });
    return;
  }

  open.value = !open.value;
  if (!feedbackLimitMessage.value) {
    submitted.value = false;
  }
  error.value = null;
  if (open.value) {
    void nextTick(syncFeedbackTextareaHeight);
  }
}

function isMobileViewport() {
  return window.matchMedia('(max-width: 640px)').matches;
}

function readSessionNumber(key: string, fallback = 0) {
  const value = window.sessionStorage.getItem(key);
  if (value === null) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function recentSubmissionTimestamps(now = Date.now()) {
  return submissionTimestamps.value
    .filter((timestamp) => Number.isFinite(timestamp) && now - timestamp < FEEDBACK_DAILY_WINDOW_MS)
    .sort((a, b) => b - a);
}

function persistSubmissionTimestamps(timestamps: number[]) {
  submissionTimestamps.value = timestamps;
  window.localStorage.setItem(FEEDBACK_SUBMISSIONS_KEY, JSON.stringify(timestamps));
}

function readSubmissionTimestamps() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(FEEDBACK_SUBMISSIONS_KEY) ?? '[]');
    submissionTimestamps.value = Array.isArray(parsed)
      ? parsed.filter((value) => typeof value === 'number' && Number.isFinite(value))
      : [];
    persistSubmissionTimestamps(recentSubmissionTimestamps());
  } catch {
    submissionTimestamps.value = [];
    window.localStorage.removeItem(FEEDBACK_SUBMISSIONS_KEY);
  }
}

function recordSuccessfulSubmission() {
  persistSubmissionTimestamps([Date.now(), ...recentSubmissionTimestamps()]);
  feedbackNow.value = Date.now();
}

function updateBotVisibility() {
  const views = readSessionNumber(FEEDBACK_SESSION_VIEWS_KEY) + 1;
  window.sessionStorage.setItem(FEEDBACK_SESSION_VIEWS_KEY, String(views));
  const nextView = readSessionNumber(FEEDBACK_NEXT_VIEW_KEY, FEEDBACK_SHOW_AFTER_VIEWS);
  visible.value = submitted.value || views >= nextView;
}

function snoozeFeedbackBot() {
  const views = readSessionNumber(FEEDBACK_SESSION_VIEWS_KEY);
  window.sessionStorage.setItem(FEEDBACK_NEXT_VIEW_KEY, String(views + FEEDBACK_SNOOZE_VIEWS));
  visible.value = false;
  open.value = false;
}

function syncFeedbackTextareaHeight() {
  const element = feedbackTextarea.value;
  if (!element) return;

  element.style.height = 'auto';
  const nextHeight = Math.min(element.scrollHeight, FEEDBACK_TEXTAREA_MAX_HEIGHT);
  element.style.height = `${nextHeight}px`;
  element.style.overflowY = element.scrollHeight > FEEDBACK_TEXTAREA_MAX_HEIGHT ? 'auto' : 'hidden';
}

function blurFeedbackTextarea() {
  feedbackTextarea.value?.blur();
}

function resetTurnstile() {
  turnstileToken.value = '';
  turnstileWidget.value?.reset();
}

async function submitFeedback() {
  const formValidation = feedbackFormValidation.value;

  if (!canSubmit.value || !formValidation.success) {
    error.value = turnstileError.value || feedbackLimitMessage.value || validationMessage.value || null;
    return;
  }

  blurFeedbackTextarea();
  submitting.value = true;
  error.value = null;
  submitted.value = false;

  try {
    const formData = formValidation.data;
    const response = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tester_id: null,
        tester_name: formData.tester_name,
        type: formData.type,
        message: formData.message,
        page_path: route.fullPath,
        turnstile_action: turnstileActive ? ROUTE_FEEDBACK_TURNSTILE_ACTION : null,
        turnstile_token: turnstileActive ? turnstileToken.value : null,
        viewport_width: window.innerWidth,
        viewport_height: window.innerHeight,
      }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new Error(data?.error ?? 'Unable to send feedback');
    }

    submitted.value = true;
    recordSuccessfulSubmission();
    message.value = '';
    feedbackType.value = FEEDBACK_TYPE_PLACEHOLDER;
    name.value = '';
    submitAnonymously.value = false;
    open.value = false;
    visible.value = true;
    void nextTick(syncFeedbackTextareaHeight);
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'Unable to send feedback';
  } finally {
    if (turnstileActive) {
      resetTurnstile();
    }
    submitting.value = false;
  }
}

watch(submitAnonymously, (isAnonymous) => {
  if (isAnonymous) {
    name.value = '';
  }
});

watch(message, () => {
  if (error.value === validationMessage.value) {
    error.value = null;
  }
  void nextTick(syncFeedbackTextareaHeight);
});

watch([name, feedbackType], () => {
  if (error.value === validationMessage.value) {
    error.value = null;
  }
});

watch(() => route.fullPath, () => {
  open.value = false;
  updateBotVisibility();
});

onMounted(() => {
  readSubmissionTimestamps();
  updateBotVisibility();
  feedbackLimitTimer = window.setInterval(() => {
    feedbackNow.value = Date.now();
  }, 30000);
});

onUnmounted(() => {
  if (feedbackLimitTimer !== undefined) {
    window.clearInterval(feedbackLimitTimer);
  }
});
</script>

<template>
  <div v-if="visible" class="feedback-bot" :class="{ 'feedback-bot--open': open }">
    <Transition name="feedback-panel">
      <section v-if="open" class="feedback-bot-panel" aria-label="Send feedback">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-dc-yellow">field notes</p>
            <h2 class="mt-2 text-xl font-black tracking-normal text-[#111111]">
              {{ hasFeedbackReceipt ? 'Feedback received.' : 'Tell me what felt off.' }}
            </h2>
          </div>
          <button class="feedback-bot-icon-button" type="button" aria-label="Close feedback" @click="snoozeFeedbackBot">
            <span aria-hidden="true">x</span>
          </button>
        </div>

        <div v-if="hasFeedbackReceipt" class="feedback-bot-receipt" role="status" aria-live="polite">
          <p class="font-mono text-[11px] uppercase tracking-wide text-dc-gray">
            Page: <span class="feedback-bot-route break-all">{{ route.fullPath }}</span>
          </p>
          <div class="feedback-bot-receipt-copy">
            <p v-for="receiptMessage in feedbackReceiptMessages" :key="receiptMessage">
              {{ receiptMessage }}
            </p>
          </div>
        </div>

        <form v-else class="feedback-bot-form" @submit.prevent="submitFeedback">
          <div class="feedback-bot-form-body space-y-4">
            <div class="space-y-3">
              <label class="block">
                <span class="editorial-label">Your name</span>
                <input
                  v-model="name"
                  class="feedback-bot-field mt-2"
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
            </div>

            <AppDropdown
              v-model="feedbackType"
              label="Kind"
              :options="feedbackTypeSelectOptions"
              :disabled="submitting"
            />

            <label class="block">
              <span class="editorial-label">Feedback</span>
              <textarea
                ref="feedbackTextarea"
                v-model="message"
                class="feedback-bot-field feedback-bot-textarea"
                :maxlength="FEEDBACK_MAX_LENGTH"
                placeholder="What happened? What should be clearer?"
                aria-describedby="feedback-bot-count"
                :disabled="submitting"
              />
              <span id="feedback-bot-count" class="feedback-bot-textarea-meta">
                {{ feedbackLengthLabel }}
              </span>
            </label>

            <TurnstileWidget
              v-if="turnstileActive"
              ref="turnstileWidget"
              :action="ROUTE_FEEDBACK_TURNSTILE_ACTION"
              :disabled="submitting"
              @error="turnstileError = $event"
              @token-change="turnstileToken = $event"
            />

            <p class="font-mono text-[11px] uppercase tracking-wide text-dc-gray">
              Page: <span class="feedback-bot-route break-all">{{ route.fullPath }}</span>
            </p>

            <div v-if="error" class="rounded-md border border-red-500/30 bg-red-950/20 p-3 text-sm text-red-100">
              {{ error }}
            </div>
            <div v-else-if="turnstileError" class="rounded-md border border-red-500/30 bg-red-950/20 p-3 text-sm text-red-100">
              {{ turnstileError }}
            </div>
          </div>

          <div class="feedback-bot-actions">
            <button type="submit" class="editorial-action w-full" :disabled="!canSubmit">
              {{ submitting ? 'Sending...' : 'Send feedback' }}
            </button>
          </div>
        </form>
      </section>
    </Transition>

    <button v-if="!open" class="feedback-bot-runner" type="button" :aria-expanded="open" :aria-label="botAriaLabel" @click="toggleOpen">
      <span class="feedback-bot-bubble" :class="{ 'feedback-bot-bubble--success': submitted }">{{ botBubbleText }}</span>
      <span class="feedback-bot-body" aria-hidden="true">
        <span class="feedback-bot-face" :class="{ 'feedback-bot-face--happy': submitted }">
          <span />
          <span />
        </span>
      </span>
    </button>
  </div>
</template>
