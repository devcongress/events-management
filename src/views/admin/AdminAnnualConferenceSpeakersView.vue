<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { useRoute } from 'vue-router';
import AnnualConferenceNav from '@/src/components/AnnualConferenceNav.vue';
import AnnualConferenceSpeakerDrawer from '@/src/components/AnnualConferenceSpeakerDrawer.vue';
import SpeakerOutcomePanel from '@/src/components/SpeakerOutcomePanel.vue';
import SpeakerUpdatesPanel from '@/src/components/SpeakerUpdatesPanel.vue';
import WorkspaceSectionNav from '@/src/components/WorkspaceSectionNav.vue';
import AppPagination from '@/src/components/AppPagination.vue';
import AppCopyButton from '@/src/components/ui/AppCopyButton.vue';
import AppDatePicker from '@/src/components/ui/AppDatePicker.vue';
import ConfirmDialog from '@/src/components/ui/ConfirmDialog.vue';
import BoneyardPageSkeleton from '@/src/components/ui/BoneyardPageSkeleton.vue';
import { ACTIVE_ANNUAL_CONFERENCE_EDITION } from '@/src/annual-conference';
import { ensureAdminShortLink, fetchJson, queryKeys } from '@/src/lib/api';
import { copyTextToClipboard } from '@/src/lib/clipboard';
import { notify } from '@/src/lib/notify';
import { downloadSpeakerBadgeZip } from '@/src/lib/speaker-badge';
import type { SpeakerSubmissionStatus } from '@/types';
import type { AnnualConferenceSpeakerSubmission } from '@/lib/annual-conference-speakers';

type ConferenceSubmission = AnnualConferenceSpeakerSubmission & {
  workspace_access?: 'active' | 'revoked' | 'unavailable';
  decision_email_status?: 'pending' | 'accepted' | 'delivered' | 'delayed' | 'failed' | 'bounced' | 'suppressed' | 'complained' | null;
  decision_email_recipient?: string | null;
  decision_email_last_attempt_at?: string | null;
  decision_email_delivered_at?: string | null;
  decision_email_last_error?: string | null;
  decision_email_attempt_count?: number;
  decision_email_retryable?: boolean;
  decision_email_next_retry_at?: string | null;
  logistics?: {
    slides_url: string | null;
    availability_confirmed: boolean | null;
    technical_requirements: string | null;
    accessibility_requirements: string | null;
    headshot_url: string | null;
    headshot_photo_available: boolean;
    social_handle: string | null;
    workshop_prerequisites: string | null;
    required_software_equipment: string | null;
    participants_need_laptops: boolean | null;
    preferred_workshop_capacity: number | null;
    updated_at: string | null;
  } | null;
};

type BadgeStorageUsage = {
  speaker_photo_count: number;
  speaker_photo_bytes: number;
  shared_bucket_bytes: number;
};

type ConferenceSpeakersResponse = {
  edition: { year: number; label: string; name: string };
  call: { open: boolean; public_path: string; logistics_deadline: string | null };
  permissions: { can_manage: boolean; can_send_email: boolean };
  email_delivery: { configured: boolean; workspace_links_configured: boolean };
  counts: Record<SpeakerSubmissionStatus, number>;
  submissions: ConferenceSubmission[];
};

const route = useRoute();
const queryClient = useQueryClient();
const year = computed(() => String(route.params.year ?? ACTIVE_ANNUAL_CONFERENCE_EDITION.year));
const publicLinkCopyState = ref<'idle' | 'copying' | 'copied'>('idle');
const closeCallConfirmationOpen = ref(false);
const compactHeader = ref(false);
const callControlsOpen = ref(true);
const deadlineInput = ref('');
const emailRecoveryClock = ref(Date.now());
const selectedSubmissionId = ref<string | null>(null);
const replacementSubmissionId = ref<string | null>(null);
const revokeWorkspaceSubmissionId = ref<string | null>(null);
const statusFilter = ref<'all' | 'submitted' | 'selected' | 'not_selected'>('submitted');
const page = ref(1);
const participationPage = ref(1);
const deliveryPage = ref(1);
const PAGE_SIZE = 6;

const speakersQuery = useQuery({
  queryKey: computed(() => ['annual-conference-speakers', year.value]),
  queryFn: () => fetchJson<ConferenceSpeakersResponse>(`/api/annual-conference/${year.value}/speakers`, { credentials: 'include' }),
  refetchInterval: (query) => query.state.data?.submissions.some((item) => (item.decision_email_status === 'pending' && Boolean(item.decision_email_queued_at)) || (item.decision_email_status === 'failed' && item.decision_email_retryable && item.decision_email_attempt_count < 5) || (['accepted', 'delayed'].includes(item.decision_email_status ?? '') && Boolean(item.decision_email_sent_at) && Date.now() - new Date(item.decision_email_sent_at!).getTime() < 24 * 60 * 60_000)) ? 30_000 : false,
  refetchIntervalInBackground: false,
});
const submissions = computed(() => speakersQuery.data.value?.submissions ?? []);
const counts = computed(() => submissions.value.reduce<Record<SpeakerSubmissionStatus, number>>((total, submission) => {
  total[submission.status] += 1;

  return total;
}, { submitted: 0, selected: 0, not_selected: 0, withdrawn: 0 }));
const visibleSubmissions = computed(() => submissions.value
  .filter((submission) => statusFilter.value === 'all' || submission.status === statusFilter.value));
const pageCount = computed(() => Math.max(1, Math.ceil(visibleSubmissions.value.length / PAGE_SIZE)));
const pageStart = computed(() => visibleSubmissions.value.length ? (page.value - 1) * PAGE_SIZE + 1 : 0);
const pageEnd = computed(() => Math.min(visibleSubmissions.value.length, page.value * PAGE_SIZE));
const paginatedSubmissions = computed(() => visibleSubmissions.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE));
const canManage = computed(() => speakersQuery.data.value?.permissions.can_manage === true);
const canSendEmail = computed(() => speakersQuery.data.value?.permissions.can_send_email === true);
const activeSection = computed(() => {
  const section = route.query.section;

  if (section === 'participation') return section;
  if ((section === 'outcome-messages' || section === 'delivery') && canSendEmail.value) return section;

  return 'proposals';
});
const messageView = computed(() => route.query.messageView === 'updates' ? 'updates' : 'outcomes');
const updatesVisited = ref(messageView.value === 'updates');

