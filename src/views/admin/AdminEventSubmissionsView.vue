<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { adminPath } from '@/src/admin-routes';
import {
  approveEventSubmission,
  fetchEventSubmissions,
  queryKeys,
  rejectEventSubmission,
} from '@/src/lib/api';
import { notify } from '@/src/lib/notify';
import type { EventSubmission, EventSubmissionReviewStatus } from '@/types';

type Filter = EventSubmissionReviewStatus | 'all';

const queryClient = useQueryClient();
const activeFilter = ref<Filter>('pending');
const selectedId = ref<string | null>(null);
const rejecting = ref(false);
const rejectionReason = ref('');
const submissionsQuery = useQuery({
  queryKey: computed(() => queryKeys.eventSubmissions(activeFilter.value)),
  queryFn: () => fetchEventSubmissions(activeFilter.value),
});
const submissions = computed(() => submissionsQuery.data.value?.submissions ?? []);
const selectedSubmission = computed(() => (
  submissions.value.find((submission) => submission.id === selectedId.value) ?? submissions.value[0] ?? null
));

watch(submissions, (next) => {
  if (!next.some((submission) => submission.id === selectedId.value)) {
    selectedId.value = next[0]?.id ?? null;
  }
}, { immediate: true });

watch(selectedId, () => {
  rejecting.value = false;
  rejectionReason.value = '';
});

const approveMutation = useMutation({
  mutationFn: (submission: EventSubmission) => approveEventSubmission(submission.id, true),
  onSuccess: async () => {
    notify.success('Community event approved and published.');
    await refreshSubmissions();
  },
  onError: (error) => notify.error(error instanceof Error ? error.message : 'Unable to approve this event.'),
});

const rejectMutation = useMutation({
  mutationFn: (submission: EventSubmission) => rejectEventSubmission(submission.id, rejectionReason.value),
  onSuccess: async () => {
    notify.success('Event submission rejected.');
    rejecting.value = false;
    rejectionReason.value = '';
    await refreshSubmissions();
  },
  onError: (error) => notify.error(error instanceof Error ? error.message : 'Unable to reject this event.'),
});

async function refreshSubmissions() {
  await queryClient.invalidateQueries({ queryKey: ['event-submissions'] });
  await queryClient.invalidateQueries({ queryKey: queryKeys.events });
  await queryClient.invalidateQueries({ queryKey: queryKeys.publicMeetups });
}

function formatDateTime(value: string, timezone?: string) {
  try {
    return new Intl.DateTimeFormat('en-GH', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: timezone,
    }).format(new Date(value));
  } catch {
    return new Date(value).toLocaleString();
  }
}

