<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { useRoute } from 'vue-router';
import { adminPath } from '@/src/admin-routes';
import AppDropdown from '@/src/components/AppDropdown.vue';
import ConfirmDialog from '@/src/components/ui/ConfirmDialog.vue';
import AdminTalksPageSkeleton from '@/src/components/ui/page-skeletons/AdminTalksPageSkeleton.vue';
import { notify } from '@/src/lib/notify';
import { ensureAdminShortLink, fetchAdminSession, fetchEventById, fetchEventChecklist, queryKeys } from '@/src/lib/api';
import {
  isArchiveRequestsChecklistItem,
  isArchiveRequestsDisabledForEvent,
} from '@/lib/event-checklist-policy';
import { resolveEventSeriesType } from '@/lib/event-series';
import { archiveRequestProgramItems, sameArchiveProgramItemIdentity } from '@/lib/speaker-archive-email';
import type { ArchiveItemKind, ArchiveMaterialField, Event, EventChecklistItem, EventStatus, SpeakerIntakeEmailStatus, SpeakerSubmission, SpeakerSubmissionStatus, Talk, TalkStatus } from '@/types';

const route = useRoute();
const queryClient = useQueryClient();
const adminSessionQuery = useQuery({
  queryKey: queryKeys.adminSession,
  queryFn: fetchAdminSession,
});
type TalkSection = 'cfp' | 'proposals' | 'program' | 'backfill';
type AdminSpeakerIntakeLink = {
  id: string;
  event_id: string;
  event_month: string;
  purpose: 'archive_backfill' | 'selected_speaker_confirmation' | 'archive_materials_follow_up';
  speaker_submission_id: string | null;
  speaker_name: string | null;
  speaker_email: string | null;
  talk_title: string | null;
  talk_id: string | null;
  requested_fields: ArchiveMaterialField[];
  kind?: ArchiveItemKind;
  token: string | null;
  email_status: SpeakerIntakeEmailStatus | null;
  email_provider_id: string | null;
  email_sent_at: string | null;
  email_last_attempt_at: string | null;
  email_last_error: string | null;
  expires_at: string;
  used_at: string | null;
  used_talk_id: string | null;
  created_at: string;
  updated_at: string;
  status: 'active' | 'used' | 'expired';
};
type TalkPreview = {
  source: 'proposal' | 'archive';
  item: SpeakerSubmission | Talk;
};
const event = ref<Event | null>(null);
const talks = ref<Talk[]>([]);
const speakerSubmissions = ref<SpeakerSubmission[]>([]);
const speakerIntakeLinks = ref<AdminSpeakerIntakeLink[]>([]);
const checklistItems = ref<EventChecklistItem[]>([]);
const loading = ref(true);
const creatingSpeakerLink = ref(false);
const enablingArchiveRequests = ref(false);
const deletingSpeakerLinkId = ref<string | null>(null);
const decidingSubmissionId = ref<string | null>(null);
const updatingCfp = ref(false);
const refreshingSubmissions = ref(false);
const closeCfpDialogOpen = ref(false);
const cfpLinkCopied = ref(false);
const cfpShortLinkUrl = ref<string | null>(null);
const copiedSpeakerLinkId = ref<string | null>(null);
const updatingTalkId = ref<string | null>(null);
const sendingMaterialsFollowUp = ref(false);
const materialsFollowUpFields = ref<ArchiveMaterialField[]>([]);
const talkPreview = ref<TalkPreview | null>(null);
const talkPreviewPanel = ref<HTMLElement | null>(null);
const talkPreviewCloseButton = ref<HTMLButtonElement | null>(null);
let talkPreviewTrigger: HTMLElement | null = null;
let cfpLinkCopiedResetTimer: ReturnType<typeof setTimeout> | null = null;
let speakerIntakeLinkCopiedResetTimer: ReturnType<typeof setTimeout> | null = null;
const speakerLinkExpiresInDays = ref(7);
const backfillProgramItemValues = ref<string[]>([]);
const backfillProgramItemEmails = ref<Record<string, string>>({});
const error = ref<string | null>(null);
const groups: { label: string; statuses: TalkStatus[] }[] = [
  { label: 'Needs details', statuses: ['submitted'] },
  { label: 'Ready to publish', statuses: ['accepted', 'slides_received'] },
  { label: 'Published', statuses: ['published'] },
  { label: 'Excluded', statuses: ['rejected'] },
];