watch(messageView, (view) => { if (view === 'updates') updatesVisited.value = true; });
const messageLinks = computed(() => [
  { key: 'outcomes', label: 'Acceptance and rejection', to: { path: route.path, query: { ...route.query, section: 'outcome-messages', messageView: 'outcomes' }, hash: route.hash } },
  { key: 'updates', label: 'Speaker updates', to: { path: route.path, query: { ...route.query, section: 'outcome-messages', messageView: 'updates' }, hash: route.hash } },
]);
const badgeStorageQuery = useQuery({
  queryKey: computed(() => ['annual-conference-speaker-badge-storage', year.value]),
  queryFn: () => fetchJson<BadgeStorageUsage>(`/api/annual-conference/${year.value}/speakers/storage`, { credentials: 'include' }),
  enabled: computed(() => activeSection.value === 'participation' && year.value === '2026'),
  staleTime: 0,
  refetchOnWindowFocus: true,
  refetchInterval: 60_000,
  refetchIntervalInBackground: false,
  retry: false,
});

function formatStorageSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;

  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

const decidedSubmissions = computed(() => submissions.value.filter((item) => ['selected', 'not_selected'].includes(item.status)));
const acceptedSubmissions = computed(() => submissions.value.filter((item) => item.status === 'selected'));
const participationPageCount = computed(() => Math.max(1, Math.ceil(acceptedSubmissions.value.length / PAGE_SIZE)));
const participationPageStart = computed(() => acceptedSubmissions.value.length ? (participationPage.value - 1) * PAGE_SIZE + 1 : 0);
const participationPageEnd = computed(() => Math.min(acceptedSubmissions.value.length, participationPage.value * PAGE_SIZE));
const paginatedAcceptedSubmissions = computed(() => acceptedSubmissions.value.slice((participationPage.value - 1) * PAGE_SIZE, participationPage.value * PAGE_SIZE));
const deliveryPageCount = computed(() => Math.max(1, Math.ceil(decidedSubmissions.value.length / PAGE_SIZE)));
const deliveryPageStart = computed(() => decidedSubmissions.value.length ? (deliveryPage.value - 1) * PAGE_SIZE + 1 : 0);
const deliveryPageEnd = computed(() => Math.min(decidedSubmissions.value.length, deliveryPage.value * PAGE_SIZE));
const paginatedDecidedSubmissions = computed(() => decidedSubmissions.value.slice((deliveryPage.value - 1) * PAGE_SIZE, deliveryPage.value * PAGE_SIZE));
const sectionLinks = computed(() => [
  { key: 'proposals', label: 'Proposals', icon: 'proposals', to: { path: route.path, query: { ...route.query, section: 'proposals' }, hash: route.hash } },
  { key: 'participation', label: 'Participation', icon: 'participation', to: { path: route.path, query: { ...route.query, section: 'participation' }, hash: route.hash } },
  ...(canSendEmail.value ? [{ key: 'delivery', label: 'Delivery', icon: 'delivery', to: { path: route.path, query: { ...route.query, section: 'delivery' }, hash: route.hash } }, { key: 'outcome-messages', label: 'Outcome messages', icon: 'messages', to: { path: route.path, query: { ...route.query, section: 'outcome-messages' }, hash: route.hash } }] : []),
]);

watch(activeSection, () => {
  selectedSubmissionId.value = null;
  replacementSubmissionId.value = null;
  revokeWorkspaceSubmissionId.value = null;
  closeCallConfirmationOpen.value = false;
});
const approvalBlockedReason = computed(() => {
  const data = speakersQuery.data.value;

  if (!data) return 'Loading speaker settings.';
  if (!data.email_delivery.workspace_links_configured) return 'Configure speaker workspace link signing before accepting proposals.';
  if (!data.call.logistics_deadline) return 'Set a speaker logistics due date before accepting proposals.';

  return null;
});
const selectedSubmission = computed(() => submissions.value.find((submission) => submission.id === selectedSubmissionId.value) ?? null);
const canRecoverSelectedWorkspaceEmail = computed(() => {
  const submission = selectedSubmission.value;

  if (!submission || submission.status !== 'selected' || submission.workspace_access !== 'active' || !submission.logistics || ['accepted', 'delivered'].includes(submission.decision_email_status ?? '')) return false;
  if (!['pending', 'failed'].includes(submission.decision_email_status ?? '')) return false;
  if (submission.decision_email_status === 'failed'
    && submission.decision_email_retryable === false
    && submission.decision_email_last_error !== 'Automatic email retries were exhausted. Review the recipient and retry manually.') return false;
  if (submission.decision_email_status !== 'pending' || !submission.decision_email_last_attempt_at) return true;

  return new Date(submission.decision_email_last_attempt_at).getTime() <= emailRecoveryClock.value - 5 * 60 * 1000;
});
let emailRecoveryTimer: number | undefined;
let publicLinkCopyResetTimer: number | undefined;
let compactHeaderQuery: MediaQueryList | undefined;

function updateCompactHeader() {
  compactHeader.value = compactHeaderQuery?.matches ?? false;
  callControlsOpen.value = !compactHeader.value;
}

onMounted(() => {
  compactHeaderQuery = window.matchMedia('(max-height: 600px), (max-width: 767px)');
  updateCompactHeader();
  compactHeaderQuery.addEventListener('change', updateCompactHeader);
  emailRecoveryTimer = window.setInterval(() => { emailRecoveryClock.value = Date.now(); }, 30_000);
});
onUnmounted(() => {
  compactHeaderQuery?.removeEventListener('change', updateCompactHeader);
  if (emailRecoveryTimer) window.clearInterval(emailRecoveryTimer);
  if (publicLinkCopyResetTimer) window.clearTimeout(publicLinkCopyResetTimer);
});
const pendingCountLabel = computed(() => `${counts.value.submitted} pending proposal${counts.value.submitted === 1 ? '' : 's'}`);
const selectedStatusLabel = computed(() => ({
  all: 'proposals',
  submitted: 'submitted proposals',
  selected: 'selected proposals',
  not_selected: 'not-selected proposals',
})[statusFilter.value]);

watch(statusFilter, () => { page.value = 1; });
watch(pageCount, () => { page.value = Math.min(page.value, pageCount.value); });
watch(participationPageCount, () => { participationPage.value = Math.min(participationPage.value, participationPageCount.value); });
watch(deliveryPageCount, () => { deliveryPage.value = Math.min(deliveryPage.value, deliveryPageCount.value); });
watch(year, () => {
  page.value = 1;
  participationPage.value = 1;
  deliveryPage.value = 1;
});
watch(submissions, (next) => {
  if (selectedSubmissionId.value && !next.some((submission) => submission.id === selectedSubmissionId.value)) {
    selectedSubmissionId.value = null;
  }
});
watch(() => speakersQuery.data.value?.call.logistics_deadline, (deadline) => {
  deadlineInput.value = deadline ? toLocalDateTimeInput(deadline) : '';
}, { immediate: true });

