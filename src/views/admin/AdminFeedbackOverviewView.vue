<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, ref, watch } from 'vue';
import { adminPath } from '@/src/admin-routes';
import AppDropdown from '@/src/components/AppDropdown.vue';
import AdminFeedbackOverviewPageSkeleton from '@/src/components/ui/page-skeletons/AdminFeedbackOverviewPageSkeleton.vue';
import {
  fetchFeedbackMonths,
  fetchJson,
  fetchRouteFeedbackInbox,
  queryKeys,
  summarizeRouteFeedback,
type FeedbackMonth,
  type FeedbackMonthEvent,
  type RouteFeedbackInboxResponse,
  type RouteFeedbackSubmission,
  type RouteFeedbackSummary,
} from '@/src/lib/api';
import { notify } from '@/src/lib/notify';
import type { FeedbackKind, FeedbackStatus } from '@/types/supabase';

const FEEDBACK_START_MONTH = '2026-01';
const emptyRouteFeedbackSummary: RouteFeedbackSummary = {
  total: 0,
  new: 0,
  reviewing: 0,
  done: 0,
  wont_fix: 0,
};
const routeFeedbackStatuses: { value: FeedbackStatus; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'reviewing', label: 'Reviewing' },
  { value: 'done', label: 'Done' },
  { value: 'wont_fix', label: "Won't fix" },
];
const routeFeedbackSectionMeta = [
  {
    key: 'new',
    title: 'New',
    description: 'Fresh notes that still need a first pass.',
  },
  {
    key: 'reviewing',
    title: 'Reviewing',
    description: 'Feedback that someone has picked up and is working through.',
  },
  {
    key: 'resolved',
    title: 'Resolved',
    description: 'Closed feedback, including shipped fixes and items we will not change.',
  },
] as const;

const queryClient = useQueryClient();
const selectedFeedbackStream = ref<'website' | 'event' | null>(null);
const selectedMonthKey = ref('');
const selectedYear = ref('');
const routeFeedbackRequested = ref(false);
const routeFeedbackActionError = ref('');
const expandedRouteFeedbackIds = ref<string[]>([]);
const feedbackMonthsQuery = useQuery({
  queryKey: queryKeys.feedbackMonths,
  queryFn: fetchFeedbackMonths,
});
const routeFeedbackQuery = useQuery({
  queryKey: queryKeys.routeFeedbackInbox,
  queryFn: fetchRouteFeedbackInbox,
  enabled: false,
  refetchOnWindowFocus: false,
  staleTime: 5000,
});
const loading = computed(() => feedbackMonthsQuery.isPending.value);
const error = computed(() => feedbackMonthsQuery.error.value?.message ?? '');
const months = computed(() => (feedbackMonthsQuery.data.value?.months ?? []).filter((month) => month.month >= FEEDBACK_START_MONTH));
const routeFeedbackItems = computed(() => routeFeedbackQuery.data.value?.submissions ?? []);
const routeFeedbackSummary = computed(() => routeFeedbackQuery.data.value?.summary ?? emptyRouteFeedbackSummary);
const routeFeedbackRefreshing = computed(() => routeFeedbackQuery.isFetching.value);
const routeFeedbackOpenCount = computed(() => routeFeedbackSummary.value.new + routeFeedbackSummary.value.reviewing);
const routeFeedbackSections = computed(() => {
  const items = routeFeedbackItems.value;

  return routeFeedbackSectionMeta.map((section) => {
    const sectionItems = items.filter((item) => {
      if (section.key === 'resolved') {
        return item.status === 'done' || item.status === 'wont_fix';
      }

      return item.status === section.key;
    });

    return {
      ...section,
      items: sectionItems,
    };
  }).filter((section) => section.items.length > 0);
});
const selectedMonth = computed(() => months.value.find((month) => month.month === selectedMonthKey.value) ?? months.value[0] ?? null);
const eventFeedbackCycleCount = computed(() => months.value.reduce((total, month) => total + month.event_count, 0));
const eventFeedbackTotalResponses = computed(() => months.value.reduce((total, month) => total + month.total_responses, 0));
const availableYears = computed(() => {
  const years = new Set(months.value.map((month) => month.month.slice(0, 4)));
  years.add('2026');
  return Array.from(years).sort((a, b) => b.localeCompare(a));
});
const monthsForSelectedYear = computed(() => months.value
  .filter((month) => month.month.startsWith(`${selectedYear.value}-`))
  .sort((a, b) => Number(a.month.slice(5, 7)) - Number(b.month.slice(5, 7))));
