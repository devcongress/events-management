<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import AppDropdown from '@/src/components/AppDropdown.vue';
import AppDatePicker from '@/src/components/ui/AppDatePicker.vue';
import UploadProgressBar from '@/src/components/UploadProgressBar.vue';
import { checkEventPageNow, fetchEventById, fetchEventPageMonitor, fetchEventSlackAnnouncement, sendEventSlackAnnouncement, updateEventById, type EventPageMonitor, type EventSlackAnnouncement } from '@/src/lib/api';
import { compressMeetupImageForUpload, uploadEventMedia, validateMeetupImageFile } from '@/src/lib/meetup-media-client';
import { notify } from '@/src/lib/notify';
import { EVENT_ANNOUNCEMENT_FALLBACK_COVER } from '@/lib/event-cover';
import type { Event as CommunityEvent, EventFormat, EventLocationType } from '@/types';

const route = useRoute();
const event = ref<CommunityEvent | null>(null);
const loading = ref(true);
const editing = ref(false);
const saving = ref(false);
const coverSaving = ref(false);
const coverUploadProgress = ref<number | null>(null);
const slackAnnouncement = ref<EventSlackAnnouncement | null>(null);
const slackEligible = ref(false);
const slackWebsiteReady = ref(true);
const slackLoading = ref(false);
const pageMonitor = ref<EventPageMonitor | null>(null);
const monitorEligible = ref(false);
const monitorLoading = ref(false);
const error = ref('');
const draft = reactive({
  name: '', description: '', format: 'meetup' as EventFormat, starts_at: '', ends_at: '',
  location_type: 'in_person' as EventLocationType, venue_name: '', venue_address: '', online_url: '', registration_url: '',
});

const formatOptions = [
  { value: 'meetup', label: 'Meetup' }, { value: 'workshop', label: 'Workshop' },
  { value: 'hackathon', label: 'Hackathon' }, { value: 'webinar', label: 'Webinar' }, { value: 'other', label: 'Other' },
];
const locationOptions = [
  { value: 'in_person', label: 'In person' }, { value: 'online', label: 'Online' }, { value: 'hybrid', label: 'Hybrid' },
];
const eventId = computed(() => String(route.params.eventId));
const publicStatus = computed(() => event.value?.publication_status === 'published' ? 'Published' : 'Draft');
const cover = computed(() => event.value?.cover || EVENT_ANNOUNCEMENT_FALLBACK_COVER);