const callMutation = useMutation({
  mutationFn: (open: boolean) => fetchJson<{ open: boolean }>(`/api/annual-conference/${year.value}/speakers/call`, {
    method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ open }),
  }),
  onSuccess: async (result) => {
    await speakersQuery.refetch();
    if (!result.open) closeCallConfirmationOpen.value = false;
    notify.success(result.open ? 'Conference Call for Speakers is open.' : 'Conference Call for Speakers is closed.');
  },
  onError: (error) => notify.error(error instanceof Error ? error.message : 'Unable to update the Call for Speakers.'),
});
const decisionMutation = useMutation({
  mutationFn: ({ id, status }: { id: string; status: 'selected' | 'not_selected' }) => fetchJson<{ decision_email: { status: 'pending' } }>(`/api/annual-conference/${year.value}/speaker-submissions/${id}`, {
    method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
  }),
  onSuccess: async (_result, variables) => {
    await queryClient.invalidateQueries({ queryKey: ['annual-conference-speakers', year.value] });
    if (variables.status === 'selected') statusFilter.value = 'selected';
    notify.success(variables.status === 'selected'
      ? 'Proposal accepted. Review and send the workspace email when ready.'
      : 'Proposal rejected. Review and send the decision email when ready.');
  },
  onError: (error) => notify.error(error instanceof Error ? error.message : 'Unable to update the proposal.'),
});
const deadlineMutation = useMutation({
  mutationFn: () => fetchJson<{ deadline: string | null }>(`/api/annual-conference/${year.value}/speakers/logistics-deadline`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deadline: deadlineInput.value ? new Date(deadlineInput.value).toISOString() : null }),
  }),
  onSuccess: async () => {
    await speakersQuery.refetch();
    notify.success('Speaker logistics deadline updated.');
  },
  onError: (error) => notify.error(error instanceof Error ? error.message : 'Unable to update the deadline.'),
});
const resendWorkspaceEmailMutation = useMutation({
  mutationFn: (submissionId: string) => fetchJson<{ decision_email: { status: 'accepted' | 'failed' } }>(`/api/annual-conference/${year.value}/speaker-submissions/${submissionId}/resend-workspace-email`, {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
  }),
  onSuccess: async (result) => {
    await queryClient.invalidateQueries({ queryKey: ['annual-conference-speakers', year.value] });
    notify.success(result.decision_email.status === 'accepted' ? 'The workspace email was accepted by the provider. Its private link is unchanged.' : 'The email provider did not accept the message.');
  },
  onError: (error) => notify.error(error instanceof Error ? error.message : 'Unable to resend the workspace email.'),
});
const retryDecisionEmailMutation = useMutation({
  mutationFn: (submissionId: string) => fetchJson<{ decision_email: { status: 'accepted' | 'failed' } }>(`/api/annual-conference/${year.value}/speaker-submissions/${submissionId}/resend-decision-email`, {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
  }),
  onSuccess: async (result) => {
    await queryClient.invalidateQueries({ queryKey: ['annual-conference-speakers', year.value] });
    notify.success(result.decision_email.status === 'accepted' ? 'The decision email was accepted by the provider.' : 'The decision email still needs attention.');
  },
  onError: (error) => notify.error(error instanceof Error ? error.message : 'Unable to retry the decision email.'),
});
const correctDecisionEmailMutation = useMutation({
  mutationFn: ({ submissionId, email }: { submissionId: string; email: string }) => fetchJson<{ decision_email: { status: 'pending' } }>(`/api/annual-conference/${year.value}/speaker-submissions/${submissionId}/decision-email-recipient`, {
    method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ speaker_email: email, confirmed: true }),
  }),
  onSuccess: async () => {
    await queryClient.invalidateQueries({ queryKey: ['annual-conference-speakers', year.value] });
    notify.success('Address saved. Preview the message before sending.');
  },
  onError: (error) => notify.error(error instanceof Error ? error.message : 'Unable to correct the delivery address.'),
});
const replaceWorkspaceEmailMutation = useMutation({
  mutationFn: (submissionId: string) => fetchJson<{ decision_email: { status: 'pending' } }>(`/api/annual-conference/${year.value}/speaker-submissions/${submissionId}/replace-workspace-email`, {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmed: true }),
  }),
  onSuccess: async () => {
    replacementSubmissionId.value = null;
    await queryClient.invalidateQueries({ queryKey: ['annual-conference-speakers', year.value] });
    notify.success('The old link was revoked. Preview the replacement message before sending.');
  },
  onError: (error) => notify.error(error instanceof Error ? error.message : 'Unable to replace the private link.'),
});

const revokeWorkspaceMutation = useMutation({
  mutationFn: (submissionId: string) => fetchJson<{ revoked: boolean }>(`/api/annual-conference/${year.value}/speaker-submissions/${submissionId}/revoke-workspace`, {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmed: true }),
  }),
  onSuccess: async () => {
    revokeWorkspaceSubmissionId.value = null;
    await queryClient.invalidateQueries({ queryKey: ['annual-conference-speakers', year.value] });
    notify.success('Speaker workspace access revoked.');
  },
  onError: (error) => notify.error(error instanceof Error ? error.message : 'Unable to revoke workspace access.'),
});

const downloadingBadges = ref(false);

async function downloadBadges() {
  const speakers = submissions.value.filter((item) => item.status === 'selected' && item.selected_session_id)
    .map((item) => ({ sessionId: item.selected_session_id!, name: item.speaker_name }));

  if (!speakers.length) return;
  downloadingBadges.value = true;
  try {
    await downloadSpeakerBadgeZip(Number(year.value), speakers);
  } catch (error) {
    notify.error(error instanceof Error ? error.message : 'Unable to download speaker badges.');
  } finally {
    downloadingBadges.value = false;
  }
}

async function workspaceLink(submission: ConferenceSubmission, action: 'open' | 'copy') {
  const opened = action === 'open' ? window.open('', '_blank') : null;

  try {
    const result = await fetchJson<{ url: string }>(`/api/annual-conference/${year.value}/speaker-submissions/${submission.id}/workspace-link`, { credentials: 'include' });

    if (action === 'open') {
      if (!opened) throw new Error('Allow pop-ups to open the workspace.');
      opened.opener = null;
      opened.location.href = result.url;
    } else {
      await copyTextToClipboard(result.url);
      notify.success('Private workspace link copied.');
    }
  } catch (error) {
    opened?.close();
    notify.error(error instanceof Error ? error.message : 'Unable to retrieve the workspace link.');
  }
}

async function copyPublicLink() {
  if (!speakersQuery.data.value?.call.open) return;
  publicLinkCopyState.value = 'copying';
  try {
    const shortLink = await ensureAdminShortLink({ destination: 'conference_cfp', conference_year: Number(year.value) });

    await copyTextToClipboard(shortLink.url);
    publicLinkCopyState.value = 'copied';
    if (publicLinkCopyResetTimer) window.clearTimeout(publicLinkCopyResetTimer);
    publicLinkCopyResetTimer = window.setTimeout(() => {
      publicLinkCopyState.value = 'idle';
      publicLinkCopyResetTimer = undefined;
    }, 1800);
  } catch (error) {
    publicLinkCopyState.value = 'idle';
    notify.error(error instanceof Error ? error.message : 'Unable to prepare the public link.');
  }
}

