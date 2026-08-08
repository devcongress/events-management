<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { useRoute, useRouter } from 'vue-router';
import AnnualConferenceNav from '@/src/components/AnnualConferenceNav.vue';
import AppPagination from '@/src/components/AppPagination.vue';
import { ACTIVE_ANNUAL_CONFERENCE_EDITION } from '@/src/annual-conference';
import { fetchJson, queryKeys } from '@/src/lib/api';
import { notify } from '@/src/lib/notify';
import type { SpeakerSubmission, SpeakerSubmissionStatus } from '@/types';

type ConferenceSpeakersResponse = {
  edition: { year: number; label: string; name: string };
  call: { open: boolean; public_path: string };
  permissions: { can_manage: boolean };
  counts: Record<SpeakerSubmissionStatus, number>;
  submissions: SpeakerSubmission[];
};

const route = useRoute();
const router = useRouter();
const queryClient = useQueryClient();
const year = computed(() => String(route.params.year ?? ACTIVE_ANNUAL_CONFERENCE_EDITION.year));
const copied = ref(false);
const issuedPresenterLink = ref<{ submissionId: string; url: string } | null>(null);
const statusFilter = ref<'all' | 'submitted' | 'selected' | 'not_selected'>('all');
const page = ref(1);
const PAGE_SIZE = 6;
const SAMPLE_EVENT_ID = 'sample-annual-conference-2026';

function sampleSubmission(
  id: string,
  status: Extract<SpeakerSubmissionStatus, 'submitted' | 'selected' | 'not_selected'>,
  speakerName: string,
  title: string,
  topic: string,
  abstract: string,
  day: number,
  kind: NonNullable<SpeakerSubmission['kind']> = 'talk',
): SpeakerSubmission {
  const createdAt = `2026-08-${String(day).padStart(2, '0')}T10:00:00.000Z`;
  return {
    id: `sample-${id}`,
    event_id: SAMPLE_EVENT_ID,
    kind,
    speaker_name: speakerName,
    speaker_email: `${id}@example.dev`,
    github_username: id.replace(/-/g, ''),
    title,
    topic,
    abstract,
    bio: null,
    status,
    internal_note: null,
    selected_intake_link_id: null,
    selected_talk_id: null,
    decided_at: status === 'submitted' ? null : `2026-08-${String(day + 1).padStart(2, '0')}T12:00:00.000Z`,
    created_at: createdAt,
    updated_at: createdAt,
  };
}

const SAMPLE_SUBMISSIONS: SpeakerSubmission[] = [
  sampleSubmission('ama-boateng', 'submitted', 'Ama Boateng', 'Designing resilient payments for African markets', 'Fintech', 'A practical look at reliable payments, retries, and trust in systems that have to work on imperfect networks.', 8),
  sampleSubmission('kojo-mensah', 'submitted', 'Kojo Mensah', 'From idea to useful developer tool in a weekend', 'Product', 'The decisions that turn a hack into something people can actually use, support, and share.', 7, 'product_demo'),
  sampleSubmission('efua-asante', 'submitted', 'Efua Asante', 'What accessibility looks like beyond a checklist', 'Frontend', 'How product teams can make inclusive interaction decisions before the final QA pass.', 6),
  sampleSubmission('yaw-owusu', 'submitted', 'Yaw Owusu', 'A pragmatic path to event-driven systems', 'Backend', 'Choosing events, queues, and boundaries without overbuilding the first version of a distributed system.', 5),
  sampleSubmission('mabel-antwi', 'submitted', 'Mabel Antwi', 'Finding the story hidden in product analytics', 'Data', 'A hands-on walkthrough of the metrics that help teams make better decisions and the vanity metrics to ignore.', 4),
  sampleSubmission('david-osei', 'submitted', 'David Osei', 'Shipping security improvements without slowing the team', 'Security', 'A playbook for small, repeatable security controls that developers can keep using.', 3),
  sampleSubmission('abena-gyasi', 'submitted', 'Abena Gyasi', 'Building community infrastructure people return to', 'Community', 'Lessons from designing participation loops for real communities rather than just launching a portal.', 2),
  sampleSubmission('kwame-amoako', 'selected', 'Kwame Amoako', 'The case for boring deployment pipelines', 'DevOps', 'Why predictable releases, measured rollbacks, and tiny operational habits beat elaborate release theatre.', 14),
  sampleSubmission('sena-kumah', 'selected', 'Sena Kumah', 'AI features with an honest user contract', 'AI', 'How to make AI-powered experiences useful, legible, and safe when the output is uncertain.', 12),
  sampleSubmission('nana-serwaa', 'selected', 'Nana Serwaa', 'A design system is a team agreement', 'Design', 'The practices that make a design system easier to adopt than to bypass.', 11),
  sampleSubmission('kofi-adjei', 'not_selected', 'Kofi Adjei', 'My first Kubernetes cluster', 'Cloud', 'A personal introduction to deploying a first application cluster.', 16),
  sampleSubmission('evelyn-arkoh', 'not_selected', 'Evelyn Arkoh', 'Coding with confidence', 'Career', 'A broad talk about improving confidence while learning to code.', 15),
  sampleSubmission('samuel-danso', 'not_selected', 'Samuel Danso', 'Introduction to TypeScript', 'Frontend', 'A beginner-friendly overview of TypeScript syntax and types.', 13),
];

