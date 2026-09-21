<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import AppDropdown from '@/src/components/AppDropdown.vue';
import AppDatePicker from '@/src/components/ui/AppDatePicker.vue';
import UploadProgressBar from '@/src/components/UploadProgressBar.vue';
import { EVENT_ANNOUNCEMENT_FALLBACK_COVER } from '@/lib/event-cover';
import { dateTimeInputInTimeZoneToIso, isoToDateTimeInputInTimeZone } from '@/src/lib/event-submission-amendment';

type Amendment = EventEditSource & { status: string; cover_url: string | null };
type EventEditSource = {
  starts_at: string;
  ends_at: string;
  timezone?: string;
  location_type: 'in_person' | 'online' | 'hybrid';
  venue_name: string | null;
  venue_address: string | null;
  online_url: string | null;
  registration_url: string | null;
  cover_url: string | null;
};
type Submission = EventEditSource & { title: string };

const route = useRoute();
const loading = ref(true);
const saving = ref(false);
const submitting = ref(false);
const coverUploadProgress = ref<number | null>(null);
const error = ref('');
const saved = ref(false);
const unavailable = ref('');
const reviewing = ref(false);
const submission = ref<Submission | null>(null);
const currentEvent = ref<EventEditSource | null>(null);
const amendment = ref<Amendment | null>(null);
const loadedSchedule = ref({ starts_at: '', ends_at: '' });
const coverFile = ref<File | null>(null);
const coverPreviewUrl = ref('');
let coverObjectUrl: string | null = null;
let hydratingSchedule = false;
const form = reactive({
  starts_at: '',
  ends_at: '',
  timezone: 'UTC',
  location_type: 'in_person' as Submission['location_type'],
  venue_name: '',
  venue_address: '',
  online_url: '',
  registration_url: '',
  organizer_note: '',
});
const capability = String(route.params.capability ?? new URLSearchParams(window.location.hash.slice(1)).get('capability') ?? '').trim();
const locationOptions = [
  { value: 'in_person', label: 'In person' },
  { value: 'online', label: 'Online' },
  { value: 'hybrid', label: 'Hybrid' },
];
const isInReview = computed(() => amendment.value?.status === 'submitted');
const currentCover = computed(() => coverPreviewUrl.value || amendment.value?.cover_url || submission.value?.cover_url || EVENT_ANNOUNCEMENT_FALLBACK_COVER);
const eventTimeZone = computed(() => form.timezone || currentEvent.value?.timezone || submission.value?.timezone || 'UTC');
const eventTimezoneOptions = computed(() => {
  const zones = new Set(['Africa/Accra', 'Europe/Berlin', 'Europe/London', 'America/New_York', 'America/Los_Angeles', eventTimeZone.value]);

  return Array.from(zones).filter(Boolean).map((value) => ({ value, label: value }));
});
const reviewSchedule = computed(() => {
  try {
    const changes = payload();
    const format = (value: string, timeZone: string) => new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone,
      timeZoneName: 'short',
    }).format(new Date(value));

    return {
      event: `${format(changes.starts_at, changes.timezone)} – ${format(changes.ends_at, changes.timezone)}`,
      ghana: `${format(changes.starts_at, 'Africa/Accra')} – ${format(changes.ends_at, 'Africa/Accra')}`,
    };
  } catch {
    return null;
  }
});

