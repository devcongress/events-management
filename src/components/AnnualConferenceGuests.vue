<script setup lang="ts">
import BoneyardPageSkeleton from '@/src/components/ui/BoneyardPageSkeleton.vue';
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { useRoute } from 'vue-router';
import AppPagination from '@/src/components/AppPagination.vue';
import AnnualConferenceGuestEmails from '@/src/components/AnnualConferenceGuestEmails.vue';
import ConfirmDialog from '@/src/components/ui/ConfirmDialog.vue';
import RegistrationAlphabetFilter from '@/src/components/ui/RegistrationAlphabetFilter.vue';
import { fetchAnnualConferenceWorkPlan, fetchJson, queryKeys } from '@/src/lib/api';
import { hasAnyAnnualConferenceCapability } from '@/lib/annual-conference-capabilities';
import {
  ALL_REGISTRATION_INITIALS,
  filterRegistrationsForCheckIn,
  registrationInitials,
} from '@/src/lib/registration-checkin';
import { conferenceQrToken } from '@/src/lib/conference-qr';
import { conferenceGuestRows, conferenceGuestMatchesStatus, type ConferenceRegistrationGuest, type ConferenceAdmission } from '@/src/lib/conference-guests';

const props = defineProps<{
  registrations?: ConferenceRegistrationGuest[];
  refreshRegistrations?: () => Promise<unknown>;
  managementBusy?: boolean;
  allowRecovery?: boolean;
}>();
const recoveredSources = computed(() => new Set(props.registrations?.map((item) => item.recovered_from_id).filter(Boolean)));
const emit = defineEmits<{ cancel: [registration: ConferenceRegistrationGuest]; recover: [registration: ConferenceRegistrationGuest] }>();

type ScanOutcome = 'checked_in' | 'already_checked_in' | 'invalid';
type Detector = { detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> };
type DetectorConstructor = new (options: { formats: string[] }) => Detector;
type AttendeeRecord = ConferenceAdmission;
type AttendeeResponse = Omit<AttendeeRecord, 'name'>;
type AttendeeSearchResponse = Omit<AttendeeResponse, 'order_seat_number'> & {
  order_seat_number?: number | null;
};
type RosterPage = {
  attendees: AttendeeResponse[];
  page: number;
  page_size: number;
  has_more: boolean;
};

const ROSTER_PAGE_SIZE = 100;
const DISPLAY_PAGE_SIZE = 8;
const route = useRoute();
const year = computed(() => String(route.params.year));
const workPlan = useQuery({
  queryKey: computed(() => queryKeys.annualConferenceWorkPlan(year.value)),
  queryFn: () => fetchAnnualConferenceWorkPlan(year.value),
});
const capabilities = computed(() => workPlan.data.value?.permissions.capabilities ?? []);
const canManageRegistration = computed(() => hasAnyAnnualConferenceCapability(capabilities.value, ['ticketing.manage']) && props.registrations !== undefined);
const canCheckIn = computed(() => hasAnyAnnualConferenceCapability(capabilities.value, ['ticketing.check_in', 'ticketing.manage']));
const video = ref<HTMLVideoElement | null>(null);
const scannerOpen = ref(false);
const scanning = ref(false);
const rosterLoading = ref(false);
const emailLookupLoading = ref(false);
const busy = ref(false);
const pastedCode = ref('');
const outcome = ref<ScanOutcome | null>(null);
const error = ref('');
const rosterError = ref('');
const emailLookupError = ref('');
const search = ref('');
const selectedInitial = ref(ALL_REGISTRATION_INITIALS);
const selectedStatus = ref('all');
const page = ref(1);
const attendees = ref<AttendeeRecord[]>([]);
const emailResults = ref<AttendeeRecord[] | null>(null);
const selected = ref<AttendeeRecord | null>(null);
const emailGuest = ref<ConferenceRegistrationGuest | null>(null);

