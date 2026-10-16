<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { useRoute } from 'vue-router';
import AnnualConferenceNav from '@/src/components/AnnualConferenceNav.vue';
import AnnualConferenceRegistrationNav from '@/src/components/AnnualConferenceRegistrationNav.vue';
import AppPagination from '@/src/components/AppPagination.vue';
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

type ScanOutcome = 'checked_in' | 'already_checked_in' | 'invalid';
type Detector = { detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> };
type DetectorConstructor = new (options: { formats: string[] }) => Detector;
type AttendeeRecord = {
  ticket_id: string;
  attendee_name: string | null;
  name: string;
  status: 'issued' | 'checked_in';
  checked_in_at: string | null;
  order_seat_number: number | null;
};
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
const DISPLAY_PAGE_SIZE = 50;
const route = useRoute();
const year = computed(() => String(route.params.year));
const workPlan = useQuery({
  queryKey: computed(() => queryKeys.annualConferenceWorkPlan(year.value)),
  queryFn: () => fetchAnnualConferenceWorkPlan(year.value),
});
const capabilities = computed(() => workPlan.data.value?.permissions.capabilities ?? []);
const canManageRegistration = computed(() => hasAnyAnnualConferenceCapability(capabilities.value, ['ticketing.manage']));
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
const page = ref(1);
const attendees = ref<AttendeeRecord[]>([]);
const emailResults = ref<AttendeeRecord[] | null>(null);
const selected = ref<AttendeeRecord | null>(null);
const rosterLoaded = ref(false);
const visibleAttendees = computed(() => emailResults.value ?? attendees.value);
const availableInitials = computed(() => registrationInitials(visibleAttendees.value));
const filteredAttendees = computed(() => filterRegistrationsForCheckIn(
  visibleAttendees.value,
  { query: search.value.includes('@') && emailResults.value ? '' : search.value, initial: selectedInitial.value },
));
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
  if (search.value.includes('@')) await findByExactEmail(false);
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

watch([search, selectedInitial], () => {
  page.value = 1;
});
watch(search, () => {
  emailLookupGeneration += 1;
  emailLookupLoading.value = false;
  emailResults.value = null;
  emailLookupError.value = '';
});
watch(year, () => {
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
  rosterLoaded.value = false;
  busy.value = false;
  emailLookupLoading.value = false;
  rosterError.value = '';
  error.value = '';
  void loadRoster();
}, { immediate: true });
onBeforeUnmount(() => {
  requestGeneration += 1;
  rosterRequestGeneration += 1;
  stopCamera();
});
</script>

