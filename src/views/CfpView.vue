<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import TurnstileWidget from '@/src/components/TurnstileWidget.vue';
import CfpPageSkeleton from '@/src/components/ui/page-skeletons/CfpPageSkeleton.vue';
import { turnstileEnabled } from '@/src/lib/turnstile';
import { CFP_SUBMISSION_TURNSTILE_ACTION } from '@/lib/turnstile';
import type { ArchiveItemKind, Event } from '@/types';

const route = useRoute();
const event = ref<Event | null>(null);
const loading = ref(true);
const submitting = ref(false);
const submitted = ref(false);
const error = ref<string | null>(null);
const loadError = ref(false);
const turnstileWidget = ref<InstanceType<typeof TurnstileWidget> | null>(null);
const turnstileToken = ref('');
const turnstileError = ref('');
const turnstileActive = turnstileEnabled();
const ABSTRACT_WORD_LIMIT = 120;
const devconLogoSrc = '/brand/dev-con-logo.png';

const form = reactive({
  kind: 'talk' as ArchiveItemKind,
  speaker_name: '',
  speaker_email: '',
  title: '',
  abstract: '',
});

function wordCount(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

const abstractWordCount = computed(() => wordCount(form.abstract));
const abstractOverLimit = computed(() => abstractWordCount.value > ABSTRACT_WORD_LIMIT);
const speakerEmailValid = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.speaker_email.trim()));
const requiredFieldsComplete = computed(() => Boolean(
  form.speaker_name.trim()
  && speakerEmailValid.value
  && form.title.trim()
  && form.abstract.trim(),
));
const isConferenceCall = computed(() => route.name === 'conference-cfp');
const cfpIsAvailable = computed(() => Boolean(event.value && event.value.status === 'cfp_open'));
const canSubmitProposal = computed(() => (
  cfpIsAvailable.value
  && (!turnstileActive || turnstileToken.value.length > 0)
  && !submitting.value
));
const cfpClosedTitle = computed(() => {
  return event.value?.status === 'cfp_closed' ? 'Presentation proposals are closed' : 'Presentation proposals are not open yet';
});
const cfpClosedMessage = computed(() => {
  if (event.value?.status === 'cfp_closed') {
    return 'Organizers have paused new talk and product-demo proposals for this event. Thanks for checking in; keep an eye on future DevCongress calls for presentations.';
  }

  return 'This public CFP link is valid, but organizers have not opened submissions for this event yet.';
});
const archiveItemLabel = computed(() => form.kind === 'product_demo' ? 'Product demo' : 'Talk');
const archiveSummaryLabel = computed(() => form.kind === 'product_demo' ? 'Demo summary' : 'Abstract');

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(value));
}

async function submitProposal() {
  if (!canSubmitProposal.value) return;

  error.value = null;
  if (!requiredFieldsComplete.value) {
    error.value = 'Complete every required field before submitting.';
    return;
  }
  if (abstractOverLimit.value) {
    error.value = `Keep the presentation summary to ${ABSTRACT_WORD_LIMIT} words or fewer.`;
    return;
  }

  submitting.value = true;
  try {
    const response = await fetch(isConferenceCall.value
      ? `/api/cfp/conferences/${route.params.year}`
      : '/api/cfp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(isConferenceCall.value ? {} : { event_id: event.value?.id }),
        kind: form.kind,
        speaker_name: form.speaker_name.trim(),
        speaker_email: form.speaker_email.trim(),
        title: form.title.trim(),
        abstract: form.abstract.trim(),
        turnstile_action: turnstileActive ? CFP_SUBMISSION_TURNSTILE_ACTION : undefined,
        turnstile_token: turnstileActive ? turnstileToken.value : undefined,
      }),
    });

    if (response.ok) {
      submitted.value = true;
    } else {
      const data = await response.json().catch(() => ({}));
      error.value = data.error || 'The proposal could not be submitted. Please try again.';
      if (turnstileActive) {
        turnstileToken.value = '';
        turnstileWidget.value?.reset();
      }
    }
  } catch {
    error.value = 'The proposal could not be submitted. Check your connection and try again.';
  } finally {
    submitting.value = false;
  }
}

