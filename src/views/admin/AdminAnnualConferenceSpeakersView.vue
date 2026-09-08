<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { useRoute } from 'vue-router';
import AnnualConferenceNav from '@/src/components/AnnualConferenceNav.vue';
import AnnualConferenceSpeakerDrawer from '@/src/components/AnnualConferenceSpeakerDrawer.vue';
import AppPagination from '@/src/components/AppPagination.vue';
import AppCopyButton from '@/src/components/ui/AppCopyButton.vue';
import AppDatePicker from '@/src/components/ui/AppDatePicker.vue';
import ConfirmDialog from '@/src/components/ui/ConfirmDialog.vue';
import { ACTIVE_ANNUAL_CONFERENCE_EDITION } from '@/src/annual-conference';
import { ensureAdminShortLink, fetchJson, queryKeys } from '@/src/lib/api';
import { copyTextToClipboard } from '@/src/lib/clipboard';
import { notify } from '@/src/lib/notify';
import type { SpeakerSubmissionStatus } from '@/types';
import type { AnnualConferenceSpeakerSubmission } from '@/lib/annual-conference-speakers';

type ConferenceSubmission = AnnualConferenceSpeakerSubmission & {
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

type ConferenceSpeakersResponse = {
  edition: { year: number; label: string; name: string };
  call: { open: boolean; public_path: string; logistics_deadline: string | null };
  permissions: { can_manage: boolean };
  email_delivery: { configured: boolean; workspace_links_configured: boolean };
  counts: Record<SpeakerSubmissionStatus, number>;
  submissions: ConferenceSubmission[];
};

const route = useRoute();
const queryClient = useQueryClient();
const year = computed(() => String(route.params.year ?? ACTIVE_ANNUAL_CONFERENCE_EDITION.year));
const publicLinkCopyState = ref<'idle' | 'copying' | 'copied'>('idle');
const closeCallConfirmationOpen = ref(false);
const deadlineInput = ref('');
const emailRecoveryClock = ref(Date.now());
const selectedSubmissionId = ref<string | null>(null);
const replacementSubmissionId = ref<string | null>(null);
const statusFilter = ref<'all' | 'submitted' | 'selected' | 'not_selected'>('submitted');
const page = ref(1);
const PAGE_SIZE = 6;

const speakersQuery = useQuery({
  queryKey: computed(() => ['annual-conference-speakers', year.value]),
  queryFn: () => fetchJson<ConferenceSpeakersResponse>(`/api/annual-conference/${year.value}/speakers`, { credentials: 'include' }),
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
const approvalBlockedReason = computed(() => {
  const data = speakersQuery.data.value;
  if (!data?.email_delivery.configured) return 'Configure speaker decision email before accepting or rejecting proposals.';
  if (!data.email_delivery.workspace_links_configured) return 'Configure speaker workspace link signing before accepting proposals.';
  if (!data.call.logistics_deadline || new Date(data.call.logistics_deadline).getTime() <= Date.now()) return 'Set a future speaker logistics deadline before accepting proposals.';
  return null;
});
const selectedSubmission = computed(() => submissions.value.find((submission) => submission.id === selectedSubmissionId.value) ?? null);
const canRecoverSelectedWorkspaceEmail = computed(() => {
  const submission = selectedSubmission.value;
  if (!submission || submission.status !== 'selected' || !submission.logistics || ['accepted', 'delivered'].includes(submission.decision_email_status ?? '')) return false;
  if (!['pending', 'failed'].includes(submission.decision_email_status ?? '')) return false;
  if (submission.decision_email_status === 'failed'
    && submission.decision_email_retryable === false
    && submission.decision_email_last_error !== 'Automatic email retries were exhausted. Review the recipient and retry manually.') return false;
  if (submission.decision_email_status !== 'pending' || !submission.decision_email_last_attempt_at) return true;
  return new Date(submission.decision_email_last_attempt_at).getTime() <= emailRecoveryClock.value - 5 * 60 * 1000;
});
let emailRecoveryTimer: number | undefined;
let publicLinkCopyResetTimer: number | undefined;
onMounted(() => {
  emailRecoveryTimer = window.setInterval(() => { emailRecoveryClock.value = Date.now(); }, 30_000);
});
onUnmounted(() => {
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
  mutationFn: ({ id, status }: { id: string; status: 'selected' | 'not_selected' }) => fetchJson<{ decision_email: { status: 'accepted' | 'failed' | null } }>(`/api/annual-conference/${year.value}/speaker-submissions/${id}`, {
    method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
  }),
  onSuccess: async (result, variables) => {
    await queryClient.invalidateQueries({ queryKey: ['annual-conference-speakers', year.value] });
    if (variables.status === 'selected') statusFilter.value = 'selected';
    notify.success(variables.status === 'selected'
      ? result.decision_email.status === 'accepted'
        ? 'Proposal accepted and the private workspace was emailed to the speaker.'
        : 'Proposal accepted, but the workspace email needs attention.'
      : result.decision_email.status === 'accepted'
        ? 'Proposal rejected and the decision email was sent.'
        : 'Proposal rejected, but the decision email needs attention.');
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
    notify.success(result.decision_email.status === 'accepted' ? 'The private workspace email was retried without changing its link.' : 'The email provider still did not accept the message.');
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
  mutationFn: ({ submissionId, email }: { submissionId: string; email: string }) => fetchJson<{ decision_email: { status: 'accepted' | 'failed' } }>(`/api/annual-conference/${year.value}/speaker-submissions/${submissionId}/decision-email-recipient`, {
    method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ speaker_email: email, confirmed: true }),
  }),
  onSuccess: async (result) => {
    await queryClient.invalidateQueries({ queryKey: ['annual-conference-speakers', year.value] });
    notify.success(result.decision_email.status === 'accepted' ? 'The corrected address was saved and emailed.' : 'The address was saved, but delivery still needs attention.');
  },
  onError: (error) => notify.error(error instanceof Error ? error.message : 'Unable to correct the delivery address.'),
});
const replaceWorkspaceEmailMutation = useMutation({
  mutationFn: (submissionId: string) => fetchJson<{ decision_email: { status: 'accepted' | 'failed' } }>(`/api/annual-conference/${year.value}/speaker-submissions/${submissionId}/replace-workspace-email`, {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmed: true }),
  }),
  onSuccess: async (result) => {
    replacementSubmissionId.value = null;
    await queryClient.invalidateQueries({ queryKey: ['annual-conference-speakers', year.value] });
    notify.success(result.decision_email.status === 'accepted' ? 'The old link was revoked and a replacement was emailed.' : 'The old link was revoked, but the replacement email needs attention.');
  },
  onError: (error) => notify.error(error instanceof Error ? error.message : 'Unable to replace the private link.'),
});

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

      <template v-else-if="speakersQuery.data.value">
        <section class="grid gap-4 border-b-2 border-dc-ink pb-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p class="editorial-eyebrow">{{ speakersQuery.data.value.edition.label }}</p>
            <h1 class="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">Call for Speakers</h1>
            <p class="mt-2 max-w-xl text-sm leading-6 text-dc-gray">Review proposals and manage the public call for {{ speakersQuery.data.value.edition.name }}.</p>
          </div>
          <div class="flex flex-wrap gap-2 lg:justify-end">
            <a
              v-if="speakersQuery.data.value.call.open"
              :href="speakersQuery.data.value.call.public_path"
              target="_blank"
              rel="noopener noreferrer"
              class="motion-press inline-flex min-h-10 items-center gap-2 rounded-md border-2 border-dc-ink bg-dc-paper px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.1em]"
            >
              <svg viewBox="0 0 24 24" class="size-4 shrink-0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3h7v7M21 3l-9 9M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5" /></svg>
              Open form<span class="sr-only"> (opens in a new tab)</span>
            </a>
            <AppCopyButton :state="publicLinkCopyState" label="Copy public link" class="min-h-10 rounded-md border-2 border-dc-ink bg-dc-paper px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.1em]" :disabled="!speakersQuery.data.value.call.open" @click="copyPublicLink" />
            <button v-if="canManage" class="motion-press min-h-10 rounded-md border-2 border-dc-ink px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-white" :class="speakersQuery.data.value.call.open ? 'bg-red-600' : 'bg-dc-pink'" :disabled="callMutation.isPending.value" @click="speakersQuery.data.value.call.open ? closeCallConfirmationOpen = true : callMutation.mutate(true)">{{ speakersQuery.data.value.call.open ? 'Close call' : 'Open call' }}</button>
          </div>
        </section>

        <section v-if="canManage" class="mt-5 rounded-lg border border-dc-border bg-dc-paper-warm p-4">
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
          <p class="mt-2 text-xs leading-5 text-dc-gray">Accepted speakers can save and revise their private workspace until this deadline.</p>
        </section>

        <section class="editorial-panel mt-6 overflow-hidden" aria-live="polite">
          <div class="flex flex-wrap items-center justify-between gap-4 border-b border-dc-border px-5 py-4 sm:px-6">
            <div>
              <p class="editorial-eyebrow">Review queue</p>
              <p class="mt-1 text-lg font-semibold text-dc-gray">{{ pendingCountLabel }}</p>
            </div>
            <div class="flex flex-wrap items-center justify-end gap-2">
              <div class="flex flex-wrap gap-2" role="group" aria-label="Filter proposals by status">
                <button type="button" class="motion-press relative min-h-10 rounded-md border-2 px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.1em]" :class="statusFilter === 'submitted' ? 'border-dc-ink bg-dc-yellow text-dc-ink shadow-[2px_2px_0_#111111]' : 'border-dc-border bg-dc-paper text-dc-gray'" :aria-pressed="statusFilter === 'submitted'" @click="toggleStatusFilter('submitted')">
                  Pending
                  <Transition name="submission-count">
                    <span v-if="counts.submitted" class="submission-filter-count" :class="counts.submitted > 99 ? 'text-[7px]' : 'text-[9px]'" :aria-label="`${counts.submitted} pending proposals`">{{ counts.submitted > 99 ? '99+' : counts.submitted }}</span>
                  </Transition>
                </button>
                <button type="button" class="motion-press min-h-10 rounded-md border-2 px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.1em]" :class="statusFilter === 'selected' ? 'border-dc-ink bg-dc-yellow text-dc-ink shadow-[2px_2px_0_#111111]' : 'border-dc-border bg-dc-paper text-dc-gray'" :aria-pressed="statusFilter === 'selected'" @click="toggleStatusFilter('selected')">Approved</button>
                <button type="button" class="motion-press min-h-10 rounded-md border-2 px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.1em]" :class="statusFilter === 'not_selected' ? 'border-dc-ink bg-dc-yellow text-dc-ink shadow-[2px_2px_0_#111111]' : 'border-dc-border bg-dc-paper text-dc-gray'" :aria-pressed="statusFilter === 'not_selected'" @click="toggleStatusFilter('not_selected')">Rejected</button>
              </div>
            </div>
          </div>

          <div v-if="visibleSubmissions.length === 0" class="p-6">
            <p class="text-sm text-dc-gray">No {{ selectedStatusLabel }} yet.</p>
          </div>
          <div v-else class="overflow-x-auto">
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
          <AppPagination v-model:page="page" :page-count="pageCount" :total="visibleSubmissions.length" :range-start="pageStart" :range-end="pageEnd" item-label="proposals" aria-label="Conference speaker proposal pagination" />
        </section>

        <AnnualConferenceSpeakerDrawer
          :open="Boolean(selectedSubmission)"
          :submission="selectedSubmission"
          :can-manage="canManage"
          :submitting="decisionMutation.isPending.value || resendWorkspaceEmailMutation.isPending.value || retryDecisionEmailMutation.isPending.value || correctDecisionEmailMutation.isPending.value || replaceWorkspaceEmailMutation.isPending.value"
          :can-resend-workspace-email="canRecoverSelectedWorkspaceEmail"
          :approval-blocked-reason="approvalBlockedReason"
          :decision-email-configured="speakersQuery.data.value.email_delivery.configured"
          @close="selectedSubmissionId = null"
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
          :open="Boolean(replacementSubmissionId)"
          title="Replace this private workspace link?"
          message="The current link will stop working immediately. A new private link will be emailed to the saved delivery address."
          confirm-label="Replace and email"
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
