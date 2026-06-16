<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, ref, watch } from 'vue';
import { adminPath } from '@/src/admin-routes';
import ViewSkeleton from '@/src/components/ui/ViewSkeleton.vue';
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

const queryClient = useQueryClient();
const selectedMonthKey = ref('');
const selectedYear = ref('');
const routeFeedbackActionError = ref('');
const feedbackMonthsQuery = useQuery({
  queryKey: queryKeys.feedbackMonths,
  queryFn: fetchFeedbackMonths,
});
const routeFeedbackQuery = useQuery({
  queryKey: queryKeys.routeFeedbackInbox,
  queryFn: fetchRouteFeedbackInbox,
});
const loading = computed(() => feedbackMonthsQuery.isPending.value);
const error = computed(() => feedbackMonthsQuery.error.value?.message ?? '');
const months = computed(() => (feedbackMonthsQuery.data.value?.months ?? []).filter((month) => month.month >= FEEDBACK_START_MONTH));
const routeFeedbackLoading = computed(() => routeFeedbackQuery.isPending.value);
const routeFeedbackError = computed(() => routeFeedbackActionError.value || routeFeedbackQuery.error.value?.message || '');
const routeFeedbackItems = computed(() => routeFeedbackQuery.data.value?.submissions ?? []);
const routeFeedbackSummary = computed(() => routeFeedbackQuery.data.value?.summary ?? emptyRouteFeedbackSummary);
const selectedMonth = computed(() => months.value.find((month) => month.month === selectedMonthKey.value) ?? months.value[0] ?? null);
const availableYears = computed(() => {
  const years = new Set(months.value.map((month) => month.month.slice(0, 4)));
  years.add('2026');
  return Array.from(years).sort((a, b) => b.localeCompare(a));
});
const monthsForSelectedYear = computed(() => months.value
  .filter((month) => month.month.startsWith(`${selectedYear.value}-`))
  .sort((a, b) => Number(a.month.slice(5, 7)) - Number(b.month.slice(5, 7))));
const monthSummaryCards = computed(() => {
  const month = selectedMonth.value;
  if (!month) return [];

  return [
    {
      label: 'Responses',
      value: String(month.total_responses),
      detail: `${month.event_count} event${month.event_count === 1 ? '' : 's'} in this month`,
      tone: 'responses',
    },
    {
      label: 'Avg rating',
      value: month.average_rating === null ? '-' : `${month.average_rating}/5`,
      detail: month.average_rating === null ? 'Waiting for ratings' : 'Across submitted ratings',
      tone: 'rating',
    },
    {
      label: 'Attend again',
      value: month.attend_again_percent === null ? '-' : `${month.attend_again_percent}%`,
      detail: month.attend_again_percent === null ? 'No yes/no answers yet' : 'Positive intent signal',
      tone: 'attend',
    },
    {
      label: 'Comments',
      value: String(month.comment_count),
      detail: month.top_talk_label ? `Top talk: ${month.top_talk_label}` : 'Improvement notes and open text',
      tone: 'comments',
    },
  ];
});