function toggleStatusFilter(status: Exclude<typeof statusFilter.value, 'all'>) {
  statusFilter.value = statusFilter.value === status ? 'all' : status;
}

function openProposal(submissionId: string) {
  selectedSubmissionId.value = submissionId;
}

function formatSubmittedAt(value: string): string {
  return new Intl.DateTimeFormat('en-GH', { day: 'numeric', month: 'short' }).format(new Date(value));
}

function deliveryLabel(submission: ConferenceSubmission): string {
  if (!['selected', 'not_selected'].includes(submission.status)) return 'No decision email';
  if (submission.decision_email_status === 'pending' && !submission.decision_email_attempt_count) return submission.decision_email_queued_at ? 'Queued' : 'Ready to preview';
  const labels: Record<string, string> = {
    pending: 'Sending', accepted: 'Accepted by provider', delivered: 'Delivered', delayed: 'Delivery delayed',
    failed: 'Needs attention', bounced: 'Bounced', suppressed: 'Suppressed', complained: 'Complaint',
  };

  return labels[submission.decision_email_status ?? ''] ?? 'Not sent';
}

const deliveryTime = new Intl.DateTimeFormat('en-GH', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Africa/Accra',
});

const deliveryMilestones = [
  { label: 'Queued', key: 'decision_email_queued_at' },
  { label: 'Last attempt', key: 'decision_email_last_attempt_at' },
  { label: 'Provider accepted', key: 'decision_email_sent_at' },
  { label: 'Delivered', key: 'decision_email_delivered_at' },
  { label: 'Retry eligible', key: 'decision_email_next_retry_at' },
] as const;

function milestoneTime(submission: ConferenceSubmission, key: typeof deliveryMilestones[number]['key']) {
  if (key === 'decision_email_next_retry_at' && !submission.decision_email_attempt_count) return null;

  return submission[key];
}

const deliveryColumns = computed(() => deliveryMilestones.filter(({ key }) =>
  decidedSubmissions.value.some((submission) => milestoneTime(submission, key))));
const hasDeliveryErrors = computed(() => decidedSubmissions.value.some((submission) => submission.decision_email_last_error));

const deliveryAttentionCount = computed(() => submissions.value.filter((item) => ['failed', 'bounced', 'suppressed', 'complained', 'delayed'].includes(item.decision_email_status ?? '')).length);

function mobileProposalStatusLabel(status: SpeakerSubmissionStatus): string {
  return { submitted: 'Pending', selected: 'Approved', not_selected: 'Rejected', withdrawn: 'Withdrawn' }[status];
}

function proposalStatusLabel(status: SpeakerSubmissionStatus): string {
  return status === 'not_selected' ? 'Not selected' : status;
}

function toLocalDateTimeInput(value: string): string {
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);

  return local.toISOString().slice(0, 16);
}
</script>