const groupedTalks = computed(() => groups.map((group) => ({
  ...group,
  talks: talks.value.filter((talk) => group.statuses.includes(talk.status)),
})));
const canUnpublishArchiveItem = computed(() => adminSessionQuery.data.value?.user?.role === 'owner');
const submissionGroups: { label: string; statuses: SpeakerSubmissionStatus[] }[] = [
  { label: 'Awaiting organizer decision', statuses: ['submitted'] },
  { label: 'Selected presenters', statuses: ['selected'] },
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
const materialsFollowUpLinks = computed(() => speakerIntakeLinks.value.filter((link) => link.purpose === 'archive_materials_follow_up'));
// Latest-active link per submission, built once per links change. The template
// looks this up several times per row; filter+sort per lookup was O(rows x links log links).
const selectedSpeakerLinkBySubmissionId = computed(() => {
  const byRecency = [...selectedSpeakerLinks.value]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const map = new Map<string, AdminSpeakerIntakeLink>();

  for (const link of byRecency) {
    if (!link.speaker_submission_id) continue;
    const existing = map.get(link.speaker_submission_id);
    if (!existing || (existing.status !== 'active' && link.status === 'active')) {
      map.set(link.speaker_submission_id, link);
    }
  }

  return map;
});
const missingSelectedSpeakerLinkCount = computed(() => selectedSpeakerPendingSubmissions.value.filter((submission) => {
  const link = selectedSpeakerLinkForSubmission(submission.id);
  return !link || link.status !== 'active' || !link.token;
}).length);
const activeArchiveBackfillLinkCount = computed(() => archiveBackfillLinks.value.filter((link) => link.status === 'active').length);
const archiveRequestsChecklistItem = computed(() => (
  checklistItems.value.find(isArchiveRequestsChecklistItem) ?? null
));
const archiveRequestsDisabled = computed(() => isArchiveRequestsDisabledForEvent(checklistItems.value));
const archiveRequestsEnabled = computed(() => !archiveRequestsDisabled.value);
const talkSections: { id: TalkSection; label: string }[] = [
  { id: 'cfp', label: 'CFP' },
  { id: 'proposals', label: 'Talks review' },
  { id: 'program', label: 'Talks Archive' },
  { id: 'backfill', label: 'Archive Requests' },
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
const previewProposal = computed<SpeakerSubmission | null>(() => (
  talkPreview.value?.source === 'proposal' ? talkPreview.value.item as SpeakerSubmission : null
));
const previewArchiveItem = computed<Talk | null>(() => (
  talkPreview.value?.source === 'archive' ? talkPreview.value.item as Talk : null
));
const publicArchivePath = computed(() => (
  event.value?.status === 'completed' && event.value.publish_to_website
    ? `/archive/${event.value.id}`
    : null
));
const cfpFormPath = computed(() => `/cfp/${route.params.eventId}`);
const cfpFormUrl = computed(() => {
  if (typeof window === 'undefined') return cfpFormPath.value;
  return new URL(cfpFormPath.value, window.location.origin).toString();
});
const cfpShareUrl = computed(() => cfpShortLinkUrl.value ?? cfpFormUrl.value);
const eventStatus = computed(() => event.value?.status ?? 'draft');
const cfpIsOpen = computed(() => eventStatus.value === 'cfp_open');
const cfpIsClosed = computed(() => eventStatus.value === 'cfp_closed');
const eventIsMonthly = computed(() => (
  event.value ? resolveEventSeriesType(event.value) === 'monthly' : false
));
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
  return 'Open CFP when this event is ready to receive presentation proposals.';
});
const speakerLinkExpiryDurations = [3, 7, 14, 31];
const speakerLinkExpiryOptions = computed(() => speakerLinkExpiryDurations.map((days) => ({
  value: days,
  label: `${days} days`,
})));
const backfillProgramItems = computed(() => archiveRequestProgramItems(event.value?.schedule).map((item) => {
  const sent = archiveBackfillLinks.value.some((link) => (
    link.email_status === 'accepted'
    && sameArchiveProgramItemIdentity(link, {
      kind: item.kind,
      speakerName: item.speakerName,
      title: item.title,
    })
  ));

  return { ...item, sent };
}));
const selectableBackfillProgramItems = computed(() => backfillProgramItems.value.filter((item) => !item.sent));
const selectedBackfillProgramItems = computed(() => backfillProgramItems.value.filter((item) => (
  backfillProgramItemValues.value.includes(item.value)
)));
const validSpeakerEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const selectedBackfillEmailIssueCount = computed(() => selectedBackfillProgramItems.value.filter((item) => (
  !validSpeakerEmailPattern.test(backfillProgramItemEmails.value[item.value]?.trim() ?? '')
)).length);
const allSelectableBackfillProgramItemsSelected = computed(() => (
  selectableBackfillProgramItems.value.length > 0
  && selectableBackfillProgramItems.value.every((item) => backfillProgramItemValues.value.includes(item.value))
));
const canSendBackfillEmails = computed(() => (
  archiveRequestsEnabled.value
  && selectedBackfillProgramItems.value.length > 0
  && selectedBackfillEmailIssueCount.value === 0
  && selectedBackfillProgramItems.value.every((item) => !item.sent)
));
const sendBackfillButtonLabel = computed(() => {
  if (creatingSpeakerLink.value) return 'Sending...';
  const count = selectedBackfillProgramItems.value.length;
  return count > 0 ? `Send ${count} ${count === 1 ? 'email' : 'emails'}` : 'Send email';
});

function backfillProgramItemIsSelected(value: string): boolean {
  return backfillProgramItemValues.value.includes(value);
}

function backfillProgramItemEmailIsInvalid(value: string): boolean {
  const email = backfillProgramItemEmails.value[value]?.trim() ?? '';
  return email.length > 0 && !validSpeakerEmailPattern.test(email);
}

function selectAllBackfillProgramItems() {
  backfillProgramItemValues.value = selectableBackfillProgramItems.value
    .slice(0, 100)
    .map((item) => item.value);
}

function clearBackfillProgramItemSelection() {
  backfillProgramItemValues.value = [];
}

function speakerEmailPlaceholder(speakerName: string): string {
  const localPart = speakerName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.|\.$/g, '');
  return `${localPart || 'speaker'}@example.com`;
}

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
  const eventId = String(route.params.eventId);
  event.value = await queryClient.fetchQuery({
    queryKey: queryKeys.event(eventId),
    queryFn: () => fetchEventById(eventId),
  });
}

async function prepareCfpShareLink() {
  cfpShortLinkUrl.value = null;
  if (!cfpCanReceiveSubmissions.value) return;
  const shortLink = await ensureAdminShortLink({ destination: 'monthly_cfp', event_id: String(route.params.eventId) });
  cfpShortLinkUrl.value = shortLink.url;
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

async function fetchArchiveRequestAvailability() {
  const eventId = String(route.params.eventId);
  const data = await queryClient.fetchQuery({
    queryKey: queryKeys.eventChecklist(eventId),
    queryFn: () => fetchEventChecklist(eventId),
  });
  checklistItems.value = data.items ?? [];
}

function rememberIssuedSpeakerLink(payload: { link?: AdminSpeakerIntakeLink | null; token?: string | null }) {
  if (!payload.link || !payload.token) return;

  const issuedLink: AdminSpeakerIntakeLink = {
    ...payload.link,
    token: payload.token,
  };
  const index = speakerIntakeLinks.value.findIndex((link) => link.id === issuedLink.id);
  if (index === -1) {
    speakerIntakeLinks.value = [issuedLink, ...speakerIntakeLinks.value];
    return;
  }

  const next = [...speakerIntakeLinks.value];
  next[index] = issuedLink;
  speakerIntakeLinks.value = next;
}

async function fetchPageData() {
  await fetchEvent();
  await Promise.all([
    fetchTalks(),
    fetchSpeakerSubmissions(),
    fetchSpeakerIntakeLinks(),
    fetchArchiveRequestAvailability(),
  ]);
  await prepareCfpShareLink();
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
  if (linkNeedsReissue(link)) return 'Reissue this older unverified link';
  if (link.email_status === 'accepted' && link.email_sent_at) return `Email sent ${formatDateTime(link.email_sent_at)}`;
  if (link.email_status === 'failed') return 'Email failed — select the speaker above to retry';
  if (link.email_status === 'pending') return 'Email send pending';
  if (link.status === 'used') return 'Used';
  if (link.status === 'expired') return 'Expired';

  const durationDays = linkDurationDays(link);
  return durationDays ? `Expires in ${durationDays} days` : 'Active';
}

function linkNeedsReissue(link: AdminSpeakerIntakeLink): boolean {
  return link.purpose === 'archive_backfill' && (!link.speaker_name || !link.speaker_email);
}

function missingArchiveMaterialFields(talk: Talk): ArchiveMaterialField[] {
  const missing: ArchiveMaterialField[] = [];
  if (!talk.abstract?.trim()) missing.push('abstract');
  if (!talk.bio?.trim()) missing.push('bio');
  if (!slidesLink(talk)) missing.push('slides_url');
  return missing;
}

function archiveMaterialFieldLabel(field: ArchiveMaterialField, talk: Talk): string {
  if (field === 'abstract') return archiveKindFor(talk) === 'product_demo' ? 'Demo summary' : 'Abstract';
  if (field === 'bio') return 'Presenter bio';
  return archiveResourceLabel(talk);
}

function latestMaterialsFollowUpLink(talkId: string): AdminSpeakerIntakeLink | null {
  return materialsFollowUpLinks.value
    .filter((link) => link.talk_id === talkId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] ?? null;
}

function materialsFollowUpStatus(talkId: string): string | null {
  const link = latestMaterialsFollowUpLink(talkId);
  if (!link) return null;
  if (link.status === 'used') return `Follow-up completed ${formatDateTime(link.used_at!)}`;
  if (link.email_status === 'failed') return 'Last follow-up email failed. You can retry.';
  if (link.status === 'expired') return 'Last follow-up link expired. You can send a new one.';
  if (link.email_status === 'accepted' && link.email_sent_at) return `Follow-up emailed ${formatDateTime(link.email_sent_at)}`;
  return 'Follow-up email is being prepared.';
}

function hasActiveMaterialsFollowUp(talkId: string): boolean {
  const link = latestMaterialsFollowUpLink(talkId);
  return Boolean(link && link.status === 'active' && link.email_status !== 'failed');
}

async function sendMaterialsFollowUp(talk: Talk) {
  if (!canUnpublishArchiveItem.value || materialsFollowUpFields.value.length === 0) return;

  sendingMaterialsFollowUp.value = true;
  error.value = null;
  try {
    const response = await fetch(`/api/talks/${talk.id}/materials-follow-up`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requested_fields: materialsFollowUpFields.value }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Unable to send the materials follow-up.');

    await fetchSpeakerIntakeLinks();
    notify.success('Materials follow-up sent to the presenter.');
  } catch (requestError) {
    const message = requestError instanceof Error ? requestError.message : 'Unable to send the materials follow-up.';
    error.value = message;
    notify.error(message);
  } finally {
    sendingMaterialsFollowUp.value = false;
  }
}

function openTalkPreview(source: TalkPreview['source'], item: SpeakerSubmission | Talk, triggerEvent?: MouseEvent) {
  talkPreviewTrigger = triggerEvent?.currentTarget instanceof HTMLElement ? triggerEvent.currentTarget : null;
  materialsFollowUpFields.value = source === 'archive' ? missingArchiveMaterialFields(item as Talk) : [];
  talkPreview.value = { source, item };
  void nextTick(() => talkPreviewCloseButton.value?.focus());
}

function closeTalkPreview() {
  if (!talkPreview.value) return;
  talkPreview.value = null;
  const trigger = talkPreviewTrigger;
  talkPreviewTrigger = null;
  void nextTick(() => trigger?.focus());
}

function handleTalkPreviewKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && talkPreview.value) {
    closeTalkPreview();
    return;
  }

  if (event.key !== 'Tab' || !talkPreview.value || !talkPreviewPanel.value) return;
  const focusable = Array.from(talkPreviewPanel.value.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
  ));
  const first = focusable[0];
  const last = focusable.at(-1);
  if (!first || !last) return;

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