const speakersQuery = useQuery({
  queryKey: computed(() => ['annual-conference-speakers', year.value]),
  queryFn: () => fetchJson<ConferenceSpeakersResponse>(`/api/annual-conference/${year.value}/speakers`, { credentials: 'include' }),
});
const isSamplePreview = computed(() => route.query.preview === 'sample');
const submissions = computed(() => isSamplePreview.value ? SAMPLE_SUBMISSIONS : (speakersQuery.data.value?.submissions ?? []));
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
const canManage = computed(() => !isSamplePreview.value && speakersQuery.data.value?.permissions.can_manage === true);
const selectedStatusLabel = computed(() => ({
  all: 'proposals',
  submitted: 'submitted proposals',
  selected: 'selected proposals',
  not_selected: 'not-selected proposals',
})[statusFilter.value]);

watch(statusFilter, () => { page.value = 1; });
watch(pageCount, () => { page.value = Math.min(page.value, pageCount.value); });
watch(isSamplePreview, () => {
  page.value = 1;
  statusFilter.value = 'all';
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
  mutationFn: ({ id, eventId, status }: { id: string; eventId: string; status: 'selected' | 'not_selected' }) => fetchJson<{ token: string | null }>(`/api/speaker-submissions/${id}`, {
    method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
  }),
  onSuccess: async (result, variables) => {
    await queryClient.invalidateQueries({ queryKey: ['annual-conference-speakers', year.value] });
    if (variables.status === 'selected' && result.token) {
      issuedPresenterLink.value = {
        submissionId: variables.id,
        url: new URL(`/speaker-talks/${variables.eventId}/${result.token}`, window.location.origin).toString(),
      };
      statusFilter.value = 'selected';
    }
    notify.success(variables.status === 'selected' ? 'Presenter selected and follow-up link prepared.' : 'Proposal marked as not selected.');
  },
  onError: (error) => notify.error(error instanceof Error ? error.message : 'Unable to update the proposal.'),
});

async function copyPublicLink() {
  const path = speakersQuery.data.value?.call.public_path;
  if (!path) return;
  await navigator.clipboard?.writeText(new URL(path, window.location.origin).toString());
  copied.value = true;
  window.setTimeout(() => { copied.value = false; }, 1800);
}

async function copyPresenterLink() {
  if (!issuedPresenterLink.value) return;
  await navigator.clipboard?.writeText(issuedPresenterLink.value.url);
  notify.success('Private presenter link copied.');
}

function setSamplePreview(enabled: boolean) {
  const query = { ...route.query };
  if (enabled) query.preview = 'sample';
  else delete query.preview;
  void router.replace({ query });
}