<template>
  <div class="editorial-page">
    <div class="editorial-wrap">
      <AnnualConferenceNav :show-page-heading="false" />

      <section v-if="speakersQuery.isError.value" class="editorial-panel border-dc-pink p-6">
        <p class="text-lg font-semibold">Conference speaker proposals are temporarily unavailable.</p>
        <button class="motion-press mt-4 rounded-md border-2 border-dc-ink bg-dc-yellow px-4 py-2 font-mono text-[11px] font-semibold uppercase" @click="speakersQuery.refetch()">Try again</button>
      </section>

      <BoneyardPageSkeleton v-else-if="speakersQuery.isLoading.value" name="annual-conference-speakers" label="conference speakers" layout="table" />

      <template v-else-if="speakersQuery.data.value">
        <div class="speakers-header">
          <section class="speakers-heading border-b-2 border-dc-ink pb-3">
            <div>
              <p class="editorial-eyebrow">{{ speakersQuery.data.value.edition.label }}</p>
              <h1 class="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">Call for Speakers</h1>
              <p class="mt-2 max-w-xl text-sm leading-6 text-dc-gray">Review proposals and manage the public call for {{ speakersQuery.data.value.edition.name }}.</p>
            </div>
          </section>
          <button v-if="compactHeader" type="button" class="speakers-controls-summary text-action" :aria-expanded="callControlsOpen" aria-controls="speaker-call-controls" @click="callControlsOpen = !callControlsOpen">Call controls and deadline <span aria-hidden="true">{{ callControlsOpen ? '−' : '+' }}</span></button>
          <div id="speaker-call-controls" v-show="callControlsOpen" class="speakers-controls">
            <div class="speakers-actions mt-2 flex flex-wrap gap-2">
              <a
                v-if="speakersQuery.data.value.call.open"
                :href="speakersQuery.data.value.call.public_path"
                target="_blank"
                rel="noopener noreferrer"
                class="motion-press inline-flex min-h-11 items-center gap-2 rounded-md border-2 border-dc-ink bg-dc-paper px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.1em]"
              >
                <svg viewBox="0 0 24 24" class="size-4 shrink-0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3h7v7M21 3l-9 9M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5" /></svg>
                Open form<span class="sr-only"> (opens in a new tab)</span>
              </a>
              <AppCopyButton :state="publicLinkCopyState" label="Copy public link" class="min-h-11 rounded-md border-2 border-dc-ink bg-dc-paper px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.1em]" :disabled="!speakersQuery.data.value.call.open" @click="copyPublicLink" />
              <button v-if="canManage" class="motion-press min-h-11 rounded-md border-2 border-dc-ink px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-white" :class="speakersQuery.data.value.call.open ? 'bg-red-600' : 'bg-dc-pink'" :disabled="callMutation.isPending.value" @click="speakersQuery.data.value.call.open ? closeCallConfirmationOpen = true : callMutation.mutate(true)">{{ speakersQuery.data.value.call.open ? 'Close call' : 'Open call' }}</button>
            </div>

            <section v-if="canManage" class="speakers-deadline mt-5 rounded-lg border border-dc-border bg-dc-paper-warm p-4">
              <div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <AppDatePicker
                  v-model="deadlineInput"
                  class="min-w-0"
                  label="Speaker logistics deadline"
                  mode="datetime"
                  density="field"
                  required
                />
                <button type="button" class="motion-press min-h-[50px] w-full rounded-md border-2 border-dc-ink bg-dc-yellow px-4 py-3 font-mono text-[11px] font-semibold uppercase sm:w-auto" :disabled="deadlineMutation.isPending.value || !deadlineInput" @click="deadlineMutation.mutate()">{{ deadlineMutation.isPending.value ? 'Saving…' : 'Save deadline' }}</button>
              </div>
              <p class="mt-2 text-xs leading-5 text-dc-gray">This is the due date for speaker logistics. Accepted speakers can still update their private workspace afterward.</p>
            </section>
          </div>

          <WorkspaceSectionNav class="speakers-section-nav" :active="activeSection" label="Speaker sections" :items="sectionLinks">
            <template #icon="{ item }">
              <svg viewBox="0 0 24 24" class="size-4 shrink-0" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path v-if="item.icon === 'proposals'" d="M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7" />
                <path v-else-if="item.icon === 'participation'" d="M16 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2M10.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM17 8h4M19 6v4" />
                <path v-else-if="item.icon === 'delivery'" d="M3 6h18v12H3zM3 7l9 6 9-6M16 20h5" />
                <path v-else d="M4 5h16v12H8l-4 3zM8 9h8M8 13h6" />
              </svg>
            </template>
          </WorkspaceSectionNav>
        </div>

        <section v-if="activeSection === 'participation'" class="speaker-list-panel mt-2 overflow-hidden">
          <div class="flex flex-wrap items-center justify-between gap-3 border-b border-dc-border p-5">
            <div><h2 class="text-lg font-bold">Accepted speakers</h2><p class="text-sm text-dc-gray">Availability and resources supplied in the speaker workspace.</p></div>
            <button v-if="year === '2026' && acceptedSubmissions.some((item) => item.selected_session_id)" type="button" class="editorial-action" :disabled="downloadingBadges" @click="downloadBadges">{{ downloadingBadges ? 'Preparing badges…' : 'Download speaker badges ZIP' }}</button>
          </div>
          <div v-if="year === '2026'" class="badge-storage border-b border-dc-border px-5 py-3 text-sm text-dc-gray" aria-live="polite">
            <div v-if="badgeStorageQuery.data.value" class="badge-storage__readout">
              <p><span class="font-semibold text-dc-ink">Speaker badge photos</span> · {{ badgeStorageQuery.data.value.speaker_photo_count }} {{ badgeStorageQuery.data.value.speaker_photo_count === 1 ? 'photo' : 'photos' }} · {{ formatStorageSize(badgeStorageQuery.data.value.speaker_photo_bytes) }}</p>
              <p><span class="font-semibold text-dc-ink">Shared photo storage</span> · {{ formatStorageSize(badgeStorageQuery.data.value.shared_bucket_bytes) }} <span>(includes badge photos, headshots, and retained uploads)</span></p>
            </div>
            <p v-if="badgeStorageQuery.isError.value" class="badge-storage__error">
              {{ badgeStorageQuery.data.value ? 'Could not refresh storage.' : 'Badge photo storage unavailable.' }}
              <button type="button" class="text-action font-semibold text-dc-pink underline" @click="badgeStorageQuery.refetch()">Try again</button>
            </p>
            <p v-else-if="!badgeStorageQuery.data.value">Loading badge photo storage…</p>
          </div>
          <p v-if="!acceptedSubmissions.length" class="p-5 text-sm text-dc-gray">No accepted speakers yet.</p>
          <div v-if="acceptedSubmissions.length" class="participation-header participation-grid" aria-hidden="true">
            <span>Speaker</span><span>Participation</span><span>Headshot</span><span>Socials</span><span></span>
          </div>
          <ul v-if="acceptedSubmissions.length" class="divide-y divide-dc-border">
            <li v-for="submission in paginatedAcceptedSubmissions" :key="submission.id">
              <button type="button" aria-haspopup="dialog" class="speaker-summary-row participation-grid min-h-11 w-full px-4 py-2 text-left focus-visible:outline focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-dc-pink" @click="openProposal(submission.id)">
                <strong class="participation-name min-w-0 break-words text-sm font-semibold">{{ submission.speaker_name }}</strong>
                <span class="participation-status"><span class="participation-mobile-label">Participation: </span>{{ submission.logistics?.availability_confirmed === true ? 'Confirmed' : submission.logistics?.availability_confirmed === false ? 'Not yet confirmed' : 'Awaiting response' }}</span>
                <span class="participation-status"><span class="participation-mobile-label">Headshot: </span>{{ submission.logistics?.headshot_photo_available ? 'Photo uploaded' : submission.logistics?.headshot_url?.trim() ? 'Link provided' : 'Missing' }}</span>
                <span class="participation-status"><span class="participation-mobile-label">Socials: </span>{{ submission.logistics?.social_handle?.trim() ? 'Provided' : 'Missing' }}</span>
                <span aria-hidden="true" class="speaker-summary-chevron text-lg leading-none text-dc-gray">›</span>
              </button>
            </li>
          </ul>
          <AppPagination v-model:page="participationPage" :page-count="participationPageCount" :total="acceptedSubmissions.length" :range-start="participationPageStart" :range-end="participationPageEnd" item-label="speakers" aria-label="Speaker participation pagination" />
        </section>

        <section v-if="activeSection === 'delivery' && canSendEmail" class="speaker-list-panel mt-2 overflow-hidden">
          <div class="flex flex-wrap items-center justify-between gap-3 border-b border-dc-border p-5">
            <div><h2 class="text-lg font-bold">Decision email delivery</h2><p class="text-sm text-dc-gray">Times are shown in Accra time. Open a row to correct the address or retry when available.</p></div>
            <button type="button" class="text-action text-sm font-semibold text-dc-pink underline" @click="speakersQuery.refetch()">Refresh delivery status</button>
          </div>
          <p v-if="!decidedSubmissions.length" class="p-5 text-sm text-dc-gray">No decisions to track yet.</p>
          <template v-else>
            <ul class="delivery-cards md:hidden" aria-label="Decision email deliveries">
              <li v-for="submission in paginatedDecidedSubmissions" :key="submission.id">
                <article class="delivery-card">
                  <button type="button" class="delivery-card__name" aria-haspopup="dialog" :aria-label="`Review delivery for ${submission.speaker_name}`" @click="openProposal(submission.id)">{{ submission.speaker_name }}</button>
                  <span class="delivery-card__email">{{ submission.decision_email_recipient ?? submission.speaker_email }}</span>
                  <dl class="delivery-card__details">
                    <div><dt>Status</dt><dd>{{ deliveryLabel(submission) }}</dd></div>
                    <div><dt>Attempts</dt><dd>{{ submission.decision_email_attempt_count ?? 0 }}</dd></div>
                    <div v-for="column in deliveryColumns" :key="column.key"><dt>{{ column.label }}</dt><dd>{{ milestoneTime(submission, column.key) ? deliveryTime.format(new Date(submission[column.key]!)) : '—' }}</dd></div>
                    <div v-if="submission.decision_email_last_error" class="delivery-card__error"><dt>Error</dt><dd>{{ submission.decision_email_last_error }}</dd></div>
                  </dl>
                </article>
              </li>
            </ul>
            <div class="hidden overflow-x-auto md:block">
            <table class="delivery-table w-full text-left text-sm">
              <caption class="sr-only">Decision email delivery, times in Accra</caption>
              <thead class="border-b border-dc-border text-xs text-dc-gray">
                <tr>
                  <th scope="col">Speaker</th>
                  <th scope="col">Recipient</th>
                  <th scope="col">Status</th>
                  <th scope="col" class="text-right">Attempts</th>
                  <th v-for="column in deliveryColumns" :key="column.key" scope="col">{{ column.label }}</th>
                  <th v-if="hasDeliveryErrors" scope="col">Error</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-dc-border">
                <tr v-for="submission in paginatedDecidedSubmissions" :key="submission.id" class="cursor-pointer" @click="openProposal(submission.id)">
                  <th scope="row">
                    <button type="button" aria-haspopup="dialog" class="min-h-11 font-semibold focus-visible:outline-dc-pink" :aria-label="`Review delivery for ${submission.speaker_name}`" @click.stop="openProposal(submission.id)">{{ submission.speaker_name }}</button>
                  </th>
                  <td>{{ submission.decision_email_recipient ?? submission.speaker_email }}</td>
                  <td>{{ deliveryLabel(submission) }}</td>
                  <td class="text-right tabular-nums">{{ submission.decision_email_attempt_count ?? 0 }}</td>
                  <td v-for="column in deliveryColumns" :key="column.key" class="tabular-nums">{{ milestoneTime(submission, column.key) ? deliveryTime.format(new Date(submission[column.key]!)) : '—' }}</td>
                  <td v-if="hasDeliveryErrors" class="text-red-700">{{ submission.decision_email_last_error || '—' }}</td>
                </tr>
              </tbody>
            </table>
            </div>
          </template>
          <AppPagination v-model:page="deliveryPage" :page-count="deliveryPageCount" :total="decidedSubmissions.length" :range-start="deliveryPageStart" :range-end="deliveryPageEnd" item-label="deliveries" aria-label="Speaker delivery pagination" />
        </section>

        <div v-if="canSendEmail" v-show="activeSection === 'outcome-messages'">
          <WorkspaceSectionNav class="mt-4" label="Speaker message type" :active="messageView" :items="messageLinks" />
          <SpeakerOutcomePanel v-show="messageView === 'outcomes'" class="speaker-outcome-panel" :year="year" :submissions="submissions" :configured="speakersQuery.data.value.email_delivery.configured" @sent="speakersQuery.refetch()" />
          <SpeakerUpdatesPanel v-if="updatesVisited" v-show="messageView === 'updates'" :year="year" :configured="speakersQuery.data.value.email_delivery.configured" :active="activeSection === 'outcome-messages' && messageView === 'updates'" />
        </div>

        <section v-show="activeSection === 'proposals'" class="speaker-queue speaker-list-panel mt-2 overflow-hidden" aria-live="polite">
          <div class="flex flex-wrap items-center justify-between gap-4 border-b border-dc-border px-5 py-4 sm:px-6">
            <div>
              <p class="editorial-eyebrow">Review queue</p>
              <p class="mt-1 text-lg font-semibold text-dc-gray">{{ pendingCountLabel }}</p>
              <p v-if="deliveryAttentionCount" class="mt-1 text-sm text-red-700">{{ deliveryAttentionCount }} decision email{{ deliveryAttentionCount === 1 ? ' needs' : 's need' }} attention. Open approved or rejected proposals to review delivery.</p>
            </div>
            <div class="flex flex-wrap items-center justify-end gap-2">
              <div class="speaker-queue-filters flex flex-wrap gap-2" role="group" aria-label="Filter proposals by status">
                <button type="button" class="motion-press relative min-h-11 rounded-md border-2 px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.1em]" :class="statusFilter === 'submitted' ? 'border-dc-ink bg-dc-yellow text-dc-ink shadow-[2px_2px_0_#111111]' : 'border-dc-border bg-dc-paper text-dc-gray'" :aria-pressed="statusFilter === 'submitted'" @click="toggleStatusFilter('submitted')">
                  Pending
                  <Transition name="submission-count">
                    <span v-if="counts.submitted" class="submission-filter-count" :class="counts.submitted > 99 ? 'text-[7px]' : 'text-[9px]'" :aria-label="`${counts.submitted} pending proposals`">{{ counts.submitted > 99 ? '99+' : counts.submitted }}</span>
                  </Transition>
                </button>
                <button type="button" class="motion-press min-h-11 rounded-md border-2 px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.1em]" :class="statusFilter === 'selected' ? 'border-dc-ink bg-dc-yellow text-dc-ink shadow-[2px_2px_0_#111111]' : 'border-dc-border bg-dc-paper text-dc-gray'" :aria-pressed="statusFilter === 'selected'" @click="toggleStatusFilter('selected')">Approved</button>
                <button type="button" class="motion-press min-h-11 rounded-md border-2 px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.1em]" :class="statusFilter === 'not_selected' ? 'border-dc-ink bg-dc-yellow text-dc-ink shadow-[2px_2px_0_#111111]' : 'border-dc-border bg-dc-paper text-dc-gray'" :aria-pressed="statusFilter === 'not_selected'" @click="toggleStatusFilter('not_selected')">Rejected</button>
              </div>
            </div>
          </div>

          <div v-if="visibleSubmissions.length === 0" class="p-6">
            <p class="text-sm text-dc-gray">No {{ selectedStatusLabel }} yet.</p>
          </div>
          <div v-else>
            <ul class="speaker-proposal-list" aria-label="Conference speaker proposals">
              <li v-for="submission in paginatedSubmissions" :key="submission.id">
                <button
                  type="button"
                  class="speaker-proposal-card motion-press"
                  @click="openProposal(submission.id)"
                >
                  <span class="speaker-proposal-card__title">{{ submission.title }}</span>
                  <span class="speaker-proposal-card__speaker">{{ submission.speaker_name }}</span>
                  <span class="speaker-proposal-card__metadata">
                    <span>{{ submission.session_type }}</span>
                    <span>Submitted {{ formatSubmittedAt(submission.created_at) }}</span>
                    <span v-if="submission.status !== 'submitted'">Email: {{ deliveryLabel(submission) }}</span>
                  </span>
                  <span class="speaker-proposal-card__footer">
                    <span class="speaker-proposal-card__status">{{ mobileProposalStatusLabel(submission.status) }}</span>
                    <span class="speaker-proposal-card__open" aria-hidden="true">View proposal <span>→</span></span>
                  </span>
                </button>
              </li>
            </ul>
            <div class="speaker-proposal-table overflow-x-auto">
              <table class="w-full min-w-[46rem] table-fixed border-collapse text-left">
                <caption class="sr-only">Conference speaker proposals</caption>
                <thead class="border-b border-dc-border bg-dc-paper font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-dc-pink">
                  <tr>
                    <th scope="col" class="w-[40%] px-4 py-3">Proposal</th>
                    <th scope="col" class="w-[20%] px-4 py-3">Speaker</th>
                    <th scope="col" class="w-[10%] px-4 py-3">Type</th>
                    <th scope="col" class="w-[11%] px-4 py-3">Submitted</th>
                    <th scope="col" class="w-[12%] px-4 py-3">Status</th>
                    <th scope="col" class="w-[7%] px-4 py-3 text-right"><span class="sr-only">Open proposal</span></th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-dc-border bg-white">
                  <tr v-for="submission in paginatedSubmissions" :key="submission.id" tabindex="0" class="h-14 cursor-pointer outline-none hover:bg-dc-paper-warm/40 focus-visible:bg-dc-paper-warm focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-dc-pink" :aria-label="`Open proposal: ${submission.title}`" @click="openProposal(submission.id)" @keydown.enter.prevent="openProposal(submission.id)" @keydown.space.prevent="openProposal(submission.id)">
                    <th scope="row" class="truncate px-5 py-2 text-sm font-semibold text-dc-ink sm:px-6" :title="submission.title">
                      {{ submission.title }}
                    </th>
                    <td class="truncate px-4 py-2 text-sm text-dc-gray" :title="`${submission.speaker_name} · ${submission.speaker_email}`">{{ submission.speaker_name }}</td>
                    <td class="px-4 py-2 font-mono text-[10px] font-semibold leading-4 text-dc-gray">{{ submission.session_type }}</td>
                    <td class="px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-dc-gray">{{ formatSubmittedAt(submission.created_at) }}</td>
                    <td class="px-4 py-2">
                      <span v-if="submission.status !== 'submitted'" class="mb-1 block text-xs text-dc-gray">{{ deliveryLabel(submission) }}</span>
                      <span class="inline-flex size-8 items-center justify-center rounded-md border" :class="submission.status === 'selected' ? 'border-[#86efac] text-[#15803d]' : submission.status === 'not_selected' ? 'border-[#fda4af] text-dc-pink' : 'border-dc-border text-dc-gray'" role="img" :aria-label="proposalStatusLabel(submission.status)" :title="proposalStatusLabel(submission.status)">
                        <svg v-if="submission.status === 'selected'" viewBox="0 0 24 24" fill="none" class="size-4" aria-hidden="true"><path d="m7.5 12.5 3 3 6-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
                        <svg v-else-if="submission.status === 'not_selected'" viewBox="0 0 24 24" fill="none" class="size-4" aria-hidden="true"><path d="m8.5 8.5 7 7m0-7-7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
                        <svg v-else viewBox="0 0 24 24" fill="none" class="size-4" aria-hidden="true"><circle cx="12" cy="12" r="7" stroke="currentColor" stroke-width="1.8" /><path d="M12 8.5v4l2.5 1.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
                      </span>
                    </td>
                    <td class="px-5 py-2 text-right sm:px-6">
                      <span aria-hidden="true" class="font-mono text-sm text-dc-gray">→</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <AppPagination v-model:page="page" :page-count="pageCount" :total="visibleSubmissions.length" :range-start="pageStart" :range-end="pageEnd" item-label="proposals" aria-label="Conference speaker proposal pagination" />
        </section>

        <AnnualConferenceSpeakerDrawer
          :year="year"
          :mode="activeSection === 'participation' || activeSection === 'delivery' ? activeSection : 'proposal'"
          :open="Boolean(selectedSubmission)"
          :submission="selectedSubmission"
          :can-manage="canManage"
          :can-send-email="canSendEmail"
          :submitting="decisionMutation.isPending.value || resendWorkspaceEmailMutation.isPending.value || retryDecisionEmailMutation.isPending.value || correctDecisionEmailMutation.isPending.value || replaceWorkspaceEmailMutation.isPending.value"
          :can-resend-workspace-email="canRecoverSelectedWorkspaceEmail"
          :approval-blocked-reason="approvalBlockedReason"
          :decision-email-configured="speakersQuery.data.value.email_delivery.configured"
          @close="selectedSubmissionId = null"
          @open-workspace="workspaceLink($event, 'open')"
          @copy-workspace="workspaceLink($event, 'copy')"
          @revoke-workspace="revokeWorkspaceSubmissionId = $event.id"
          @approve="decisionMutation.mutate({ id: $event.id, status: 'selected' })"
          @reject="decisionMutation.mutate({ id: $event.id, status: 'not_selected' })"
          @resend-workspace-email="resendWorkspaceEmailMutation.mutate($event.id)"
          @retry-decision-email="retryDecisionEmailMutation.mutate($event.id)"
          @correct-decision-email="(submission, email) => correctDecisionEmailMutation.mutate({ submissionId: submission.id, email })"
          @replace-workspace-email="replacementSubmissionId = $event.id"
        />

        <ConfirmDialog
          :open="closeCallConfirmationOpen"
          title="Close the Call for Speakers?"
          message="New conference proposals will stop immediately. Existing submissions remain available for review, and you can reopen the call later."
          confirm-label="Close call"
          busy-label="Closing…"
          cancel-label="Keep call open"
          :busy="callMutation.isPending.value"
          danger
          @cancel="closeCallConfirmationOpen = false"
          @confirm="callMutation.mutate(false)"
        />
        <ConfirmDialog
          :open="Boolean(revokeWorkspaceSubmissionId)"
          title="Revoke speaker workspace access?"
          message="The current private link will stop working immediately, including access to files and the speaker badge. No replacement link will be sent."
          confirm-label="Revoke access"
          busy-label="Revoking…"
          cancel-label="Keep access"
          :busy="revokeWorkspaceMutation.isPending.value"
          danger
          @cancel="revokeWorkspaceSubmissionId = null"
          @confirm="revokeWorkspaceSubmissionId && revokeWorkspaceMutation.mutate(revokeWorkspaceSubmissionId)"
        />
        <ConfirmDialog
          :open="Boolean(replacementSubmissionId)"
          title="Replace this private workspace link?"
          message="The current link will stop working immediately. Review and send the replacement message from Speaker outcome messages."
          confirm-label="Replace link"
          busy-label="Replacing…"
          cancel-label="Keep current link"
          :busy="replaceWorkspaceEmailMutation.isPending.value"
          danger
          @cancel="replacementSubmissionId = null"
          @confirm="replacementSubmissionId && replaceWorkspaceEmailMutation.mutate(replacementSubmissionId)"
        />
      </template>
    </div>
  </div>
