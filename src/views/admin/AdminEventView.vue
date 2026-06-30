<script setup lang="ts">
import { useQueryClient } from '@tanstack/vue-query';
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { canonicalizeSystemDesignSchedule, hasSystemDesignTitleMarker } from '@/lib/system-design';
import { resolveEventStatus } from '@/lib/event-status';
import AppDropdown from '@/src/components/AppDropdown.vue';
import AdminEventOverviewPageSkeleton from '@/src/components/ui/page-skeletons/AdminEventOverviewPageSkeleton.vue';
import { EVENT_SERIES_HELP_TEXT, EVENT_SERIES_LABELS, EVENT_SERIES_TYPES, resolveEventSeriesType, type EventSeriesType } from '@/lib/event-series';
import { queryKeys } from '@/src/lib/api';
import {
  compressionSavingsPercent,
  compressMeetupImageForUpload,
  IMAGE_UPLOAD_ACCEPT,
  uploadEventMedia,
  validateMeetupImageFile,
} from '@/src/lib/meetup-media-client';
import { notify } from '@/src/lib/notify';
import type { Event as CommunityEvent, EventChecklistItem, EventChecklistPhase, EventStatus, PublicMeetupScheduleItem } from '@/types';

const route = useRoute();
const queryClient = useQueryClient();
const event = ref<CommunityEvent | null>(null);
const checklist = ref<EventChecklistItem[]>([]);
const loading = ref(true);
const checklistSavingId = ref<string | null>(null);
const checklistDisablingId = ref<string | null>(null);
const publishSaving = ref(false);
const publishError = ref<string | null>(null);
const descriptionEditing = ref(false);
const descriptionSaving = ref(false);
const descriptionError = ref<string | null>(null);
const descriptionDraft = ref('');
const outlineEditing = ref(false);
const outlineSaving = ref(false);
const outlineError = ref<string | null>(null);
const outlineDrafts = ref<PublicMeetupScheduleItem[]>([]);
const outlineBulkText = ref('');
const seriesTypeDraft = ref<EventSeriesType>('monthly');
const seriesTypeSaving = ref(false);
const seriesTypeError = ref<string | null>(null);
const photoSaving = ref(false);
const photoError = ref<string | null>(null);
const photoUrl = ref('');
const photoType = ref<'image' | 'folder'>('folder');
const mediaUploadPurpose = ref<'cover' | 'photo' | null>(null);
const photoTypeOptions = [
  { value: 'folder', label: 'Gallery / folder' },
  { value: 'image', label: 'Single image' },
];
const outlineTypeOptions: { value: PublicMeetupScheduleItem['type']; label: string }[] = [
  { value: 'talk', label: 'Talk' },
  { value: 'system_design', label: 'System design' },
  { value: 'workshop', label: 'Workshop' },
  { value: 'panel', label: 'Panel' },
  { value: 'open_discussion', label: 'Open discussion' },
  { value: 'networking', label: 'Networking' },
  { value: 'break', label: 'Break' },
];
const checklistPhaseOrder: EventChecklistPhase[] = ['setup', 'cfp', 'program', 'event_day', 'post_event'];
const checklistPhaseLabels: Record<EventChecklistPhase, string> = {
  setup: 'Event setup',
  cfp: 'Speaker / CFP',
  program: 'Program prep',
  event_day: 'Event day',
  post_event: 'Post-event',
};
const availableChecklistFeatures = {
  cfp: false,
  speakerAccess: false,
  quiz: false,
  talkManagement: false,
  systemDesign: true,
  eventDayStart: false,
  attendance: true,
  feedback: true,
  archive: true,
};

type ChecklistViewItem = EventChecklistItem & {
  label: string;
  description: string;
};

function checklistItemAvailable(item: EventChecklistItem): boolean {
  switch (item.label) {
    case 'Open CFP':
    case 'Close CFP':
      return availableChecklistFeatures.cfp;
    case 'Confirm speakers and talks':
      return availableChecklistFeatures.speakerAccess || availableChecklistFeatures.talkManagement;
    case 'Collect slides and prep quiz':
      return availableChecklistFeatures.talkManagement || availableChecklistFeatures.quiz;
    case 'Prepare system design session':
      return availableChecklistFeatures.systemDesign;
    case 'Start event day':
      return availableChecklistFeatures.eventDayStart;
    case 'Run live quiz':
      return availableChecklistFeatures.quiz;
    case 'Import attendance CSV':
      return availableChecklistFeatures.attendance;
    case 'Open and review feedback':
      return availableChecklistFeatures.feedback;
    case 'Publish archive':
      return availableChecklistFeatures.archive;
    default:
      return true;
  }
}

function checklistViewItem(item: EventChecklistItem): ChecklistViewItem {
  if (item.label === 'Confirm speakers and talks' && !availableChecklistFeatures.speakerAccess) {
    return {
      ...item,
      label: 'Confirm talks',
      description: 'Accept talks and make the program clear.',
    };
  }

  if (item.label === 'Collect slides and prep quiz' && !availableChecklistFeatures.quiz) {
    return {
      ...item,
      label: 'Collect talk materials',
      description: 'Use talk management and archive form links to gather post-event talk details.',
    };
  }

  return item;
}

function checklistViewOrder(item: ChecklistViewItem): number {
  if (item.label === 'Import attendance CSV') {
    return Number.MAX_SAFE_INTEGER;
  }

  return item.order_index;
}

