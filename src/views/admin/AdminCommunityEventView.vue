<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import AppDropdown from '@/src/components/AppDropdown.vue';
import AppDatePicker from '@/src/components/ui/AppDatePicker.vue';
import ConfirmDialog from '@/src/components/ui/ConfirmDialog.vue';
import UploadProgressBar from '@/src/components/UploadProgressBar.vue';
import { checkEventPageNow, fetchEventById, fetchEventPageMonitor, fetchEventSlackAnnouncement, sendEventSlackAnnouncement, updateEventById, type EventPageMonitor, type EventPageMonitorOrganizerContact, type EventSlackAnnouncement } from '@/src/lib/api';
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
const organizerContact = ref<EventPageMonitorOrganizerContact | null>(null);
const monitorEligible = ref(false);
const monitorLoading = ref(false);
const unpublishConfirmOpen = ref(false);
const unpublishing = ref(false);
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
      organizerContact.value = monitoring.organizer_contact;
    } catch {
      pageMonitor.value = null;
      monitorEligible.value = false;
      organizerContact.value = null;
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
const monitorNeedsReview = computed(() => ['changed', 'unavailable', 'unmonitorable'].includes(pageMonitor.value?.status ?? ''));
function monitorTimestamp(value: string | null | undefined) {
  if (!value) return 'Not yet';
  const date = new Date(value);
  return `${accraDate.format(date)} · ${accraTime.format(date)}`;
}
function monitorFieldLabel(field: string) {
  return ({ final_url: 'Page destination', name: 'Event name', starts_at: 'Start time', ends_at: 'End time', location: 'Venue', event_status: 'Event status', registration_url: 'Registration destination' } as Record<string, string>)[field] ?? field.replace(/_/g, ' ');
}
function monitorDifferenceValue(field: string, value: string | null, fallback: string) {
  if (!value) return fallback;
  if (field === 'starts_at' || field === 'ends_at') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return `${accraDate.format(date)} · ${accraTime.format(date)}`;
  }
  return value;
}
const organizerMailto = computed(() => {
  if (!event.value || !organizerContact.value || !monitorNeedsReview.value) return null;
  const subject = `DevCongress listing check: ${event.value.name}`;
  const differences = pageMonitor.value?.differences.map((difference) => (
    `- ${monitorFieldLabel(difference.field)}: EMS has "${monitorDifferenceValue(difference.field, difference.expected, 'not set')}"; the registration page shows "${monitorDifferenceValue(difference.field, difference.observed, 'not found')}".`
  )) ?? [];
  const issue = differences.length
    ? differences
    : [`- ${pageMonitor.value?.last_error || 'The registration page could not be verified.'}`];
  const body = [
    `Hi ${organizerContact.value.name || 'there'},`,
    '',
    `Our monitoring noticed that the registration page for ${event.value.name} may no longer match the event details published on the DevCongress community calendar.`,
    '',
    ...issue,
    '',
    'Please reply to confirm the current details. You can also submit the official changes using the private event-management link from your approval email.',
    '',
    'Thank you,',
    'DevCongress',
  ].join('\n');
  return `mailto:${encodeURIComponent(organizerContact.value.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
});
async function checkRegistrationPage() {
  if (!event.value || monitorLoading.value) return;
  monitorLoading.value = true;
  try {
    const result = await checkEventPageNow(event.value.id);
    pageMonitor.value = result.monitor;
    monitorEligible.value = result.eligible;
    organizerContact.value = result.organizer_contact;
    if (result.monitor?.status === 'changed') notify.error('The registration page has changes that need review.');
    else if (result.monitor?.status === 'unavailable' || result.monitor?.status === 'unmonitorable') notify.error(result.monitor.last_error || 'The registration page needs review.');
    else notify.success('Registration page checked. No changes detected.');
  } catch (cause) {
    notify.error(cause instanceof Error ? cause.message : 'The registration page could not be checked.');
  } finally {
    monitorLoading.value = false;
  }
}
async function unpublishListing() {
  if (!event.value || unpublishing.value) return;
  unpublishing.value = true;
  try {
    event.value = await updateEventById(event.value.id, { publish_to_website: false });
    monitorEligible.value = false;
    unpublishConfirmOpen.value = false;
    notify.success('Community listing unpublished. The organizer event itself is unchanged.');
  } catch (cause) {
    notify.error(cause instanceof Error ? cause.message : 'The listing could not be unpublished.');
  } finally {
    unpublishing.value = false;
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
        <section class="overflow-hidden rounded-lg border-2 border-dc-ink bg-dc-paper shadow-[3px_3px_0_#111111] lg:col-span-2">
          <header class="flex flex-col gap-4 border-b border-dc-line bg-dc-paper-warm px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
            <div>
              <p class="font-mono text-xs font-bold tracking-[0.14em] text-dc-pink">REGISTRATION PAGE MONITOR</p>
              <p class="mt-1 max-w-2xl text-sm leading-6 text-dc-gray">Read-only monitoring compares the organizer’s source page with this listing. Nothing changes automatically.</p>
            </div>
            <button v-if="monitorEligible" class="motion-press w-full rounded-md border border-dc-ink bg-dc-paper px-3 py-2 font-mono text-[11px] font-bold tracking-[0.06em] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto" type="button" :disabled="monitorLoading" @click="checkRegistrationPage">{{ monitorLoading ? 'CHECKING…' : 'CHECK NOW ↻' }}</button>
          </header>

          <dl v-if="monitorEligible && pageMonitor" class="grid border-b border-dc-line bg-dc-paper sm:grid-cols-3 sm:divide-x sm:divide-dc-line">
            <div class="border-b border-dc-line px-5 py-4 sm:border-b-0 sm:px-6">
              <dt class="font-mono text-[10px] font-bold tracking-[0.12em] text-dc-gray">STATUS</dt>
              <dd class="mt-2 flex items-center gap-2 text-sm font-semibold" :class="monitorStatusClass" aria-live="polite">
                <span class="size-2 shrink-0 rounded-full" :class="monitorNeedsReview ? 'bg-red-600' : pageMonitor.status === 'warning' ? 'bg-amber-500' : pageMonitor.status === 'unchanged' ? 'bg-green-600' : 'bg-dc-gray'" aria-hidden="true" />
                {{ monitorStatus }}
              </dd>
              <p v-if="pageMonitor.last_error" class="mt-2 text-xs leading-5 text-dc-gray">{{ pageMonitor.last_error }}</p>
            </div>
            <div class="border-b border-dc-line px-5 py-4 sm:border-b-0 sm:px-6">
              <dt class="font-mono text-[10px] font-bold tracking-[0.12em] text-dc-gray">LAST CHECKED</dt>
              <dd class="mt-2 text-sm font-semibold">{{ monitorTimestamp(pageMonitor.last_checked_at) }}</dd>
            </div>
            <div class="px-5 py-4 sm:px-6">
              <dt class="font-mono text-[10px] font-bold tracking-[0.12em] text-dc-gray">NEXT CHECK</dt>
              <dd class="mt-2 text-sm font-semibold">{{ monitorTimestamp(pageMonitor.next_check_at) }}</dd>
            </div>
          </dl>

          <div v-if="monitorNeedsReview" class="grid lg:grid-cols-[minmax(0,1fr)_21rem]">
            <section class="min-w-0 px-5 py-6 sm:px-6">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p class="font-mono text-[11px] font-bold tracking-[0.12em] text-red-700">DETECTED DIFFERENCES</p>
                  <h2 class="mt-1 text-lg font-bold">What changed on the source page</h2>
                </div>
                <span v-if="pageMonitor?.differences.length" class="rounded-full bg-red-50 px-3 py-1 font-mono text-[10px] font-bold tracking-[0.08em] text-red-700">{{ pageMonitor.differences.length }} {{ pageMonitor.differences.length === 1 ? 'CHANGE' : 'CHANGES' }}</span>
              </div>

              <div v-if="pageMonitor?.differences.length" class="mt-5 divide-y divide-dc-line border-y border-dc-line">
                <article v-for="difference in pageMonitor.differences" :key="difference.field" class="grid gap-3 py-4 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-5">
                  <p class="font-mono text-[11px] font-bold uppercase tracking-[0.08em]">{{ monitorFieldLabel(difference.field) }}</p>
                  <dl class="grid min-w-0 gap-2 sm:grid-cols-2">
                    <div class="min-w-0 rounded-md bg-dc-paper-warm px-3 py-3">
                      <dt class="font-mono text-[9px] font-bold tracking-[0.1em] text-dc-gray">APPROVED LISTING</dt>
                      <dd class="mt-1 break-words text-sm font-medium leading-5">{{ monitorDifferenceValue(difference.field, difference.expected, 'Not set') }}</dd>
                    </div>
                    <div class="min-w-0 rounded-md border border-red-200 bg-red-50 px-3 py-3">
                      <dt class="font-mono text-[9px] font-bold tracking-[0.1em] text-red-700">SOURCE PAGE NOW</dt>
                      <dd class="mt-1 break-words text-sm font-semibold leading-5 text-red-700">{{ monitorDifferenceValue(difference.field, difference.observed, 'Not found') }}</dd>
                    </div>
                  </dl>
                </article>
              </div>

              <div v-else class="mt-5 rounded-md border border-red-200 bg-red-50 px-4 py-4">
                <p class="text-sm font-semibold text-red-700">The source page could not be verified.</p>
                <p class="mt-1 text-sm leading-6 text-dc-gray">{{ pageMonitor?.last_error || 'Open the source page to confirm whether the event details are still available.' }}</p>
              </div>
            </section>

            <aside class="border-t border-dc-line bg-dc-paper-warm px-5 py-6 sm:px-6 lg:border-l lg:border-t-0">
              <p class="font-mono text-[11px] font-bold tracking-[0.12em] text-dc-pink">NEXT STEPS</p>
              <h2 class="mt-1 text-lg font-bold">Review before publishing changes</h2>

              <ol class="mt-5 space-y-6">
                <li class="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-3">
                  <span class="grid size-7 place-items-center rounded-full bg-dc-ink font-mono text-[11px] font-bold text-dc-paper">1</span>
                  <div class="min-w-0">
                    <p class="text-sm font-semibold">Verify the source</p>
                    <p class="mt-1 text-xs leading-5 text-dc-gray">Confirm the organizer’s page really shows these details.</p>
                    <a v-if="pageMonitor?.source_url" :href="pageMonitor.source_url" target="_blank" rel="noreferrer" class="motion-press mt-3 inline-flex w-full items-center justify-center rounded-md border-2 border-dc-ink bg-dc-yellow px-4 py-3 font-mono text-[11px] font-bold tracking-[0.06em] shadow-[2px_2px_0_#111111]">OPEN SOURCE PAGE ↗</a>
                  </div>
                </li>
                <li class="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-3">
                  <span class="grid size-7 place-items-center rounded-full bg-dc-ink font-mono text-[11px] font-bold text-dc-paper">2</span>
                  <div class="min-w-0">
                    <p class="text-sm font-semibold">Resolve the listing</p>
                    <p class="mt-1 text-xs leading-5 text-dc-gray">Confirm with the organizer, or update the public listing if the change is correct.</p>
                    <div class="mt-3 grid gap-2">
                      <a v-if="organizerMailto" :href="organizerMailto" class="motion-press inline-flex w-full items-center justify-center rounded-md border-2 border-dc-ink bg-dc-pink px-4 py-3 text-center font-mono text-[11px] font-bold tracking-[0.06em] text-white shadow-[2px_2px_0_#111111]">MESSAGE ORGANIZER →</a>
                      <button type="button" class="motion-press w-full rounded-md border border-dc-ink bg-dc-paper px-4 py-3 font-mono text-[11px] font-bold tracking-[0.06em]" @click="beginEdit">EDIT LISTING →</button>
                    </div>
                    <p v-if="!organizerMailto" class="mt-3 text-xs leading-5 text-dc-gray">No organizer email is linked to this listing. Use the source page or submission record to find their contact details.</p>
                  </div>
                </li>
              </ol>

              <div v-if="event.publish_to_website !== false" class="mt-6 border-t border-dc-line pt-5">
                <p class="text-xs leading-5 text-dc-gray">If the listing could mislead attendees, remove it temporarily while you verify the details.</p>
                <button type="button" class="motion-press mt-3 w-full rounded-md border border-red-700 bg-dc-paper px-4 py-3 font-mono text-[11px] font-bold tracking-[0.06em] text-red-700" @click="unpublishConfirmOpen = true">TEMPORARILY UNPUBLISH</button>
              </div>
            </aside>
          </div>

          <div v-else class="flex flex-wrap items-center gap-3 px-5 py-4 sm:px-6">
            <a v-if="pageMonitor?.source_url" :href="pageMonitor.source_url" target="_blank" rel="noreferrer" class="motion-press rounded-md border border-dc-ink bg-dc-paper px-3 py-2 font-mono text-[11px] font-bold tracking-[0.06em]">OPEN SOURCE PAGE ↗</a>
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

  <ConfirmDialog
    :open="unpublishConfirmOpen"
    title="Temporarily unpublish this listing?"
    message="The event will disappear from the public DevCongress calendar while you verify the organizer’s changes. This does not cancel the organizer’s event, and you can publish the listing again after updating it."
    confirm-label="Unpublish listing"
    busy-label="Unpublishing…"
    cancel-label="Keep published"
    :busy="unpublishing"
    danger
    @cancel="unpublishConfirmOpen = false"
    @confirm="unpublishListing"
  />
</template>
