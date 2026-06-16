<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import ViewSkeleton from '@/src/components/ui/ViewSkeleton.vue';
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

const approvedNoShows = computed(() => attendanceImport.value?.records
  .filter((record) => record.approval_status === 'approved' && !record.checked_in_at) ?? []);
const checkedInRecords = computed(() => attendanceImport.value?.records
  .filter((record) => Boolean(record.checked_in_at)) ?? []);
const primaryMetrics = computed(() => {
  if (!summary.value) return [];

  return [
    {
      label: 'Approved',
      value: summary.value.approved_registrations,
      detail: 'Expected attendance pool',
    },
    {
      label: 'Checked in',
      value: summary.value.checked_in,
      detail: 'Luma check-ins recorded',
    },
    {
      label: 'No-shows',
      value: summary.value.approved_no_shows,
      detail: 'Approved without check-in',
    },
    {
      label: 'Check-in rate',
      value: formatPercent(summary.value.check_in_rate),
      detail: `${summary.value.registration_to_attendance_gap} person gap`,
    },
  ];
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

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function attendeeName(record: LumaAttendanceRecord): string {
  return record.name || record.email || record.guest_id;
}

onMounted(fetchAttendance);
</script>

<template>
  <div class="editorial-page">
    <div class="editorial-wrap">
      <ViewSkeleton v-if="loading" variant="ledger" :rows="4" />

      <template v-else>
        <header class="editorial-header flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p class="editorial-eyebrow">event attendance</p>
            <h1 class="editorial-title">Attendance readout</h1>
            <p class="editorial-subtitle">A post-event view of Luma registrations, check-ins, and the gap organizers need for venue planning.</p>
          </div>
          <div class="ops-panel w-full p-4 lg:w-[26rem]">
            <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <Transition name="attendance-import-state" mode="out-in">
                <div :key="attendanceImport?.id ?? 'empty-import'" class="min-w-0">
                  <p class="font-mono text-[11px] font-bold uppercase tracking-wide text-dc-gray">Luma CSV</p>
                  <p v-if="attendanceImport" class="mt-1 max-w-xs truncate text-2xl font-black tracking-tight text-dc-ink">{{ attendanceImport.source_filename ?? 'Luma CSV' }}</p>
                  <p v-else class="mt-1 text-2xl font-black tracking-tight text-dc-ink">Import export</p>
                  <p class="mt-2 font-mono text-xs font-bold uppercase tracking-wide text-dc-pink">
                    {{ attendanceImport ? `${attendanceImport.row_count} rows` : 'CSV only / 2MB max' }}
                  </p>
                  <p v-if="attendanceImport" class="mt-2 font-mono text-[11px] font-bold uppercase tracking-wide text-dc-gray">{{ formatDateTime(attendanceImport.imported_at) }}</p>
                </div>
              </Transition>
              <input ref="fileInput" class="sr-only" type="file" accept=".csv,text/csv" @change="handleFileChange" />
              <div class="flex shrink-0 flex-col gap-2">
                <button type="button" class="editorial-action px-5 py-3 text-xs" :disabled="importing || removing || !uploadAvailable" @click="chooseCsv">
                  {{ importButtonLabel }}
                </button>
                <p v-if="!uploadAvailable" class="max-w-[15rem] text-xs font-semibold leading-5 text-dc-gray">
                  {{ uploadBlockedCopy }}
                </p>
                <Transition name="attendance-remove-action">
                  <button
                    v-if="attendanceImport"
                    type="button"
                    class="motion-press rounded-md border-2 border-dc-ink bg-dc-paper px-5 py-2 font-mono text-[11px] font-bold uppercase tracking-wide text-dc-gray shadow-[2px_2px_0_#111111] hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                    :disabled="importing || removing"
                    @click="removeImport"
                  >
                    {{ removing ? 'Removing...' : 'Remove file' }}
                  </button>
                </Transition>
                <p v-if="attendanceImport" class="max-w-[15rem] text-xs font-semibold leading-5 text-dc-gray">
                  Removing this CSV drops this meetup from attendance totals until a replacement is uploaded.
                </p>
              </div>
            </div>
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
            <section class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <article v-for="metric in primaryMetrics" :key="metric.label" class="ops-panel p-4">
              <p class="font-mono text-[11px] font-bold uppercase tracking-wide text-dc-gray">{{ metric.label }}</p>
              <p class="mt-3 text-4xl font-black tracking-tight text-dc-ink">{{ metric.value }}</p>
              <p class="mt-2 text-sm leading-6 text-dc-gray">{{ metric.detail }}</p>
            </article>
          </section>

          <section class="mt-8">
            <div class="space-y-8">
              <section class="ops-panel overflow-hidden">
                <div class="ops-panel-header">
                  <p class="editorial-eyebrow">approved no-shows</p>
                  <h2 class="text-2xl font-black tracking-tight text-dc-ink">Registered but not checked in</h2>
                </div>
                <div v-if="approvedNoShows.length === 0" class="p-5 text-sm leading-6 text-dc-gray">Every approved registration has a check-in in this import.</div>
                <div v-else class="overflow-x-auto">
                  <table class="w-full min-w-[560px] text-left">
                    <thead class="border-b border-dc-border bg-dc-paper-warm font-mono text-[11px] font-bold uppercase tracking-wide text-dc-gray">
                      <tr>
                        <th class="px-5 py-3">Guest</th>
                        <th class="px-5 py-3">Email</th>
                        <th class="px-5 py-3">Registered</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-dc-border">
                      <tr v-for="record in approvedNoShows.slice(0, 12)" :key="record.guest_id">
                        <td class="px-5 py-4 text-sm font-bold text-dc-ink">{{ attendeeName(record) }}</td>
                        <td class="px-5 py-4 text-sm text-dc-gray">{{ record.email ?? '-' }}</td>
                        <td class="px-5 py-4 font-mono text-xs font-bold uppercase tracking-wide text-dc-gray">{{ formatDateTime(record.registered_at) }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>

              <section class="ops-panel overflow-hidden">
                <div class="ops-panel-header">
                  <p class="editorial-eyebrow">checked in</p>
                  <h2 class="text-2xl font-black tracking-tight text-dc-ink">People Luma recorded at the door</h2>
                </div>
                <div class="overflow-x-auto">
                  <table class="w-full min-w-[560px] text-left">
                    <thead class="border-b border-dc-border bg-dc-paper-warm font-mono text-[11px] font-bold uppercase tracking-wide text-dc-gray">
                      <tr>
                        <th class="px-5 py-3">Guest</th>
                        <th class="px-5 py-3">Status</th>
                        <th class="px-5 py-3">Checked in</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-dc-border">
                      <tr v-for="record in checkedInRecords.slice(0, 12)" :key="record.guest_id">
                        <td class="px-5 py-4 text-sm font-bold text-dc-ink">{{ attendeeName(record) }}</td>
                        <td class="px-5 py-4 font-mono text-xs font-bold uppercase tracking-wide text-dc-gray">{{ record.approval_status }}</td>
                        <td class="px-5 py-4 font-mono text-xs font-bold uppercase tracking-wide text-dc-gray">{{ formatDateTime(record.checked_in_at) }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </section>
          </div>
        </Transition>
      </template>
    </div>
  </div>
</template>