const availableChecklist = computed<ChecklistViewItem[]>(() => checklist.value
  .filter(checklistItemAvailable)
  .map(checklistViewItem)
  .sort((a, b) => checklistViewOrder(a) - checklistViewOrder(b)));
const activeChecklist = computed(() => availableChecklist.value.filter((item) => !item.disabled_at));

const checklistProgress = computed(() => {
  const completed = activeChecklist.value.filter((item) => item.completed).length;
  const total = activeChecklist.value.length;

  return {
    completed,
    total,
    percent: total > 0 ? Math.round((completed / total) * 100) : 0,
  };
});
const nextChecklistItem = computed(() => activeChecklist.value.find((item) => !item.completed) ?? null);
const eventPhotos = computed(() => event.value?.photos ?? []);
const isDraftEvent = computed(() => event.value?.status === 'draft');
const isPublishedEvent = computed(() => Boolean(event.value?.publish_to_website));
const checklistByPhase = computed(() => checklistPhaseOrder
  .map((phase) => ({
    phase,
    label: checklistPhaseLabels[phase],
    items: availableChecklist.value.filter((item) => item.phase === phase),
  }))
  .filter((group) => group.items.length > 0));
const currentEventId = computed(() => String(route.params.eventId));
const eventSeriesTypeOptions = EVENT_SERIES_TYPES.map((value) => ({ value, label: EVENT_SERIES_LABELS[value] }));
const selectedSeriesTypeHelp = computed(() => EVENT_SERIES_HELP_TEXT[seriesTypeDraft.value]);
const eventOutline = computed(() => canonicalizeSystemDesignSchedule(event.value?.schedule ?? []));

function broadcastPublicMeetupsRefresh() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('dc-public-meetups-refresh'));
  window.localStorage.setItem('dc-public-meetups-refresh', String(Date.now()));
}

async function invalidateEventQueries() {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.events }),
    queryClient.invalidateQueries({ queryKey: queryKeys.overview }),
    queryClient.invalidateQueries({ queryKey: queryKeys.publicMeetups }),
    queryClient.invalidateQueries({ queryKey: ['public-meetup'] }),
    queryClient.invalidateQueries({ queryKey: queryKeys.event(currentEventId.value) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.eventChecklist(currentEventId.value) }),
  ]);
  broadcastPublicMeetupsRefresh();
}

function syncDescriptionDraft() {
  descriptionDraft.value = event.value?.description ?? '';
}

function createOutlineDraft(item?: Partial<PublicMeetupScheduleItem>): PublicMeetupScheduleItem {
  return {
    time: item?.time ?? '',
    title: item?.title ?? '',
    type: item?.type ?? 'talk',
    lead: item?.lead ?? null,
    description: item?.description ?? null,
    system_design_title: item?.system_design_title ?? null,
    resources: item?.resources ?? [],
  };
}

function syncOutlineDrafts() {
  outlineDrafts.value = eventOutline.value.map((item) => createOutlineDraft(item));
}

function inferOutlineType(title: string): PublicMeetupScheduleItem['type'] {
  const normalized = title.toLowerCase();
  if (normalized.includes('break')) return 'break';
  if (normalized.includes('network')) return 'networking';
  if (normalized.includes('system design') || normalized.includes('architecture scenario')) return 'system_design';
  if (normalized.includes('demo')) return 'workshop';
  if (normalized.includes('panel')) return 'panel';
  if (normalized.includes('session') || normalized.includes('address')) return 'open_discussion';
  return 'talk';
}

