<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import AdminAttendancePageSkeleton from '@/src/components/ui/page-skeletons/AdminAttendancePageSkeleton.vue';
import { notify } from '@/src/lib/notify';
import type { Event as CommunityEvent, EventAttendanceImport, EventAttendanceSummary, LumaAttendanceRecord } from '@/types';

interface AttendanceResponse {
  event: CommunityEvent;
  import: EventAttendanceImport | null;
  summary: EventAttendanceSummary;
  upload_available: boolean;
  upload_unavailable_reason: string | null;
  upload_unlocks_at: string | null;
}

const route = useRoute();
const loading = ref(true);
const importing = ref(false);
const removing = ref(false);
const error = ref('');
const importStage = ref<'idle' | 'reading' | 'uploading' | 'processing'>('idle');
const importProgress = ref<number | null>(null);
const event = ref<CommunityEvent | null>(null);
const attendanceImport = ref<EventAttendanceImport | null>(null);
const summary = ref<EventAttendanceSummary | null>(null);
const uploadAvailable = ref(false);
const uploadUnavailableReason = ref<string | null>(null);
const uploadUnlocksAt = ref<string | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const ATTENDANCE_CSV_MAX_BYTES = 2 * 1024 * 1024;
const ATTENDANCE_PAGE_SIZE = 8;
const searchQuery = ref('');
const selectedAttendanceFilter = ref<'all' | 'said_yes' | 'came' | 'missed' | 'pending' | 'declined'>('all');
const currentPage = ref(1);

const attendanceRecords = computed(() => attendanceImport.value?.records ?? []);
const filteredAttendanceRecords = computed(() => attendanceRecords.value.filter((record) => {
  const query = searchQuery.value.trim().toLowerCase();
  const matchesQuery = !query || [
    attendeeName(record),
    record.email ?? '',
    record.ticket_name ?? '',
    record.utm_source ?? '',
  ].some((value) => value.toLowerCase().includes(query));

  const matchesAttendance = selectedAttendanceFilter.value === 'all'
    || (selectedAttendanceFilter.value === 'said_yes' && record.approval_status === 'approved')
    || (selectedAttendanceFilter.value === 'came' && Boolean(record.checked_in_at))
    || (selectedAttendanceFilter.value === 'missed' && record.approval_status === 'approved' && !record.checked_in_at)
    || (selectedAttendanceFilter.value === 'pending' && record.approval_status === 'pending')
    || (selectedAttendanceFilter.value === 'declined' && record.approval_status === 'declined');

  return matchesQuery && matchesAttendance;
}));
const attendanceFilters = computed(() => {
  if (!summary.value) return [];

  return [
    {
      key: 'all',
      label: 'All',
      value: summary.value.total_registrations,
    },
    {
      key: 'said_yes',
      label: 'Said yes',
      value: summary.value.approved_registrations,
    },
    {
      key: 'came',
      label: 'Came',
      value: summary.value.checked_in,
    },
    {
      key: 'missed',
      label: 'Missed',
      value: summary.value.approved_no_shows,
    },
    {
      key: 'pending',
      label: 'Pending',
      value: summary.value.pending_registrations,
    },
    {
      key: 'declined',
      label: 'Declined',
      value: summary.value.declined_registrations,
    },
  ] as const;
});
const totalPages = computed(() => Math.max(1, Math.ceil(filteredAttendanceRecords.value.length / ATTENDANCE_PAGE_SIZE)));
const pageStartIndex = computed(() => filteredAttendanceRecords.value.length === 0
  ? 0
  : (currentPage.value - 1) * ATTENDANCE_PAGE_SIZE + 1);
