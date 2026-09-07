<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import TurnstileWidget from '@/src/components/TurnstileWidget.vue';
import CfpPageSkeleton from '@/src/components/ui/page-skeletons/CfpPageSkeleton.vue';
import SubmissionProgressLabel from '@/src/components/ui/SubmissionProgressLabel.vue';
import { preflightPublicEmail } from '@/src/lib/api';
import { turnstileEnabled } from '@/src/lib/turnstile';
import { CFP_SUBMISSION_TURNSTILE_ACTION } from '@/lib/turnstile';
import { safePublicResourceUrl } from '@/lib/safe-url';
import {
  ANNUAL_CONFERENCE_ABSTRACT_WORD_LIMIT,
  ANNUAL_CONFERENCE_BIO_WORD_LIMIT,
  ANNUAL_CONFERENCE_LEARNING_OUTCOME_MAX,
  ANNUAL_CONFERENCE_LEARNING_OUTCOME_MIN,
  ANNUAL_CONFERENCE_SESSION_TYPES,
  ANNUAL_CONFERENCE_TOPIC_TRACKS,
  countWords,
  type AnnualConferenceSessionType,
  type AnnualConferenceTopicTrack,
} from '@/lib/annual-conference-cfp';
import type { ArchiveItemKind, Event } from '@/types';

const route = useRoute();
const event = ref<Event | null>(null);
const loading = ref(true);
const submitting = ref(false);
const submissionStage = ref<'checking' | 'submitting' | null>(null);
const submitted = ref(false);
const error = ref<string | null>(null);
const loadError = ref(false);
const turnstileWidget = ref<InstanceType<typeof TurnstileWidget> | null>(null);
const turnstileToken = ref('');
const turnstileError = ref('');
const turnstileActive = turnstileEnabled();
const MONTHLY_ABSTRACT_WORD_LIMIT = 120;
const devconLogoSrc = '/brand/dev-con-logo.webp';

const form = reactive({
  kind: 'talk' as ArchiveItemKind,
  speaker_name: '',
  speaker_email: '',
  title: '',
  bio: '',
  topic: '' as AnnualConferenceTopicTrack | '',
  session_type: '' as AnnualConferenceSessionType | '',
  abstract: '',
  learning_outcomes: [''],
  resource_url: '',
});

