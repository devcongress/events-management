<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import AnnualConferenceNav from '@/src/components/AnnualConferenceNav.vue';
import { fetchJson } from '@/src/lib/api';
import { conferenceQrToken } from '@/src/lib/conference-qr';

type ScanOutcome = 'checked_in' | 'already_checked_in' | 'invalid';
type Detector = { detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> };
type DetectorConstructor = new (options: { formats: string[] }) => Detector;

const route = useRoute();
const year = computed(() => String(route.params.year));
const video = ref<HTMLVideoElement | null>(null);
const scanning = ref(false);
const busy = ref(false);
const pastedCode = ref('');
const outcome = ref<ScanOutcome | null>(null);
const error = ref('');
const search = ref('');
const attendees = ref<Array<{ ticket_id: string; attendee_name: string; status: string; checked_in_at: string | null }>>([]);
const selected = ref<{ ticket_id: string; attendee_name: string } | null>(null);
let stream: MediaStream | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let generation = 0;
let requestGeneration = 0;

const outcomeText: Record<ScanOutcome, string> = {
  checked_in: 'Admitted. Welcome to DevCon!',
  already_checked_in: 'Already checked in. Do not admit again.',
  invalid: 'This code is not valid for admission.',
};

function stopCamera() {
  generation += 1;
  scanning.value = false;
  clearTimeout(timer);
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;

  if (video.value) video.value.srcObject = null;
}

async function findAttendee() {
  if (busy.value) return;
  stopCamera();
  busy.value = true;
  error.value = '';
  outcome.value = null;
  attendees.value = [];
  selected.value = null;
  const request = requestGeneration;

  try {
    const result = await fetchJson<{ attendees: typeof attendees.value }>(`/api/annual-conference/${year.value}/check-in/search`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ search: search.value }),
    });

    if (request !== requestGeneration) return;
    attendees.value = result.attendees;
    if (!result.attendees.length) error.value = 'No confirmed admission found. Try the full email address.';
  } catch {
    if (request !== requestGeneration) return;
    error.value = 'Search unavailable. Check your connection and try again.';
  } finally {
    busy.value = false;
  }
}

async function admitSelected() {
  if (!selected.value || busy.value) return;
  busy.value = true;
  error.value = '';
  const request = requestGeneration;

  try {
    const result = await fetchJson<{ outcome: ScanOutcome }>(`/api/annual-conference/${year.value}/check-in/admit`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket_id: selected.value.ticket_id, confirmed: true }),
    });

    if (request !== requestGeneration) return;
    outcome.value = result.outcome;
    selected.value = null;
    attendees.value = [];
    search.value = '';
  } catch {
    if (request !== requestGeneration) return;
    error.value = 'Admission was not confirmed. Check your connection and retry; do not admit yet.';
  } finally {
    busy.value = false;
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
  } catch {
    if (request !== requestGeneration) return;
    error.value = 'Admission was not confirmed. Check your connection and retry; do not admit yet.';
  } finally {
    busy.value = false;
  }
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

  const currentGeneration = generation;

  try {
    const acquired = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });

    if (generation !== currentGeneration || !video.value) {
      acquired.getTracks().forEach((track) => track.stop());

      return;
    }

    stream = acquired;
    video.value.srcObject = stream;
    await video.value.play();
    if (generation !== currentGeneration) return;
    scanning.value = true;
    const detector = DetectorClass ? new DetectorClass({ formats: ['qr_code'] }) : null;
    const decodeQr = detector ? null : (await import('jsqr')).default;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const detect = async () => {
      if (!scanning.value || !video.value || generation !== currentGeneration) return;

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

        if (generation !== currentGeneration) return;
        if (code) {
          await submitCode(code);

          return;
        }
      } catch {
        // A frame may not be ready yet. Keep polling without logging QR data.
      }

      timer = setTimeout(detect, 200);
    };

    await detect();
  } catch {
    if (generation !== currentGeneration) return;
    stopCamera();
    error.value = 'Camera access failed. Allow camera access or use the admission code below.';
  }
}

watch(year, () => {
  requestGeneration += 1;
  stopCamera();
  outcome.value = null;
  pastedCode.value = '';
  attendees.value = [];
  selected.value = null;
  search.value = '';
  error.value = '';
});
onBeforeUnmount(() => {
  requestGeneration += 1;
  stopCamera();
});
</script>

