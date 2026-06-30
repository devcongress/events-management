<script setup lang="ts">
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppDropdown from '@/src/components/AppDropdown.vue';
import ConfirmDialog from '@/src/components/ui/ConfirmDialog.vue';
import AdminEventsPageSkeleton from '@/src/components/ui/page-skeletons/AdminEventsPageSkeleton.vue';
import { deleteEventById, fetchEvents, importLumaEventUrl, previewLumaEventUrl, queryKeys, type LumaPreviewResponse } from '@/src/lib/api';
import { EVENT_SERIES_HELP_TEXT, EVENT_SERIES_LABELS, EVENT_SERIES_TYPES, inferEventSeriesType, resolveEventSeriesType, type EventSeriesType } from '@/lib/event-series';
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
const lumaPreviewing = ref(false);
const lumaImporting = ref(false);
const lumaError = ref<string | null>(null);
const lumaEventUrl = ref('');
const lumaEventUrlInput = ref<HTMLInputElement | null>(null);
const lumaSeriesType = ref<EventSeriesType>('monthly');
const lumaPreview = ref<LumaPreviewResponse | null>(null);
const lumaPreviewUrl = ref('');
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
const lumaPreviewLocked = computed(() => Boolean(lumaPreview.value));
const previewPublicEventHrefValue = computed(() => previewPublicEventHref() ?? undefined);
const lumaPublishedConflict = computed(() => Boolean(
  lumaPreview.value?.already_imported && lumaPreview.value?.existing_event?.publish_to_website,
));
const seriesTypeOptions = EVENT_SERIES_TYPES.map((value) => ({ value, label: EVENT_SERIES_LABELS[value] }));
const seriesFilterOptions = [
  { value: 'all', label: 'All types' },
  ...EVENT_SERIES_TYPES.map((value) => ({ value, label: EVENT_SERIES_LABELS[value] })),
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
  const matchesSeries = selectedSeriesFilter.value === 'all' || resolveEventSeriesType(event) === selectedSeriesFilter.value;

  return matchesMonth && matchesSeries;
}));
const pageCount = computed(() => Math.max(1, Math.ceil(filteredEvents.value.length / pageSize)));
const paginatedEvents = computed(() => filteredEvents.value.slice((page.value - 1) * pageSize, page.value * pageSize));
const pageStart = computed(() => (filteredEvents.value.length === 0 ? 0 : (page.value - 1) * pageSize + 1));
const pageEnd = computed(() => Math.min(filteredEvents.value.length, page.value * pageSize));
const selectedSeriesTypeHelp = computed(() => EVENT_SERIES_HELP_TEXT[lumaSeriesType.value]);

function focusLumaEventUrlInput() {
  if (lumaPreviewLocked.value) return;
  lumaEventUrlInput.value?.focus();
}

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

onMounted(() => {
  void nextTick(focusLumaEventUrlInput);
});

watch([selectedMonth, selectedSeriesFilter], () => {
  page.value = 1;
});

async function handleLumaPreview() {
  const url = lumaEventUrl.value.trim();
  if (!url) {
    lumaError.value = 'Paste a public Luma event URL first.';
    return;
  }

  lumaPreviewing.value = true;
  lumaError.value = null;
  lumaPreview.value = null;

  try {
    lumaPreview.value = await previewLumaEventUrl(url, lumaSeriesType.value);
    if (lumaPreview.value.preview.series_type) {
      lumaSeriesType.value = lumaPreview.value.preview.series_type;
    }
    lumaPreviewUrl.value = url;
  } catch (previewError) {
    lumaError.value = previewError instanceof Error ? previewError.message : 'Unable to preview Luma event.';
    notify.error(lumaError.value);
  } finally {
    lumaPreviewing.value = false;
  }
}