async function refreshSpeakerSubmissions() {
  refreshingSubmissions.value = true;
  error.value = null;

  try {
    const refreshed = await fetchSpeakerSubmissions();
    if (!refreshed) error.value = 'Could not refresh presentation proposals.';
  } catch {
    error.value = 'Could not refresh presentation proposals.';
  } finally {
    refreshingSubmissions.value = false;
  }
}

async function sendSpeakerIntakeEmails() {
  if (!archiveRequestsEnabled.value || !canSendBackfillEmails.value) return;

  creatingSpeakerLink.value = true;
  error.value = null;

  try {
    const response = await fetch(`/api/events/${route.params.eventId}/speaker-intake-emails`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipients: selectedBackfillProgramItems.value.map((item) => ({
          program_item_index: item.index,
          speaker_email: backfillProgramItemEmails.value[item.value].trim(),
        })),
        expires_in_days: speakerLinkExpiresInDays.value,
      }),
    });
    const data = await response.json().catch(() => ({}));

    if (response.ok) {
      resetSpeakerIntakeLinkCopied();
      await fetchSpeakerIntakeLinks();
      backfillProgramItemValues.value = [];
      backfillProgramItemEmails.value = {};

      if (data.sent_count === 1) {
        notify.success('Email sent.');
      } else if (data.sent_count > 1) {
        notify.success(`${data.sent_count} emails sent.`);
      } else {
        notify.info('The selected email was already sent.');
      }
    } else {
      notify.error(data.error || 'Could not send the archive request email.');
    }
  } catch {
    notify.error('Could not send the archive request email. Check your connection and try again.');
  } finally {
    creatingSpeakerLink.value = false;
  }
}