<template>
  <main class="conference-check-in">
    <AnnualConferenceNav
      title="Attendee check-in"
      description="Find each guest in the complete attendee list. Scanning is available when a ticket is easier to find by QR."
    />
    <AnnualConferenceRegistrationNav active="check-in" :can-manage-registration="canManageRegistration" :can-check-in="canCheckIn" />

    <section class="check-in-workspace" aria-label="Conference attendee check-in">
      <header class="check-in-heading">
        <div>
          <p class="editorial-eyebrow">DevCon {{ year }} · entrance</p>
          <h1>Welcome them in.</h1>
          <p class="check-in-intro">Search names or browse alphabetically, then confirm the guest before admitting them.</p>
        </div>
        <button type="button" class="check-in-scan-button" :disabled="busy" @click="scannerOpen ? closeScanner() : openScanner()">
          {{ scannerOpen ? 'Close scanner' : 'Scan a ticket instead' }}
        </button>
      </header>

      <div class="check-in-progress" aria-live="polite">
        <span class="check-in-progress-count">{{ checkedInCount }} <span>/ {{ attendees.length }}</span></span>
        <span class="check-in-progress-label">checked in</span>
        <button type="button" class="check-in-refresh" :disabled="rosterLoading" @click="loadRoster">
          {{ rosterLoading ? 'Refreshing…' : 'Refresh list' }}
        </button>
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
        <div class="check-in-roster-controls">
          <div class="check-in-search-wrap">
            <label for="attendee-search" class="editorial-label">Search the attendee list</label>
            <input
              id="attendee-search"
              v-model="search"
              class="editorial-input"
              type="search"
              inputmode="search"
              autocomplete="off"
              placeholder="Start typing a name"
              @keydown.enter.prevent="submitSearch"
            >
          </div>
          <button v-if="search.includes('@')" type="button" class="check-in-email-search" :disabled="emailLookupLoading || search.trim().length < 3" @click="findByExactEmail()">
            {{ emailLookupLoading ? 'Looking up…' : 'Find exact email' }}
          </button>
          <p class="check-in-result-count">
            {{ filteredAttendees.length }} {{ filteredAttendees.length === 1 ? 'guest' : 'guests' }}
            <template v-if="emailResults === null">of {{ attendees.length }}</template>
            matching
          </p>
          <RegistrationAlphabetFilter v-if="visibleAttendees.length" v-model="selectedInitial" :initials="availableInitials" />
        </div>

        <p v-if="rosterLoading && !rosterLoaded" class="check-in-empty" role="status">Loading the complete attendee list…</p>
        <div v-else-if="rosterError" class="check-in-error-state" role="alert">
          <p>{{ rosterError }}</p>
          <button type="button" class="check-in-manual-submit" :disabled="rosterLoading" @click="loadRoster">Try again</button>
        </div>
        <p v-else-if="emailLookupError" class="check-in-empty" role="status">{{ emailLookupError }}</p>
        <p v-else-if="!filteredAttendees.length" class="check-in-empty" role="status">
          {{ attendees.length ? 'No guest matches that search and first letter.' : 'No issued admissions are on this list yet.' }}
        </p>
        <ul v-else class="check-in-attendee-list" aria-label="Attendees">
          <li v-for="attendee in paginatedAttendees" :key="attendee.ticket_id" class="check-in-attendee">
            <div class="check-in-attendee-copy">
              <div class="check-in-attendee-name-row">
                <p class="check-in-attendee-name">{{ attendee.name }}</p>
                <span v-if="attendee.status === 'checked_in'" class="check-in-status check-in-status--done">Checked in</span>
                <span v-else-if="!attendee.attendee_name" class="check-in-status">QR only</span>
              </div>
              <p class="check-in-ticket-detail">
                <template v-if="attendee.order_seat_number">Seat {{ attendee.order_seat_number }} · </template>
                <template v-if="attendee.checked_in_at">{{ new Date(attendee.checked_in_at).toLocaleString() }}</template>
                <template v-else-if="!attendee.attendee_name">Scan the guest’s QR code to admit this ticket.</template>
                <template v-else>Issued admission</template>
              </p>
            </div>
            <button
              v-if="attendee.status === 'issued' && attendee.attendee_name"
              type="button"
              class="check-in-admit-button"
              :disabled="busy || Boolean(rosterError)"
              @click="selectAttendee(attendee)"
            >
              Check in
            </button>
            <span v-else-if="attendee.status === 'checked_in'" class="check-in-checked-label" aria-label="Already checked in">Done</span>
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
  </main>
</template>

<style scoped>
.conference-check-in {
  padding: 24px;
}

