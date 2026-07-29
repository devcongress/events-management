<script setup lang="ts">
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppDropdown from '@/src/components/AppDropdown.vue';
import AppDatePicker from '@/src/components/ui/AppDatePicker.vue';
import ConfirmDialog from '@/src/components/ui/ConfirmDialog.vue';
import EventCoverPicker from '@/src/components/ui/EventCoverPicker.vue';
import AdminEventsPageSkeleton from '@/src/components/ui/page-skeletons/AdminEventsPageSkeleton.vue';
import { createNativeEvent, deleteEventById, fetchEvents, queryKeys } from '@/src/lib/api';
import { createEventFormSchema, toCreateEventApiPayload, toEventSlug } from '@/src/lib/event-form';
import { REGISTRATION_SETUP_HISTORY_KEY } from '@/src/lib/registration-settings';
import {
  compressionSavingsPercent,
  compressMeetupImageForUpload,
  uploadEventMedia,
} from '@/src/lib/meetup-media-client';
import {
  EVENT_SERIES_HELP_TEXT,
  EVENT_SERIES_LABELS,
  EVENT_SERIES_SELECTIONS,
  eventSeriesValueToSelection,
  resolveEventSeriesType,
  type EventSeriesSelection,
} from '@/lib/event-series';
import { notify } from '@/src/lib/notify';
import type { Event as CommunityEvent, EventStatus } from '@/types';
import { adminPath } from '@/src/admin-routes';

const route = useRoute();
const router = useRouter();
const queryClient = useQueryClient();
const eventsQuery = useQuery({
  queryKey: queryKeys.events,
  queryFn: fetchEvents,
});
const form = reactive({
  name: '',
  description: '',
  event_date: '',
  end_date: '',
  series_type: 'monthly' as EventSeriesSelection,
  slug: '',
  cover: '',
  location_name: '',
  location_url: '',
  stream_url: '',
  publish_to_website: false,
  registration_capacity: 100,
  registration_opens_at: '',
  registration_closes_at: '',
  waitlist_enabled: true,
  auto_confirm: true,
});
const createPending = ref(false);
const createProgress = ref<'idle' | 'preparing-cover' | 'creating' | 'uploading-cover'>('idle');
const createError = ref<string | null>(null);
const slugWasEdited = ref(false);
const coverFile = ref<File | null>(null);
const eventPendingDelete = ref<CommunityEvent | null>(null);
const deletePending = ref(false);
const page = ref(1);
const selectedMonth = ref('all');
const selectedSeriesFilter = ref('all');
const pageSize = 6;
const lifecycleStages: Array<{
  status: EventStatus;
  label: string;
  description: string;
  organizerMove: string;
  actionLabel: string;
}> = [
  {
    status: 'draft',
    label: 'Draft',
    description: 'Create the event record and rough event shape.',
    organizerMove: 'Set date, description, and internal plan.',
    actionLabel: 'Set up',
  },
  {
    status: 'cfp_open',
    label: 'Submissions open',
    description: 'Speakers can submit talk ideas.',
    organizerMove: 'Share the speaker submission link and invite speakers.',
    actionLabel: 'Promote',
  },
  {
    status: 'cfp_closed',
    label: 'Submissions closed',
    description: 'New talk ideas are no longer accepted.',
    organizerMove: 'Review talks and decide the program.',
    actionLabel: 'Review talks',
  },
  {
    status: 'upcoming',
    label: 'Program set',
    description: 'Talks, speakers, and event basics are mostly ready.',
    organizerMove: 'Confirm speakers, quiz, venue, and comms.',
    actionLabel: 'Prepare',
  },
  {
    status: 'live',
    label: 'Live',
    description: 'The event is happening now.',
    organizerMove: 'Run the room and host live activities.',
    actionLabel: 'Run event',
  },
  {
    status: 'completed',
    label: 'Completed',
    description: 'The meetup has happened.',
    organizerMove: 'Review attendance and collect feedback.',
    actionLabel: 'Review',
  },
];