watch(year, () => { emailGuest.value = null; });
const rosterLoaded = ref(false);
const visibleAttendees = computed(() => {
  const admissions = emailResults.value ?? (rosterError.value ? [] : attendees.value);
  const registrations = canManageRegistration.value ? props.registrations : undefined;
  const matchingRegistrations = emailResults.value === null ? registrations
    : registrations?.filter((registration) => admissions.some((admission) => admission.ticket_id === registration.ticket_id));

  return conferenceGuestRows(admissions, matchingRegistrations);
});
const statusOptions = computed(() => [
  { value: 'all', label: 'All' },
  ...(canManageRegistration.value ? [
    { value: 'confirmed', label: 'Confirmed' },
    { value: 'waitlisted', label: 'Waitlisted' },
    { value: 'cancelled', label: 'Cancelled' },
  ] : []),
  { value: 'issued', label: 'Not checked in' },
  { value: 'checked_in', label: 'Checked in' },
]);
const availableInitials = computed(() => registrationInitials(visibleAttendees.value));
const filteredAttendees = computed(() => filterRegistrationsForCheckIn(
  visibleAttendees.value,
  { query: search.value.includes('@') && emailResults.value ? '' : search.value, initial: selectedInitial.value },
).filter((person) => conferenceGuestMatchesStatus(person, selectedStatus.value)));
const pageCount = computed(() => Math.max(1, Math.ceil(filteredAttendees.value.length / DISPLAY_PAGE_SIZE)));
const paginatedAttendees = computed(() => filteredAttendees.value.slice(
  (page.value - 1) * DISPLAY_PAGE_SIZE,
  page.value * DISPLAY_PAGE_SIZE,
));
const pageStart = computed(() => filteredAttendees.value.length ? (page.value - 1) * DISPLAY_PAGE_SIZE + 1 : 0);
const pageEnd = computed(() => Math.min(page.value * DISPLAY_PAGE_SIZE, filteredAttendees.value.length));
const checkedInCount = computed(() => attendees.value.filter((attendee) => attendee.status === 'checked_in').length);
const outcomeText: Record<ScanOutcome, string> = {
  checked_in: 'Admission confirmed. Welcome to DevCon!',
  already_checked_in: 'Already checked in. Do not admit again.',
  invalid: 'This code is not valid for admission.',
};
let stream: MediaStream | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let cameraGeneration = 0;
let requestGeneration = 0;
let rosterRequestGeneration = 0;
let emailLookupGeneration = 0;

function attendeeRecord(attendee: AttendeeResponse): AttendeeRecord {
  const attendeeName = attendee.attendee_name?.trim() || null;

  return {
    ...attendee,
    attendee_name: attendeeName,
    name: attendeeName ?? 'Unnamed ticket',
    order_seat_number: attendee.order_seat_number ?? null,
  };
}

function stopCamera() {
  cameraGeneration += 1;
  scanning.value = false;
  clearTimeout(timer);
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;

  if (video.value) video.value.srcObject = null;
}

function selectAttendee(attendee: AttendeeRecord) {
  stopCamera();
  scannerOpen.value = false;
  error.value = '';
  outcome.value = null;
  selected.value = attendee;
}