</template>

<style scoped>
.badge-storage__readout {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 2rem;
}

.delivery-cards > li + li {
  border-top: 1px solid var(--dc-border, #dedbd3);
}

.delivery-card {
  display: grid;
  width: 100%;
  gap: 0.25rem;
  padding: 1rem;
  text-align: left;
}

.delivery-card__name {
  min-height: 44px;
  width: fit-content;
  text-align: left;
  font-weight: 700;
}

.delivery-card__name:focus-visible {
  outline: 2px solid #e8117f;
  outline-offset: 2px;
}

.delivery-card__email {
  color: #555;
  overflow-wrap: anywhere;
}

.delivery-card__details {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem 1rem;
  margin-top: 0.5rem;
  font-size: 0.875rem;
}

.delivery-card__details dt {
  color: #555;
}

.delivery-card__details dd {
  font-weight: 600;
  overflow-wrap: anywhere;
}

.delivery-card__error {
  grid-column: 1 / -1;
  color: #b91c1c;
}

.delivery-table :is(th, td) {
  padding-inline: 0.75rem;
  white-space: nowrap;
}

.delivery-table thead th {
  padding-block: 0.5rem;
  font-weight: 600;
}

@media (hover: hover) and (pointer: fine) {
  .delivery-table tbody tr:hover {
    background-color: #f7f7f7;
  }
}

.participation-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 0.7fr) 1rem;
  align-items: center;
  gap: 12px;
}

