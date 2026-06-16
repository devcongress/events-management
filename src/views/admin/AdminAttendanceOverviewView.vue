<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { adminPath } from '@/src/admin-routes';
import ViewSkeleton from '@/src/components/ui/ViewSkeleton.vue';
import type { AttendanceLedgerEvent, AttendanceMonthlyInsights } from '@/types';

const loading = ref(true);
const error = ref('');
const ledger = ref<AttendanceLedgerEvent[]>([]);
const insights = ref<AttendanceMonthlyInsights | null>(null);
const selectedStatus = ref<'all' | 'uploaded' | 'missing'>('all');
const selectedYear = ref(String(new Date().getFullYear()));
const selectedMonth = ref<'all' | string>('all');
const page = ref(1);
const pageSize = 6;
const ATTENDANCE_START_YEAR = 2026;
const today = new Date();
const currentYear = today.getFullYear();
const currentMonth = today.getMonth() + 1;
const statusOptions: Array<'all' | 'uploaded' | 'missing'> = ['all', 'uploaded', 'missing'];
const monthOptions = [
  { value: '01', label: 'Jan' },
  { value: '02', label: 'Feb' },
  { value: '03', label: 'Mar' },
  { value: '04', label: 'Apr' },
  { value: '05', label: 'May' },
  { value: '06', label: 'Jun' },
  { value: '07', label: 'Jul' },
  { value: '08', label: 'Aug' },
  { value: '09', label: 'Sep' },
  { value: '10', label: 'Oct' },
  { value: '11', label: 'Nov' },
  { value: '12', label: 'Dec' },
];

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
const availableMonthOptions = computed(() => {
  const months = new Set(yearLedger.value.map((item) => item.attendance_month.slice(5, 7)));
  return monthOptions.filter((month) => months.has(month.value));
});
const selectedYearLabel = computed(() => selectedYear.value || String(new Date().getFullYear()));
const selectedMonthLabel = computed(() => {
  if (selectedMonth.value === 'all') return `All ${selectedYearLabel.value}`;
  return `${monthOptions.find((month) => month.value === selectedMonth.value)?.label ?? selectedMonth.value} ${selectedYearLabel.value}`;
});

const filteredLedger = computed(() => {
  return yearLedger.value.filter((item) => {
    const monthMatches = selectedMonth.value === 'all' || item.attendance_month.endsWith(`-${selectedMonth.value}`);
    const statusMatches = selectedStatus.value === 'all' || item.upload_status === selectedStatus.value;
    return monthMatches && statusMatches;
  });
});
const pageCount = computed(() => Math.max(1, Math.ceil(filteredLedger.value.length / pageSize)));
const pageStart = computed(() => (filteredLedger.value.length === 0 ? 0 : (page.value - 1) * pageSize + 1));
const pageEnd = computed(() => Math.min(filteredLedger.value.length, page.value * pageSize));
const paginatedLedger = computed(() => filteredLedger.value.slice((page.value - 1) * pageSize, page.value * pageSize));
const completedMissing = computed(() => yearLedger.value.filter((item) => item.event.status === 'completed' && !item.import));
const uploadableMissing = computed(() => completedMissing.value.filter((item) => item.upload_available));
const selectedYearUploaded = computed(() => yearLedger.value.filter((item) => item.import).length);
const selectedYearMissing = computed(() => yearLedger.value.filter((item) => !item.import).length);
const selectedYearCompletedMissing = computed(() => yearLedger.value.filter((item) => item.event.status === 'completed' && !item.import).length);
const importedYearLedger = computed(() => yearLedger.value.filter((item) => item.import));
const yearAverageCheckInRate = computed(() => {
  if (importedYearLedger.value.length === 0) return 0;
  return importedYearLedger.value.reduce((total, item) => total + item.summary.check_in_rate, 0) / importedYearLedger.value.length;
});
const yearCheckedInTotal = computed(() => yearLedger.value.reduce((total, item) => total + item.summary.checked_in, 0));
const yearRegistrationTotal = computed(() => yearLedger.value.reduce((total, item) => total + item.summary.total_registrations, 0));
const yearMedianCheckedIn = computed(() => percentile(importedYearLedger.value.map((item) => item.summary.checked_in), 50));
const yearP80CheckedIn = computed(() => percentile(importedYearLedger.value.map((item) => item.summary.checked_in), 80));
const bestYearMonth = computed(() => [...importedYearLedger.value]
  .filter((item) => item.summary.approved_registrations > 0)
  .sort((a, b) => b.summary.check_in_rate - a.summary.check_in_rate)[0] ?? null);