function parseOutlineLine(rawLine: string): PublicMeetupScheduleItem | null {
  const line = rawLine
    .replace(/\u200b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!line || /^program outline$/i.test(line)) return null;

  const timeMatch = line.match(/(?:\s+[-–—]\s*)?(\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*[-–—]\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*$/i);
  const time = timeMatch?.[1]?.replace(/\s*[-–—]\s*/g, ' - ').trim() ?? 'TBD';
  let titlePart = timeMatch ? line.slice(0, timeMatch.index).trim() : line;
  let lead: string | null = null;

  const byLeadMatch = titlePart.match(/^(.*)\s+\bby\b\s+(.+)$/i);
  const dashLeadMatch = titlePart.match(/^(.*)\s+[-–—]\s+(.+)$/);

  if (byLeadMatch?.[1] && byLeadMatch[2]) {
    titlePart = byLeadMatch[1].trim();
    lead = byLeadMatch[2].trim();
  } else if (dashLeadMatch?.[1] && dashLeadMatch[2]) {
    titlePart = dashLeadMatch[1].trim();
    lead = dashLeadMatch[2].trim();
  }

  if (!titlePart) return null;

  return createOutlineDraft({
    time,
    title: titlePart,
    lead,
    type: inferOutlineType(titlePart),
  });
}

function parseBulkOutline() {
  const parsed = outlineBulkText.value
    .split(/\r?\n/)
    .map(parseOutlineLine)
    .filter((item): item is PublicMeetupScheduleItem => Boolean(item));

  if (parsed.length === 0) {
    outlineError.value = 'Paste at least one outline item with a title.';
    return;
  }

  outlineDrafts.value = parsed;
  outlineBulkText.value = '';
  outlineError.value = null;
}

function syncSeriesTypeDraft() {
  if (!event.value) return;
  seriesTypeDraft.value = resolveEventSeriesType(event.value);
}

async function fetchOverview() {
  const eventId = route.params.eventId;
  const [eventResponse, checklistResponse] = await Promise.all([
    fetch(`/api/events/${eventId}`),
    fetch(`/api/events/${eventId}/checklist`),
  ]);

  if (eventResponse.ok) {
    event.value = await eventResponse.json();
    syncDescriptionDraft();
    syncOutlineDrafts();
    syncSeriesTypeDraft();
  }
  if (checklistResponse.ok) {
    const payload = await checklistResponse.json();
    checklist.value = payload.items ?? [];
  }
  loading.value = false;
}

function publishStatusForEvent(currentEvent: CommunityEvent): EventStatus {
  return resolveEventStatus({ ...currentEvent, status: 'upcoming' });
}

async function publishEvent() {
  if (!event.value || publishSaving.value) return;

  const publishPayload: {
    publish_to_website: boolean;
    status: EventStatus;
    schedule?: PublicMeetupScheduleItem[];
  } = {
    publish_to_website: true,
    status: isDraftEvent.value ? publishStatusForEvent(event.value) : event.value.status,
  };

  if (outlineEditing.value) {
    try {
      publishPayload.schedule = normalizeOutlineDrafts();
    } catch (error) {
      outlineError.value = error instanceof Error ? error.message : 'Check the outline rows before publishing.';
      publishError.value = 'Fix the program outline before publishing.';
      notify.error(publishError.value);
      return;
    }
  }

  publishSaving.value = true;
  publishError.value = null;

  try {
    const response = await fetch(`/api/events/${route.params.eventId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(publishPayload),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error ?? 'Failed to publish event');
    }

    event.value = await response.json();
    if (outlineEditing.value) {
      syncOutlineDrafts();
      outlineEditing.value = false;
      outlineError.value = null;
    }
    await invalidateEventQueries();
    notify.success('Event published to community');
  } catch (error) {
    publishError.value = error instanceof Error ? error.message : 'Failed to publish event';
    notify.error(publishError.value);
  } finally {
    publishSaving.value = false;
  }
}

function startDescriptionEdit() {
  syncDescriptionDraft();
  descriptionError.value = null;
  descriptionEditing.value = true;
}

function cancelDescriptionEdit() {
  if (descriptionSaving.value) return;
  syncDescriptionDraft();
  descriptionError.value = null;
  descriptionEditing.value = false;
}

async function saveDescription() {
  if (!event.value || descriptionSaving.value) return;

  const nextDescription = descriptionDraft.value.trim();
  if (!nextDescription) {
    descriptionError.value = 'Add the public About copy before saving.';
    return;
  }

  descriptionSaving.value = true;
  descriptionError.value = null;

  try {
    const response = await fetch(`/api/events/${route.params.eventId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: nextDescription }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error ?? 'Failed to update the event description');
    }

    event.value = await response.json();
    syncDescriptionDraft();
    descriptionEditing.value = false;
    await invalidateEventQueries();
    notify.success('About copy updated');
  } catch (error) {
    descriptionError.value = error instanceof Error ? error.message : 'Failed to update the event description';
    notify.error(descriptionError.value);
  } finally {
    descriptionSaving.value = false;
  }
}

function startOutlineEdit() {
  syncOutlineDrafts();
  if (outlineDrafts.value.length === 0) {
    outlineDrafts.value = [createOutlineDraft()];
  }
  outlineBulkText.value = '';
  outlineError.value = null;
  outlineEditing.value = true;
}

function cancelOutlineEdit() {
  if (outlineSaving.value) return;
  syncOutlineDrafts();
  outlineBulkText.value = '';
  outlineError.value = null;
  outlineEditing.value = false;
}

function addOutlineRow() {
  outlineDrafts.value.push(createOutlineDraft());
}

function addSystemDesignScenario() {
  outlineDrafts.value.push(createOutlineDraft({
    time: 'TBD',
    title: 'Monthly architecture scenario',
    type: 'system_design',
    lead: null,
    description: 'Paste the scenario brief here so attendees can understand the design prompt before opening the deck.',
    resources: [{ title: 'Prompt deck', url: '' }],
  }));
}

function removeOutlineRow(index: number) {
  outlineDrafts.value.splice(index, 1);
  if (outlineDrafts.value.length === 0) {
    outlineDrafts.value.push(createOutlineDraft());
  }
}

function updateOutlineLead(index: number, value: string) {
  const item = outlineDrafts.value[index];
  if (!item) return;
  item.lead = value;
}

function updateOutlineLeadFromEvent(index: number, inputEvent: Event) {
  updateOutlineLead(index, inputEvent.target instanceof HTMLInputElement ? inputEvent.target.value : '');
}

function updateOutlineDescription(index: number, value: string) {
  const item = outlineDrafts.value[index];
  if (!item) return;
  item.description = value;
}

function updateOutlineDescriptionFromEvent(index: number, inputEvent: Event) {
  updateOutlineDescription(index, inputEvent.target instanceof HTMLTextAreaElement ? inputEvent.target.value : '');
}

function primaryResource(item: PublicMeetupScheduleItem) {
  return item.resources[0] ?? { title: '', url: '' };
}

function updateOutlineResourceTitle(index: number, value: string) {
  const item = outlineDrafts.value[index];
  if (!item) return;
  const current = primaryResource(item);
  item.resources = [{ title: value, url: current.url }];
}

