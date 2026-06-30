<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { adminPath } from '@/src/admin-routes';
import NaviiAvatar from '@/src/components/NaviiAvatar.vue';
import AdminAttendanceOverviewPageSkeleton from '@/src/components/ui/page-skeletons/AdminAttendanceOverviewPageSkeleton.vue';
import type { AttendanceLedgerMonth, AttendanceLedgerMonthEvent, AttendanceMonthlyInsights } from '@/types';

interface ConsistencyPersonRow {
  key: string;
  name: string;
  email: string | null;
  registeredCount: number;
  checkedInCount: number;
  lastSeenAt: string | null;
}

const loading = ref(true);
const error = ref('');
const ledger = ref<AttendanceLedgerMonth[]>([]);
const insights = ref<AttendanceMonthlyInsights | null>(null);
const selectedStatus = ref<'all' | 'uploaded' | 'missing'>('all');
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
const peakYearMonth = computed(() => [...importedYearLedger.value]
  .sort((a, b) => b.summary.checked_in - a.summary.checked_in)[0] ?? null);
const planningCards = computed(() => [
  {
    label: 'Most people',
    value: peakYearMonth.value ? `${formatMonthLabel(peakYearMonth.value.month_label)}` : '-',
    detail: peakYearMonth.value ? `${peakYearMonth.value.summary.checked_in} checked in` : 'Upload CSVs to compare months',
    meta: 'Peak',
  },
  {
    label: 'Expected turnout',
    value: yearP80CheckedIn.value || '-',
    detail: yearP80CheckedIn.value ? 'Plan from the high end of normal' : 'No attendance baseline yet',
    meta: 'P80',
  },
  {
    label: 'Space capacity',
    value: roomCapacityGuide.value || '-',
    detail: roomCapacityGuide.value ? `Includes a 15% buffer` : 'Needs uploaded CSVs',
    meta: 'Guide',
  },
  {
    label: 'CSV coverage',
    value: `${selectedYearUploaded.value}/${yearLedger.value.length}`,
    detail: `${selectedYearMissing.value} missing / median turnout ${yearMedianCheckedIn.value || '-'}`,
    meta: 'CSVs',
  },
]);
const consistentPeople = computed<ConsistencyPersonRow[]>(() => {
  const people = new Map<string, {
    key: string;
    name: string;
    email: string | null;
    registeredEvents: Set<string>;
    checkedInEvents: Set<string>;
    lastSeenAt: string | null;
  }>();

  for (const month of importedYearLedger.value) {
    for (const eventItem of month.events) {
      if (!eventItem.import) continue;

      for (const record of eventItem.import.records) {
        const key = record.email?.trim().toLowerCase() || record.guest_id;
        const existing = people.get(key) ?? {
          key,
          name: record.name || record.email || record.guest_id,
          email: record.email,
          registeredEvents: new Set<string>(),
          checkedInEvents: new Set<string>(),
          lastSeenAt: null,
        };

        existing.name = existing.name || record.name || record.email || record.guest_id;
        existing.email = existing.email ?? record.email;
        existing.registeredEvents.add(eventItem.event.id);
        if (record.checked_in_at) existing.checkedInEvents.add(eventItem.event.id);
        if (!existing.lastSeenAt || new Date(eventItem.event.event_date).getTime() > new Date(existing.lastSeenAt).getTime()) {
          existing.lastSeenAt = eventItem.event.event_date;
        }
        people.set(key, existing);
      }
    }
  }

  return Array.from(people.values())
    .map((person) => ({
      key: person.key,
      name: person.name,
      email: person.email,
      registeredCount: person.registeredEvents.size,
      checkedInCount: person.checkedInEvents.size,
      lastSeenAt: person.lastSeenAt,
    }))
    .filter((person) => person.registeredCount > 1 || person.checkedInCount > 1)
    .sort(rankConsistentPeople)
    .slice(0, 8);
});