const headlineCards = computed(() => {
  return [
    {
      label: 'Avg check-in',
      value: formatPercent(yearAverageCheckInRate.value),
      detail: `${yearCheckedInTotal.value} checked in from ${yearRegistrationTotal.value} registrations`,
      tone: 'text-dc-success',
    },
    {
      label: 'Venue guide',
      value: String(yearP80CheckedIn.value),
      detail: `80th percentile attendance; median is ${yearMedianCheckedIn.value}`,
      tone: 'text-dc-info',
    },
  ];
});

async function fetchAttendanceLedger() {
  loading.value = true;
  error.value = '';

  const response = await fetch('/api/attendance/monthly');

  if (response.ok) {
    const payload = await response.json() as { ledger: AttendanceLedgerEvent[]; insights: AttendanceMonthlyInsights };
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

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

function formatUnlockDate(value: string | null): string {
  if (!value) return '';
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(value));
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function percentile(values: number[], percentileValue: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentileValue / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}

function statusClass(item: AttendanceLedgerEvent): string {
  if (item.import) return 'border-dc-success bg-dc-success-soft text-dc-success';
  if (item.event.status === 'completed') return 'border-dc-pink bg-pink-50 text-dc-pink';
  return 'border-dc-border bg-dc-paper-warm text-dc-gray';
}

function previousPage() {
  page.value = Math.max(1, page.value - 1);
}

function nextPage() {
  page.value = Math.min(pageCount.value, page.value + 1);
}

watch([selectedStatus, selectedYear, selectedMonth], () => {
  page.value = 1;
});

watch(availableMonthOptions, () => {
  if (selectedMonth.value !== 'all' && !availableMonthOptions.value.some((month) => month.value === selectedMonth.value)) {
    selectedMonth.value = 'all';
  }
});

watch(pageCount, () => {
  if (page.value > pageCount.value) page.value = pageCount.value;
});

onMounted(fetchAttendanceLedger);
</script>

<template>
  <div class="editorial-page">
    <div class="editorial-wrap">
      <ViewSkeleton v-if="loading" variant="ledger" :rows="6" />

      <template v-else>
        <header class="editorial-header flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p class="editorial-eyebrow">attendance command</p>
            <h1 class="text-[2.25rem] font-black leading-none tracking-tight text-dc-ink sm:text-5xl">Monthly attendance</h1>
            <p class="mt-3 max-w-[34rem] text-base leading-7 text-dc-gray sm:text-lg">Track one Luma CSV per meetup month, spot missing uploads, and turn old exports into venue-planning signals.</p>
          </div>
          <RouterLink
            v-if="uploadableMissing[0]"
            :to="{ path: adminPath(`events/${uploadableMissing[0].event.id}/attendance`), query: { from: 'attendance' } }"
            class="editorial-action max-w-full self-start whitespace-nowrap lg:shrink-0"
          >
            Upload Missing CSV
          </RouterLink>
        </header>

        <div v-if="error" class="mb-6 rounded-md border-2 border-red-700 bg-red-50 p-4 text-sm font-semibold text-red-800">{{ error }}</div>

        <section v-if="ledger.length === 0" class="editorial-panel p-8">
          <p class="editorial-eyebrow">fresh start</p>
          <h2 class="text-3xl font-black tracking-tight text-dc-ink">No event months yet.</h2>
          <p class="mt-3 max-w-2xl text-base leading-7 text-dc-gray">Create monthly events first. Each event month can hold one current Luma attendance CSV.</p>
        </section>

        <template v-else-if="insights">
          <section class="mb-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(19rem,0.42fr)] lg:items-stretch">
            <article class="ops-panel overflow-hidden">
              <div class="border-b border-dc-border bg-dc-paper-warm px-5 py-4">
                <p class="editorial-eyebrow mb-1">year signal</p>
                <h2 class="text-2xl font-black tracking-tight text-dc-ink">{{ selectedYearLabel }} attendance read</h2>
              </div>
              <div class="grid gap-0 divide-y divide-dc-border md:grid-cols-2 md:divide-x md:divide-y-0">
                <div v-for="card in headlineCards" :key="card.label" class="p-5">
                  <p class="font-mono text-[11px] font-bold uppercase tracking-wide" :class="card.tone">{{ card.label }}</p>
                  <p class="mt-3 text-5xl font-black leading-none tracking-tight text-dc-ink">{{ card.value }}</p>
                  <p class="mt-3 max-w-sm text-sm font-semibold leading-6 text-dc-gray">{{ card.detail }}</p>
                </div>
              </div>
            </article>

            <aside class="ops-panel flex flex-col justify-between p-5">
              <div>
                <p class="editorial-eyebrow">coverage</p>
                <p class="mt-3 text-4xl font-black leading-none tracking-tight text-dc-ink">{{ selectedYearUploaded }}/{{ yearLedger.length }}</p>
                <p class="mt-3 text-sm font-semibold leading-6 text-dc-gray">
                  {{ selectedYearCompletedMissing }} completed month{{ selectedYearCompletedMissing === 1 ? '' : 's' }} still need a Luma CSV.
                </p>
              </div>
              <RouterLink
                v-if="uploadableMissing[0]"
                :to="{ path: adminPath(`events/${uploadableMissing[0].event.id}/attendance`), query: { from: 'attendance' } }"
                class="editorial-secondary-action mt-5 justify-center px-4 py-2 text-xs"
              >
                Upload next missing CSV
              </RouterLink>
            </aside>
          </section>

          <section class="space-y-6">
            <div class="ops-panel min-w-0 overflow-hidden">
              <div class="ops-panel-header flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p class="editorial-eyebrow mb-1">monthly ledger</p>
                  <h2 class="text-2xl font-black tracking-tight text-dc-ink">{{ selectedMonthLabel }} attendance</h2>
                  <p class="mt-2 max-w-3xl text-sm leading-6 text-dc-gray">For {{ selectedYearLabel }}, each monthly meetup has one current Luma CSV. Use All for the year view, or jump into a specific month when the organizer team is catching up uploads.</p>
                </div>
                <div class="grid gap-2 text-sm sm:grid-cols-4 lg:min-w-[32rem]">
                  <div class="rounded-md border border-dc-border bg-dc-paper px-3 py-2">
                    <p class="font-mono text-[10px] font-bold uppercase tracking-wide text-dc-gray">Months</p>
                    <p class="font-black text-dc-ink">{{ yearLedger.length }}</p>
                  </div>
                  <div class="rounded-md border border-dc-border bg-dc-paper px-3 py-2">
                    <p class="font-mono text-[10px] font-bold uppercase tracking-wide text-dc-gray">Uploaded</p>
                    <p class="font-black text-dc-success">{{ selectedYearUploaded }}</p>
                  </div>
                  <div class="rounded-md border border-dc-border bg-dc-paper px-3 py-2">
                    <p class="font-mono text-[10px] font-bold uppercase tracking-wide text-dc-gray">Missing</p>
                    <p class="font-black text-dc-pink">{{ selectedYearMissing }}</p>
                  </div>
                  <div class="rounded-md border border-dc-border bg-dc-paper px-3 py-2">
                    <p class="font-mono text-[10px] font-bold uppercase tracking-wide text-dc-gray">Missing done</p>
                    <p class="font-black text-dc-pink">{{ selectedYearCompletedMissing }}</p>
                  </div>
                </div>
              </div>

              <div class="border-b border-dc-border bg-dc-paper px-5 py-4">
                <div class="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                  <div class="space-y-3">
                    <div class="flex flex-wrap gap-2">
                      <button
                        v-for="year in availableYears"
                        :key="year"
                        type="button"
                        class="motion-press rounded-md border-2 px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-wide"
                        :class="selectedYear === year ? 'border-dc-ink bg-dc-yellow text-dc-ink shadow-[2px_2px_0_#111111]' : 'border-dc-border bg-dc-paper text-dc-gray hover:border-dc-ink hover:text-dc-ink'"
                        @click="selectedYear = year"
                      >
                        {{ year }}
                      </button>
                    </div>

                    <div class="flex flex-wrap gap-2">
                      <button
                        type="button"
                        class="motion-press rounded-md border-2 px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-wide"
                        :class="selectedMonth === 'all' ? 'border-dc-ink bg-dc-yellow text-dc-ink shadow-[2px_2px_0_#111111]' : 'border-dc-border bg-dc-paper text-dc-gray hover:border-dc-ink hover:text-dc-ink'"
                        @click="selectedMonth = 'all'"
                      >
                        All
                      </button>
                      <button
                        v-for="month in availableMonthOptions"
                        :key="month.value"
                        type="button"
                        class="motion-press rounded-md border-2 px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-wide"
                        :class="selectedMonth === month.value ? 'border-dc-ink bg-dc-yellow text-dc-ink shadow-[2px_2px_0_#111111]' : 'border-dc-border bg-dc-paper text-dc-gray hover:border-dc-ink hover:text-dc-ink'"
                        @click="selectedMonth = month.value"
                      >
                        {{ month.label }}
                      </button>
                    </div>
                  </div>

                  <div class="flex flex-wrap gap-2">
                  <button
                    v-for="option in statusOptions"
                    :key="option"
                    type="button"
                    class="motion-press rounded-md border-2 px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-wide"
                    :class="selectedStatus === option ? 'border-dc-ink bg-dc-yellow text-dc-ink shadow-[2px_2px_0_#111111]' : 'border-dc-border bg-dc-paper text-dc-gray hover:border-dc-ink hover:text-dc-ink'"
                    @click="selectedStatus = option"
                  >
                    {{ option }}
                  </button>
                  </div>
                </div>
              </div>

              <div class="divide-y divide-dc-border">
                <div v-if="paginatedLedger.length === 0" class="px-5 py-10 text-center">
                  <p class="font-mono text-xs font-bold uppercase tracking-wide text-dc-gray">No months match this filter</p>
                  <p class="mt-2 text-sm text-dc-gray">Try All months or switch between uploaded and missing CSVs.</p>
                </div>

                <article
                  v-for="item in paginatedLedger"
                  :key="item.event.id"
                  class="attendance-ledger-row motion-colors"
                  :class="{ 'attendance-ledger-row--missing': !item.import }"
                >
                  <div class="min-w-0">
                    <p class="attendance-ledger-month">{{ item.month_label }}</p>
                    <p class="attendance-ledger-event">{{ item.event.name }}</p>
                    <p class="attendance-ledger-date">{{ item.attendance_month }} · {{ formatDate(item.event.event_date) }}</p>
                  </div>

                  <div class="attendance-ledger-file">
                    <div class="min-w-0">
                      <span class="attendance-ledger-status" :class="statusClass(item)">
                        {{ item.import ? 'Uploaded' : 'Missing' }}
                      </span>
                      <p class="attendance-ledger-filename">{{ item.import?.source_filename ?? 'No Luma CSV yet' }}</p>
                      <p v-if="item.import" class="attendance-ledger-imported">{{ formatDateTime(item.import.imported_at) }}</p>
                    </div>
                    <RouterLink
                      v-if="item.import || item.upload_available"
                      :to="{ path: adminPath(`events/${item.event.id}/attendance`), query: { from: 'attendance' } }"
                      class="editorial-secondary-action attendance-ledger-action"
                    >
                      {{ item.import ? 'Review' : 'Upload' }}
                    </RouterLink>
                    <span v-else class="attendance-ledger-action rounded-md border border-dc-border bg-dc-paper-warm px-3 py-2 text-center font-mono text-[11px] font-bold uppercase tracking-wide text-dc-gray">
                      Locked
                    </span>
                  </div>

                  <div class="attendance-ledger-result">
                    <template v-if="item.import">
                      <div class="attendance-ledger-result-head">
                        <p class="attendance-ledger-result-number">{{ item.summary.checked_in }}</p>
                        <p class="attendance-ledger-result-label">of {{ item.summary.approved_registrations }} approved checked in</p>
                      </div>
                      <div class="attendance-ledger-progress">
                        <div class="attendance-ledger-progress-fill" :style="{ transform: `scaleX(${item.summary.check_in_rate})` }" />
                      </div>
                      <p class="attendance-ledger-result-meta">
                        {{ item.summary.approved_no_shows }} no-show{{ item.summary.approved_no_shows === 1 ? '' : 's' }} · {{ formatPercent(item.summary.check_in_rate) }} rate
                      </p>
                    </template>
                    <div v-else class="attendance-ledger-empty">
                      <span class="attendance-ledger-empty-dot" aria-hidden="true" />
                      <p>
                        <span>{{ item.upload_available ? 'Waiting for CSV' : 'Upload not open' }}</span>
                        <small>
                          {{ item.upload_available ? 'Unlocks check-ins, no-shows, and rate.' : (item.upload_unlocks_at ? `Opens ${formatUnlockDate(item.upload_unlocks_at)}.` : item.upload_unavailable_reason) }}
                        </small>
                      </p>
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
            </div>

            <div class="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(18rem,0.75fr)]">
              <section class="editorial-panel p-5 sm:p-6">
                <p class="editorial-eyebrow">hindsight</p>
                <h2 class="text-3xl font-black tracking-tight text-dc-ink">Plan the room for {{ yearP80CheckedIn }} people.</h2>
                <p class="mt-3 max-w-2xl text-sm leading-6 text-dc-gray">That is the {{ selectedYearLabel }} 80th percentile from uploaded CSVs. Median checked-in attendance is {{ yearMedianCheckedIn }}, so this leaves a useful buffer without planning around the loudest registration number.</p>
                <div class="mt-5 grid gap-3 sm:grid-cols-3">
                  <div class="rounded-md border border-dc-border bg-dc-paper px-3 py-2">
                    <p class="font-mono text-[10px] font-bold uppercase tracking-wide text-dc-gray">P80</p>
                    <p class="text-2xl font-black text-dc-ink">{{ yearP80CheckedIn }}</p>
                  </div>
                  <div class="rounded-md border border-dc-border bg-dc-paper px-3 py-2">
                    <p class="font-mono text-[10px] font-bold uppercase tracking-wide text-dc-gray">Median</p>
                    <p class="text-2xl font-black text-dc-ink">{{ yearMedianCheckedIn }}</p>
                  </div>
                  <div class="rounded-md border border-dc-border bg-dc-paper px-3 py-2">
                    <p class="font-mono text-[10px] font-bold uppercase tracking-wide text-dc-gray">CSVs</p>
                    <p class="text-2xl font-black text-dc-ink">{{ selectedYearUploaded }}</p>
                  </div>
                </div>
              </section>

              <section class="ops-panel p-5 sm:p-6">
                <p class="editorial-eyebrow">best month</p>
                <template v-if="bestYearMonth">
                  <p class="mt-3 text-3xl font-black leading-tight tracking-tight text-dc-ink">{{ bestYearMonth.month_label }}</p>
                  <p class="mt-3 text-sm leading-6 text-dc-gray">{{ bestYearMonth.event.name }} converted registrations into actual room attendance best.</p>
                  <div class="mt-5 rounded-md border-2 border-dc-ink bg-dc-yellow p-4 shadow-[3px_3px_0_#111111]">
                    <p class="font-mono text-[10px] font-bold uppercase tracking-wide text-dc-ink/70">Check-in rate</p>
                    <p class="mt-1 text-4xl font-black leading-none text-dc-ink">{{ formatPercent(bestYearMonth.summary.check_in_rate) }}</p>
                    <p class="mt-2 font-mono text-[11px] font-bold uppercase tracking-wide text-dc-ink/70">{{ bestYearMonth.summary.checked_in }}/{{ bestYearMonth.summary.approved_registrations }} approved checked in</p>
                  </div>
                </template>
                <div v-else class="mt-4 rounded-md border border-dc-border bg-dc-paper-warm p-4">
                  <p class="text-sm leading-6 text-dc-gray">Upload a CSV to compare months. The strongest month will appear here after the first import.</p>
                  <RouterLink
                    v-if="uploadableMissing[0]"
                    :to="{ path: adminPath(`events/${uploadableMissing[0].event.id}/attendance`), query: { from: 'attendance' } }"
                    class="mt-4 inline-flex font-mono text-xs font-bold uppercase tracking-wide text-dc-pink underline decoration-dc-yellow decoration-2 underline-offset-4"
                  >
                    Upload first CSV
                  </RouterLink>
                </div>
              </section>
            </div>
          </section>
        </template>
      </template>
    </div>
  </div>
</template>