function updateOutlineResourceUrl(index: number, value: string) {
  const item = outlineDrafts.value[index];
  if (!item) return;
  const current = primaryResource(item);
  item.resources = [{ title: current.title || 'Resource', url: value }];
}

function updateOutlineResourceTitleFromEvent(index: number, inputEvent: Event) {
  updateOutlineResourceTitle(index, inputEvent.target instanceof HTMLInputElement ? inputEvent.target.value : '');
}

function updateOutlineResourceUrlFromEvent(index: number, inputEvent: Event) {
  updateOutlineResourceUrl(index, inputEvent.target instanceof HTMLInputElement ? inputEvent.target.value : '');
}

function normalizedOutlineResources(item: PublicMeetupScheduleItem): PublicMeetupScheduleItem['resources'] {
  const resource = item.resources[0];
  const title = resource?.title?.trim() ?? '';
  const url = resource?.url?.trim() ?? '';

  if (!url) return [];

  try {
    const parsedUrl = new URL(url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error('Unsupported protocol');
    }
  } catch {
    throw new Error(`Use a valid http(s) resource URL for "${item.title.trim() || 'Untitled outline item'}".`);
  }

  return [{ title: title || 'Resource', url }];
}

function normalizeOutlineDrafts(): PublicMeetupScheduleItem[] {
  const schedule: PublicMeetupScheduleItem[] = [];

  for (const item of outlineDrafts.value) {
    const time = item.time.trim();
    const title = item.title.trim();
    const lead = item.lead?.trim() ?? '';
    const description = item.description?.trim() ?? '';
    const systemDesignTitle = item.system_design_title?.trim() ?? '';
    const resources = normalizedOutlineResources(item);
    const hasAnyContent = Boolean(time || title || lead || description || resources.length > 0);

    if (!hasAnyContent) continue;
    if (!title) {
      throw new Error('Add a title for each outline item, or remove the empty row.');
    }

    schedule.push({
      time: time || 'TBD',
      title,
      type: item.type,
      lead: lead || null,
      description: description || null,
      system_design_title: (item.type === 'system_design' || hasSystemDesignTitleMarker(title)) && systemDesignTitle
        ? systemDesignTitle
        : null,
      resources,
    });
  }

  return schedule;
}

async function saveOutline() {
  if (!event.value || outlineSaving.value) return;

  let schedule: PublicMeetupScheduleItem[];
  try {
    schedule = normalizeOutlineDrafts();
  } catch (error) {
    outlineError.value = error instanceof Error ? error.message : 'Check the outline rows.';
    return;
  }

  outlineSaving.value = true;
  outlineError.value = null;

  try {
    const response = await fetch(`/api/events/${route.params.eventId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schedule }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error ?? 'Failed to update the program outline');
    }

    event.value = await response.json();
    syncOutlineDrafts();
    outlineEditing.value = false;
    await invalidateEventQueries();
    notify.success(schedule.length > 0 ? 'Program outline updated' : 'Program outline cleared');
  } catch (error) {
    outlineError.value = error instanceof Error ? error.message : 'Failed to update the program outline';
    notify.error(outlineError.value);
  } finally {
    outlineSaving.value = false;
  }
}

async function saveSeriesType() {
  if (!event.value || seriesTypeSaving.value) return;

  const currentSeriesType = resolveEventSeriesType(event.value);
  if (seriesTypeDraft.value === currentSeriesType) {
    seriesTypeError.value = null;
    return;
  }

  seriesTypeSaving.value = true;
  seriesTypeError.value = null;

  try {
    const response = await fetch(`/api/events/${route.params.eventId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ series_type: seriesTypeDraft.value }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error ?? 'Failed to update the event series type');
    }

    event.value = await response.json();
    syncSeriesTypeDraft();
    await invalidateEventQueries();
    notify.success('Event series updated');
  } catch (error) {
    seriesTypeError.value = error instanceof Error ? error.message : 'Failed to update the event series type';
    notify.error(seriesTypeError.value);
  } finally {
    seriesTypeSaving.value = false;
  }
}

async function toggleChecklistItem(item: EventChecklistItem) {
  if (checklistSavingId.value || checklistDisablingId.value || item.disabled_at) return;

  checklistSavingId.value = item.id;
  try {
    const response = await fetch(`/api/events/${route.params.eventId}/checklist/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: !item.completed }),
    });

    if (response.ok) {
      const payload = await response.json();
      checklist.value = payload.items ?? checklist.value;
      if (payload.event) {
        event.value = payload.event;
        syncDescriptionDraft();
        syncOutlineDrafts();
        syncSeriesTypeDraft();
      }
      await invalidateEventQueries();
    }
  } finally {
    checklistSavingId.value = null;
  }
}

function canDisableChecklistItem(item: EventChecklistItem): boolean {
  return !isPublishedEvent.value && !item.completed;
}

async function setChecklistItemDisabled(item: EventChecklistItem, disabled: boolean) {
  if (!canDisableChecklistItem(item) || checklistSavingId.value || checklistDisablingId.value) return;

  checklistDisablingId.value = item.id;
  try {
    const response = await fetch(`/api/events/${route.params.eventId}/checklist/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ disabled }),
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.error ?? 'Failed to update checklist item');
    }

    checklist.value = payload.items ?? checklist.value;
    if (payload.event) {
      event.value = payload.event;
      syncDescriptionDraft();
      syncOutlineDrafts();
      syncSeriesTypeDraft();
    }
    await invalidateEventQueries();
    notify.success(disabled ? 'Checklist item disabled' : 'Checklist item enabled');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update checklist item';
    notify.error(message);
  } finally {
    checklistDisablingId.value = null;
  }
}