async function loadRoster() {
  const loadGeneration = ++rosterRequestGeneration;
  const viewGeneration = requestGeneration;
  const loadedAttendees: AttendeeRecord[] = [];

  rosterLoading.value = true;
  rosterError.value = '';

  try {
    let currentPage = 1;
    let hasMore = true;

    while (hasMore) {
      const result = await fetchJson<RosterPage>(
        `/api/annual-conference/${year.value}/check-in/attendees?page=${currentPage}&page_size=${ROSTER_PAGE_SIZE}`,
        { credentials: 'include' },
      );

      if (viewGeneration !== requestGeneration || loadGeneration !== rosterRequestGeneration) return;
      loadedAttendees.push(...result.attendees.map(attendeeRecord));
      hasMore = result.has_more;
      currentPage = result.page + 1;
    }

    if (viewGeneration !== requestGeneration || loadGeneration !== rosterRequestGeneration) return;
    attendees.value = loadedAttendees;
    rosterLoaded.value = true;
    page.value = Math.min(page.value, Math.max(1, Math.ceil(filteredAttendees.value.length / DISPLAY_PAGE_SIZE)));
  } catch {
    if (viewGeneration !== requestGeneration || loadGeneration !== rosterRequestGeneration) return;
    rosterError.value = 'The complete attendee list could not be loaded. Retry before checking anyone in.';
    if (!rosterLoaded.value) attendees.value = [];
  } finally {
    if (viewGeneration === requestGeneration && loadGeneration === rosterRequestGeneration) {
      rosterLoading.value = false;
    }
  }
}

async function findByExactEmail(showNoMatch = true) {
  const email = search.value.trim();

  if (!email.includes('@') || email.length < 3 || emailLookupLoading.value) return;
  selectedInitial.value = ALL_REGISTRATION_INITIALS;
  selectedStatus.value = 'all';
  emailLookupLoading.value = true;
  emailLookupError.value = '';
  emailResults.value = [];
  page.value = 1;
  const request = requestGeneration;
  const lookup = ++emailLookupGeneration;

  try {
    const result = await fetchJson<{ attendees: AttendeeSearchResponse[] }>(
      `/api/annual-conference/${year.value}/check-in/search`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ search: email }),
      },
    );

    if (request !== requestGeneration || lookup !== emailLookupGeneration || search.value.trim() !== email) return;
    emailResults.value = result.attendees.map((attendee) => attendeeRecord({
      ...attendee,
      order_seat_number: attendee.order_seat_number ?? null,
    }));
    if (showNoMatch && result.attendees.length === 0) emailLookupError.value = 'No admission matched that email.';
  } catch {
    if (request !== requestGeneration || lookup !== emailLookupGeneration || search.value.trim() !== email) return;
    emailLookupError.value = 'Email lookup is unavailable. Check your connection and try again.';
  } finally {
    if (request === requestGeneration && lookup === emailLookupGeneration) emailLookupLoading.value = false;
  }
}

function submitSearch() {
  if (search.value.includes('@')) void findByExactEmail();
  else emailResults.value = null;
}

async function refreshAfterAdmission() {
  await loadRoster();
  await props.refreshRegistrations?.();
  if (emailResults.value !== null && search.value.includes('@')) await findByExactEmail(false);
}

async function admitSelected() {
  const attendee = selected.value;

  if (!attendee || !attendee.attendee_name || busy.value || rosterError.value) return;
  busy.value = true;
  error.value = '';
  const request = requestGeneration;

  try {
    const result = await fetchJson<{ outcome: ScanOutcome }>(`/api/annual-conference/${year.value}/check-in/admit`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket_id: attendee.ticket_id, confirmed: true }),
    });

    if (request !== requestGeneration) return;
    outcome.value = result.outcome;
    selected.value = null;
    await refreshAfterAdmission();
  } catch {
    if (request !== requestGeneration) return;
    error.value = 'Admission was not confirmed. Check your connection and retry; do not admit yet.';
  } finally {
    if (request === requestGeneration) busy.value = false;
  }
}

async function submitCode(value: string) {
  if (busy.value) return;
  const token = conferenceQrToken(value);

  stopCamera();
  outcome.value = null;
  error.value = '';
  pastedCode.value = '';

  if (!token) {
    outcome.value = 'invalid';

    return;
  }

  busy.value = true;
  const request = requestGeneration;

  try {
    const result = await fetchJson<{ outcome: ScanOutcome }>(`/api/annual-conference/${year.value}/ticketing/check-in`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ qr_token: token }),
    });

    if (request !== requestGeneration) return;
    outcome.value = result.outcome;
    if (result.outcome !== 'invalid') await refreshAfterAdmission();
  } catch {
    if (request !== requestGeneration) return;
    error.value = 'Admission was not confirmed. Check your connection and retry; do not admit yet.';
  } finally {
    if (request === requestGeneration) busy.value = false;
  }
}