const eventPeriodsForSelectedYear = computed(() => {
  const activePeriods = monthsForSelectedYear.value.filter((month) => month.event_count > 0 || month.total_responses > 0);
  return activePeriods.length > 0 ? activePeriods : monthsForSelectedYear.value;
});
const selectedMonthHasResponses = computed(() => (selectedMonth.value?.total_responses ?? 0) > 0);

function currentFeedbackMonthKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

watch(months, (availableMonths) => {
  if (availableMonths.length === 0) {
    selectedMonthKey.value = '';
    selectedYear.value = '';
    return;
  }

  if (!selectedMonthKey.value || !availableMonths.some((month) => month.month === selectedMonthKey.value)) {
    const currentMonthKey = currentFeedbackMonthKey();
    selectedMonthKey.value = availableMonths.find((month) => month.month === currentMonthKey)?.month ?? availableMonths[0].month;
  }

  const monthYear = selectedMonthKey.value.slice(0, 4);
  if (!selectedYear.value || !availableYears.value.includes(selectedYear.value)) {
    selectedYear.value = monthYear;
  }
}, { immediate: true });

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
}

function formatWindow(event: FeedbackMonthEvent): string {
  if (!event.feedback_window.opens_at || !event.feedback_window.closes_at) {
    return 'Window follows event completion';
  }

  const opens = new Date(event.feedback_window.opens_at).toLocaleDateString('en', { month: 'short', day: 'numeric' });
  const closes = new Date(event.feedback_window.closes_at).toLocaleDateString('en', { month: 'short', day: 'numeric' });
  return `${opens} to ${closes}`;
}

function eventStatusLabel(event: FeedbackMonthEvent): string {
  if (event.is_open) return 'Open now';
  if (!event.campaign_configured && event.event.status === 'completed') return 'Auto-ready';
  if (!event.campaign) return 'Not configured';
  return event.campaign.status.replace('_', ' ');
}

function statusClass(event: FeedbackMonthEvent): string {
  if (event.is_open) return 'border-dc-success bg-dc-success-soft text-dc-success';
  if (!event.campaign_configured && event.event.status === 'completed') return 'border-dc-info bg-dc-info-soft text-dc-info';
  if (event.campaign?.status === 'closed') return 'border-dc-border bg-dc-paper-warm text-dc-gray';
  return 'border-dc-ink bg-dc-yellow text-dc-ink';
}

function responseCountDisabled(event: FeedbackMonthEvent): boolean {
  const wasPublished = event.is_open || event.campaign?.status === 'active' || event.campaign?.status === 'closed';
  return event.response_count === 0 && !wasPublished;
}

function eventCampaignPublished(event: FeedbackMonthEvent): boolean {
  return event.is_open || event.campaign?.status === 'active' || event.campaign?.status === 'closed';
}

function feedbackDisplayPath(event: FeedbackMonthEvent) {
  return adminPath(`feedback-display/${event.event.id}`);
}

function setYear(year: string) {
  selectedYear.value = year;
  const currentMonthKey = currentFeedbackMonthKey();
  const yearMonths = months.value.filter((month) => month.month.startsWith(`${year}-`));
  selectedMonthKey.value = yearMonths.find((month) => month.month === currentMonthKey)?.month ?? yearMonths[0]?.month ?? '';
}

function monthShortLabel(month: FeedbackMonth): string {
  const date = new Date(`${month.month}-01T00:00:00.000Z`);
  return new Intl.DateTimeFormat('en', { month: 'short', timeZone: 'UTC' }).format(date);
}

function periodButtonDetail(month: FeedbackMonth): string {
  return `${month.event_count} event${month.event_count === 1 ? '' : 's'}`;
}

