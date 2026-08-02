<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import AppDropdown from '@/src/components/AppDropdown.vue';
import { adminPath } from '@/src/admin-routes';
import {
  approveEventSubmission,
  fetchEventSubmissions,
  queryKeys,
  rejectEventSubmission,
  retryEventSubmissionEmail,
} from '@/src/lib/api';
import { notify } from '@/src/lib/notify';
import type {
  EventSubmission,
  EventSubmissionEmailDelivery,
  EventSubmissionEmailKind,
  EventSubmissionRejectionCategory,
  EventSubmissionReviewStatus,
} from '@/types';

const queryClient = useQueryClient();
const activeFilter = ref<EventSubmissionReviewStatus>('pending');
const selectedId = ref<string | null>(null);
const drawerCloseButton = ref<HTMLButtonElement | null>(null);
const drawerPanel = ref<HTMLElement | null>(null);
const rejecting = ref(false);
const rejectionCategory = ref<EventSubmissionRejectionCategory | ''>('');
const organizerMessage = ref('');
const internalNote = ref('');
let drawerTrigger: HTMLElement | null = null;
const rejectionOptions: Array<{ value: EventSubmissionRejectionCategory; label: string }> = [
  { value: 'calendar_fit', label: 'Event does not fit the community calendar' },
  { value: 'insufficient_information', label: 'Insufficient or unverifiable information' },
  { value: 'duplicate', label: 'Duplicate submission' },
  { value: 'event_passed', label: 'Event has already passed' },
  { value: 'other', label: 'Other' },
];
const submissionsQuery = useQuery({
  queryKey: computed(() => queryKeys.eventSubmissions(activeFilter.value)),
  queryFn: () => fetchEventSubmissions(activeFilter.value),
});
const pendingSubmissionsQuery = useQuery({
  queryKey: queryKeys.eventSubmissions('pending'),
  queryFn: () => fetchEventSubmissions('pending'),
});
const submissions = computed(() => submissionsQuery.data.value?.submissions ?? []);
const pendingSubmissionCount = computed(() => pendingSubmissionsQuery.data.value?.submissions.length ?? 0);
const selectedSubmission = computed(() => (
  submissions.value.find((submission) => submission.id === selectedId.value) ?? null
));

watch(submissions, (next) => {
  if (!next.some((submission) => submission.id === selectedId.value)) {
    closeDrawer();
  }
}, { immediate: true });

watch(activeFilter, () => {
  closeDrawer();
});

watch(selectedId, () => {
  resetRejectionForm();
});

function openDrawer(submissionId: string, event?: Event) {
  drawerTrigger = event?.currentTarget instanceof HTMLElement ? event.currentTarget : null;
  selectedId.value = submissionId;
  void nextTick(() => drawerCloseButton.value?.focus());
}

function closeDrawer() {
  if (!selectedId.value) return;
  selectedId.value = null;
  const trigger = drawerTrigger;
  drawerTrigger = null;
  void nextTick(() => trigger?.focus());
}

function handleWindowKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && selectedSubmission.value) {
    closeDrawer();
    return;
  }

  if (event.key !== 'Tab' || !selectedSubmission.value || !drawerPanel.value) return;
  const focusable = Array.from(drawerPanel.value.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), select:not([disabled]), textarea:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
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

onMounted(() => window.addEventListener('keydown', handleWindowKeydown));
onUnmounted(() => window.removeEventListener('keydown', handleWindowKeydown));

const approveMutation = useMutation({
  mutationFn: (submission: EventSubmission) => approveEventSubmission(submission.id, true),
  onSuccess: async () => {
    notify.success('Community event approved and published. Organizer notification queued.');
    await refreshSubmissions();
  },
  onError: (error) => notify.error(error instanceof Error ? error.message : 'Unable to approve this event.'),
});

const rejectMutation = useMutation({
  mutationFn: (submission: EventSubmission) => {
    if (!rejectionCategory.value) throw new Error('Choose a rejection reason.');
    return rejectEventSubmission(submission.id, {
      category: rejectionCategory.value,
      organizer_message: organizerMessage.value,
      internal_note: internalNote.value,
    });
  },
  onSuccess: async () => {
    notify.success('Event submission rejected. Organizer notification queued.');
    resetRejectionForm();
    await refreshSubmissions();
  },
  onError: (error) => notify.error(error instanceof Error ? error.message : 'Unable to reject this event.'),
});