function rankConsistentPeople(a: ConsistencyPersonRow, b: ConsistencyPersonRow): number {
  const aRate = a.registeredCount === 0 ? 0 : a.checkedInCount / a.registeredCount;
  const bRate = b.registeredCount === 0 ? 0 : b.checkedInCount / b.registeredCount;

  return (
    b.checkedInCount - a.checkedInCount
    || bRate - aRate
    || b.registeredCount - a.registeredCount
    || new Date(b.lastSeenAt ?? 0).getTime() - new Date(a.lastSeenAt ?? 0).getTime()
    || a.name.localeCompare(b.name)
  );
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
  return value.replace(/^([A-Za-z]{3})[a-z]*/, '$1');
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
            <h1 class="text-[2.25rem] font-black leading-none tracking-tight text-dc-ink/90 sm:text-5xl">Monthly attendance</h1>
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
          <h2 class="text-3xl font-black tracking-tight text-dc-ink/90">No event months yet.</h2>
          <p class="mt-3 max-w-2xl text-base leading-7 text-dc-gray">Create monthly events first. Each event month can hold one current Luma attendance CSV.</p>
        </section>

        <template v-else-if="insights">
          <section class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(13rem,0.24fr)] lg:items-stretch">
            <section class="ops-panel flex min-h-[42rem] min-w-0 flex-col overflow-hidden">
              <div class="ops-panel-header flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p class="editorial-eyebrow mb-1">monthly ledger</p>
                  <h2 class="text-2xl font-black tracking-tight text-dc-ink/90">{{ selectedYearLabel }} attendance</h2>
                  <p class="mt-2 font-mono text-[11px] font-bold uppercase tracking-wide text-dc-gray">
                    {{ selectedYearUploaded }} uploaded / {{ selectedYearMissing }} missing / room guide {{ yearP80CheckedIn || '-' }}
                  </p>
                </div>
                <div class="flex flex-col gap-2 lg:items-end">
                  <div class="flex flex-wrap gap-1.5 lg:justify-end">
                    <button
                      v-for="year in availableYears"
                      :key="year"
                      type="button"
                      class="motion-press min-h-8 rounded-md border px-2.5 font-mono text-[11px] font-bold uppercase tracking-wide"
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
                      class="motion-press min-h-8 rounded-md border px-2.5 font-mono text-[11px] font-bold uppercase tracking-wide"
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
                  <p class="font-mono text-xs font-bold uppercase tracking-wide text-dc-gray">No months match this filter</p>
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
                        <p class="text-xl font-black tracking-tight text-dc-ink/90 sm:text-2xl">{{ formatMonthLabel(item.month_label) }}</p>
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
                            <p class="truncate text-sm font-black text-dc-ink/90">{{ eventItem.event.name }}</p>
                            <p class="font-mono text-[10px] font-bold uppercase tracking-wide text-dc-gray">{{ formatDate(eventItem.event.event_date) }}</p>
                          </div>
                          <p class="justify-self-start font-mono text-[11px] font-bold uppercase tracking-wide sm:justify-self-end" :class="eventItem.import ? 'text-dc-success' : eventItem.event.status === 'completed' ? 'text-dc-pink' : 'text-dc-gray'">
                            {{ eventItem.import ? `${eventItem.summary.checked_in} came / ${formatPercent(eventItem.summary.check_in_rate)}` : eventItem.upload_available ? 'Waiting for CSV' : 'Not open yet' }}
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

            <aside class="grid gap-3 lg:h-full lg:grid-rows-4">
              <article v-for="card in planningCards" :key="card.label" class="ops-panel flex min-h-[7.5rem] flex-col justify-between p-4">
                <div class="flex items-start justify-between gap-3">
                  <p class="font-mono text-[10px] font-bold uppercase tracking-wide text-dc-gray">{{ card.label }}</p>
                  <span class="shrink-0 rounded-sm border border-dc-border bg-dc-paper-warm px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wide text-dc-gray">
                    {{ card.meta }}
                  </span>
                </div>
                <div>
                  <p class="mt-3 text-[1.7rem] font-black leading-none tracking-tight text-dc-ink/90">{{ card.value }}</p>
                  <div class="my-2 h-px bg-dc-border" aria-hidden="true" />
                  <p class="text-xs leading-5 text-dc-gray">{{ card.detail }}</p>
                </div>
              </article>
            </aside>
          </section>

          <section class="ops-panel mt-6 overflow-hidden">
            <div class="ops-panel-header flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p class="editorial-eyebrow mb-1">regulars</p>
                <h2 class="text-2xl font-black tracking-tight text-dc-ink/90">Consistent people</h2>
              </div>
              <p class="font-mono text-xs font-bold uppercase tracking-wide text-dc-gray">
                {{ selectedYearLabel }} uploaded CSVs
              </p>
            </div>

            <div v-if="consistentPeople.length === 0" class="px-5 py-8 text-sm text-dc-gray">
              Upload at least two monthly CSVs to see repeat registrations and check-ins.
            </div>
            <div v-else class="overflow-x-auto">
              <table class="w-full min-w-[680px] text-left">
                <thead class="border-y border-dc-border bg-dc-paper-warm font-mono text-[11px] font-bold uppercase tracking-wide text-dc-gray">
                  <tr>
                    <th class="px-5 py-3">Person</th>
                    <th class="px-5 py-3">Registered</th>
                    <th class="px-5 py-3">Came</th>
                    <th class="px-5 py-3">Rate</th>
                    <th class="px-5 py-3">Last seen</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-dc-border">
                  <tr v-for="person in consistentPeople" :key="person.key">
                    <td class="px-5 py-3">
                      <div class="flex items-center gap-3">
                        <NaviiAvatar :seed="person.key" :title="`${person.name} avatar`" :size="38" />
                        <div class="min-w-0">
                          <p class="truncate text-sm font-black text-dc-ink/90">{{ person.name }}</p>
                          <p v-if="person.email" class="mt-0.5 truncate text-xs text-dc-gray">{{ person.email }}</p>
                        </div>
                      </div>
                    </td>
                    <td class="px-5 py-3 font-mono text-xs font-bold uppercase tracking-wide text-dc-gray">{{ person.registeredCount }}</td>
                    <td class="px-5 py-3 font-mono text-xs font-bold uppercase tracking-wide text-dc-success">{{ person.checkedInCount }}</td>
                    <td class="px-5 py-3 font-mono text-xs font-bold uppercase tracking-wide text-dc-gray">{{ formatPercent(person.checkedInCount / person.registeredCount) }}</td>
                    <td class="px-5 py-3 font-mono text-xs font-bold uppercase tracking-wide text-dc-gray">{{ person.lastSeenAt ? formatDate(person.lastSeenAt) : '-' }}</td>
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
