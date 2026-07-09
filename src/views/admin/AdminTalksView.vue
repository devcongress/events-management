<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { adminPath } from '@/src/admin-routes';
import AppDropdown from '@/src/components/AppDropdown.vue';
import ConfirmDialog from '@/src/components/ui/ConfirmDialog.vue';
import AdminTalksPageSkeleton from '@/src/components/ui/page-skeletons/AdminTalksPageSkeleton.vue';
import { notify } from '@/src/lib/notify';
import { summarizeText, wordCount } from '@/src/lib/text-summary';
import type { Event, EventStatus, SpeakerSubmission, SpeakerSubmissionStatus, Talk, TalkStatus } from '@/types';

const route = useRoute();
type TalkSection = 'cfp' | 'proposals' | 'program' | 'backfill';
type AdminSpeakerIntakeLink = {
  id: string;
  event_id: string;
  event_month: string;
  purpose: 'archive_backfill' | 'selected_speaker_confirmation';
  speaker_submission_id: string | null;
  speaker_name: string | null;
  speaker_email: string | null;
  talk_title: string | null;
  token: string | null;
  expires_at: string;
  used_at: string | null;
  used_talk_id: string | null;
  created_at: string;
  updated_at: string;
  status: 'active' | 'used' | 'expired';
};
const event = ref<Event | null>(null);
const talks = ref<Talk[]>([]);
const speakerSubmissions = ref<SpeakerSubmission[]>([]);
const speakerIntakeLinks = ref<AdminSpeakerIntakeLink[]>([]);
const loading = ref(true);
const creatingSpeakerLink = ref(false);
const deletingSpeakerLinkId = ref<string | null>(null);
const decidingSubmissionId = ref<string | null>(null);
const updatingCfp = ref(false);
const refreshingSubmissions = ref(false);
const closeCfpDialogOpen = ref(false);
const cfpLinkCopied = ref(false);
const copiedSpeakerLinkId = ref<string | null>(null);
const expandedSubmissionId = ref<string | null>(null);
const expandedProgramTalkIds = ref(new Set<string>());
let cfpLinkCopiedResetTimer: ReturnType<typeof setTimeout> | null = null;
let speakerIntakeLinkCopiedResetTimer: ReturnType<typeof setTimeout> | null = null;
const speakerLinkExpiresInDays = ref(7);
const error = ref<string | null>(null);
const PROGRAM_ABSTRACT_PREVIEW_WORDS = 55;
const groups: { label: string; statuses: TalkStatus[] }[] = [
  { label: 'Pending review', statuses: ['submitted'] },
  { label: 'Accepted', statuses: ['accepted', 'slides_received'] },
  { label: 'Published', statuses: ['published'] },
  { label: 'Rejected', statuses: ['rejected'] },
];

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
const archiveBackfillLinks = computed(() => speakerIntakeLinks.value.filter((link) => link.purpose === 'archive_backfill'));
const selectedSpeakerPendingSubmissions = computed(() => speakerSubmissions.value.filter((submission) => (
  submission.status === 'selected' && !submission.selected_talk_id
)));
const selectedSpeakerLinks = computed(() => speakerIntakeLinks.value.filter((link) => link.purpose === 'selected_speaker_confirmation'));
const missingSelectedSpeakerLinkCount = computed(() => selectedSpeakerPendingSubmissions.value.filter((submission) => {
  const link = selectedSpeakerLinkForSubmission(submission.id);
  return !link || link.status !== 'active' || !link.token;
}).length);
const activeArchiveBackfillLinkCount = computed(() => archiveBackfillLinks.value.filter((link) => link.status === 'active').length);
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
const eventIsMonthly = computed(() => (event.value?.series_type ?? (event.value?.name?.toLowerCase().includes('quarterly') ? 'quarterly' : 'monthly')) === 'monthly');
const eventIsUpcoming = computed(() => {
  if (!event.value?.event_date) return false;
  const eventDateMs = new Date(event.value.event_date).getTime();
  return Number.isFinite(eventDateMs) && eventDateMs > Date.now();
});
const canOpenCfp = computed(() => eventIsMonthly.value && eventIsUpcoming.value);
const cfpCanReceiveSubmissions = computed(() => cfpIsOpen.value && canOpenCfp.value);
const cfpStatusLabel = computed(() => (
  cfpIsOpen.value && !canOpenCfp.value ? 'Unavailable' : cfpIsOpen.value ? 'Open' : cfpIsClosed.value ? 'Closed' : 'Not open'
));
const cfpStatusHelp = computed(() => {
  if (!eventIsMonthly.value) return 'CFP is only available for monthly meetups.';
  if (!eventIsUpcoming.value) return 'CFP can only be opened before the monthly meetup date.';
  if (cfpIsOpen.value) return 'Share the public link. New proposals will land in the inbox below.';
  if (cfpIsClosed.value) return 'Submission is paused. Reopen only if organizers are still accepting proposals.';
  return 'Open CFP when this event is ready to receive speaker proposals.';
});
const speakerLinkExpiryDurations = [3, 7, 14, 31];
const activeBackfillDurations = computed(() => new Set(
  archiveBackfillLinks.value
    .filter((link) => link.status === 'active')
    .map((link) => linkDurationDays(link))
    .filter((days): days is number => days !== null),
));
const speakerLinkExpiryOptions = computed(() => speakerLinkExpiryDurations.map((days) => ({
  value: days,
  label: `${days} days`,
  disabled: activeBackfillDurations.value.has(days),
})));
const selectedSpeakerLinkDurationActive = computed(() => activeBackfillDurations.value.has(speakerLinkExpiresInDays.value));