const pageEndIndex = computed(() => Math.min(currentPage.value * ATTENDANCE_PAGE_SIZE, filteredAttendanceRecords.value.length));
const paginatedAttendanceRecords = computed(() => {
  const start = (currentPage.value - 1) * ATTENDANCE_PAGE_SIZE;
  return filteredAttendanceRecords.value.slice(start, start + ATTENDANCE_PAGE_SIZE);
});
const importButtonLabel = computed(() => {
  if (importing.value) return importStage.value === 'processing' ? 'Processing...' : 'Importing...';
  return attendanceImport.value ? 'Replace CSV' : 'Import CSV';
});
const importProgressCopy = computed(() => {
  if (importStage.value === 'reading') return `Reading CSV${importProgress.value === null ? '' : ` ${importProgress.value}%`}`;
  if (importStage.value === 'uploading') return `Uploading CSV${importProgress.value === null ? '' : ` ${importProgress.value}%`}`;
  if (importStage.value === 'processing') return 'Processing rows on server';
  return '';
});
const uploadBlockedCopy = computed(() => {
  if (uploadAvailable.value) return '';
  if (uploadUnlocksAt.value) {
    return `${uploadUnavailableReason.value ?? 'Attendance CSV upload is not open yet'} Opens ${formatDate(uploadUnlocksAt.value)}.`;
  }
  return uploadUnavailableReason.value ?? 'Attendance CSV upload is not open for this meetup month.';
});

function hydrateAttendance(payload: AttendanceResponse) {
  event.value = payload.event;
  attendanceImport.value = payload.import;
  summary.value = payload.summary;
  uploadAvailable.value = payload.upload_available;
  uploadUnavailableReason.value = payload.upload_unavailable_reason;
  uploadUnlocksAt.value = payload.upload_unlocks_at;
}

async function fetchAttendance() {
  loading.value = true;
  error.value = '';

  const response = await fetch(`/api/events/${route.params.eventId}/attendance`);

  if (response.ok) {
    hydrateAttendance(await response.json() as AttendanceResponse);
  } else {
    const payload = await response.json().catch(() => ({}));
    error.value = payload.error ?? 'Unable to load attendance analysis';
  }

  loading.value = false;
}

function chooseCsv() {
  if (importing.value) return;
  if (!uploadAvailable.value) {
    error.value = uploadBlockedCopy.value;
    return;
  }
  if (fileInput.value) fileInput.value.value = '';
  fileInput.value?.click();
}

async function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0] ?? null;

  if (!file) return;

  error.value = '';
  if (file.size > ATTENDANCE_CSV_MAX_BYTES) {
    error.value = 'CSV must be 2MB or smaller.';
    input.value = '';
    return;
  }

  await importCsv(file);
}

function readFileWithProgress(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    importStage.value = 'reading';
    importProgress.value = 0;

    reader.onprogress = (event) => {
      if (event.lengthComputable) {
        importProgress.value = Math.round((event.loaded / event.total) * 100);
      }
    };
    reader.onload = () => {
      importProgress.value = 100;
      resolve(String(reader.result ?? ''));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read the selected CSV.'));
    reader.readAsText(file);
  });
}

function importCsvWithProgress(file: File, csv: string): Promise<AttendanceResponse> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();

    importStage.value = 'uploading';
    importProgress.value = 0;
    request.open('POST', `/api/events/${route.params.eventId}/attendance/import`);
    request.setRequestHeader('Content-Type', 'application/json');

    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        importProgress.value = Math.round((event.loaded / event.total) * 100);
      }
    };
    request.upload.onload = () => {
      importStage.value = 'processing';
      importProgress.value = null;
    };
    request.onload = () => {
      let payload: unknown = {};

      try {
        payload = request.responseText ? JSON.parse(request.responseText) : {};
      } catch {
        reject(new Error('Unable to read attendance import response'));
        return;
      }

      if (request.status >= 200 && request.status < 300) {
        resolve(payload as AttendanceResponse);
      } else {
        const errorMessage = typeof payload === 'object' && payload && 'error' in payload && typeof payload.error === 'string'
          ? payload.error
          : 'Unable to import attendance CSV';
        reject(new Error(errorMessage));
      }
    };
    request.onerror = () => reject(new Error('Unable to import attendance CSV'));

    request.send(JSON.stringify({
      csv,
      source_filename: file.name,
    }));
  });
}