.check-in-workspace {
  max-width: 1040px;
  margin: 24px auto 48px;
  overflow: hidden;
  border: 2px solid var(--dc-ink, #111111);
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 6px 6px 0 var(--dc-ink, #111111);
}

.check-in-heading,
.check-in-progress,
.check-in-roster-controls,
.check-in-scanner-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

.check-in-heading {
  align-items: flex-end;
  padding: 28px 32px;
  background: var(--dc-paper-warm, #fbf7ed);
}

.check-in-heading h1,
.check-in-scanner h2 {
  margin: 5px 0 0;
  color: var(--dc-ink, #111111);
  font-size: clamp(1.8rem, 4vw, 2.6rem);
  font-weight: var(--font-weight-heading, 700);
  letter-spacing: -0.035em;
  line-height: 1.1;
}

.check-in-intro {
  max-width: 42rem;
  margin: 10px 0 0;
  color: var(--dc-gray, #555555);
  font-size: 0.9rem;
  line-height: 1.55;
}

.check-in-scan-button,
.check-in-manual-submit,
.check-in-admit-button,
.check-in-email-search {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--dc-ink, #111111);
  border-radius: 6px;
  padding: 0 16px;
  color: var(--dc-ink, #111111);
  font-family: var(--font-mono), monospace;
  font-size: 0.7rem;
  font-weight: var(--font-weight-label, 700);
  text-transform: uppercase;
  transition: transform 120ms cubic-bezier(0.4, 0, 0.2, 1), opacity 120ms cubic-bezier(0.4, 0, 0.2, 1);
}

.check-in-scan-button,
.check-in-email-search {
  background: #ffffff;
}

.check-in-manual-submit,
.check-in-admit-button {
  background: var(--dc-pink, #e5007d);
  color: #ffffff;
}

.check-in-scan-button:active,
.check-in-manual-submit:active,
.check-in-admit-button:active,
.check-in-email-search:active {
  transform: scale(0.97);
}

.check-in-scan-button:disabled,
.check-in-manual-submit:disabled,
.check-in-admit-button:disabled,
.check-in-email-search:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.check-in-progress {
  justify-content: flex-start;
  border-top: 1px solid var(--dc-border, #d1cec5);
  border-bottom: 1px solid var(--dc-border, #d1cec5);
  padding: 14px 32px;
}

.check-in-progress-count {
  color: var(--dc-ink, #111111);
  font-size: 1.15rem;
  font-weight: var(--font-weight-heading, 700);
  font-variant-numeric: tabular-nums;
}

.check-in-progress-count span,
.check-in-progress-label,
.check-in-refresh,
.check-in-ticket-detail,
.check-in-safety-note {
  color: var(--dc-gray, #555555);
}

.check-in-progress-label,
.check-in-refresh {
  font-size: 0.78rem;
}

.check-in-refresh,
.check-in-text-button {
  min-height: 40px;
  border-radius: 6px;
  padding: 8px 10px;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.check-in-refresh {
  margin-left: auto;
}

.check-in-refresh:disabled,
.check-in-text-button:disabled {
  cursor: wait;
  opacity: 0.55;
}

.check-in-scanner {
  display: grid;
  gap: 16px;
  padding: 24px 32px;
  border-bottom: 1px solid var(--dc-border, #d1cec5);
  background: var(--dc-paper-warm, #fbf7ed);
}

.check-in-scanner h2 {
  font-size: 1.4rem;
}

.check-in-scanner video {
  width: min(100%, 480px);
  max-height: 440px;
  aspect-ratio: 4 / 3;
  border-radius: 8px;
  background: #111111;
  object-fit: cover;
}

.check-in-code-entry {
  max-width: 480px;
  border-top: 1px solid var(--dc-border, #d1cec5);
  padding-top: 12px;
}

.check-in-code-entry summary {
  cursor: pointer;
  font-weight: 600;
}

.check-in-code-entry form {
  display: grid;
  gap: 10px;
  margin-top: 12px;
}

.check-in-feedback,
.check-in-error-state {
  margin: 20px 32px 0;
  border: 1px solid #b5dfc2;
  border-radius: 6px;
  background: #f1fbf4;
  padding: 12px 14px;
  color: #176339;
  font-size: 0.9rem;
  line-height: 1.5;
}

.check-in-feedback--error,
.check-in-error-state {
  border-color: #fecaca;
  background: #fff7f7;
  color: #991b1b;
}

.check-in-error-state {
  display: grid;
  justify-items: start;
  gap: 12px;
}

.check-in-roster {
  padding: 0;
}

.check-in-roster-controls {
  align-items: flex-end;
  flex-wrap: wrap;
  border-bottom: 1px solid var(--dc-border, #d1cec5);
  background: var(--dc-paper-warm, #fbf7ed);
  padding: 20px 32px;
}

.check-in-search-wrap {
  width: min(100%, 360px);
}

.check-in-result-count {
  margin: 0 0 10px auto;
  color: var(--dc-gray, #555555);
  font-family: var(--font-mono), monospace;
  font-size: 0.65rem;
  font-weight: var(--font-weight-label, 600);
  text-transform: uppercase;
}

.check-in-roster-controls :deep(.registration-alphabet) {
  width: 100%;
}

.check-in-empty {
  margin: 0;
  padding: 44px 20px;
  color: var(--dc-gray, #555555);
  text-align: center;
}

.check-in-attendee-list {
  max-height: min(58vh, 760px);
  overflow-y: auto;
  margin: 0;
  padding: 0;
  list-style: none;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  -webkit-overflow-scrolling: touch;
}

.check-in-attendee {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 16px;
  border-bottom: 1px solid var(--dc-border, #d1cec5);
  padding: 14px 32px;
}

.check-in-attendee:last-child {
  border-bottom: 0;
}

.check-in-attendee-name-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.check-in-attendee-name {
  margin: 0;
  color: var(--dc-ink, #111111);
  font-size: 0.95rem;
  font-weight: var(--font-weight-heading, 700);
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.check-in-ticket-detail {
  margin: 4px 0 0;
  font-size: 0.78rem;
  line-height: 1.4;
}

.check-in-status,
.check-in-checked-label {
  display: inline-flex;
  min-height: 24px;
  align-items: center;
  border: 1px solid var(--dc-border, #d1cec5);
  border-radius: 4px;
  background: #ffffff;
  padding: 2px 7px;
  color: var(--dc-gray, #555555);
  font-family: var(--font-mono), monospace;
  font-size: 0.58rem;
  font-weight: var(--font-weight-label, 600);
  text-transform: uppercase;
}

.check-in-status--done,
.check-in-checked-label {
  border-color: #8bc9a0;
  background: #f1fbf4;
  color: #176339;
}

.check-in-safety-note {
  margin: 0;
  border-top: 1px solid var(--dc-border, #d1cec5);
  padding: 16px 32px 20px;
  font-size: 0.78rem;
  line-height: 1.5;
}

@media (max-width: 700px) {
  .conference-check-in {
    padding: 12px;
  }

  .check-in-workspace {
    margin: 16px auto 32px;
    box-shadow: 3px 3px 0 var(--dc-ink, #111111);
  }

  .check-in-heading,
  .check-in-progress,
  .check-in-roster-controls,
  .check-in-attendee,
  .check-in-scanner {
    padding-right: 16px;
    padding-left: 16px;
  }

  .check-in-heading {
    align-items: flex-start;
    flex-direction: column;
    gap: 16px;
  }

  .check-in-scan-button {
    width: 100%;
  }

  .check-in-progress {
    gap: 9px;
  }

  .check-in-progress-label {
    flex: 1;
  }

  .check-in-result-count {
    width: 100%;
    margin: 0;
  }

  .check-in-attendee {
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
  }

  .check-in-admit-button {
    width: 100%;
  }

  .check-in-checked-label {
    justify-self: start;
  }

  .check-in-feedback,
  .check-in-error-state {
    margin-right: 16px;
    margin-left: 16px;
  }

  .check-in-safety-note {
    padding-right: 16px;
    padding-left: 16px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .check-in-scan-button,
  .check-in-manual-submit,
  .check-in-admit-button,
  .check-in-email-search {
    transition: none;
  }

  .check-in-scan-button:active,
  .check-in-manual-submit:active,
  .check-in-admit-button:active,
  .check-in-email-search:active {
    transform: none;
  }
}
</style>
