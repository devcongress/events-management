<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import type { SpeakerSubmission, SpeakerSubmissionStatus } from '@/types';
import type { AnnualConferenceSpeakerSubmission } from '@/lib/annual-conference-speakers';
import { safePublicResourceUrl } from '@/lib/safe-url';

type AnnualConferenceSpeakerSubmissionWithLogistics = AnnualConferenceSpeakerSubmission & {
  decision_email_status?: 'pending' | 'accepted' | 'delivered' | 'delayed' | 'failed' | 'bounced' | 'suppressed' | 'complained' | null;
  decision_email_recipient?: string | null;
  decision_email_last_attempt_at?: string | null;
  decision_email_delivered_at?: string | null;
  decision_email_last_error?: string | null;
  decision_email_attempt_count?: number;
  decision_email_retryable?: boolean;
  logistics?: {
    slides_url: string | null;
    availability_confirmed: boolean | null;
    technical_requirements: string | null;
    workshop_prerequisites: string | null;
    required_software_equipment: string | null;
    participants_need_laptops: boolean | null;
    preferred_workshop_capacity: number | null;
    updated_at: string | null;
  } | null;
};

const props = defineProps<{
  open: boolean;
  submission: SpeakerSubmission | AnnualConferenceSpeakerSubmissionWithLogistics | null;
  canManage: boolean;
  submitting?: boolean;
  canResendWorkspaceEmail?: boolean;
  approvalBlockedReason?: string | null;
  decisionEmailConfigured?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  approve: [submission: SpeakerSubmission | AnnualConferenceSpeakerSubmissionWithLogistics];
  reject: [submission: SpeakerSubmission | AnnualConferenceSpeakerSubmissionWithLogistics];
  resendWorkspaceEmail: [submission: AnnualConferenceSpeakerSubmissionWithLogistics];
  retryDecisionEmail: [submission: AnnualConferenceSpeakerSubmissionWithLogistics];
  replaceWorkspaceEmail: [submission: AnnualConferenceSpeakerSubmissionWithLogistics];
  correctDecisionEmail: [submission: AnnualConferenceSpeakerSubmissionWithLogistics, email: string];
}>();

const panelRef = ref<HTMLElement | null>(null);
const closeButtonRef = ref<HTMLButtonElement | null>(null);
const correctedEmail = ref('');
let previouslyFocused: HTMLElement | null = null;
let previousBodyOverflow = '';
let previousDocumentOverflow = '';
let appWasInert = false;

const statusLabel = computed(() => {
  if (!props.submission) return '';

  return props.submission.status === 'not_selected' ? 'Not selected' : props.submission.status;
});
const kindLabel = computed(() => props.submission && 'session_type' in props.submission ? props.submission.session_type : props.submission?.kind === 'product_demo' ? 'Product demo' : 'Talk proposal');
const drawerTitle = computed(() => props.submission?.title ?? 'Speaker proposal');
const isLegacyConferenceProposal = computed(() => props.submission
  && 'proposal_schema_version' in props.submission
  && props.submission.proposal_schema_version !== 2);
const resourceUrl = computed(() => props.submission && 'resource_url' in props.submission
  ? safePublicResourceUrl(props.submission.resource_url)
  : null);
const learningOutcomes = computed(() => props.submission && 'learning_outcomes' in props.submission ? props.submission.learning_outcomes : []);
const annualSubmission = computed(() => props.submission && 'proposal_schema_version' in props.submission
  ? props.submission as AnnualConferenceSpeakerSubmissionWithLogistics
  : null);
const canRetryDecisionEmail = computed(() => annualSubmission.value?.decision_email_retryable !== false
  || annualSubmission.value?.decision_email_last_error === 'Automatic email retries were exhausted. Review the recipient and retry manually.');

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-GH', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
}

function statusClass(status: SpeakerSubmissionStatus): string {
  if (status === 'selected') return 'border-[#15803d] bg-[#effcf3] text-[#15803d]';
  if (status === 'not_selected') return 'border-dc-border bg-dc-paper-warm text-dc-gray';

  return 'border-dc-pink bg-[#fff1f7] text-dc-pink';
}

function lockPage() {
  previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  previousBodyOverflow = document.body.style.overflow;
  previousDocumentOverflow = document.documentElement.style.overflow;
  document.body.style.overflow = 'hidden';
  document.documentElement.style.overflow = 'hidden';

  const app = document.querySelector<HTMLElement>('#app');

  appWasInert = app?.hasAttribute('inert') ?? false;
  if (!appWasInert) app?.setAttribute('inert', '');
  document.addEventListener('keydown', handleKeydown);
}