function toggleStatusFilter(status: Exclude<typeof statusFilter.value, 'all'>) {
  statusFilter.value = statusFilter.value === status ? 'all' : status;
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
              <p class="editorial-eyebrow">Speakers</p>
              <h2 class="mt-1 text-lg font-semibold text-dc-ink">Proposal directory</h2>
              <p class="mt-0.5 text-xs text-dc-gray">Review every conference proposal in one list.</p>
            </div>
            <div class="flex flex-wrap items-center justify-end gap-2">
              <div class="flex overflow-hidden rounded-md border border-dc-border bg-dc-paper-warm text-xs" role="group" aria-label="Filter proposals by status">
                <button type="button" class="motion-press flex items-center gap-2 px-3 py-2 text-left" :class="statusFilter === 'submitted' ? 'bg-dc-paper text-dc-ink' : 'text-dc-gray'" :aria-pressed="statusFilter === 'submitted'" title="Show submitted proposals" @click="toggleStatusFilter('submitted')">
                  <span class="h-1.5 w-1.5 rounded-full bg-dc-pink" aria-hidden="true" />
                  <span>Submitted</span>
                  <span class="font-semibold">{{ counts.submitted }}</span>
                </button>
                <button type="button" class="motion-press flex items-center gap-2 border-l border-dc-border px-3 py-2 text-left" :class="statusFilter === 'selected' ? 'bg-dc-paper text-dc-ink' : 'text-dc-gray'" :aria-pressed="statusFilter === 'selected'" title="Show selected proposals" @click="toggleStatusFilter('selected')">
                  <span class="h-1.5 w-1.5 rounded-full bg-dc-success" aria-hidden="true" />
                  <span>Selected</span>
                  <span class="font-semibold">{{ counts.selected }}</span>
                </button>
                <button type="button" class="motion-press flex items-center gap-2 border-l border-dc-border px-3 py-2 text-left" :class="statusFilter === 'not_selected' ? 'bg-dc-paper text-dc-ink' : 'text-dc-gray'" :aria-pressed="statusFilter === 'not_selected'" title="Show not-selected proposals" @click="toggleStatusFilter('not_selected')">
                  <span class="h-1.5 w-1.5 rounded-full bg-dc-gray" aria-hidden="true" />
                  <span>Not selected</span>
                  <span class="font-semibold">{{ counts.not_selected }}</span>
                </button>
                <div class="border-l border-dc-border px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-wide text-dc-gray">{{ submissions.length }} total</div>
              </div>
            </div>
          </div>

          <div v-if="isSamplePreview" class="flex flex-wrap items-center justify-between gap-3 border-b border-dc-border bg-dc-paper-warm px-5 py-3 sm:px-6">
            <p class="text-xs text-dc-gray"><span class="font-semibold text-dc-ink">Sample queue.</span> Local-only proposals; no speaker records can be changed.</p>
            <button type="button" class="motion-press rounded-md border border-dc-border bg-dc-paper px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-dc-ink" @click="setSamplePreview(false)">Exit preview</button>
          </div>

          <div v-if="visibleSubmissions.length === 0" class="p-6">
            <p class="text-sm text-dc-gray">No {{ selectedStatusLabel }} yet.</p>
            <button v-if="!isSamplePreview" type="button" class="motion-press mt-4 rounded-md border-2 border-dc-ink bg-dc-yellow px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.1em]" @click="setSamplePreview(true)">Preview sample queue</button>
          </div>
          <div v-else class="overflow-x-auto">
            <table class="w-full min-w-[46rem] table-fixed border-collapse text-left">
              <caption class="sr-only">Conference speaker proposals</caption>
              <thead class="border-b border-dc-border bg-dc-paper-warm font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-dc-gray">
                <tr>
                  <th scope="col" class="w-[40%] px-4 py-3">Proposal</th>
                  <th scope="col" class="w-[20%] px-4 py-3">Speaker</th>
                  <th scope="col" class="w-[10%] px-4 py-3">Type</th>
                  <th scope="col" class="w-[11%] px-4 py-3">Submitted</th>
                  <th scope="col" class="w-[12%] px-4 py-3">Status</th>
                  <th scope="col" class="w-[7%] px-4 py-3 text-right"><span class="sr-only">Review</span></th>
                </tr>
              </thead>
              <tbody class="divide-y divide-dc-border bg-white">
                <tr v-for="submission in paginatedSubmissions" :key="submission.id" class="h-16 hover:bg-dc-paper-warm/40">
                  <th scope="row" class="truncate px-5 py-3 text-sm font-semibold text-dc-ink sm:px-6" :title="submission.title">
                    {{ submission.title }}
                  </th>
                  <td class="truncate px-4 py-3 text-sm text-dc-gray" :title="`${submission.speaker_name} · ${submission.speaker_email}`">{{ submission.speaker_name }}</td>
                  <td class="px-4 py-3 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-dc-gray">{{ submission.kind === 'product_demo' ? 'Demo' : 'Talk' }}</td>
                  <td class="px-4 py-3 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-dc-gray">{{ formatSubmittedAt(submission.created_at) }}</td>
                  <td class="px-4 py-3"><span class="inline-flex rounded border border-dc-border bg-dc-paper-warm px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-dc-ink">{{ proposalStatusLabel(submission.status) }}</span></td>
                  <td class="px-5 py-3 text-right sm:px-6">
                    <div v-if="canManage && submission.status === 'submitted'" class="flex justify-end gap-2">
                      <button class="motion-press rounded-md border border-dc-ink bg-dc-yellow px-2.5 py-1.5 font-mono text-[9px] font-semibold uppercase" :disabled="decisionMutation.isPending.value" @click="decisionMutation.mutate({ id: submission.id, eventId: submission.event_id, status: 'selected' })">Select</button>
                      <button class="motion-press rounded-md border border-dc-border bg-dc-paper px-2.5 py-1.5 font-mono text-[9px] font-semibold uppercase" :disabled="decisionMutation.isPending.value" @click="decisionMutation.mutate({ id: submission.id, eventId: submission.event_id, status: 'not_selected' })">Decline</button>
                    </div>
                    <button v-else-if="issuedPresenterLink?.submissionId === submission.id" class="motion-press rounded-md border border-dc-ink bg-dc-paper-warm px-2.5 py-1.5 font-mono text-[9px] font-semibold uppercase" @click="copyPresenterLink">Copy link</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <AppPagination v-model:page="page" :page-count="pageCount" :total="visibleSubmissions.length" :range-start="pageStart" :range-end="pageEnd" item-label="proposals" aria-label="Conference speaker proposal pagination" />
        </section>
      </template>
    </div>
  </div>
</template>