async function openScanner() {
  scannerOpen.value = true;
  await nextTick();
  await startCamera();
}

function closeScanner() {
  scannerOpen.value = false;
  stopCamera();
}

async function startCamera() {
  stopCamera();
  outcome.value = null;
  error.value = '';
  const DetectorClass = (window as unknown as { BarcodeDetector?: DetectorConstructor }).BarcodeDetector;

  if (!navigator.mediaDevices?.getUserMedia) {
    error.value = 'Camera scanning is unavailable in this browser. Paste the admission code below.';

    return;
  }

  const currentGeneration = cameraGeneration;

  try {
    const acquired = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });

    if (cameraGeneration !== currentGeneration || !video.value) {
      acquired.getTracks().forEach((track) => track.stop());

      return;
    }

    stream = acquired;
    video.value.srcObject = stream;
    await video.value.play();
    if (cameraGeneration !== currentGeneration) return;
    scanning.value = true;
    const detector = DetectorClass ? new DetectorClass({ formats: ['qr_code'] }) : null;
    const decodeQr = detector ? null : (await import('jsqr')).default;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const detect = async () => {
      if (!scanning.value || !video.value || cameraGeneration !== currentGeneration) return;

      try {
        let code: string | undefined;

        if (detector) {
          code = (await detector.detect(video.value))[0]?.rawValue;
        } else if (context && decodeQr && video.value.videoWidth) {
          canvas.width = Math.min(800, video.value.videoWidth);
          canvas.height = Math.round(canvas.width * video.value.videoHeight / video.value.videoWidth);
          context.drawImage(video.value, 0, 0, canvas.width, canvas.height);
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height);

          code = decodeQr(pixels.data, pixels.width, pixels.height)?.data;
        }

        if (cameraGeneration !== currentGeneration) return;
        if (code) {
          await submitCode(code);

          return;
        }
      } catch {
        // Frames can be unavailable while the camera warms up; keep polling without logging QR data.
      }

      timer = setTimeout(detect, 200);
    };

    await detect();
  } catch {
    if (cameraGeneration !== currentGeneration) return;
    stopCamera();
    error.value = 'Camera access failed. Allow camera access or use the admission code below.';
  }
}

watch([search, selectedInitial, selectedStatus], () => {
  page.value = 1;
});
watch(search, () => {
  emailLookupGeneration += 1;
  emailLookupLoading.value = false;
  emailResults.value = null;
  emailLookupError.value = '';
});
watch(() => props.registrations, () => {
  if (canCheckIn.value && rosterLoaded.value) void loadRoster();
});
watch([year, canCheckIn], () => {
  requestGeneration += 1;
  rosterRequestGeneration += 1;
  emailLookupGeneration += 1;
  stopCamera();
  scannerOpen.value = false;
  outcome.value = null;
  pastedCode.value = '';
  attendees.value = [];
  emailResults.value = null;
  selected.value = null;
  search.value = '';
  selectedInitial.value = ALL_REGISTRATION_INITIALS;
  selectedStatus.value = 'all';
  rosterLoaded.value = false;
  busy.value = false;
  emailLookupLoading.value = false;
  rosterError.value = '';
  error.value = '';
  if (canCheckIn.value) void loadRoster();
}, { immediate: true });
onBeforeUnmount(() => {
  requestGeneration += 1;
  rosterRequestGeneration += 1;
  stopCamera();
});
</script>

