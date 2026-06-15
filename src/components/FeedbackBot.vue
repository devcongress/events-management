<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppDropdown from '@/src/components/AppDropdown.vue';
import type { FeedbackKind } from '@/types/supabase';

const route = useRoute();
const router = useRouter();
const name = ref('');
const submitAnonymously = ref(false);
const feedbackType = ref<FeedbackKind>('confusing');
const message = ref('');
const feedbackTextarea = ref<HTMLTextAreaElement | null>(null);
const open = ref(false);
const visible = ref(false);
const submitting = ref(false);
const submitted = ref(false);
const error = ref<string | null>(null);
const FEEDBACK_MAX_LENGTH = 4000;
const FEEDBACK_TEXTAREA_MAX_HEIGHT = 160;
const FEEDBACK_SHOW_AFTER_VIEWS = 2;
const FEEDBACK_SNOOZE_VIEWS = 3;
const FEEDBACK_SESSION_VIEWS_KEY = 'devcon-feedback-route-views';
const FEEDBACK_NEXT_VIEW_KEY = 'devcon-feedback-next-view';

const feedbackTypeOptions: { value: FeedbackKind; label: string }[] = [
  { value: 'confusing', label: 'Confusing' },
  { value: 'bug', label: 'Bug' },
  { value: 'suggestion', label: 'Suggestion' },
];

const testerName = computed(() => {
  return submitAnonymously.value ? 'Anonymous' : name.value.trim();
});

const canSubmit = computed(() => {
  return testerName.value.length > 0 && message.value.trim().length > 0 && !submitting.value;
});
const feedbackLengthLabel = computed(() => `${message.value.length}/${FEEDBACK_MAX_LENGTH}`);

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
  submitted.value = false;
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

function updateBotVisibility() {
  const views = readSessionNumber(FEEDBACK_SESSION_VIEWS_KEY) + 1;
  window.sessionStorage.setItem(FEEDBACK_SESSION_VIEWS_KEY, String(views));
  const nextView = readSessionNumber(FEEDBACK_NEXT_VIEW_KEY, FEEDBACK_SHOW_AFTER_VIEWS);
  visible.value = views >= nextView;
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

async function submitFeedback() {
  if (!canSubmit.value) {
    return;
  }

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
        page_path: route.fullPath,
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
    snoozeFeedbackBot();
    void nextTick(syncFeedbackTextareaHeight);
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'Unable to send feedback';
  }

  submitting.value = false;
}

watch(submitAnonymously, (isAnonymous) => {
  if (isAnonymous) {
    name.value = '';
  }
});

watch(message, () => {
  void nextTick(syncFeedbackTextareaHeight);
});

watch(() => route.fullPath, () => {
  open.value = false;
  updateBotVisibility();
});

onMounted(updateBotVisibility);
</script>

<template>
  <div v-if="visible" class="feedback-bot" :class="{ 'feedback-bot--open': open }">
    <Transition name="feedback-panel">
      <section v-if="open" class="feedback-bot-panel" aria-label="Send feedback">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-dc-yellow">field notes</p>
            <h2 class="mt-2 text-xl font-black tracking-tight text-white">Tell me what felt off.</h2>
          </div>
          <button class="feedback-bot-icon-button" type="button" aria-label="Close feedback" @click="snoozeFeedbackBot">
            <span aria-hidden="true">x</span>
          </button>
        </div>

        <form class="feedback-bot-form" @submit.prevent="submitFeedback">
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
              :options="feedbackTypeOptions"
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

            <p class="font-mono text-[11px] uppercase tracking-wide text-dc-gray">
              Page: <span class="feedback-bot-route break-all">{{ route.fullPath }}</span>
            </p>

            <div v-if="error" class="rounded-md border border-red-500/30 bg-red-950/20 p-3 text-sm text-red-100">
              {{ error }}
            </div>
            <div v-if="submitted" class="rounded-md border border-dc-yellow/25 bg-dc-yellow/[0.07] p-3 text-sm text-dc-yellow">
              Feedback sent. Thank you.
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

    <button v-if="!open" class="feedback-bot-runner" type="button" :aria-expanded="open" aria-label="Open feedback bot" @click="toggleOpen">
      <span class="feedback-bot-bubble">Got feedback?</span>
      <span class="feedback-bot-body" aria-hidden="true">
        <span class="feedback-bot-face">
          <span />
          <span />
        </span>
      </span>
    </button>
  </div>
</template>
