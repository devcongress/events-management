<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import AppDropdown from '@/src/components/AppDropdown.vue';
import { adminPath } from '@/src/admin-routes';
import { presentEventSubmissionReply } from '@/lib/email/event-submission-reply-presentation';
import {
  approveEventSubmission,
  fetchEventSubmissions,
  queryKeys,
  rejectEventSubmission,
  retryEventSubmissionEmail,
  retryEventSubmissionReplySlackAlert,
} from '@/src/lib/api';
import { notify } from '@/src/lib/notify';
import type {
  EventSubmission,
  EventSubmissionEmailDelivery,
  EventSubmissionEmailKind,
  EventSubmissionReply,
  EventSubmissionRejectionCategory,
  EventSubmissionReviewStatus,
} from '@/types';

const queryClient = useQueryClient();
const route = useRoute();
const router = useRouter();
const activeFilter = ref<EventSubmissionReviewStatus>('pending');
const selectedId = ref<string | null>(null);
const drawerCloseButton = ref<HTMLButtonElement | null>(null);
const drawerPanel = ref<HTMLElement | null>(null);
const rejecting = ref(false);
const rejectionCategory = ref<EventSubmissionRejectionCategory | ''>('');
const organizerMessage = ref('');
const internalNote = ref('');
const retryingEmailKinds = ref<Set<EventSubmissionEmailKind>>(new Set());
const retryingReplyIds = ref<Set<string>>(new Set());
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
const linkedSubmissionId = computed(() => {
  const value = route.query.submission;
  return typeof value === 'string' && value.length <= 128 ? value : null;
});
const linkedSubmissionsQuery = useQuery({
  queryKey: computed(() => ['event-submission-deep-link', linkedSubmissionId.value]),
  queryFn: () => fetchEventSubmissions('all'),
  enabled: computed(() => linkedSubmissionId.value !== null),
});
const pendingSubmissionsQuery = useQuery({
  queryKey: queryKeys.eventSubmissions('pending'),
  queryFn: () => fetchEventSubmissions('pending'),
});
const submissions = computed(() => submissionsQuery.data.value?.submissions ?? []);
const pendingSubmissionCount = computed(() => pendingSubmissionsQuery.data.value?.submissions.length ?? 0);
const selectedSubmission = computed(() => (
  submissions.value.find((submission) => submission.id === selectedId.value)
  ?? linkedSubmissionsQuery.data.value?.submissions.find((submission) => submission.id === selectedId.value)
  ?? null
));

watch(submissions, (next) => {
  if (!linkedSubmissionId.value && !next.some((submission) => submission.id === selectedId.value)) {
    closeDrawer();
  }
}, { immediate: true });

watch(activeFilter, () => {
  if (!linkedSubmissionId.value) closeDrawerWithoutClearingLink();
});

watch([linkedSubmissionId, () => linkedSubmissionsQuery.data.value], ([submissionId, response]) => {
  if (!submissionId) return;
  const submission = response?.submissions.find((item) => item.id === submissionId);
  if (!submission) return;
  if (activeFilter.value !== submission.review_status) activeFilter.value = submission.review_status;
  selectedId.value = submission.id;
  void nextTick(() => drawerCloseButton.value?.focus());
}, { immediate: true });

watch(selectedId, () => {
  resetRejectionForm();
});

function openDrawer(submissionId: string, event?: Event) {
  drawerTrigger = event?.currentTarget instanceof HTMLElement ? event.currentTarget : null;
  selectedId.value = submissionId;
  void nextTick(() => drawerCloseButton.value?.focus());
}

function closeDrawer() {
  closeDrawerInternal(true);
}

function closeDrawerWithoutClearingLink() {
  closeDrawerInternal(false);
}

function closeDrawerInternal(clearDeepLink: boolean) {
  if (!selectedId.value) return;
  selectedId.value = null;
  if (clearDeepLink && linkedSubmissionId.value) {
    const query = { ...route.query };
    delete query.submission;
    void router.replace({ query });
  }
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
  onMutate: ({ kind }) => setRetryingEmailKind(kind, true),
  onSettled: (_data, _error, { kind }) => setRetryingEmailKind(kind, false),
});

