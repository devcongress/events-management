<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import { adminPath } from '@/src/admin-routes';
import AppDropdown from '@/src/components/AppDropdown.vue';
import ConfirmDialog from '@/src/components/ui/ConfirmDialog.vue';
import AdminTalksPageSkeleton from '@/src/components/ui/page-skeletons/AdminTalksPageSkeleton.vue';
import { notify } from '@/src/lib/notify';
import type { Event, EventStatus, SpeakerSubmission, SpeakerSubmissionStatus, Talk, TalkStatus } from '@/types';

const route = useRoute();
type TalkSection = 'cfp' | 'proposals' | 'program' | 'backfill';
const event = ref<Event | null>(null);
const talks = ref<Talk[]>([]);
const speakerSubmissions = ref<SpeakerSubmission[]>([]);
const loading = ref(true);
const addingTalk = ref(false);
const creatingSpeakerLink = ref(false);
const decidingSubmissionId = ref<string | null>(null);
const updatingCfp = ref(false);
const refreshingSubmissions = ref(false);
const closeCfpDialogOpen = ref(false);
const cfpLinkCopied = ref(false);
const expandedSubmissionId = ref<string | null>(null);
let cfpLinkCopiedResetTimer: ReturnType<typeof setTimeout> | null = null;
const speakerFormEnabled = ref(true);
const speakerLinkExpiresInDays = ref(7);
const generatedSpeakerIntakePath = ref('');
const generatedSpeakerLinkExpiresAt = ref<string | null>(null);
const generatedSpeakerLinkMonth = ref<string | null>(null);
const generatedSpeakerLinkPurpose = ref<'archive_backfill' | 'selected_speaker_confirmation'>('archive_backfill');
const generatedSpeakerLinkSubmissionId = ref('');
const generatedSpeakerLinkTitle = ref('');
const generatedSpeakerLinkSpeakerName = ref('');
const error = ref<string | null>(null);
const groups: { label: string; statuses: TalkStatus[] }[] = [
  { label: 'Pending review', statuses: ['submitted'] },
  { label: 'Accepted', statuses: ['accepted', 'slides_received'] },
  { label: 'Published', statuses: ['published'] },
  { label: 'Rejected', statuses: ['rejected'] },
];
const manualTalkForm = reactive({
  speaker_name: '',
  speaker_email: '',
  github_username: '',
  title: '',
  topic: '',
  abstract: '',
  bio: '',
  slides_url: '',
  publish: false,
});

const groupedTalks = computed(() => groups.map((group) => ({
  ...group,
  talks: talks.value.filter((talk) => group.statuses.includes(talk.status)),
})));
const submissionGroups: { label: string; statuses: SpeakerSubmissionStatus[] }[] = [
  { label: 'Awaiting organizer decision', statuses: ['submitted'] },
  { label: 'Selected speakers', statuses: ['selected'] },
  { label: 'Not selected', statuses: ['not_selected'] },
];
const groupedSubmissions = computed(() => submissionGroups.map((group) => ({
  ...group,
  submissions: speakerSubmissions.value.filter((submission) => group.statuses.includes(submission.status)),
})));
const pendingSubmissionCount = computed(() => speakerSubmissions.value.filter((submission) => submission.status === 'submitted').length);
const selectedAwaitingSlidesCount = computed(() => speakerSubmissions.value.filter((submission) => (
  submission.status === 'selected' && !submission.selected_talk_id
)).length);
const confirmedTalkCount = computed(() => talks.value.length);
const talkSections: { id: TalkSection; label: string }[] = [
  { id: 'cfp', label: 'CFP' },
  { id: 'proposals', label: 'Proposals' },
  { id: 'program', label: 'Program' },
  { id: 'backfill', label: 'Legacy Backfill' },
];
const activeTalkSection = computed<TalkSection>(() => {
  const raw = Array.isArray(route.params.talksSection) ? route.params.talksSection[0] : route.params.talksSection;
  return raw === 'proposals' || raw === 'program' || raw === 'backfill' ? raw : 'cfp';
});
const activeTalkSectionIndex = computed(() => Math.max(
  0,
  talkSections.findIndex((section) => section.id === activeTalkSection.value),
));
const activeTalkSectionIndicatorStyle = computed(() => ({
  transform: `translate3d(${activeTalkSectionIndex.value * 100}%, 0, 0)`,
}));
const cfpFormPath = computed(() => `/cfp/${route.params.eventId}`);
const cfpFormUrl = computed(() => {
  if (typeof window === 'undefined') return cfpFormPath.value;
  return new URL(cfpFormPath.value, window.location.origin).toString();
});
const eventStatus = computed(() => event.value?.status ?? 'draft');
const cfpIsOpen = computed(() => eventStatus.value === 'cfp_open');
const cfpIsClosed = computed(() => eventStatus.value === 'cfp_closed');
const cfpStatusLabel = computed(() => (cfpIsOpen.value ? 'Open' : cfpIsClosed.value ? 'Closed' : 'Not open'));
const cfpStatusHelp = computed(() => {
  if (cfpIsOpen.value) return 'Share the public link. New proposals will land in the inbox below.';
  if (cfpIsClosed.value) return 'Submission is paused. Reopen only if organizers are still accepting proposals.';
  return 'Open CFP when this event is ready to receive speaker proposals.';
});
const manualEntryEnabled = computed(() => !speakerFormEnabled.value);
const speakerLinkExpiryOptions = [3, 7, 14, 31].map((days) => ({
  value: days,
  label: `${days} days`,
}));
const generatedSpeakerIntakeUrl = computed(() => {
  if (!generatedSpeakerIntakePath.value) return '';
  if (typeof window === 'undefined') return generatedSpeakerIntakePath.value;
  return new URL(generatedSpeakerIntakePath.value, window.location.origin).toString();
});
const generatedArchiveBackfillUrl = computed(() => (
  generatedSpeakerLinkPurpose.value === 'archive_backfill' ? generatedSpeakerIntakeUrl.value : ''
));
const generatedSelectedSpeakerUrl = computed(() => (
  generatedSpeakerLinkPurpose.value === 'selected_speaker_confirmation' ? generatedSpeakerIntakeUrl.value : ''
));