function unlockPage() {
  document.body.style.overflow = previousBodyOverflow;
  document.documentElement.style.overflow = previousDocumentOverflow;
  const app = document.querySelector<HTMLElement>('#app');

  if (!appWasInert) app?.removeAttribute('inert');
  document.removeEventListener('keydown', handleKeydown);
  previouslyFocused?.focus();
  previouslyFocused = null;
}

function requestClose() {
  if (!props.submitting) emit('close');
}

function handleKeydown(event: KeyboardEvent) {
  if (!props.open) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    requestClose();

    return;
  }
  if (event.key !== 'Tab' || !panelRef.value) return;

  const focusable = [...panelRef.value.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )];

  if (!focusable.length) {
    event.preventDefault();
    panelRef.value.focus();

    return;
  }
  const first = focusable[0];
  const last = focusable.at(-1)!;

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

watch(() => props.open, async (open, wasOpen) => {
  if (open && !wasOpen) {
    lockPage();
    await nextTick();
    closeButtonRef.value?.focus();
  } else if (!open && wasOpen) {
    unlockPage();
  }
});

watch(() => props.submission?.id, () => {
  correctedEmail.value = props.submission && 'decision_email_recipient' in props.submission
    ? props.submission.decision_email_recipient ?? props.submission.speaker_email
    : props.submission?.speaker_email ?? '';
}, { immediate: true });

onUnmounted(() => {
  if (props.open) unlockPage();
});
</script>

