<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { adminPath } from '@/src/admin-routes';
import NaviiAvatar from '@/src/components/NaviiAvatar.vue';
import AdminAttendanceOverviewPageSkeleton from '@/src/components/ui/page-skeletons/AdminAttendanceOverviewPageSkeleton.vue';
import type {
  AttendanceLedgerMonth,
  AttendanceLedgerMonthEvent,
  AttendanceMonthlyInsights,
  EventAttendanceSummary,
} from '@/types';

type AttendanceTrailOutcome = 'came' | 'missed';

interface AttendanceTrailMark {
  eventId: string;
  eventName: string;
  eventDate: string;
  eventDateMs: number;
  outcome: AttendanceTrailOutcome;
}

interface ConsistencyPersonRow {
  key: string;
  name: string;
  email: string | null;
  rsvpCount: number;
  checkedInCount: number;
  missedCount: number;
  trail: AttendanceTrailMark[];
  lastCameAt: string | null;
  lastRsvpAtMs: number;
}

const loading = ref(true);
const error = ref('');
const ledger = ref<AttendanceLedgerMonth[]>([]);
const insights = ref<AttendanceMonthlyInsights | null>(null);
const selectedStatus = ref<'all' | 'uploaded' | 'missing'>('all');
const repeatPeopleView = ref<'regulars' | 'never-came'>('regulars');
const selectedYear = ref(String(new Date().getFullYear()));
const page = ref(1);
const pageSize = 6;
const ATTENDANCE_START_YEAR = 2026;
const today = new Date();
const currentYear = today.getFullYear();
const currentMonth = today.getMonth() + 1;
const statusOptions: Array<'all' | 'uploaded' | 'missing'> = ['all', 'uploaded', 'missing'];
function monthParts(month: string): { year: number; month: number } {
  const [year, monthNumber] = month.split('-').map(Number);
  return { year, month: monthNumber };
}

function isCollectableMonth(month: string): boolean {
  const parts = monthParts(month);
  if (parts.year < ATTENDANCE_START_YEAR) return false;
  if (parts.year > currentYear) return false;
  if (parts.year === currentYear && parts.month > currentMonth) return false;
  return true;
}

const collectableLedger = computed(() => ledger.value.filter((item) => isCollectableMonth(item.attendance_month)));
const availableYears = computed(() => Array.from(new Set(collectableLedger.value.map((item) => item.attendance_month.slice(0, 4))))
  .sort((a, b) => Number(b) - Number(a)));
const yearLedger = computed(() => collectableLedger.value.filter((item) => item.attendance_month.startsWith(`${selectedYear.value}-`)));
const selectedYearLabel = computed(() => selectedYear.value || String(new Date().getFullYear()));

const filteredLedger = computed(() => {
  return yearLedger.value.filter((item) => {
    const statusMatches = selectedStatus.value === 'all' || item.upload_status === selectedStatus.value;
    return statusMatches;
  });
});
const pageCount = computed(() => Math.max(1, Math.ceil(filteredLedger.value.length / pageSize)));
const pageStart = computed(() => (filteredLedger.value.length === 0 ? 0 : (page.value - 1) * pageSize + 1));
const pageEnd = computed(() => Math.min(filteredLedger.value.length, page.value * pageSize));
const paginatedLedger = computed(() => filteredLedger.value.slice((page.value - 1) * pageSize, page.value * pageSize));
const completedMissing = computed(() => yearLedger.value.filter((item) => item.completed_event_count > 0 && !item.has_import));
const uploadableMissing = computed(() => completedMissing.value.filter((item) => item.upload_available && primaryUploadEvent(item)));
const selectedYearUploaded = computed(() => yearLedger.value.filter((item) => item.has_import).length);
const selectedYearMissing = computed(() => yearLedger.value.filter((item) => !item.has_import).length);
const importedYearLedger = computed(() => yearLedger.value.filter((item) => item.has_import));
const yearMedianCheckedIn = computed(() => percentile(importedYearLedger.value.map((item) => item.summary.checked_in), 50));
const yearP80CheckedIn = computed(() => percentile(importedYearLedger.value.map((item) => item.summary.checked_in), 80));
const roomCapacityGuide = computed(() => yearP80CheckedIn.value === 0 ? 0 : Math.ceil(yearP80CheckedIn.value * 1.15));
const turnoutChartEvents = computed(() => importedYearLedger.value
  .flatMap((month) => month.events)
  .filter((eventItem) => Boolean(eventItem.import))
  .map((eventItem) => ({
    id: eventItem.event.id,
    label: formatShortMonth(eventItem.event.event_date),
    name: eventItem.event.name,
    dateMs: new Date(eventItem.event.event_date).getTime(),
    rsvps: eventItem.summary.approved_registrations,
    came: eventItem.summary.approved_checked_in,
  }))
  .sort((a, b) => a.dateMs - b.dateMs)
  .slice(-6));