function local(value: string | null | undefined) { return value ? value.slice(0, 16) : ''; }
const accraDate = new Intl.DateTimeFormat('en-GH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Accra' });
const accraTime = new Intl.DateTimeFormat('en-GH', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Africa/Accra' });

function eventTiming(startsAt: string | null | undefined, endsAt: string | null | undefined) {
  if (!startsAt) return 'Not set';

  const start = new Date(startsAt);
  if (!endsAt) return `${accraDate.format(start)} · ${accraTime.format(start)}`;

  const end = new Date(endsAt);
  const startDate = accraDate.format(start);
  const endDate = accraDate.format(end);
  const startTime = accraTime.format(start);
  const endTime = accraTime.format(end);
  if (startDate !== endDate) return `${startDate}, ${startTime} → ${endDate}, ${endTime}`;

  const endPeriod = endTime.match(/\s([ap]m)$/i)?.[1];
  const compactStartTime = endPeriod && startTime.toLowerCase().endsWith(endPeriod.toLowerCase())
    ? startTime.slice(0, -(endPeriod.length + 1))
    : startTime;
  return `${startDate} · ${compactStartTime}–${endTime}`;
}
function loadDraft(value: CommunityEvent) {
  Object.assign(draft, {
    name: value.name, description: value.description ?? '', format: value.format ?? 'meetup',
    starts_at: local(value.event_date), ends_at: local(value.end_date), location_type: value.location_type ?? 'in_person',
    venue_name: value.location?.name ?? '', venue_address: value.venue_address ?? '', online_url: value.online_url ?? value.stream_url ?? '',
    registration_url: value.registration_url ?? '',
  });
}
async function load() {
  loading.value = true;
  try {
    const loaded = await fetchEventById(eventId.value);
    event.value = loaded;
    loadDraft(loaded);
    try {
      const slack = await fetchEventSlackAnnouncement(loaded.id);
      slackAnnouncement.value = slack.announcement;
      slackEligible.value = slack.eligible;
      slackWebsiteReady.value = slack.website_ready !== false;
    } catch {
      // Event details should remain usable if the operational panel is unavailable.
      slackAnnouncement.value = null;
      slackEligible.value = false;
      slackWebsiteReady.value = true;
    }
    try {
      const monitoring = await fetchEventPageMonitor(loaded.id);
      pageMonitor.value = monitoring.monitor;
      monitorEligible.value = monitoring.eligible;
    } catch {
      pageMonitor.value = null;
      monitorEligible.value = false;
    }
  } catch {
    error.value = 'This community event could not be loaded.';
  } finally {
    loading.value = false;
  }
}
const monitorStatus = computed(() => {
  if (!monitorEligible.value) return 'Not monitored';
  if (!pageMonitor.value || pageMonitor.value.status === 'pending') return 'Waiting for first check';
  if (pageMonitor.value.status === 'unchanged') return 'No changes detected';
  if (pageMonitor.value.status === 'changed') return 'Changes need review';
  if (pageMonitor.value.status === 'warning') return 'Temporary check warning';
  if (pageMonitor.value.status === 'unavailable') return 'Page unavailable';
  return 'Page cannot be monitored';
});
const monitorStatusClass = computed(() => {
  if (pageMonitor.value?.status === 'changed' || pageMonitor.value?.status === 'unavailable' || pageMonitor.value?.status === 'unmonitorable') return 'text-red-700';
  if (pageMonitor.value?.status === 'warning') return 'text-amber-700';
  if (pageMonitor.value?.status === 'unchanged') return 'text-green-700';
  return 'text-dc-ink';
});
function monitorTimestamp(value: string | null | undefined) {
  if (!value) return 'Not yet';
  const date = new Date(value);
  return `${accraDate.format(date)} · ${accraTime.format(date)}`;
}
function monitorFieldLabel(field: string) {
  return ({ final_url: 'Page destination', name: 'Event name', starts_at: 'Start time', ends_at: 'End time', location: 'Venue', event_status: 'Event status', registration_url: 'Registration destination' } as Record<string, string>)[field] ?? field.replace(/_/g, ' ');
}
async function checkRegistrationPage() {
  if (!event.value || monitorLoading.value) return;
  monitorLoading.value = true;
  try {
    const result = await checkEventPageNow(event.value.id);
    pageMonitor.value = result.monitor;
    monitorEligible.value = result.eligible;
    if (result.monitor?.status === 'changed') notify.error('The registration page has changes that need review.');
    else if (result.monitor?.status === 'unavailable' || result.monitor?.status === 'unmonitorable') notify.error(result.monitor.last_error || 'The registration page needs review.');
    else notify.success('Registration page checked. No changes detected.');
  } catch (cause) {
    notify.error(cause instanceof Error ? cause.message : 'The registration page could not be checked.');
  } finally {
    monitorLoading.value = false;
  }
}
const slackActionLabel = computed(() => slackAnnouncement.value?.status === 'failed' ? 'RETRY SLACK' : 'SEND TO SLACK');
const slackStatus = computed(() => {
  if (!slackEligible.value) return 'Not eligible';
  if (!slackWebsiteReady.value) return 'Waiting for website update';
  if (!slackAnnouncement.value) return 'Not sent yet';
  if (slackAnnouncement.value.status === 'sent') return 'Sent to events channel';
  if (slackAnnouncement.value.status === 'pending') return 'Sending…';
  return 'Delivery failed';
});
async function sendSlackAnnouncement() {
  if (!event.value || slackLoading.value || !slackEligible.value || slackAnnouncement.value?.status === 'sent') return;
  slackLoading.value = true;
  try {
    const result = await sendEventSlackAnnouncement(event.value.id);
    slackAnnouncement.value = result.announcement;
    slackEligible.value = result.eligible;
    slackWebsiteReady.value = result.website_ready !== false;
    if (!slackWebsiteReady.value) notify.error('The public page is not available yet. Slack will be retried after the website update.');
    else if (result.announcement?.status === 'sent') notify.success('Event sent to the Slack events channel.');
    else notify.error(result.announcement?.last_error || 'Slack could not accept the event. You can retry it.');
  } catch (cause) {
    notify.error(cause instanceof Error ? cause.message : 'Slack notification could not be sent.');
  } finally {
    slackLoading.value = false;
  }
}
function beginEdit() { if (event.value) { loadDraft(event.value); error.value = ''; editing.value = true; } }
function cancelEdit() {
  if (coverSaving.value) return;
  editing.value = false;
  error.value = '';
}
async function save() {
  if (!event.value || saving.value || coverSaving.value) return;
  saving.value = true; error.value = '';
  try {
    const updated = await updateEventById(event.value.id, {
      name: draft.name, description: draft.description || null, format: draft.format,
      event_date: new Date(draft.starts_at).toISOString(), end_date: new Date(draft.ends_at).toISOString(),
      location_type: draft.location_type,
      location: { name: draft.location_type === 'online' ? 'Online' : draft.venue_name, label: draft.venue_address || draft.venue_name, url: null },
      venue_address: draft.location_type === 'online' ? null : draft.venue_address || null,
      online_url: draft.location_type === 'in_person' ? null : draft.online_url || null,
      stream_url: draft.location_type === 'in_person' ? null : draft.online_url || null,
      registration_url: draft.registration_url || null,
    });
    event.value = updated;
    editing.value = false;
    notify.success('Community event updated.');
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'The event could not be updated.';
  } finally {
    saving.value = false;
  }
}
async function uploadCover(eventInput: Event) {
  const input = eventInput.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file || !event.value) return;
  const validation = validateMeetupImageFile(file);
  if (validation) { error.value = validation; return; }
  coverSaving.value = true; error.value = '';
  try {
    coverUploadProgress.value = null;
    const compressed = await compressMeetupImageForUpload(file);
    coverUploadProgress.value = 0;
    const response = await uploadEventMedia(event.value.id, compressed, 'cover', (percent) => {
      coverUploadProgress.value = percent;
    });
    if (response.event) event.value = response.event;
    notify.success('Cover image updated.');
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'The cover could not be uploaded.';
  } finally {
    input.value = '';
    coverSaving.value = false;
    coverUploadProgress.value = null;
  }
}

