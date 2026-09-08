<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import AppDropdown from '@/src/components/AppDropdown.vue';
import TurnstileWidget from '@/src/components/TurnstileWidget.vue';
import CfpPageSkeleton from '@/src/components/ui/page-skeletons/CfpPageSkeleton.vue';
import SubmissionProgressLabel from '@/src/components/ui/SubmissionProgressLabel.vue';
import LearningOutcomesEditor from '@/src/components/ui/LearningOutcomesEditor.vue';
import ConfirmDialog from '@/src/components/ui/ConfirmDialog.vue';
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
const submitConfirmationOpen = ref(false);
const error = ref<string | null>(null);
const loadError = ref(false);
const turnstileWidget = ref<InstanceType<typeof TurnstileWidget> | null>(null);
const turnstileToken = ref('');
const turnstileError = ref('');
const turnstileActive = turnstileEnabled();
const MONTHLY_ABSTRACT_WORD_LIMIT = 120;
const devconLogoSrc = '/brand/dev-con-logo.webp';
const conferenceTrackOptions = ANNUAL_CONFERENCE_TOPIC_TRACKS.map((value) => ({ value, label: value }));
const conferenceSessionTypeOptions = ANNUAL_CONFERENCE_SESSION_TYPES.map((value) => ({ value, label: value }));
const proposalForm = ref<HTMLFormElement | null>(null);
const mobileViewport = ref(false);
const currentStep = ref(0);
const stepDirection = ref<'forward' | 'backward'>('forward');
const stepTitles = ['About you', 'Your session', 'Attendee takeaways'];
const proposalStepper = computed(() => isConferenceCall.value);
const showStepErrors = ref(false);
const stepIssues = computed(() => [
  [
    !form.speaker_name.trim() ? 'Enter your name.' : '',
    !speakerEmailValid.value ? 'Enter a valid email address.' : '',
    !form.bio.trim() ? 'Add your speaker bio.' : '',
  ].filter(Boolean),
  [
    !form.title.trim() ? 'Add a talk title.' : '',
    !form.topic ? 'Choose a topic track.' : '',
    !form.session_type ? 'Choose a session type.' : '',
    !form.abstract.trim() ? 'Add your abstract.' : abstractOverLimit.value ? 'Keep the abstract to 250 words or fewer.' : '',
  ].filter(Boolean),
  learningOutcomesValid.value ? [] : ['Add 3–5 learning outcomes and complete or remove empty rows.'],
]);
const stepValid = computed(() => stepIssues.value.map(issues => issues.length === 0));
const visibleStepIssues = computed(() => showStepErrors.value ? stepIssues.value[currentStep.value] : []);

async function changeStep(step: number) {
  stepDirection.value = step > currentStep.value ? 'forward' : 'backward';
  currentStep.value = step;
  showStepErrors.value = false;
  await nextTick();
  const heading = proposalForm.value?.querySelector<HTMLElement>(`#cfp-section-${step}`);
  heading?.focus({ preventScroll: true });
  proposalForm.value?.scrollIntoView({ block: 'start', behavior: 'instant' });
}

function focusCurrentStep() {
  proposalForm.value?.querySelector<HTMLElement>(`#cfp-section-${currentStep.value}`)?.focus({ preventScroll: true });
}

function continueStep() {
  if (!stepValid.value[currentStep.value]) {
    showStepErrors.value = true;
    return;
  }
  void changeStep(currentStep.value + 1);
}