async function importCsv(file: File) {
  importing.value = true;
  error.value = '';

  try {
    const csv = await readFileWithProgress(file);
    const payload = await importCsvWithProgress(file, csv);
    hydrateAttendance(payload);
    notify.success('Attendance import updated', {
      description: `${file.name} imported with ${payload.import?.row_count ?? 0} rows.`,
    });
  } catch (importError) {
    error.value = importError instanceof Error ? importError.message : 'Unable to import attendance CSV';
  }

  importing.value = false;
  importStage.value = 'idle';
  importProgress.value = null;
}

async function removeImport() {
  if (!attendanceImport.value || removing.value || importing.value) return;

  removing.value = true;
  error.value = '';

  const removedFileName = attendanceImport.value.source_filename ?? 'Luma CSV';
  const response = await fetch(`/api/events/${route.params.eventId}/attendance`, {
    method: 'DELETE',
  });

  if (response.ok) {
    hydrateAttendance(await response.json() as AttendanceResponse);
    notify.success('Attendance file removed', {
      description: `${removedFileName} is no longer attached to this event.`,
    });
  } else {
    const payload = await response.json().catch(() => ({}));
    error.value = payload.error ?? 'Unable to remove attendance file';
  }

  removing.value = false;
}

function formatDateTime(value: string | null): string {
  if (!value) return 'Not checked in';

  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
}

function attendeeName(record: LumaAttendanceRecord): string {
  return record.name || record.email || record.guest_id;
}

function attendanceOutcome(record: LumaAttendanceRecord): string {
  if (record.checked_in_at) return 'Came';
  if (record.approval_status === 'approved') return 'Missed';
  if (record.approval_status === 'pending') return 'Pending';
  return 'Declined';
}

function attendanceOutcomeClass(record: LumaAttendanceRecord): string {
  if (record.checked_in_at) return 'text-dc-success';
  if (record.approval_status === 'approved') return 'text-dc-pink';
  return 'text-dc-gray';
}

function attendanceContext(record: LumaAttendanceRecord): string {
  return [record.ticket_name, record.utm_source].filter(Boolean).join(' / ') || '-';
}

function clearAttendanceFilters() {
  searchQuery.value = '';
  selectedAttendanceFilter.value = 'all';
}

function goToPreviousAttendancePage() {
  currentPage.value = Math.max(1, currentPage.value - 1);
}

function goToNextAttendancePage() {
  currentPage.value = Math.min(totalPages.value, currentPage.value + 1);
}

watch([searchQuery, selectedAttendanceFilter], () => {
  currentPage.value = 1;
});

watch(totalPages, (pages) => {
  if (currentPage.value > pages) currentPage.value = pages;
});

onMounted(fetchAttendance);
</script>