onMounted(async () => {
  try {
    const response = await fetch(isConferenceCall.value
      ? `/api/cfp/conferences/${route.params.year}`
      : `/api/cfp/events/${route.params.eventId}`);
    if (response.ok) {
      event.value = await response.json();
    } else {
      loadError.value = true;
    }
  } catch {
    loadError.value = true;
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="cfp-public-page min-h-screen bg-dc-cream text-dc-ink">
    <div v-if="loading" class="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      <CfpPageSkeleton />
    </div>

    <div v-else-if="loadError" class="flex min-h-screen items-center justify-center p-4 text-center">
      <div class="max-w-md rounded-lg border-2 border-dc-ink bg-dc-paper p-8 shadow-[3px_3px_0_#111111]">
        <p class="editorial-eyebrow">Form unavailable</p>
        <h1 class="mt-3 text-3xl font-bold tracking-tight text-dc-ink">We could not open this proposal form.</h1>
        <p class="mt-3 text-sm leading-6 text-dc-gray">Check your connection and refresh the page to try again.</p>
      </div>
    </div>

    <div v-else-if="!event" class="flex min-h-screen items-center justify-center p-4 text-center">
      <p class="font-mono text-dc-ink">EVENT NOT FOUND</p>
    </div>

    <div v-else-if="!cfpIsAvailable" class="flex min-h-screen items-center justify-center p-4">
      <div class="w-full max-w-2xl overflow-hidden rounded-lg border-2 border-dc-ink bg-dc-paper shadow-[4px_4px_0_#111111]">
        <div class="border-b-2 border-dc-ink bg-dc-paper-warm px-6 py-4 sm:px-8">
          <p class="editorial-eyebrow">Call for Speakers</p>
          <h1 class="mt-2 text-3xl font-extrabold leading-tight tracking-tight text-dc-ink sm:text-5xl">{{ cfpClosedTitle }}</h1>
        </div>
        <div class="p-6 sm:p-8">
          <div class="mb-6 rounded-md border border-dc-border bg-dc-cream p-4">
            <p class="font-mono text-xs font-semibold uppercase tracking-wide text-dc-pink">{{ event.name }}</p>
            <p class="mt-2 text-sm font-medium text-dc-gray">{{ formatDate(event.event_date) }}</p>
          </div>
          <p class="text-lg font-medium leading-8 text-dc-gray">{{ cfpClosedMessage }}</p>
          <p class="mt-6 font-mono text-xs font-semibold uppercase tracking-wide text-dc-gray">You can close this tab.</p>
        </div>
      </div>
    </div>

    <div v-else-if="submitted" class="cfp-success-shell">
      <div class="cfp-success-card">
        <div class="cfp-success-visual" aria-hidden="true"></div>
        <div class="cfp-success-body">
          <img class="cfp-success-logo" :src="devconLogoSrc" alt="DevCongress">

          <h2>Thank you.</h2>
          <p class="cfp-success-copy">We’ll be in touch if your proposal is selected.</p>

          <div class="cfp-success-pass">
            <div>
              <span>{{ archiveItemLabel }} title</span>
              <strong>{{ form.title || 'Your presentation title' }}</strong>
            </div>
          </div>

          <p class="cfp-success-footnote">You can close this tab.</p>
        </div>
      </div>
    </div>

    <div v-else class="mx-auto max-w-3xl px-4 py-5 sm:py-12">
      <div class="editorial-header">
        <p class="editorial-eyebrow">Call for Speakers</p>
        <h1 class="editorial-title">Propose a {{ archiveItemLabel }}</h1>
        <p class="editorial-subtitle">
          {{ event.name }} · {{ formatDate(event.event_date) }}
        </p>
        <p class="mt-4 text-base leading-7 text-dc-gray sm:whitespace-nowrap">
          Share something you've built, learned, or explored with the DevCongress community.
        </p>
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
          <span class="editorial-label">{{ archiveItemLabel }} Title <span class="text-red-600">*</span></span>
          <input v-model="form.title" required :placeholder="form.kind === 'product_demo' ? 'Show what your product does' : 'Building Scalable APIs with GraphQL'" class="editorial-input" />
        </label>
        <label class="flex cursor-pointer items-center gap-3 rounded-md border border-dc-border bg-dc-paper-warm px-3 py-3 text-sm font-medium text-dc-gray">
          <input v-model="form.kind" type="checkbox" true-value="product_demo" false-value="talk" class="h-4 w-4 accent-dc-pink" />
          This is a product demo
        </label>
        <div>
          <div class="mb-2 flex items-end justify-between gap-4">
            <label for="cfp-abstract" class="editorial-label">{{ archiveSummaryLabel }} <span class="text-red-600">*</span></label>
            <span class="font-mono text-xs font-semibold uppercase tracking-wide" :class="abstractOverLimit ? 'text-red-700' : 'text-dc-gray'">
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
        <div class="flex flex-col items-center justify-center gap-4 sm:flex-row">
          <TurnstileWidget
            v-if="turnstileActive"
            ref="turnstileWidget"
            :action="CFP_SUBMISSION_TURNSTILE_ACTION"
            @token-change="turnstileToken = $event"
            @error="turnstileError = $event ?? ''"
          />
          <button type="submit" :disabled="!canSubmitProposal" class="motion-press w-full rounded-md border-2 border-dc-ink bg-dc-pink px-6 py-4 font-mono text-lg font-semibold uppercase tracking-wide text-white shadow-[2px_2px_0_#111111] disabled:cursor-not-allowed disabled:opacity-50 sm:flex-1">
            {{ submitting ? 'SUBMITTING...' : 'SUBMIT PROPOSAL' }}
          </button>
        </div>
        <p v-if="turnstileError" class="text-sm font-semibold text-red-800" role="alert">{{ turnstileError }}</p>
      </form>
    </div>
  </div>
</template>