const creating = computed(() => route.path.endsWith('/new'));
const events = computed(() => [...(eventsQuery.data.value ?? [])].sort((a, b) => new Date(b.event_date).getTime() - new Date(a.event_date).getTime()));
const loading = computed(() => eventsQuery.isPending.value);
const eventsError = computed(() => eventsQuery.error.value?.message ?? null);
const seriesTypeOptions = EVENT_SERIES_SELECTIONS.map((value) => ({ value, label: EVENT_SERIES_LABELS[value] }));
const seriesFilterOptions = [
  { value: 'all', label: 'All types' },
  ...EVENT_SERIES_SELECTIONS.map((value) => ({ value, label: EVENT_SERIES_LABELS[value] })),
];
const monthOptions = computed(() => {
  const uniqueMonths = Array.from(new Set(events.value.map((event) => eventMonthValue(event.event_date))));

  return [
    { value: 'all', label: 'All months' },
    ...uniqueMonths.map((month) => ({ value: month, label: formatMonthOption(month) })),
  ];
});
const selectedMonthLabel = computed(() => monthOptions.value.find((option) => option.value === selectedMonth.value)?.label ?? 'All months');
const filteredEvents = computed(() => events.value.filter((event) => {
  const matchesMonth = selectedMonth.value === 'all' || eventMonthValue(event.event_date) === selectedMonth.value;
  const matchesSeries = selectedSeriesFilter.value === 'all'
    || eventSeriesValueToSelection(resolveEventSeriesType(event)) === selectedSeriesFilter.value;

  return matchesMonth && matchesSeries;
}));
const pageCount = computed(() => Math.max(1, Math.ceil(filteredEvents.value.length / pageSize)));
const paginatedEvents = computed(() => filteredEvents.value.slice((page.value - 1) * pageSize, page.value * pageSize));
const pageStart = computed(() => (filteredEvents.value.length === 0 ? 0 : (page.value - 1) * pageSize + 1));
const pageEnd = computed(() => Math.min(filteredEvents.value.length, page.value * pageSize));
const selectedSeriesTypeHelp = computed(() => EVENT_SERIES_HELP_TEXT[form.series_type]);
const generatedSlug = computed(() => toEventSlug(form.name));
const createButtonLabel = computed(() => {
  if (createProgress.value === 'preparing-cover') return 'PREPARING COVER…';
  if (createProgress.value === 'uploading-cover') return 'UPLOADING COVER…';
  if (createProgress.value === 'creating') return 'CREATING…';
  return 'CREATE EVENT + REGISTRATION';
});

function broadcastPublicMeetupsRefresh() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('dc-public-meetups-refresh'));
  window.localStorage.setItem('dc-public-meetups-refresh', String(Date.now()));
}

async function refreshEventQueries() {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.events }),
    queryClient.invalidateQueries({ queryKey: queryKeys.overview }),
    queryClient.invalidateQueries({ queryKey: queryKeys.publicMeetups }),
    queryClient.invalidateQueries({ queryKey: ['public-meetup'] }),
  ]);
  broadcastPublicMeetupsRefresh();
}

watch(pageCount, (nextPageCount) => {
  if (page.value > nextPageCount) {
    page.value = nextPageCount;
  }
});

watch([selectedMonth, selectedSeriesFilter], () => {
  page.value = 1;
});

watch(generatedSlug, (nextSlug) => {
  if (!slugWasEdited.value || form.slug === nextSlug) {
    slugWasEdited.value = false;
    form.slug = nextSlug;
  }
});

function handleSlugInput(event: Event) {
  form.slug = (event.target as HTMLInputElement).value;
  slugWasEdited.value = form.slug !== generatedSlug.value;
}

function normalizeWebsiteSlug() {
  const normalized = toEventSlug(form.slug);
  if (!normalized) {
    slugWasEdited.value = false;
    form.slug = generatedSlug.value;
    return;
  }
  form.slug = normalized;
  slugWasEdited.value = normalized !== generatedSlug.value;
}

function resetWebsiteSlug() {
  slugWasEdited.value = false;
  form.slug = generatedSlug.value;
}

function optionalLocalDateTimeToIso(value: string | null): string | null {
  if (!value) return null;
  return new Date(value).toISOString();
}