async function enableArchiveRequests() {
  const item = archiveRequestsChecklistItem.value;
  if (!item || !archiveRequestsDisabled.value || enablingArchiveRequests.value) return;

  enablingArchiveRequests.value = true;
  try {
    const response = await fetch(`/api/events/${route.params.eventId}/checklist/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ disabled: false }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error ?? 'Could not enable archive requests.');
    }

    checklistItems.value = data.items ?? checklistItems.value;
    notify.success('Archive requests enabled. You can now create private request links.');
  } catch (error) {
    notify.error(error instanceof Error ? error.message : 'Could not enable archive requests.');
  } finally {
    enablingArchiveRequests.value = false;
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
      if (previewProposal.value?.id === submissionId) closeTalkPreview();
      if (status === 'selected' && data.token) {
        rememberIssuedSpeakerLink(data);
        resetSpeakerIntakeLinkCopied();
        notify.success('Private archive completion link generated.');
      } else {
        notify.success('Presenter marked as not selected.');
      }
    } else {
      error.value = data.error || 'Failed to update presentation proposal';
    }
  } catch {
    error.value = 'Failed to update presentation proposal';
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
    // Independent mutations: run them concurrently instead of paying one
    // round trip per selected speaker.
    const issuedLinks = await Promise.all(submissionsNeedingLinks.map(async (submission) => {
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
        throw new Error(data.error || `Could not generate an archive completion link for ${submission.speaker_name}.`);
      }
      return data as { link?: AdminSpeakerIntakeLink | null; token?: string | null };
    }));

    await Promise.all([fetchSpeakerSubmissions(), fetchSpeakerIntakeLinks()]);
    issuedLinks.forEach(rememberIssuedSpeakerLink);
    resetSpeakerIntakeLinkCopied();
    notify.success(submissionsNeedingLinks.length === 1 ? 'Archive completion link generated.' : 'Selected presenter links generated.');
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'Could not generate selected presenter links.';
  } finally {
    creatingSpeakerLink.value = false;
  }
}

async function copyCfpFormLink() {
  if (!cfpIsOpen.value) return;

  error.value = null;

  try {
    const shortLink = cfpShortLinkUrl.value
      ? { url: cfpShortLinkUrl.value }
      : await ensureAdminShortLink({ destination: 'monthly_cfp', event_id: String(route.params.eventId) });
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(shortLink.url);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = shortLink.url;
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
      if (status === 'cfp_open') await prepareCfpShareLink();
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
    error.value = 'Could not copy the private archive link.';
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
      notify.success('Archive request removed.');
    } else {
      error.value = data.error || 'Could not remove archive request.';
    }
  } catch {
    error.value = 'Could not remove archive request.';
  } finally {
    deletingSpeakerLinkId.value = null;
  }
}

function primaryTalkAction(talk: Talk): { label: string; status: TalkStatus } | null {
  if (talk.status === 'published') {
    if (!canUnpublishArchiveItem.value) return null;

    return {
      label: 'Unpublish',
      status: talk.slides_uploaded_at || slidesLink(talk) ? 'slides_received' : 'accepted',
    };
  }

  if (talk.status === 'rejected') {
    return null;
  }

  if (
    talk.status === 'accepted'
    || talk.status === 'slides_received'
    || Boolean(talk.slides_uploaded_at)
    || Boolean(slidesLink(talk))
  ) {
    return { label: 'Publish', status: 'published' };
  }

  if (talk.status === 'submitted') {
    return { label: 'Accept', status: 'accepted' };
  }

  return null;
}

function talkStatusMessage(talk: Talk | undefined, status: TalkStatus): string {
  const itemLabel = talk ? archiveKindLabel(talk) : 'Archive item';
  if (status === 'published') return `${itemLabel} published to the public archive.`;
  if (talk?.status === 'published' && (status === 'accepted' || status === 'slides_received')) {
    return `${itemLabel} removed from the public archive.`;
  }
  if (status === 'accepted') return `${itemLabel} is ready for archive review.`;
  if (status === 'rejected') return `${itemLabel} excluded from the archive.`;
  if (status === 'slides_received') return `${archiveResourceLabel(talk ?? { kind: 'talk' })} marked as received.`;
  return `${itemLabel} updated.`;
}

async function setStatus(talkId: string, status: TalkStatus) {
  error.value = null;
  updatingTalkId.value = talkId;
  const talk = talks.value.find((item) => item.id === talkId);

  try {
    const response = await fetch(`/api/talks/${talkId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    const data = await response.json().catch(() => ({}));

    if (response.ok) {
      await fetchTalks();
      if (previewArchiveItem.value?.id === talkId) {
        talkPreview.value = { source: 'archive', item: data as Talk };
      }
      notify.success(talkStatusMessage(talk, status));
    } else {
      const message = data.error || `Failed to update ${talk ? archiveKindLabel(talk).toLowerCase() : 'archive item'}`;
      error.value = message;
      notify.error(message);
    }
  } catch {
    const message = `Failed to update ${talk ? archiveKindLabel(talk).toLowerCase() : 'archive item'}`;
    error.value = message;
    notify.error(message);
  } finally {
    updatingTalkId.value = null;
  }
}

async function sendReminder(talkId: string) {
  error.value = null;

  const response = await fetch(`/api/talks/${talkId}/reminder`, { method: 'POST' });
  if (response.ok) {
    notify.success('Reminder logged for presenter follow-up.');
    await fetchTalks();
  } else {
    const data = await response.json();
    error.value = data.error || 'Failed to send reminder';
  }
}

function slideLabel(talk: Talk): string {
  const isProductDemo = archiveKindFor(talk) === 'product_demo';

  if (talk.slides_uploaded_at) {
    return `${isProductDemo ? 'Demo link' : 'Slides'} received ${new Date(talk.slides_uploaded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  }

  if (talk.status === 'accepted') {
    if (isProductDemo) return 'Demo link optional';

    return talk.reminder_sent_count > 0
      ? `${talk.reminder_sent_count} reminder${talk.reminder_sent_count === 1 ? '' : 's'} sent`
      : 'Needs slides';
  }

  if (talk.status === 'published') {
    return isProductDemo ? 'No demo link' : 'No slides link';
  }

  return isProductDemo ? 'Demo link not required yet' : 'Slides not required yet';
}

function slidesLink(talk: Talk): string | null {
  if (talk.slides_type === 'file' && talk.storage_path) return talk.storage_path;
  if (talk.slides_url) {
    try {
      const url = new URL(talk.slides_url);
      if (url.protocol === 'http:' || url.protocol === 'https:') return talk.slides_url;
    } catch {
      return null;
    }
  }
  return null;
}

function archiveKindFor(item: { kind?: ArchiveItemKind | null }): ArchiveItemKind {
  return item.kind === 'product_demo' ? 'product_demo' : 'talk';
}

function archiveKindLabel(item: { kind?: ArchiveItemKind | null }): string {
  return archiveKindFor(item) === 'product_demo' ? 'Product demo' : 'Talk';
}

function archiveResourceLabel(item: { kind?: ArchiveItemKind | null }): string {
  return archiveKindFor(item) === 'product_demo' ? 'Demo link' : 'Slides';
}

function archiveStatusLabel(talk: Talk): string {
  if (talk.status === 'submitted') return 'Needs details';
  if (talk.status === 'accepted') return 'Ready to publish';
  if (talk.status === 'slides_received') return `${archiveResourceLabel(talk)} received`;
  if (talk.status === 'published') return 'Published';
  return 'Excluded';
}

function archiveReminderLabel(talk: Talk): string {
  return archiveKindFor(talk) === 'product_demo' ? 'Request demo link' : 'Remind for slides';
}

function selectedSpeakerLinkForSubmission(submissionId: string): AdminSpeakerIntakeLink | null {
  return selectedSpeakerLinkBySubmissionId.value.get(submissionId) ?? null;
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

function actionClass(isPrimary = false): string {
  return isPrimary
    ? 'motion-press rounded-md border-2 border-dc-ink bg-dc-yellow px-4 py-2 font-mono text-xs font-semibold uppercase tracking-wide text-dc-ink shadow-[2px_2px_0_#111111] disabled:opacity-40'
    : 'motion-press rounded-md border-2 border-dc-border bg-dc-paper px-4 py-2 font-mono text-xs font-semibold uppercase tracking-wide text-dc-gray hover:border-dc-ink hover:text-dc-ink disabled:opacity-40';
}

function proposalActionClass(isPrimary = false): string {
  return isPrimary
    ? 'motion-press rounded-md border-2 border-dc-ink bg-dc-yellow px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wide text-dc-ink shadow-[2px_2px_0_#111111] disabled:opacity-40'
    : 'motion-press rounded-md border border-dc-border bg-dc-paper px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wide text-dc-gray hover:border-dc-ink hover:text-dc-ink disabled:opacity-40';
}

onMounted(() => {
  void fetchPageData();
  window.addEventListener('keydown', handleTalkPreviewKeydown);
});

onUnmounted(() => {
  if (cfpLinkCopiedResetTimer) clearTimeout(cfpLinkCopiedResetTimer);
  if (speakerIntakeLinkCopiedResetTimer) clearTimeout(speakerIntakeLinkCopiedResetTimer);
  window.removeEventListener('keydown', handleTalkPreviewKeydown);
});
</script>

<template>
  <div class="editorial-page">
    <div class="editorial-wrap">
      <div class="editorial-header">
        <p class="editorial-eyebrow">event archive</p>
        <h1 class="editorial-title">Archive</h1>
        <p class="editorial-subtitle">Build one event archive for talks and product demos, whether they arrive through a proposal or a direct archive request.</p>
      </div>

      <nav
        class="talk-workflow-tabs mb-8"
        aria-label="Event archive workflow"
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
              <p class="ops-label text-dc-pink">call for presentations</p>
              <h2>CFP</h2>
              <div class="cfp-status-pill">
                <span class="cfp-status-dot" :class="{ 'cfp-status-dot--open': cfpIsOpen, 'cfp-status-dot--closed': cfpIsClosed, 'cfp-status-dot--idle': !cfpIsOpen && !cfpIsClosed }" />
                <span>{{ cfpStatusLabel }}</span>
              </div>
            </div>
          </div>

          <div class="cfp-control-main">
            <div class="cfp-control-copy">
              <p class="ops-label">presentation call</p>
              <h3>{{ cfpIsOpen ? 'Share the form' : cfpIsClosed ? 'CFP is closed' : 'Start accepting proposals' }}</h3>
              <p>{{ cfpStatusHelp }}</p>
            </div>

            <div v-if="cfpIsOpen" class="cfp-share-row">
              <label class="cfp-share-field">
                <span class="ops-label">public form</span>
                <input :value="cfpCanReceiveSubmissions ? cfpShareUrl : 'CFP unavailable for this event date'" readonly class="editorial-input font-mono text-sm" />
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
          <div class="mb-6">
            <Transition name="archive-request-composer" mode="out-in">
              <section v-if="!archiveRequestsEnabled" key="disabled" class="rounded-md border border-dc-border bg-dc-paper-warm p-5">
                <p class="ops-label">archive requests</p>
                <h3 class="mt-1 text-lg font-bold tracking-tight text-dc-ink">Archive requests are off</h3>
                <p class="mt-2 max-w-2xl text-sm leading-6 text-dc-gray">
                  Enable this only when you are ready to invite speakers to add materials to this event archive. Existing request links remain available below.
                </p>
                <button
                  type="button"
                  class="editorial-action mt-4 min-h-11 px-4 disabled:opacity-50"
                  :disabled="!archiveRequestsChecklistItem || enablingArchiveRequests"
                  @click="enableArchiveRequests"
                >
                  {{ enablingArchiveRequests ? 'ENABLING…' : 'ENABLE ARCHIVE REQUESTS' }}
                </button>
              </section>

              <form v-else key="enabled" @submit.prevent="sendSpeakerIntakeEmails">
              <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p class="ops-label">new request</p>
                  <h3 class="mt-1 text-lg font-bold tracking-tight text-dc-ink">Choose recipients and add their emails</h3>
                  <p class="mt-2 max-w-3xl text-sm leading-6 text-dc-gray">
                    Select people directly from this month’s program, then enter the address for each private archive link.
                  </p>
                </div>
                <div v-if="backfillProgramItems.length > 0" class="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    class="motion-press min-h-9 rounded-md px-3 font-mono text-[10px] font-semibold uppercase tracking-wide text-dc-gray hover:bg-dc-paper-warm hover:text-dc-ink disabled:cursor-not-allowed disabled:opacity-35"
                    :disabled="allSelectableBackfillProgramItemsSelected"
                    @click="selectAllBackfillProgramItems"
                  >
                    Select all unsent
                  </button>
                  <button
                    type="button"
                    class="motion-press min-h-9 rounded-md px-3 font-mono text-[10px] font-semibold uppercase tracking-wide text-dc-gray hover:bg-dc-paper-warm hover:text-dc-ink disabled:cursor-not-allowed disabled:opacity-35"
                    :disabled="backfillProgramItemValues.length === 0"
                    @click="clearBackfillProgramItemSelection"
                  >
                    Clear selection
                  </button>
                </div>
              </div>

              <div v-if="backfillProgramItems.length > 0" class="mt-5 overflow-hidden rounded-lg border-2 border-dc-ink bg-dc-paper">
                <div class="hidden grid-cols-[minmax(0,1.15fr)_minmax(16rem,0.85fr)] gap-4 border-b border-dc-border bg-dc-paper-warm px-4 py-2.5 md:grid">
                  <span class="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-dc-gray">Speaker and topic</span>
                  <span class="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-dc-gray">Recipient email</span>
                </div>

                <div
                  v-for="(item, itemIndex) in backfillProgramItems"
                  :key="`recipient-${item.value}`"
                  class="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1.15fr)_minmax(16rem,0.85fr)] md:items-center md:gap-4"
                  :class="[
                    itemIndex > 0 ? 'border-t border-dc-border' : '',
                    item.sent
                      ? 'bg-dc-paper-warm'
                      : backfillProgramItemIsSelected(item.value)
                        ? 'bg-dc-yellow/15'
                        : 'bg-dc-paper',
                  ]"
                >
                  <label
                    :for="`archive-recipient-${item.index}`"
                    class="flex min-w-0 items-start gap-3"
                    :class="item.sent ? 'cursor-not-allowed' : 'cursor-pointer'"
                  >
                    <input
                      :id="`archive-recipient-${item.index}`"
                      v-model="backfillProgramItemValues"
                      type="checkbox"
                      :value="item.value"
                      :disabled="item.sent"
                      class="mt-0.5 size-5 shrink-0 accent-dc-pink disabled:cursor-not-allowed"
                    >
                    <span class="min-w-0">
                      <span class="flex flex-wrap items-center gap-2">
                        <span class="text-sm font-bold text-dc-ink">{{ item.speakerName }}</span>
                        <span v-if="item.sent" class="rounded-md border border-dc-success bg-dc-success-soft px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wide text-dc-success">
                          Sent
                        </span>
                      </span>
                      <span class="mt-1 block text-sm leading-5 text-dc-gray">{{ item.title }}</span>
                    </span>
                  </label>

                  <div v-if="item.sent" class="flex min-h-11 items-center rounded-md border border-dc-border bg-dc-paper px-3 font-mono text-xs font-semibold uppercase tracking-wide text-dc-gray">
                    Email already sent
                  </div>
                  <div v-else>
                    <label :for="`archive-recipient-email-${item.index}`" class="sr-only">
                      Email address for {{ item.speakerName }}
                    </label>
                    <input
                      :id="`archive-recipient-email-${item.index}`"
                      v-model="backfillProgramItemEmails[item.value]"
                      :required="backfillProgramItemIsSelected(item.value)"
                      :disabled="!backfillProgramItemIsSelected(item.value)"
                      type="email"
                      inputmode="email"
                      autocomplete="email"
                      class="editorial-input !min-h-11 !py-2 font-mono text-sm disabled:cursor-not-allowed disabled:border-dc-border disabled:bg-dc-paper-warm disabled:opacity-60"
                      :class="backfillProgramItemEmailIsInvalid(item.value) ? '!border-dc-pink' : ''"
                      :aria-invalid="backfillProgramItemEmailIsInvalid(item.value)"
                      :placeholder="backfillProgramItemIsSelected(item.value) ? speakerEmailPlaceholder(item.speakerName) : 'Select speaker first'"
                    >
                    <p v-if="backfillProgramItemEmailIsInvalid(item.value)" class="mt-1.5 text-xs font-semibold text-dc-pink">
                      Enter a valid email address.
                    </p>
                  </div>
                </div>
              </div>

              <p v-else class="mt-4 rounded-md border border-dc-border bg-dc-paper-warm p-4 text-sm font-medium text-dc-gray">
                Add a topic and speaker to this month’s program outline before sending a request.
              </p>

              <div v-if="backfillProgramItems.length > 0" class="mt-4 flex flex-col gap-4 border-t border-dc-border pt-4 md:flex-row md:items-end md:justify-between">
                <div class="max-w-2xl">
                  <p v-if="selectedBackfillProgramItems.length === 0" class="text-sm font-semibold text-dc-gray">
                    Select at least one speaker to begin.
                  </p>
                  <p v-else-if="selectedBackfillEmailIssueCount > 0" class="text-sm font-semibold text-dc-pink">
                    {{ selectedBackfillEmailIssueCount }} {{ selectedBackfillEmailIssueCount === 1 ? 'email is' : 'emails are' }} still needed.
                  </p>
                  <p v-else class="text-sm font-semibold text-dc-success">
                    {{ selectedBackfillProgramItems.length }} {{ selectedBackfillProgramItems.length === 1 ? 'recipient is' : 'recipients are' }} ready.
                  </p>
                  <p class="mt-1 text-xs font-medium leading-5 text-dc-gray">
                    These addresses are used only for this request. Future CFP submissions will provide speaker emails directly.
                  </p>
                </div>

                <div class="grid shrink-0 gap-3 sm:grid-cols-[10rem_auto] sm:items-end">
                  <AppDropdown
                    :model-value="speakerLinkExpiresInDays"
                    label="Valid for"
                    :options="speakerLinkExpiryOptions"
                    menu-class="min-w-40"
                    @update:model-value="speakerLinkExpiresInDays = Number($event)"
                  />
                  <button
                    type="submit"
                    :disabled="creatingSpeakerLink || !canSendBackfillEmails"
                    class="editorial-secondary-action h-[50px] self-end px-4 py-3 text-xs"
                  >
                    {{ sendBackfillButtonLabel }}
                  </button>
                </div>
              </div>
              </form>
            </Transition>
          </div>

          <section class="border-t border-dc-border pt-5">
            <div class="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p class="ops-label">generated links</p>
                <h3 class="mt-1 text-lg font-bold tracking-tight text-dc-ink">Archive Request Shelf</h3>
              </div>
              <p class="font-mono text-xs font-semibold uppercase tracking-wide text-dc-gray">{{ activeArchiveBackfillLinkCount }} active</p>
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
                      <p class="font-mono text-[11px] font-semibold uppercase tracking-wide text-dc-pink">{{ archiveKindLabel(link) }} / {{ link.event_month }}</p>
                      <span class="rounded-md border border-dc-border bg-dc-paper px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-dc-gray">{{ linkNeedsReissue(link) ? 'reissue' : link.status }}</span>
                    </div>
                    <p class="truncate text-sm font-semibold text-dc-ink">{{ link.speaker_name || 'Presenter identity unavailable' }}</p>
                    <p v-if="link.speaker_email" class="mt-1 truncate font-mono text-[11px] font-semibold text-dc-gray">{{ link.speaker_email }}</p>
                    <p class="font-mono text-[11px] font-semibold uppercase tracking-wide text-dc-gray">
                      {{ linkShelfStatusLabel(link) }}
                    </p>
                  </div>
                  <div class="flex flex-wrap gap-2 lg:justify-end">
                    <button
                      type="button"
                      :disabled="!speakerIntakeUrlForToken(link.token)"
                      class="inline-flex items-center gap-1.5"
                      :class="actionClass()"
                      :aria-label="copiedSpeakerLinkId === link.id ? 'Archive request link copied' : 'Copy archive request link'"
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
                  For security, private tokens are shown only when issued and are never stored in recoverable form. Generate a new link if you need to copy it again.
                </p>
              </article>
            </div>
            <div v-else class="rounded-md border border-dc-border bg-dc-paper-warm p-5 text-center">
              <p class="font-mono text-xs font-semibold uppercase tracking-wide text-dc-gray">No archive requests yet</p>
              <p class="mt-2 text-sm leading-6 text-dc-gray">Private request links will stay here until you remove them.</p>
            </div>
          </section>
        </section>

        <section v-if="activeTalkSection === 'proposals'" class="mb-8">
          <div class="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p class="ops-label">cfp inbox</p>
              <h2 class="mt-1 text-2xl font-bold tracking-tight text-dc-ink">Presentation Proposals</h2>
            </div>
            <div class="flex flex-wrap items-center gap-3">
              <p class="font-mono text-xs font-semibold uppercase tracking-wide text-dc-gray">
                {{ pendingSubmissionCount }} pending
              </p>
              <button
                type="button"
                class="motion-press inline-flex min-h-10 items-center gap-2 rounded-md border-2 border-dc-ink bg-dc-paper px-3 font-mono text-xs font-semibold uppercase tracking-wide text-dc-ink shadow-[2px_2px_0_#111111] disabled:cursor-not-allowed disabled:opacity-50"
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
                  <p class="ops-label">selected presenter links</p>
                  <h3 class="mt-1 text-lg font-bold tracking-tight text-dc-ink">Archive completion links</h3>
                  <p class="mt-1 text-sm leading-6 text-dc-gray">Generate one private link per selected presenter so they can finish the record required for this event archive.</p>
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
                    <div class="flex min-w-0 items-center gap-2">
                      <h4 class="truncate text-sm font-semibold tracking-tight text-dc-ink sm:text-base">{{ submission.title }}</h4>
                      <span class="shrink-0 rounded-md border border-dc-border bg-dc-paper px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-dc-pink">{{ archiveKindLabel(submission) }}</span>
                    </div>
                    <p class="mt-1 truncate text-sm font-medium text-dc-gray">{{ submission.speaker_name }}</p>
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
                      :aria-label="copiedSpeakerLinkId === `selected-${submission.id}` ? 'Archive completion link copied' : 'Copy archive completion link'"
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
              <h3 class="mb-3 flex items-center gap-3 text-lg font-bold tracking-tight text-dc-ink">
                {{ group.label }}
                <span class="font-mono text-xs font-semibold text-dc-gray">({{ group.submissions.length }})</span>
              </h3>
              <div class="ops-panel overflow-hidden">
                <article
                  v-for="submission in group.submissions"
                  :key="submission.id"
                  class="ops-row proposal-row"
                >
                  <div class="grid gap-2 px-3 py-2 sm:px-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                    <div class="proposal-row-trigger">
                      <span class="flex min-w-0 items-center gap-2">
                        <span class="truncate text-sm font-semibold tracking-tight text-dc-ink sm:text-base">{{ submission.title }}</span>
                        <span class="shrink-0 rounded-md border border-dc-border bg-dc-paper px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-dc-pink">{{ archiveKindLabel(submission) }}</span>
                      </span>
                      <span class="truncate text-sm font-bold text-dc-gray">{{ submission.speaker_name }}</span>
                      <span class="truncate font-mono text-xs uppercase tracking-wide text-dc-gray">{{ submission.topic || 'General' }}</span>
                    </div>
                    <div class="flex shrink-0 flex-wrap gap-2 lg:justify-end">
                      <button
                        type="button"
                        :class="proposalActionClass(true)"
                        @click="openTalkPreview('proposal', submission, $event)"
                      >
                        Review proposal
                      </button>
                      <span
                        v-if="submission.status === 'selected' && !submission.selected_talk_id"
                        class="rounded-md border border-dc-border bg-dc-paper-warm px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wide text-dc-gray"
                      >
                        {{ selectedSpeakerLinkLabel(submission) }}
                      </span>
                      <span
                        v-if="submission.status === 'selected' && submission.selected_talk_id"
                        class="rounded-md border border-dc-border bg-dc-paper-warm px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wide text-dc-gray"
                      >
                        Archive details received
                      </span>
                    </div>
                  </div>
                </article>
              </div>
            </section>
          </div>
          <div v-else class="editorial-panel p-12 text-center">
            <p class="editorial-eyebrow">proposal inbox</p>
            <h2 class="mt-3 text-2xl font-bold tracking-tight text-dc-ink">No proposals yet</h2>
            <p class="mx-auto mt-3 max-w-2xl text-sm leading-6 text-dc-gray">
              Open and share the CFP link from the CFP step. New submissions will appear here for selection.
            </p>
          </div>
        </section>

        <section v-if="activeTalkSection === 'program'" class="mb-8">
          <template v-if="talks.length > 0">
            <section v-for="group in groupedTalks.filter((item) => item.talks.length > 0)" :key="group.label" class="mb-8">
              <h2 class="mb-3 flex items-center gap-3 text-lg font-bold tracking-tight text-dc-ink">
                {{ group.label }}
                <span class="font-mono text-xs font-semibold text-dc-gray">({{ group.talks.length }})</span>
              </h2>
              <div class="ops-panel overflow-hidden">
                <article v-for="talk in group.talks" :key="talk.id" class="ops-row p-4">
                  <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div class="min-w-0">
                      <div class="mb-2 flex flex-wrap items-center gap-2">
                        <h3 class="text-xl font-bold tracking-tight text-dc-ink">{{ talk.title }}</h3>
                        <span class="rounded-md border border-dc-border bg-dc-paper px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-wide text-dc-pink">{{ archiveKindLabel(talk) }}</span>
                        <span class="rounded-md border border-dc-border bg-dc-paper-warm px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-wide text-dc-gray">{{ archiveStatusLabel(talk) }}</span>
                      </div>
                      <p class="text-sm text-dc-gray">{{ talk.speaker_name }} · {{ talk.speaker_email }}</p>
                      <p class="mt-3 font-mono text-xs uppercase tracking-wide text-dc-gray">
                        {{ talk.topic || 'General' }} <span class="mx-2 text-dc-pink">/</span> {{ slideLabel(talk) }}
                      </p>
                    </div>
                    <div class="flex shrink-0 flex-wrap gap-2 lg:justify-end">
                      <a v-if="slidesLink(talk)" :href="slidesLink(talk) ?? undefined" target="_blank" rel="noopener noreferrer" :class="actionClass()">
                        {{ archiveResourceLabel(talk) }}
                      </a>
                      <button
                        type="button"
                        :class="actionClass(talk.status !== 'published')"
                        @click="openTalkPreview('archive', talk, $event)"
                      >
                        {{ talk.status === 'published' ? 'Preview archive' : 'Review archive' }}
                      </button>
                    </div>
                  </div>
                </article>
              </div>
            </section>
          </template>
          <div v-else class="editorial-panel p-12 text-center">
            <p class="editorial-eyebrow">archive empty</p>
            <h2 class="mt-3 text-2xl font-bold tracking-tight text-dc-ink">No archive records yet</h2>
            <p class="mx-auto mt-3 max-w-2xl text-sm leading-6 text-dc-gray">
              Selected proposals and completed archive requests will meet here as talk or product-demo records, ready for an organizer to publish.
            </p>
          </div>
        </section>
      </template>
    </div>
    <Teleport to="body">
      <Transition name="talk-preview-drawer">
        <div v-if="talkPreview" class="talk-preview-drawer-shell">
          <button type="button" class="talk-preview-drawer-backdrop" aria-label="Close talk preview" @click="closeTalkPreview" />
          <aside
            ref="talkPreviewPanel"
            class="talk-preview-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="talk-preview-title"
            aria-describedby="talk-preview-description"
          >
            <header class="talk-preview-drawer__header">
              <div class="min-w-0">
                <div class="talk-preview-drawer__meta">
                  <span>{{ talkPreview.source === 'proposal' ? 'Talks review' : 'Talks Archive' }}</span>
                  <span aria-hidden="true">·</span>
                  <span>{{ archiveKindLabel(talkPreview.item) }}</span>
                  <template v-if="previewArchiveItem">
                    <span aria-hidden="true">·</span>
                    <span>{{ archiveStatusLabel(previewArchiveItem) }}</span>
                  </template>
                  <template v-else-if="previewProposal">
                    <span aria-hidden="true">·</span>
                    <span>{{ previewProposal.status === 'submitted' ? 'Awaiting decision' : previewProposal.status === 'selected' ? 'Selected' : 'Not selected' }}</span>
                  </template>
                </div>
                <h2 id="talk-preview-title" class="talk-preview-drawer__title">{{ talkPreview.item.title }}</h2>
                <p id="talk-preview-description" class="talk-preview-drawer__description">
                  {{ talkPreview.source === 'proposal' ? 'Read the complete proposal before recording a decision.' : 'Review the complete archive record, including the submitted content and presenter details.' }}
                </p>
              </div>
              <button ref="talkPreviewCloseButton" type="button" class="talk-preview-drawer__close motion-press" aria-label="Close talk preview" @click="closeTalkPreview">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                </svg>
              </button>
            </header>

            <div class="talk-preview-drawer__body">
              <section
                class="talk-preview-card"
                :class="{ 'talk-preview-card--empty': !talkPreview.item.abstract }"
              >
                <p class="talk-preview-card__kicker">{{ archiveKindFor(talkPreview.item) === 'product_demo' ? 'Demo summary' : 'Abstract' }}</p>
                <p v-if="talkPreview.item.abstract" class="talk-preview-card__abstract">{{ talkPreview.item.abstract }}</p>
                <p v-else class="talk-preview-card__empty">Not provided</p>
              </section>

              <section class="talk-preview-section" aria-labelledby="talk-preview-presenter">
                <p id="talk-preview-presenter" class="talk-preview-section__label">Presenter</p>
                <p class="talk-preview-section__title">{{ talkPreview.item.speaker_name }}</p>
                <a :href="`mailto:${talkPreview.item.speaker_email}`" class="talk-preview-inline-link">{{ talkPreview.item.speaker_email }}</a>
                <p v-if="talkPreview.item.github_username" class="mt-2 text-sm font-semibold text-dc-gray">GitHub · @{{ talkPreview.item.github_username }}</p>
              </section>

              <section class="talk-preview-section" aria-labelledby="talk-preview-bio">
                <p id="talk-preview-bio" class="talk-preview-section__label">Presenter bio</p>
                <p class="talk-preview-section__copy">{{ talkPreview.item.bio || 'No presenter bio was submitted.' }}</p>
              </section>

              <dl class="talk-preview-facts" aria-label="Talk metadata">
                <div>
                  <dt>Topic</dt>
                  <dd>{{ talkPreview.item.topic || 'General' }}</dd>
                </div>
                <div v-if="previewProposal">
                  <dt>Submitted</dt>
                  <dd><time :datetime="previewProposal.created_at">{{ formatDateTime(previewProposal.created_at) }}</time></dd>
                </div>
                <div v-if="previewArchiveItem">
                  <dt>Archive record</dt>
                  <dd><time :datetime="previewArchiveItem.created_at">Created {{ formatDateTime(previewArchiveItem.created_at) }}</time></dd>
                </div>
                <div v-if="previewArchiveItem">
                  <dt>{{ archiveResourceLabel(previewArchiveItem) }}</dt>
                  <dd>
                    <a v-if="slidesLink(previewArchiveItem)" :href="slidesLink(previewArchiveItem) ?? undefined" target="_blank" rel="noopener noreferrer" class="talk-preview-inline-link">
                      Open {{ archiveResourceLabel(previewArchiveItem).toLowerCase() }} ↗
                    </a>
                    <span v-else>Not provided</span>
                  </dd>
                </div>
              </dl>

              <section
                v-if="previewArchiveItem && (canUnpublishArchiveItem || materialsFollowUpStatus(previewArchiveItem.id))"
                class="mt-6 border-t border-dc-border pt-5"
                aria-labelledby="talk-materials-follow-up"
              >
                <p id="talk-materials-follow-up" class="talk-preview-section__label">Request missing details</p>
                <p v-if="canUnpublishArchiveItem && missingArchiveMaterialFields(previewArchiveItem).length > 0" class="mt-2 text-sm leading-6 text-dc-gray">
                  Send the presenter a one-time link that updates this archive record only.
                </p>
                <div v-if="canUnpublishArchiveItem && missingArchiveMaterialFields(previewArchiveItem).length > 0" class="mt-3 flex flex-wrap gap-2">
                  <label
                    v-for="field in missingArchiveMaterialFields(previewArchiveItem)"
                    :key="field"
                    class="inline-flex cursor-pointer items-center gap-2 rounded-md border border-dc-border bg-dc-paper px-3 py-2 text-sm font-semibold text-dc-ink"
                  >
                    <input v-model="materialsFollowUpFields" :value="field" type="checkbox" class="size-4 accent-dc-pink">
                    {{ archiveMaterialFieldLabel(field, previewArchiveItem) }}
                  </label>
                </div>
                <p v-else-if="canUnpublishArchiveItem" class="mt-2 text-sm leading-6 text-dc-gray">This archive record has all requested presenter details.</p>
                <p v-if="materialsFollowUpStatus(previewArchiveItem.id)" class="mt-3 text-sm font-semibold text-dc-gray">
                  {{ materialsFollowUpStatus(previewArchiveItem.id) }}
                </p>
                <button
                  v-if="canUnpublishArchiveItem && missingArchiveMaterialFields(previewArchiveItem).length > 0"
                  type="button"
                  :class="actionClass(true)"
                  :disabled="sendingMaterialsFollowUp || materialsFollowUpFields.length === 0 || hasActiveMaterialsFollowUp(previewArchiveItem.id)"
                  class="mt-4"
                  @click="sendMaterialsFollowUp(previewArchiveItem)"
                >
                  {{ sendingMaterialsFollowUp ? 'Sending…' : hasActiveMaterialsFollowUp(previewArchiveItem.id) ? 'Follow-up sent' : 'Email presenter' }}
                </button>
              </section>

              <aside v-if="previewArchiveItem?.status === 'published'" class="talk-preview-published-note">
                <p>Published archive record</p>
                <span>This record remains available here for organizers. The existing public archive is governed separately by the event’s published and completed state.</span>
                <a v-if="publicArchivePath" :href="publicArchivePath" target="_blank" rel="noopener noreferrer" class="talk-preview-inline-link">Open public archive ↗</a>
              </aside>
            </div>

            <footer class="talk-preview-drawer__footer">
              <template v-if="previewProposal">
                <p class="talk-preview-drawer__footer-label">Decision</p>
                <div class="flex flex-wrap gap-2">
                  <button
                    v-if="previewProposal.status !== 'selected'"
                    type="button"
                    :disabled="decidingSubmissionId === previewProposal.id"
                    :class="proposalActionClass(true)"
                    @click="decideSpeakerSubmission(previewProposal.id, 'selected')"
                  >
                    {{ decidingSubmissionId === previewProposal.id ? 'Saving...' : 'Select presenter' }}
                  </button>
                  <button
                    v-if="previewProposal.status !== 'not_selected'"
                    type="button"
                    :disabled="decidingSubmissionId === previewProposal.id"
                    :class="proposalActionClass()"
                    @click="decideSpeakerSubmission(previewProposal.id, 'not_selected')"
                  >
                    Not selected
                  </button>
                </div>
              </template>
              <template v-else-if="previewArchiveItem">
                <p class="talk-preview-drawer__footer-label">Archive action</p>
                <div class="flex flex-wrap gap-2">
                  <button
                    v-if="primaryTalkAction(previewArchiveItem)"
                    type="button"
                    :class="actionClass(true)"
                    :disabled="updatingTalkId === previewArchiveItem.id"
                    @click="setStatus(previewArchiveItem.id, primaryTalkAction(previewArchiveItem)!.status)"
                  >
                    {{ updatingTalkId === previewArchiveItem.id ? 'Saving...' : primaryTalkAction(previewArchiveItem)!.label }}
                  </button>
                  <button
                    v-if="previewArchiveItem.status !== 'rejected' && previewArchiveItem.status !== 'published'"
                    type="button"
                    :class="actionClass()"
                    :disabled="updatingTalkId === previewArchiveItem.id"
                    @click="setStatus(previewArchiveItem.id, 'rejected')"
                  >
                    Exclude
                  </button>
                  <button
                    v-if="previewArchiveItem.status === 'accepted' && !previewArchiveItem.slides_uploaded_at"
                    type="button"
                    :class="actionClass()"
                    :disabled="updatingTalkId === previewArchiveItem.id"
                    @click="sendReminder(previewArchiveItem.id)"
                  >
                    {{ archiveReminderLabel(previewArchiveItem) }}
                  </button>
                </div>
              </template>
            </footer>
          </aside>
        </div>
      </Transition>
    </Teleport>

    <ConfirmDialog
      :open="closeCfpDialogOpen"
      title="Close CFP?"
      message="This pauses the public presentation form for this event. Existing proposals stay in the inbox, and organizers can reopen the CFP later if needed."
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