watch(months, (availableMonths) => {
  if (availableMonths.length === 0) {
    selectedMonthKey.value = '';
    selectedYear.value = '';
    return;
  }

  if (!selectedMonthKey.value || !availableMonths.some((month) => month.month === selectedMonthKey.value)) {
    selectedMonthKey.value = availableMonths[0].month;
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

function cardToneClass(tone: string): string {
  const tones: Record<string, string> = {
    responses: 'text-dc-pink',
    rating: 'text-dc-ink',
    attend: 'text-dc-success',
    comments: 'text-dc-info',
  };
  return tones[tone] ?? tones.responses;
}

function setYear(year: string) {
  selectedYear.value = year;
  selectedMonthKey.value = months.value.find((month) => month.month.startsWith(`${year}-`))?.month ?? '';
}

function monthShortLabel(month: FeedbackMonth): string {
  const date = new Date(`${month.month}-01T00:00:00.000Z`);
  return new Intl.DateTimeFormat('en', { month: 'short', timeZone: 'UTC' }).format(date);
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
</script>

<template>
  <div class="editorial-page">
    <div class="editorial-wrap">
      <ViewSkeleton v-if="loading" variant="ledger" :rows="5" />

      <template v-else>
        <header class="editorial-header flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p class="editorial-eyebrow">feedback command</p>
            <h1 class="editorial-title">Monthly feedback</h1>
            <p class="editorial-subtitle">Switch month by month, see whether the form opened, and read the combined response signal for that meetup cycle.</p>
          </div>
          <RouterLink
            v-if="selectedMonth?.events[0]"
            :to="{ path: adminPath(`events/${selectedMonth.events[0].event.id}/feedback`), query: { from: 'feedback' } }"
            class="editorial-action shrink-0"
          >
            Configure Month
          </RouterLink>
        </header>

        <div v-if="error" class="mb-6 rounded-md border-2 border-red-700 bg-red-50 p-4 text-sm font-semibold text-red-800">{{ error }}</div>
        <div v-if="routeFeedbackError" class="mb-6 rounded-md border-2 border-red-700 bg-red-50 p-4 text-sm font-semibold text-red-800">{{ routeFeedbackError }}</div>

        <section class="mb-8 editorial-panel overflow-hidden">
          <div class="border-b-2 border-dc-ink bg-dc-yellow px-5 py-4">
            <div class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p class="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-dc-pink">app feedback inbox</p>
                <h2 class="mt-1 text-2xl font-black tracking-tight text-dc-ink">Route feedback</h2>
                <p class="mt-2 max-w-3xl text-sm leading-6 text-dc-gray">
                  Bug, confusing, and suggestion notes sent from the floating feedback widget. This is separate from post-event attendee feedback.
                </p>
              </div>
              <div class="grid grid-cols-4 gap-2 text-center font-mono text-[10px] font-bold uppercase tracking-wide text-dc-gray sm:min-w-[360px]">
                <div class="rounded-md border border-dc-ink bg-dc-paper px-3 py-2">
                  <strong class="block text-xl text-dc-ink">{{ routeFeedbackSummary.new }}</strong>
                  New
                </div>
                <div class="rounded-md border border-dc-ink bg-dc-paper px-3 py-2">
                  <strong class="block text-xl text-dc-ink">{{ routeFeedbackSummary.reviewing }}</strong>
                  Review
                </div>
                <div class="rounded-md border border-dc-ink bg-dc-paper px-3 py-2">
                  <strong class="block text-xl text-dc-ink">{{ routeFeedbackSummary.done }}</strong>
                  Done
                </div>
                <div class="rounded-md border border-dc-ink bg-dc-paper px-3 py-2">
                  <strong class="block text-xl text-dc-ink">{{ routeFeedbackSummary.total }}</strong>
                  Total
                </div>
              </div>
            </div>
          </div>

          <div v-if="routeFeedbackLoading" class="p-5">
            <ViewSkeleton variant="ledger" :rows="3" />
          </div>
          <div v-else-if="routeFeedbackItems.length === 0" class="p-5">
            <div class="rounded-lg border border-dashed border-dc-border bg-dc-paper-warm p-5">
              <p class="editorial-eyebrow mb-2">quiet inbox</p>
              <h3 class="text-2xl font-black tracking-tight text-dc-ink">No app feedback yet.</h3>
              <p class="mt-2 max-w-xl text-sm leading-6 text-dc-gray">When people use the floating feedback widget, their notes will land here with page and viewport context.</p>
            </div>
          </div>
          <div v-else class="divide-y divide-dc-border">
            <article
              v-for="item in routeFeedbackItems"
              :key="item.id"
              class="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-start"
            >
              <div class="min-w-0">
                <div class="mb-2 flex flex-wrap items-center gap-2">
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
                <p class="text-base font-semibold leading-7 text-dc-ink whitespace-pre-line">{{ item.message }}</p>
                <div class="mt-3 grid gap-2 font-mono text-[11px] font-bold uppercase tracking-wide text-dc-gray md:grid-cols-2">
                  <p>From: <span class="text-dc-ink">{{ item.tester_name }}</span></p>
                  <p v-if="item.page_path">Page: <span class="break-all text-dc-info">{{ item.page_path }}</span></p>
                  <p v-if="item.viewport_width && item.viewport_height">Viewport: <span class="text-dc-ink">{{ item.viewport_width }} x {{ item.viewport_height }}</span></p>
                  <p v-if="item.user_agent" class="md:col-span-2">Agent: <span class="break-all normal-case tracking-normal text-dc-gray">{{ item.user_agent }}</span></p>
                </div>
              </div>

              <div class="flex flex-wrap gap-2 lg:justify-end">
                <button
                  v-for="status in routeFeedbackStatuses"
                  :key="status.value"
                  type="button"
                  class="rounded-md border px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-wide disabled:cursor-wait disabled:opacity-60"
                  :class="item.status === status.value ? 'border-dc-ink bg-dc-yellow text-dc-ink' : 'border-dc-border bg-dc-paper text-dc-gray hover:border-dc-ink hover:text-dc-ink'"
                  :disabled="isUpdatingRouteFeedback(item.id, status.value)"
                  @click="updateRouteFeedbackStatus(item, status.value)"
                >
                  {{ status.label }}
                </button>
              </div>
            </article>
          </div>
        </section>

        <section v-if="months.length === 0" class="editorial-panel p-8">
          <p class="editorial-eyebrow">fresh start</p>
          <h2 class="text-3xl font-black tracking-tight text-dc-ink">No event months yet.</h2>
          <p class="mt-3 max-w-2xl text-base leading-7 text-dc-gray">Create events first. Each completed event can expose its feedback form for 3 days and will appear here by month.</p>
        </section>

        <template v-else-if="selectedMonth">
          <section class="feedback-month-shell mb-6 p-4">
            <div class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p class="editorial-eyebrow mb-2">month switch</p>
                <h2 class="text-2xl font-black tracking-tight text-dc-ink">{{ selectedMonth.label }}</h2>
                <p class="mt-2 max-w-2xl text-sm leading-6 text-dc-gray">Feedback reports start from January 2026. Pick a year, then a month; the report below updates in place.</p>
              </div>
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

            <div class="mt-4 border-t border-dc-border pt-4">
              <p class="editorial-eyebrow mb-2">months in {{ selectedYear }}</p>
              <div class="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                <button
                  v-for="month in monthsForSelectedYear"
                  :key="month.month"
                  type="button"
                  class="feedback-month-button motion-press"
                  :class="selectedMonthKey === month.month ? 'feedback-month-button--active' : ''"
                  @click="selectedMonthKey = month.month"
                >
                  <span>{{ monthShortLabel(month) }}</span>
                  <strong>{{ month.total_responses }}</strong>
                </button>
              </div>
            </div>
          </section>

          <section class="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <article v-for="card in monthSummaryCards" :key="card.label" class="ops-panel p-4">
              <p class="font-mono text-[11px] font-bold uppercase tracking-wide" :class="cardToneClass(card.tone)">{{ card.label }}</p>
              <p class="mt-3 text-4xl font-black tracking-tight text-dc-ink">{{ card.value }}</p>
              <p class="mt-2 line-clamp-2 text-sm font-semibold leading-6 text-dc-gray">{{ card.detail }}</p>
            </article>
          </section>

          <section class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
            <div class="ops-panel overflow-hidden">
              <div class="ops-panel-header flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p class="editorial-eyebrow mb-1">selected month</p>
                  <h2 class="text-2xl font-black tracking-tight text-dc-ink">{{ selectedMonth.label }}</h2>
                </div>
                <p class="font-mono text-xs font-bold uppercase tracking-wide text-dc-gray">{{ selectedMonth.event_count }} event cycle{{ selectedMonth.event_count === 1 ? '' : 's' }}</p>
              </div>

              <div v-if="selectedMonth.events.length === 0" class="p-6">
                <div class="rounded-lg border border-dashed border-dc-border bg-dc-paper-warm p-5">
                  <p class="editorial-eyebrow mb-2">empty month</p>
                  <h3 class="text-2xl font-black tracking-tight text-dc-ink">No feedback cycle yet.</h3>
                  <p class="mt-2 max-w-xl text-sm leading-6 text-dc-gray">When an event is scheduled for {{ selectedMonth.label }}, its feedback window and response signal will appear here.</p>
                </div>
              </div>

              <article v-for="item in selectedMonth.events" :key="item.event.id" class="ops-row grid gap-4 lg:grid-cols-[minmax(0,1fr)_180px_160px] lg:items-center">
                <div class="min-w-0">
                  <div class="mb-2 flex flex-wrap items-center gap-2">
                    <h3 class="text-xl font-black tracking-tight text-dc-ink">{{ item.event.name }}</h3>
                    <span class="rounded-md border px-2.5 py-1 font-mono text-[11px] font-bold uppercase tracking-wide" :class="statusClass(item)">
                      {{ eventStatusLabel(item) }}
                    </span>
                  </div>
                  <p class="font-mono text-xs font-bold uppercase tracking-wide text-dc-gray">{{ formatDate(item.event.event_date) }} / {{ formatWindow(item) }}</p>
                  <p class="mt-2 text-sm leading-6 text-dc-gray">
                    {{ item.campaign?.title ?? 'Default post-event feedback form will be used until configured.' }}
                  </p>
                </div>

                <div class="grid grid-cols-3 gap-2 lg:grid-cols-1">
                  <div>
                    <p class="font-mono text-[10px] font-bold uppercase tracking-wide text-dc-gray">Responses</p>
                    <p class="text-xl font-black text-dc-ink">{{ item.response_count }}</p>
                  </div>
                  <div>
                    <p class="font-mono text-[10px] font-bold uppercase tracking-wide text-dc-gray">Rating</p>
                    <p class="text-xl font-black text-dc-ink">{{ item.insights.average_rating ?? '-' }}</p>
                  </div>
                  <div>
                    <p class="font-mono text-[10px] font-bold uppercase tracking-wide text-dc-gray">Again</p>
                    <p class="text-xl font-black text-dc-ink">{{ item.insights.attend_again_percent === null ? '-' : `${item.insights.attend_again_percent}%` }}</p>
                  </div>
                </div>

                <div class="flex flex-wrap gap-2 lg:justify-end">
                  <RouterLink
                    :to="{ path: adminPath(`events/${item.event.id}/feedback`), query: { from: 'feedback' } }"
                    class="editorial-secondary-action px-4 py-2 text-xs"
                  >
                    Configure
                  </RouterLink>
                  <RouterLink :to="`/feedback/${item.event.id}`" class="rounded-md border-2 border-dc-border bg-dc-paper px-4 py-2 font-mono text-xs font-bold uppercase tracking-wide text-dc-gray hover:border-dc-ink hover:text-dc-ink">Preview</RouterLink>
                </div>
              </article>
            </div>

            <aside class="space-y-4">
              <section class="editorial-panel p-5">
                <p class="editorial-eyebrow">combined signal</p>
                <h2 class="text-2xl font-black tracking-tight text-dc-ink">{{ selectedMonth.label }}</h2>
                <p class="mt-3 text-sm leading-6 text-dc-gray">This combines every event in the selected month. If DevCongress keeps one main community event per month, this becomes the monthly report view.</p>
              </section>

              <section class="ops-panel p-5">
                <p class="editorial-eyebrow">most useful</p>
                <p v-if="selectedMonth.top_talk_label" class="text-lg font-black leading-7 text-dc-ink">{{ selectedMonth.top_talk_label }}</p>
                <p v-else class="text-sm leading-6 text-dc-gray">No talk-selection responses yet.</p>
                <p v-if="selectedMonth.top_talk_count" class="mt-2 font-mono text-xs font-bold uppercase tracking-wide text-dc-gray">{{ selectedMonth.top_talk_count }} mention{{ selectedMonth.top_talk_count === 1 ? '' : 's' }}</p>
              </section>

              <section class="ops-panel p-5">
                <p class="editorial-eyebrow">next read</p>
                <p class="text-sm leading-6 text-dc-gray">Once responses exist, this panel can grow into theme extraction: what landed, what dragged, and what should change next month.</p>
              </section>
            </aside>
          </section>
        </template>
      </template>
    </div>
  </div>
</template>