async function createEvent() {
  if (createPending.value) return;
  createError.value = null;
  normalizeWebsiteSlug();

  const parsed = createEventFormSchema.safeParse(form);
  if (!parsed.success) {
    createError.value = parsed.error.issues[0]?.message ?? 'Check the event details.';
    return;
  }

  createPending.value = true;
  createProgress.value = coverFile.value ? 'preparing-cover' : 'creating';
  try {
    const payload = toCreateEventApiPayload(parsed.data);
    const originalCoverFile = coverFile.value;
    const compressedCoverFile = originalCoverFile
      ? await compressMeetupImageForUpload(originalCoverFile)
      : null;
    createProgress.value = 'creating';
    const result = await createNativeEvent({
      ...payload,
      registration: {
        ...payload.registration,
        opens_at: optionalLocalDateTimeToIso(payload.registration.opens_at),
        closes_at: optionalLocalDateTimeToIso(payload.registration.closes_at),
      },
    });
    let coverUploadError: string | null = null;
    if (compressedCoverFile && originalCoverFile) {
      createProgress.value = 'uploading-cover';
      try {
        await uploadEventMedia(result.event.id, compressedCoverFile, 'cover');
        const savedPercent = compressionSavingsPercent(originalCoverFile, compressedCoverFile);
        notify.success(`Cover uploaded${savedPercent > 0 ? ` (${savedPercent}% smaller)` : ''}.`);
      } catch (error) {
        coverUploadError = error instanceof Error ? error.message : 'Unable to upload the cover image.';
      }
    }
    await refreshEventQueries();
    notify.success('Event and registration draft created.');
    if (coverUploadError) {
      notify.error(`Event created, but its cover was not uploaded: ${coverUploadError}`);
    }
    await router.push({
      path: adminPath(`events/${result.event.id}/registrations`),
      state: { [REGISTRATION_SETUP_HISTORY_KEY]: true },
    });
  } catch (error) {
    createError.value = error instanceof Error ? error.message : 'Unable to create the event.';
    notify.error(createError.value);
  } finally {
    createPending.value = false;
    createProgress.value = 'idle';
  }
}

function requestDeleteEvent(event: CommunityEvent) {
  eventPendingDelete.value = event;
}

function cancelDeleteEvent() {
  if (deletePending.value) return;
  eventPendingDelete.value = null;
}

async function confirmDeleteEvent() {
  if (!eventPendingDelete.value) return;

  const event = eventPendingDelete.value;
  deletePending.value = true;

  try {
    await deleteEventById(event.id);
    await refreshEventQueries();
    notify.success('Event removed.');
    eventPendingDelete.value = null;
    if (page.value > pageCount.value) page.value = pageCount.value;
  } catch (error) {
    notify.error(error instanceof Error ? error.message : 'Unable to remove event.');
  } finally {
    deletePending.value = false;
  }
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
}

function formatEventMonth(value: string): string {
  return new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(new Date(value));
}

function eventMonthValue(value: string): string {
  return value.slice(0, 7);
}

function formatMonthOption(value: string): string {
  return new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(new Date(`${value}-01T00:00:00`));
}

function eventKindLabel(event: CommunityEvent): string {
  return EVENT_SERIES_LABELS[eventSeriesValueToSelection(resolveEventSeriesType(event))];
}

function eventKindClass(event: CommunityEvent): string {
  const seriesType = resolveEventSeriesType(event);

  if (seriesType === 'quarterly') {
    return 'border-dc-pink text-dc-pink';
  }

  if (seriesType === 'special') {
    return 'border-dc-yellow text-dc-ink bg-dc-yellow/10';
  }

  return 'border-dc-border text-dc-gray';
}

function isDraftEvent(event: CommunityEvent): boolean {
  return !event.publish_to_website;
}

function removalMessage(event: CommunityEvent): string {
  const eventMonth = formatEventMonth(event.event_date);
  return `This permanently removes ${eventMonth}, including its registration list and check-ins.`;
}

function statusMeta(status: string) {
  return lifecycleStages.find((stage) => stage.status === status) ?? lifecycleStages[0];
}

function lifecycleIndex(status: string): number {
  const index = lifecycleStages.findIndex((stage) => stage.status === status);
  return index === -1 ? 0 : index;
}