const retryReplySlackMutation = useMutation({
  mutationFn: ({ submissionId, replyId }: { submissionId: string; replyId: string }) => (
    retryEventSubmissionReplySlackAlert(submissionId, replyId)
  ),
  onSuccess: async () => {
    notify.success('Slack notification sent.');
    await refreshSubmissions();
  },
  onError: (error) => notify.error(error instanceof Error ? error.message : 'Unable to retry this Slack notification.'),
  onMutate: ({ replyId }) => setRetryingReply(replyId, true),
  onSettled: (_data, _error, { replyId }) => setRetryingReply(replyId, false),
});

function setRetryingEmailKind(kind: EventSubmissionEmailKind, retrying: boolean) {
  const next = new Set(retryingEmailKinds.value);
  if (retrying) next.add(kind);
  else next.delete(kind);
  retryingEmailKinds.value = next;
}

function isRetryingEmail(kind: EventSubmissionEmailKind) {
  return retryingEmailKinds.value.has(kind);
}

function setRetryingReply(replyId: string, retrying: boolean) {
  const next = new Set(retryingReplyIds.value);
  if (retrying) next.add(replyId);
  else next.delete(replyId);
  retryingReplyIds.value = next;
}

function isRetryingReply(replyId: string) {
  return retryingReplyIds.value.has(replyId);
}

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
  if (status === 'approved') return 'border-dc-success bg-dc-success-soft text-dc-success';
  if (status === 'rejected') return 'border-destructive/40 bg-destructive/5 text-destructive';
  return 'border-dc-border bg-dc-paper-warm text-dc-ink';
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
  if (delivery.status === 'accepted') return 'border-dc-success bg-dc-success-soft text-dc-success';
  if (delivery.status === 'failed') return 'border-destructive/40 bg-destructive/5 text-destructive';
  return 'border-dc-border bg-dc-paper-warm text-dc-ink';
}

function replySlackStatusLabel(reply: EventSubmissionReply) {
  if (reply.slack_status === 'sent') return 'Slack notified';
  if (reply.slack_status === 'failed') return 'Slack failed';
  return 'Slack pending';
}

function replySlackStatusClass(reply: EventSubmissionReply) {
  if (reply.slack_status === 'sent') return 'border-dc-success bg-dc-success-soft text-dc-success';
  if (reply.slack_status === 'failed') return 'border-destructive/40 bg-destructive/5 text-destructive';
  return 'border-dc-border bg-dc-paper-warm text-dc-ink';
}