const retryEmailMutation = useMutation({
  mutationFn: ({ submissionId, kind }: { submissionId: string; kind: EventSubmissionEmailKind }) => (
    retryEventSubmissionEmail(submissionId, kind)
  ),
  onSuccess: async () => {
    notify.success('Email accepted by the delivery provider.');
    await refreshSubmissions();
  },
  onError: (error) => notify.error(error instanceof Error ? error.message : 'Unable to retry this email.'),
});

function resetRejectionForm() {
  rejecting.value = false;
  rejectionCategory.value = '';
  organizerMessage.value = '';
  internalNote.value = '';
}

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

function rejectionCategoryLabel(category: EventSubmissionRejectionCategory | null) {
  return rejectionOptions.find((option) => option.value === category)?.label ?? 'Other';
}

function emailKindLabel(kind: EventSubmissionEmailKind) {
  if (kind === 'receipt') return 'Submission receipt';
  if (kind === 'approved') return 'Approval notification';
  return 'Rejection notification';
}

function emailStatusLabel(delivery: EventSubmissionEmailDelivery) {
  if (delivery.status === 'accepted') return 'Accepted';
  if (delivery.status === 'failed') return 'Failed';
  return 'Queued';
}

function emailStatusClass(delivery: EventSubmissionEmailDelivery) {
  if (delivery.status === 'accepted') return 'border-emerald-700 bg-emerald-50 text-emerald-800';
  if (delivery.status === 'failed') return 'border-red-700 bg-red-50 text-red-800';
  return 'border-amber-700 bg-amber-50 text-amber-900';
}
</script>