function isWebsitePhotoUrl(value: string): boolean {
  return value.startsWith('/') || URL.canParse(value);
}

async function savePhotos(photos: NonNullable<CommunityEvent['photos']>, successMessage: string) {
  if (!event.value || photoSaving.value) return;

  photoSaving.value = true;
  photoError.value = null;

  try {
    const response = await fetch(`/api/events/${route.params.eventId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photos }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error ?? 'Failed to update photos');
    }

    event.value = await response.json();
    await invalidateEventQueries();
    notify.success(successMessage);
  } catch (error) {
    photoError.value = error instanceof Error ? error.message : 'Failed to update photos';
    notify.error(photoError.value);
  } finally {
    photoSaving.value = false;
  }
}

async function addPhotoLink() {
  if (!event.value) return;

  const url = photoUrl.value.trim();
  if (!url) {
    photoError.value = 'Add a photo or gallery link first.';
    return;
  }

  if (!isWebsitePhotoUrl(url)) {
    photoError.value = 'Use a full URL or a site-local path starting with /.';
    return;
  }

  const nextPhotos = [
    ...eventPhotos.value,
    {
      url,
      type: photoType.value,
    },
  ];

  await savePhotos(nextPhotos, 'Photo link added');
  if (!photoError.value) {
    photoUrl.value = '';
    photoType.value = 'folder';
  }
}

async function removePhotoLink(index: number) {
  if (!event.value) return;

  const nextPhotos = eventPhotos.value.filter((_, photoIndex) => photoIndex !== index);
  await savePhotos(nextPhotos, 'Photo link removed');
}

async function uploadMediaFile(file: File, purpose: 'cover' | 'photo') {
  if (!event.value || mediaUploadPurpose.value) return;

  const validationError = validateMeetupImageFile(file);
  if (validationError) {
    photoError.value = validationError;
    notify.error(validationError);
    return;
  }

  mediaUploadPurpose.value = purpose;
  photoError.value = null;

  try {
    const compressedFile = await compressMeetupImageForUpload(file);
    const payload = await uploadEventMedia(String(route.params.eventId), compressedFile, purpose);
    event.value = payload.event ?? event.value;
    await invalidateEventQueries();
    const savedPercent = compressionSavingsPercent(file, compressedFile);
    notify.success(
      purpose === 'cover'
        ? `Cover compressed and uploaded${savedPercent > 0 ? ` (${savedPercent}% smaller)` : ''}`
        : `Photo compressed and uploaded${savedPercent > 0 ? ` (${savedPercent}% smaller)` : ''}`,
    );
  } catch (error) {
    photoError.value = error instanceof Error ? error.message : 'Failed to upload image';
    notify.error(photoError.value);
  } finally {
    mediaUploadPurpose.value = null;
  }
}

async function handleMediaUpload(event: Event, purpose: 'cover' | 'photo') {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0] ?? null;
  input.value = '';

  if (file) {
    await uploadMediaFile(file, purpose);
  }
}

function formatShortDateTime(value: string): string {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatStatus(status: EventStatus): string {
  return status.replace('_', ' ');
}

onMounted(fetchOverview);
</script>

<template>
  <div class="editorial-page event-overview-page">
    <div class="editorial-wrap event-overview-wrap">
      <AdminEventOverviewPageSkeleton v-if="loading" />
      <div v-else-if="!event" class="py-12 text-center font-mono text-dc-gray">EVENT NOT FOUND</div>

      <template v-else>
        <div class="event-overview-hero border-b border-dc-border">
          <div class="min-w-0">
            <p class="editorial-eyebrow">event control</p>
            <div class="event-overview-title-row">
              <h1 class="event-overview-title font-black tracking-tight text-dc-ink">{{ event.name }}</h1>
              <button
                v-if="!isPublishedEvent"
                type="button"
                class="event-overview-publish-action"
                :disabled="publishSaving"
                @click="publishEvent"
              >
                {{ publishSaving ? 'Publishing...' : 'Publish' }}
              </button>
              <span
                v-else
                class="event-overview-publish-chip"
              >
                Published
              </span>
            </div>
            <p v-if="publishError" class="event-overview-copy-error mt-3">{{ publishError }}</p>
            <div class="mt-5 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
              <div class="rounded-lg border border-dc-border bg-dc-paper p-4">
                <div class="event-overview-copy-header">
                  <div class="min-w-0">
                    <p class="font-mono text-[11px] font-bold uppercase tracking-wide text-dc-pink">About page</p>
                    <p class="mt-1 text-sm leading-6 text-dc-gray">This copy appears in the public meetup About section.</p>
                  </div>
                  <button
                    v-if="!descriptionEditing"
                    type="button"
                    class="event-overview-copy-action"
                    @click="startDescriptionEdit"
                  >
                    Edit
                  </button>
                </div>

                <div v-if="descriptionEditing" class="mt-4 space-y-3">
                  <label class="sr-only" for="event-about-copy">About page copy</label>
                  <textarea
                    id="event-about-copy"
                    v-model="descriptionDraft"
                    class="event-overview-copy-input"
                    rows="7"
                    placeholder="Write the public About copy for this meetup."
                  />
                  <p v-if="descriptionError" class="event-overview-copy-error">{{ descriptionError }}</p>
                  <div class="event-overview-copy-actions">
                    <button
                      type="button"
                      class="editorial-action"
                      :disabled="descriptionSaving"
                      @click="saveDescription"
                    >
                      {{ descriptionSaving ? 'SAVING...' : 'SAVE ABOUT COPY' }}
                    </button>
                    <button
                      type="button"
                      class="event-overview-copy-cancel"
                      :disabled="descriptionSaving"
                      @click="cancelDescriptionEdit"
                    >
                      Cancel
                    </button>
                  </div>
                </div>

                <p v-else-if="event.description" class="mt-4 text-sm leading-7 text-dc-gray">{{ event.description }}</p>
                <p v-else class="mt-4 text-sm leading-6 text-dc-gray">No About copy yet. Add the text you want people to read on the public event page.</p>
                <div v-if="event.external_url" class="event-overview-source-link">
                  <span>Generated from</span>
                  <a :href="event.external_url" target="_blank" rel="noopener noreferrer">Luma event</a>
                </div>
              </div>

              <aside class="rounded-lg border border-dc-border bg-dc-paper p-4">
                <p class="font-mono text-[11px] font-bold uppercase tracking-wide text-dc-pink">Event profile</p>
                <h2 class="mt-1 text-lg font-black tracking-tight text-dc-ink">Series type</h2>
                <p class="mt-2 text-sm leading-6 text-dc-gray">{{ selectedSeriesTypeHelp }}</p>
                <div class="mt-4 space-y-3">
                  <AppDropdown
                    v-model="seriesTypeDraft"
                    label="Series type"
                    :options="eventSeriesTypeOptions"
                    :disabled="seriesTypeSaving"
                  />
                  <button
                    type="button"
                    class="editorial-action w-full justify-center"
                    :disabled="seriesTypeSaving"
                    @click="saveSeriesType"
                  >
                    {{ seriesTypeSaving ? 'SAVING...' : 'SAVE SERIES TYPE' }}
                  </button>
                  <p v-if="seriesTypeError" class="event-overview-copy-error">{{ seriesTypeError }}</p>
	                </div>
	              </aside>

	              <section class="event-outline-panel xl:col-span-2">
	                <div class="event-outline-header">
	                  <div class="min-w-0">
	                    <p class="editorial-eyebrow">program outline</p>
	                    <h2 class="event-outline-title">Optional event flow</h2>
	                    <p class="mt-2 max-w-3xl text-sm leading-6 text-dc-gray">
	                      Add this only when the event already has a clear run of sessions. Feedback and the public schedule can reuse these rows.
	                    </p>
	                  </div>
	                  <button
	                    v-if="!outlineEditing"
	                    type="button"
	                    class="event-overview-copy-action"
	                    @click="startOutlineEdit"
	                  >
	                    {{ eventOutline.length > 0 ? 'Edit outline' : 'Add outline' }}
	                  </button>
	                </div>

	                <div v-if="outlineEditing" class="event-outline-editor">
	                  <div class="event-outline-bulk">
	                    <label for="event-outline-bulk">Paste outline</label>
	                    <textarea
	                      id="event-outline-bulk"
	                      v-model="outlineBulkText"
	                      class="event-outline-bulk-input"
	                      rows="6"
	                      placeholder="PROGRAM OUTLINE&#10;Welcome address 11:00 - 11:05&#10;Talk title by Speaker - 12:00 - 12:30"
	                    />
	                    <button
	                      type="button"
	                      class="event-overview-copy-action"
	                      :disabled="outlineSaving"
	                      @click="parseBulkOutline"
	                    >
	                      Parse outline
	                    </button>
	                  </div>

	                  <div class="event-outline-scenario-helper">
	                    <div class="min-w-0">
	                      <p class="event-outline-scenario-title">Monthly system design</p>
	                      <p class="event-outline-scenario-copy">Add a reusable scenario row with room for the Google Slides prompt deck.</p>
	                    </div>
	                    <button
	                      type="button"
	                      class="event-overview-copy-action"
	                      :disabled="outlineSaving"
	                      @click="addSystemDesignScenario"
	                    >
	                      Add scenario
	                    </button>
	                  </div>

	                  <div
	                    v-for="(item, index) in outlineDrafts"
	                    :key="index"
	                    class="event-outline-edit-row"
	                  >
	                    <label>
	                      <span>Time</span>
	                      <input v-model="item.time" class="event-outline-input" placeholder="6:30 PM" />
	                    </label>
	                    <label>
	                      <span>Title</span>
	                      <input v-model="item.title" class="event-outline-input" placeholder="Session title" />
	                    </label>
	                    <label>
	                      <span>Type</span>
	                      <select v-model="item.type" class="event-outline-input">
	                        <option
	                          v-for="option in outlineTypeOptions"
	                          :key="option.value"
	                          :value="option.value"
	                        >
	                          {{ option.label }}
	                        </option>
	                      </select>
	                    </label>
	                    <label>
	                      <span>Lead</span>
	                      <input
	                        :value="item.lead ?? ''"
	                        class="event-outline-input"
	                        placeholder="Optional"
	                        @input="updateOutlineLeadFromEvent(index, $event)"
	                      />
	                    </label>
	                    <label class="event-outline-description-field">
	                      <span>Description</span>
	                      <textarea
	                        :value="item.description ?? ''"
	                        class="event-outline-input event-outline-textarea"
	                        rows="3"
	                        placeholder="Scenario brief, session context, or attendee instructions"
	                        @input="updateOutlineDescriptionFromEvent(index, $event)"
	                      />
	                    </label>
	                    <label>
	                      <span>Resource label</span>
	                      <input
	                        :value="primaryResource(item).title"
	                        class="event-outline-input"
	                        placeholder="Prompt deck"
	                        @input="updateOutlineResourceTitleFromEvent(index, $event)"
	                      />
	                    </label>
	                    <label class="event-outline-resource-url-field">
	                      <span>Resource URL</span>
	                      <input
	                        :value="primaryResource(item).url"
	                        class="event-outline-input"
	                        placeholder="https://docs.google.com/presentation/d/..."
	                        @input="updateOutlineResourceUrlFromEvent(index, $event)"
	                      />
	                    </label>
	                    <button
	                      type="button"
	                      class="event-outline-remove"
	                      :disabled="outlineSaving"
	                      @click="removeOutlineRow(index)"
	                    >
	                      Remove
	                    </button>
	                  </div>

	                  <p v-if="outlineError" class="event-overview-copy-error">{{ outlineError }}</p>
	                  <div class="event-overview-copy-actions">
	                    <button type="button" class="event-overview-copy-action" :disabled="outlineSaving" @click="addOutlineRow">
	                      Add row
	                    </button>
	                    <button type="button" class="editorial-action" :disabled="outlineSaving" @click="saveOutline">
	                      {{ outlineSaving ? 'SAVING...' : 'SAVE OUTLINE' }}
	                    </button>
	                    <button
	                      type="button"
	                      class="event-overview-copy-cancel"
	                      :disabled="outlineSaving"
	                      @click="cancelOutlineEdit"
	                    >
	                      Cancel
	                    </button>
	                  </div>
	                </div>

	                <div v-else-if="eventOutline.length > 0" class="event-outline-list">
	                  <div
	                    v-for="(item, index) in eventOutline"
	                    :key="`${item.time}-${item.title}-${index}`"
	                    class="event-outline-row"
	                  >
	                    <span class="event-outline-time">{{ item.time }}</span>
	                    <span class="event-outline-copy">
	                      <strong>{{ item.title }}</strong>
	                      <span v-if="item.lead">Led by {{ item.lead }}</span>
	                      <span v-if="item.description">{{ item.description }}</span>
	                      <a
	                        v-if="item.resources[0]"
	                        :href="item.resources[0].url"
	                        target="_blank"
	                        rel="noopener noreferrer"
	                        class="event-outline-resource-link"
	                      >
	                        {{ item.resources[0].title || 'Resource' }}
	                      </a>
	                    </span>
	                    <span class="event-outline-type">{{ item.type.replace('_', ' ') }}</span>
	                  </div>
	                </div>

	                <div v-else class="event-outline-empty">
	                  No program outline yet. That is okay for events that do not have one.
	                </div>
	              </section>
	            </div>
	          </div>
	        </div>

	        <section class="event-checklist-panel">
          <div class="event-checklist-header">
            <div class="min-w-0">
              <p class="editorial-eyebrow">event timeline</p>
              <h2 class="event-checklist-title">Chronological checklist</h2>
              <p class="mt-2 max-w-3xl text-sm leading-6 text-dc-gray">
                Everyone sees the same run sheet. Check off a milestone once it is done; status-changing milestones update the event state automatically.
              </p>
            </div>
            <div class="event-checklist-meter" aria-label="Checklist progress">
              <span class="event-checklist-meter-value">{{ checklistProgress.completed }}/{{ checklistProgress.total }}</span>
              <span class="event-checklist-meter-label">complete</span>
            </div>
          </div>

          <div class="event-checklist-progress-track" aria-hidden="true">
            <span
              class="event-checklist-progress-fill"
              :style="{ transform: `scaleX(${checklistProgress.percent / 100})` }"
            />
          </div>

          <div v-if="nextChecklistItem" class="event-checklist-next">
            <span class="event-checklist-next-label">Next up</span>
            <span class="event-checklist-next-copy">{{ nextChecklistItem.label }}</span>
          </div>
          <div v-else class="event-checklist-next event-checklist-next--done">
            <span class="event-checklist-next-label">Run sheet</span>
            <span class="event-checklist-next-copy">All checklist items are complete.</span>
          </div>

          <div class="event-checklist-phases">
            <div
              v-for="group in checklistByPhase"
              :key="group.phase"
              class="event-checklist-phase"
            >
              <div class="event-checklist-phase-heading">
                <span>{{ group.label }}</span>
              </div>
              <div class="event-checklist-items">
                <div
                  v-for="item in group.items"
                  :key="item.id"
                  class="event-checklist-item-wrap"
                  :class="{ 'event-checklist-item-wrap--disabled': item.disabled_at }"
                >
                  <button
                    type="button"
                    class="event-checklist-item motion-colors"
                    :class="{ 'event-checklist-item--done': item.completed, 'event-checklist-item--disabled': item.disabled_at }"
                    :aria-pressed="item.completed"
                    :disabled="checklistSavingId === item.id || checklistDisablingId === item.id || Boolean(item.disabled_at)"
                    @click="toggleChecklistItem(item)"
                  >
                    <span class="event-checklist-check" aria-hidden="true">
                      <span v-if="item.completed">✓</span>
                    </span>
                    <span class="min-w-0 text-left">
                      <span class="event-checklist-item-label">{{ item.label }}</span>
                      <span class="event-checklist-item-description">{{ item.description }}</span>
                      <span v-if="item.completed_at" class="event-checklist-item-meta">
                        Done by {{ item.completed_by ?? 'Organizer' }} · {{ formatShortDateTime(item.completed_at) }}
                      </span>
                      <span v-else-if="item.disabled_at" class="event-checklist-item-meta">
                        Disabled for this event
                      </span>
                    </span>
                    <span v-if="item.status_on_complete" class="event-checklist-status-chip">
                      sets {{ formatStatus(item.status_on_complete) }}
                    </span>
                  </button>
                  <button
                    v-if="canDisableChecklistItem(item)"
                    type="button"
                    class="event-checklist-disable motion-press"
                    :disabled="Boolean(checklistSavingId) || Boolean(checklistDisablingId)"
                    @click="setChecklistItemDisabled(item, !item.disabled_at)"
                  >
                    {{ checklistDisablingId === item.id ? 'Saving' : item.disabled_at ? 'Enable' : 'Disable' }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section class="event-media-panel">
          <div class="event-media-header">
            <div class="min-w-0">
              <p class="editorial-eyebrow">event media</p>
              <h2 class="event-media-title">Media</h2>
              <p class="mt-2 max-w-3xl text-sm leading-6 text-dc-gray">
                Upload selected images or add post-event gallery links. Uploaded images are compressed in the browser before Supabase Storage receives them.
              </p>
            </div>
            <span class="event-media-count">{{ eventPhotos.length }} saved</span>
          </div>

          <div class="event-media-upload-grid">
            <div class="event-media-upload-card">
              <div class="min-w-0">
                <p class="event-media-upload-title">Cover image</p>
                <p class="event-media-upload-copy">Upload an event cover. The browser resizes it to a web-friendly image first.</p>
                <a v-if="event.cover" :href="event.cover" target="_blank" rel="noreferrer" class="event-media-upload-current">Current cover</a>
              </div>
              <label class="event-media-upload-button" :class="{ 'opacity-60': mediaUploadPurpose === 'cover' }">
                <input
                  type="file"
                  :accept="IMAGE_UPLOAD_ACCEPT"
                  class="sr-only"
                  :disabled="Boolean(mediaUploadPurpose)"
                  @change="handleMediaUpload($event, 'cover')"
                >
                {{ mediaUploadPurpose === 'cover' ? 'Uploading...' : 'Upload cover' }}
              </label>
            </div>
            <div class="event-media-upload-card">
              <div class="min-w-0">
                <p class="event-media-upload-title">Event photo</p>
                <p class="event-media-upload-copy">Upload selected event images. Large albums should stay as folder links.</p>
              </div>
              <label class="event-media-upload-button" :class="{ 'opacity-60': mediaUploadPurpose === 'photo' }">
                <input
                  type="file"
                  :accept="IMAGE_UPLOAD_ACCEPT"
                  class="sr-only"
                  :disabled="Boolean(mediaUploadPurpose)"
                  @change="handleMediaUpload($event, 'photo')"
                >
                {{ mediaUploadPurpose === 'photo' ? 'Uploading...' : 'Upload photo' }}
              </label>
            </div>
          </div>

          <form class="event-media-form" @submit.prevent="addPhotoLink">
            <div class="event-media-url-field">
              <label class="editorial-label">Photo or gallery URL</label>
              <input
                v-model="photoUrl"
                class="editorial-input font-mono"
                placeholder="https://drive.google.com/drive/folders/... or /images/event-photo.jpg"
              />
            </div>
            <AppDropdown
              v-model="photoType"
              label="Type"
              :options="photoTypeOptions"
              class="event-media-type-field"
            />
            <button type="submit" class="editorial-action event-media-add" :disabled="photoSaving">
              {{ photoSaving ? 'SAVING...' : 'ADD LINK' }}
            </button>
          </form>

          <p v-if="photoError" class="event-media-error">{{ photoError }}</p>

          <div v-if="eventPhotos.length === 0" class="event-media-empty">
            No event photos have been added yet.
          </div>
          <div v-else class="event-media-list">
            <div
              v-for="(photo, index) in eventPhotos"
              :key="`${photo.url}-${index}`"
              class="event-media-row"
            >
              <div class="event-media-preview" :class="{ 'event-media-preview--folder': photo.type === 'folder' }">
                <img v-if="photo.type === 'image'" :src="photo.url" alt="" loading="lazy" />
                <span v-else aria-hidden="true">DIR</span>
              </div>
              <div class="min-w-0">
                <p class="event-media-row-title">{{ photo.type === 'folder' ? 'Gallery folder' : 'Single image' }}</p>
                <a class="event-media-row-url" :href="photo.url" target="_blank" rel="noreferrer">{{ photo.url }}</a>
              </div>
              <button
                type="button"
                class="event-media-remove"
                :disabled="photoSaving"
                @click="removePhotoLink(index)"
              >
                Remove
              </button>
            </div>
          </div>
        </section>

      </template>
    </div>
  </div>
</template>