<template>
  <div class="editorial-page">
    <div class="editorial-wrap py-6">
      <AdminAttendancePageSkeleton v-if="loading" />

      <template v-else>
        <header class="editorial-header mb-6 flex flex-col gap-5 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p class="editorial-eyebrow">event attendance</p>
            <h1 class="editorial-title">Attendance readout</h1>
            <p class="editorial-subtitle">A post-event view of Luma registrations, check-ins, and the gap organizers need for venue planning.</p>
          </div>
          <div class="w-full border border-dc-border bg-dc-paper px-4 py-3 lg:w-[24rem]">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Transition name="attendance-import-state" mode="out-in">
                <div :key="attendanceImport?.id ?? 'empty-import'" class="min-w-0">
                  <p class="font-mono text-[11px] font-bold uppercase tracking-wide text-dc-gray">Luma CSV</p>
                  <p v-if="attendanceImport" class="mt-1 max-w-[13rem] truncate text-lg font-black tracking-tight text-dc-ink">{{ attendanceImport.source_filename ?? 'Luma CSV' }}</p>
                  <p v-else class="mt-1 text-lg font-black tracking-tight text-dc-ink">No CSV imported</p>
                </div>
              </Transition>
              <input ref="fileInput" class="sr-only" type="file" accept=".csv,text/csv" @change="handleFileChange" />
              <div class="flex shrink-0 flex-wrap gap-2 sm:justify-end">
                <button type="button" class="editorial-action min-h-10 px-4 py-2 text-[11px]" :disabled="importing || removing || !uploadAvailable" @click="chooseCsv">
                  {{ importButtonLabel }}
                </button>
                <Transition name="attendance-remove-action">
                  <button
                    v-if="attendanceImport"
                    type="button"
                    class="motion-press min-h-10 rounded-md border border-dc-border bg-dc-paper px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-wide text-dc-gray hover:border-red-600 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                    :disabled="importing || removing"
                    @click="removeImport"
                  >
                    {{ removing ? 'Removing...' : 'Remove file' }}
                  </button>
                </Transition>
              </div>
            </div>
            <p v-if="!uploadAvailable" class="mt-3 text-xs font-semibold leading-5 text-dc-gray">
              {{ uploadBlockedCopy }}
            </p>
            <Transition name="attendance-progress">
              <div v-if="importing" class="mt-4">
                <div class="mb-2 flex items-center justify-between gap-3 font-mono text-[11px] font-bold uppercase tracking-wide text-dc-gray">
                  <span>{{ importProgressCopy }}</span>
                  <span v-if="importProgress !== null">{{ importProgress }}%</span>
                </div>
                <div class="h-2 overflow-hidden rounded-full bg-dc-border">
                  <div
                    v-if="importProgress !== null"
                    class="h-full rounded-full bg-dc-pink transition-[width] duration-150 ease-[var(--motion-fast)]"
                    :style="{ width: `${importProgress}%` }"
                  />
                  <div v-else class="h-full w-1/2 rounded-full bg-dc-pink motion-surface" />
                </div>
              </div>
            </Transition>
          </div>
        </header>

        <div v-if="error" class="mb-6 rounded-md border-2 border-red-700 bg-red-50 p-4 text-sm font-semibold text-red-800">{{ error }}</div>

        <Transition name="attendance-content" mode="out-in">
          <section v-if="!attendanceImport || !summary" key="empty" class="editorial-panel p-8">
            <p class="editorial-eyebrow">no import yet</p>
            <h2 class="text-3xl font-black tracking-tight text-dc-ink">No attendance data for {{ event?.name ?? 'this event' }}</h2>
            <p class="mt-3 max-w-2xl text-base leading-7 text-dc-gray">Once a Luma CSV is imported, this page will show registrations, recorded check-ins, and no-shows for the organizer team.</p>
            <p v-if="!uploadAvailable" class="mt-4 max-w-2xl rounded-md border border-dc-border bg-dc-paper-warm p-4 text-sm font-semibold leading-6 text-dc-gray">
              {{ uploadBlockedCopy }}
            </p>
          </section>

          <div v-else key="analysis">
          <section>
            <section class="ops-panel overflow-visible">
              <div class="sticky top-0 z-20 overflow-hidden rounded-t-md bg-dc-paper">
                <div class="ops-panel-header flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <p class="editorial-eyebrow">attendance ledger</p>
                    <h2 class="text-2xl font-black tracking-tight text-dc-ink">Who said yes, who came, who missed</h2>
                  </div>
                  <p class="font-mono text-xs font-bold uppercase tracking-wide text-dc-gray">
                    {{ pageStartIndex }}-{{ pageEndIndex }} of {{ filteredAttendanceRecords.length }} shown
                  </p>
                </div>

                <div class="border-y border-dc-border bg-dc-paper-warm px-5 py-4">
                  <div class="grid gap-4 xl:grid-cols-[minmax(260px,0.9fr)_minmax(0,1.6fr)_auto] xl:items-end">
                    <label class="block">
                      <span class="font-mono text-[11px] font-bold uppercase tracking-wide text-dc-gray">Search</span>
                      <input
                        v-model="searchQuery"
                        type="text"
                        placeholder="Name, email, ticket"
                        class="editorial-input mt-2 font-mono"
                      >
                    </label>

                    <div>
                      <p class="font-mono text-[11px] font-bold uppercase tracking-wide text-dc-gray">Show</p>
                      <div class="mt-2 flex flex-wrap gap-1.5">
                        <button
                          v-for="filter in attendanceFilters"
                          :key="filter.key"
                          type="button"
                          class="motion-press inline-flex min-h-10 items-center gap-2 rounded-md border px-3 font-mono text-[11px] font-bold uppercase tracking-wide"
                          :class="selectedAttendanceFilter === filter.key ? 'border-dc-ink bg-dc-yellow text-dc-ink shadow-[1px_1px_0_#111111]' : 'border-dc-border bg-dc-paper text-dc-gray hover:border-dc-ink hover:text-dc-ink'"
                          @click="selectedAttendanceFilter = filter.key"
                        >
                          <span>{{ filter.label }}</span>
                          <span class="text-sm leading-none">{{ filter.value }}</span>
                        </button>
                      </div>
                    </div>

                    <div class="flex xl:justify-end">
                      <button
                        type="button"
                        class="motion-press min-h-10 rounded-md border border-dc-border bg-dc-paper px-3 font-mono text-[11px] font-bold uppercase tracking-wide text-dc-gray hover:border-dc-ink hover:text-dc-ink"
                        @click="clearAttendanceFilters"
                      >
                        Reset
                      </button>
                    </div>
                  </div>
                </div>

                <div class="overflow-x-auto border-b border-dc-border bg-dc-paper-warm">
                  <div class="grid min-w-[760px] grid-cols-[35%_35%_15%_15%] font-mono text-[11px] font-bold uppercase tracking-wide text-dc-gray">
                    <div class="px-4 py-2.5">Person</div>
                    <div class="px-4 py-2.5">Contact</div>
                    <div class="px-4 py-2.5">Attendance</div>
                    <div class="px-4 py-2.5">Context</div>
                  </div>
                </div>
              </div>

              <div v-if="filteredAttendanceRecords.length === 0" class="p-5 text-sm leading-6 text-dc-gray">
                No attendance rows match the current filters.
              </div>
              <div v-else class="overflow-x-auto">
                <table class="w-full min-w-[760px] table-fixed text-left">
                  <colgroup>
                    <col class="w-[35%]">
                    <col class="w-[35%]">
                    <col class="w-[15%]">
                    <col class="w-[15%]">
                  </colgroup>
                  <thead class="sr-only">
                    <tr>
                      <th class="px-4 py-2.5">Person</th>
                      <th class="px-4 py-2.5">Contact</th>
                      <th class="px-4 py-2.5">Attendance</th>
                      <th class="px-4 py-2.5">Context</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-dc-border">
                    <tr v-for="record in paginatedAttendanceRecords" :key="record.guest_id">
                      <td class="px-4 py-2.5 align-middle text-sm font-bold text-dc-ink">
                        <span class="block w-full truncate">{{ attendeeName(record) }}</span>
                      </td>
                      <td class="px-4 py-2.5 align-middle text-sm text-dc-gray">
                        <span class="block w-full truncate">{{ record.email ?? '-' }}</span>
                      </td>
                      <td class="px-4 py-2.5 align-middle font-mono text-[11px] font-bold uppercase tracking-wide" :class="attendanceOutcomeClass(record)">
                        <span class="block w-full truncate">{{ attendanceOutcome(record) }}</span>
                      </td>
                      <td class="px-4 py-2.5 align-middle text-sm text-dc-gray">
                        <span class="block w-full truncate">{{ attendanceContext(record) }}</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div v-if="filteredAttendanceRecords.length > ATTENDANCE_PAGE_SIZE" class="pagination-footer shrink-0">
                <p class="pagination-summary">
                  Showing {{ pageStartIndex }}-{{ pageEndIndex }} of {{ filteredAttendanceRecords.length }}
                </p>
                <div class="pagination-controls">
                  <button
                    type="button"
                    class="pagination-button"
                    :disabled="currentPage === 1"
                    @click="goToPreviousAttendancePage"
                  >
                    <span aria-hidden="true">‹</span>
                    Prev
                  </button>
                  <span class="pagination-count" aria-live="polite">
                    Page {{ currentPage }} of {{ totalPages }}
                  </span>
                  <button
                    type="button"
                    class="pagination-button"
                    :disabled="currentPage === totalPages"
                    @click="goToNextAttendancePage"
                  >
                    Next
                    <span aria-hidden="true">›</span>
                  </button>
                </div>
              </div>
            </section>
          </section>
          </div>
        </Transition>
      </template>
    </div>
  </div>
</template>