function lifecyclePopoverPositionClass(index: number): string {
  if (index === 0) return 'lifecycle-stage-popover--start';
  if (index === lifecycleStages.length - 1) return 'lifecycle-stage-popover--end';
  return 'lifecycle-stage-popover--center';
}

function statusActionLabel(status: string): string {
  return statusMeta(status).actionLabel;
}

function isQuarterlyEvent(event: CommunityEvent): boolean {
  return resolveEventSeriesType(event) === 'quarterly';
}

function statusActionPath(event: CommunityEvent): string {
  const subsectionByStatus: Record<EventStatus, string> = {
    draft: 'talks',
    cfp_open: 'talks',
    cfp_closed: 'talks',
    upcoming: '',
    live: 'quiz/live',
    completed: isQuarterlyEvent(event) ? 'feedback' : 'attendance',
  };

  const subsection = subsectionByStatus[event.status];
  return adminPath(`events/${event.id}${subsection ? `/${subsection}` : ''}`);
}

async function openEventNextStep(event: CommunityEvent) {
  await router.push(statusActionPath(event));
}

function goToPage(nextPage: number) {
  page.value = Math.min(pageCount.value, Math.max(1, nextPage));
}
</script>

<template>
  <div class="editorial-page">
    <div class="editorial-wrap">
      <template v-if="creating">
        <div class="editorial-header flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p class="editorial-eyebrow">organizer</p>
            <h1 class="editorial-title">Create New Event</h1>
            <p class="editorial-subtitle">Create the event and its private registration campaign together. Registration stays in draft until you open it.</p>
          </div>
        </div>

        <form class="space-y-6" @submit.prevent="createEvent">
        <section class="editorial-panel overflow-hidden">
          <div class="border-b-2 border-dc-ink bg-dc-paper-warm px-5 py-4">
            <p class="editorial-eyebrow">event details</p>
            <h2 class="mt-1 text-2xl font-bold tracking-tight text-dc-ink">The meetup</h2>
            <p class="mt-1 max-w-2xl text-sm leading-6 text-dc-gray">This native event record becomes the source of truth for the organizer console and public website.</p>
          </div>
          <div class="grid gap-5 p-5 md:grid-cols-2">
            <div class="md:col-span-2">
              <label for="event-name" class="editorial-label">Name <span class="text-red-600">*</span></label>
              <input id="event-name" v-model="form.name" class="editorial-input" maxlength="160" required placeholder="DevCongress August Meetup">
            </div>
            <div class="md:col-span-2">
              <label for="event-description" class="editorial-label">Description <span class="text-red-600">*</span></label>
              <textarea id="event-description" v-model="form.description" class="editorial-input min-h-32 resize-none" required placeholder="What the meetup is about and who should attend." />
            </div>
            <AppDatePicker v-model="form.event_date" label="Starts at" mode="datetime" required />
            <AppDatePicker v-model="form.end_date" label="Ends at" mode="datetime" />
            <AppDropdown
              v-model="form.series_type"
              label="Event type"
              :options="seriesTypeOptions"
            />
            <div>
              <label for="event-location" class="editorial-label">Location <span class="text-red-600">*</span></label>
              <input id="event-location" v-model="form.location_name" class="editorial-input" required placeholder="Fido, Accra">
            </div>
            <div class="md:col-span-2 -mt-2">
              <p class="text-sm leading-6 text-dc-gray">{{ selectedSeriesTypeHelp }}</p>
            </div>
            <div>
              <label for="event-location-url" class="editorial-label">Google Maps link</label>
              <input
                id="event-location-url"
                v-model="form.location_url"
                type="url"
                class="editorial-input"
                maxlength="2048"
                inputmode="url"
                autocomplete="url"
                placeholder="https://maps.app.goo.gl/..."
              >
              <p class="mt-2 text-xs leading-5 text-dc-gray">Optional. Paste the Google Maps share link for the venue in Ghana.</p>
            </div>
            <div>
              <label for="event-stream-url" class="editorial-label">Video conference link</label>
              <input
                id="event-stream-url"
                v-model="form.stream_url"
                type="url"
                class="editorial-input"
                maxlength="2048"
                inputmode="url"
                autocomplete="url"
                placeholder="https://meet.google.com/..."
              >
              <p class="mt-2 text-xs leading-5 text-dc-gray">Optional for online or hybrid events. Add the link attendees will use to join.</p>
            </div>
            <EventCoverPicker
              v-model="form.cover"
              v-model:selected-file="coverFile"
              class="md:col-span-2"
              :disabled="createPending"
            />
            <div>
              <label for="event-slug" class="editorial-label">Website slug</label>
              <input
                id="event-slug"
                :value="form.slug"
                class="editorial-input font-mono"
                placeholder="generated-from-event-name"
                autocomplete="off"
                spellcheck="false"
                @input="handleSlugInput"
                @blur="normalizeWebsiteSlug"
              >
              <div class="mt-2 flex items-center justify-between gap-3">
                <p class="text-xs leading-5 text-dc-gray">
                  {{ slugWasEdited ? 'Custom slug. The event name will no longer replace it.' : 'Generated from the event name. You can edit it.' }}
                </p>
                <button
                  v-if="slugWasEdited"
                  type="button"
                  class="shrink-0 font-mono text-[10px] font-semibold uppercase tracking-wide text-dc-pink hover:text-dc-ink"
                  @click="resetWebsiteSlug"
                >
                  Use generated
                </button>
              </div>
            </div>
            <label class="flex items-center gap-3 rounded-md border border-dc-border bg-dc-paper-warm px-4 py-3">
              <input v-model="form.publish_to_website" type="checkbox" class="size-4 accent-dc-pink">
              <div>
                <span class="block text-sm font-bold text-dc-ink">Publish event shell now</span>
                <span class="block text-xs leading-5 text-dc-gray">Leave off to finish setup before it appears publicly.</span>
              </div>
            </label>
          </div>
        </section>

        <section class="editorial-panel overflow-hidden">
          <div class="border-b-2 border-dc-ink bg-dc-paper-warm px-5 py-4">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p class="editorial-eyebrow">registration</p>
                <h2 class="mt-1 text-2xl font-bold tracking-tight text-dc-ink">Free guest list</h2>
                <p class="mt-1 max-w-2xl text-sm leading-6 text-dc-gray">The campaign is created as a draft. Open it from the Registration tab when the public form is ready.</p>
              </div>
              <span class="rounded-sm border border-dc-border bg-white px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wide text-dc-gray">Draft</span>
            </div>
          </div>
          <div class="grid gap-5 p-5 md:grid-cols-3">
            <div>
              <label for="registration-capacity" class="editorial-label">Capacity</label>
              <input id="registration-capacity" v-model.number="form.registration_capacity" type="number" min="1" max="5000" class="editorial-input" required>
            </div>
            <AppDatePicker v-model="form.registration_opens_at" label="Opens at" mode="datetime" />
            <AppDatePicker v-model="form.registration_closes_at" label="Closes at" mode="datetime" />
            <label class="flex items-start gap-3 rounded-md border border-dc-border bg-dc-paper-warm px-4 py-3">
              <input v-model="form.auto_confirm" type="checkbox" class="mt-0.5 size-4 accent-dc-pink">
              <span>
                <span class="block text-sm font-bold text-dc-ink">Auto-confirm places</span>
                <span class="mt-1 block text-xs leading-5 text-dc-gray">Confirm guests until capacity is reached.</span>
              </span>
            </label>
            <label class="flex items-start gap-3 rounded-md border border-dc-border bg-dc-paper-warm px-4 py-3">
              <input v-model="form.waitlist_enabled" type="checkbox" class="mt-0.5 size-4 accent-dc-pink">
              <span>
                <span class="block text-sm font-bold text-dc-ink">Enable waitlist</span>
                <span class="mt-1 block text-xs leading-5 text-dc-gray">Keep collecting names after capacity.</span>
              </span>
            </label>
            <div class="rounded-md border border-dc-border bg-dc-paper-warm px-4 py-3">
              <p class="text-sm font-bold text-dc-ink">Check-in method</p>
              <p class="mt-1 text-xs leading-5 text-dc-gray">Organizers search by guest name or email. No QR code or confirmation code.</p>
            </div>
          </div>
        </section>

        <div v-if="createError" class="rounded-md border-2 border-red-500 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700" role="alert">{{ createError }}</div>
        <div class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <RouterLink :to="adminPath('events')" class="inline-flex min-h-12 items-center justify-center rounded-md border-2 border-dc-ink bg-white px-5 font-mono text-xs font-semibold uppercase tracking-wide text-dc-ink">Cancel</RouterLink>
          <button type="submit" class="editorial-action min-h-12 justify-center disabled:cursor-not-allowed disabled:opacity-60" :disabled="createPending">
            {{ createButtonLabel }}
          </button>
        </div>
        </form>
      </template>

      <template v-else>
        <div class="editorial-header flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p class="editorial-eyebrow">organizer</p>
            <h1 class="editorial-title">Event Management</h1>
            <p class="editorial-subtitle">Create events, move them through the program lifecycle, and jump into talk, speaker, or quiz operations.</p>
          </div>
          <RouterLink :to="adminPath('events/new')" class="editorial-action shrink-0 self-start sm:self-auto">CREATE EVENT</RouterLink>
        </div>

        <AdminEventsPageSkeleton v-if="loading" />
        <div v-else-if="eventsError" class="rounded-md border-2 border-red-500 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{{ eventsError }}</div>
        <template v-else>
          <section class="mb-4 rounded-lg border border-dc-border bg-dc-paper px-4 py-3 shadow-[0_1px_0_rgba(17,17,17,0.05)]">
            <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div class="shrink-0">
                <p class="editorial-eyebrow">lifecycle</p>
                <h2 class="mt-1 text-lg font-bold tracking-tight text-dc-ink">Event status</h2>
              </div>
              <ol class="flex min-w-0 flex-wrap gap-2">
                <li
                  v-for="(stage, index) in lifecycleStages"
                  :key="stage.status"
                  class="lifecycle-stage-card"
                >
                  <button
                    type="button"
                    class="lifecycle-stage-trigger"
                    :aria-describedby="`lifecycle-stage-${stage.status}`"
                  >
                    <span class="text-dc-pink">{{ index + 1 }}</span>
                    <span class="text-dc-ink">{{ stage.label }}</span>
                  </button>
                  <div
                    :id="`lifecycle-stage-${stage.status}`"
                    class="lifecycle-stage-popover"
                    :class="lifecyclePopoverPositionClass(index)"
                    role="tooltip"
                  >
                    <div class="flex items-start justify-between gap-4">
                      <p class="font-mono text-[11px] font-semibold uppercase tracking-wide text-dc-pink">Stage {{ index + 1 }}</p>
                      <span class="rounded-sm border border-dc-border bg-dc-paper-warm px-2 py-0.5 font-mono text-[10px] font-semibold uppercase text-dc-gray">
                        {{ stage.actionLabel }}
                      </span>
                    </div>
                    <h3 class="mt-2 text-sm font-bold uppercase tracking-wide text-dc-ink">{{ stage.label }}</h3>
                    <p class="mt-2 text-sm font-medium leading-5 text-dc-gray">{{ stage.description }}</p>
                    <p class="mt-3 border-t border-dc-border pt-3 text-xs font-semibold leading-5 text-dc-ink">
                      {{ stage.organizerMove }}
                    </p>
                  </div>
                </li>
              </ol>
            </div>
          </section>

        <div class="ops-panel overflow-visible">
          <div class="border-b border-dc-border bg-dc-paper-warm px-4 py-3">
            <div class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p class="editorial-eyebrow">filter</p>
                <p class="mt-1 text-sm font-medium text-dc-gray">
                  {{ filteredEvents.length }} event{{ filteredEvents.length === 1 ? '' : 's' }} in {{ selectedMonthLabel.toLowerCase() }}
                </p>
              </div>
              <div class="grid gap-3 sm:grid-cols-2 lg:w-[26rem]">
                <AppDropdown
                  v-model="selectedMonth"
                  label="Month"
                  :options="monthOptions"
                  density="compact"
                  menu-align="right"
                />
                <AppDropdown
                  v-model="selectedSeriesFilter"
                  label="Type"
                  :options="seriesFilterOptions"
                  density="compact"
                  menu-align="right"
                />
              </div>
            </div>
          </div>
          <div class="overflow-x-auto">
            <div class="min-w-[900px]">
              <div class="ops-panel-header event-list-grid">
                <div class="ops-label">Event</div>
                <div class="ops-label">Date</div>
                <div class="ops-label">Status</div>
                <div class="ops-label text-right">Actions</div>
              </div>
              <div>
                <div v-if="filteredEvents.length === 0" class="px-5 py-8 text-sm font-medium text-dc-gray">
                  No events match this filter.
                </div>
                <template v-else>
                  <div
                    v-for="event in paginatedEvents"
                    :key="event.id"
                    class="ops-row event-list-grid min-h-[64px]"
                    role="link"
                    tabindex="0"
                    :aria-label="`Open ${event.name} and continue to ${statusActionLabel(event.status)}`"
                    @click="openEventNextStep(event)"
                    @keydown.enter.prevent="openEventNextStep(event)"
                    @keydown.space.prevent="openEventNextStep(event)"
                  >
                    <div class="flex min-w-0 items-center">
                      <div class="min-w-0">
                        <div class="flex min-w-0 flex-wrap items-center gap-2">
                          <div class="event-list-title">{{ formatEventMonth(event.event_date) }}</div>
                          <span
                            class="rounded-sm border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide"
                            :class="eventKindClass(event)"
                          >
                            {{ eventKindLabel(event) }}
                          </span>
                          <span
                            v-if="isDraftEvent(event)"
                            class="rounded-sm border border-dc-yellow bg-dc-yellow/10 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-dc-ink"
                          >
                            Draft
                          </span>
                        </div>
                        <div class="event-list-meta">{{ event.name }}</div>
                      </div>
                    </div>
                    <div class="event-list-date">{{ formatDate(event.event_date) }}</div>
                    <div class="event-list-status">
                      <div class="event-list-dots" :aria-label="`Step ${lifecycleIndex(event.status) + 1} of ${lifecycleStages.length}`">
                        <span
                          v-for="(_, index) in lifecycleStages"
                          :key="index"
                          class="event-list-dot"
                          :class="{
                            'event-list-dot--done': index < lifecycleIndex(event.status),
                            'event-list-dot--current': index === lifecycleIndex(event.status),
                          }"
                        />
                      </div>
                      <span class="event-list-status-label">{{ statusMeta(event.status).label }}</span>
                    </div>
                    <div class="event-list-actions">
                      <span class="event-list-primary-action">{{ statusActionLabel(event.status) }} &rarr;</span>
                      <button
                        type="button"
                        class="event-list-remove-action motion-press"
                        :aria-label="`Remove ${event.name}`"
                        @click.stop="requestDeleteEvent(event)"
                        @keydown.stop
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </template>
              </div>
            </div>
          </div>
          <div class="pagination-footer">
            <p class="pagination-summary">
              Showing {{ pageStart }}-{{ pageEnd }} of {{ filteredEvents.length }}
            </p>
            <div class="pagination-controls">
              <button
                class="pagination-button"
                :disabled="page === 1"
                @click="goToPage(page - 1)"
              >
                <span aria-hidden="true">‹</span>
                Prev
              </button>
              <span class="pagination-count" aria-live="polite">
                Page {{ page }} of {{ pageCount }}
              </span>
              <button
                class="pagination-button"
                :disabled="page === pageCount"
                @click="goToPage(page + 1)"
              >
                Next
                <span aria-hidden="true">›</span>
              </button>
            </div>
          </div>
        </div>
        </template>
      </template>
    </div>
    <ConfirmDialog
      :open="Boolean(eventPendingDelete)"
      title="Remove event?"
      :message="eventPendingDelete ? removalMessage(eventPendingDelete) : ''"
      confirm-label="Remove event"
      busy-label="Removing..."
      cancel-label="Keep event"
      danger
      :busy="deletePending"
      @cancel="cancelDeleteEvent"
      @confirm="confirmDeleteEvent"
    />
  </div>
</template>