function replyPresentation(reply: EventSubmissionReply) {
  return presentEventSubmissionReply(reply.body_text);
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

        <div v-if="submissionsQuery.isPending.value" class="submission-table-scroll" aria-busy="true" aria-label="Loading community submissions">
          <table class="submission-table">
            <thead>
              <tr>
                <th v-for="column in 7" :key="column"><span class="skeleton-line h-3" /></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-dc-border">
              <tr v-for="row in 4" :key="row">
                <td>
                  <div class="skeleton-line h-4 w-3/4" />
                </td>
                <td><div class="skeleton-line h-3 w-4/5" /></td>
                <td><div class="skeleton-line h-3 w-full" /></td>
                <td><div class="skeleton-line h-3 w-3/4" /></td>
                <td><div class="skeleton-line h-3 w-full" /></td>
                <td><div class="skeleton-option size-5" /></td>
                <td><div class="skeleton-option ml-auto size-4" /></td>
              </tr>
            </tbody>
          </table>
        </div>
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
                </td>
                <td>{{ submission.organizer_name }}</td>
                <td class="whitespace-nowrap">{{ formatDateTime(submission.starts_at, submission.timezone) }}</td>
                <td>{{ formatLabel(submission.format) }}</td>
                <td>{{ submission.venue_name || formatLabel(submission.location_type) }}</td>
                <td>
                  <span
                    class="submission-table-status-icon"
                    :class="statusClass(submission.review_status)"
                    role="img"
                    :aria-label="formatLabel(submission.review_status)"
                    :title="formatLabel(submission.review_status)"
                  >
                    <svg v-if="submission.review_status === 'pending'" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.8" />
                      <path d="M12 7.5v5l3 1.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                    <svg v-else-if="submission.review_status === 'approved'" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="m7.5 12.5 3 3 6-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                    <svg v-else viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="m8.5 8.5 7 7m0-7-7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                    </svg>
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
                <div class="submission-drawer-meta">
                  <span>{{ formatLabel(selectedSubmission.format) }}</span>
                  <span aria-hidden="true">·</span>
                  <span>{{ formatLabel(selectedSubmission.location_type) }}</span>
                </div>
                <h2 :id="`submission-title-${selectedSubmission.id}`" class="submission-drawer-title">{{ selectedSubmission.title }}</h2>
              </div>
              <button ref="drawerCloseButton" type="button" class="submission-drawer-close motion-press" aria-label="Close submission details" @click="closeDrawer">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                </svg>
              </button>
            </header>

            <div class="submission-drawer-body">
              <div class="submission-review-heading">
                <div>
                  <p class="submission-section-kicker">Review request</p>
                  <h3>Event proposal</h3>
                </div>
                <span class="submission-status-badge" :class="statusClass(selectedSubmission.review_status)">
                  <span class="submission-status-dot" aria-hidden="true" />
                  {{ selectedSubmission.review_status }}
                </span>
              </div>

              <section class="submission-review-card" aria-labelledby="submission-overview">
                <h4 id="submission-overview" class="sr-only">Proposal overview</h4>
                <p class="submission-summary">{{ selectedSubmission.summary }}</p>

                <dl class="submission-facts">
                  <div class="submission-fact submission-fact--wide">
                    <dt>Schedule</dt>
                    <dd>
                      <span>{{ formatDateTime(selectedSubmission.starts_at, selectedSubmission.timezone) }}</span>
                      <span class="submission-fact-separator" aria-hidden="true">→</span>
                      <span>{{ formatDateTime(selectedSubmission.ends_at, selectedSubmission.timezone) }}</span>
                    </dd>
                    <dd class="submission-fact-supporting">{{ selectedSubmission.timezone }}</dd>
                  </div>
                  <div class="submission-fact">
                    <dt>Location</dt>
                    <dd>{{ selectedSubmission.venue_name || 'Online' }}</dd>
                    <dd v-if="selectedSubmission.venue_address" class="submission-fact-supporting">{{ selectedSubmission.venue_address }}</dd>
                  </div>
                  <div class="submission-fact">
                    <dt>Submitted by</dt>
                    <dd>{{ selectedSubmission.organizer_name }}</dd>
                    <dd><a :href="`mailto:${selectedSubmission.organizer_email}`" class="submission-inline-link">{{ selectedSubmission.organizer_email }}</a></dd>
                  </div>
                </dl>

                <div v-if="selectedSubmission.registration_url || selectedSubmission.online_url || selectedSubmission.organizer_website" class="submission-resource-links" aria-label="Proposal links">
                  <a v-if="selectedSubmission.registration_url" :href="selectedSubmission.registration_url" target="_blank" rel="noreferrer">
                    Registration page
                    <span aria-hidden="true">↗</span>
                  </a>
                  <a v-if="selectedSubmission.online_url" :href="selectedSubmission.online_url" target="_blank" rel="noreferrer">
                    Online event
                    <span aria-hidden="true">↗</span>
                  </a>
                  <a v-if="selectedSubmission.organizer_website" :href="selectedSubmission.organizer_website" target="_blank" rel="noreferrer">
                    Organizer website
                    <span aria-hidden="true">↗</span>
                  </a>
                </div>
              </section>

              <aside v-if="selectedSubmission.notes" class="submission-note" aria-labelledby="submission-note-heading">
                <div class="submission-note-mark" aria-hidden="true">“</div>
                <div>
                  <h4 id="submission-note-heading">Note from submitter</h4>
                  <p>{{ selectedSubmission.notes }}</p>
                </div>
              </aside>

              <div v-if="selectedSubmission.review_status === 'rejected'" class="submission-rejection-summary">
                <div>
                  <p class="submission-field-label">Rejection reason</p>
                  <p class="mt-2 text-sm font-semibold leading-6 text-dc-ink">{{ rejectionCategoryLabel(selectedSubmission.rejection_category) }}</p>
                </div>
                <div v-if="selectedSubmission.organizer_message">
                  <p class="submission-field-label">Message sent to organizer</p>
                  <p class="mt-2 whitespace-pre-line text-sm leading-6 text-dc-gray">{{ selectedSubmission.organizer_message }}</p>
                </div>
                <div v-if="selectedSubmission.internal_note">
                  <p class="submission-field-label">Internal note · Private</p>
                  <p class="mt-2 whitespace-pre-line text-sm leading-6 text-dc-gray">{{ selectedSubmission.internal_note }}</p>
                </div>
              </div>

              <section v-if="selectedSubmission.email_deliveries.length" class="submission-support-section" aria-labelledby="submission-email-status">
                <div class="submission-section-heading">
                  <div>
                    <h4 id="submission-email-status">Email delivery</h4>
                    <p>Messages sent for this submission.</p>
                  </div>
                </div>
                <ul class="submission-delivery-list">
                  <li v-for="delivery in selectedSubmission.email_deliveries" :key="delivery.id" class="submission-delivery-row">
                    <div class="min-w-0">
                      <p class="text-sm font-semibold text-dc-ink">{{ emailKindLabel(delivery.kind) }}</p>
                      <p v-if="delivery.last_error" class="submission-delivery-error">{{ delivery.last_error }}</p>
                      <p v-else-if="delivery.accepted_at" class="mt-1 text-xs text-dc-gray">Accepted {{ formatDateTime(delivery.accepted_at) }}</p>
                    </div>
                    <div class="flex items-center gap-2">
                      <span class="submission-compact-badge" :class="emailStatusClass(delivery)">
                        {{ emailStatusLabel(delivery) }}
                      </span>
                      <button
                        v-if="delivery.status === 'failed'"
                        type="button"
                        class="submission-retry-button motion-press"
                        :disabled="isRetryingEmail(delivery.kind)"
                        @click="retryEmailMutation.mutate({ submissionId: selectedSubmission.id, kind: delivery.kind })"
                      >
                        {{ isRetryingEmail(delivery.kind) ? 'Retrying…' : 'Retry' }}
                      </button>
                    </div>
                  </li>
                </ul>
                <p class="submission-section-footnote">Accepted means the email provider accepted the message. Delivery and opens are not tracked yet.</p>
              </section>

              <section class="submission-support-section" aria-labelledby="submission-replies">
                <div class="submission-section-heading">
                  <div>
                    <h4 id="submission-replies">Organizer replies</h4>
                    <p>Replies to the decision email are kept with this submission.</p>
                  </div>
                  <span v-if="selectedSubmission.replies.length" class="submission-reply-count" :aria-label="`${selectedSubmission.replies.length} organizer replies`">
                    {{ selectedSubmission.replies.length }}
                  </span>
                </div>
                <div v-if="selectedSubmission.replies.length === 0" class="submission-replies-empty">
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M7 9h10M7 13h6m-7.5 6 1.1-3.3A7.5 7.5 0 1 1 19.5 14a7.5 7.5 0 0 1-10.7 3.7L5.5 19Z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                  <div>
                    <p>No replies yet</p>
                    <span>New replies will appear here automatically.</span>
                  </div>
                </div>
                <ul v-else class="submission-reply-list">
                  <li v-for="reply in selectedSubmission.replies" :key="reply.id" class="submission-reply-card">
                    <div class="flex flex-wrap items-start justify-between gap-3">
                      <div class="min-w-0">
                        <p class="break-all text-sm font-semibold text-dc-ink">{{ reply.sender_email }}</p>
                        <p class="mt-1 text-xs text-dc-gray">{{ formatDateTime(reply.received_at) }}</p>
                      </div>
                      <div class="flex items-center gap-2">
                        <span class="submission-compact-badge" :class="replySlackStatusClass(reply)">
                          {{ replySlackStatusLabel(reply) }}
                        </span>
                        <button
                          v-if="reply.slack_status === 'failed'"
                          type="button"
                          class="submission-retry-button motion-press"
                          :disabled="isRetryingReply(reply.id)"
                          @click="retryReplySlackMutation.mutate({ submissionId: selectedSubmission.id, replyId: reply.id })"
                        >
                          {{ isRetryingReply(reply.id) ? 'Retrying…' : 'Retry Slack' }}
                        </button>
                      </div>
                    </div>
                    <p v-if="reply.subject" class="mt-3 text-sm font-semibold text-dc-ink">{{ reply.subject }}</p>
                    <p v-if="reply.slack_status === 'failed' && reply.slack_error" class="submission-delivery-error mt-2">
                      {{ reply.slack_error }}
                    </p>
                    <p class="mt-2 whitespace-pre-line break-words text-sm leading-6 text-dc-gray">{{ replyPresentation(reply).message }}</p>
                    <details v-if="replyPresentation(reply).quotedMessage" class="submission-reply-original mt-4">
                      <summary class="submission-reply-original-trigger motion-press">
                        <span>Original email</span>
                        <span class="submission-reply-original-state" aria-hidden="true">
                          <span class="submission-reply-original-show">Show</span>
                          <span class="submission-reply-original-hide">Hide</span>
                        </span>
                      </summary>
                      <div class="submission-reply-original-content">
                        <p class="whitespace-pre-line break-words">{{ replyPresentation(reply).quotedMessage }}</p>
                      </div>
                    </details>
                    <p v-if="reply.attachments.length" class="mt-3 text-xs font-semibold text-dc-gray">
                      {{ reply.attachments.length }} attachment{{ reply.attachments.length === 1 ? '' : 's' }} received
                    </p>
                  </li>
                </ul>
              </section>
            </div>

            <footer class="submission-drawer-footer">
              <template v-if="selectedSubmission.review_status === 'pending'">
                <section class="submission-decision-checklist" aria-labelledby="submission-decision-checklist-title">
                  <div class="submission-decision-checklist-heading">
                    <div>
                      <p class="submission-section-kicker">Before you decide</p>
                      <h4 id="submission-decision-checklist-title">Check these four things</h4>
                    </div>
                    <p>All four should be true before approval.</p>
                  </div>
                  <ol class="submission-decision-checklist-items">
                    <li>
                      <span aria-hidden="true">1</span>
                      <div><strong>Community fit</strong><p>Relevant to Ghana's technology community.</p></div>
                    </li>
                    <li>
                      <span aria-hidden="true">2</span>
                      <div><strong>Event clarity</strong><p>Date, place or link, and registration are ready.</p></div>
                    </li>
                    <li>
                      <span aria-hidden="true">3</span>
                      <div><strong>Credibility</strong><p>The organizer and event details can be verified.</p></div>
                    </li>
                    <li>
                      <span aria-hidden="true">4</span>
                      <div><strong>Calendar value</strong><p>Not a duplicate, past, or avoidable major clash.</p></div>
                    </li>
                  </ol>
                </section>
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
                      <label for="organizer-message" class="submission-field-label">Message to organizer (optional)</label>
                      <p class="mt-1 text-xs leading-5 text-dc-gray">This message will be included in the rejection email.</p>
                      <textarea id="organizer-message" v-model="organizerMessage" maxlength="1200" rows="3" class="editorial-input mt-2 min-h-24 resize-none text-sm" placeholder="Add a helpful explanation or next step" />
                    </div>
                    <div>
                      <label for="internal-note" class="submission-field-label">Internal note (optional)</label>
                      <p class="mt-1 text-xs leading-5 text-dc-gray">Private to DevCongress organizers. Never included in email.</p>
                      <textarea id="internal-note" v-model="internalNote" maxlength="1000" rows="3" class="editorial-input mt-2 min-h-24 resize-none text-sm" placeholder="Add private review context" />
                    </div>
                    <div v-if="rejectionCategory" class="rounded-md border border-dc-border bg-white p-3">
                      <p class="submission-field-label">Email preview</p>
                      <p class="mt-2 text-xs font-semibold text-dc-ink">Update on your event submission: {{ selectedSubmission.title }}</p>
                      <p class="mt-2 text-xs leading-5 text-dc-gray">{{ rejectionCategoryLabel(rejectionCategory) }}</p>
                      <p v-if="organizerMessage" class="mt-2 whitespace-pre-line text-xs leading-5 text-dc-gray">{{ organizerMessage }}</p>
                    </div>
                  </div>
                </Transition>
                <div class="flex flex-wrap gap-3">
                  <button
                    type="button"
                    class="editorial-action motion-press min-h-11 flex-1 justify-center disabled:cursor-not-allowed disabled:opacity-50"
                    :disabled="rejecting || approveMutation.isPending.value || rejectMutation.isPending.value"
                    @click="approveMutation.mutate(selectedSubmission)"
                  >
                    {{ approveMutation.isPending.value ? 'Publishing…' : 'Approve & publish' }}
                  </button>
                  <button v-if="!rejecting" type="button" class="editorial-secondary-action motion-press min-h-11" @click="rejecting = true">Reject</button>
                  <template v-else>
                    <button type="button" class="motion-press min-h-11 rounded-md border-2 border-red-800 bg-red-800 px-5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-white disabled:cursor-not-allowed disabled:opacity-50" :disabled="!rejectionCategory || rejectMutation.isPending.value" @click="rejectMutation.mutate(selectedSubmission)">
                      {{ rejectMutation.isPending.value ? 'Rejecting…' : 'Reject & notify organizer' }}
                    </button>
                    <button type="button" class="editorial-secondary-action motion-press min-h-11" @click="resetRejectionForm">Cancel</button>
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