const turnoutChartMax = computed(() => Math.max(
  0,
  ...turnoutChartEvents.value.flatMap((event) => [event.rsvps, event.came]),
));
const yearRsvpOutcome = computed(() => importedYearLedger.value
  .flatMap((month) => month.events)
  .filter((eventItem) => Boolean(eventItem.import))
  .reduce((totals, eventItem) => ({
    came: totals.came + eventItem.summary.approved_checked_in,
    missed: totals.missed + eventItem.summary.approved_no_shows,
  }), { came: 0, missed: 0 }));
const yearApprovedRsvps = computed(() => yearRsvpOutcome.value.came + yearRsvpOutcome.value.missed);
const yearCamePercent = computed(() => yearApprovedRsvps.value === 0
  ? 0
  : Math.round((yearRsvpOutcome.value.came / yearApprovedRsvps.value) * 100));
const rsvpOutcomePieStyle = computed(() => ({
  background: `conic-gradient(#e8117f 0 ${yearCamePercent.value}%, #f5e642 ${yearCamePercent.value}% 100%)`,
}));
const repeatRsvpPeople = computed<ConsistencyPersonRow[]>(() => {
  return (insights.value?.repeat_attendee_profiles ?? [])
    .map((person) => {
      const trail = person.trail
        .filter((mark) => mark.event_date.startsWith(`${selectedYear.value}-`))
        .map((mark) => ({
          eventId: mark.event_id,
          eventName: mark.event_name,
          eventDate: mark.event_date,
          eventDateMs: new Date(mark.event_date).getTime(),
          outcome: mark.outcome,
        } satisfies AttendanceTrailMark));
      const checkedInCount = trail.filter((mark) => mark.outcome === 'came').length;
      const lastCameAt = [...trail].reverse().find((mark) => mark.outcome === 'came')?.eventDate ?? null;

      return {
        ...person,
        rsvpCount: trail.length,
        checkedInCount,
        missedCount: trail.length - checkedInCount,
        trail,
        lastCameAt,
        lastRsvpAtMs: trail.at(-1)?.eventDateMs ?? Number.NEGATIVE_INFINITY,
      };
    })
    .filter((person) => person.rsvpCount > 1)
    .sort((a, b) => a.name.localeCompare(b.name));
});
const consistentPeople = computed(() => [...repeatRsvpPeople.value]
  .filter((person) => person.checkedInCount >= 2)
  .sort(rankConsistentPeople)
  .slice(0, 8));
const repeatNoShowPeople = computed(() => repeatRsvpPeople.value
  .filter((person) => person.checkedInCount === 0 && person.missedCount >= 2)
  .sort((a, b) => (
    b.missedCount - a.missedCount
    || b.lastRsvpAtMs - a.lastRsvpAtMs
    || a.name.localeCompare(b.name)
  )));
const activeRepeatPeople = computed(() => (
  repeatPeopleView.value === 'regulars'
    ? consistentPeople.value
    : repeatNoShowPeople.value
));

function rankConsistentPeople(a: ConsistencyPersonRow, b: ConsistencyPersonRow): number {
  const aRate = a.rsvpCount === 0 ? 0 : a.checkedInCount / a.rsvpCount;
  const bRate = b.rsvpCount === 0 ? 0 : b.checkedInCount / b.rsvpCount;

  return (
    b.checkedInCount - a.checkedInCount
    || bRate - aRate
    || b.rsvpCount - a.rsvpCount
    || b.lastRsvpAtMs - a.lastRsvpAtMs
    || a.name.localeCompare(b.name)
  );
}

function lastRsvpDate(person: ConsistencyPersonRow): string | null {
  return person.trail.at(-1)?.eventDate ?? null;
}

function formatLastRsvpDate(person: ConsistencyPersonRow): string {
  const date = lastRsvpDate(person);
  return date ? formatDate(date) : '-';
}