async function confirmLumaImport() {
  const url = lumaPreviewUrl.value || lumaEventUrl.value.trim();
  if (!url) return;

  lumaImporting.value = true;
  lumaError.value = null;

  try {
    const payload = await importLumaEventUrl(url, lumaSeriesType.value);
    await refreshEventQueries();
    notify.success(payload.already_imported ? 'Luma event was already imported.' : 'Imported Luma event.');
    lumaEventUrl.value = '';
    lumaPreviewUrl.value = '';
    lumaPreview.value = null;
    await router.push({
      path: adminPath(`events/${payload.event.id}`),
      query: payload.event.series_type ? undefined : { seriesType: lumaSeriesType.value },
    });
  } catch (importError) {
    lumaError.value = importError instanceof Error ? importError.message : 'Unable to import Luma event.';
    notify.error(lumaError.value);
  } finally {
    lumaImporting.value = false;
  }
}

async function removeAndReimportLumaEvent() {
  const existingEvent = lumaPreview.value?.existing_event;
  const url = lumaPreviewUrl.value || lumaEventUrl.value.trim();
  if (!existingEvent || !url) return;

  lumaImporting.value = true;
  lumaError.value = null;

  try {
    await deleteEventById(existingEvent.id);
    const payload = await importLumaEventUrl(url, lumaSeriesType.value);
    await refreshEventQueries();
    notify.success('Published event removed and re-imported as a fresh draft.');
    lumaEventUrl.value = '';
    lumaPreviewUrl.value = '';
    lumaPreview.value = null;
    await router.push(adminPath(`events/${payload.event.id}`));
  } catch (error) {
    lumaError.value = error instanceof Error ? error.message : 'Unable to remove and re-import Luma event.';
    notify.error(lumaError.value);
  } finally {
    lumaImporting.value = false;
  }
}

function clearLumaPreview() {
  lumaPreview.value = null;
  lumaPreviewUrl.value = '';
}

function slugifyPreviewName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'meetup-preview';
}

function previewPublicEventLocation() {
  if (!lumaPreview.value) return null;

  const existingSlug = lumaPreview.value.existing_event?.slug?.trim();
  const slug = existingSlug || slugifyPreviewName(lumaPreview.value.preview.name);

  if (lumaPreview.value.already_imported) {
    return { path: `/events/${slug}` };
  }

  const eventUrl = lumaPreviewUrl.value || lumaEventUrl.value.trim();
  if (!eventUrl) return null;

  return {
    path: `/events/${slug}`,
    query: {
      preview: 'luma',
      eventUrl,
      seriesType: lumaSeriesType.value,
      returnTo: route.fullPath,
      returnLabel: 'Import event',
    },
  };
}

function previewPublicEventHref() {
  const location = previewPublicEventLocation();
  if (!location) return null;
  return router.resolve(location).href;
}