.participation-header {
  padding: 8px 16px;
  border-bottom: 1px solid var(--dc-border, #dedbd3);
  color: #555;
  font-size: 12px;
  font-weight: 600;
}

.participation-status {
  min-width: 0;
  color: #555;
  font-size: 14px;
}

.participation-mobile-label {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

@media (max-width: 767px) {
  .participation-header {
    display: none;
  }

  .participation-grid {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 2px 12px;
    padding-top: 10px;
    padding-bottom: 10px;
  }

  .participation-name, .participation-status {
    grid-column: 1;
  }

  .participation-mobile-label {
    position: static;
    width: auto;
    height: auto;
    overflow: visible;
    clip-path: none;
    white-space: normal;
    font-weight: 600;
  }

  .speaker-summary-chevron {
    grid-column: 2;
    grid-row: 1 / 5;
  }
}

.speaker-list-panel {
  border: 1px solid var(--dc-border, #dedbd3);
  border-radius: 8px;
  background: var(--dc-paper, #fff);
}

@media (hover: hover) and (pointer: fine) {
  .speaker-summary-row:hover:not(:focus-visible) {
    outline: none;
    background-color: #f7f7f7;
  }

  .speaker-summary-row:hover .speaker-summary-chevron {
    color: var(--color-dc-ink, #111111);
  }
}

:deep(.annual-conference-nav-shell) {
  position: relative;
  top: auto;
}

.speakers-header {
  position: sticky;
  top: var(--app-header-fixed-offset);
  z-index: 30;
  background: var(--surface-canvas, #f5f2e8);
  padding-bottom: 16px;
}

.speaker-outcome-panel {
  margin-top: 8px;
}

.speakers-controls-summary {
  min-height: 44px;
  padding: 10px 0;
  cursor: pointer;
  font-weight: 600;
}

.speakers-controls-summary:focus-visible {
  outline: 2px solid var(--dc-pink, #e8117f);
  outline-offset: 2px;
}

@media (max-width: 767px) {
  .speakers-header {
    display: contents;
  }

  .speakers-section-nav {
    position: sticky;
    top: var(--app-header-fixed-offset);
    z-index: 30;
    background: var(--surface-canvas, #f5f2e8);
  }
}

@media (min-width: 768px) {
  .speakers-header {
    top: var(--organizer-breadcrumb-height, 0px);
  }
}

@media (min-width: 1024px) and (min-height: 601px) {
  .speakers-header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .speakers-controls {
    display: contents;
  }

  .speakers-heading {
    grid-column: 1;
    grid-row: 1;
    padding-bottom: 1.5rem;
  }

  .speakers-actions {
    grid-column: 2;
    grid-row: 1;
    align-content: end;
    justify-content: end;
    border-bottom: 2px solid var(--dc-ink, #111);
    padding-bottom: 1.5rem;
  }

  .speakers-deadline,
  .workspace-section-nav {
    grid-column: 1 / -1;
  }
}

@media (min-width: 768px) and (hover: none) and (pointer: coarse) {
  .speakers-header {
    top: calc(var(--app-header-fixed-offset) + var(--organizer-breadcrumb-height, 0px));
  }
}

@media (max-height: 800px), (max-width: 767px) {
  .speakers-heading {
    gap: 0.5rem;
    padding-bottom: 0.5rem;
  }

  .speakers-heading h1 {
    margin-top: 0;
    font-size: 1.5rem;
    line-height: 1.2;
  }

  .speakers-heading p:not(.editorial-eyebrow),
  .speakers-deadline > p {
    display: none;
  }

  .speakers-deadline {
    margin-top: 0.5rem;
    padding: 0.5rem;
  }
}

.speaker-proposal-list {
  display: none;
}

@media (max-width: 767px) {
  .speakers-header {
    padding-bottom: 12px;
  }

  .speaker-proposal-table {
    display: none;
  }

  .speaker-proposal-list {
    display: block;
  }

  .speaker-proposal-list > li + li {
    border-top: 1px solid var(--dc-border, #dedbd3);
  }

  .speaker-proposal-card {
    display: flex;
    width: 100%;
    min-width: 0;
    flex-direction: column;
    gap: 8px;
    padding: 20px;
    text-align: left;
    overflow-wrap: anywhere;
    background: white;
  }

  .speaker-proposal-card:focus-visible {
    outline: 2px solid #ff0080;
    outline-offset: -4px;
  }

  .speaker-proposal-card__title {
    font-size: 16px;
    font-weight: 700;
    line-height: 1.5;
  }

  .speaker-proposal-card__speaker {
    font-size: 14px;
    line-height: 1.5;
    color: #555;
  }

  .speaker-proposal-card__metadata,
  .speaker-proposal-card__footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 16px;
    font-size: 12px;
    line-height: 1.5;
    color: #555;
  }

  .speaker-proposal-card__footer {
    justify-content: space-between;
    margin-top: 4px;
  }

  .speaker-proposal-card__status {
    border: 1px solid #dedbd3;
    border-radius: 6px;
    padding: 3px 8px;
  }

  .speaker-proposal-card__open {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
    color: #111;
  }

  .speaker-queue-filters button {
    min-height: 44px;
    padding-inline: 12px;
  }

  .speaker-list-panel :deep(.app-pagination) {
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    padding: 16px 20px;
  }

  .speaker-list-panel :deep(.app-pagination__count) {
    grid-column: 1 / -1;
    grid-row: 1;
  }

  .speaker-list-panel :deep(.app-pagination__button) {
    min-height: 44px;
    width: 100%;
    justify-content: center;
    padding-inline: 8px;
  }
}
</style>