function chartBarHeight(value: number, maximum: number): string {
  if (value <= 0 || maximum <= 0) return '0%';
  return `${Math.max(4, Math.round((value / maximum) * 100))}%`;
}

function turnoutChartAriaLabel(): string {
  return turnoutChartEvents.value
    .map((event) => `${event.name}: ${event.rsvps} approved RSVPs and ${event.came} came`)
    .join('; ');
}

async function fetchAttendanceLedger() {
  loading.value = true;
  error.value = '';

  const response = await fetch('/api/attendance/monthly');

  if (response.ok) {
    const payload = await response.json() as { ledger: AttendanceLedgerMonth[]; insights: AttendanceMonthlyInsights };
    ledger.value = payload.ledger;
    insights.value = payload.insights;
    if (!availableYears.value.includes(selectedYear.value)) {
      selectedYear.value = availableYears.value[0] ?? String(new Date().getFullYear());
    }
  } else {
    const payload = await response.json().catch(() => ({}));
    error.value = payload.error ?? 'Unable to load attendance ledger';
  }

  loading.value = false;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
}

function formatMonthLabel(value: string): string {
  return value.match(/^[A-Za-z]{3}/)?.[0] ?? value;
}

function formatShortMonth(value: string): string {
  return new Intl.DateTimeFormat('en', { month: 'short' }).format(new Date(value));
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatEventTurnout(summary: EventAttendanceSummary): string {
  const registrationRate = summary.total_registrations === 0
    ? 0
    : summary.checked_in / summary.total_registrations;
  return `${summary.checked_in} out of ${summary.total_registrations} came / ${formatPercent(registrationRate)}`;
}

function percentile(values: number[], percentileValue: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentileValue / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}

function primaryUploadEvent(item: AttendanceLedgerMonth): AttendanceLedgerMonthEvent | null {
  return item.events.find((eventItem) => !eventItem.import && eventItem.upload_available)
    ?? item.events.find((eventItem) => !eventItem.import)
    ?? item.events[0]
    ?? null;
}

function previousPage() {
  page.value = Math.max(1, page.value - 1);
}

function nextPage() {
  page.value = Math.min(pageCount.value, page.value + 1);
}

watch([selectedStatus, selectedYear], () => {
  page.value = 1;
});

watch(pageCount, () => {
  if (page.value > pageCount.value) page.value = pageCount.value;
});

onMounted(fetchAttendanceLedger);
</script>

<template>
  <div class="editorial-page">
    <div class="editorial-wrap">
      <AdminAttendanceOverviewPageSkeleton v-if="loading" />

      <template v-else>
        <header class="editorial-header flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p class="editorial-eyebrow">attendance command</p>
            <h1 class="text-[2.25rem] font-extrabold leading-none tracking-tight text-dc-ink/90 sm:text-5xl">Monthly attendance</h1>
            <p class="mt-3 max-w-[34rem] text-base leading-7 text-dc-gray sm:text-lg">Track one Luma CSV per meetup month, spot missing uploads, and turn old exports into venue-planning signals.</p>
          </div>
          <RouterLink
            v-if="uploadableMissing[0] && primaryUploadEvent(uploadableMissing[0])"
            :to="{ path: adminPath(`events/${primaryUploadEvent(uploadableMissing[0])!.event.id}/attendance`), query: { from: 'attendance' } }"
            class="editorial-action max-w-full self-start whitespace-nowrap lg:shrink-0"
          >
            Upload Missing CSV
          </RouterLink>
        </header>

        <div v-if="error" class="mb-6 rounded-md border-2 border-red-700 bg-red-50 p-4 text-sm font-semibold text-red-800">{{ error }}</div>

        <section v-if="ledger.length === 0" class="editorial-panel p-8">
          <p class="editorial-eyebrow">fresh start</p>
          <h2 class="text-3xl font-bold tracking-tight text-dc-ink/90">No event months yet.</h2>
          <p class="mt-3 max-w-2xl text-base leading-7 text-dc-gray">Create monthly events first. Each event month can hold one current Luma attendance CSV.</p>
        </section>

        <template v-else-if="insights">
          <section class="grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(20rem,0.55fr)] lg:items-stretch">
            <section class="ops-panel flex min-h-[42rem] min-w-0 flex-col overflow-hidden">
              <div class="ops-panel-header flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p class="editorial-eyebrow mb-1">monthly ledger</p>
                  <h2 class="text-2xl font-bold tracking-tight text-dc-ink/90">{{ selectedYearLabel }} attendance</h2>
                  <p class="mt-2 font-mono text-[11px] font-semibold uppercase tracking-wide text-dc-gray">
                    {{ selectedYearUploaded }} uploaded / {{ selectedYearMissing }} missing / room guide {{ yearP80CheckedIn || '-' }}
                  </p>
                </div>
                <div class="flex flex-col gap-2 lg:items-end">
                  <div class="flex flex-wrap gap-1.5 lg:justify-end">
                    <button
                      v-for="year in availableYears"
                      :key="year"
                      type="button"
                      class="motion-press min-h-8 rounded-md border px-2.5 font-mono text-[11px] font-semibold uppercase tracking-wide"
                      :class="selectedYear === year ? 'border-dc-ink bg-dc-yellow text-dc-ink' : 'border-dc-border bg-dc-paper text-dc-gray hover:border-dc-ink hover:text-dc-ink'"
                      @click="selectedYear = year"
                    >
                      {{ year }}
                    </button>
                  </div>

                  <div class="flex flex-wrap gap-1.5 lg:justify-end">
                    <button
                      v-for="option in statusOptions"
                      :key="option"
                      type="button"
                      class="motion-press min-h-8 rounded-md border px-2.5 font-mono text-[11px] font-semibold uppercase tracking-wide"
                      :class="selectedStatus === option ? 'border-dc-ink bg-dc-yellow text-dc-ink' : 'border-dc-border bg-dc-paper text-dc-gray hover:border-dc-ink hover:text-dc-ink'"
                      @click="selectedStatus = option"
                    >
                      {{ option }}
                    </button>
                  </div>
                </div>
              </div>
              <div class="flex-1 divide-y divide-dc-border">
                <div v-if="paginatedLedger.length === 0" class="px-5 py-10 text-center">
                  <p class="font-mono text-xs font-semibold uppercase tracking-wide text-dc-gray">No months match this filter</p>
                  <p class="mt-2 text-sm text-dc-gray">Try All months or switch between uploaded and missing CSVs.</p>
                </div>

                <article
                  v-for="item in paginatedLedger"
                  :key="item.attendance_month"
                  class="px-5 py-4"
                  :class="{ 'bg-dc-paper-warm/50': item.event_count === 0 }"
                >
                  <div class="grid gap-3 lg:grid-cols-[minmax(8rem,0.38fr)_minmax(0,1fr)_auto] lg:items-center">
                    <div class="min-w-0">
                      <div class="flex flex-wrap items-center gap-2">
                        <p class="text-xl font-bold tracking-tight text-dc-ink/90 sm:text-2xl">{{ formatMonthLabel(item.month_label) }}</p>
                      </div>
                    </div>

                    <div class="min-w-0">
                      <div v-if="item.event_count > 0" class="space-y-2">
                        <div
                          v-for="eventItem in item.events"
                          :key="eventItem.event.id"
                          class="grid min-h-12 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                        >
                          <div class="min-w-0">
                            <p class="truncate text-sm font-semibold text-dc-ink/90">{{ eventItem.event.name }}</p>
                            <p class="font-mono text-[10px] font-semibold uppercase tracking-wide text-dc-gray">{{ formatDate(eventItem.event.event_date) }}</p>
                          </div>
                          <p class="justify-self-start font-mono text-[11px] font-semibold uppercase tracking-wide sm:justify-self-end" :class="eventItem.import ? 'text-dc-success' : eventItem.event.status === 'completed' ? 'text-dc-pink' : 'text-dc-gray'">
                            {{ eventItem.import ? formatEventTurnout(eventItem.summary) : eventItem.upload_available ? 'Waiting for CSV' : 'Not open yet' }}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div class="flex lg:justify-end">
                      <RouterLink
                        v-if="primaryUploadEvent(item) && (primaryUploadEvent(item)!.import || primaryUploadEvent(item)!.upload_available)"
                        :to="{ path: adminPath(`events/${primaryUploadEvent(item)!.event.id}/attendance`), query: { from: 'attendance' } }"
                        class="editorial-secondary-action px-4 py-2 text-xs"
                      >
                        {{ primaryUploadEvent(item)!.import ? 'Review' : 'Upload' }}
                      </RouterLink>
                    </div>
                  </div>
                </article>
              </div>

              <div class="pagination-footer">
                <p class="pagination-summary">
                  Showing {{ pageStart }}-{{ pageEnd }} of {{ filteredLedger.length }} month{{ filteredLedger.length === 1 ? '' : 's' }}
                </p>
                <div class="pagination-controls">
                  <button
                    type="button"
                    class="pagination-button"
                    :disabled="page === 1"
                    @click="previousPage"
                  >
                    <span aria-hidden="true">‹</span>
                    Prev
                  </button>
                  <span class="pagination-count" aria-live="polite">
                    Page {{ page }} of {{ pageCount }}
                  </span>
                  <button
                    type="button"
                    class="pagination-button"
                    :disabled="page === pageCount"
                    @click="nextPage"
                  >
                    Next
                    <span aria-hidden="true">›</span>
                  </button>
                </div>
              </div>
            </section>

            <aside class="ops-panel flex min-w-0 flex-col overflow-hidden lg:h-full">
              <div class="ops-panel-header flex items-end justify-between gap-3">
                <div>
                  <p class="editorial-eyebrow mb-1">year in view</p>
                  <h2 class="text-xl font-bold tracking-tight text-dc-ink/90">Attendance patterns</h2>
                </div>
                <p class="shrink-0 font-mono text-[9px] font-semibold uppercase tracking-wide text-dc-gray">
                  {{ selectedYearUploaded }}/{{ yearLedger.length }} CSVs
                </p>
              </div>

              <div class="grid flex-1 divide-y divide-dc-border md:grid-cols-2 md:divide-x md:divide-y-0 lg:grid-cols-1 lg:grid-rows-2 lg:divide-x-0 lg:divide-y">
                <article class="flex min-h-[10.5rem] min-w-0 flex-col p-4">
                  <div class="flex items-start justify-between gap-3">
                    <div>
                      <h3 class="font-mono text-[10px] font-semibold uppercase tracking-wide text-dc-ink">Recent event turnout</h3>
                      <p class="mt-1 text-[11px] leading-4 text-dc-gray">Approved RSVPs vs people who came.</p>
                    </div>
                    <span class="rounded-sm border border-dc-border bg-dc-paper-warm px-1.5 py-0.5 font-mono text-[8px] font-semibold uppercase tracking-wide text-dc-gray">Bar</span>
                  </div>

                  <div class="mt-2 flex items-center gap-3 font-mono text-[8px] font-semibold uppercase tracking-wide text-dc-gray">
                    <span class="inline-flex items-center gap-1">
                      <span class="size-2 border border-dc-ink bg-dc-yellow" aria-hidden="true" />
                      RSVP
                    </span>
                    <span class="inline-flex items-center gap-1">
                      <span class="size-2 border border-dc-pink bg-dc-pink" aria-hidden="true" />
                      Came
                    </span>
                  </div>

                  <div
                    v-if="turnoutChartEvents.length > 0"
                    class="mt-3 flex h-24 items-end gap-1.5"
                    role="img"
                    :aria-label="turnoutChartAriaLabel()"
                  >
                    <div v-for="eventItem in turnoutChartEvents" :key="eventItem.id" class="flex h-full min-w-0 flex-1 flex-col">
                      <div class="flex min-h-0 flex-1 items-end justify-center gap-0.5 border-b border-dc-border">
                        <span
                          class="w-1.5 rounded-t-sm border border-dc-ink bg-dc-yellow sm:w-2"
                          :style="{ height: chartBarHeight(eventItem.rsvps, turnoutChartMax) }"
                          :title="`${eventItem.name}: ${eventItem.rsvps} approved RSVPs`"
                        />
                        <span
                          class="w-1.5 rounded-t-sm border border-dc-pink bg-dc-pink sm:w-2"
                          :style="{ height: chartBarHeight(eventItem.came, turnoutChartMax) }"
                          :title="`${eventItem.name}: ${eventItem.came} came`"
                        />
                      </div>
                      <p class="mt-1 text-center font-mono text-[8px] font-semibold uppercase tracking-wide text-dc-gray">{{ eventItem.label }}</p>
                    </div>
                  </div>
                  <p v-else class="mt-4 text-xs leading-5 text-dc-gray">Upload a CSV to plot event turnout.</p>
                </article>

                <article class="flex min-h-[10.5rem] min-w-0 flex-col p-4">
                  <div class="flex items-start justify-between gap-3">
                    <div>
                      <h3 class="font-mono text-[10px] font-semibold uppercase tracking-wide text-dc-ink">Approved RSVP outcomes</h3>
                      <p class="mt-1 text-[11px] leading-4 text-dc-gray">Uploaded events in {{ selectedYearLabel }}.</p>
                    </div>
                    <span class="rounded-sm border border-dc-border bg-dc-paper-warm px-1.5 py-0.5 font-mono text-[8px] font-semibold uppercase tracking-wide text-dc-gray">Pie</span>
                  </div>

                  <div v-if="yearApprovedRsvps > 0" class="mt-4 flex flex-1 items-center gap-4">
                    <span
                      class="size-[5.25rem] shrink-0 rounded-full border-2 border-dc-ink"
                      role="img"
                      :aria-label="`${yearRsvpOutcome.came} came and ${yearRsvpOutcome.missed} missed from ${yearApprovedRsvps} approved RSVPs`"
                      :style="rsvpOutcomePieStyle"
                    />
                    <div class="min-w-0">
                      <p class="text-[1.7rem] font-semibold leading-none tracking-tight text-dc-ink/90">{{ yearCamePercent }}%</p>
                      <p class="mt-1 font-mono text-[9px] font-semibold uppercase tracking-wide text-dc-gray">came</p>
                      <div class="mt-3 space-y-1.5 font-mono text-[9px] font-semibold uppercase tracking-wide text-dc-gray">
                        <p class="flex items-center gap-1.5">
                          <span class="size-2 rounded-full bg-dc-pink" aria-hidden="true" />
                          {{ yearRsvpOutcome.came }} came
                        </p>
                        <p class="flex items-center gap-1.5">
                          <span class="size-2 rounded-full border border-dc-ink bg-dc-yellow" aria-hidden="true" />
                          {{ yearRsvpOutcome.missed }} missed
                        </p>
                      </div>
                    </div>
                  </div>
                  <p v-else class="mt-4 text-xs leading-5 text-dc-gray">Approved RSVPs will form this view.</p>
                </article>
              </div>

              <dl class="grid grid-cols-3 border-t border-dc-border bg-dc-paper-warm/50">
                <div class="px-3 py-2.5">
                  <dt class="font-mono text-[8px] font-semibold uppercase tracking-wide text-dc-gray">Median</dt>
                  <dd class="mt-0.5 text-base font-semibold text-dc-ink/90">{{ yearMedianCheckedIn || '-' }}</dd>
                </div>
                <div class="border-l border-dc-border px-3 py-2.5">
                  <dt class="font-mono text-[8px] font-semibold uppercase tracking-wide text-dc-gray">P80</dt>
                  <dd class="mt-0.5 text-base font-semibold text-dc-ink/90">{{ yearP80CheckedIn || '-' }}</dd>
                </div>
                <div class="border-l border-dc-border px-3 py-2.5">
                  <dt class="font-mono text-[8px] font-semibold uppercase tracking-wide text-dc-gray">Room guide</dt>
                  <dd class="mt-0.5 text-base font-semibold text-dc-ink/90">{{ roomCapacityGuide || '-' }}</dd>
                </div>
              </dl>
            </aside>
          </section>

          <section class="ops-panel mt-6 overflow-hidden">
            <div class="ops-panel-header flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p class="editorial-eyebrow mb-1">{{ repeatPeopleView === 'regulars' ? 'regulars' : 'follow-up' }}</p>
                <h2 class="text-2xl font-bold tracking-tight text-dc-ink/90">
                  {{ repeatPeopleView === 'regulars' ? 'Consistent people' : 'Repeated no-shows' }}
                </h2>
                <p class="mt-1 text-sm text-dc-gray">
                  {{ repeatPeopleView === 'regulars'
                    ? 'People who repeatedly register and show up.'
                    : 'People with at least two approved RSVPs and no recorded check-in.' }}
                </p>
              </div>
              <div class="inline-flex self-start rounded-md border border-dc-border bg-white p-1" role="tablist" aria-label="Repeat attendance view">
                <button
                  type="button"
                  class="motion-press rounded px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-wide"
                  :class="repeatPeopleView === 'regulars'
                    ? 'border border-dc-ink bg-dc-yellow text-dc-ink'
                    : 'border border-transparent text-dc-gray'"
                  :aria-selected="repeatPeopleView === 'regulars'"
                  role="tab"
                  @click="repeatPeopleView = 'regulars'"
                >
                  Regulars {{ consistentPeople.length }}
                </button>
                <button
                  type="button"
                  class="motion-press rounded px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-wide"
                  :class="repeatPeopleView === 'never-came'
                    ? 'border border-dc-ink bg-dc-yellow text-dc-ink'
                    : 'border border-transparent text-dc-gray'"
                  :aria-selected="repeatPeopleView === 'never-came'"
                  role="tab"
                  @click="repeatPeopleView = 'never-came'"
                >
                  Never came {{ repeatNoShowPeople.length }}
                </button>
              </div>
            </div>

            <div v-if="activeRepeatPeople.length === 0" class="px-5 py-8 text-sm text-dc-gray">
              {{ repeatPeopleView === 'regulars'
                ? 'Upload at least two monthly CSVs to see repeat registrations and check-ins.'
                : `No repeated no-shows found in ${selectedYearLabel}.` }}
            </div>
            <div
              v-else
              class="max-h-[min(32rem,60vh)] overflow-auto overscroll-contain [scrollbar-gutter:stable]"
              tabindex="0"
              :aria-label="repeatPeopleView === 'regulars' ? 'Regular attendees table' : 'Repeated no-shows table'"
            >
              <table class="w-full min-w-[680px] table-fixed text-left">
                <colgroup>
                  <col class="w-[44%]">
                  <col class="w-[14%]">
                  <col class="w-[14%]">
                  <col class="w-[12%]">
                  <col class="w-[16%]">
                </colgroup>
                <thead class="sticky top-0 z-10 border-y border-dc-border bg-dc-paper-warm font-mono text-[11px] font-semibold uppercase tracking-wide text-dc-gray">
                  <tr>
                    <th class="px-5 py-3">Person</th>
                    <th class="px-5 py-3">{{ repeatPeopleView === 'regulars' ? 'Registered' : 'RSVPs' }}</th>
                    <th class="px-5 py-3">{{ repeatPeopleView === 'regulars' ? 'Came' : 'Missed' }}</th>
                    <th class="px-5 py-3">{{ repeatPeopleView === 'regulars' ? 'Rate' : 'No-show rate' }}</th>
                    <th class="px-5 py-3">{{ repeatPeopleView === 'regulars' ? 'Last seen' : 'Last RSVP' }}</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-dc-border">
                  <tr v-for="person in activeRepeatPeople" :key="person.key">
                    <td class="px-5 py-3">
                      <div class="flex items-center gap-3">
                        <NaviiAvatar :seed="person.key" :title="`${person.name} avatar`" :size="38" />
                        <div class="min-w-0">
                          <p class="truncate text-sm font-semibold text-dc-ink/90">{{ person.name }}</p>
                          <p v-if="person.email" class="mt-0.5 truncate text-xs text-dc-gray">{{ person.email }}</p>
                        </div>
                      </div>
                    </td>
                    <td class="px-5 py-3 font-mono text-xs font-semibold uppercase tracking-wide text-dc-gray">
                      {{ person.rsvpCount }}
                    </td>
                    <td
                      class="px-5 py-3 font-mono text-xs font-semibold uppercase tracking-wide"
                      :class="repeatPeopleView === 'regulars' ? 'text-dc-success' : 'text-dc-pink'"
                    >
                      {{ repeatPeopleView === 'regulars' ? person.checkedInCount : person.missedCount }}
                    </td>
                    <td class="px-5 py-3 font-mono text-xs font-semibold uppercase tracking-wide text-dc-gray">
                      {{ repeatPeopleView === 'regulars'
                        ? formatPercent(person.checkedInCount / person.rsvpCount)
                        : formatPercent(person.missedCount / person.rsvpCount) }}
                    </td>
                    <td class="px-5 py-3 font-mono text-xs font-semibold uppercase tracking-wide text-dc-gray">
                      {{ repeatPeopleView === 'regulars'
                        ? (person.lastCameAt ? formatDate(person.lastCameAt) : '-')
                        : formatLastRsvpDate(person) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </template>
      </template>
    </div>
  </div>
</template>