async function openExistingLumaEvent() {
  if (!lumaPreview.value?.existing_event) return;
  await router.push(adminPath(`events/${lumaPreview.value.existing_event.id}`));
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
  return EVENT_SERIES_LABELS[resolveEventSeriesType(event)];
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

function isImportedEvent(event: CommunityEvent): boolean {
  return event.external_source === 'luma';
}

function isDraftEvent(event: CommunityEvent): boolean {
  return !event.publish_to_website;
}

function removalMessage(event: CommunityEvent): string {
  const eventMonth = formatEventMonth(event.event_date);
  if (isImportedEvent(event)) {
    return `This removes the imported ${eventMonth} event from the organizer event list so you can import it again with a cleaner version later.`;
  }

  return `This removes ${eventMonth} from the organizer event list for now.`;
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

function statusActionPath(event: CommunityEvent): string {
  const subsectionByStatus: Record<EventStatus, string> = {
    draft: 'speakers',
    cfp_open: 'speakers',
    cfp_closed: 'talks',
    upcoming: '',
    live: 'quiz/live',
    completed: 'attendance',
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
            <p class="editorial-subtitle">Import from Luma now, or keep the manual form shape visible while it is being finished.</p>
          </div>
        </div>

        <section class="editorial-panel mb-6 overflow-hidden">
          <div class="border-b-2 border-dc-ink bg-dc-paper-warm px-5 py-4">
            <p class="editorial-eyebrow">active path</p>
            <h2 class="mt-1 text-2xl font-black tracking-tight text-dc-ink">Import from Luma Event</h2>
            <p class="mt-1 max-w-2xl text-sm leading-6 text-dc-gray">Paste the public Luma event URL and we will pull in the event shell from the details Luma exposes.</p>
          </div>
          <form class="space-y-4 p-5" @submit.prevent="handleLumaPreview">
            <div v-if="lumaError" class="rounded-md border-2 border-red-500 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{{ lumaError }}</div>
            <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
              <div>
                <label class="editorial-label">Public Luma event URL</label>
                <input
                  ref="lumaEventUrlInput"
                  v-model="lumaEventUrl"
                  type="url"
                  required
                  class="editorial-input font-mono"
                  placeholder="https://luma.com/..."
                  :disabled="lumaPreviewing || lumaImporting || lumaPreviewLocked"
                />
              </div>
              <AppDropdown
                v-model="lumaSeriesType"
                label="Series type"
                :options="seriesTypeOptions"
                :disabled="lumaPreviewing || lumaImporting"
              />
              <button type="submit" class="editorial-action min-h-[54px] justify-center disabled:cursor-not-allowed disabled:opacity-60" :disabled="lumaPreviewing || lumaImporting || lumaPreviewLocked">
                {{ lumaPreviewing ? 'PREVIEWING...' : 'PREVIEW EVENT' }}
              </button>
            </div>
            <p class="text-sm leading-6 text-dc-gray">{{ selectedSeriesTypeHelp }}</p>
            <p class="text-sm leading-6 text-dc-gray">Use the event-page preview to see how the imported shell will feel on the public site. Timeline, speakers, gallery, and recap details can be filled in later.</p>

            <section v-if="lumaPreview" class="rounded-md border border-dc-border bg-dc-paper-warm p-4">
              <p class="editorial-eyebrow mb-2">import summary</p>
              <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                <div class="min-w-0">
                  <h3 class="text-2xl font-black leading-tight text-dc-ink">{{ lumaPreview.preview.name }}</h3>
                  <p class="mt-2 font-mono text-sm font-bold uppercase text-dc-gray">{{ formatDate(lumaPreview.preview.event_date) }}</p>
                  <div class="mt-3 flex flex-wrap gap-2">
                    <span class="rounded-sm border border-dc-border px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wide text-dc-gray">
                      {{ EVENT_SERIES_LABELS[lumaSeriesType] }}
                    </span>
                  </div>
                  <p class="mt-2 text-sm leading-6 text-dc-gray">{{ lumaPreview.preview.location?.label ?? lumaPreview.preview.location?.name ?? 'Location not provided' }}</p>
                  <p v-if="lumaPreview.preview.description" class="mt-3 line-clamp-3 text-sm leading-6 text-dc-gray">{{ lumaPreview.preview.description }}</p>
                  <a
                    v-if="lumaPreview.preview.registration_url"
                    :href="lumaPreview.preview.registration_url"
                    target="_blank"
                    rel="noreferrer"
                    class="mt-3 inline-flex font-mono text-xs font-bold uppercase text-dc-pink underline decoration-dc-yellow decoration-2 underline-offset-4"
                  >
                    View Luma page
                  </a>
                  <p v-if="lumaPublishedConflict" class="mt-3 text-sm font-semibold text-dc-gray">This Luma event is already published in community. Remove it and re-import if you want a fresh draft.</p>
                  <p v-else-if="lumaPreview.already_imported" class="mt-3 text-sm font-semibold text-dc-gray">This Luma event already exists in the event list.</p>
                </div>
                <div class="flex flex-col gap-2 sm:flex-row lg:flex-col">
                  <a
                    v-if="previewPublicEventHrefValue"
                    :href="previewPublicEventHrefValue"
                    target="_blank"
                    rel="noreferrer"
                    class="editorial-action min-h-12 justify-center"
                  >
                    PREVIEW EVENT PAGE
                  </a>
                  <button
                    v-if="lumaPreview.already_imported"
                    type="button"
                    class="rounded-md border-2 border-dc-ink bg-white px-4 py-3 font-mono text-xs font-bold uppercase tracking-wide text-dc-ink"
                    @click="openExistingLumaEvent"
                  >
                    OPEN ORGANIZER EVENT
                  </button>
                  <button
                    v-if="lumaPublishedConflict"
                    type="button"
                    class="editorial-action min-h-12 justify-center disabled:cursor-not-allowed disabled:opacity-60"
                    :disabled="lumaImporting"
                    @click="removeAndReimportLumaEvent"
                  >
                    {{ lumaImporting ? 'REMOVING...' : 'REMOVE AND RE-IMPORT' }}
                  </button>
                  <button
                    v-else-if="!lumaPreview.already_imported"
                    type="button"
                    class="editorial-action min-h-12 justify-center disabled:cursor-not-allowed disabled:opacity-60"
                    :disabled="lumaImporting"
                    @click="confirmLumaImport"
                  >
                    {{ lumaImporting ? 'IMPORTING...' : 'IMPORT EVENT' }}
                  </button>
                  <button
                    type="button"
                    class="rounded-md border-2 border-dc-ink bg-white px-4 py-3 font-mono text-xs font-bold uppercase tracking-wide text-dc-ink"
                    :disabled="lumaImporting"
                    @click="clearLumaPreview"
                  >
                    Clear
                  </button>
                </div>
              </div>
            </section>
          </form>
        </section>

        <section class="editorial-panel relative overflow-hidden p-5 sm:p-6">
          <div class="coming-soon-ribbon">Coming soon</div>
          <div class="pl-16 sm:pl-20">
            <p class="editorial-eyebrow">manual path</p>
            <h2 class="mt-1 text-2xl font-black tracking-tight text-dc-ink">Event Form</h2>
            <p class="mt-1 text-sm leading-6 text-dc-gray">This manual setup flow is visible for shape and review, but disabled while Luma import is the supported event creation path.</p>
          </div>
          <div class="mt-5 grid gap-3 opacity-50 md:grid-cols-4">
            <div class="md:col-span-2">
              <label class="editorial-label">Name <span class="text-red-600">*</span></label>
              <div class="h-12 rounded-md border-2 border-dc-ink bg-white" />
            </div>
            <div>
              <label class="editorial-label">Date <span class="text-red-600">*</span></label>
              <div class="h-12 rounded-md border-2 border-dc-ink bg-white" />
            </div>
            <div>
              <label class="editorial-label">Location</label>
              <div class="h-12 rounded-md border-2 border-dc-ink bg-white" />
            </div>
            <div class="md:col-span-3">
              <label class="editorial-label">Description</label>
              <div class="h-12 rounded-md border-2 border-dc-ink bg-white" />
            </div>
            <div class="flex items-end">
              <button type="button" disabled class="editorial-action min-h-12 w-full justify-center disabled:cursor-not-allowed disabled:opacity-50">CREATE EVENT</button>
            </div>
          </div>
        </section>
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
                <h2 class="mt-1 text-lg font-black tracking-tight text-dc-ink">Event status</h2>
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
                      <p class="font-mono text-[11px] font-black uppercase tracking-wide text-dc-pink">Stage {{ index + 1 }}</p>
                      <span class="rounded-sm border border-dc-border bg-dc-paper-warm px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-dc-gray">
                        {{ stage.actionLabel }}
                      </span>
                    </div>
                    <h3 class="mt-2 text-sm font-black uppercase tracking-wide text-dc-ink">{{ stage.label }}</h3>
                    <p class="mt-2 text-sm font-semibold leading-5 text-dc-gray">{{ stage.description }}</p>
                    <p class="mt-3 border-t border-dc-border pt-3 text-xs font-semibold leading-5 text-dc-ink">
                      {{ stage.organizerMove }}
                    </p>
                  </div>
                </li>
              </ol>
            </div>
          </section>

        <div class="ops-panel overflow-visible">
          <div class="border-b border-dc-border bg-white px-4 py-3">
            <div class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p class="editorial-eyebrow">filter</p>
                <p class="mt-1 text-sm font-semibold text-dc-gray">
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
                <div v-if="filteredEvents.length === 0" class="px-5 py-8 text-sm font-semibold text-dc-gray">
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
                            class="rounded-sm border px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide"
                            :class="eventKindClass(event)"
                          >
                            {{ eventKindLabel(event) }}
                          </span>
                          <span
                            v-if="isDraftEvent(event)"
                            class="rounded-sm border border-dc-yellow bg-dc-yellow/10 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide text-dc-ink"
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