const routeFeedbackStatusMutation = useMutation({
  mutationFn: ({ feedbackId, status }: { feedbackId: string; status: FeedbackStatus }) => fetchJson<RouteFeedbackSubmission>(
    `/api/feedback/inbox/${feedbackId}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    },
  ),
  onMutate: async ({ feedbackId, status }) => {
    routeFeedbackActionError.value = '';
    await queryClient.cancelQueries({ queryKey: queryKeys.routeFeedbackInbox });

    const previous = queryClient.getQueryData<RouteFeedbackInboxResponse>(queryKeys.routeFeedbackInbox);
    if (previous) {
      const submissions = previous.submissions.map((entry) => (entry.id === feedbackId ? { ...entry, status } : entry));
      queryClient.setQueryData<RouteFeedbackInboxResponse>(queryKeys.routeFeedbackInbox, {
        submissions,
        summary: summarizeRouteFeedback(submissions),
      });
    }

    return { previous };
  },
  onError: (caught, _variables, context) => {
    if (context?.previous) {
      queryClient.setQueryData(queryKeys.routeFeedbackInbox, context.previous);
    }
    routeFeedbackActionError.value = caught instanceof Error ? caught.message : 'Unable to update feedback status';
    notify.error(routeFeedbackActionError.value);
  },
  onSuccess: (updated) => {
    const current = queryClient.getQueryData<RouteFeedbackInboxResponse>(queryKeys.routeFeedbackInbox);
    if (!current) return;

    const submissions = current.submissions.map((entry) => (entry.id === updated.id ? updated : entry));
    queryClient.setQueryData<RouteFeedbackInboxResponse>(queryKeys.routeFeedbackInbox, {
      submissions,
      summary: summarizeRouteFeedback(submissions),
    });
  },
  onSettled: () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.routeFeedbackInbox });
  },
});

const archiveResolvedRouteFeedbackMutation = useMutation({
  mutationFn: () => fetchJson<{ archived_count: number }>(
    '/api/feedback/inbox/archive-resolved',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
  ),
  onMutate: async () => {
    routeFeedbackActionError.value = '';
    await queryClient.cancelQueries({ queryKey: queryKeys.routeFeedbackInbox });

    const previous = queryClient.getQueryData<RouteFeedbackInboxResponse>(queryKeys.routeFeedbackInbox);
    if (previous) {
      const submissions = previous.submissions.filter((entry) => entry.status !== 'done' && entry.status !== 'wont_fix');
      queryClient.setQueryData<RouteFeedbackInboxResponse>(queryKeys.routeFeedbackInbox, {
        submissions,
        summary: summarizeRouteFeedback(submissions),
      });
    }

    return { previous };
  },
  onError: (caught, _variables, context) => {
    if (context?.previous) {
      queryClient.setQueryData(queryKeys.routeFeedbackInbox, context.previous);
    }
    routeFeedbackActionError.value = caught instanceof Error ? caught.message : 'Unable to clear resolved feedback';
    notify.error(routeFeedbackActionError.value);
  },
  onSettled: () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.routeFeedbackInbox });
  },
});

function updateRouteFeedbackStatus(item: RouteFeedbackSubmission, status: FeedbackStatus) {
  if (item.status === status) return;
  routeFeedbackStatusMutation.mutate({ feedbackId: item.id, status });
}

function isUpdatingRouteFeedback(feedbackId: string, status: FeedbackStatus) {
  return routeFeedbackStatusMutation.isPending.value
    && routeFeedbackStatusMutation.variables.value?.feedbackId === feedbackId
    && routeFeedbackStatusMutation.variables.value?.status === status;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function feedbackTypeLabel(type: FeedbackKind): string {
  const labels: Record<FeedbackKind, string> = {
    bug: 'Bug',
    confusing: 'Confusing',
    suggestion: 'Suggestion',
    praise: 'Praise',
  };
  return labels[type] ?? type;
}

function feedbackStatusClass(status: FeedbackStatus): string {
  const classes: Record<FeedbackStatus, string> = {
    new: 'border-dc-pink bg-dc-pink/10 text-dc-pink',
    reviewing: 'border-dc-info bg-dc-info-soft text-dc-info',
    done: 'border-dc-success bg-dc-success-soft text-dc-success',
    wont_fix: 'border-dc-border bg-dc-paper-warm text-dc-gray',
  };
  return classes[status] ?? classes.new;
}

function feedbackMetaBits(item: RouteFeedbackSubmission): string[] {
  const bits = [`From ${item.tester_name}`];

  if (item.page_path) {
    bits.push(item.page_path);
  }

  if (item.viewport_width && item.viewport_height) {
    bits.push(`${item.viewport_width} x ${item.viewport_height}`);
  }

  return bits;
}

function isLongRouteFeedback(item: RouteFeedbackSubmission): boolean {
  return item.message.length > 180 || item.message.split('\n').length > 3;
}

function isRouteFeedbackExpanded(feedbackId: string): boolean {
  return expandedRouteFeedbackIds.value.includes(feedbackId);
}

function toggleRouteFeedbackExpanded(feedbackId: string) {
  expandedRouteFeedbackIds.value = isRouteFeedbackExpanded(feedbackId)
    ? expandedRouteFeedbackIds.value.filter((entryId) => entryId !== feedbackId)
    : [...expandedRouteFeedbackIds.value, feedbackId];
}

function feedbackStatusOptionLabel(status: FeedbackStatus): string {
  return routeFeedbackStatuses.find((option) => option.value === status)?.label ?? status;
}

async function refreshRouteFeedback() {
  routeFeedbackRequested.value = true;
  routeFeedbackActionError.value = '';
  const result = await routeFeedbackQuery.refetch();
  if (result.isError) {
    const message = result.error instanceof Error ? result.error.message : 'Unable to load feedback inbox';
    routeFeedbackActionError.value = message;
    notify.error(message);
  }
}

async function archiveResolvedRouteFeedback() {
  const resolvedCount = routeFeedbackSections.value.find((section) => section.key === 'resolved')?.items.length ?? 0;
  if (resolvedCount === 0) return;

  const confirmed = window.confirm(`Archive ${resolvedCount} resolved feedback item${resolvedCount === 1 ? '' : 's'}? They will disappear from the active inbox.`);
  if (!confirmed) return;

  await archiveResolvedRouteFeedbackMutation.mutateAsync();
}
</script>

<template>
  <div class="editorial-page">
    <div class="editorial-wrap">
      <AdminFeedbackOverviewPageSkeleton v-if="loading" />

      <template v-else>
        <header class="feedback-hub-hero">
          <div>
            <p class="editorial-eyebrow">feedback hub</p>
            <h1 class="editorial-title">Feedback</h1>
            <p class="editorial-subtitle max-w-3xl">Two streams: website feedback from the floating widget, and event feedback from monthly, quarterly, or one-off meetup forms.</p>
          </div>
        </header>

        <div v-if="error" class="mb-6 rounded-md border-2 border-red-700 bg-red-50 p-4 text-sm font-semibold text-red-800">{{ error }}</div>

        <section class="feedback-category-grid" aria-label="Feedback categories">
          <article
            class="feedback-category-card"
            :class="{ 'feedback-category-card--active': selectedFeedbackStream === 'website' }"
          >
            <p class="editorial-eyebrow mb-2">website feedback</p>
            <h2>Website notes</h2>
            <p>Bug, confusing, and suggestion notes sent from the floating feedback widget.</p>
            <div class="feedback-category-meta">
              <strong>{{ routeFeedbackOpenCount }}</strong>
              <span>open</span>
            </div>
            <button
              type="button"
              class="feedback-card-action"
              :aria-pressed="selectedFeedbackStream === 'website'"
              @click="selectedFeedbackStream = 'website'"
            >
              {{ selectedFeedbackStream === 'website' ? 'Viewing' : 'Open Website Feedback' }}
            </button>
          </article>
          <article
            class="feedback-category-card"
            :class="{ 'feedback-category-card--active': selectedFeedbackStream === 'event' }"
          >
            <p class="editorial-eyebrow mb-2">event feedback</p>
            <h2>Meetup forms</h2>
            <p>Response signals from monthly, quarterly, and one-off event feedback campaigns.</p>
            <div class="feedback-category-meta">
              <strong>{{ eventFeedbackTotalResponses }}</strong>
              <span>{{ eventFeedbackCycleCount }} event{{ eventFeedbackCycleCount === 1 ? '' : 's' }}</span>
            </div>
            <button
              type="button"
              class="feedback-card-action"
              :aria-pressed="selectedFeedbackStream === 'event'"
              @click="selectedFeedbackStream = 'event'"
            >
              {{ selectedFeedbackStream === 'event' ? 'Viewing' : 'Open Event Feedback' }}
            </button>
          </article>
        </section>

        <section v-if="selectedFeedbackStream === 'website'" class="feedback-hub-section">
          <div class="feedback-section-header">
            <div>
              <p class="editorial-eyebrow mb-2">website feedback</p>
              <h2>Website inbox</h2>
              <p>Notes from site visitors and testers. These are not tied to an event month.</p>
            </div>
            <div class="feedback-section-actions">
              <div class="feedback-mini-metrics" aria-label="Website feedback status counts">
                <span><strong>{{ routeFeedbackSummary.new }}</strong> New</span>
                <span><strong>{{ routeFeedbackSummary.reviewing }}</strong> Review</span>
                <span><strong>{{ routeFeedbackSummary.done + routeFeedbackSummary.wont_fix }}</strong> Resolved</span>
                <span><strong>{{ routeFeedbackSummary.total }}</strong> Total</span>
              </div>
            </div>
          </div>

          <div v-if="!routeFeedbackRequested" class="p-5">
            <div class="feedback-empty-state feedback-empty-state--with-action">
              <div class="feedback-empty-state-copy">
                <p class="editorial-eyebrow mb-2">manual sync</p>
                <h3>Refresh website feedback when you need it.</h3>
                <p>The inbox stays quiet until you ask for the latest notes from the floating widget.</p>
              </div>
              <button
                type="button"
                class="feedback-card-action feedback-empty-state-action"
                :disabled="routeFeedbackRefreshing"
                @click="refreshRouteFeedback"
              >
                <span>{{ routeFeedbackRefreshing ? 'Refreshing...' : 'Refresh' }}</span>
              </button>
            </div>
          </div>
          <div v-else-if="routeFeedbackItems.length === 0" class="p-5">
            <div class="feedback-empty-state feedback-empty-state--with-action">
              <div class="feedback-empty-state-copy">
                <p class="editorial-eyebrow mb-2">quiet inbox</p>
                <h3>No website feedback yet.</h3>
                <p>When people use the floating widget, their notes will land here with page and viewport context.</p>
              </div>
              <button
                type="button"
                class="feedback-card-action feedback-empty-state-action"
                :disabled="routeFeedbackRefreshing"
                @click="refreshRouteFeedback"
              >
                <span>{{ routeFeedbackRefreshing ? 'Refreshing...' : 'Refresh' }}</span>
              </button>
            </div>
          </div>
          <div v-else class="space-y-6 p-5">
            <section
              v-for="section in routeFeedbackSections"
              :key="section.key"
              class="space-y-3"
            >
              <div class="feedback-list-heading">
                <div>
                  <h3>{{ section.title }}</h3>
                  <p>{{ section.description }}</p>
                </div>
                <div class="flex flex-wrap items-center gap-3">
                  <p class="font-mono text-[11px] font-bold uppercase tracking-wide text-dc-gray">
                    {{ section.items.length }} item{{ section.items.length === 1 ? '' : 's' }}
                  </p>
                  <button
                    v-if="section.key === 'resolved'"
                    type="button"
                    class="feedback-quiet-button"
                    :disabled="archiveResolvedRouteFeedbackMutation.isPending.value"
                    @click="archiveResolvedRouteFeedback"
                  >
                    {{ archiveResolvedRouteFeedbackMutation.isPending.value ? 'Clearing...' : 'Clear resolved' }}
                  </button>
                </div>
              </div>

              <article
                v-for="item in section.items"
                :key="item.id"
                class="feedback-inbox-item"
                :class="{ 'feedback-inbox-item--muted': section.key === 'resolved' }"
              >
                <div class="min-w-0">
                  <div class="mb-3 flex flex-wrap items-center gap-2">
                    <span class="rounded-md border px-2.5 py-1 font-mono text-[11px] font-bold uppercase tracking-wide" :class="feedbackStatusClass(item.status)">
                      {{ item.status.replace('_', ' ') }}
                    </span>
                    <span class="rounded-md border border-dc-border bg-dc-paper-warm px-2.5 py-1 font-mono text-[11px] font-bold uppercase tracking-wide text-dc-gray">
                      {{ feedbackTypeLabel(item.type) }}
                    </span>
                    <span class="font-mono text-[11px] font-bold uppercase tracking-wide text-dc-gray">
                      {{ formatDateTime(item.created_at) }}
                    </span>
                  </div>
                  <p
                    class="text-base font-semibold leading-7 text-dc-ink whitespace-pre-line"
                    :class="[
                      isLongRouteFeedback(item) && !isRouteFeedbackExpanded(item.id) ? 'line-clamp-3 whitespace-normal' : '',
                      section.key === 'resolved' ? 'text-dc-gray' : '',
                    ]"
                  >
                    {{ item.message }}
                  </p>
                  <button
                    v-if="isLongRouteFeedback(item)"
                    type="button"
                    class="mt-2 font-mono text-[11px] font-bold uppercase tracking-wide text-dc-pink underline decoration-dc-yellow decoration-2 underline-offset-4"
                    @click="toggleRouteFeedbackExpanded(item.id)"
                  >
                    {{ isRouteFeedbackExpanded(item.id) ? 'Show less' : 'Read full note' }}
                  </button>
                  <div
                    class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold"
                    :class="section.key === 'resolved' ? 'text-dc-gray/90' : 'text-dc-gray'"
                  >
                    <span
                      v-for="meta in feedbackMetaBits(item)"
                      :key="meta"
                      class="min-w-0"
                    >
                      {{ meta }}
                    </span>
                  </div>
                </div>

                <div class="w-full lg:justify-self-end">
                  <p class="mb-2 font-mono text-[10px] font-bold uppercase tracking-wide text-dc-gray">Status</p>
                  <AppDropdown
                    :model-value="item.status"
                    :options="routeFeedbackStatuses"
                    :disabled="routeFeedbackStatusMutation.isPending.value || archiveResolvedRouteFeedbackMutation.isPending.value"
                    @update:model-value="(value) => updateRouteFeedbackStatus(item, value as FeedbackStatus)"
                  />
                  <p
                    v-if="isUpdatingRouteFeedback(item.id, item.status)"
                    class="mt-2 text-right font-mono text-[10px] font-bold uppercase tracking-wide text-dc-gray"
                  >
                    Saving…
                  </p>
                  <p v-else class="mt-2 text-right font-mono text-[10px] font-bold uppercase tracking-wide text-dc-gray">
                    {{ feedbackStatusOptionLabel(item.status) }}
                  </p>
                </div>
              </article>
            </section>
          </div>
        </section>

        <section v-if="selectedFeedbackStream === 'event' && months.length === 0" class="editorial-panel p-8">
          <p class="editorial-eyebrow">fresh start</p>
          <h2 class="text-3xl font-black tracking-tight text-dc-ink">No event feedback yet.</h2>
          <p class="mt-3 max-w-2xl text-base leading-7 text-dc-gray">Create events first. Completed, monthly, quarterly, and one-off events can all expose feedback forms.</p>
        </section>

        <template v-else-if="selectedFeedbackStream === 'event' && selectedMonth">
          <section class="feedback-hub-section mt-8">
            <div class="feedback-section-header feedback-section-header--reports">
              <div class="feedback-reports-header-layout">
                <div class="feedback-reports-copy">
                  <p class="editorial-eyebrow mb-2">event feedback</p>
                  <h2>Reports</h2>
                  <p>Choose a period to review event-specific feedback. The events may be monthly, quarterly, or one-off.</p>
                </div>
                <div class="feedback-report-controls">
                  <div class="feedback-year-switch shrink-0" role="tablist" aria-label="Feedback report year">
                    <button
                      v-for="year in availableYears"
                      :key="year"
                      type="button"
                      class="feedback-year-button motion-press"
                      :class="selectedYear === year ? 'feedback-year-button--active' : ''"
                      :aria-selected="selectedYear === year"
                      role="tab"
                      @click="setYear(year)"
                    >
                      {{ year }}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div class="border-b border-dc-border px-5 py-4">
              <p class="editorial-eyebrow mb-3">event periods</p>
              <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                <button
                  v-for="month in eventPeriodsForSelectedYear"
                  :key="month.month"
                  type="button"
                  class="feedback-month-button motion-press"
                  :class="selectedMonthKey === month.month ? 'feedback-month-button--active' : ''"
                  @click="selectedMonthKey = month.month"
                >
                  <span>{{ monthShortLabel(month) }}</span>
                  <strong>{{ periodButtonDetail(month) }}</strong>
                </button>
              </div>
            </div>

            <div
              class="grid gap-0"
              :class="selectedMonthHasResponses ? 'lg:grid-cols-[minmax(0,1fr)_320px]' : ''"
            >
              <div class="min-w-0">
                <Transition name="feedback-event-list" mode="out-in">
                  <div
                    :key="selectedMonthKey"
                    class="feedback-event-list"
                  >
                    <div v-if="selectedMonth.events.length === 0" class="p-6">
                      <div class="feedback-empty-state">
                        <p class="editorial-eyebrow mb-2">empty month</p>
                        <h3 class="text-2xl font-black tracking-tight text-dc-ink">No feedback cycle yet.</h3>
                        <p class="mt-2 max-w-xl text-sm leading-6 text-dc-gray">When an event is scheduled for {{ selectedMonth.label }}, its feedback window and response signal will appear here.</p>
                      </div>
                    </div>

                    <article v-for="item in selectedMonth.events" :key="item.event.id" class="feedback-event-row">
                      <div class="feedback-event-main">
                        <div class="feedback-event-title-row">
                          <h3 class="text-xl font-black tracking-tight text-dc-ink">{{ item.event.name }}</h3>
                          <span class="rounded-md border px-2.5 py-1 font-mono text-[11px] font-bold uppercase tracking-wide" :class="statusClass(item)">
                            {{ eventStatusLabel(item) }}
                          </span>
                        </div>
                        <p class="feedback-event-meta">{{ formatDate(item.event.event_date) }}</p>
                      </div>

                      <div class="feedback-event-side">
                        <dl
                          class="feedback-event-response"
                          :class="{ 'feedback-event-response--disabled': responseCountDisabled(item) }"
                        >
                          <div class="feedback-event-stat">
                            <dt>Responses</dt>
                            <dd>{{ item.response_count }}</dd>
                          </div>
                          <div class="feedback-event-stat">
                            <dt>Rating</dt>
                            <dd>{{ item.response_count > 0 ? (item.insights.average_rating ?? '-') : '-' }}</dd>
                          </div>
                          <div class="feedback-event-stat">
                            <dt>Attend again</dt>
                            <dd>{{ item.response_count > 0 && item.insights.attend_again_percent !== null ? `${item.insights.attend_again_percent}%` : '-' }}</dd>
                          </div>
                        </dl>

                        <div class="feedback-event-actions">
                          <RouterLink
                            :to="{ path: adminPath(`events/${item.event.id}/feedback`), query: { from: 'feedback', view: 'responses' } }"
                            class="editorial-secondary-action px-4 py-2 text-xs"
                          >
                            {{ eventCampaignPublished(item) ? 'View responses' : 'Configure' }}
                          </RouterLink>
                          <RouterLink
                            v-if="item.is_open"
                            :to="feedbackDisplayPath(item)"
                            target="_blank"
                            rel="noreferrer"
                            class="rounded-md border-2 border-dc-ink bg-dc-yellow px-4 py-2 font-mono text-xs font-bold uppercase tracking-wide text-dc-ink hover:bg-dc-yellow/80"
                          >
                            Show QR
                          </RouterLink>
                          <RouterLink
                            v-if="!eventCampaignPublished(item)"
                            :to="`/feedback/${item.event.id}`"
                            class="rounded-md border-2 border-dc-border bg-dc-paper px-4 py-2 font-mono text-xs font-bold uppercase tracking-wide text-dc-gray hover:border-dc-ink hover:text-dc-ink"
                          >
                            Preview
                          </RouterLink>
                        </div>
                      </div>
                    </article>
                  </div>
                </Transition>
              </div>
            </div>
          </section>
        </template>
      </template>
    </div>
  </div>
</template>