<template>
  <Teleport to="body">
    <Transition name="annual-speaker-drawer">
      <div v-if="open && submission" class="fixed inset-0 z-[130] flex justify-end bg-black/30" role="presentation" @click.self="requestClose">
        <section ref="panelRef" class="flex h-full w-full max-w-[var(--organizer-detail-drawer-width)] flex-col border-l-2 border-dc-ink bg-dc-paper shadow-[-10px_0_0_rgba(17,17,17,0.14)]" role="dialog" aria-modal="true" aria-labelledby="annual-conference-speaker-drawer-title" tabindex="-1">
          <header class="flex shrink-0 items-start justify-between gap-4 border-b-2 border-dc-ink bg-dc-yellow px-5 py-4 sm:px-6">
            <div class="min-w-0">
              <p class="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-dc-ink">{{ kindLabel }}</p>
              <h2 id="annual-conference-speaker-drawer-title" class="mt-1 text-2xl font-bold leading-tight tracking-tight text-dc-ink">{{ drawerTitle }}</h2>
            </div>
            <button ref="closeButtonRef" type="button" class="motion-press grid min-h-10 min-w-10 place-items-center rounded-md border-2 border-dc-ink bg-dc-paper font-mono text-lg font-semibold text-dc-ink shadow-[2px_2px_0_#111111]" :disabled="submitting" aria-label="Close speaker proposal" @click="requestClose">×</button>
          </header>

          <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <span class="rounded-md border px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.08em]" :class="statusClass(submission.status)">{{ statusLabel }}</span>
              <span class="font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-dc-gray">Submitted {{ formatDate(submission.created_at) }}</span>
            </div>

            <section v-if="isLegacyConferenceProposal" class="mt-6 rounded-md border border-amber-600 bg-amber-50 p-4 text-sm leading-6 text-dc-ink">
              This proposal predates the complete conference form and cannot be accepted. Ask the speaker to submit a new proposal with the required track, session type, bio, abstract, and learning outcomes.
            </section>

            <section class="mt-6 border-t-2 border-dc-ink pt-5">
              <p class="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-dc-gray">Abstract</p>
              <p class="mt-2 whitespace-pre-line text-base font-medium leading-7" :class="submission.abstract ? 'text-dc-ink' : 'text-dc-gray'">{{ submission.abstract ?? 'No abstract was provided.' }}</p>
            </section>

            <dl class="mt-6 grid gap-5 border-y border-dc-border py-5 sm:grid-cols-2">
              <div>
                <dt class="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-dc-gray">Speaker</dt>
                <dd class="mt-1 text-sm font-semibold text-dc-ink">{{ submission.speaker_name }}</dd>
                <dd class="mt-1 text-sm text-dc-gray"><a class="underline decoration-dc-border underline-offset-4 hover:text-dc-pink" :href="`mailto:${submission.speaker_email}`">{{ submission.speaker_email }}</a></dd>
              </div>
              <div>
                <dt class="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-dc-gray">Topic</dt>
                <dd class="mt-1 text-sm font-semibold text-dc-ink">{{ submission.topic }}</dd>
                <dd v-if="'github_username' in submission && submission.github_username" class="mt-1 text-sm text-dc-gray">@{{ submission.github_username }}</dd>
              </div>
            </dl>

            <section v-if="learningOutcomes.length" class="mt-6">
              <p class="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-dc-gray">Learning outcomes</p>
              <ol class="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-dc-ink">
                <li v-for="outcome in learningOutcomes" :key="outcome">{{ outcome }}</li>
              </ol>
            </section>

            <section v-if="submission.bio" class="mt-6 rounded-md border border-dc-border bg-dc-paper-warm p-4">
              <p class="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-dc-gray">Speaker bio</p>
              <p class="mt-2 whitespace-pre-line text-sm leading-6 text-dc-gray">{{ submission.bio }}</p>
            </section>

            <section v-if="!('session_type' in submission)" class="mt-6 rounded-md border border-dc-border bg-dc-paper-warm p-4">
              <p class="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-dc-gray">{{ submission.kind === 'product_demo' ? 'Demo link' : 'Presentation link' }}</p>
              <a v-if="resourceUrl" :href="resourceUrl" target="_blank" rel="noopener noreferrer nofollow" class="mt-2 inline-block text-sm font-semibold text-dc-pink underline decoration-dc-border underline-offset-4 hover:text-dc-ink">Open submitted resource ↗</a>
              <p v-else class="mt-2 text-sm leading-6 text-dc-gray">No resource link was submitted.</p>
            </section>

            <section v-if="submission.status === 'selected'" class="mt-6 rounded-md border border-[#15803d] bg-[#effcf3] p-4">
              <p class="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-[#15803d]">Selected</p>
              <p class="mt-2 text-sm leading-6 text-dc-ink">The proposal is locked in. The speaker can update logistics through their private workspace until the conference deadline.</p>
              <p v-if="'decision_email_status' in submission" class="mt-2 font-mono text-[10px] font-semibold uppercase tracking-wide text-dc-gray">Workspace email: {{ submission.decision_email_status ?? 'pending' }}</p>
              <dl v-if="'logistics' in submission && submission.logistics" class="mt-4 grid gap-3 border-t border-[#86efac] pt-4 text-sm sm:grid-cols-2">
                <div><dt class="text-dc-gray">Availability</dt><dd class="font-semibold">{{ submission.logistics.availability_confirmed === true ? 'Confirmed' : submission.logistics.availability_confirmed === false ? 'Not yet confirmed' : 'Not answered' }}</dd></div>
                <div><dt class="text-dc-gray">Participant laptops</dt><dd class="font-semibold">{{ submission.logistics.participants_need_laptops === true ? 'Required' : submission.logistics.participants_need_laptops === false ? 'Not required' : 'Not answered' }}</dd></div>
                <div v-if="submission.logistics.preferred_workshop_capacity"><dt class="text-dc-gray">Workshop capacity</dt><dd class="font-semibold">{{ submission.logistics.preferred_workshop_capacity }}</dd></div>
                <div v-if="submission.logistics.slides_url"><dt class="text-dc-gray">Slides/resources</dt><dd><a :href="submission.logistics.slides_url" target="_blank" rel="noopener noreferrer nofollow" class="font-semibold text-dc-pink underline">Open link ↗</a></dd></div>
                <div v-if="submission.logistics.technical_requirements" class="sm:col-span-2"><dt class="text-dc-gray">Technical/setup requirements</dt><dd class="mt-1 whitespace-pre-line">{{ submission.logistics.technical_requirements }}</dd></div>
                <div v-if="submission.logistics.workshop_prerequisites" class="sm:col-span-2"><dt class="text-dc-gray">Workshop prerequisites</dt><dd class="mt-1 whitespace-pre-line">{{ submission.logistics.workshop_prerequisites }}</dd></div>
                <div v-if="submission.logistics.required_software_equipment" class="sm:col-span-2"><dt class="text-dc-gray">Software/equipment</dt><dd class="mt-1 whitespace-pre-line">{{ submission.logistics.required_software_equipment }}</dd></div>
              </dl>
            </section>

            <section v-if="annualSubmission && annualSubmission.status !== 'submitted'" class="mt-6 rounded-md border border-dc-border bg-dc-paper-warm p-4">
              <p class="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-dc-pink">Decision email</p>
              <dl class="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                <div><dt class="text-dc-gray">Status</dt><dd class="font-semibold capitalize text-dc-ink">{{ annualSubmission.decision_email_status ?? 'pending' }}</dd></div>
                <div><dt class="text-dc-gray">Attempts</dt><dd class="font-semibold text-dc-ink">{{ annualSubmission.decision_email_attempt_count ?? 0 }}</dd></div>
                <div class="sm:col-span-2"><dt class="text-dc-gray">Delivery address</dt><dd class="mt-1 font-semibold text-dc-ink">{{ annualSubmission.decision_email_recipient ?? annualSubmission.speaker_email }}</dd></div>
                <div v-if="annualSubmission.decision_email_last_error" class="sm:col-span-2"><dt class="text-dc-gray">Needs attention</dt><dd class="mt-1 text-red-700">{{ annualSubmission.decision_email_last_error }}</dd></div>
              </dl>
              <form v-if="canManage" class="mt-4 flex flex-col gap-2 border-t border-dc-border pt-4 sm:flex-row" @submit.prevent="emit('correctDecisionEmail', annualSubmission, correctedEmail)">
                <label class="min-w-0 flex-1">
                  <span class="sr-only">Correct decision email address</span>
                  <input v-model.trim="correctedEmail" type="email" autocomplete="email" required class="app-form-control min-h-11 w-full border-2 border-dc-ink px-3 text-sm" aria-label="Correct decision email address">
                </label>
                <button type="submit" class="motion-press min-h-11 rounded-md border-2 border-dc-ink bg-dc-paper px-4 py-2 font-mono text-[10px] font-semibold uppercase" :disabled="submitting || correctedEmail === (annualSubmission.decision_email_recipient ?? annualSubmission.speaker_email)">Save and resend</button>
              </form>
            </section>
          </div>

          <footer class="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t-2 border-dc-ink bg-dc-paper px-5 py-4 sm:px-6">
            <template v-if="submission.status === 'submitted' && canManage && !isLegacyConferenceProposal">
              <p v-if="approvalBlockedReason" class="mr-auto w-full text-xs font-semibold leading-5 text-red-700">{{ approvalBlockedReason }}</p>
              <button type="button" class="motion-press min-h-11 rounded-md border-2 border-dc-ink bg-dc-paper px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-dc-ink disabled:opacity-50" :disabled="submitting || !decisionEmailConfigured" @click="emit('reject', submission)">Reject</button>
              <button type="button" class="motion-press min-h-11 rounded-md border-2 border-dc-ink bg-dc-yellow px-5 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-dc-ink shadow-[2px_2px_0_#111111] disabled:opacity-50" :disabled="submitting || Boolean(approvalBlockedReason)" @click="emit('approve', submission)">{{ submitting ? 'Saving…' : 'Approve' }}</button>
            </template>
            <button v-else-if="submission.status === 'submitted' && canManage && isLegacyConferenceProposal" type="button" class="motion-press min-h-11 rounded-md border-2 border-dc-ink bg-dc-paper px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-dc-ink disabled:opacity-50" :disabled="submitting || !decisionEmailConfigured" @click="emit('reject', submission)">Reject legacy proposal</button>
            <template v-else-if="canManage && 'session_type' in submission">
              <button v-if="submission.status === 'not_selected' && submission.decision_email_status === 'failed' && canRetryDecisionEmail" type="button" class="motion-press min-h-11 rounded-md border-2 border-dc-ink bg-dc-yellow px-5 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-dc-ink" :disabled="submitting" @click="emit('retryDecisionEmail', submission)">Retry decision email</button>
              <button v-if="submission.status === 'selected' && canResendWorkspaceEmail" type="button" class="motion-press min-h-11 rounded-md border-2 border-dc-ink bg-dc-yellow px-5 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-dc-ink" :disabled="submitting" @click="emit('resendWorkspaceEmail', submission)">Retry workspace email</button>
              <button v-if="submission.status === 'selected' && ['accepted', 'delivered'].includes(submission.decision_email_status ?? '')" type="button" class="motion-press min-h-11 rounded-md border-2 border-dc-ink bg-dc-paper px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-dc-ink" :disabled="submitting" @click="emit('replaceWorkspaceEmail', submission)">Replace private link</button>
            </template>
            <p v-else-if="submission.status === 'submitted'" class="mr-auto text-xs font-semibold leading-5 text-dc-gray">Only organizers with speaker-review access can make a decision.</p>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.annual-speaker-drawer-enter-active,
.annual-speaker-drawer-leave-active {
  transition: opacity 180ms cubic-bezier(0.4, 0, 0.2, 1);
}

.annual-speaker-drawer-enter-active section,
.annual-speaker-drawer-leave-active section {
  transition: transform 260ms cubic-bezier(0.16, 1, 0.3, 1);
  will-change: transform;
}

.annual-speaker-drawer-enter-from,
.annual-speaker-drawer-leave-to {
  opacity: 0;
}

.annual-speaker-drawer-enter-from section,
.annual-speaker-drawer-leave-to section {
  transform: translate3d(100%, 0, 0);
}

@media (prefers-reduced-motion: reduce) {
  .annual-speaker-drawer-enter-active,
  .annual-speaker-drawer-leave-active,
  .annual-speaker-drawer-enter-active section,
  .annual-speaker-drawer-leave-active section {
    transition-duration: 0.01ms;
  }

  .annual-speaker-drawer-enter-from section,
  .annual-speaker-drawer-leave-to section {
    transform: none;
  }
}
</style>