<template>
    <section class="ops-panel registration-guest-panel overflow-hidden" aria-label="Conference attendee check-in">
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-dc-border px-4 py-4">
        <p class="text-sm font-semibold text-dc-gray" aria-live="polite">{{ checkedInCount }} / {{ attendees.length }} checked in</p>
        <div class="flex flex-wrap gap-2">
          <button type="button" class="editorial-action" :disabled="rosterLoading" @click="refreshAfterAdmission">{{ rosterLoading ? 'Refreshing…' : 'Refresh' }}</button>
          <button type="button" class="editorial-action" :disabled="busy || managementBusy" @click="scannerOpen ? closeScanner() : openScanner()">{{ scannerOpen ? 'Close scanner' : 'Scan with camera' }}</button>
        </div>
      </div>

      <section v-if="scannerOpen" class="check-in-scanner" aria-label="Optional QR scanner">
        <div class="check-in-scanner-heading">
          <div>
            <p class="editorial-eyebrow">Optional · QR admission</p>
            <h2>Scan a ticket</h2>
          </div>
          <button type="button" class="check-in-text-button" :disabled="busy" @click="closeScanner">Close</button>
        </div>
        <video ref="video" muted playsinline aria-label="Live camera preview" />
        <button v-if="scanning" type="button" class="check-in-scan-button" @click="stopCamera">Stop camera</button>
        <button v-else type="button" class="check-in-scan-button" :disabled="busy" @click="startCamera">{{ error ? 'Try camera again' : 'Open camera' }}</button>
        <details class="check-in-code-entry">
          <summary>Use an admission code instead</summary>
          <form @submit.prevent="submitCode(pastedCode)">
            <label for="admission-code">Paste the code or admission link</label>
            <input id="admission-code" v-model="pastedCode" class="editorial-input" autocomplete="off" spellcheck="false" maxlength="512" required>
            <button type="submit" class="check-in-manual-submit" :disabled="busy || !pastedCode.trim()">Check admission</button>
          </form>
        </details>
      </section>

      <p v-if="outcome || error || busy" class="check-in-feedback" :class="{ 'check-in-feedback--error': error }" role="status" aria-live="polite">
        {{ error || (outcome ? outcomeText[outcome] : 'Checking admission… Do not admit until confirmed.') }}
      </p>

      <section class="check-in-roster">
        <div class="registration-guest-controls border-b border-dc-border bg-dc-paper-warm px-4 py-4 flex flex-wrap items-end gap-4">
          <div class="check-in-search-wrap">
            <label for="attendee-search" class="editorial-label">Search guests</label>
            <input
              id="attendee-search"
              v-model="search"
              class="editorial-input"
              type="search"
              inputmode="search"
              autocomplete="off"
              placeholder="Name or email"
              @keydown.enter.prevent="submitSearch"
            >
          </div>
          <button v-if="search.includes('@')" type="button" class="check-in-email-search" :disabled="emailLookupLoading || search.trim().length < 3" @click="findByExactEmail()">
            {{ emailLookupLoading ? 'Looking up…' : 'Find exact email' }}
          </button>
          <div class="flex flex-wrap gap-2" aria-label="Guest status filters">
            <button v-for="option in statusOptions"
              :key="option.value" class="guest-status-filter" :class="{ 'guest-status-filter--active': selectedStatus === option.value }"
              :aria-pressed="selectedStatus === option.value" @click="selectedStatus = option.value">{{ option.label }}</button>
          </div>
          <p class="check-in-result-count">
            {{ filteredAttendees.length }} {{ filteredAttendees.length === 1 ? 'guest' : 'guests' }}
            <template v-if="emailResults === null">of {{ visibleAttendees.length }}</template>
            matching
          </p>
          <RegistrationAlphabetFilter class="w-full" v-if="visibleAttendees.length" v-model="selectedInitial" :initials="availableInitials" />
        </div>

        <div v-if="rosterError" class="check-in-error-state" role="alert">
          <p>{{ rosterError }}</p>
          <button type="button" class="check-in-manual-submit" :disabled="rosterLoading" @click="loadRoster">Try again</button>
        </div>
        <BoneyardPageSkeleton
          v-if="rosterLoading && !rosterLoaded && !canManageRegistration"
          name="annual-conference-check-in-roster"
          label="conference attendee list"
          layout="list"
          :show-header="false"
        />
        <p v-else-if="rosterError && !canManageRegistration" class="check-in-empty">Admissions are unavailable.</p>
        <p v-else-if="emailLookupError" class="check-in-empty" role="status">{{ emailLookupError }}</p>
        <p v-else-if="!filteredAttendees.length" class="check-in-empty" role="status">
          {{ visibleAttendees.length ? 'No guest matches these filters.' : 'No guests are on this list yet.' }}
        </p>
        <ul v-else class="check-in-attendee-list" aria-label="Attendees">
          <li v-for="guest in paginatedAttendees" :key="guest.key" class="check-in-attendee">
            <div class="check-in-attendee-copy">
              <div class="check-in-attendee-name-row">
                <p class="check-in-attendee-name">{{ guest.name }}</p>
                <span v-if="guest.registration" class="check-in-status">{{ guest.registration.status }}</span>
                <span v-if="guest.registration?.is_test" class="check-in-status">Testing</span>
                <span v-if="guest.admission?.status === 'checked_in'" class="check-in-status check-in-status--done">Checked in</span>
                <span v-else-if="guest.admission && !guest.admission.attendee_name" class="check-in-status">QR only</span>
              </div>
              <p v-if="guest.email" class="check-in-ticket-detail break-all">{{ guest.email }}</p>
              <p v-if="guest.admission" class="check-in-ticket-detail">
                <template v-if="guest.admission.order_seat_number">Seat {{ guest.admission.order_seat_number }} · </template>
                <template v-if="guest.admission.checked_in_at">{{ new Date(guest.admission.checked_in_at).toLocaleString() }}</template>
                <template v-else-if="!guest.admission.attendee_name">Scan the guest’s QR code to admit this ticket.</template>
                <template v-else>Issued admission</template>
              </p>
              <p v-else-if="guest.registration?.status === 'confirmed'" class="check-in-ticket-detail">Admission unavailable. Refresh before checking in.</p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <button
                v-if="guest.admission?.status === 'issued' && guest.admission.attendee_name"
                type="button"
                class="check-in-admit-button"
                :disabled="busy || managementBusy || rosterLoading || Boolean(rosterError)"
                @click="selectAttendee(guest.admission)"
              >Check in</button>
              <span v-else-if="guest.admission?.status === 'checked_in'" class="check-in-checked-label" aria-label="Already checked in">Done</span>
              <button v-if="canManageRegistration && guest.registration" type="button" class="check-in-text-button" @click="emailGuest = guest.registration">Email: {{ guest.registration.email_status === 'accepted' ? 'Accepted by provider' : (guest.registration.email_status ?? 'View activity').replaceAll('_', ' ') }}</button>
              <span v-if="guest.registration && recoveredSources.has(guest.registration.id)" class="check-in-status">Recovered as a new registration</span>
              <button v-else-if="canManageRegistration && allowRecovery && guest.registration?.status === 'cancelled'"
                type="button" class="check-in-text-button" :disabled="busy || managementBusy"
                @click="emit('recover', guest.registration)">Recover registration</button>
              <button v-if="canManageRegistration && guest.registration && guest.registration.status !== 'cancelled' && guest.admission?.status !== 'checked_in'"
                type="button" class="check-in-text-button" :disabled="busy || managementBusy || (guest.registration.status === 'confirmed' && (rosterLoading || Boolean(rosterError)))"
                @click="emit('cancel', guest.registration)">Cancel registration</button>
            </div>
          </li>
        </ul>

        <AppPagination
          v-if="filteredAttendees.length > DISPLAY_PAGE_SIZE"
          v-model:page="page"
          :page-count="pageCount"
          :total="filteredAttendees.length"
          :range-start="pageStart"
          :range-end="pageEnd"
          item-label="attendees"
          aria-label="Attendee list pagination"
        />
      </section>

      <p class="check-in-safety-note">Stay online while admitting guests. If an action fails or is still pending, do not admit; retry after checking the list status.</p>
    </section>

    <AnnualConferenceGuestEmails v-if="canManageRegistration" :year="year" :guest="emailGuest" @close="emailGuest = null" />
    <ConfirmDialog
      :open="Boolean(selected)"
      title="Confirm guest check-in"
      :message="selected ? `Confirm ${selected.name} is here before admitting them.` : ''"
      confirm-label="Admit guest"
      busy-label="Checking in…"
      cancel-label="Cancel"
      :busy="busy"
      mobile-sheet
      @cancel="selected = null"
      @confirm="admitSelected"
    />
