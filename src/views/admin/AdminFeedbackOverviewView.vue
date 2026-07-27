<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query';
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { adminPath } from '@/src/admin-routes';
import AdminFeedbackOverviewPageSkeleton from '@/src/components/ui/page-skeletons/AdminFeedbackOverviewPageSkeleton.vue';
import {
  fetchFeedbackMonths,
  queryKeys,
  type FeedbackMonth,
  type FeedbackMonthEvent,
} from '@/src/lib/api';

const FEEDBACK_START_MONTH = '2026-01';
const FEEDBACK_MONTH_QUERY_PATTERN = /^\d{4}-\d{2}$/;

const route = useRoute();
const selectedMonthKey = ref(feedbackMonthQueryValue() ?? '');
const selectedYear = ref(feedbackMonthQueryValue()?.slice(0, 4) ?? '');
const feedbackMonthsQuery = useQuery({
  queryKey: queryKeys.feedbackMonths,
  queryFn: fetchFeedbackMonths,
});
const loading = computed(() => feedbackMonthsQuery.isPending.value);
const error = computed(() => feedbackMonthsQuery.error.value?.message ?? '');
const months = computed(() => (feedbackMonthsQuery.data.value?.months ?? []).filter((month) => month.month >= FEEDBACK_START_MONTH));
const selectedMonth = computed(() => months.value.find((month) => month.month === selectedMonthKey.value) ?? months.value[0] ?? null);
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
function currentFeedbackMonthKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function feedbackMonthQueryValue(): string | null {
  const value = route.query.month;
  return typeof value === 'string' && FEEDBACK_MONTH_QUERY_PATTERN.test(value) ? value : null;
}

function applyFeedbackMonthQuery() {
  const month = feedbackMonthQueryValue();

  if (month) {
    selectedMonthKey.value = month;
    selectedYear.value = month.slice(0, 4);
  }
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

watch(() => route.query.month, applyFeedbackMonthQuery);

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
}

function eventStatusLabel(event: FeedbackMonthEvent): string {
  if (event.is_open) return 'Open now';
  if (!event.campaign_configured) return 'Ready';
  if (!event.campaign) return 'Not configured';
  return event.campaign.status.replace('_', ' ');
}

function statusClass(event: FeedbackMonthEvent): string {
  if (event.is_open) return 'border-dc-success bg-dc-success-soft text-dc-success';
  if (!event.campaign_configured) return 'border-dc-info bg-dc-info-soft text-dc-info';
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

function canViewEventResponses(event: FeedbackMonthEvent): boolean {
  return eventCampaignPublished(event) && event.response_count > 0;
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
</script>

<template>
  <div class="editorial-page">
    <div class="editorial-wrap">
      <AdminFeedbackOverviewPageSkeleton v-if="loading" />

      <template v-else>
        <header class="feedback-hub-hero">
          <div>
            <p class="editorial-eyebrow">feedback hub</p>
            <h1 class="editorial-title">Event feedback</h1>
            <p class="editorial-subtitle max-w-3xl">Review feedback campaigns and response signals from monthly, quarterly, and one-off events.</p>
          </div>
        </header>

        <div v-if="error" class="mb-6 rounded-md border-2 border-red-700 bg-red-50 p-4 text-sm font-semibold text-red-800">{{ error }}</div>

        <section v-if="months.length === 0" class="editorial-panel p-8">
          <p class="editorial-eyebrow">fresh start</p>
          <h2 class="text-3xl font-bold tracking-tight text-dc-ink">No event feedback yet.</h2>
          <p class="mt-3 max-w-2xl text-base leading-7 text-dc-gray">Create events first. Completed, monthly, quarterly, and one-off events can all expose feedback forms.</p>
        </section>

        <section v-else-if="selectedMonth" class="feedback-hub-section mt-8">
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

            <div class="grid gap-0">
              <div class="min-w-0">
                <Transition name="feedback-event-list" mode="out-in">
                  <div
                    :key="selectedMonthKey"
                    class="feedback-event-list"
                  >
                    <div v-if="selectedMonth.events.length === 0" class="p-6">
                      <div class="feedback-empty-state">
                        <p class="editorial-eyebrow mb-2">empty month</p>
                        <h3 class="text-2xl font-bold tracking-tight text-dc-ink">No feedback cycle yet.</h3>
                        <p class="mt-2 max-w-xl text-sm leading-6 text-dc-gray">When an event is scheduled for {{ selectedMonth.label }}, its feedback window and response signal will appear here.</p>
                      </div>
                    </div>

                    <TransitionGroup name="feedback-row" tag="div" class="feedback-event-rows">
                    <article v-for="item in selectedMonth.events" :key="item.event.id" class="feedback-event-row">
                      <div class="feedback-event-main">
                        <div class="feedback-event-title-row">
                          <h3 class="text-xl font-bold tracking-tight text-dc-ink">{{ item.event.name }}</h3>
                          <span v-if="!item.is_open" class="rounded-md border px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-wide" :class="statusClass(item)">
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
                            <dd>
                              <Transition name="feedback-count" mode="out-in">
                                <span :key="item.response_count">{{ item.response_count }}</span>
                              </Transition>
                            </dd>
                          </div>
                          <div class="feedback-event-stat">
                            <dt>Rating</dt>
                            <dd>
                              <Transition name="feedback-count" mode="out-in">
                                <span :key="item.response_count > 0 ? (item.insights.average_rating ?? '-') : '-'">{{ item.response_count > 0 ? (item.insights.average_rating ?? '-') : '-' }}</span>
                              </Transition>
                            </dd>
                          </div>
                          <div class="feedback-event-stat">
                            <dt>Attend again</dt>
                            <dd>
                              <Transition name="feedback-count" mode="out-in">
                                <span :key="item.response_count > 0 && item.insights.attend_again_percent !== null ? `${item.insights.attend_again_percent}%` : '-'">{{ item.response_count > 0 && item.insights.attend_again_percent !== null ? `${item.insights.attend_again_percent}%` : '-' }}</span>
                              </Transition>
                            </dd>
                          </div>
                        </dl>

                        <div class="feedback-event-actions">
                          <RouterLink
                            v-if="!eventCampaignPublished(item) || canViewEventResponses(item)"
                            :to="{ path: adminPath(`events/${item.event.id}/feedback`), query: { from: 'feedback', view: 'responses', month: selectedMonthKey } }"
                            class="editorial-secondary-action px-4 py-2 text-xs"
                          >
                            {{ eventCampaignPublished(item) ? 'View responses' : 'Configure' }}
                          </RouterLink>
                          <button
                            v-else
                            type="button"
                            class="editorial-secondary-action px-4 py-2 text-xs"
                            disabled
                          >
                            View responses
                          </button>
                        </div>
                      </div>
                    </article>
                    </TransitionGroup>
                  </div>
                </Transition>
              </div>
            </div>
          </section>
      </template>
    </div>
  </div>
</template>