function formatLabel(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusClass(status: EventSubmissionReviewStatus) {
  if (status === 'approved') return 'border-emerald-700 bg-emerald-50 text-emerald-800';
  if (status === 'rejected') return 'border-red-700 bg-red-50 text-red-800';
  return 'border-amber-700 bg-amber-50 text-amber-900';
}
</script>

<template>
  <div class="editorial-page">
    <div class="editorial-wrap">
      <header class="editorial-hero">
        <div>
          <p class="editorial-eyebrow mb-3">Community listings</p>
          <h1 class="editorial-title">Event submissions</h1>
          <p class="editorial-copy mt-3 max-w-2xl">
            Review events sent from devcongress.org. Approval publishes an external community listing without making it a DevCongress event.
          </p>
        </div>
      </header>

      <nav class="flex flex-wrap gap-2" aria-label="Submission status">
        <button
          v-for="filter in (['pending', 'approved', 'rejected', 'all'] as Filter[])"
          :key="filter"
          type="button"
          class="motion-press min-h-10 rounded-md border-2 px-4 font-mono text-[10px] font-semibold uppercase tracking-[0.1em]"
          :class="activeFilter === filter ? 'border-dc-ink bg-dc-yellow text-dc-ink shadow-[2px_2px_0_#111111]' : 'border-dc-border bg-dc-paper text-dc-gray hover:border-dc-ink hover:text-dc-ink'"
          @click="activeFilter = filter"
        >
          {{ filter }}
        </button>
      </nav>

      <section class="editorial-panel overflow-hidden">
        <div v-if="submissionsQuery.isPending.value" class="p-6 text-sm font-medium text-dc-gray">Loading submissions…</div>
        <div v-else-if="submissionsQuery.isError.value" class="p-6 text-sm font-semibold text-red-800">Unable to load event submissions.</div>
        <div v-else-if="submissions.length === 0" class="p-8 text-center">
          <p class="text-lg font-bold text-dc-ink">No {{ activeFilter === 'all' ? '' : activeFilter }} submissions</p>
          <p class="mt-2 text-sm text-dc-gray">New public event proposals will appear here.</p>
        </div>
        <div v-else class="grid min-h-[34rem] lg:grid-cols-[minmax(17rem,0.72fr)_minmax(0,1.28fr)]">
          <div class="border-b border-dc-border lg:border-b-0 lg:border-r">
            <button
              v-for="submission in submissions"
              :key="submission.id"
              type="button"
              class="block w-full border-b border-dc-border px-5 py-4 text-left last:border-b-0 hover:bg-dc-paper-warm"
              :class="selectedSubmission?.id === submission.id ? 'bg-dc-yellow/20 shadow-[inset_3px_0_0_#111111]' : 'bg-white'"
              @click="selectedId = submission.id"
            >
              <span class="flex items-start justify-between gap-3">
                <span class="min-w-0">
                  <span class="block truncate text-base font-bold tracking-tight text-dc-ink">{{ submission.title }}</span>
                  <span class="mt-1 block truncate text-sm font-medium text-dc-gray">{{ submission.organizer_name }}</span>
                </span>
                <span class="shrink-0 rounded-md border px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-wide" :class="statusClass(submission.review_status)">
                  {{ submission.review_status }}
                </span>
              </span>
              <span class="mt-3 block font-mono text-[10px] font-semibold uppercase tracking-wide text-dc-gray">
                {{ formatDateTime(submission.starts_at, submission.timezone) }}
              </span>
            </button>
          </div>

          <article v-if="selectedSubmission" class="p-5 sm:p-7">
            <div class="flex flex-wrap items-start justify-between gap-4 border-b border-dc-border pb-5">
              <div>
                <p class="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-dc-pink">{{ formatLabel(selectedSubmission.format) }} · {{ formatLabel(selectedSubmission.location_type) }}</p>
                <h2 class="mt-2 text-2xl font-bold tracking-tight text-dc-ink">{{ selectedSubmission.title }}</h2>
              </div>
              <span class="rounded-md border px-2.5 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wide" :class="statusClass(selectedSubmission.review_status)">
                {{ selectedSubmission.review_status }}
              </span>
            </div>

            <p class="mt-5 whitespace-pre-line text-sm font-medium leading-6 text-dc-ink/80">{{ selectedSubmission.summary }}</p>

            <dl class="mt-6 grid gap-4 border-y border-dc-border py-5 sm:grid-cols-2">
              <div>
                <dt class="editorial-eyebrow">Starts</dt>
                <dd class="mt-1 text-sm font-semibold text-dc-ink">{{ formatDateTime(selectedSubmission.starts_at, selectedSubmission.timezone) }}</dd>
              </div>
              <div>
                <dt class="editorial-eyebrow">Ends</dt>
                <dd class="mt-1 text-sm font-semibold text-dc-ink">{{ formatDateTime(selectedSubmission.ends_at, selectedSubmission.timezone) }}</dd>
              </div>
              <div>
                <dt class="editorial-eyebrow">Venue</dt>
                <dd class="mt-1 text-sm font-semibold text-dc-ink">{{ selectedSubmission.venue_name || 'Online' }}</dd>
                <dd v-if="selectedSubmission.venue_address" class="mt-1 text-sm text-dc-gray">{{ selectedSubmission.venue_address }}</dd>
              </div>
              <div>
                <dt class="editorial-eyebrow">Organizer</dt>
                <dd class="mt-1 text-sm font-semibold text-dc-ink">{{ selectedSubmission.organizer_name }}</dd>
                <dd><a :href="`mailto:${selectedSubmission.organizer_email}`" class="text-sm font-semibold text-dc-pink underline decoration-dc-yellow decoration-2 underline-offset-4">{{ selectedSubmission.organizer_email }}</a></dd>
              </div>
            </dl>

            <div class="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold">
              <a v-if="selectedSubmission.registration_url" :href="selectedSubmission.registration_url" target="_blank" rel="noreferrer" class="text-dc-pink underline decoration-dc-yellow decoration-2 underline-offset-4">Registration page</a>
              <a v-if="selectedSubmission.online_url" :href="selectedSubmission.online_url" target="_blank" rel="noreferrer" class="text-dc-pink underline decoration-dc-yellow decoration-2 underline-offset-4">Online event link</a>
              <a v-if="selectedSubmission.organizer_website" :href="selectedSubmission.organizer_website" target="_blank" rel="noreferrer" class="text-dc-pink underline decoration-dc-yellow decoration-2 underline-offset-4">Organizer website</a>
            </div>

            <div v-if="selectedSubmission.notes" class="mt-6 rounded-md border border-dc-border bg-dc-paper-warm p-4">
              <p class="editorial-eyebrow">Note from submitter</p>
              <p class="mt-2 whitespace-pre-line text-sm leading-6 text-dc-gray">{{ selectedSubmission.notes }}</p>
            </div>

            <div v-if="selectedSubmission.review_status === 'pending'" class="mt-7 border-t border-dc-border pt-5">
              <div v-if="rejecting" class="mb-4">
                <label for="rejection-reason" class="editorial-eyebrow">Rejection note (optional)</label>
                <textarea id="rejection-reason" v-model="rejectionReason" maxlength="1000" rows="3" class="mt-2 w-full rounded-md border-2 border-dc-border bg-white px-3 py-2 text-sm text-dc-ink outline-none focus:border-dc-ink" placeholder="Private note for the review record" />
              </div>
              <div class="flex flex-wrap gap-3">
                <button
                  type="button"
                  class="motion-press min-h-11 rounded-md border-2 border-dc-ink bg-dc-pink px-5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-white shadow-[2px_2px_0_#111111] disabled:cursor-not-allowed disabled:opacity-50"
                  :disabled="approveMutation.isPending.value || rejectMutation.isPending.value"
                  @click="approveMutation.mutate(selectedSubmission)"
                >
                  {{ approveMutation.isPending.value ? 'Publishing…' : 'Approve & publish' }}
                </button>
                <button
                  v-if="!rejecting"
                  type="button"
                  class="motion-press min-h-11 rounded-md border-2 border-dc-ink bg-white px-5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-dc-ink hover:bg-red-50"
                  @click="rejecting = true"
                >
                  Reject
                </button>
                <template v-else>
                  <button type="button" class="motion-press min-h-11 rounded-md border-2 border-red-800 bg-red-800 px-5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-white disabled:opacity-50" :disabled="rejectMutation.isPending.value" @click="rejectMutation.mutate(selectedSubmission)">
                    {{ rejectMutation.isPending.value ? 'Rejecting…' : 'Confirm rejection' }}
                  </button>
                  <button type="button" class="motion-press min-h-11 rounded-md border-2 border-dc-border bg-white px-5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-dc-gray" @click="rejecting = false">Cancel</button>
                </template>
              </div>
            </div>

            <div v-else class="mt-7 flex flex-wrap items-center gap-4 border-t border-dc-border pt-5 text-sm text-dc-gray">
              <span>Reviewed {{ selectedSubmission.reviewed_at ? formatDateTime(selectedSubmission.reviewed_at) : '' }} by {{ selectedSubmission.reviewed_by }}</span>
              <RouterLink v-if="selectedSubmission.approved_event_id" :to="adminPath(`events/${selectedSubmission.approved_event_id}`)" class="font-semibold text-dc-pink underline decoration-dc-yellow decoration-2 underline-offset-4">Open event</RouterLink>
            </div>
          </article>
        </div>
      </section>
    </div>
  </div>
</template>