function talkSectionPath(section: TalkSection): string {
  return adminPath(`events/${String(route.params.eventId)}/talks/${section}`);
}

function talkSectionCount(section: TalkSection): number | null {
  if (section === 'proposals') return pendingSubmissionCount.value;
  if (section === 'program') return confirmedTalkCount.value;
  if (section === 'backfill') return activeArchiveBackfillLinkCount.value;
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

async function fetchSpeakerIntakeLinks() {
  const response = await fetch(`/api/events/${route.params.eventId}/speaker-intake-links`, { cache: 'no-store' });
  if (response.ok) {
    const data = await response.json();
    speakerIntakeLinks.value = data.links ?? [];
  }
}

async function fetchPageData() {
  await Promise.all([fetchEvent(), fetchTalks(), fetchSpeakerSubmissions(), fetchSpeakerIntakeLinks()]);
  loading.value = false;
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

function linkDurationDays(link: Pick<AdminSpeakerIntakeLink, 'created_at' | 'expires_at'>): number | null {
  const createdAt = new Date(link.created_at).getTime();
  const expiresAt = new Date(link.expires_at).getTime();
  if (!Number.isFinite(createdAt) || !Number.isFinite(expiresAt)) return null;

  const durationDays = Math.round((expiresAt - createdAt) / (24 * 60 * 60 * 1000));
  return durationDays > 0 ? durationDays : null;
}

function linkShelfStatusLabel(link: AdminSpeakerIntakeLink): string {
  if (link.status === 'used') return 'Used';
  if (link.status === 'expired') return 'Expired';

  const durationDays = linkDurationDays(link);
  return durationDays ? `Expires in ${durationDays} days` : 'Active';
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
  if (selectedSpeakerLinkDurationActive.value) return;

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
      resetSpeakerIntakeLinkCopied();
      await fetchSpeakerIntakeLinks();
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
      await Promise.all([fetchSpeakerSubmissions(), fetchSpeakerIntakeLinks()]);
      if (status === 'selected' && data.token) {
        resetSpeakerIntakeLinkCopied();
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

async function generateSelectedSpeakerLinks() {
  const submissionsNeedingLinks = selectedSpeakerPendingSubmissions.value.filter((submission) => {
    const link = selectedSpeakerLinkForSubmission(submission.id);
    return !link || link.status !== 'active' || !link.token;
  });

  if (submissionsNeedingLinks.length === 0) return;

  creatingSpeakerLink.value = true;
  error.value = null;

  try {
    for (const submission of submissionsNeedingLinks) {
      const response = await fetch(`/api/speaker-submissions/${submission.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'selected',
          expires_in_days: speakerLinkExpiresInDays.value,
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || `Could not generate a slides link for ${submission.speaker_name}.`);
      }
    }

    await Promise.all([fetchSpeakerSubmissions(), fetchSpeakerIntakeLinks()]);
    resetSpeakerIntakeLinkCopied();
    notify.success(submissionsNeedingLinks.length === 1 ? 'Slides link generated.' : 'Selected speaker links generated.');
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'Could not generate selected speaker links.';
  } finally {
    creatingSpeakerLink.value = false;
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
  if (status === 'cfp_open' && !canOpenCfp.value) return;

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

function speakerIntakePathForToken(token: string | null): string {
  return token ? `/speaker-talks/${route.params.eventId}/${token}` : '';
}

function speakerIntakeUrlForToken(token: string | null): string {
  const path = speakerIntakePathForToken(token);
  if (!path) return '';
  if (typeof window === 'undefined') return path;
  return new URL(path, window.location.origin).toString();
}

async function copySpeakerIntakeLink(url: string, linkId: string) {
  if (!url) return;

  error.value = null;

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = url;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }

    copiedSpeakerLinkId.value = linkId;
    if (speakerIntakeLinkCopiedResetTimer) clearTimeout(speakerIntakeLinkCopiedResetTimer);
    speakerIntakeLinkCopiedResetTimer = setTimeout(() => {
      copiedSpeakerLinkId.value = null;
      speakerIntakeLinkCopiedResetTimer = null;
    }, 2200);
  } catch {
    error.value = 'Could not copy the speaker form link.';
  }
}

function resetSpeakerIntakeLinkCopied() {
  copiedSpeakerLinkId.value = null;
  if (speakerIntakeLinkCopiedResetTimer) {
    clearTimeout(speakerIntakeLinkCopiedResetTimer);
    speakerIntakeLinkCopiedResetTimer = null;
  }
}

async function deleteSpeakerIntakeLink(linkId: string) {
  deletingSpeakerLinkId.value = linkId;
  error.value = null;

  try {
    const response = await fetch(`/api/events/${route.params.eventId}/speaker-intake-links/${linkId}`, {
      method: 'DELETE',
    });
    const data = await response.json().catch(() => ({}));

    if (response.ok) {
      await fetchSpeakerIntakeLinks();
      notify.success('Speaker form link removed.');
    } else {
      error.value = data.error || 'Could not remove speaker form link.';
    }
  } catch {
    error.value = 'Could not remove speaker form link.';
  } finally {
    deletingSpeakerLinkId.value = null;
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

function selectedSpeakerLinkForSubmission(submissionId: string): AdminSpeakerIntakeLink | null {
  const links = selectedSpeakerLinks.value
    .filter((link) => link.speaker_submission_id === submissionId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return links.find((link) => link.status === 'active') ?? links[0] ?? null;
}

function selectedSpeakerLinkLabel(submission: SpeakerSubmission): string {
  const link = selectedSpeakerLinkForSubmission(submission.id);
  if (!link) return 'Needs link';
  if (!link.token) return 'Needs regeneration';
  if (link.status === 'used') return 'Used';
  if (link.status === 'expired') return 'Expired';

  const durationDays = linkDurationDays(link);
  return durationDays ? `Expires in ${durationDays} days` : 'Link ready';
}

function programAbstractIsLong(abstract: string | null | undefined): boolean {
  return wordCount(abstract ?? '') > PROGRAM_ABSTRACT_PREVIEW_WORDS;
}

function programAbstractPreview(abstract: string | null | undefined): string {
  return summarizeText(abstract, PROGRAM_ABSTRACT_PREVIEW_WORDS);
}

function programTalkExpanded(talkId: string): boolean {
  return expandedProgramTalkIds.value.has(talkId);
}

function toggleProgramTalkSummary(talkId: string) {
  const next = new Set(expandedProgramTalkIds.value);
  if (next.has(talkId)) {
    next.delete(talkId);
  } else {
    next.add(talkId);
  }
  expandedProgramTalkIds.value = next;
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

onMounted(fetchPageData);

onUnmounted(() => {
  if (cfpLinkCopiedResetTimer) clearTimeout(cfpLinkCopiedResetTimer);
  if (speakerIntakeLinkCopiedResetTimer) clearTimeout(speakerIntakeLinkCopiedResetTimer);
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
                <input :value="cfpCanReceiveSubmissions ? cfpFormUrl : 'CFP unavailable for this event date'" readonly class="editorial-input font-mono text-sm" />
              </label>
              <div class="cfp-share-actions">
                <button
                  type="button"
                  class="cfp-primary-action motion-press"
                  :class="{ 'cfp-primary-action--copied': cfpLinkCopied }"
                  :disabled="!cfpCanReceiveSubmissions"
                  :aria-label="cfpLinkCopied ? 'CFP link copied' : 'Copy CFP link'"
                  @click="copyCfpFormLink"
                >
                  <svg v-if="cfpLinkCopied" class="cfp-copy-check" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M3.5 8.1 6.6 11 12.5 4.8" />
                  </svg>
                  <span>{{ cfpLinkCopied ? 'Copied' : 'Copy link' }}</span>
                </button>
                <a v-if="cfpCanReceiveSubmissions" :href="cfpFormPath" target="_blank" rel="noopener noreferrer" class="cfp-secondary-action motion-press">Open form</a>
                <button v-else type="button" disabled class="cfp-secondary-action motion-press">Form unavailable</button>
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
                :disabled="updatingCfp || !canOpenCfp"
                class="cfp-primary-action motion-press"
                @click="updateCfpStatus('cfp_open')"
              >
                {{ !canOpenCfp ? 'CFP unavailable' : cfpIsClosed ? 'Reopen CFP' : 'Open CFP' }}
              </button>
            </div>
          </div>
        </section>

        <section v-if="activeTalkSection === 'backfill'" class="ops-panel mb-8 p-5">
          <div class="mb-6 grid gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(20rem,1fr)]">
            <div>
              <p class="ops-label">legacy backfill</p>
              <h2 class="mt-1 text-2xl font-black tracking-tight text-dc-ink">Speaker Form Links</h2>
              <p class="mt-2 max-w-xl text-sm leading-6 text-dc-gray">Generate one-time links for confirmed or past speakers who need to send archive details. Links stay visible here while they are active, and remain removable after use or expiry.</p>
            </div>
            <div class="border-t border-dc-border pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
              <p class="ops-label">archive backfill</p>
              <h3 class="mt-1 text-lg font-black tracking-tight text-dc-ink">Send a one-time link</h3>
              <p class="mt-2 text-sm leading-6 text-dc-gray">Generate a month-specific archive/backfill link for one speaker. Selected CFP speakers get their own confirmation links from the inbox.</p>

              <div class="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                <AppDropdown
                  :model-value="speakerLinkExpiresInDays"
                  label="Valid for"
                  :options="speakerLinkExpiryOptions"
                  density="compact"
                  menu-class="min-w-40"
                  @update:model-value="speakerLinkExpiresInDays = Number($event)"
                />
                <button type="button" :disabled="creatingSpeakerLink || selectedSpeakerLinkDurationActive" class="editorial-secondary-action self-end px-4 py-3 text-xs" @click="generateSpeakerIntakeLink">
                  {{ creatingSpeakerLink ? 'Generating...' : selectedSpeakerLinkDurationActive ? 'Already active' : 'Generate link' }}
                </button>
              </div>
              <p v-if="selectedSpeakerLinkDurationActive" class="mt-2 font-mono text-[11px] font-bold uppercase tracking-wide text-dc-gray">
                Remove the active {{ speakerLinkExpiresInDays }} day link before generating another one.
              </p>

            </div>
          </div>

          <section class="border-t border-dc-border pt-5">
            <div class="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p class="ops-label">generated links</p>
                <h3 class="mt-1 text-lg font-black tracking-tight text-dc-ink">Backfill Link Shelf</h3>
              </div>
              <p class="font-mono text-xs font-bold uppercase tracking-wide text-dc-gray">{{ activeArchiveBackfillLinkCount }} active</p>
            </div>

            <div v-if="archiveBackfillLinks.length > 0" class="space-y-3">
              <article
                v-for="link in archiveBackfillLinks"
                :key="link.id"
                class="rounded-md border border-dc-border bg-dc-paper-warm p-3"
              >
                <div class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                  <div class="min-w-0">
                    <div class="mb-2 flex flex-wrap items-center gap-2">
                      <p class="font-mono text-[11px] font-bold uppercase tracking-wide text-dc-pink">Archive backfill / {{ link.event_month }}</p>
                      <span class="rounded-md border border-dc-border bg-dc-paper px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide text-dc-gray">{{ link.status }}</span>
                    </div>
                    <p class="font-mono text-[11px] font-bold uppercase tracking-wide text-dc-gray">
                      {{ linkShelfStatusLabel(link) }}
                    </p>
                  </div>
                  <div class="flex flex-wrap gap-2 lg:justify-end">
                    <button
                      type="button"
                      :disabled="!speakerIntakeUrlForToken(link.token)"
                      class="inline-flex items-center gap-1.5"
                      :class="actionClass()"
                      :aria-label="copiedSpeakerLinkId === link.id ? 'Backfill link copied' : 'Copy backfill link'"
                      @click="copySpeakerIntakeLink(speakerIntakeUrlForToken(link.token), link.id)"
                    >
                      <svg v-if="copiedSpeakerLinkId === link.id" class="size-3.5" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <path d="M3.5 8.1 6.6 11 12.5 4.8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
                      </svg>
                      <svg v-else class="size-3.5" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <path d="M5.5 5.5V3.8A1.8 1.8 0 0 1 7.3 2h4.9A1.8 1.8 0 0 1 14 3.8v4.9a1.8 1.8 0 0 1-1.8 1.8h-1.7" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" />
                        <path d="M2 7.3A1.8 1.8 0 0 1 3.8 5.5h4.9a1.8 1.8 0 0 1 1.8 1.8v4.9A1.8 1.8 0 0 1 8.7 14H3.8A1.8 1.8 0 0 1 2 12.2V7.3Z" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" />
                      </svg>
                      <span>{{ copiedSpeakerLinkId === link.id ? 'Copied' : 'Copy' }}</span>
                    </button>
                    <a
                      v-if="speakerIntakePathForToken(link.token)"
                      :href="speakerIntakePathForToken(link.token)"
                      target="_blank"
                      rel="noopener noreferrer"
                      :class="actionClass()"
                    >
                      Open
                    </a>
                    <button
                      type="button"
                      :disabled="deletingSpeakerLinkId === link.id"
                      :class="actionClass()"
                      @click="deleteSpeakerIntakeLink(link.id)"
                    >
                      {{ deletingSpeakerLinkId === link.id ? 'Removing...' : 'Remove' }}
                    </button>
                  </div>
                </div>
                <p v-if="!link.token" class="mt-3 rounded-md border border-dc-border bg-dc-paper px-3 py-2 text-sm leading-6 text-dc-gray">
                  This older link was generated before link recovery was enabled. Generate a new one if you need to copy it again.
                </p>
              </article>
            </div>
            <div v-else class="rounded-md border border-dc-border bg-dc-paper-warm p-5 text-center">
              <p class="font-mono text-xs font-bold uppercase tracking-wide text-dc-gray">No backfill links yet</p>
              <p class="mt-2 text-sm leading-6 text-dc-gray">Generated links will stay here until you remove them.</p>
            </div>
          </section>
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
            <section v-if="selectedSpeakerPendingSubmissions.length > 0" class="ops-panel overflow-hidden">
              <div class="flex flex-col gap-3 border-b border-dc-border bg-dc-paper-warm px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p class="ops-label">selected speaker links</p>
                  <h3 class="mt-1 text-lg font-black tracking-tight text-dc-ink">Slides upload links</h3>
                  <p class="mt-1 text-sm leading-6 text-dc-gray">Generate one private link per selected speaker, then copy or open them from here.</p>
                </div>
                <button
                  type="button"
                  :disabled="creatingSpeakerLink || missingSelectedSpeakerLinkCount === 0"
                  :class="proposalActionClass(true)"
                  @click="generateSelectedSpeakerLinks"
                >
                  {{ creatingSpeakerLink ? 'Generating...' : missingSelectedSpeakerLinkCount === 0 ? 'Links ready' : `Generate ${missingSelectedSpeakerLinkCount} link${missingSelectedSpeakerLinkCount === 1 ? '' : 's'}` }}
                </button>
              </div>

              <div class="divide-y divide-dc-border">
                <article
                  v-for="submission in selectedSpeakerPendingSubmissions"
                  :key="`selected-link-${submission.id}`"
                  class="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(0,0.8fr)_minmax(16rem,1fr)_auto] lg:items-center"
                >
                  <div class="min-w-0">
                    <h4 class="truncate text-sm font-black tracking-tight text-dc-ink sm:text-base">{{ submission.title }}</h4>
                    <p class="mt-1 truncate text-sm font-semibold text-dc-gray">{{ submission.speaker_name }}</p>
                  </div>
                  <input
                    v-if="speakerIntakeUrlForToken(selectedSpeakerLinkForSubmission(submission.id)?.token ?? null)"
                    :value="speakerIntakeUrlForToken(selectedSpeakerLinkForSubmission(submission.id)?.token ?? null)"
                    readonly
                    class="editorial-input font-mono text-sm"
                  />
                  <p v-else class="rounded-md border border-dc-border bg-dc-paper px-3 py-2 text-sm leading-6 text-dc-gray">
                    {{ selectedSpeakerLinkLabel(submission) }}
                  </p>
                  <div class="flex flex-wrap gap-2 lg:justify-end">
                    <button
                      type="button"
                      :disabled="!speakerIntakeUrlForToken(selectedSpeakerLinkForSubmission(submission.id)?.token ?? null)"
                      class="inline-flex items-center gap-1.5"
                      :class="actionClass()"
                      :aria-label="copiedSpeakerLinkId === `selected-${submission.id}` ? 'Slides link copied' : 'Copy slides link'"
                      @click="copySpeakerIntakeLink(speakerIntakeUrlForToken(selectedSpeakerLinkForSubmission(submission.id)?.token ?? null), `selected-${submission.id}`)"
                    >
                      <svg v-if="copiedSpeakerLinkId === `selected-${submission.id}`" class="size-3.5" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <path d="M3.5 8.1 6.6 11 12.5 4.8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
                      </svg>
                      <svg v-else class="size-3.5" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <path d="M5.5 5.5V3.8A1.8 1.8 0 0 1 7.3 2h4.9A1.8 1.8 0 0 1 14 3.8v4.9a1.8 1.8 0 0 1-1.8 1.8h-1.7" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" />
                        <path d="M2 7.3A1.8 1.8 0 0 1 3.8 5.5h4.9a1.8 1.8 0 0 1 1.8 1.8v4.9A1.8 1.8 0 0 1 8.7 14H3.8A1.8 1.8 0 0 1 2 12.2V7.3Z" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" />
                      </svg>
                      <span>{{ copiedSpeakerLinkId === `selected-${submission.id}` ? 'Copied' : 'Copy' }}</span>
                    </button>
                    <a
                      v-if="speakerIntakePathForToken(selectedSpeakerLinkForSubmission(submission.id)?.token ?? null)"
                      :href="speakerIntakePathForToken(selectedSpeakerLinkForSubmission(submission.id)?.token ?? null)"
                      target="_blank"
                      rel="noopener noreferrer"
                      :class="actionClass()"
                    >
                      Open
                    </a>
                  </div>
                </article>
              </div>
            </section>

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
                      <span
                        v-if="submission.status === 'selected' && !submission.selected_talk_id"
                        class="rounded-md border border-dc-border bg-dc-paper-warm px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wide text-dc-gray"
                      >
                        {{ selectedSpeakerLinkLabel(submission) }}
                      </span>
                      <span
                        v-if="submission.status === 'selected' && submission.selected_talk_id"
                        class="rounded-md border border-dc-border bg-dc-paper-warm px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wide text-dc-gray"
                      >
                        Slides received
                      </span>
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
                      <div v-if="talk.abstract" class="program-abstract-preview">
                        <p class="program-abstract-preview__label">
                          {{ programAbstractIsLong(talk.abstract) && !programTalkExpanded(talk.id) ? 'Review summary' : 'Abstract' }}
                        </p>
                        <p class="program-abstract-preview__text">
                          {{ programAbstractIsLong(talk.abstract) && !programTalkExpanded(talk.id) ? programAbstractPreview(talk.abstract) : talk.abstract }}
                        </p>
                        <button
                          v-if="programAbstractIsLong(talk.abstract)"
                          type="button"
                          class="program-abstract-preview__toggle motion-press"
                          :aria-expanded="programTalkExpanded(talk.id)"
                          @click="toggleProgramTalkSummary(talk.id)"
                        >
                          {{ programTalkExpanded(talk.id) ? 'Show summary' : 'Show full abstract' }}
                        </button>
                      </div>
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