</template>

<style scoped>
.registration-content {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 24px;
}

.registration-content > * {
  min-width: 0;
}

.registration-guest-controls {
  position: static;
  box-shadow: none;
}

.check-in-search-wrap {
  width: 100%;
  max-width: 20rem;
}

.check-in-result-count {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 10px;
  text-transform: uppercase;
  color: #6f6c65;
}

.check-in-attendee-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.check-in-attendee {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border-bottom: 1px solid #d6d2c8;
}

.check-in-attendee-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.check-in-attendee-name {
  font-weight: 700;
  overflow-wrap: anywhere;
}

.check-in-ticket-detail {
  margin-top: 4px;
  color: #6f6c65;
  font-size: 12px;
}

.check-in-status, .check-in-checked-label {
  border: 1px solid #d6d2c8;
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 10px;
  text-transform: uppercase;
}

.check-in-status--done, .check-in-checked-label {
  color: #047857;
  background: #ecfdf5;
}

.check-in-empty, .check-in-error-state {
  padding: 48px 20px;
  text-align: center;
  color: #6f6c65;
  font-size: 14px;
}

.check-in-feedback {
  padding: 16px 20px;
  background: #ecfdf5;
  font-size: 14px;
}

.check-in-feedback--error {
  background: #fff1f2;
  color: #9f1239;
}