<template>
  <main class="conference-check-in">
    <AnnualConferenceNav title="Attendee check-in" description="Scan one admission QR at a time. Every volunteer sees the same live admission status." />
    <section class="scanner-panel" aria-label="Conference admission scanner">
      <p class="scanner-edition">DevCon {{ year }} · Entrance</p>
      <h2>Ready for the next guest.</h2>
      <video ref="video" v-show="scanning" muted playsinline aria-label="Live camera preview" />
      <div aria-live="polite" aria-atomic="true" class="scanner-result">
        <p v-if="busy">Checking admission… Please wait.</p>
        <p v-else-if="error" role="alert">{{ error }}</p>
        <p v-else-if="outcome" :class="{ admitted: outcome === 'checked_in' }">{{ outcomeText[outcome] }}</p>
        <p v-else>Ask the guest to open the QR code in their confirmation email.</p>
      </div>
      <button v-if="!scanning" type="button" :disabled="busy" class="scanner-primary" @click="startCamera">{{ outcome ? 'Scan next attendee' : 'Open camera' }}</button>
      <button v-else type="button" @click="stopCamera">Stop camera</button>
      <details>
        <summary>Use an admission code instead</summary>
        <form @submit.prevent="submitCode(pastedCode)">
          <label for="admission-code">Paste the code or admission link</label>
          <input class="app-form-control" id="admission-code" v-model="pastedCode" autocomplete="off" spellcheck="false" maxlength="512" required />
          <button type="submit" :disabled="busy || !pastedCode.trim()">Check admission</button>
        </form>
      </details>
      <details>
        <summary>Find an attendee by name or email</summary>
        <form @submit.prevent="findAttendee">
          <label for="attendee-search">Name or full email</label>
          <input class="app-form-control" id="attendee-search" v-model="search" minlength="3" maxlength="254" autocomplete="off" required />
          <button :disabled="busy" type="submit">Find attendee</button>
        </form>
        <ul>
          <li v-for="attendee in attendees" :key="attendee.ticket_id">
            <p>{{ attendee.attendee_name }}</p>
            <p v-if="attendee.checked_in_at">Already checked in: {{ new Date(attendee.checked_in_at).toLocaleString() }}</p>
            <button v-else type="button" :disabled="busy" @click="selected = attendee">Select attendee</button>
          </li>
        </ul>
        <section v-if="selected" aria-label="Confirm manual admission">
          <p>Confirm this guest is {{ selected.attendee_name }} before admitting.</p>
          <button type="button" :disabled="busy" @click="admitSelected">Confirm admission</button>
          <button type="button" :disabled="busy" @click="selected = null">Cancel</button>
        </section>
      </details>
      <p class="scanner-note">A social-sharing card is not an admission ticket. Stay online while checking guests in.</p>
    </section>
  </main>
</template>

<style scoped>
.conference-check-in {
  padding: 24px;
}
.scanner-panel {
  max-width: 560px;
  margin: 24px auto;
  padding: 24px;
  border: 1px solid var(--dc-border, #444);
  border-radius: 12px;
}
.scanner-edition, .scanner-note {
  color: var(--dc-gray, #777);
  font-size: 14px;
}
h2 {
  margin: 12px 0 24px;
  font-size: 28px;
  font-weight: 700;
}
video {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 8px;
  object-fit: cover;
  background: #1c1c1c;
}
.scanner-result {
  min-height: 80px;
  padding: 16px 0;
  font-size: 18px;
  font-weight: 600;
}
.admitted {
  color: #14833b;
}
button {
  min-height: 48px;
  padding: 12px 20px;
  border: 1px solid currentColor;
  border-radius: 8px;
  font-weight: 600;
  transition: transform 120ms cubic-bezier(0.4, 0, 0.2, 1);
}
button:active {
  transform: scale(0.97);
}
button:disabled {
  opacity: 0.5;
}
.scanner-primary {
  width: 100%;
  background: #f5ed39;
  color: #111;
}
details {
  margin-top: 24px;
}
summary {
  cursor: pointer;
  padding: 12px 0;
}
form {
  display: grid;
  gap: 12px;
  margin-top: 12px;
}
input {
  min-width: 0;
  padding: 12px;
  border: 1px solid #888;
  border-radius: 8px;
  background: transparent;
}
.scanner-note {
  margin-top: 24px;
  line-height: 1.6;
}
@media (max-width: 600px) {
  .conference-check-in {
    padding: 12px;
  }
  .scanner-panel {
    padding: 20px;
  }
}
@media (prefers-reduced-motion: reduce) {
  button {
    transition: none;
  }
  button:active {
    transform: none;
  }
}
</style>