onMounted(load);
</script>

<template>
  <div class="editorial-page event-overview-page">
    <div class="editorial-wrap event-overview-wrap">
    <section v-if="loading" class="animate-pulse rounded-lg border border-dc-line bg-dc-paper p-8"><div class="h-10 w-2/5 bg-dc-cream" /><div class="mt-6 h-64 bg-dc-cream" /></section>
    <section v-else-if="!event" class="rounded-lg border-2 border-dc-ink bg-dc-paper p-8 shadow-[3px_3px_0_#111111]"><p class="font-mono text-xs font-bold tracking-[0.16em] text-dc-pink">COMMUNITY EVENT</p><h1 class="mt-3 text-3xl font-bold">Event unavailable</h1><p class="mt-2 text-dc-gray">{{ error || 'This listing no longer exists.' }}</p></section>
    <section v-else>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <RouterLink
          :to="{ name: 'admin-events' }"
          class="motion-press inline-flex items-center rounded-md border-2 border-dc-ink bg-dc-paper px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-wide text-dc-ink shadow-[2px_2px_0_#111111] hover:bg-dc-yellow"
        >
          ← BACK TO EVENTS
        </RouterLink>
        <button v-if="!editing" class="motion-press rounded border-2 border-dc-ink bg-dc-yellow px-4 py-3 font-mono text-xs font-bold tracking-[0.08em]" @click="beginEdit">EDIT LISTING →</button>
      </div>
      <div class="mt-9 border-b-2 border-dc-ink pb-6"><div class="min-w-0"><p class="font-mono text-xs font-bold tracking-[0.16em] text-dc-pink">COMMUNITY EVENT</p><h1 class="mt-2 max-w-4xl text-3xl font-bold tracking-tight sm:text-4xl">{{ event.name }}</h1><p class="mt-3 text-sm text-dc-gray">External community listing · {{ event.format || 'Event' }} · {{ publicStatus }}</p></div></div>

      <div v-if="!editing" class="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1.18fr)_minmax(19rem,.82fr)]">
        <article class="overflow-hidden rounded-lg border-2 border-dc-ink bg-dc-paper shadow-[3px_3px_0_#111111]">
          <img :src="cover" :alt="`${event.name} cover`" class="aspect-[16/9] w-full object-cover">
          <div class="border-t border-dc-line px-6 py-5">
            <p class="font-mono text-xs font-bold tracking-[0.14em] text-dc-pink">ABOUT THIS EVENT</p>
            <p class="mt-3 max-w-2xl whitespace-pre-line text-base leading-7 text-dc-gray">{{ event.description || 'No description provided.' }}</p>
          </div>
        </article>
        <aside class="overflow-hidden rounded-lg border border-dc-line bg-dc-paper shadow-[0_1px_0_rgba(17,17,17,0.05)]">
          <div class="border-b border-dc-line bg-dc-paper-warm px-5 py-4"><p class="font-mono text-xs font-bold tracking-[0.14em] text-dc-pink">AT A GLANCE</p></div>
          <dl>
            <div class="border-b border-dc-line px-5 py-5"><dt class="font-mono text-xs font-bold tracking-[0.12em] text-dc-gray">WHEN</dt><dd class="mt-2 font-semibold leading-6">{{ eventTiming(event.event_date, event.end_date) }}</dd></div>
            <div class="border-b border-dc-line px-5 py-5"><dt class="font-mono text-xs font-bold tracking-[0.12em] text-dc-gray">WHERE</dt><dd class="mt-2 font-semibold">{{ event.location?.name || 'Online' }}</dd><p v-if="event.venue_address" class="mt-1 text-sm text-dc-gray">{{ event.venue_address }}</p></div>
            <div class="border-b border-dc-line px-5 py-5"><dt class="font-mono text-xs font-bold tracking-[0.12em] text-dc-gray">PUBLIC LINKS</dt><dd class="mt-3 flex flex-wrap gap-2"><a v-if="event.registration_url" :href="event.registration_url" target="_blank" rel="noreferrer" class="motion-press rounded border border-dc-ink bg-white px-3 py-2 font-mono text-[11px] font-bold tracking-[0.06em]">REGISTRATION ↗</a><a v-if="event.online_url || event.stream_url" :href="event.online_url || event.stream_url || undefined" target="_blank" rel="noreferrer" class="motion-press rounded border border-dc-ink bg-white px-3 py-2 font-mono text-[11px] font-bold tracking-[0.06em]">JOIN ONLINE ↗</a><span v-if="!event.registration_url && !event.online_url && !event.stream_url" class="text-sm text-dc-gray">No public links supplied.</span></dd></div>
            <div class="px-5 py-5"><dt class="font-mono text-xs font-bold tracking-[0.12em] text-dc-gray">SLACK EVENTS CHANNEL</dt><dd class="mt-2 text-sm font-semibold" :class="slackAnnouncement?.status === 'failed' ? 'text-red-700' : 'text-dc-ink'">{{ slackStatus }}</dd><p v-if="slackAnnouncement?.status === 'sent' && slackAnnouncement.sent_at" class="mt-1 text-xs text-dc-gray">{{ accraDate.format(new Date(slackAnnouncement.sent_at)) }} · {{ accraTime.format(new Date(slackAnnouncement.sent_at)) }}</p><p v-if="slackAnnouncement?.status === 'failed' && slackAnnouncement.last_error" class="mt-2 text-xs leading-5 text-dc-gray">{{ slackAnnouncement.last_error }}</p><p v-if="slackEligible" class="mt-2 text-xs leading-5 text-dc-gray">This event will be posted to Slack as soon as its public page is available on devcongress.org. The website refresh runs daily; the scheduled retry will check again after the update.</p><button v-if="slackEligible && slackAnnouncement?.status !== 'sent'" class="motion-press mt-3 rounded border-2 border-dc-ink bg-white px-3 py-2 font-mono text-[11px] font-bold tracking-[0.06em] disabled:cursor-not-allowed disabled:opacity-60" :disabled="slackLoading || slackAnnouncement?.status === 'pending'" @click="sendSlackAnnouncement">{{ slackLoading ? 'SENDING…' : slackActionLabel }}</button></div>
          </dl>
        </aside>
        <section class="rounded-lg border-2 border-dc-ink bg-dc-paper shadow-[3px_3px_0_#111111] lg:col-span-2">
          <div class="flex flex-wrap items-start justify-between gap-4 border-b border-dc-line bg-dc-paper-warm px-5 py-4">
            <div><p class="font-mono text-xs font-bold tracking-[0.14em] text-dc-pink">REGISTRATION PAGE MONITOR</p><p class="mt-1 max-w-2xl text-sm leading-6 text-dc-gray">Read-only checks compare the organizer’s registration page with the approved listing. EMS never changes or unpublishes the event automatically.</p></div>
            <button v-if="monitorEligible" class="motion-press rounded border-2 border-dc-ink bg-dc-yellow px-4 py-3 font-mono text-[11px] font-bold tracking-[0.06em] disabled:cursor-not-allowed disabled:opacity-60" type="button" :disabled="monitorLoading" @click="checkRegistrationPage">{{ monitorLoading ? 'CHECKING…' : 'CHECK NOW →' }}</button>
          </div>
          <div v-if="monitorEligible && pageMonitor" class="grid gap-px bg-dc-line sm:grid-cols-3">
            <div class="bg-dc-paper px-5 py-5"><p class="font-mono text-[11px] font-bold tracking-[0.12em] text-dc-gray">STATUS</p><p class="mt-2 text-sm font-semibold" :class="monitorStatusClass">{{ monitorStatus }}</p><p v-if="pageMonitor.last_error" class="mt-2 text-xs leading-5 text-dc-gray">{{ pageMonitor.last_error }}</p></div>
            <div class="bg-dc-paper px-5 py-5"><p class="font-mono text-[11px] font-bold tracking-[0.12em] text-dc-gray">LAST CHECKED</p><p class="mt-2 text-sm font-semibold">{{ monitorTimestamp(pageMonitor.last_checked_at) }}</p></div>
            <div class="bg-dc-paper px-5 py-5"><p class="font-mono text-[11px] font-bold tracking-[0.12em] text-dc-gray">NEXT CHECK</p><p class="mt-2 text-sm font-semibold">{{ monitorTimestamp(pageMonitor.next_check_at) }}</p></div>
          </div>
          <div v-if="pageMonitor?.differences.length" class="border-t border-dc-line px-5 py-5">
            <p class="font-mono text-[11px] font-bold tracking-[0.12em] text-red-700">DETECTED DIFFERENCES</p>
            <div class="mt-3 grid gap-3 sm:grid-cols-2">
              <div v-for="difference in pageMonitor.differences" :key="difference.field" class="rounded border border-dc-line bg-dc-paper-warm p-4">
                <p class="font-mono text-[11px] font-bold uppercase tracking-[0.08em]">{{ monitorFieldLabel(difference.field) }}</p>
                <p class="mt-2 text-xs text-dc-gray">Approved: {{ difference.expected || 'Not set' }}</p>
                <p class="mt-1 text-sm font-semibold text-red-700">Page now: {{ difference.observed || 'Not found' }}</p>
              </div>
            </div>
            <p class="mt-4 text-xs leading-5 text-dc-gray">Open the source page to verify the signal, then use Edit listing if the organizer’s change should be reflected publicly.</p>
          </div>
          <div class="flex flex-wrap items-center gap-3 border-t border-dc-line px-5 py-4">
            <a v-if="pageMonitor?.source_url" :href="pageMonitor.source_url" target="_blank" rel="noreferrer" class="motion-press rounded border border-dc-ink bg-white px-3 py-2 font-mono text-[11px] font-bold tracking-[0.06em]">OPEN SOURCE PAGE ↗</a>
            <p v-if="!monitorEligible" class="text-sm text-dc-gray">Monitoring starts for a future, published external event once it has a public HTTPS registration page.</p>
          </div>
        </section>
      </div>

      <form v-else class="mt-7 overflow-hidden rounded-lg border-2 border-dc-ink bg-dc-paper shadow-[3px_3px_0_#111111]" @submit.prevent="save">
        <div class="border-b border-dc-line bg-dc-paper-warm px-6 py-5"><p class="font-mono text-xs font-bold tracking-[0.16em] text-dc-pink">EDIT COMMUNITY LISTING</p><p class="mt-1 text-sm text-dc-gray">Changes publish directly and are recorded in the audit log.</p></div>
        <div class="space-y-6 p-6"><label class="grid gap-2 text-sm font-semibold">Event title<input v-model="draft.name" class="min-h-[50px] rounded border border-dc-line px-4 outline-none focus:border-dc-pink" required></label><label class="grid gap-2 text-sm font-semibold">Description<textarea v-model="draft.description" class="min-h-28 rounded border border-dc-line px-4 py-3 outline-none focus:border-dc-pink" maxlength="10000" /></label><div class="grid gap-5 sm:grid-cols-2"><AppDropdown v-model="draft.format" :options="formatOptions" label="Format" /><AppDropdown v-model="draft.location_type" :options="locationOptions" label="Location type" /></div><div class="grid gap-5 sm:grid-cols-2"><AppDatePicker v-model="draft.starts_at" label="Starts" mode="datetime" density="field" required /><AppDatePicker v-model="draft.ends_at" label="Ends" mode="datetime" density="field" required /></div><div v-if="draft.location_type !== 'online'" class="grid gap-5 sm:grid-cols-2"><label class="grid gap-2 text-sm font-semibold">Venue name<input v-model="draft.venue_name" class="min-h-[50px] rounded border border-dc-line px-4" required></label><label class="grid gap-2 text-sm font-semibold">Venue address<input v-model="draft.venue_address" class="min-h-[50px] rounded border border-dc-line px-4"></label></div><label v-if="draft.location_type !== 'in_person'" class="grid gap-2 text-sm font-semibold">Online event link<input v-model="draft.online_url" class="min-h-[50px] rounded border border-dc-line px-4" type="url" required></label><label class="grid gap-2 text-sm font-semibold">Registration link<input v-model="draft.registration_url" class="min-h-[50px] rounded border border-dc-line px-4" type="url"></label><section><p class="text-sm font-semibold">Cover image</p><div class="mt-2 overflow-hidden rounded border border-dc-line"><img :src="cover" :alt="`${event.name} cover`" class="h-48 w-full object-cover"><UploadProgressBar v-if="coverSaving" :percent="coverUploadProgress" :label="coverUploadProgress === null ? 'Preparing cover' : 'Uploading cover'" /><label class="motion-press flex cursor-pointer items-center justify-between border-t border-dc-line px-4 py-3 text-sm font-semibold"><span>{{ coverSaving ? 'Uploading cover…' : 'Replace cover image' }}</span><span class="font-mono text-xs font-bold text-dc-pink">BROWSE →</span><input class="sr-only" type="file" accept="image/avif,image/jpeg,image/png,image/webp" :disabled="coverSaving" @change="uploadCover"></label></div></section></div>
        <div class="flex flex-wrap gap-3 border-t border-dc-line bg-dc-paper-warm px-6 py-5"><button class="motion-press rounded border-2 border-dc-ink bg-white px-4 py-3 font-mono text-xs font-bold tracking-[0.08em] disabled:cursor-not-allowed disabled:opacity-60" type="button" :disabled="saving || coverSaving" @click="cancelEdit">CANCEL</button><button class="motion-press rounded border-2 border-dc-ink bg-dc-yellow px-4 py-3 font-mono text-xs font-bold tracking-[0.08em] disabled:cursor-not-allowed disabled:opacity-60" :disabled="saving || coverSaving" type="submit">{{ saving ? 'SAVING…' : coverSaving ? 'UPLOADING COVER…' : 'SAVE CHANGES →' }}</button><p v-if="error" class="w-full text-sm text-red-700">{{ error }}</p></div>
      </form>
    </section>
    </div>
  </div>
</template>