const isConferenceCall = computed(() => route.name === 'conference-cfp');
const abstractWordLimit = computed(() => isConferenceCall.value ? ANNUAL_CONFERENCE_ABSTRACT_WORD_LIMIT : MONTHLY_ABSTRACT_WORD_LIMIT);
const abstractWordCount = computed(() => countWords(form.abstract));
const abstractOverLimit = computed(() => abstractWordCount.value > abstractWordLimit.value);
const bioWordCount = computed(() => countWords(form.bio));
const bioOverLimit = computed(() => bioWordCount.value > ANNUAL_CONFERENCE_BIO_WORD_LIMIT);
const speakerEmailValid = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.speaker_email.trim()));
const resourceUrlInvalid = computed(() => Boolean(form.resource_url.trim()) && !safePublicResourceUrl(form.resource_url));
const resourceUrlError = computed(() => resourceUrlInvalid.value ? 'Use a secure public HTTPS link.' : '');
const requiredFieldsComplete = computed(() => Boolean(
  form.speaker_name.trim()
  && speakerEmailValid.value
  && form.title.trim()
  && form.abstract.trim()
  && (!isConferenceCall.value || (
    form.bio.trim()
    && form.topic
    && form.session_type
    && form.learning_outcomes.length >= ANNUAL_CONFERENCE_LEARNING_OUTCOME_MIN
    && form.learning_outcomes.every((outcome) => outcome.trim())
  )),
));
const cfpIsAvailable = computed(() => Boolean(event.value && event.value.status === 'cfp_open'));
const canSubmitProposal = computed(() => (
  cfpIsAvailable.value
  && (!turnstileActive || turnstileToken.value.length > 0)
  && (!isConferenceCall.value ? !resourceUrlInvalid.value : true)
  && !abstractOverLimit.value
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

function addLearningOutcome() {
  if (form.learning_outcomes.length < ANNUAL_CONFERENCE_LEARNING_OUTCOME_MAX) form.learning_outcomes.push('');
}

function removeLearningOutcome(index: number) {
  form.learning_outcomes.splice(index, 1);
}

async function submitProposal() {
  if (!canSubmitProposal.value) return;

  error.value = null;
  if (!requiredFieldsComplete.value) {
    error.value = 'Complete every required field before submitting.';
    return;
  }
  if (abstractOverLimit.value) {
    error.value = `Keep the presentation summary to ${abstractWordLimit.value} words or fewer.`;
    return;
  }
  if (!isConferenceCall.value && resourceUrlInvalid.value) {
    error.value = 'Use a secure public HTTPS link for the presentation or demo resource.';
    return;
  }

  submitting.value = true;
  submissionStage.value = 'checking';
  try {
    const emailCheck = await preflightPublicEmail(form.speaker_email);
    form.speaker_email = emailCheck.normalized_email;
    submissionStage.value = 'submitting';
    const response = await fetch(isConferenceCall.value
      ? `/api/cfp/conferences/${route.params.year}`
      : '/api/cfp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(isConferenceCall.value ? {} : { event_id: event.value?.id }),
        ...(isConferenceCall.value ? {
          bio: form.bio.trim(),
          topic: form.topic,
          session_type: form.session_type,
          learning_outcomes: form.learning_outcomes.map((outcome) => outcome.trim()),
        } : { kind: form.kind }),
        speaker_name: form.speaker_name.trim(),
        speaker_email: form.speaker_email.trim(),
        title: form.title.trim(),
        abstract: form.abstract.trim(),
        ...(!isConferenceCall.value ? { resource_url: form.resource_url.trim() } : {}),
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
  } catch (caught) {
    error.value = caught instanceof Error
      ? caught.message
      : 'The proposal could not be submitted. Check your connection and try again.';
  } finally {
    submitting.value = false;
    submissionStage.value = null;
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
          <div class="mb-5 flex items-center gap-3 sm:gap-4">
            <img class="h-auto w-32 sm:w-40" :src="devconLogoSrc" alt="DevCongress">
            <p class="editorial-eyebrow !mb-0">Call for Speakers</p>
          </div>
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
        <div class="mb-6 flex items-center gap-3 sm:gap-4">
          <a
            href="https://devcongress.org"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Visit DevCongress"
            class="inline-flex rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-dc-pink"
          >
            <img class="h-auto w-32 sm:w-40" :src="devconLogoSrc" alt="DevCongress">
          </a>
          <p class="editorial-eyebrow !mb-0">Call for Speakers</p>
        </div>
        <h1 class="editorial-title">{{ isConferenceCall ? 'Propose a conference session' : `Propose a ${archiveItemLabel}` }}</h1>
        <p class="editorial-subtitle">
          {{ event.name }} · {{ formatDate(event.event_date) }}
        </p>
        <p class="mt-4 text-base leading-7 text-dc-gray sm:whitespace-nowrap">
          {{ isConferenceCall ? 'Submit one complete talk proposal. You can return and submit another proposal separately.' : "Share something you've built, learned, or explored with the DevCongress community." }}
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
        <div v-if="isConferenceCall">
          <div class="mb-2 flex items-end justify-between gap-4">
            <label for="cfp-bio" class="editorial-label">Speaker bio <span class="text-red-600">*</span></label>
            <span class="font-mono text-xs font-semibold uppercase tracking-wide" :class="bioOverLimit ? 'text-amber-700' : 'text-dc-gray'">
              {{ bioWordCount }}/{{ ANNUAL_CONFERENCE_BIO_WORD_LIMIT }} words
            </span>
          </div>
          <textarea id="cfp-bio" v-model="form.bio" required rows="4" maxlength="4000" class="editorial-input resize-none" />
          <p class="mt-2 text-sm leading-6 text-dc-gray">Recommended maximum: 150 words. We’ll reuse this profile across your proposals where possible.</p>
        </div>
        <label class="block">
          <span class="editorial-label">{{ archiveItemLabel }} Title <span class="text-red-600">*</span></span>
          <input v-model="form.title" required :placeholder="form.kind === 'product_demo' ? 'Show what your product does' : 'Building Scalable APIs with GraphQL'" class="editorial-input" />
        </label>
        <label v-if="!isConferenceCall" class="flex cursor-pointer items-center gap-3 rounded-md border border-dc-border bg-dc-paper-warm px-3 py-3 text-sm font-medium text-dc-gray">
          <input v-model="form.kind" type="checkbox" true-value="product_demo" false-value="talk" class="h-4 w-4 accent-dc-pink" />
          This is a product demo
        </label>
        <div v-if="isConferenceCall" class="grid gap-4 sm:grid-cols-2">
          <label class="block">
            <span class="editorial-label">Topic track <span class="text-red-600">*</span></span>
            <select v-model="form.topic" required class="editorial-input bg-white">
              <option value="" disabled>Choose one track</option>
              <option v-for="track in ANNUAL_CONFERENCE_TOPIC_TRACKS" :key="track" :value="track">{{ track }}</option>
            </select>
          </label>
          <label class="block">
            <span class="editorial-label">Session type <span class="text-red-600">*</span></span>
            <select v-model="form.session_type" required class="editorial-input bg-white">
              <option value="" disabled>Choose one session type</option>
              <option v-for="sessionType in ANNUAL_CONFERENCE_SESSION_TYPES" :key="sessionType" :value="sessionType">{{ sessionType }}</option>
            </select>
          </label>
        </div>
        <div>
          <div class="mb-2 flex items-end justify-between gap-4">
            <label for="cfp-abstract" class="editorial-label">{{ archiveSummaryLabel }} <span class="text-red-600">*</span></label>
            <span class="font-mono text-xs font-semibold uppercase tracking-wide" :class="abstractOverLimit ? 'text-red-700' : 'text-dc-gray'">
              {{ abstractWordCount }}/{{ abstractWordLimit }} words
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
        <fieldset v-if="isConferenceCall" class="space-y-3 border-t border-dc-border pt-5">
          <legend class="editorial-label">Learning outcomes <span class="text-red-600">*</span></legend>
          <p class="text-sm leading-6 text-dc-gray">Add 3–5 concrete things attendees will understand, be able to do, or take away after your session.</p>
          <div v-for="(_outcome, index) in form.learning_outcomes" :key="index" class="flex items-center gap-2">
            <label class="sr-only" :for="`cfp-outcome-${index}`">Learning outcome {{ index + 1 }}</label>
            <input :id="`cfp-outcome-${index}`" v-model="form.learning_outcomes[index]" required :placeholder="`Outcome ${index + 1}`" class="editorial-input flex-1" />
            <button type="button" class="motion-press min-h-11 rounded-md border border-dc-ink bg-dc-paper px-3 font-mono text-xs font-semibold uppercase" :aria-label="`Remove learning outcome ${index + 1}`" @click="removeLearningOutcome(index)">Remove</button>
          </div>
          <button v-if="form.learning_outcomes.length < ANNUAL_CONFERENCE_LEARNING_OUTCOME_MAX" type="button" class="motion-press rounded-md border-2 border-dc-ink bg-dc-paper px-4 py-2 font-mono text-xs font-semibold uppercase" @click="addLearningOutcome">Add another outcome</button>
          <p v-if="form.learning_outcomes.length < ANNUAL_CONFERENCE_LEARNING_OUTCOME_MIN" class="text-sm font-semibold text-dc-pink">Add at least {{ ANNUAL_CONFERENCE_LEARNING_OUTCOME_MIN }} outcomes before submitting.</p>
        </fieldset>
        <label v-if="!isConferenceCall" class="block">
          <span class="editorial-label">{{ form.kind === 'product_demo' ? 'Demo link' : 'Presentation link' }} <span class="text-dc-gray">(optional)</span></span>
          <input
            v-model="form.resource_url"
            type="url"
            inputmode="url"
            autocomplete="url"
            placeholder="https://..."
            class="editorial-input font-mono"
            :class="{ 'cfp-input-error border-red-700 bg-red-50': resourceUrlInvalid }"
            aria-describedby="cfp-resource-help cfp-resource-error"
          />
          <span id="cfp-resource-help" class="mt-2 block text-sm leading-6 text-dc-gray">
            Share slides, a demo, recording, repository, or project page if it is ready. You can add or replace it later.
          </span>
          <span v-if="resourceUrlError" id="cfp-resource-error" class="mt-2 block text-sm font-semibold text-red-800" role="alert">{{ resourceUrlError }}</span>
        </label>
        <div class="flex flex-col items-center justify-center gap-4 sm:flex-row">
          <TurnstileWidget
            v-if="turnstileActive"
            ref="turnstileWidget"
            :action="CFP_SUBMISSION_TURNSTILE_ACTION"
            @token-change="turnstileToken = $event"
            @error="turnstileError = $event ?? ''"
          />
          <button
            type="submit"
            :disabled="!canSubmitProposal"
            :aria-busy="submitting"
            class="motion-press w-full rounded-md border-2 border-dc-ink bg-dc-pink px-6 py-4 font-mono text-lg font-semibold uppercase tracking-wide text-white shadow-[2px_2px_0_#111111] disabled:cursor-not-allowed disabled:opacity-50 sm:flex-1"
          >
            <SubmissionProgressLabel v-if="submissionStage" :stage="submissionStage" />
            <template v-else>SUBMIT PROPOSAL</template>
          </button>
        </div>
        <p v-if="turnstileError" class="text-sm font-semibold text-red-800" role="alert">{{ turnstileError }}</p>
      </form>
    </div>
  </div>
</template>
function addLearningOutcome() {
  if (form.learning_outcomes.length < ANNUAL_CONFERENCE_LEARNING_OUTCOME_MAX) form.learning_outcomes.push('');
}

function removeLearningOutcome(index: number) {
  form.learning_outcomes.splice(index, 1);
}