function payload() {
  return {
    ...form,
    starts_at: dateTimeInputInTimeZoneToIso(form.starts_at, eventTimeZone.value, loadedSchedule.value.starts_at),
    ends_at: dateTimeInputInTimeZoneToIso(form.ends_at, eventTimeZone.value, loadedSchedule.value.ends_at),
  };
}
function changeTimeZone(previousTimeZone: string, nextTimeZone: string) {
  if (!form.starts_at || !form.ends_at || previousTimeZone === nextTimeZone) return;

  try {
    const startsAt = dateTimeInputInTimeZoneToIso(form.starts_at, previousTimeZone, loadedSchedule.value.starts_at);
    const endsAt = dateTimeInputInTimeZoneToIso(form.ends_at, previousTimeZone, loadedSchedule.value.ends_at);

    loadedSchedule.value = { starts_at: startsAt, ends_at: endsAt };
    form.starts_at = isoToDateTimeInputInTimeZone(startsAt, nextTimeZone);
    form.ends_at = isoToDateTimeInputInTimeZone(endsAt, nextTimeZone);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Choose a valid event time zone.';
  }
}
function revokeCoverPreview() {
  if (coverObjectUrl) URL.revokeObjectURL(coverObjectUrl);
  coverObjectUrl = null;
}
function chooseCover(event: Event) {
  if (saving.value || submitting.value) return;
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0] ?? null;

  if (!file) return;
  if (!['image/avif', 'image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
    error.value = 'Use an AVIF, JPEG, PNG, or WebP cover that is 5MB or smaller.';
    input.value = '';

    return;
  }
  revokeCoverPreview();
  coverFile.value = file;
  coverObjectUrl = URL.createObjectURL(file);
  coverPreviewUrl.value = coverObjectUrl;
  error.value = '';
}
function payloadFormData() {
  const data = new FormData();

  Object.entries(payload()).forEach(([key, value]) => data.set(key, String(value ?? '')));
  if (coverFile.value) data.set('cover', coverFile.value);

  return data;
}
function managementHeaders(headers: Record<string, string> = {}) {
  return { ...headers, Authorization: `Bearer ${capability}` };
}
function saveCoverWithProgress() {
  return new Promise<unknown>((resolve, reject) => {
    const request = new XMLHttpRequest();

    request.open('PUT', '/api/public/event-submissions/management/with-cover');
    request.setRequestHeader('Authorization', `Bearer ${capability}`);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) coverUploadProgress.value = Math.round((event.loaded / event.total) * 100);
    };
    request.upload.onload = () => { coverUploadProgress.value = 100; };
    request.onerror = () => reject(new Error('Network error while uploading cover.'));
    request.onload = () => {
      const data = request.responseText ? JSON.parse(request.responseText) : {};

      if (request.status >= 200 && request.status < 300) resolve(data);
      else reject(new Error(data.error || 'Changes could not be saved.'));
    };
    request.send(payloadFormData());
  });
}
async function load() {
  loading.value = true;
  try {
    if (!capability) {
      unavailable.value = 'This event link is no longer available.';

      return;
    }
    const response = await fetch('/api/public/event-submissions/management', { headers: managementHeaders() });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) { unavailable.value = data.error || 'This event link is no longer available.';

 return; }
    submission.value = data.management.submission;
    currentEvent.value = data.management.current_event ?? null;
    const source = data.management.amendment ?? data.management.current_event ?? data.management.submission;

    amendment.value = data.management.amendment;
    loadedSchedule.value = { starts_at: source.starts_at, ends_at: source.ends_at };
    const timezone = source.timezone ?? currentEvent.value?.timezone ?? submission.value?.timezone ?? 'UTC';

    hydratingSchedule = true;
    Object.assign(form, {
      timezone,
      starts_at: isoToDateTimeInputInTimeZone(source.starts_at, timezone), ends_at: isoToDateTimeInputInTimeZone(source.ends_at, timezone), location_type: source.location_type,
      venue_name: source.venue_name || '', venue_address: source.venue_address || '', online_url: source.online_url || '',
      registration_url: source.registration_url || '', organizer_note: source.organizer_note || '',
    });
    await nextTick();
    hydratingSchedule = false;
  } catch {
    unavailable.value = 'This event link could not be opened. Please try again later.';
  } finally {
    loading.value = false;
  }
}
async function save() {
  if (saving.value || submitting.value) return;
  saving.value = true; error.value = ''; saved.value = false;
  try {
    const withCover = Boolean(coverFile.value);

    coverUploadProgress.value = withCover ? 0 : null;
    const data = withCover
      ? await saveCoverWithProgress() as { amendment: Amendment }
      : await fetch('/api/public/event-submissions/management', {
        method: 'PUT', headers: managementHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify(payload()),
      }).then(async (response) => {
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) throw new Error(payload.error || 'Changes could not be saved.');

        return payload as { amendment: Amendment };
      });

    amendment.value = data.amendment;
    coverFile.value = null;
    revokeCoverPreview();
    coverPreviewUrl.value = '';
    saved.value = true;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Changes could not be saved.';
  } finally {
    saving.value = false;
    coverUploadProgress.value = null;
  }
}
async function submit() {
  if (saving.value || submitting.value) return;
  await save();
  if (!saved.value) return;
  submitting.value = true; error.value = '';
  try {
    const response = await fetch('/api/public/event-submissions/management/submit', {
      method: 'POST',
      headers: managementHeaders(),
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) throw new Error(data.error || 'Changes could not be submitted.');
    amendment.value = data.amendment;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Changes could not be submitted.';
  } finally {
    submitting.value = false;
  }
}

function beginReview() {
  try {
    payload();
    reviewing.value = true;
    error.value = '';
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Check the event time.';
  }
}

watch(() => form.timezone, (nextTimeZone, previousTimeZone) => {
  if (previousTimeZone && !hydratingSchedule) changeTimeZone(previousTimeZone, nextTimeZone);
  reviewing.value = false;
});
watch(() => [form.starts_at, form.ends_at], () => {
  reviewing.value = false;
});

onMounted(() => {
  if (route.params.capability && capability) {
    window.history.replaceState(
      window.history.state,
      '',
      `/event-amendments#${new URLSearchParams({ capability }).toString()}`,
    );
  }
  void load();
});
onBeforeUnmount(revokeCoverPreview);
</script>

<template>
  <main class="min-h-full bg-dc-cream px-4 py-8 text-dc-ink sm:px-6 sm:py-12">
    <section v-if="loading" class="mx-auto max-w-4xl animate-pulse rounded-lg border border-dc-line bg-dc-paper p-8"><div class="h-8 w-2/3 bg-dc-cream" /><div class="mt-5 h-5 w-full bg-dc-cream" /></section>
    <section v-else-if="unavailable" class="mx-auto max-w-lg rounded-lg border-2 border-dc-ink bg-dc-paper p-8 shadow-[3px_3px_0_#111111]"><p class="font-mono text-xs font-bold tracking-[0.16em] text-dc-pink">EVENT LINK CLOSED</p><h1 class="mt-3 text-3xl font-bold">This event link is unavailable.</h1><p class="mt-3 text-dc-gray">{{ unavailable }}</p></section>
    <section v-else class="mx-auto max-w-4xl">
      <p class="font-mono text-xs font-bold tracking-[0.16em] text-dc-pink">COMMUNITY CALENDAR</p>
      <h1 class="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">Update event details</h1>
      <p class="mt-3 max-w-2xl text-dc-gray">{{ submission?.title }} · Your changes are checked before the public listing updates.</p>

      <div v-if="isInReview" class="mt-8 rounded-lg border-2 border-dc-ink bg-dc-yellow/20 p-6 shadow-[3px_3px_0_#111111]"><p class="font-mono text-xs font-bold tracking-[0.14em] text-dc-pink">REQUEST SENT</p><h2 class="mt-2 text-xl font-bold">Your changes are being reviewed.</h2><p class="mt-2 text-sm text-dc-gray">We will email you when the listing has been updated.</p></div>

      <form v-else class="mt-8 overflow-hidden rounded-lg border-2 border-dc-ink bg-dc-paper shadow-[3px_3px_0_#111111]" @submit.prevent="submit">
        <div class="border-b border-dc-line bg-dc-paper-warm px-5 py-5 sm:px-8"><p class="font-mono text-xs font-bold tracking-[0.16em] text-dc-pink">EVENT DETAILS</p><p class="mt-1 text-sm text-dc-gray">Keep the listing accurate for people planning to attend.</p></div>
        <div class="space-y-7 p-5 sm:p-8">
          <section class="grid gap-5 sm:grid-cols-2">
            <AppDatePicker v-model="form.starts_at" label="Starts" mode="datetime" density="field" required />
            <AppDatePicker v-model="form.ends_at" label="Ends" mode="datetime" density="field" required />
          </section>
          <AppDropdown v-model="form.timezone" :options="eventTimezoneOptions" label="Event time zone" />
          <p class="-mt-3 text-sm text-dc-gray">Changing the zone keeps the same instant. Edit the clock times after changing it if the event itself is moving.</p>
          <AppDropdown v-model="form.location_type" :options="locationOptions" label="Event location" />
          <section v-if="form.location_type !== 'online'" class="grid gap-5 sm:grid-cols-2"><label class="grid gap-2 text-sm font-semibold">Venue name<input v-model="form.venue_name" class="app-form-control min-h-[50px] rounded border border-dc-line bg-white px-4 text-base outline-none focus:border-dc-pink focus:ring-2 focus:ring-dc-pink/15" required></label><label class="grid gap-2 text-sm font-semibold">Venue address <span class="font-normal text-dc-gray">Optional</span><input v-model="form.venue_address" class="app-form-control min-h-[50px] rounded border border-dc-line bg-white px-4 text-base outline-none focus:border-dc-pink focus:ring-2 focus:ring-dc-pink/15"></label></section>
          <label v-if="form.location_type !== 'in_person'" class="grid gap-2 text-sm font-semibold">Online event link<input v-model="form.online_url" class="app-form-control min-h-[50px] rounded border border-dc-line bg-white px-4 text-base outline-none focus:border-dc-pink focus:ring-2 focus:ring-dc-pink/15" type="url" required></label>
          <label class="grid gap-2 text-sm font-semibold">Registration link <span class="font-normal text-dc-gray">Optional when an online link is present</span><input v-model="form.registration_url" class="app-form-control min-h-[50px] rounded border border-dc-line bg-white px-4 text-base outline-none focus:border-dc-pink focus:ring-2 focus:ring-dc-pink/15" type="url"></label>
          <section><div class="flex items-baseline justify-between gap-3"><label class="text-sm font-semibold" for="cover">Cover image <span class="font-normal text-dc-gray">Optional</span></label><span class="font-mono text-[11px] font-bold uppercase tracking-wide text-dc-gray">AVIF · JPG · PNG · WEBP · 5MB</span></div><div class="mt-2 overflow-hidden rounded border border-dc-line bg-dc-paper-warm"><img :src="currentCover" alt="Current event cover" class="h-44 w-full object-cover sm:h-56"><UploadProgressBar v-if="saving && coverFile" :percent="coverUploadProgress" :label="coverUploadProgress === null ? 'Preparing cover' : 'Uploading cover'" /><label for="cover" class="motion-press flex cursor-pointer items-center justify-between gap-3 border-t border-dc-line bg-white px-4 py-3 text-sm font-semibold" :class="{ 'cursor-not-allowed opacity-60': saving || submitting }"><span>{{ coverFile ? coverFile.name : 'Choose a replacement cover' }}</span><span class="font-mono text-xs font-bold tracking-[0.08em] text-dc-pink">BROWSE →</span></label><input id="cover" class="sr-only" type="file" accept="image/avif,image/jpeg,image/png,image/webp" :disabled="saving || submitting" @change="chooseCover"></div></section>
          <label class="grid gap-2 text-sm font-semibold">Note for the reviewer <span class="font-normal text-dc-gray">Optional</span><textarea v-model="form.organizer_note" class="app-form-control min-h-28 rounded border border-dc-line bg-white px-4 py-3 text-base outline-none focus:border-dc-pink focus:ring-2 focus:ring-dc-pink/15" maxlength="1200" placeholder="Tell us what changed and why." /></label>
        </div>
        <div class="border-t border-dc-line bg-dc-paper-warm px-5 py-5 sm:px-8">
          <section v-if="reviewing && reviewSchedule" class="mb-5 rounded border border-dc-pink/30 bg-dc-pink/5 p-4" aria-live="polite">
            <p class="font-mono text-xs font-bold tracking-[0.12em] text-dc-pink">REVIEW TIME</p>
            <p class="mt-2 text-sm font-semibold">{{ reviewSchedule.event }}</p>
            <p v-if="form.timezone !== 'Africa/Accra'" class="mt-1 text-sm text-dc-gray">Ghana: {{ reviewSchedule.ghana }}</p>
            <p class="mt-2 text-sm text-dc-gray">Confirm this is the time attendees should use before sending it for review.</p>
          </section>
          <div class="flex flex-wrap items-center gap-3"><button class="motion-press rounded border-2 border-dc-ink bg-white px-4 py-3 font-mono text-xs font-bold tracking-[0.08em] disabled:cursor-not-allowed disabled:opacity-60" type="button" :disabled="saving" @click="save">{{ saving ? 'SAVING…' : 'SAVE DRAFT' }}</button><button v-if="!reviewing" class="motion-press rounded border-2 border-dc-ink bg-dc-yellow px-4 py-3 font-mono text-xs font-bold tracking-[0.08em] disabled:cursor-not-allowed disabled:opacity-60" :disabled="submitting || saving" type="button" @click="beginReview">REVIEW TIME →</button><button v-else class="motion-press rounded border-2 border-dc-ink bg-dc-yellow px-4 py-3 font-mono text-xs font-bold tracking-[0.08em] disabled:cursor-not-allowed disabled:opacity-60" :disabled="submitting || saving" type="submit">{{ submitting ? 'SUBMITTING…' : 'CONFIRM & SUBMIT →' }}</button><button v-if="reviewing" class="motion-press rounded border border-dc-line bg-white px-4 py-3 font-mono text-xs font-bold tracking-[0.08em]" type="button" :disabled="submitting || saving" @click="reviewing = false">EDIT TIME</button></div><p v-if="error" class="mt-3 text-sm text-red-700">{{ error }}</p><p v-else-if="saved" class="mt-3 text-sm text-green-700">Draft saved privately.</p>
        </div>
      </form>
    </section>
  </main>
</template>