.check-in-safety-note {
  padding: 16px 20px;
  border-top: 1px solid #d6d2c8;
  color: #6f6c65;
  font-size: 12px;
}

.check-in-scanner {
  padding: 20px;
  border-bottom: 1px solid #d6d2c8;
}

.check-in-scanner-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}

.check-in-scanner h2 {
  font-size: 20px;
  font-weight: 700;
}

.check-in-scanner video {
  display: block;
  width: 100%;
  max-width: 480px;
  max-height: 320px;
  margin: 16px 0;
  border-radius: 8px;
  background: #111;
}

.check-in-code-entry {
  margin-top: 16px;
}

.check-in-code-entry form {
  display: grid;
  gap: 12px;
  max-width: 480px;
  margin-top: 12px;
}

.check-in-scan-button, .check-in-manual-submit, .check-in-admit-button, .check-in-email-search, .check-in-text-button, .guest-status-filter {
  min-height: 44px;
  padding: 8px 12px;
  border: 1px solid #d6d2c8;
  border-radius: 6px;
  background: white;
  color: #111111;
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  transition: transform 120ms cubic-bezier(.4, 0, .2, 1);
}

.guest-status-filter--active {
  border-color: #e8117f;
  background: #e8117f;
  color: white;
}

button:disabled {
  opacity: .5;
  cursor: not-allowed;
}

button:active:not(:disabled) {
  transform: scale(.97);
}

@media (max-width: 600px) {
  .check-in-attendee {
    grid-template-columns: minmax(0, 1fr);
  }
  .check-in-attendee button {
    justify-self: start;
  }
}

@media (prefers-reduced-motion: reduce) {
  button {
    transition: none;
  }
  button:active:not(:disabled) {
    transform: none;
  }
}
</style>