function talkSectionPath(section: TalkSection): string {
  return adminPath(`events/${String(route.params.eventId)}/talks/${section}`);
}

function talkSectionCount(section: TalkSection): number | null {
  if (section === 'proposals') return pendingSubmissionCount.value;
  if (section === 'program') return confirmedTalkCount.value;
  return null;
}

async function fetchTalks() {
  const response = await fetch(`/api/events/${route.params.eventId}/talks`);
  if (response.ok) talks.value = await response.json();
}

async function fetchEvent() {
  const response = await fetch(`/api/events/${route.params.eventId}`);
  if (response.ok) event.value = await response.json();
}

async function fetchSpeakerSubmissions() {
  const response = await fetch(`/api/events/${route.params.eventId}/speaker-submissions`, { cache: 'no-store' });
  if (response.ok) {
    const data = await response.json();
    speakerSubmissions.value = data.submissions ?? [];
    return true;
  }

  return false;
}

async function fetchPageData() {
  await Promise.all([fetchEvent(), fetchTalks(), fetchSpeakerSubmissions()]);
  loading.value = false;
}

function resetManualTalkForm() {
  manualTalkForm.speaker_name = '';
  manualTalkForm.speaker_email = '';
  manualTalkForm.github_username = '';
  manualTalkForm.title = '';
  manualTalkForm.topic = '';
  manualTalkForm.abstract = '';
  manualTalkForm.bio = '';
  manualTalkForm.slides_url = '';
  manualTalkForm.publish = false;
}

async function addManualTalk() {
  if (!manualEntryEnabled.value) return;

  addingTalk.value = true;
  error.value = null;

  const shouldPublish = manualTalkForm.publish;
  try {
    const response = await fetch(`/api/events/${route.params.eventId}/talks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(manualTalkForm),
    });

    if (response.ok) {
      resetManualTalkForm();
      await fetchTalks();
      notify.success(shouldPublish ? 'Talk published to the archive.' : 'Talk added to the program.');
    } else {
      const data = await response.json();
      error.value = data.error || 'Failed to add talk';
    }
  } catch {
    error.value = 'Failed to add talk';
  } finally {
    addingTalk.value = false;
  }
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function submissionDetailsOpen(submissionId: string) {
  return expandedSubmissionId.value === submissionId;
}

function toggleSubmissionDetails(submissionId: string) {
  expandedSubmissionId.value = submissionDetailsOpen(submissionId) ? null : submissionId;
}

async function refreshSpeakerSubmissions() {
  refreshingSubmissions.value = true;
  error.value = null;

  try {
    const refreshed = await fetchSpeakerSubmissions();
    if (!refreshed) error.value = 'Could not refresh speaker proposals.';
  } catch {
    error.value = 'Could not refresh speaker proposals.';
  } finally {
    refreshingSubmissions.value = false;
  }
}

async function generateSpeakerIntakeLink() {
  if (!speakerFormEnabled.value) return;

  creatingSpeakerLink.value = true;
  error.value = null;

  try {
    const response = await fetch(`/api/events/${route.params.eventId}/speaker-intake-links`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expires_in_days: speakerLinkExpiresInDays.value }),
    });
    const data = await response.json();

    if (response.ok) {
      generatedSpeakerIntakePath.value = `/speaker-talks/${route.params.eventId}/${data.token}`;
      generatedSpeakerLinkExpiresAt.value = data.link?.expires_at ?? null;
      generatedSpeakerLinkMonth.value = data.link?.event_month ?? null;
      generatedSpeakerLinkPurpose.value = data.link?.purpose ?? 'archive_backfill';
      generatedSpeakerLinkSubmissionId.value = '';
      generatedSpeakerLinkTitle.value = '';
      generatedSpeakerLinkSpeakerName.value = '';
      notify.success('One-time speaker link generated.');
    } else {
      error.value = data.error || 'Could not generate speaker form link.';
    }
  } catch {
    error.value = 'Could not generate speaker form link.';
  } finally {
    creatingSpeakerLink.value = false;
  }
}

async function decideSpeakerSubmission(submissionId: string, status: 'selected' | 'not_selected') {
  decidingSubmissionId.value = submissionId;
  error.value = null;

  try {
    const response = await fetch(`/api/speaker-submissions/${submissionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status,
        expires_in_days: speakerLinkExpiresInDays.value,
      }),
    });
    const data = await response.json();

    if (response.ok) {
      await fetchSpeakerSubmissions();
      if (status === 'selected' && data.token) {
        generatedSpeakerIntakePath.value = `/speaker-talks/${route.params.eventId}/${data.token}`;
        generatedSpeakerLinkExpiresAt.value = data.link?.expires_at ?? null;
        generatedSpeakerLinkMonth.value = data.link?.event_month ?? null;
        generatedSpeakerLinkPurpose.value = 'selected_speaker_confirmation';
        generatedSpeakerLinkSubmissionId.value = data.submission?.id ?? submissionId;
        generatedSpeakerLinkTitle.value = data.submission?.title ?? '';
        generatedSpeakerLinkSpeakerName.value = data.submission?.speaker_name ?? '';
        notify.success('Slides link generated.');
      } else {
        notify.success('Speaker marked as not selected.');
      }
    } else {
      error.value = data.error || 'Failed to update speaker submission';
    }
  } catch {
    error.value = 'Failed to update speaker submission';
  } finally {
    decidingSubmissionId.value = null;
  }
}