let viewportQuery: MediaQueryList | undefined;
function updateViewport() { mobileViewport.value = viewportQuery?.matches ?? false; }
onMounted(() => {
  viewportQuery = window.matchMedia('(max-width: 767px)');
  updateViewport();
  viewportQuery.addEventListener('change', updateViewport);
});
onUnmounted(() => viewportQuery?.removeEventListener('change', updateViewport));

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
const learningOutcomesValid = computed(() => (
  form.learning_outcomes.length >= ANNUAL_CONFERENCE_LEARNING_OUTCOME_MIN
  && form.learning_outcomes.length <= ANNUAL_CONFERENCE_LEARNING_OUTCOME_MAX
  && form.learning_outcomes.every((outcome) => outcome.trim().length > 0)
));
const requiredFieldsComplete = computed(() => Boolean(
  form.speaker_name.trim()
  && speakerEmailValid.value
  && form.title.trim()
  && form.abstract.trim()
  && (!isConferenceCall.value || (
    form.bio.trim()
    && form.topic
    && form.session_type
    && learningOutcomesValid.value
  )),
));
const cfpIsAvailable = computed(() => Boolean(event.value && event.value.status === 'cfp_open'));
const submitHint = computed(() => {
  if (submitting.value) return '';
  if (isConferenceCall.value && !learningOutcomesValid.value) {
    const remaining = Math.max(0, ANNUAL_CONFERENCE_LEARNING_OUTCOME_MIN - form.learning_outcomes.filter(outcome => outcome.trim()).length);
    return remaining ? `Add ${remaining} more learning outcome${remaining === 1 ? '' : 's'} to continue.` : 'Complete or remove empty outcomes before submitting.';
  }
  if (abstractOverLimit.value) return `Keep the abstract to ${abstractWordLimit.value} words or fewer.`;
  if (!isConferenceCall.value && resourceUrlInvalid.value) return resourceUrlError.value;
  if (turnstileActive && !turnstileToken.value) return 'Complete the human check to submit your proposal.';
  return '';
});
const canSubmitProposal = computed(() => (
  cfpIsAvailable.value
  && (!isConferenceCall.value || learningOutcomesValid.value)
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

async function submitProposal() {
  if (proposalStepper.value && currentStep.value < 2) {
    continueStep();
    return;
  }
  if (isConferenceCall.value) {
    const invalidStep = stepValid.value.findIndex((valid) => !valid);
    if (invalidStep !== -1) {
      await changeStep(invalidStep);
      showStepErrors.value = true;
      return;
    }
  }
  if (!canSubmitProposal.value) return;

  if (isConferenceCall.value) {
    submitConfirmationOpen.value = true;
    return;
  }

  await performProposalSubmission();
}

async function confirmProposalSubmission() {
  if (submitting.value) return;
  await performProposalSubmission();
  submitConfirmationOpen.value = false;
}

async function performProposalSubmission() {
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

async function submitAnotherProposal() {
  form.title = '';
  form.topic = '';
  form.session_type = '';
  form.abstract = '';
  form.learning_outcomes = [''];
  form.resource_url = '';
  currentStep.value = 0;
  stepDirection.value = 'backward';
  showStepErrors.value = false;
  error.value = null;
  turnstileToken.value = '';
  turnstileError.value = '';
  turnstileWidget.value?.reset();
  submitted.value = false;
  await nextTick();
  focusCurrentStep();
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
  <div class="cfp-public-page min-h-screen bg-dc-cream text-dc-ink" :class="{ 'cfp-developer-theme': isConferenceCall }">
    <div v-if="isConferenceCall" class="cfp-backdrop" aria-hidden="true">
      <span class="cfp-brace cfp-brace--open">{</span>
      <span class="cfp-brace cfp-brace--close">}</span>
    </div>
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

          <h2>{{ isConferenceCall ? 'Proposal received.' : 'Thank you.' }}</h2>
          <p class="cfp-success-copy">
            {{ isConferenceCall
              ? `Thanks${form.speaker_name.trim() ? `, ${form.speaker_name.trim().split(/\s+/)[0]}` : ''}. Your proposal is now with the DevCongress review team.`
              : 'We’ll be in touch if your proposal is selected.' }}
          </p>

          <div class="cfp-success-pass">
            <div>
              <span>{{ archiveItemLabel }} title</span>
              <strong>{{ form.title || 'Your presentation title' }}</strong>
            </div>
          </div>

          <button
            v-if="isConferenceCall"
            type="button"
            class="motion-press mt-6 min-h-12 w-full rounded-md border-2 border-dc-ink bg-dc-yellow px-5 py-3 font-mono text-xs font-bold uppercase tracking-[0.1em] text-dc-ink shadow-[3px_3px_0_#111111]"
            @click="submitAnotherProposal"
          >Submit another proposal</button>
          <p class="cfp-success-footnote">{{ isConferenceCall ? 'Done for now? You can safely close this tab.' : 'You can close this tab.' }}</p>
        </div>
      </div>
    </div>

    <div v-else class="cfp-form-content relative mx-auto max-w-3xl px-4 py-5 sm:py-12">
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
        <p class="mt-4 text-base leading-7 text-dc-gray">
          {{ isConferenceCall ? 'Submit one complete talk proposal. You can return and submit another proposal separately.' : "Share something you've built, learned, or explored with the DevCongress community." }}
        </p>
      </div>

      <form ref="proposalForm" :novalidate="isConferenceCall" class="editorial-panel space-y-5 p-4 sm:space-y-6 sm:p-8" @submit.prevent="submitProposal">
        <div v-if="error" class="border-2 border-red-700 bg-red-100 p-4 font-mono text-sm text-red-800">{{ error }}</div>
        <div v-if="proposalStepper" class="space-y-3" aria-label="Proposal progress">
          <div class="flex min-h-11 items-center justify-between gap-3">
            <p class="min-w-0 font-mono text-xs font-semibold uppercase tracking-wide text-dc-gray" aria-live="polite">Step {{ currentStep + 1 }} of 3 · {{ stepTitles[currentStep] }}</p>
            <button v-if="currentStep > 0" type="button" :disabled="submitting" class="motion-press inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md border border-dc-border px-3 py-2 text-sm font-semibold disabled:opacity-50" @click="changeStep(currentStep - 1)"><span aria-hidden="true">←</span> Back</button>
          </div>
          <ol class="flex gap-2" aria-label="Proposal steps">
            <li v-for="(title, index) in stepTitles" :key="title" class="h-1 flex-1 rounded-full" :class="index <= currentStep ? 'bg-dc-pink' : 'bg-dc-border'" :aria-current="index === currentStep ? 'step' : undefined"><span class="sr-only">{{ title }}</span></li>
          </ol>
        </div>
        <div class="cfp-step-viewport">
        <Transition :name="`cfp-step-${stepDirection}`" mode="out-in" @before-leave="(element: Element) => element.setAttribute('inert', '')" @after-enter="focusCurrentStep">
        <div :key="currentStep" class="space-y-5">
        <section v-show="!proposalStepper || currentStep === 0" class="space-y-5" :aria-labelledby="isConferenceCall ? 'cfp-section-0' : undefined">
        <h2 v-if="isConferenceCall" id="cfp-section-0" tabindex="-1" class="cfp-section-title">About you</h2>
        <div class="grid gap-4 sm:grid-cols-2">
          <label class="block">
            <span class="editorial-label">Your Name <span class="text-red-600">*</span></span>
            <input v-model="form.speaker_name" autocomplete="name" required class="editorial-input font-mono" />
          </label>
          <label class="block">
            <span class="editorial-label">Email Address <span class="text-red-600">*</span></span>
            <input
              v-model="form.speaker_email"
              required
              type="email"
              autocomplete="email"
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
        </section>
        <section v-show="!proposalStepper || currentStep === 1" class="space-y-5" :aria-labelledby="isConferenceCall ? 'cfp-section-1' : undefined">
        <h2 v-if="isConferenceCall" id="cfp-section-1" tabindex="-1" class="cfp-section-title">Your session</h2>
        <label class="block">
          <span class="editorial-label">{{ archiveItemLabel }} Title <span class="text-red-600">*</span></span>
          <input v-model="form.title" required :placeholder="form.kind === 'product_demo' ? 'Show what your product does' : 'Building Scalable APIs with GraphQL'" class="editorial-input" />
        </label>
        <label v-if="!isConferenceCall" class="flex cursor-pointer items-center gap-3 rounded-md border border-dc-border bg-dc-paper-warm px-3 py-3 text-sm font-medium text-dc-gray">
          <input v-model="form.kind" type="checkbox" true-value="product_demo" false-value="talk" class="h-4 w-4 accent-dc-pink" />
          This is a product demo
        </label>
        <div v-if="isConferenceCall" class="grid gap-4 sm:grid-cols-2">
          <AppDropdown
            :model-value="form.topic"
            :options="conferenceTrackOptions"
            label="Topic track *"
            placeholder="Choose one track"
            teleport
            menu-class="cfp-choice-menu"
            class="min-w-0"
            required
            @update:model-value="form.topic = $event as AnnualConferenceTopicTrack"
          />
          <AppDropdown
            :model-value="form.session_type"
            :options="conferenceSessionTypeOptions"
            label="Session type *"
            placeholder="Choose one session type"
            teleport
            menu-class="cfp-choice-menu"
            class="min-w-0"
            required
            @update:model-value="form.session_type = $event as AnnualConferenceSessionType"
          />
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
        </section>
        <section v-if="isConferenceCall" v-show="currentStep === 2" class="space-y-5" aria-labelledby="cfp-section-2">
        <h2 id="cfp-section-2" tabindex="-1" class="cfp-section-title">Attendee takeaways</h2>
        <LearningOutcomesEditor v-model="form.learning_outcomes" />
        </section>
        </div>
        </Transition>
        </div>
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
        <div aria-live="polite" aria-atomic="true">
          <ul v-if="visibleStepIssues.length" class="list-disc space-y-1 pl-5 text-sm font-medium text-red-800" aria-label="Issues to correct">
            <li v-for="issue in visibleStepIssues" :key="issue">{{ issue }}</li>
          </ul>
        </div>
        <div v-if="proposalStepper" class="flex items-center gap-3 border-t border-dc-border pt-5">
          <button v-if="currentStep < 2" type="submit" class="motion-press min-h-11 flex-1 rounded-md border-2 border-dc-ink bg-dc-pink px-5 py-3 text-sm font-semibold text-white">Continue <span aria-hidden="true">→</span></button>
          <p v-else class="text-xs leading-5 text-dc-gray">You can go back to review your proposal before submitting.</p>
        </div>
        <div v-show="!proposalStepper || currentStep === 2" class="flex flex-col items-center justify-center gap-4 sm:flex-row">
          <TurnstileWidget
            v-if="turnstileActive && (!proposalStepper || currentStep === 2)"
            :key="mobileViewport ? 'mobile-check' : 'desktop-check'"
            ref="turnstileWidget"
            :action="CFP_SUBMISSION_TURNSTILE_ACTION"
            :size="mobileViewport ? 'compact' : 'normal'"
            @token-change="turnstileToken = $event"
            @error="turnstileError = $event ?? ''"
          />
          <button
            type="submit"
            :aria-describedby="submitHint ? 'cfp-submit-help' : undefined"
            :disabled="!canSubmitProposal"
            :aria-busy="submitting"
            class="motion-press w-full rounded-md border-2 border-dc-ink bg-dc-pink px-6 py-4 font-mono text-lg font-semibold uppercase tracking-wide text-white shadow-[2px_2px_0_#111111] disabled:cursor-not-allowed disabled:opacity-50 sm:flex-1"
          >
            <SubmissionProgressLabel v-if="submissionStage" :stage="submissionStage" />
            <template v-else>SUBMIT PROPOSAL</template>
          </button>
        </div>
        <p v-if="submitHint && (!proposalStepper || currentStep === 2)" id="cfp-submit-help" class="app-form-help">{{ submitHint }}</p>
        <p v-if="turnstileError && (!proposalStepper || currentStep === 2)" class="text-sm font-semibold text-red-800" role="alert">{{ turnstileError }}</p>
      </form>
    </div>
    <ConfirmDialog
      :open="submitConfirmationOpen"
      title="Submit this proposal?"
      message="This sends this proposal to the organizers for review. You can submit another proposal separately."
      confirm-label="Submit proposal"
      busy-label="Submitting…"
      cancel-label="Keep editing"
      :busy="submitting"
      @cancel="submitConfirmationOpen = false"
      @confirm="confirmProposalSubmission"
    />
  </div>
</template>
<style scoped>
.cfp-step-viewport { overflow-x: clip; padding: 4px; margin: -4px; }
.cfp-step-forward-enter-active, .cfp-step-backward-enter-active {
  transition: transform 160ms var(--motion-smooth), opacity 160ms var(--motion-smooth);
}
.cfp-step-forward-leave-active, .cfp-step-backward-leave-active {
  transition: transform 100ms var(--motion-fast), opacity 100ms var(--motion-fast);
}
.cfp-step-forward-enter-from, .cfp-step-backward-leave-to { transform: translateX(20px); opacity: 0; }
.cfp-step-forward-leave-to, .cfp-step-backward-enter-from { transform: translateX(-20px); opacity: 0; }
@media (prefers-reduced-motion: reduce) {
  .cfp-step-forward-enter-active, .cfp-step-backward-enter-active,
  .cfp-step-forward-leave-active, .cfp-step-backward-leave-active { transition: none; }
  .cfp-step-forward-enter-from, .cfp-step-backward-enter-from,
  .cfp-step-forward-leave-to, .cfp-step-backward-leave-to { transform: none; }
}
.cfp-section-title {
  font-size: 1.125rem;
  font-weight: 600;
  scroll-margin-top: 24px;
}
.cfp-section-title:focus-visible { outline: 2px solid var(--dc-pink, #ec008c); outline-offset: 4px; }
.cfp-developer-theme {
  position: relative;
  isolation: isolate;
}

.cfp-backdrop {
  position: absolute;
  inset: 0;
  z-index: -1;
  overflow: hidden;
  pointer-events: none;
  background-image: radial-gradient(circle, rgb(17 17 17 / 12%) .8px, transparent 1px);
  background-size: 24px 24px;
  mask-image: linear-gradient(to right, #000, transparent 30%, transparent 70%, #000);
}

.cfp-brace {
  position: absolute;
  color: rgb(17 17 17 / 7%);
  font-family: 'IBM Plex Mono', monospace;
  font-size: clamp(180px, 23vw, 360px);
  font-weight: 400;
  line-height: 1;
  user-select: none;
}

.cfp-brace--open { top: 150px; left: max(12px, calc(50% - 640px)); }
.cfp-brace--close { top: 510px; right: max(12px, calc(50% - 640px)); }

:global(.cfp-choice-menu [role='option'] > span:last-child) {
  white-space: normal;
  overflow-wrap: anywhere;
}

@media (max-width: 767px) {
  .cfp-backdrop {
    mask-image: linear-gradient(#000, transparent 330px);
    background-size: 20px 20px;
  }
  .cfp-brace--open { top: 12px; left: -55px; }
  .cfp-brace--close { top: 95px; right: -55px; }
}
</style>