<template>
  <div>
      <header class="editorial-header">
        <div>
          <p class="editorial-eyebrow">Events · Community listings</p>
          <h1 class="editorial-title">Community submissions</h1>
          <p class="editorial-subtitle">
            Review event proposals from devcongress.org. Approval adds an external community listing without making it a DevCongress event.
          </p>
        </div>
      </header>

      <section class="ops-panel overflow-hidden">
        <div class="submission-table-toolbar">
          <div>
            <p class="editorial-eyebrow">Review queue</p>
            <p class="text-sm font-medium text-dc-gray">
              {{ submissions.length }} {{ activeFilter }} proposal{{ submissions.length === 1 ? '' : 's' }}
            </p>
          </div>
          <nav class="flex flex-wrap gap-2" aria-label="Submission status">
            <button
              v-for="filter in (['pending', 'approved', 'rejected'] as EventSubmissionReviewStatus[])"
              :key="filter"
              type="button"
              class="motion-press relative min-h-9 rounded-md border px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.1em]"
              :class="activeFilter === filter ? 'border-dc-ink bg-dc-yellow text-dc-ink shadow-[1px_1px_0_#111111]' : 'border-dc-border bg-white text-dc-gray hover:border-dc-ink hover:text-dc-ink'"
              @click="activeFilter = filter"
            >
              {{ filter }}
              <Transition v-if="filter === 'pending'" name="submission-count">
                <span
                  v-if="pendingSubmissionCount"
                  class="submission-filter-count"
                  :class="pendingSubmissionCount > 99 ? 'text-[7px]' : 'text-[9px]'"
                  :aria-label="`${pendingSubmissionCount} pending submissions`"
                >
                  {{ pendingSubmissionCount > 99 ? '99+' : pendingSubmissionCount }}
                </span>
              </Transition>
            </button>
          </nav>
        </div>

        <div v-if="submissionsQuery.isPending.value" class="p-6 text-sm font-medium text-dc-gray">Loading submissions…</div>
        <div v-else-if="submissionsQuery.isError.value" class="p-6 text-sm font-semibold text-red-800">Unable to load event submissions.</div>
        <div v-else-if="submissions.length === 0" class="submission-empty-state">
          <div class="submission-empty-icon" aria-hidden="true">
            <svg viewBox="0 0 32 32" fill="none">
              <path d="M6 9.5A2.5 2.5 0 0 1 8.5 7h15A2.5 2.5 0 0 1 26 9.5v13a2.5 2.5 0 0 1-2.5 2.5h-15A2.5 2.5 0 0 1 6 22.5v-13Z" stroke="currentColor" stroke-width="2" />
              <path d="m8 10 8 6 8-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              <path d="M21.5 5.5h5v5" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
          </div>
          <p class="text-lg font-bold text-dc-ink">{{ activeFilter === 'pending' ? 'Inbox clear' : `No ${activeFilter} submissions` }}</p>
          <p class="mt-2 max-w-md text-sm leading-6 text-dc-gray">
            {{ activeFilter === 'pending' ? 'New community event proposals from devcongress.org will arrive here for review.' : 'There are no proposals in this view yet.' }}
          </p>
        </div>
        <div v-else class="submission-table-scroll">
          <table class="submission-table">
            <thead>
              <tr>
                <th>Event</th>
                <th>Organizer</th>
                <th>Starts</th>
                <th>Format</th>
                <th>Location</th>
                <th>Status</th>
                <th><span class="sr-only">Open</span></th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="submission in submissions"
                :key="submission.id"
                tabindex="0"
                :aria-label="`Open ${submission.title}`"
                @click="openDrawer(submission.id, $event)"
                @keydown.enter.prevent="openDrawer(submission.id, $event)"
                @keydown.space.prevent="openDrawer(submission.id, $event)"
              >
                <td>
                  <span class="submission-table-title">{{ submission.title }}</span>
                  <span class="submission-table-summary">{{ submission.summary }}</span>
                </td>
                <td>{{ submission.organizer_name }}</td>
                <td class="whitespace-nowrap">{{ formatDateTime(submission.starts_at, submission.timezone) }}</td>
                <td>{{ formatLabel(submission.format) }}</td>
                <td>{{ submission.venue_name || formatLabel(submission.location_type) }}</td>
                <td>
                  <span class="shrink-0 rounded-md border px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-wide" :class="statusClass(submission.review_status)">
                    {{ submission.review_status }}
                  </span>
                </td>
                <td class="submission-table-arrow" aria-hidden="true">→</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

    <Teleport to="body">
      <Transition name="submission-drawer">
        <div v-if="selectedSubmission" class="submission-drawer-shell">
          <button type="button" class="submission-drawer-backdrop" aria-label="Close submission details" @click="closeDrawer" />
          <aside ref="drawerPanel" class="submission-drawer" role="dialog" aria-modal="true" :aria-labelledby="`submission-title-${selectedSubmission.id}`">
            <header class="submission-drawer-header">
              <div class="min-w-0">
                <p class="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-dc-pink">{{ formatLabel(selectedSubmission.format) }} · {{ formatLabel(selectedSubmission.location_type) }}</p>
                <h2 :id="`submission-title-${selectedSubmission.id}`" class="mt-2 truncate text-2xl font-bold tracking-tight text-dc-ink">{{ selectedSubmission.title }}</h2>
              </div>
              <button ref="drawerCloseButton" type="button" class="submission-drawer-close motion-press" aria-label="Close submission details" @click="closeDrawer">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                </svg>
              </button>
            </header>

            <div class="submission-drawer-body">
              <div class="flex items-center justify-between gap-4">
                <p class="editorial-eyebrow">Proposal details</p>
                <span class="rounded-md border px-2.5 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wide" :class="statusClass(selectedSubmission.review_status)">
                  {{ selectedSubmission.review_status }}
                </span>
              </div>

              <p class="mt-5 whitespace-pre-line text-sm font-medium leading-6 text-dc-ink/80">{{ selectedSubmission.summary }}</p>

              <dl class="mt-6 grid gap-5 border-y border-dc-border py-5 sm:grid-cols-2">
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
                  <dd><a :href="`mailto:${selectedSubmission.organizer_email}`" class="break-all text-sm font-semibold text-dc-pink underline decoration-dc-yellow decoration-2 underline-offset-4">{{ selectedSubmission.organizer_email }}</a></dd>
                </div>
              </dl>

              <div class="mt-5 flex flex-wrap gap-x-5 gap-y-3 text-sm font-semibold">
                <a v-if="selectedSubmission.registration_url" :href="selectedSubmission.registration_url" target="_blank" rel="noreferrer" class="text-dc-pink underline decoration-dc-yellow decoration-2 underline-offset-4">Registration page</a>
                <a v-if="selectedSubmission.online_url" :href="selectedSubmission.online_url" target="_blank" rel="noreferrer" class="text-dc-pink underline decoration-dc-yellow decoration-2 underline-offset-4">Online event link</a>
                <a v-if="selectedSubmission.organizer_website" :href="selectedSubmission.organizer_website" target="_blank" rel="noreferrer" class="text-dc-pink underline decoration-dc-yellow decoration-2 underline-offset-4">Organizer website</a>
              </div>

              <div v-if="selectedSubmission.notes" class="mt-6 rounded-md border border-dc-border bg-dc-paper-warm p-4">
                <p class="editorial-eyebrow">Note from submitter</p>
                <p class="mt-2 whitespace-pre-line text-sm leading-6 text-dc-gray">{{ selectedSubmission.notes }}</p>
              </div>

              <div v-if="selectedSubmission.review_status === 'rejected'" class="mt-6 space-y-4 rounded-md border border-red-200 bg-red-50/60 p-4">
                <div>
                  <p class="editorial-eyebrow">Rejection reason</p>
                  <p class="mt-2 text-sm font-semibold leading-6 text-dc-ink">{{ rejectionCategoryLabel(selectedSubmission.rejection_category) }}</p>
                </div>
                <div v-if="selectedSubmission.organizer_message">
                  <p class="editorial-eyebrow">Message sent to organizer</p>
                  <p class="mt-2 whitespace-pre-line text-sm leading-6 text-dc-gray">{{ selectedSubmission.organizer_message }}</p>
                </div>
                <div v-if="selectedSubmission.internal_note">
                  <p class="editorial-eyebrow">Internal note · Private</p>
                  <p class="mt-2 whitespace-pre-line text-sm leading-6 text-dc-gray">{{ selectedSubmission.internal_note }}</p>
                </div>
              </div>

              <section v-if="selectedSubmission.email_deliveries.length" class="mt-6 border-t border-dc-border pt-5" aria-labelledby="submission-email-status">
                <p id="submission-email-status" class="editorial-eyebrow">Email delivery</p>
                <ul class="mt-3 space-y-2">
                  <li v-for="delivery in selectedSubmission.email_deliveries" :key="delivery.id" class="flex flex-wrap items-center justify-between gap-3 rounded-md border border-dc-border bg-white px-3 py-3">
                    <div>
                      <p class="text-sm font-semibold text-dc-ink">{{ emailKindLabel(delivery.kind) }}</p>
                      <p v-if="delivery.last_error" class="mt-1 text-xs leading-5 text-red-800">{{ delivery.last_error }}</p>
                      <p v-else-if="delivery.accepted_at" class="mt-1 text-xs text-dc-gray">Accepted {{ formatDateTime(delivery.accepted_at) }}</p>
                    </div>
                    <div class="flex items-center gap-2">
                      <span class="rounded-md border px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-wide" :class="emailStatusClass(delivery)">
                        {{ emailStatusLabel(delivery) }}
                      </span>
                      <button
                        v-if="delivery.status === 'failed'"
                        type="button"
                        class="motion-press rounded-md border border-dc-ink bg-white px-2.5 py-1.5 font-mono text-[9px] font-semibold uppercase tracking-wide text-dc-ink disabled:opacity-50"
                        :disabled="retryEmailMutation.isPending.value"
                        @click="retryEmailMutation.mutate({ submissionId: selectedSubmission.id, kind: delivery.kind })"
                      >
                        {{ retryEmailMutation.isPending.value ? 'Retrying…' : 'Retry' }}
                      </button>
                    </div>
                  </li>
                </ul>
                <p class="mt-3 text-xs leading-5 text-dc-gray">Accepted means the email provider accepted the message. Delivery and opens are not tracked yet.</p>
              </section>
            </div>

            <footer class="submission-drawer-footer">
              <template v-if="selectedSubmission.review_status === 'pending'">
                <Transition name="submission-review">
                  <div v-if="rejecting" class="mb-4 space-y-4">
                    <AppDropdown
                      v-model="rejectionCategory"
                      label="Reason category"
                      placeholder="Choose a reason"
                      :options="rejectionOptions"
                      density="compact"
                      required
                      teleport
                    />
                    <div>
                      <label for="organizer-message" class="editorial-eyebrow">Message to organizer (optional)</label>
                      <p class="mt-1 text-xs leading-5 text-dc-gray">This message will be included in the rejection email.</p>
                      <textarea id="organizer-message" v-model="organizerMessage" maxlength="1200" rows="3" class="editorial-input mt-2 min-h-24 resize-none text-sm" placeholder="Add a helpful explanation or next step" />
                    </div>
                    <div>
                      <label for="internal-note" class="editorial-eyebrow">Internal note (optional)</label>
                      <p class="mt-1 text-xs leading-5 text-dc-gray">Private to DevCongress organizers. Never included in email.</p>
                      <textarea id="internal-note" v-model="internalNote" maxlength="1000" rows="3" class="editorial-input mt-2 min-h-24 resize-none text-sm" placeholder="Add private review context" />
                    </div>
                    <div v-if="rejectionCategory" class="rounded-md border border-dc-border bg-white p-3">
                      <p class="editorial-eyebrow">Email preview</p>
                      <p class="mt-2 text-xs font-semibold text-dc-ink">Update on your event submission: {{ selectedSubmission.title }}</p>
                      <p class="mt-2 text-xs leading-5 text-dc-gray">{{ rejectionCategoryLabel(rejectionCategory) }}</p>
                      <p v-if="organizerMessage" class="mt-2 whitespace-pre-line text-xs leading-5 text-dc-gray">{{ organizerMessage }}</p>
                    </div>
                  </div>
                </Transition>
                <div class="flex flex-wrap gap-3">
                  <button
                    type="button"
                    class="motion-press min-h-11 flex-1 rounded-md border-2 border-dc-ink bg-dc-pink px-5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-white shadow-[2px_2px_0_#111111] disabled:cursor-not-allowed disabled:opacity-50"
                    :disabled="rejecting || approveMutation.isPending.value || rejectMutation.isPending.value"
                    @click="approveMutation.mutate(selectedSubmission)"
                  >
                    {{ approveMutation.isPending.value ? 'Publishing…' : 'Approve & publish' }}
                  </button>
                  <button v-if="!rejecting" type="button" class="motion-press min-h-11 rounded-md border-2 border-dc-ink bg-white px-5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-dc-ink" @click="rejecting = true">Reject</button>
                  <template v-else>
                    <button type="button" class="motion-press min-h-11 rounded-md border-2 border-red-800 bg-red-800 px-5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-white disabled:cursor-not-allowed disabled:opacity-50" :disabled="!rejectionCategory || rejectMutation.isPending.value" @click="rejectMutation.mutate(selectedSubmission)">
                      {{ rejectMutation.isPending.value ? 'Rejecting…' : 'Reject & notify organizer' }}
                    </button>
                    <button type="button" class="motion-press min-h-11 rounded-md border border-dc-border bg-white px-5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-dc-gray" @click="resetRejectionForm">Cancel</button>
                  </template>
                </div>
              </template>
              <div v-else class="flex flex-wrap items-center justify-between gap-4 text-sm text-dc-gray">
                <span>Reviewed {{ selectedSubmission.reviewed_at ? formatDateTime(selectedSubmission.reviewed_at) : '' }} by {{ selectedSubmission.reviewed_by }}</span>
                <RouterLink v-if="selectedSubmission.approved_event_id" :to="adminPath(`events/${selectedSubmission.approved_event_id}`)" class="font-semibold text-dc-pink underline decoration-dc-yellow decoration-2 underline-offset-4" @click="closeDrawer">Open event</RouterLink>
              </div>
            </footer>
          </aside>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