async function copyCfpFormLink() {
  if (!cfpIsOpen.value) return;

  error.value = null;

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(cfpFormUrl.value);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = cfpFormUrl.value;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }

    cfpLinkCopied.value = true;
    if (cfpLinkCopiedResetTimer) clearTimeout(cfpLinkCopiedResetTimer);
    cfpLinkCopiedResetTimer = setTimeout(() => {
      cfpLinkCopied.value = false;
      cfpLinkCopiedResetTimer = null;
    }, 2200);
  } catch {
    error.value = 'Could not copy the CFP link.';
  }
}

async function updateCfpStatus(status: Extract<EventStatus, 'cfp_open' | 'cfp_closed'>) {
  updatingCfp.value = true;
  error.value = null;

  try {
    const response = await fetch(`/api/events/${route.params.eventId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    const data = await response.json().catch(() => ({}));

    if (response.ok) {
      event.value = data;
      notify.success(status === 'cfp_open' ? 'CFP opened.' : 'CFP closed.');
    } else {
      error.value = data.error || 'Failed to update CFP status';
    }
  } catch {
    error.value = 'Failed to update CFP status';
  } finally {
    updatingCfp.value = false;
  }
}

function requestCloseCfp() {
  closeCfpDialogOpen.value = true;
}

function cancelCloseCfp() {
  if (updatingCfp.value) return;
  closeCfpDialogOpen.value = false;
}

async function confirmCloseCfp() {
  await updateCfpStatus('cfp_closed');
  if (!error.value) closeCfpDialogOpen.value = false;
}

async function copySpeakerIntakeLink() {
  if (!generatedSpeakerIntakeUrl.value) return;

  error.value = null;

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(generatedSpeakerIntakeUrl.value);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = generatedSpeakerIntakeUrl.value;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }

    notify.success('Speaker form link copied.');
  } catch {
    error.value = 'Could not copy the speaker form link.';
  }
}

async function setStatus(talkId: string, status: TalkStatus) {
  error.value = null;
  const response = await fetch(`/api/talks/${talkId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (response.ok) {
    await fetchTalks();
  } else {
    const data = await response.json();
    error.value = data.error || 'Failed to update talk';
  }
}

async function sendReminder(talkId: string) {
  error.value = null;

  const response = await fetch(`/api/talks/${talkId}/reminder`, { method: 'POST' });
  if (response.ok) {
    notify.success('Reminder logged for speaker follow-up.');
    await fetchTalks();
  } else {
    const data = await response.json();
    error.value = data.error || 'Failed to send reminder';
  }
}

function slideLabel(talk: Talk): string {
  if (talk.slides_uploaded_at) {
    return `Slides received ${new Date(talk.slides_uploaded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  }

  if (talk.status === 'accepted') {
    return talk.reminder_sent_count > 0
      ? `${talk.reminder_sent_count} reminder${talk.reminder_sent_count === 1 ? '' : 's'} sent`
      : 'Needs slides';
  }

  if (talk.status === 'published') {
    return 'No slides link';
  }

  return 'Slides not required yet';
}

function slidesLink(talk: Talk): string | null {
  if (talk.slides_type === 'file' && talk.storage_path) return talk.storage_path;
  if (talk.slides_url) return talk.slides_url;
  return null;
}

function selectedSpeakerLinkVisible(submission: SpeakerSubmission): boolean {
  return generatedSpeakerLinkPurpose.value === 'selected_speaker_confirmation'
    && generatedSpeakerLinkSubmissionId.value === submission.id
    && Boolean(generatedSelectedSpeakerUrl.value);
}

function actionClass(isPrimary = false): string {
  return isPrimary
    ? 'motion-press rounded-md border-2 border-dc-ink bg-dc-yellow px-4 py-2 font-mono text-xs font-bold uppercase tracking-wide text-dc-ink shadow-[2px_2px_0_#111111] disabled:opacity-40'
    : 'motion-press rounded-md border-2 border-dc-border bg-dc-paper px-4 py-2 font-mono text-xs font-bold uppercase tracking-wide text-dc-gray hover:border-dc-ink hover:text-dc-ink disabled:opacity-40';
}

function proposalActionClass(isPrimary = false): string {
  return isPrimary
    ? 'motion-press rounded-md border-2 border-dc-ink bg-dc-yellow px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wide text-dc-ink shadow-[2px_2px_0_#111111] disabled:opacity-40'
    : 'motion-press rounded-md border border-dc-border bg-dc-paper px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wide text-dc-gray hover:border-dc-ink hover:text-dc-ink disabled:opacity-40';
}

function toggleSpeakerForm() {
  speakerFormEnabled.value = !speakerFormEnabled.value;
  error.value = null;
}

onMounted(fetchPageData);

onUnmounted(() => {
  if (cfpLinkCopiedResetTimer) clearTimeout(cfpLinkCopiedResetTimer);
});
</script>

<template>
  <div class="editorial-page">
    <div class="editorial-wrap">
      <div class="editorial-header">
        <p class="editorial-eyebrow">program desk</p>
        <h1 class="editorial-title">Talk Management</h1>
        <p class="editorial-subtitle">Review CFP interest, record organizer decisions, and turn selected speakers into confirmed talks.</p>
      </div>

      <nav
        class="talk-workflow-tabs mb-8"
        aria-label="Talk workflow"
      >
        <span class="talk-workflow-tab-indicator" :style="activeTalkSectionIndicatorStyle" aria-hidden="true" />
        <RouterLink
          v-for="section in talkSections"
          :key="section.id"
          :to="talkSectionPath(section.id)"
          class="talk-workflow-tab"
          :aria-current="activeTalkSection === section.id ? 'page' : undefined"
        >
          <span>{{ section.label }}</span>
          <span v-if="talkSectionCount(section.id) !== null" class="talk-workflow-tab-count">{{ talkSectionCount(section.id) }}</span>
        </RouterLink>
      </nav>

      <div v-if="error" class="mb-4 rounded-md border-2 border-red-500 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{{ error }}</div>

      <AdminTalksPageSkeleton v-if="loading" />
      <template v-else>
        <section v-if="activeTalkSection === 'cfp'" class="cfp-control-panel mb-8">
          <div class="cfp-control-visual" aria-hidden="true">
            <div class="cfp-control-visual-content">
              <p class="ops-label text-dc-pink">call for speakers</p>
              <h2>CFP</h2>
              <div class="cfp-status-pill">
                <span class="cfp-status-dot" :class="{ 'cfp-status-dot--open': cfpIsOpen, 'cfp-status-dot--closed': cfpIsClosed, 'cfp-status-dot--idle': !cfpIsOpen && !cfpIsClosed }" />
                <span>{{ cfpStatusLabel }}</span>
              </div>
            </div>
          </div>

          <div class="cfp-control-main">
            <div class="cfp-control-copy">
              <p class="ops-label">speaker call</p>
              <h3>{{ cfpIsOpen ? 'Share the form' : cfpIsClosed ? 'CFP is closed' : 'Start accepting proposals' }}</h3>
              <p>{{ cfpStatusHelp }}</p>
            </div>

            <div v-if="cfpIsOpen" class="cfp-share-row">
              <label class="cfp-share-field">
                <span class="ops-label">public form</span>
                <input :value="cfpFormUrl" readonly class="editorial-input font-mono text-sm" />
              </label>
              <div class="cfp-share-actions">
                <button
                  type="button"
                  class="cfp-primary-action motion-press"
                  :class="{ 'cfp-primary-action--copied': cfpLinkCopied }"
                  :aria-label="cfpLinkCopied ? 'CFP link copied' : 'Copy CFP link'"
                  @click="copyCfpFormLink"
                >
                  <svg v-if="cfpLinkCopied" class="cfp-copy-check" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M3.5 8.1 6.6 11 12.5 4.8" />
                  </svg>
                  <span>{{ cfpLinkCopied ? 'Copied' : 'Copy link' }}</span>
                </button>
                <a :href="cfpFormPath" target="_blank" rel="noopener noreferrer" class="cfp-secondary-action motion-press">Open form</a>
                <button
                  v-if="cfpIsOpen"
                  type="button"
                  :disabled="updatingCfp"
                  class="cfp-danger-action motion-press"
                  @click="requestCloseCfp"
                >
                  Close CFP
                </button>
              </div>
            </div>

            <div v-else class="cfp-idle-card">
              <p>{{ cfpIsClosed ? 'Reopen when organizers want to accept more proposals.' : 'This will make the public CFP form available for this event.' }}</p>
              <button
                type="button"
                :disabled="updatingCfp"
                class="cfp-primary-action motion-press"
                @click="updateCfpStatus('cfp_open')"
              >
                {{ cfpIsClosed ? 'Reopen CFP' : 'Open CFP' }}
              </button>
            </div>
          </div>
        </section>

        <section v-if="activeTalkSection === 'backfill'" class="ops-panel mb-8 p-5">
          <div class="mb-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.7fr)]">
            <div>
              <p class="ops-label">manual entry</p>
              <h2 class="mt-1 text-2xl font-black tracking-tight text-dc-ink">Add Talk</h2>
              <p class="mt-2 max-w-xl text-sm leading-6 text-dc-gray">Backfill confirmed or past talks yourself, with slides now or later. CFP proposals live in the inbox below until organizers make a final decision.</p>
              <div v-if="!manualEntryEnabled" class="mt-5 rounded-md border border-dc-border bg-dc-paper-warm px-4 py-3">
                <p class="font-mono text-xs font-bold uppercase tracking-wide text-dc-gray">Manual entry disabled</p>
                <p class="mt-1 text-sm leading-6 text-dc-gray">Turn off the speaker form to enter talk details yourself.</p>
              </div>
            </div>
            <div class="border-t border-dc-border pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0" :class="{ 'opacity-55': !speakerFormEnabled }">
              <div class="flex items-start justify-between gap-4">
                <div>
                  <p class="ops-label">archive backfill</p>
                  <h3 class="mt-1 text-lg font-black tracking-tight text-dc-ink">Send a one-time link</h3>
                </div>
                <label class="motion-press flex shrink-0 cursor-pointer items-center gap-2 rounded-md border border-dc-border bg-dc-paper px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-wide text-dc-gray">
                  <input :checked="speakerFormEnabled" type="checkbox" class="size-4 accent-dc-pink" @change="toggleSpeakerForm" />
                  <span>{{ speakerFormEnabled ? 'On' : 'Off' }}</span>
                </label>
              </div>
              <p class="mt-2 text-sm leading-6 text-dc-gray">Generate a month-specific archive/backfill link for one speaker. Selected CFP speakers get their own confirmation links from the inbox.</p>

              <div class="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                <AppDropdown
                  :model-value="speakerLinkExpiresInDays"
                  label="Valid for"
                  :options="speakerLinkExpiryOptions"
                  :disabled="!speakerFormEnabled"
                  density="compact"
                  menu-class="min-w-40"
                  @update:model-value="speakerLinkExpiresInDays = Number($event)"
                />
                <button type="button" :disabled="!speakerFormEnabled || creatingSpeakerLink" class="editorial-secondary-action self-end px-4 py-3 text-xs" @click="generateSpeakerIntakeLink">
                  {{ creatingSpeakerLink ? 'Generating...' : 'Generate link' }}
                </button>
              </div>

              <div v-if="generatedArchiveBackfillUrl" class="mt-4 rounded-md border border-dc-border bg-dc-paper-warm p-3">
                <p class="font-mono text-[11px] font-bold uppercase tracking-wide text-dc-gray">
                  {{ generatedSpeakerLinkMonth ? `Archive backfill / ${generatedSpeakerLinkMonth}` : 'Archive backfill link' }}
                  <span v-if="generatedSpeakerLinkExpiresAt"> / Expires {{ formatDateTime(generatedSpeakerLinkExpiresAt) }}</span>
                </p>
                <input :value="generatedArchiveBackfillUrl" readonly :disabled="!speakerFormEnabled" class="editorial-input mt-3 font-mono text-sm disabled:cursor-not-allowed disabled:opacity-55" />
                <div class="mt-3 flex flex-wrap gap-2">
                  <button type="button" :disabled="!speakerFormEnabled" :class="actionClass()" @click="copySpeakerIntakeLink">
                    Copy link
                  </button>
                  <a v-if="speakerFormEnabled" :href="generatedSpeakerIntakePath" target="_blank" rel="noopener noreferrer" :class="actionClass()">Open form</a>
                </div>
              </div>
            </div>
          </div>

          <Transition name="manual-rollup">
            <form v-show="manualEntryEnabled" class="manual-entry-form" @submit.prevent="addManualTalk">
              <div class="manual-rollup-inner">
                <fieldset :disabled="!manualEntryEnabled || addingTalk" class="space-y-4">
                  <div class="grid gap-4 md:grid-cols-2">
                    <label class="block">
                      <span class="mb-2 block font-mono text-xs font-bold uppercase tracking-wide text-dc-gray">Speaker name</span>
                      <input v-model="manualTalkForm.speaker_name" required placeholder="Speaker Name" class="editorial-input font-mono disabled:cursor-not-allowed disabled:opacity-55" />
                    </label>
                    <label class="block">
                      <span class="mb-2 block font-mono text-xs font-bold uppercase tracking-wide text-dc-gray">Speaker email</span>
                      <input v-model="manualTalkForm.speaker_email" required type="email" placeholder="speaker@example.com" class="editorial-input font-mono disabled:cursor-not-allowed disabled:opacity-55" />
                    </label>
                  </div>

                  <div class="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(12rem,1fr)]">
                    <label class="block">
                      <span class="mb-2 block font-mono text-xs font-bold uppercase tracking-wide text-dc-gray">Talk title</span>
                      <input v-model="manualTalkForm.title" required placeholder="Talk title" class="editorial-input font-mono disabled:cursor-not-allowed disabled:opacity-55" />
                    </label>
                    <label class="block">
                      <span class="mb-2 block font-mono text-xs font-bold uppercase tracking-wide text-dc-gray">Topic</span>
                      <input v-model="manualTalkForm.topic" placeholder="General" class="editorial-input font-mono disabled:cursor-not-allowed disabled:opacity-55" />
                    </label>
                  </div>

                  <label class="block">
                    <span class="mb-2 block font-mono text-xs font-bold uppercase tracking-wide text-dc-gray">GitHub username</span>
                    <input v-model="manualTalkForm.github_username" placeholder="octocat" class="editorial-input font-mono disabled:cursor-not-allowed disabled:opacity-55" />
                  </label>

                  <div class="grid gap-4 md:grid-cols-2">
                    <label class="block">
                      <span class="mb-2 block font-mono text-xs font-bold uppercase tracking-wide text-dc-gray">Abstract</span>
                      <textarea v-model="manualTalkForm.abstract" rows="3" class="editorial-input min-h-28 resize-y font-mono disabled:cursor-not-allowed disabled:opacity-55" />
                    </label>
                    <label class="block">
                      <span class="mb-2 block font-mono text-xs font-bold uppercase tracking-wide text-dc-gray">Speaker bio</span>
                      <textarea v-model="manualTalkForm.bio" rows="3" class="editorial-input min-h-28 resize-y font-mono disabled:cursor-not-allowed disabled:opacity-55" />
                    </label>
                  </div>

                  <label class="block">
                    <span class="mb-2 block font-mono text-xs font-bold uppercase tracking-wide text-dc-gray">Slides URL</span>
                    <input v-model="manualTalkForm.slides_url" type="url" placeholder="https://..." class="editorial-input font-mono disabled:cursor-not-allowed disabled:opacity-55" />
                  </label>

                  <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <label class="flex items-start gap-3 text-sm font-semibold leading-6 text-dc-gray">
                      <input v-model="manualTalkForm.publish" type="checkbox" class="mt-1 size-4 shrink-0 accent-dc-pink disabled:cursor-not-allowed disabled:opacity-55" />
                      <span>Publish this talk to the archive immediately</span>
                    </label>
                    <button type="submit" :disabled="!manualEntryEnabled || addingTalk" class="editorial-action shrink-0">
                      {{ addingTalk ? 'ADDING...' : 'ADD TALK' }}
                    </button>
                  </div>
                </fieldset>
              </div>
            </form>
          </Transition>
        </section>

        <section v-if="activeTalkSection === 'proposals'" class="mb-8">
          <div class="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p class="ops-label">cfp inbox</p>
              <h2 class="mt-1 text-2xl font-black tracking-tight text-dc-ink">Speaker Proposals</h2>
            </div>
            <div class="flex flex-wrap items-center gap-3">
              <p class="font-mono text-xs font-bold uppercase tracking-wide text-dc-gray">
                {{ pendingSubmissionCount }} pending
              </p>
              <button
                type="button"
                class="motion-press inline-flex min-h-10 items-center gap-2 rounded-md border-2 border-dc-ink bg-dc-paper px-3 font-mono text-xs font-bold uppercase tracking-wide text-dc-ink shadow-[2px_2px_0_#111111] disabled:cursor-not-allowed disabled:opacity-50"
                :disabled="refreshingSubmissions"
                @click="refreshSpeakerSubmissions"
              >
                <svg class="size-4" :class="{ 'animate-spin': refreshingSubmissions }" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M20 12a8 8 0 1 1-2.34-5.66" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
                  <path d="M20 4v5h-5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                <span>{{ refreshingSubmissions ? 'Refreshing' : 'Refresh' }}</span>
              </button>
            </div>
          </div>

          <div v-if="speakerSubmissions.length > 0" class="space-y-6">
            <section v-for="group in groupedSubmissions.filter((item) => item.submissions.length > 0)" :key="group.label">
              <h3 class="mb-3 flex items-center gap-3 text-lg font-black tracking-tight text-dc-ink">
                {{ group.label }}
                <span class="font-mono text-xs font-semibold text-dc-gray">({{ group.submissions.length }})</span>
              </h3>
              <div class="ops-panel overflow-hidden">
                <article
                  v-for="submission in group.submissions"
                  :key="submission.id"
                  class="ops-row proposal-row"
                  role="button"
                  tabindex="0"
                  :aria-expanded="submissionDetailsOpen(submission.id)"
                  @click="toggleSubmissionDetails(submission.id)"
                  @keydown.enter.prevent="toggleSubmissionDetails(submission.id)"
                  @keydown.space.prevent="toggleSubmissionDetails(submission.id)"
                >
                  <div class="grid gap-2 px-3 py-2 sm:px-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                    <div
                      class="proposal-row-trigger"
                    >
                      <span class="truncate text-sm font-black tracking-tight text-dc-ink sm:text-base">{{ submission.title }}</span>
                      <span class="truncate text-sm font-bold text-dc-gray">{{ submission.speaker_name }}</span>
                      <span class="truncate font-mono text-xs uppercase tracking-wide text-dc-gray">{{ submission.topic || 'General' }}</span>
                    </div>
                    <div class="flex shrink-0 flex-wrap gap-2 lg:justify-end" @click.stop @keydown.stop>
                      <button
                        v-if="submission.status !== 'selected'"
                        :disabled="decidingSubmissionId === submission.id"
                        :class="proposalActionClass(true)"
                        @click="decideSpeakerSubmission(submission.id, 'selected')"
                      >
                        Select
                      </button>
                      <button
                        v-if="submission.status !== 'not_selected'"
                        :disabled="decidingSubmissionId === submission.id"
                        :class="proposalActionClass()"
                        @click="decideSpeakerSubmission(submission.id, 'not_selected')"
                      >
                        Not selected
                      </button>
                      <button
                        v-if="submission.status === 'selected' && !submission.selected_talk_id"
                        :disabled="decidingSubmissionId === submission.id"
                        :class="proposalActionClass(true)"
                        @click="decideSpeakerSubmission(submission.id, 'selected')"
                      >
                        {{ selectedSpeakerLinkVisible(submission) ? 'Regenerate link' : 'Generate link' }}
                      </button>
                      <span
                        v-if="submission.status === 'selected' && submission.selected_talk_id"
                        class="rounded-md border border-dc-border bg-dc-paper-warm px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wide text-dc-gray"
                      >
                        Slides received
                      </span>
                    </div>
                  </div>
                  <div
                    v-if="selectedSpeakerLinkVisible(submission)"
                    class="selected-speaker-inline-link"
                    @click.stop
                    @keydown.stop
                  >
                    <div class="min-w-0">
                      <p class="font-mono text-[11px] font-bold uppercase tracking-wide text-dc-pink">Slides link</p>
                      <p class="mt-1 font-mono text-[11px] font-bold uppercase tracking-wide text-dc-gray">
                        {{ generatedSpeakerLinkSpeakerName || submission.speaker_name }}
                        <span v-if="generatedSpeakerLinkExpiresAt"> / Expires {{ formatDateTime(generatedSpeakerLinkExpiresAt) }}</span>
                      </p>
                    </div>
                    <div class="selected-speaker-inline-link-actions">
                      <input :value="generatedSelectedSpeakerUrl" readonly class="editorial-input font-mono text-sm" />
                      <button type="button" :class="actionClass()" @click="copySpeakerIntakeLink">
                        Copy
                      </button>
                      <a :href="generatedSpeakerIntakePath" target="_blank" rel="noopener noreferrer" :class="actionClass()">Open</a>
                    </div>
                  </div>
                  <Transition name="proposal-accordion">
                    <div v-show="submissionDetailsOpen(submission.id)" class="proposal-accordion">
                      <div class="proposal-accordion-inner border-t border-dc-border">
                        <div class="proposal-detail-grid">
                          <section class="proposal-detail-block proposal-detail-block--abstract">
                            <p class="proposal-detail-label">Abstract</p>
                            <p class="proposal-detail-text">{{ submission.abstract || 'No abstract provided.' }}</p>
                          </section>
                          <div class="proposal-detail-lower">
                            <section class="proposal-detail-block">
                              <p class="proposal-detail-label">Speaker bio</p>
                              <p class="proposal-detail-text">{{ submission.bio || 'No speaker bio provided.' }}</p>
                            </section>
                            <dl class="proposal-detail-meta" aria-label="Proposal metadata">
                              <div class="proposal-detail-meta-item">
                                <dt>Submitted</dt>
                                <dd><time :datetime="submission.created_at">{{ formatDateTime(submission.created_at) }}</time></dd>
                              </div>
                              <div class="proposal-detail-meta-item">
                                <dt>Email</dt>
                                <dd>{{ submission.speaker_email }}</dd>
                              </div>
                              <div v-if="submission.github_username" class="proposal-detail-meta-item">
                                <dt>GitHub</dt>
                                <dd>@{{ submission.github_username }}</dd>
                              </div>
                            </dl>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Transition>
                </article>
              </div>
            </section>
          </div>
          <div v-else class="editorial-panel p-12 text-center">
            <p class="editorial-eyebrow">proposal inbox</p>
            <h2 class="mt-3 text-2xl font-black tracking-tight text-dc-ink">No proposals yet</h2>
            <p class="mx-auto mt-3 max-w-2xl text-sm leading-6 text-dc-gray">
              Open and share the CFP link from the CFP step. New submissions will appear here for selection.
            </p>
          </div>
        </section>

        <section v-if="activeTalkSection === 'program'" class="mb-8">
          <template v-if="talks.length > 0">
            <section v-for="group in groupedTalks.filter((item) => item.talks.length > 0)" :key="group.label" class="mb-8">
              <h2 class="mb-3 flex items-center gap-3 text-lg font-black tracking-tight text-dc-ink">
                {{ group.label }}
                <span class="font-mono text-xs font-semibold text-dc-gray">({{ group.talks.length }})</span>
              </h2>
              <div class="ops-panel overflow-hidden">
                <article v-for="talk in group.talks" :key="talk.id" class="ops-row p-4">
                  <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div class="min-w-0">
                      <div class="mb-2 flex flex-wrap items-center gap-2">
                        <h3 class="text-xl font-black tracking-tight text-dc-ink">{{ talk.title }}</h3>
                        <span class="rounded-md border border-dc-border bg-dc-paper-warm px-2.5 py-1 font-mono text-[11px] font-bold uppercase tracking-wide text-dc-gray">{{ talk.status.replace('_', ' ') }}</span>
                      </div>
                      <p class="text-sm text-dc-gray">{{ talk.speaker_name }} · {{ talk.speaker_email }}</p>
                      <p v-if="talk.abstract" class="mt-3 max-w-4xl text-sm leading-6 text-dc-gray">{{ talk.abstract }}</p>
                      <p class="mt-3 font-mono text-xs uppercase tracking-wide text-dc-gray">
                        {{ talk.topic || 'General' }} <span class="mx-2 text-dc-pink">/</span> {{ slideLabel(talk) }}
                      </p>
                    </div>
                    <div class="flex shrink-0 flex-wrap gap-2 lg:justify-end">
                      <a v-if="slidesLink(talk)" :href="slidesLink(talk) ?? undefined" target="_blank" rel="noopener noreferrer" :class="actionClass()">
                        Slides
                      </a>
                      <button :class="actionClass()" @click="setStatus(talk.id, 'accepted')">Accept</button>
                      <button :class="actionClass()" @click="setStatus(talk.id, 'rejected')">Reject</button>
                      <button :class="actionClass(true)" @click="setStatus(talk.id, 'published')">Publish</button>
                      <button
                        v-if="talk.status === 'accepted' && !talk.slides_uploaded_at"
                        :class="actionClass()"
                        @click="sendReminder(talk.id)"
                      >
                        Remind
                      </button>
                    </div>
                  </div>
                </article>
              </div>
            </section>
          </template>
          <div v-else class="editorial-panel p-12 text-center">
            <p class="editorial-eyebrow">program empty</p>
            <h2 class="mt-3 text-2xl font-black tracking-tight text-dc-ink">No confirmed talks yet</h2>
            <p class="mx-auto mt-3 max-w-2xl text-sm leading-6 text-dc-gray">
              Selected speakers become confirmed talks after they send their slides link. Temporary backfilled talks will also appear here.
            </p>
          </div>
        </section>
      </template>
    </div>
    <ConfirmDialog
      :open="closeCfpDialogOpen"
      title="Close CFP?"
      message="This pauses the public speaker form for this event. Existing proposals stay in the inbox, and organizers can reopen the CFP later if needed."
      confirm-label="Close CFP"
      busy-label="Closing..."
      cancel-label="Keep open"
      danger
      :busy="updatingCfp"
      @cancel="cancelCloseCfp"
      @confirm="confirmCloseCfp"
    />
  </div>
</template>
