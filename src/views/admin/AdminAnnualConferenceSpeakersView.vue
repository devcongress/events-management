<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { useRoute } from 'vue-router';
import AnnualConferenceNav from '@/src/components/AnnualConferenceNav.vue';
import AnnualConferenceSpeakerDrawer from '@/src/components/AnnualConferenceSpeakerDrawer.vue';
import AppPagination from '@/src/components/AppPagination.vue';
import { ACTIVE_ANNUAL_CONFERENCE_EDITION } from '@/src/annual-conference';
import { ensureAdminShortLink, fetchJson, queryKeys } from '@/src/lib/api';
import { notify } from '@/src/lib/notify';
import type { SpeakerSubmissionStatus } from '@/types';
import type { AnnualConferenceSpeakerSubmission } from '@/lib/annual-conference-speakers';

type ConferenceSpeakersResponse = {
  edition: { year: number; label: string; name: string };
  call: { open: boolean; public_path: string };
  permissions: { can_manage: boolean };
  counts: Record<SpeakerSubmissionStatus, number>;
  submissions: AnnualConferenceSpeakerSubmission[];
};

const route = useRoute();
const queryClient = useQueryClient();
const year = computed(() => String(route.params.year ?? ACTIVE_ANNUAL_CONFERENCE_EDITION.year));
const copied = ref(false);
const issuedPresenterLink = ref<{ submissionId: string; url: string } | null>(null);
const selectedSubmissionId = ref<string | null>(null);
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
const selectedSubmission = computed(() => submissions.value.find((submission) => submission.id === selectedSubmissionId.value) ?? null);
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

const callMutation = useMutation({
  mutationFn: (open: boolean) => fetchJson<{ open: boolean }>(`/api/annual-conference/${year.value}/speakers/call`, {
    method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ open }),
  }),
  onSuccess: async (result) => {
    await speakersQuery.refetch();
    notify.success(result.open ? 'Conference Call for Speakers is open.' : 'Conference Call for Speakers is closed.');
  },
  onError: (error) => notify.error(error instanceof Error ? error.message : 'Unable to update the Call for Speakers.'),
});
const decisionMutation = useMutation({
  mutationFn: ({ id, status }: { id: string; status: 'selected' | 'not_selected' }) => fetchJson<{ token: string | null }>(`/api/annual-conference/${year.value}/speaker-submissions/${id}`, {
    method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
  }),
  onSuccess: async (result, variables) => {
    await queryClient.invalidateQueries({ queryKey: ['annual-conference-speakers', year.value] });
    if (variables.status === 'selected' && result.token) {
      issuedPresenterLink.value = {
        submissionId: variables.id,
        url: new URL(`/conference-speakers/${year.value}/${result.token}`, window.location.origin).toString(),
      };
      statusFilter.value = 'selected';
    }
    notify.success(variables.status === 'selected' ? 'Presenter selected and follow-up link prepared.' : 'Proposal marked as not selected.');
  },
  onError: (error) => notify.error(error instanceof Error ? error.message : 'Unable to update the proposal.'),
});

async function copyPublicLink() {
  if (!speakersQuery.data.value?.call.open) return;
  try {
    const shortLink = await ensureAdminShortLink({ destination: 'conference_cfp', conference_year: Number(year.value) });
    await navigator.clipboard?.writeText(shortLink.url);
    copied.value = true;
    window.setTimeout(() => { copied.value = false; }, 1800);
  } catch (error) {
    notify.error(error instanceof Error ? error.message : 'Unable to prepare the public link.');
  }
}

async function copyPresenterLink() {
  if (!issuedPresenterLink.value) return;
  await navigator.clipboard?.writeText(issuedPresenterLink.value.url);
  notify.success('Private presenter link copied.');
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
            <button class="motion-press rounded-md border-2 border-dc-ink bg-dc-paper px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.1em]" @click="copyPublicLink">{{ copied ? 'Copied' : 'Copy public link' }}</button>
            <button v-if="canManage" class="motion-press rounded-md border-2 border-dc-ink px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.1em]" :class="speakersQuery.data.value.call.open ? 'bg-dc-paper text-dc-ink' : 'bg-dc-pink text-white'" :disabled="callMutation.isPending.value" @click="callMutation.mutate(!speakersQuery.data.value.call.open)">{{ speakersQuery.data.value.call.open ? 'Close call' : 'Open call' }}</button>
          </div>
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
                  <td class="px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-dc-gray">{{ submission.kind === 'product_demo' ? 'Demo' : 'Talk' }}</td>
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
          :submitting="decisionMutation.isPending.value"
          :can-copy-presenter-link="issuedPresenterLink?.submissionId === selectedSubmission?.id"
          @close="selectedSubmissionId = null"
          @approve="decisionMutation.mutate({ id: $event.id, status: 'selected' })"
          @reject="decisionMutation.mutate({ id: $event.id, status: 'not_selected' })"
          @copy-presenter-link="copyPresenterLink"
        />
      </template>
    </div>
  </div>
</template>
