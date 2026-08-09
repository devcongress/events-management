<script setup lang="ts">
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import AppDropdown from '@/src/components/AppDropdown.vue';
import AppDatePicker from '@/src/components/ui/AppDatePicker.vue';
import BlastEmailPreview from '@/src/components/ui/BlastEmailPreview.vue';
import ConfirmDialog from '@/src/components/ui/ConfirmDialog.vue';
import GhanaVenueAutocomplete from '@/src/components/ui/GhanaVenueAutocomplete.vue';
import RegistrationAlphabetFilter from '@/src/components/ui/RegistrationAlphabetFilter.vue';
import {
  cancelEventRegistration,
  checkInEventRegistration,
  createEventBlast,
  fetchAdminSession,
  fetchEventBlasts,
  fetchEventRegistrations,
  processEventRegistrationEmails,
  queryKeys,
  removeEventRegistration,
  retryEventBlast,
  undoCheckInEventRegistration,
  updateEventById,
  updateEventRegistrationCampaign,
} from '@/src/lib/api';
import { adminPath } from '@/src/admin-routes';
import { registrationAvailability } from '@/lib/event-registration';
import { safeGoogleMapsUrl } from '@/lib/location-links';
import { notify } from '@/src/lib/notify';
import { emailSubjects } from '@/lib/email/scenarios';
import {
  ALL_REGISTRATION_INITIALS,
  registrationInitials,
} from '@/src/lib/registration-checkin';
import {
  changedRegistrationSettings,
  type RegistrationSettingsDraft,
  type RegistrationSettingsField,
} from '@/src/lib/registration-settings';
import {
  filterRegistrationGuests,
  summarizeRegistrationEmails,
  summarizeRegistrationWorkspace,
  type RegistrationGuestFilter,
} from '@/src/lib/registration-workspace';
import type { EventBlast, EventRegistration } from '@/types';

type RegistrationWorkspaceTab = 'summary' | 'guests' | 'form' | 'emails' | 'blasts';
type RegistrationOverviewPhase = 'before' | 'live' | 'after';

const route = useRoute();
const queryClient = useQueryClient();
const eventId = computed(() => String(route.params.eventId ?? ''));
const adminSessionQuery = useQuery({
  queryKey: queryKeys.adminSession,
  queryFn: fetchAdminSession,
});
const registrationQuery = useQuery({
  queryKey: computed(() => queryKeys.eventRegistrations(eventId.value)),
  queryFn: () => fetchEventRegistrations(eventId.value),
  enabled: computed(() => Boolean(eventId.value)),
  refetchInterval: 15_000,
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: true,
});
const blastsQuery = useQuery({
  queryKey: computed(() => queryKeys.eventBlasts(eventId.value)),
  queryFn: () => fetchEventBlasts(eventId.value),
  enabled: computed(() => Boolean(eventId.value) && registrationQuery.data.value?.managed_internally === true),
});
const settings = reactive({
  status: 'draft' as 'draft' | 'open' | 'closed',
  description: '',
  capacity: 100,
  opens_at: '',
  closes_at: '',
});
type RegistrationPageLocationMode = 'venue' | 'maps';
type RegistrationPageDetailsDraft = {
  name: string;
  description: string;
  event_date: string;
  end_date: string;
  location_mode: RegistrationPageLocationMode;
  location_name: string;
  location_url: string;
};
const pageDetails = reactive<RegistrationPageDetailsDraft>({
  name: '',
  description: '',
  event_date: '',
  end_date: '',
  location_mode: 'venue',
  location_name: '',
  location_url: '',
});
const savedPageDetails = ref<RegistrationPageDetailsDraft | null>(null);
const pageLocationPlaceId = ref('');
const pageDetailsSaving = ref(false);
const pageDetailsExpanded = ref(false);
const activeWorkspaceTab = ref<RegistrationWorkspaceTab>('summary');
const workspacePanelTransition = ref('registration-panel-forward');
const search = ref('');
const selectedInitial = ref(ALL_REGISTRATION_INITIALS);
const selectedGuestStatus = ref<RegistrationGuestFilter>('all');
const savePending = ref(false);
const settingsConfirmationOpen = ref(false);
const retryPending = ref(false);
const blastComposerOpen = ref(false);
const blastPreviewOpen = ref(false);
const blastPending = ref(false);
const blastRetryId = ref<string | null>(null);
const blastSubject = ref('');
const blastBody = ref('');
const blastScheduledFor = ref('');
const actionRegistrationId = ref<string | null>(null);
const pendingCancellation = ref<EventRegistration | null>(null);
const pendingCheckInUndo = ref<EventRegistration | null>(null);
const pendingRemoval = ref<EventRegistration | null>(null);
const savedSettings = ref<RegistrationSettingsDraft | null>(null);
const publicLinkCopied = ref(false);
const manualRefreshPending = ref(false);
const reopenRegistrationConfirmationOpen = ref(false);
const reopenRegistrationPending = ref(false);
const devRegistrationRemovalEnabled = import.meta.env.DEV;
const canRemoveTestGuest = computed(() => Boolean(
  devRegistrationRemovalEnabled && adminSessionQuery.data.value?.user?.role === 'owner',
));
let publicLinkFeedbackTimer: ReturnType<typeof setTimeout> | null = null;

const statusOptions = [
  { value: 'draft', label: 'Draft' },
  { value: 'open', label: 'Open' },
  { value: 'closed', label: 'Closed' },
];
const pageLocationOptions = [
  { value: 'venue', label: 'Venue name' },
  { value: 'maps', label: 'Google Maps link' },
];
const workspaceTabs: Array<{
  id: RegistrationWorkspaceTab;
  label: string;
  icon: 'summary' | 'guests' | 'form' | 'emails' | 'blasts';
}> = [
  { id: 'summary', label: 'Summary', icon: 'summary' },
  { id: 'guests', label: 'Guests', icon: 'guests' },
  { id: 'form', label: 'Form & capacity', icon: 'form' },
  { id: 'emails', label: 'Emails', icon: 'emails' },
  { id: 'blasts', label: 'Blasts', icon: 'blasts' },
];
const data = computed(() => registrationQuery.data.value ?? null);
const registrationDisplayPath = computed(() => adminPath(`registration-display/${encodeURIComponent(eventId.value)}`));
const registrationLastUpdatedLabel = computed(() => {
  const updatedAt = registrationQuery.dataUpdatedAt.value;
  if (!updatedAt) return 'Not updated yet';

  return `Updated ${new Intl.DateTimeFormat('en-GH', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'Africa/Accra',
  }).format(updatedAt)}`;
});
const managedInternally = computed(() => data.value?.managed_internally === true);
const displayedRegistrations = computed(() => data.value?.registrations ?? []);
const availableInitials = computed(() => registrationInitials(displayedRegistrations.value));
const workspaceSummary = computed(() => (
  data.value?.managed_internally
    ? summarizeRegistrationWorkspace(
      data.value.event,
      data.value.campaign,
      data.value.registrations,
    )
    : null
));
const emailSummary = computed(() => summarizeRegistrationEmails(displayedRegistrations.value));
const blasts = computed(() => blastsQuery.data.value?.blasts ?? []);
const blastCapacity = computed(() => blastsQuery.data.value?.capacity ?? null);
const confirmedBlastRecipients = computed(() => displayedRegistrations.value.filter((registration) => registration.status === 'confirmed').length);
const canCreateBlast = computed(() => (
  confirmedBlastRecipients.value > 0
  && confirmedBlastRecipients.value <= 100
  && blastSubject.value.trim().length > 0
  && blastBody.value.trim().length > 0
));
const blastTemplates = computed(() => {
  const eventName = data.value?.event.name ?? 'this event';
  const eventDate = data.value?.event.event_date
    ? formatDateTime(data.value.event.event_date)
    : 'the event day';
  return [
    {
      id: 'update',
      label: 'Event update',
      subject: emailSubjects.eventUpdate(eventName),
      body: `Hi,\n\nHere’s a quick update about ${eventName}.\n\n[Add your update]\n\nSee you there,\nDevCongress`,
    },
    {
      id: 'reminder',
      label: 'Reminder',
      subject: emailSubjects.eventReminder(eventName),
      body: `Hi,\n\nA quick reminder that ${eventName} is happening ${eventDate}.\n\n[Add any final details]\n\nSee you there,\nDevCongress`,
    },
    {
      id: 'venue',
      label: 'Venue change',
      subject: emailSubjects.eventVenueChange(eventName),
      body: `Hi,\n\nThe venue for ${eventName} has changed.\n\n[Add the new venue and any arrival details]\n\nSee you there,\nDevCongress`,
    },
  ];
});
const registrationOverviewPhase = computed<RegistrationOverviewPhase>(() => {
  const summary = workspaceSummary.value;
  const event = data.value?.event;
  if (!summary || !event) return 'before';
  if (summary.eventEnded) return 'after';
  if (event.status === 'live') return 'live';

  const eventStartMs = new Date(event.event_date).getTime();
  return Number.isFinite(eventStartMs) && eventStartMs <= Date.now()
    ? 'live'
    : 'before';
});
const registrationAvailabilityState = computed(() => {
  const campaign = data.value?.campaign;
  return campaign
    ? registrationAvailability(campaign)
    : { available: false as const, reason: 'draft' as const };
});
const registrationIsOpen = computed(() => registrationAvailabilityState.value.available);
const registrationCanReopen = computed(() => {
  const availability = registrationAvailabilityState.value;
  return !availability.available
    && registrationOverviewPhase.value === 'before'
    && (availability.reason === 'closed' || availability.reason === 'ended');
});
const registrationOverviewInactive = computed(() => (
  registrationOverviewPhase.value === 'before' && !registrationIsOpen.value
));
const registrationOverview = computed(() => {
  const summary = workspaceSummary.value;
  const phase = registrationOverviewPhase.value;

  if (!summary) {
    return {
      phase,
      primaryValue: 0,
      primaryTotal: 0,
      primaryLabel: 'confirmed registrations',
      secondaryValue: 0,
      secondaryLabel: 'places left',
      progressPercent: 0,
      progressLabel: 'Registration capacity filled',
      progressCaption: '0% filled',
    };
  }

  if (phase === 'after') {
    const noShows = summary.noShows ?? 0;
    const progressPercent = summary.going > 0
      ? Math.min(100, Math.round((summary.checkedIn / summary.going) * 100))
      : 0;

    return {
      phase,
      primaryValue: summary.checkedIn,
      primaryTotal: summary.going,
      primaryLabel: summary.checkedIn === 1 ? 'guest attended' : 'guests attended',
      secondaryValue: noShows,
      secondaryLabel: noShows === 1 ? 'no-show' : 'no-shows',
      progressPercent,
      progressLabel: 'Final event attendance',
      progressCaption: `${progressPercent}% attendance`,
    };
  }

  if (phase === 'live') {
    const stillToArrive = Math.max(0, summary.going - summary.checkedIn);
    const progressPercent = summary.going > 0
      ? Math.min(100, Math.round((summary.checkedIn / summary.going) * 100))
      : 0;

    return {
      phase,
      primaryValue: summary.checkedIn,
      primaryTotal: summary.going,
      primaryLabel: summary.checkedIn === 1 ? 'guest checked in' : 'guests checked in',
      secondaryValue: stillToArrive,
      secondaryLabel: stillToArrive === 1 ? 'guest still to arrive' : 'guests still to arrive',
      progressPercent,
      progressLabel: 'Guest check-in progress',
      progressCaption: `${progressPercent}% arrived`,
    };
  }

  const progressPercent = summary.capacity > 0
    ? Math.min(100, Math.round((summary.going / summary.capacity) * 100))
    : 0;
  return {
    phase,
    primaryValue: summary.going,
    primaryTotal: summary.capacity,
    primaryLabel: summary.going === 1 ? 'confirmed registration' : 'confirmed registrations',
    secondaryValue: summary.placesLeft,
    secondaryLabel: summary.placesLeft === 1 ? 'place left' : 'places left',
    progressPercent,
    progressLabel: 'Registration capacity filled',
    progressCaption: `${progressPercent}% filled`,
  };
});
const registrationOverviewDetails = computed(() => {
  const summary = workspaceSummary.value;
  if (!summary) return [];

  const details: Array<{
    label: string;
    value: number;
    tone: 'neutral' | 'waitlist';
  }> = [];

  if (registrationOverviewPhase.value !== 'after' && summary.waitlisted > 0) {
    details.push({
      label: 'Waitlisted',
      value: summary.waitlisted,
      tone: 'waitlist',
    });
  }
  if (summary.cancelled > 0) {
    details.push({
      label: 'Cancelled',
      value: summary.cancelled,
      tone: 'neutral',
    });
  }

  return details;
});
const registrationOverviewIsEmpty = computed(() => (
  registrationOverviewPhase.value === 'before'
  && (workspaceSummary.value?.going ?? 0) === 0
));
const registrationOverviewEmptyCopy = computed(() => (
  canUsePublicRegistrationForm.value
    ? 'Share the registration form to start filling this event.'
    : registrationCanReopen.value
      ? 'Registration is closed. Reopen it when you are ready to invite guests again.'
      : registrationAvailabilityState.value.available === false
        && registrationAvailabilityState.value.reason === 'not_open'
        ? 'Registration is scheduled to open later. Review form settings to change the schedule.'
        : 'Finish the form settings and open registration when you are ready to invite guests.'
));
const registrationOverviewActionLabel = computed(() => (
  canUsePublicRegistrationForm.value
    ? publicLinkCopied.value
      ? 'Link copied'
      : 'Copy registration link'
    : 'Review form settings'
));
const showRegistrationOverviewEmptyAction = computed(() => (
  canUsePublicRegistrationForm.value || !registrationCanReopen.value
));
const registrationOverviewProgressMax = computed(() => (
  Math.max(1, registrationOverview.value.primaryTotal)
));
const registrationOverviewProgressNow = computed(() => (
  Math.min(
    registrationOverviewProgressMax.value,
    registrationOverview.value.primaryValue,
  )
));
const canUsePublicRegistrationForm = computed(() => (
  Boolean(data.value?.public_url)
  && registrationIsOpen.value
));
const currentSettings = computed<RegistrationSettingsDraft>(() => ({
  status: settings.status,
  description: settings.description,
  capacity: Number(settings.capacity),
  opens_at: settings.opens_at,
  closes_at: settings.closes_at,
}));
const changedSettingFields = computed<RegistrationSettingsField[]>(() => (
  savedSettings.value
    ? changedRegistrationSettings(savedSettings.value, currentSettings.value)
    : []
));
const hasSettingsChanges = computed(() => changedSettingFields.value.length > 0);
const currentPageDetails = computed<RegistrationPageDetailsDraft>(() => ({ ...pageDetails }));
const hasPageDetailsChanges = computed(() => (
  Boolean(savedPageDetails.value)
  && JSON.stringify(savedPageDetails.value) !== JSON.stringify(currentPageDetails.value)
));
const pageDetailsValid = computed(() => Boolean(
  pageDetails.name.trim()
  && pageDetails.description.trim()
  && pageDetails.event_date
  && (
    pageDetails.location_mode === 'maps'
      ? safeGoogleMapsUrl(pageDetails.location_url)
      : pageDetails.location_name.trim()
  )
));
const canSavePageDetails = computed(() => (
  hasPageDetailsChanges.value
  && pageDetailsValid.value
  && !pageDetailsSaving.value
));
const canRequestSettingsSave = computed(() => Boolean(
  savedSettings.value
  && !savePending.value
  && !settingsConfirmationOpen.value
  && hasSettingsChanges.value
));
const settingsReviewRows = computed(() => {
  const baseline = savedSettings.value;
  if (!baseline) return [];

  return changedSettingFields.value.map((field) => ({
    field,
    label: settingLabel(field),
    before: changedSettingFields.value.includes(field)
      ? displaySettingValue(field, baseline[field])
      : null,
    after: displaySettingValue(field, currentSettings.value[field]),
  }));
});
const settingsConfirmationTitle = computed(() => 'Save registration changes?');
const settingsConfirmationMessage = computed(() => (
  `Review ${changedSettingFields.value.length} change${changedSettingFields.value.length === 1 ? '' : 's'} before updating the campaign.`
));
const guestStatusOptions = computed<Array<{
  value: RegistrationGuestFilter;
  label: string;
  count: number;
}>>(() => {
  const summary = workspaceSummary.value;
  if (!summary) return [];

  return [
    { value: 'all', label: 'All', count: displayedRegistrations.value.length },
    { value: 'going', label: 'Going', count: summary.going },
    ...(summary.waitlisted > 0
      ? [{ value: 'waitlisted' as const, label: 'Waitlisted', count: summary.waitlisted }]
      : []),
    { value: 'checked_in', label: 'Checked in', count: summary.checkedIn },
    { value: 'cancelled', label: 'Cancelled', count: summary.cancelled },
    ...(summary.eventEnded
      ? [{ value: 'no_show' as const, label: 'No-shows', count: summary.noShows ?? 0 }]
      : []),
  ];
});
const filteredRegistrations = computed(() => {
  return filterRegistrationGuests(displayedRegistrations.value, {
    query: search.value,
    initial: selectedInitial.value,
    status: selectedGuestStatus.value,
    eventEnded: workspaceSummary.value?.eventEnded ?? false,
  });
});
const emailRegistrations = computed(() => [...displayedRegistrations.value].sort((first, second) => {
  const rank = (status: EventRegistration['email_status']) => {
    if (status === 'failed') return 0;
    if (status === 'pending') return 1;
    if (status === 'accepted') return 2;
    return 3;
  };
  return rank(first.email_status) - rank(second.email_status)
    || first.name.localeCompare(second.name, 'en-GH', { sensitivity: 'base' });
}));

watch(() => data.value?.campaign, (campaign) => {
  if (!campaign) return;
  const snapshot: RegistrationSettingsDraft = {
    status: campaign.status,
    description: campaign.description ?? '',
    capacity: campaign.capacity,
    opens_at: toLocalDateTime(campaign.opens_at),
    closes_at: toLocalDateTime(campaign.closes_at),
  };
  Object.assign(settings, snapshot);
  savedSettings.value = { ...snapshot };
}, { immediate: true });

watch(() => data.value?.event, (event) => {
  if (!event) return;
  const mapUrl = safeGoogleMapsUrl(event.location?.url);
  pageLocationPlaceId.value = '';
  const snapshot: RegistrationPageDetailsDraft = {
    name: event.name,
    description: event.description ?? '',
    event_date: toLocalDateTime(event.event_date),
    end_date: toLocalDateTime(event.end_date ?? null),
    location_mode: mapUrl ? 'maps' : 'venue',
    location_name: mapUrl ? '' : event.location?.label ?? event.location?.name ?? '',
    location_url: mapUrl ?? '',
  };
  Object.assign(pageDetails, snapshot);
  savedPageDetails.value = { ...snapshot };
}, { immediate: true });

watch(availableInitials, (initials) => {
  if (
    selectedInitial.value !== ALL_REGISTRATION_INITIALS
    && !initials.includes(selectedInitial.value)
  ) {
    selectedInitial.value = ALL_REGISTRATION_INITIALS;
  }
});

watch(guestStatusOptions, (options) => {
  if (!options.some((option) => option.value === selectedGuestStatus.value)) {
    selectedGuestStatus.value = 'all';
  }
});

onBeforeUnmount(() => {
  if (publicLinkFeedbackTimer) {
    clearTimeout(publicLinkFeedbackTimer);
  }
});

function toLocalDateTime(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function toIso(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('en-GH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Accra',
  }).format(new Date(value));
}

function settingLabel(field: RegistrationSettingsField): string {
  if (field === 'status') return 'Status';
  if (field === 'description') return 'Registration introduction';
  if (field === 'capacity') return 'Capacity';
  if (field === 'opens_at') return 'Opens at';
  return 'Closes at';
}

function displaySettingValue(
  field: RegistrationSettingsField,
  value: RegistrationSettingsDraft[RegistrationSettingsField],
): string {
  if (field === 'status') {
    return String(value).replace(/^./, (letter) => letter.toUpperCase());
  }
  if (field === 'description') {
    return String(value).trim() || 'No introduction';
  }
  if (field === 'opens_at' || field === 'closes_at') {
    return value ? formatDateTime(new Date(String(value)).toISOString()) : 'Not scheduled';
  }
  return String(value);
}

function guestStatusLabel(registration: EventRegistration): string | null {
  if (
    workspaceSummary.value?.eventEnded
    && registration.status === 'confirmed'
    && !registration.checked_in_at
  ) {
    return 'No-show';
  }
  if (registration.checked_in_at) return 'Checked in';
  if (registration.status === 'waitlisted') return 'Waitlisted';
  if (registration.status === 'cancelled') return 'Cancelled';
  return null;
}

function guestStatusClass(registration: EventRegistration): string {
  if (registration.checked_in_at) return 'border-dc-ink bg-dc-ink text-white';
  if (registration.status === 'waitlisted') return 'border-amber-300 bg-amber-50 text-amber-800';
  if (
    workspaceSummary.value?.eventEnded
    && registration.status === 'confirmed'
  ) {
    return 'border-red-300 bg-red-50 text-red-700';
  }
  return 'border-dc-border bg-dc-paper-warm text-dc-gray';
}

function emailStatusLabel(status: EventRegistration['email_status']): string {
  if (status === 'accepted') return 'Accepted';
  if (status === 'pending') return 'Queued';
  if (status === 'failed') return 'Failed';
  return 'Not queued';
}

function emailStatusClass(status: EventRegistration['email_status']): string {
  if (status === 'accepted') return 'border-emerald-300 bg-emerald-50 text-emerald-800';
  if (status === 'failed') return 'border-red-300 bg-red-50 text-red-700';
  if (status === 'pending') return 'border-amber-300 bg-amber-50 text-amber-800';
  return 'border-dc-border bg-dc-paper-warm text-dc-gray';
}

function blastStatusLabel(status: EventBlast['status']): string {
  if (status === 'preparing') return 'Preparing safely';
  if (status === 'scheduled') return 'Scheduled';
  if (status === 'sent') return 'Sent';
  if (status === 'needs_capacity') return 'Needs email capacity';
  return 'Needs attention';
}

function blastStatusClass(status: EventBlast['status']): string {
  if (status === 'preparing') return 'border-dc-border bg-dc-paper-warm text-dc-gray';
  if (status === 'sent') return 'border-emerald-300 bg-emerald-50 text-emerald-800';
  if (status === 'scheduled') return 'border-sky-300 bg-sky-50 text-sky-800';
  if (status === 'needs_capacity') return 'border-amber-300 bg-amber-50 text-amber-800';
  return 'border-red-300 bg-red-50 text-red-700';
}

async function refresh() {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.eventRegistrations(eventId.value) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.eventBlasts(eventId.value) }),
  ]);
}

function requestSaveSettings() {
  if (!canRequestSettingsSave.value) return;
  settingsConfirmationOpen.value = true;
}

function selectWorkspaceTab(tab: RegistrationWorkspaceTab) {
  if (tab === activeWorkspaceTab.value) return;

  const currentIndex = workspaceTabs.findIndex((item) => item.id === activeWorkspaceTab.value);
  const nextIndex = workspaceTabs.findIndex((item) => item.id === tab);
  workspacePanelTransition.value = nextIndex >= currentIndex
    ? 'registration-panel-forward'
    : 'registration-panel-backward';
  activeWorkspaceTab.value = tab;
}

function openBlastPreview() {
  if (!canCreateBlast.value || blastPending.value) return;
  blastPreviewOpen.value = true;
}

function openBlastComposer() {
  blastComposerOpen.value = true;
  if (blastSubject.value.trim() || blastBody.value.trim()) return;
  applyBlastTemplate('reminder');
}

async function manuallyRefreshRegistration() {
  if (manualRefreshPending.value) return;
  manualRefreshPending.value = true;
  try {
    const [registrationResult] = await Promise.all([
      registrationQuery.refetch(),
      managedInternally.value ? blastsQuery.refetch() : Promise.resolve(),
    ]);
    if (registrationResult.isError) {
      notify.error('Unable to refresh registrations. The last loaded figures are still shown.');
    }
  } finally {
    manualRefreshPending.value = false;
  }
}

async function reopenRegistration() {
  if (!registrationCanReopen.value || reopenRegistrationPending.value) return;
  reopenRegistrationPending.value = true;
  try {
    await updateEventRegistrationCampaign(eventId.value, {
      status: 'open',
      opens_at: null,
      closes_at: null,
    });
    await refresh();
    reopenRegistrationConfirmationOpen.value = false;
    notify.success('Registration reopened and is accepting guests now.');
  } catch (error) {
    notify.error(error instanceof Error ? error.message : 'Unable to reopen registration.');
  } finally {
    reopenRegistrationPending.value = false;
  }
}

function applyBlastTemplate(templateId: string) {
  const template = blastTemplates.value.find((item) => item.id === templateId);
  if (!template) return;
  blastSubject.value = template.subject;
  blastBody.value = template.body;
}

async function sendBlast() {
  if (!canCreateBlast.value || blastPending.value) return;
  blastPending.value = true;
  try {
    const result = await createEventBlast(eventId.value, {
      subject: blastSubject.value.trim(),
      body: blastBody.value.trim(),
      scheduled_for: toIso(blastScheduledFor.value),
    });
    await refresh();
    blastComposerOpen.value = false;
    blastPreviewOpen.value = false;
    blastSubject.value = '';
    blastBody.value = '';
    blastScheduledFor.value = '';
    notify.success(
      result.delivery === 'scheduled'
        ? `Blast scheduled for ${formatDateTime(result.blast.scheduled_for!)}`
        : result.delivery === 'sent'
          ? `Blast sent to ${result.blast.recipient_count} confirmed guests.`
          : result.error ?? 'Blast saved without sending so protected transactional capacity remains available.',
    );
  } catch (error) {
    notify.error(error instanceof Error ? error.message : 'Unable to create this blast.');
  } finally {
    blastPending.value = false;
  }
}

async function retryBlast(blast: EventBlast) {
  if (blastRetryId.value || blast.status !== 'failed' || !blast.provider_broadcast_id) return;
  blastRetryId.value = blast.id;
  try {
    const result = await retryEventBlast(eventId.value, blast.id);
    await refresh();
    notify.success(
      result.delivery === 'scheduled'
        ? `Blast scheduled for ${formatDateTime(result.blast.scheduled_for!)}`
        : `Blast sent to ${result.blast.recipient_count} confirmed guests.`,
    );
  } catch (error) {
    notify.error(error instanceof Error ? error.message : 'Unable to retry this blast.');
  } finally {
    blastRetryId.value = null;
  }
}

async function handleRegistrationOverviewAction() {
  if (canUsePublicRegistrationForm.value) {
    await copyPublicLink();
    return;
  }
  selectWorkspaceTab('form');
}

async function saveSettings() {
  if (savePending.value) return;
  savePending.value = true;
  try {
    await updateEventRegistrationCampaign(eventId.value, {
      status: settings.status,
      description: settings.description.trim() || null,
      capacity: settings.capacity,
      opens_at: toIso(settings.opens_at),
      closes_at: toIso(settings.closes_at),
    });
    await refresh();
    settingsConfirmationOpen.value = false;
    notify.success(settings.status === 'open' ? 'Registration is open.' : 'Registration settings saved.');
  } catch (error) {
    notify.error(error instanceof Error ? error.message : 'Unable to save registration settings.');
  } finally {
    savePending.value = false;
  }
}

async function savePageDetails() {
  if (!canSavePageDetails.value) return;
  const mapUrl = pageDetails.location_mode === 'maps'
    ? safeGoogleMapsUrl(pageDetails.location_url)
    : null;
  if (pageDetails.location_mode === 'maps' && !mapUrl) {
    notify.error('Add a complete HTTPS Google Maps share link.');
    return;
  }

  pageDetailsSaving.value = true;
  try {
    const locationName = pageDetails.location_mode === 'maps'
      ? 'Google Maps location'
      : pageDetails.location_name.trim();
    await updateEventById(eventId.value, {
      name: pageDetails.name.trim(),
      description: pageDetails.description.trim(),
      event_date: toIso(pageDetails.event_date),
      end_date: toIso(pageDetails.end_date),
      location: {
        name: locationName,
        label: locationName,
        url: mapUrl,
      },
    });
    await refresh();
    await queryClient.invalidateQueries({ queryKey: queryKeys.event(eventId.value) });
    notify.success('Registration page details updated.');
  } catch (error) {
    notify.error(error instanceof Error ? error.message : 'Unable to update registration page details.');
  } finally {
    pageDetailsSaving.value = false;
  }
}

async function copyPublicLink() {
  if (!data.value?.public_url || !canUsePublicRegistrationForm.value) return;
  try {
    await navigator.clipboard.writeText(data.value.public_url);
    publicLinkCopied.value = true;
    if (publicLinkFeedbackTimer) {
      clearTimeout(publicLinkFeedbackTimer);
    }
    publicLinkFeedbackTimer = setTimeout(() => {
      publicLinkCopied.value = false;
      publicLinkFeedbackTimer = null;
    }, 2_000);
    notify.success('Registration form link copied.');
  } catch {
    notify.error('Unable to copy the registration form link.');
  }
}

async function checkIn(registration: EventRegistration) {
  if (actionRegistrationId.value) return;
  actionRegistrationId.value = registration.id;

  try {
    await checkInEventRegistration(eventId.value, registration.id);
    await refresh();
    notify.success(`${registration.name} checked in.`);
  } catch (error) {
    notify.error(error instanceof Error ? error.message : 'Unable to check in this guest.');
  } finally {
    actionRegistrationId.value = null;
  }
}

async function confirmCheckInUndo() {
  const registration = pendingCheckInUndo.value;
  if (!registration || actionRegistrationId.value) return;
  actionRegistrationId.value = registration.id;
  try {
    await undoCheckInEventRegistration(eventId.value, registration.id);
    await refresh();
    pendingCheckInUndo.value = null;
    notify.success(`${registration.name}'s check-in was undone.`);
  } catch (error) {
    notify.error(error instanceof Error ? error.message : 'Unable to undo this check-in.');
  } finally {
    actionRegistrationId.value = null;
  }
}

async function confirmCancellation() {
  const registration = pendingCancellation.value;
  if (!registration || actionRegistrationId.value) return;
  actionRegistrationId.value = registration.id;
  try {
    const result = await cancelEventRegistration(eventId.value, registration.id);
    await refresh();
    notify.success(
      result.promoted_registration_id
        ? `${registration.name}'s registration was cancelled. The next waitlisted guest now has the place.`
        : `${registration.name}'s registration was cancelled.`,
    );
    pendingCancellation.value = null;
  } catch (error) {
    notify.error(error instanceof Error ? error.message : 'Unable to cancel this registration.');
  } finally {
    actionRegistrationId.value = null;
  }
}

async function confirmRemoval() {
  const registration = pendingRemoval.value;
  if (!registration || actionRegistrationId.value || !canRemoveTestGuest.value) return;
  actionRegistrationId.value = registration.id;
  try {
    await removeEventRegistration(eventId.value, registration.id);
    await refresh();
    notify.success(`${registration.name} was permanently removed.`);
    pendingRemoval.value = null;
  } catch (error) {
    notify.error(error instanceof Error ? error.message : 'Unable to remove this test guest.');
  } finally {
    actionRegistrationId.value = null;
  }
}

async function retryEmails() {
  if (retryPending.value) return;
  retryPending.value = true;
  try {
    const result = await processEventRegistrationEmails(eventId.value);
    await refresh();
    notify.success(
      result.delayed_count > 0
        ? `${result.accepted_count} sent; ${result.delayed_count} remain queued.`
        : `${result.accepted_count} confirmation email${result.accepted_count === 1 ? '' : 's'} sent.`,
    );
  } catch (error) {
    notify.error(error instanceof Error ? error.message : 'Unable to retry confirmation emails.');
  } finally {
    retryPending.value = false;
  }
}
</script>

<template>
  <div class="editorial-page">
    <div class="editorial-wrap registration-page-wrap">
      <header class="registration-page-header">
        <h1>{{ data && !managedInternally ? 'Registration history' : 'Registration' }}</h1>
        <p>
          {{
            data && !managedInternally
              ? 'Review how registration records are represented for this event.'
              : data?.event?.name
                ? `Manage capacity, guests, and confirmations for ${data.event.name}.`
                : 'Manage capacity, guests, and confirmations for this event.'
          }}
        </p>
      </header>

      <section v-if="registrationQuery.isPending.value" class="registration-loading-skeleton" aria-busy="true" aria-label="Loading registration workspace">
        <div class="registration-workspace-tabs" aria-hidden="true">
          <div v-for="tab in 5" :key="tab" class="registration-workspace-tab pointer-events-none">
            <span class="skeleton-option size-5" />
            <span class="skeleton-line h-4" :class="tab === 3 ? 'w-28' : 'w-16'" />
          </div>
        </div>
        <div class="registration-overview mt-5">
          <div class="registration-overview-header">
            <div class="space-y-3">
              <div class="skeleton-line h-7 w-56" />
              <div class="skeleton-line h-4 w-36" />
            </div>
            <div class="skeleton-button h-11 w-36" />
          </div>
          <div class="grid gap-4 border-t border-dc-border px-5 py-5 sm:grid-cols-2 xl:grid-cols-4">
            <div v-for="card in 4" :key="card" class="skeleton-stat-card min-h-28" />
          </div>
          <div class="border-t border-dc-border px-5 py-5">
            <div class="skeleton-line h-4 w-44" />
            <div class="mt-4 space-y-3">
              <div v-for="row in 3" :key="row" class="skeleton-line h-11" />
            </div>
          </div>
        </div>
      </section>
      <div v-else-if="!data" class="rounded-md border-2 border-red-500 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
        {{ registrationQuery.error.value?.message ?? 'Unable to load registrations.' }}
      </div>

      <section
        v-else-if="!managedInternally"
        class="editorial-panel overflow-hidden"
        aria-labelledby="registration-history-title"
      >
        <div class="border-b border-dc-border bg-dc-paper-warm px-5 py-5 sm:px-6">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p class="editorial-eyebrow">historical registration</p>
              <h2 id="registration-history-title" class="mt-1 text-2xl font-bold text-dc-ink">
                Registration was not managed in this app
              </h2>
            </div>
            <span class="rounded-sm border border-dc-border bg-white px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-wide text-dc-gray">
              No internal campaign
            </span>
          </div>
        </div>
        <div class="max-w-3xl px-5 py-6 sm:px-6">
          <p class="text-base leading-7 text-dc-gray">
            This event has no DevCongress registration campaign, so there is no internal guest list,
            registration email history, or native check-in record to show here.
          </p>
          <p class="mt-3 text-sm leading-6 text-dc-gray">
            Historical attendance remains available in the Attendance tab when a source CSV was imported.
            New events created in DevCongress receive an internal registration campaign automatically.
          </p>
        </div>
      </section>

      <template v-else>
        <div
          class="registration-workspace-tabs"
          role="tablist"
          aria-label="Registration workspace"
        >
          <button
            v-for="tab in workspaceTabs"
            :id="`registration-tab-${tab.id}`"
            :key="tab.id"
            type="button"
            role="tab"
            class="registration-workspace-tab"
            :aria-selected="activeWorkspaceTab === tab.id"
            :aria-controls="`registration-panel-${tab.id}`"
            :tabindex="activeWorkspaceTab === tab.id ? 0 : -1"
            @click="selectWorkspaceTab(tab.id)"
          >
            <svg class="registration-workspace-tab-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <template v-if="tab.icon === 'summary'">
                <rect x="3" y="3" width="5.5" height="5.5" rx="1" />
                <rect x="11.5" y="3" width="5.5" height="5.5" rx="1" />
                <rect x="3" y="11.5" width="5.5" height="5.5" rx="1" />
                <rect x="11.5" y="11.5" width="5.5" height="5.5" rx="1" />
              </template>
              <template v-else-if="tab.icon === 'guests'">
                <circle cx="7.25" cy="7" r="2.5" />
                <path d="M2.75 16.25c.45-2.35 2.15-3.75 4.5-3.75s4.05 1.4 4.5 3.75M13.25 4.75a2.25 2.25 0 0 1 0 4.5M14.25 12.75c1.6.3 2.65 1.4 3 3.5" />
              </template>
              <template v-else-if="tab.icon === 'form'">
                <rect x="4" y="2.75" width="12" height="14.5" rx="1.5" />
                <path d="M7 7h6M7 10.25h6M7 13.5h3.5" />
              </template>
              <template v-else-if="tab.icon === 'emails'">
                <rect x="2.75" y="4.25" width="14.5" height="11.5" rx="1.5" />
                <path d="m3.75 5.5 6.25 5 6.25-5" />
              </template>
              <template v-else>
                <path d="m3 10.75 10.25-5v8.5L3 10.75Z" />
                <path d="M13.25 8.25h1.25a2.5 2.5 0 0 1 0 5h-1.25M6.25 12.25l.75 4" />
              </template>
            </svg>
            <span>{{ tab.label }}</span>
          </button>
        </div>

        <Transition :name="workspacePanelTransition" mode="out-in">
          <section
            v-if="activeWorkspaceTab === 'summary'"
            id="registration-panel-summary"
            key="summary"
            role="tabpanel"
            aria-labelledby="registration-tab-summary"
            class="registration-overview mt-5"
            :class="{ 'registration-overview--inactive': registrationOverviewInactive }"
          >
            <div class="registration-overview-header">
              <h2>Registration overview</h2>
              <div class="registration-overview-header-actions">
                <span class="registration-overview-updated">
                  {{ registrationLastUpdatedLabel }}
                </span>
                <RouterLink
                  v-if="canUsePublicRegistrationForm"
                  :to="registrationDisplayPath"
                  class="registration-overview-refresh registration-overview-qr-link motion-press"
                >
                  Show QR code
                </RouterLink>
                <Transition name="registration-overview-control" mode="out-in">
                  <button
                    v-if="registrationIsOpen"
                    key="refresh"
                    type="button"
                    class="registration-overview-refresh motion-press"
                    :aria-label="`Refresh registrations. ${registrationLastUpdatedLabel}`"
                    :disabled="manualRefreshPending"
                    @click="manuallyRefreshRegistration"
                  >
                    <svg viewBox="0 0 20 20" aria-hidden="true">
                      <path d="M15.7 6.8A6.25 6.25 0 1 0 16 12" />
                      <path d="M15.7 3.8v3.4h-3.4" />
                    </svg>
                    {{ manualRefreshPending ? 'Refreshing…' : 'Refresh' }}
                  </button>
                  <button
                    v-else-if="registrationCanReopen"
                    key="reopen"
                    type="button"
                    class="registration-overview-refresh registration-overview-reopen motion-press"
                    :disabled="reopenRegistrationPending"
                    @click="reopenRegistrationConfirmationOpen = true"
                  >
                    {{ reopenRegistrationPending ? 'Reopening…' : 'Reopen registration' }}
                  </button>
                </Transition>
              </div>
            </div>

            <div class="registration-overview-metrics">
              <div class="registration-overview-primary">
                <p class="registration-overview-figure">
                  <Transition name="registration-value" mode="out-in">
                    <strong :key="registrationOverview.primaryValue">
                      {{ registrationOverview.primaryValue }}
                    </strong>
                  </Transition>
                  <span aria-hidden="true">/</span>
                  <span>{{ registrationOverview.primaryTotal }}</span>
                </p>
                <p>{{ registrationOverview.primaryLabel }}</p>
              </div>

              <div class="registration-overview-secondary">
                <Transition name="registration-value" mode="out-in">
                  <strong :key="registrationOverview.secondaryValue">
                    {{ registrationOverview.secondaryValue }}
                  </strong>
                </Transition>
                <span>{{ registrationOverview.secondaryLabel }}</span>
              </div>
            </div>

            <div class="registration-overview-progress-row">
              <div
                class="registration-overview-progress"
                role="progressbar"
                :aria-label="registrationOverview.progressLabel"
                aria-valuemin="0"
                :aria-valuemax="registrationOverviewProgressMax"
                :aria-valuenow="registrationOverviewProgressNow"
                :aria-valuetext="registrationOverview.progressCaption"
              >
                <div
                  class="registration-overview-progress-fill"
                  :style="{ transform: `scaleX(${registrationOverview.progressPercent / 100})` }"
                />
              </div>
              <p>{{ registrationOverview.progressCaption }}</p>
            </div>

            <div v-if="registrationOverviewIsEmpty" class="registration-overview-empty">
              <div>
                <p class="registration-overview-empty-title">No registrations yet</p>
                <p class="registration-overview-empty-copy">{{ registrationOverviewEmptyCopy }}</p>
              </div>
              <button
                v-if="showRegistrationOverviewEmptyAction"
                type="button"
                class="registration-overview-action motion-press"
                @click="handleRegistrationOverviewAction"
              >
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M7 6.25V4.75A1.75 1.75 0 0 1 8.75 3h6.5A1.75 1.75 0 0 1 17 4.75v6.5A1.75 1.75 0 0 1 15.25 13h-1.5" />
                  <rect x="3" y="7" width="10" height="10" rx="1.75" />
                </svg>
                <span aria-live="polite">{{ registrationOverviewActionLabel }}</span>
              </button>
            </div>

            <div
              v-if="registrationOverviewDetails.length > 0"
              class="registration-overview-details"
              aria-label="Additional registration details"
            >
              <div
                v-for="detail in registrationOverviewDetails"
                :key="detail.label"
                class="registration-overview-detail"
                :class="{ 'registration-overview-detail--waitlist': detail.tone === 'waitlist' }"
              >
                <Transition name="registration-value" mode="out-in">
                  <strong :key="detail.value">{{ detail.value }}</strong>
                </Transition>
                <span>{{ detail.label }}</span>
              </div>
            </div>
          </section>

          <section
            v-else-if="activeWorkspaceTab === 'guests'"
            id="registration-panel-guests"
            key="guests"
            role="tabpanel"
            aria-labelledby="registration-tab-guests"
            class="ops-panel mt-5 overflow-hidden"
          >
          <div class="border-b border-dc-border bg-dc-paper-warm px-4 py-4">
            <div class="flex flex-col gap-4">
              <div class="flex flex-col gap-3 xl:flex-row xl:items-end xl:gap-4">
                <div class="w-full max-w-xs xl:shrink-0">
                  <label for="guest-search" class="editorial-label">Search guests</label>
                  <input id="guest-search" v-model="search" type="search" class="editorial-input" placeholder="Name or email">
                </div>

                <div class="flex flex-wrap gap-2 xl:shrink-0" aria-label="Guest status filters">
                  <button
                    v-for="option in guestStatusOptions"
                    :key="option.value"
                    type="button"
                    class="min-h-11 rounded-md border px-3 font-mono text-[10px] font-semibold uppercase tracking-wide"
                    :class="selectedGuestStatus === option.value
                      ? 'border-dc-pink bg-dc-pink text-white'
                      : 'border-dc-border bg-white text-dc-gray'"
                    :aria-pressed="selectedGuestStatus === option.value"
                    @click="selectedGuestStatus = option.value"
                  >
                    {{ option.label }} · {{ option.count }}
                  </button>
                </div>

                <p class="shrink-0 font-mono text-[10px] font-semibold uppercase tracking-wide text-dc-gray xl:ml-auto xl:pb-4">
                  {{ filteredRegistrations.length }} of {{ displayedRegistrations.length }} shown
                </p>
              </div>

              <Transition name="registration-alphabet-control">
                <RegistrationAlphabetFilter
                  v-if="displayedRegistrations.length > 0"
                  v-model="selectedInitial"
                  :initials="availableInitials"
                />
              </Transition>
            </div>
          </div>

          <div v-if="filteredRegistrations.length === 0" class="px-5 py-12 text-center">
            <p class="text-sm font-semibold text-dc-ink">
              {{
                displayedRegistrations.length === 0
                  ? 'No one has registered yet.'
                  : 'No guests match the selected search and status filters.'
              }}
            </p>
            <button
              v-if="displayedRegistrations.length > 0"
              type="button"
              class="mt-3 min-h-11 font-mono text-xs font-semibold uppercase text-dc-pink"
              @click="search = ''; selectedInitial = ALL_REGISTRATION_INITIALS; selectedGuestStatus = 'all'"
            >
              Clear filters
            </button>
          </div>
          <div
            v-else
            class="registration-guest-scroll divide-y divide-dc-border"
            role="region"
            :aria-label="`Guest list, ${filteredRegistrations.length} people shown`"
            :tabindex="filteredRegistrations.length > 6 ? 0 : undefined"
          >
            <div v-for="registration in filteredRegistrations" :key="registration.id" class="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  <p class="truncate font-bold text-dc-ink">{{ registration.name }}</p>
                  <span
                    v-if="guestStatusLabel(registration)"
                    class="rounded-sm border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase"
                    :class="guestStatusClass(registration)"
                  >
                    {{ guestStatusLabel(registration) }}
                  </span>
                </div>
                <p class="mt-1 truncate text-sm text-dc-gray">{{ registration.email }}</p>
                <p class="mt-1 font-mono text-[10px] uppercase tracking-wide text-dc-gray">
                  Registered {{ formatDateTime(registration.created_at) }} · Email {{ emailStatusLabel(registration.email_status) }}
                </p>
              </div>
              <div
                v-if="
                  (registration.status === 'confirmed' && !registration.checked_in_at)
                  || registration.status !== 'cancelled'
                  || devRegistrationRemovalEnabled
                "
                class="flex flex-wrap gap-2"
              >
                <button
                  v-if="registration.status === 'confirmed' && !registration.checked_in_at"
                  type="button"
                  class="editorial-action min-h-11 justify-center px-4 disabled:opacity-50"
                  :disabled="Boolean(actionRegistrationId)"
                  @click="checkIn(registration)"
                >
                  CHECK IN
                </button>
                <button
                  v-if="registration.status === 'confirmed' && registration.checked_in_at"
                  type="button"
                  class="editorial-action min-h-11 justify-center px-4 disabled:opacity-50"
                  :disabled="Boolean(actionRegistrationId)"
                  @click="pendingCheckInUndo = registration"
                >
                  UNDO CHECK-IN
                </button>
                <button
                  v-if="registration.status !== 'cancelled'"
                  type="button"
                  class="min-h-11 rounded-md border-2 border-dc-ink bg-white px-4 font-mono text-xs font-semibold uppercase text-dc-ink disabled:opacity-50"
                  :disabled="Boolean(actionRegistrationId)"
                  @click="pendingCancellation = registration"
                >
                  Cancel
                </button>
                <button
                  v-if="canRemoveTestGuest"
                  type="button"
                  class="min-h-11 rounded-md border-2 border-red-600 bg-red-50 px-4 font-mono text-xs font-semibold uppercase text-red-700 disabled:opacity-50"
                  :disabled="Boolean(actionRegistrationId)"
                  @click="pendingRemoval = registration"
                >
                  Remove test guest
                </button>
              </div>
            </div>
          </div>
          </section>

          <section
            v-else-if="activeWorkspaceTab === 'form'"
            id="registration-panel-form"
            key="form"
            role="tabpanel"
            aria-labelledby="registration-tab-form"
            class="editorial-panel mt-5 overflow-hidden"
          >
          <div class="border-b border-dc-border bg-dc-paper-warm px-5 py-4">
            <div class="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p class="editorial-eyebrow">form & capacity</p>
                <h2 class="mt-1 text-xl font-bold text-dc-ink">Registration form</h2>
                <p class="mt-1 text-sm leading-6 text-dc-gray">Update what guests see, then control availability and capacity.</p>
              </div>
              <div class="flex flex-wrap gap-2">
                <button
                  type="button"
                  class="editorial-secondary-action min-h-11 justify-center px-4"
                  :aria-expanded="pageDetailsExpanded"
                  aria-controls="registration-page-details"
                  @click="pageDetailsExpanded = !pageDetailsExpanded"
                >
                  {{ pageDetailsExpanded ? 'HIDE DETAILS' : 'EDIT DETAILS' }}
                </button>
                <template v-if="canUsePublicRegistrationForm">
                  <a
                    :href="data?.public_url ?? undefined"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="editorial-secondary-action min-h-11 justify-center px-4"
                  >
                    OPEN FORM
                  </a>
                  <button
                    type="button"
                    class="editorial-action min-h-11 justify-center px-4"
                    @click="copyPublicLink"
                  >
                    <span aria-live="polite">{{ publicLinkCopied ? 'COPIED' : 'COPY FORM' }}</span>
                  </button>
                </template>
                <span
                  v-else
                  class="rounded-sm border border-dc-border bg-white px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-dc-gray"
                >
                  Form link available when open
                </span>
              </div>
            </div>
          </div>

          <Transition name="registration-page-details">
            <div
              v-if="pageDetailsExpanded"
              id="registration-page-details"
              class="border-b border-dc-border p-5"
            >
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p class="editorial-label">Registration page details</p>
                  <p class="mt-1 text-sm leading-6 text-dc-gray">These details appear on the public registration ticket.</p>
                </div>
                <RouterLink
                  :to="{ path: adminPath(`events/${eventId}`), hash: '#event-media' }"
                  class="font-mono text-[10px] font-semibold uppercase tracking-wide text-dc-pink underline decoration-dc-yellow decoration-2 underline-offset-4 hover:text-dc-ink"
                >
                  Manage cover
                </RouterLink>
              </div>
              <form class="mt-4 grid gap-4 md:grid-cols-2" @submit.prevent="savePageDetails">
                <div class="md:col-span-2">
                  <label for="registration-event-name" class="editorial-label">Event name</label>
                  <input id="registration-event-name" v-model="pageDetails.name" class="editorial-input" maxlength="200" required>
                </div>
                <div class="md:col-span-2">
                  <label for="registration-event-description" class="editorial-label">Event About description</label>
                  <textarea id="registration-event-description" v-model="pageDetails.description" class="editorial-input min-h-28 resize-y" maxlength="10000" required />
                  <p class="mt-2 text-xs leading-5 text-dc-gray">Used on the event-details view. The public registration form uses its separate introduction below.</p>
                </div>
                <AppDatePicker v-model="pageDetails.event_date" label="Starts at" mode="datetime" required />
                <AppDatePicker v-model="pageDetails.end_date" label="Ends at" mode="datetime" />
                <AppDropdown v-model="pageDetails.location_mode" label="Location details" :options="pageLocationOptions" />
                <GhanaVenueAutocomplete
                  v-if="pageDetails.location_mode === 'venue'"
                  v-model="pageDetails.location_name"
                  v-model:place-id="pageLocationPlaceId"
                  :disabled="pageDetailsSaving"
                />
                <div v-else>
                  <label for="registration-event-map" class="editorial-label">Google Maps share link</label>
                  <input id="registration-event-map" v-model="pageDetails.location_url" type="url" class="editorial-input" maxlength="2048" placeholder="https://maps.app.goo.gl/..." required>
                </div>
                <div class="flex items-end md:col-start-2">
                  <button type="submit" class="editorial-action min-h-[54px] w-full justify-center disabled:opacity-50" :disabled="!canSavePageDetails">
                    {{ pageDetailsSaving ? 'SAVING…' : 'SAVE PAGE DETAILS' }}
                  </button>
                </div>
              </form>
            </div>
          </Transition>

          <div class="border-b border-dc-border bg-dc-paper-warm px-5 py-3">
            <p class="editorial-label">Registration availability</p>
            <p class="mt-1 text-xs leading-5 text-dc-gray">Control when the form accepts guests and how many places are available.</p>
          </div>
          <form class="grid gap-4 p-5 md:grid-cols-2 lg:grid-cols-3" @submit.prevent="requestSaveSettings">
            <div class="md:col-span-2 lg:col-span-3">
              <label for="campaign-description" class="editorial-label">Registration introduction</label>
              <textarea
                id="campaign-description"
                v-model="settings.description"
                class="editorial-input min-h-28 resize-y"
                maxlength="2000"
                placeholder="Optional message shown above the registration form."
              />
              <p class="mt-2 text-xs leading-5 text-dc-gray">Only text saved here appears on the registration form. Leave it blank for no introduction.</p>
            </div>
            <AppDropdown v-model="settings.status" label="Status" :options="statusOptions" teleport />
            <div>
              <label for="campaign-capacity" class="editorial-label">Capacity</label>
              <input id="campaign-capacity" v-model.number="settings.capacity" type="number" min="1" max="5000" class="editorial-input" required>
            </div>
            <div class="flex items-end">
              <button type="submit" class="editorial-action min-h-[54px] w-full justify-center disabled:opacity-50" :disabled="!canRequestSettingsSave">
                {{ savePending ? 'SAVING…' : 'SAVE SETTINGS' }}
              </button>
            </div>
            <AppDatePicker v-model="settings.opens_at" label="Opens at" mode="datetime" />
            <AppDatePicker v-model="settings.closes_at" label="Closes at" mode="datetime" />
            <div class="rounded-md border border-dc-border bg-dc-paper-warm px-4 py-3">
              <p class="text-sm font-bold text-dc-ink">Automatic overflow</p>
              <p class="mt-1 text-xs leading-5 text-dc-gray">Guests receive places until capacity. Later registrations join the waitlist automatically—there is no approval or auto-confirm setting.</p>
            </div>
          </form>

          <div class="border-t border-dc-border px-5 py-4">
            <p class="editorial-label">Public registration link</p>
            <div class="mt-2 rounded-md border border-dc-border bg-dc-paper-warm px-3 py-3">
              <p class="break-all font-mono text-xs text-dc-gray">
                {{ canUsePublicRegistrationForm ? data?.public_url : 'Open the campaign to expose its public form link.' }}
              </p>
            </div>
          </div>
          </section>

          <section
            v-else-if="activeWorkspaceTab === 'emails'"
            id="registration-panel-emails"
            key="emails"
            role="tabpanel"
            aria-labelledby="registration-tab-emails"
            class="editorial-panel mt-5 overflow-hidden"
          >
          <div class="border-b border-dc-border bg-dc-paper-warm px-5 py-4">
            <div class="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p class="editorial-eyebrow">transactional only</p>
                <h2 class="mt-1 text-xl font-bold text-dc-ink">Registration emails</h2>
                <p class="mt-1 max-w-2xl text-sm leading-6 text-dc-gray">Delivery records for registration receipts, waitlist updates, and promotion notices. This area has no broadcasts, bulk messaging, or exports.</p>
              </div>
              <button
                v-if="emailSummary.failed > 0"
                type="button"
                class="editorial-action min-h-11 justify-center px-4 disabled:opacity-50"
                :disabled="retryPending"
                @click="retryEmails"
              >
                {{ retryPending ? 'RETRYING…' : `RETRY ${emailSummary.failed} FAILED` }}
              </button>
            </div>
          </div>

          <div class="grid gap-3 border-b border-dc-border p-5 sm:grid-cols-2 lg:grid-cols-4">
            <div
              v-for="item in [
                { label: 'Accepted', value: emailSummary.accepted },
                { label: 'Queued', value: emailSummary.pending },
                { label: 'Failed', value: emailSummary.failed },
                { label: 'Not queued', value: emailSummary.notQueued },
              ]"
              :key="item.label"
              class="rounded-lg border border-dc-border bg-white px-4 py-3"
            >
              <p class="font-mono text-[10px] font-semibold uppercase tracking-wide text-dc-gray">{{ item.label }}</p>
              <p class="mt-1 text-2xl font-bold text-dc-ink">{{ item.value }}</p>
            </div>
          </div>

          <div class="grid gap-3 border-b border-dc-border bg-dc-paper-warm p-5 md:grid-cols-3">
            <div class="rounded-md border border-dc-border bg-white px-4 py-3">
              <p class="text-sm font-bold text-dc-ink">Place receipt</p>
              <p class="mt-1 text-xs leading-5 text-dc-gray">Sent automatically when a guest receives a place.</p>
            </div>
            <div class="rounded-md border border-dc-border bg-white px-4 py-3">
              <p class="text-sm font-bold text-dc-ink">Waitlist notice</p>
              <p class="mt-1 text-xs leading-5 text-dc-gray">Sent automatically when capacity overflow is waitlisted.</p>
            </div>
            <div class="rounded-md border border-dc-border bg-white px-4 py-3">
              <p class="text-sm font-bold text-dc-ink">Promotion notice</p>
              <p class="mt-1 text-xs leading-5 text-dc-gray">Sent automatically when a cancellation gives the next waitlisted guest a place.</p>
            </div>
          </div>

          <div v-if="emailRegistrations.length === 0" class="px-5 py-12 text-center text-sm text-dc-gray">
            Delivery records will appear after the first registration.
          </div>
          <div
            v-else
            class="registration-guest-scroll divide-y divide-dc-border"
            role="region"
            aria-label="Registration email delivery records"
            :tabindex="emailRegistrations.length > 6 ? 0 : undefined"
          >
            <div
              v-for="registration in emailRegistrations"
              :key="registration.id"
              class="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div class="min-w-0">
                <p class="truncate font-bold text-dc-ink">{{ registration.name }}</p>
                <p class="mt-1 truncate text-sm text-dc-gray">{{ registration.email }}</p>
                <p class="mt-1 font-mono text-[10px] uppercase tracking-wide text-dc-gray">
                  {{
                    registration.email_kind === 'promotion'
                      ? 'Promotion notice'
                      : registration.status === 'waitlisted'
                        ? 'Waitlist notice'
                        : 'Registration receipt'
                  }}
                </p>
              </div>
              <span
                class="w-fit rounded-sm border px-2 py-1 font-mono text-[10px] font-semibold uppercase"
                :class="emailStatusClass(registration.email_status)"
              >
                {{ emailStatusLabel(registration.email_status) }}
              </span>
            </div>
          </div>
          </section>

          <section
            v-else
            id="registration-panel-blasts"
            key="blasts"
            role="tabpanel"
            aria-labelledby="registration-tab-blasts"
            class="editorial-panel mt-5 overflow-hidden"
          >
            <div class="border-b border-dc-border bg-dc-paper-warm px-5 py-5">
              <div class="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p class="editorial-eyebrow">event updates</p>
                  <h2 class="mt-1 text-xl font-bold text-dc-ink">Email blasts</h2>
                  <p class="mt-1 max-w-2xl text-sm leading-6 text-dc-gray">
                    Send one custom update to confirmed guests. Waitlisted and cancelled guests are never included.
                  </p>
                </div>
                <button
                  v-if="!blastComposerOpen"
                  type="button"
                  class="editorial-action min-h-11 justify-center px-4"
                  :disabled="confirmedBlastRecipients === 0 || confirmedBlastRecipients > 100"
                  @click="openBlastComposer"
                >
                  CREATE BLAST
                </button>
              </div>
              <div class="mt-4 flex flex-wrap gap-2">
                <span class="rounded-sm border border-dc-border bg-white px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-dc-gray">
                  {{ confirmedBlastRecipients }} confirmed guest{{ confirmedBlastRecipients === 1 ? '' : 's' }}
                </span>
                <span class="rounded-sm border border-dc-border bg-white px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-dc-gray">
                  100 recipient limit
                </span>
                <span v-if="blastCapacity?.known" class="rounded-sm border border-dc-border bg-white px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-dc-gray">
                  {{ blastCapacity.safe_recipients_today }} safe today · {{ blastCapacity.protected_reserve }} reserved
                </span>
                <span v-else class="rounded-sm border border-amber-300 bg-amber-50 px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-amber-900">
                  Capacity awaiting provider update
                </span>
              </div>
            </div>

            <div v-if="confirmedBlastRecipients === 0" class="border-b border-dc-border px-5 py-5 text-sm leading-6 text-dc-gray">
              A blast becomes available once at least one guest has a confirmed place.
            </div>
            <div v-else-if="confirmedBlastRecipients > 100" class="border-b border-amber-200 bg-amber-50 px-5 py-5 text-sm leading-6 text-amber-900">
              This event has {{ confirmedBlastRecipients }} confirmed guests. Blasts stop at 100 recipients so an organizer never sends a partial update by accident.
            </div>
            <div v-else-if="blastCapacity?.known && confirmedBlastRecipients > (blastCapacity.safe_recipients_today ?? 0)" class="border-b border-amber-200 bg-amber-50 px-5 py-5 text-sm leading-6 text-amber-900">
              This blast needs {{ confirmedBlastRecipients }} sends, but only {{ blastCapacity.safe_recipients_today }} can send safely today after reserving {{ blastCapacity.protected_reserve }} places for registrations and organizer decisions. Schedule it for a quieter time, or reduce the audience.
            </div>

            <form v-if="blastComposerOpen" class="border-b border-dc-border p-5" @submit.prevent="openBlastPreview">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <p class="font-semibold text-dc-ink">Write the update</p>
                  <p class="mt-1 text-xs leading-5 text-dc-gray">Plain text keeps the message clean in every inbox. Links can be pasted directly.</p>
                </div>
                <button type="button" class="font-mono text-[10px] font-semibold uppercase tracking-wide text-dc-gray" @click="blastComposerOpen = false">
                  Cancel
                </button>
              </div>
              <div class="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_15rem]">
                <div>
                  <label for="blast-subject" class="editorial-label">Subject</label>
                  <input id="blast-subject" v-model="blastSubject" maxlength="160" class="editorial-input" placeholder="A quick update about the event" required>
                </div>
                <AppDatePicker v-model="blastScheduledFor" label="Send later (optional)" mode="datetime" />
              </div>
              <div class="mt-4">
                <p class="editorial-label">Start with</p>
                <div class="mt-2 flex flex-wrap gap-2" aria-label="Blast starter templates">
                  <button
                    v-for="template in blastTemplates"
                    :key="template.id"
                    type="button"
                    class="min-h-10 rounded-md border border-dc-border bg-dc-paper-warm px-3 font-mono text-[10px] font-semibold uppercase tracking-wide text-dc-gray transition-colors duration-150 hover:bg-white"
                    @click="applyBlastTemplate(template.id)"
                  >
                    {{ template.label }}
                  </button>
                </div>
              </div>
              <div class="mt-4">
                <label for="blast-body" class="editorial-label">Message</label>
                <textarea id="blast-body" v-model="blastBody" class="editorial-input min-h-40 resize-none" maxlength="5000" placeholder="Share the update guests need to know." required />
              </div>
              <div class="mt-5 flex flex-wrap items-center justify-between gap-3">
                <p class="text-xs leading-5 text-dc-gray">
                  {{ confirmedBlastRecipients }} confirmed guest{{ confirmedBlastRecipients === 1 ? '' : 's' }} will receive this email.
                </p>
                <button type="submit" class="editorial-action min-h-11 justify-center px-4 disabled:opacity-50" :disabled="!canCreateBlast || blastPending">
                  PREVIEW EMAIL
                </button>
              </div>
            </form>

            <div v-if="blastsQuery.isPending.value" class="px-5 py-6 text-sm text-dc-gray">Loading blast history…</div>
            <div v-else-if="blastsQuery.isError.value" class="flex flex-wrap items-center justify-between gap-3 border-t border-dc-border bg-red-50 px-5 py-5">
              <div>
                <p class="text-sm font-semibold text-red-800">Blast history could not load.</p>
                <p class="mt-1 text-sm text-red-700">Check the event-blasts database setup, then try again.</p>
              </div>
              <button type="button" class="editorial-action min-h-10 px-3 text-[10px]" @click="blastsQuery.refetch()">TRY AGAIN</button>
            </div>
            <div v-else-if="blasts.length === 0" class="px-5 py-6">
              <p class="text-sm font-semibold text-dc-ink">No event updates yet.</p>
              <p class="mt-1 text-sm leading-6 text-dc-gray">Use a blast for a pre-event reminder, venue change, or final detail—not a registration receipt.</p>
            </div>
            <div v-else class="divide-y divide-dc-border">
              <div v-for="blast in blasts" :key="blast.id" class="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div class="min-w-0">
                  <p class="truncate font-bold text-dc-ink">{{ blast.subject }}</p>
                  <p class="mt-1 text-sm text-dc-gray">
                    {{ blast.recipient_count }} confirmed guest{{ blast.recipient_count === 1 ? '' : 's' }}
                    <span v-if="blast.scheduled_for"> · {{ formatDateTime(blast.scheduled_for) }}</span>
                    <span v-else-if="blast.sent_at"> · {{ formatDateTime(blast.sent_at) }}</span>
                  </p>
                </div>
                <div class="flex w-fit items-center gap-2">
                  <span class="rounded-sm border px-2 py-1 font-mono text-[10px] font-semibold uppercase" :class="blastStatusClass(blast.status)">
                    {{ blastStatusLabel(blast.status) }}
                  </span>
                  <button
                    v-if="blast.status === 'failed' && blast.provider_broadcast_id"
                    type="button"
                    class="editorial-secondary-action min-h-8 px-2 text-[9px]"
                    :disabled="blastRetryId === blast.id"
                    @click="retryBlast(blast)"
                  >
                    {{ blastRetryId === blast.id ? 'RETRYING…' : 'RETRY SEND' }}
                  </button>
                </div>
              </div>
            </div>
          </section>
        </Transition>
      </template>
    </div>

    <BlastEmailPreview
      :open="blastPreviewOpen"
      :subject="blastSubject"
      :body="blastBody"
      :event="data?.event ?? null"
      :action-label="blastScheduledFor ? `SCHEDULE FOR ${formatDateTime(toIso(blastScheduledFor) ?? new Date().toISOString())}` : `SEND TO ${confirmedBlastRecipients} GUEST${confirmedBlastRecipients === 1 ? '' : 'S'}`"
      :busy="blastPending"
      @close="blastPreviewOpen = false"
      @confirm="sendBlast"
    />

    <ConfirmDialog
      :open="reopenRegistrationConfirmationOpen"
      title="Reopen registration?"
      message="This will accept guests immediately and remove the previous opening and closing schedule."
      confirm-label="Reopen registration"
      busy-label="Reopening..."
      cancel-label="Keep closed"
      :busy="reopenRegistrationPending"
      @cancel="reopenRegistrationConfirmationOpen = false"
      @confirm="reopenRegistration"
    />

    <ConfirmDialog
      :open="settingsConfirmationOpen"
      :title="settingsConfirmationTitle"
      :message="settingsConfirmationMessage"
      confirm-label="Save changes"
      busy-label="Saving..."
      cancel-label="Keep editing"
      :busy="savePending"
      @cancel="settingsConfirmationOpen = false"
      @confirm="saveSettings"
    >
      <ul
        class="max-h-64 space-y-2 overflow-y-auto pr-1"
        aria-label="Registration setting changes"
      >
        <li
          v-for="row in settingsReviewRows"
          :key="row.field"
          class="rounded-md border border-dc-border bg-dc-paper-warm px-3 py-2.5"
        >
          <p class="font-mono text-[10px] font-semibold uppercase tracking-wide text-dc-gray">
            {{ row.label }}
          </p>
          <div class="mt-1 flex flex-wrap items-center gap-2 text-sm font-semibold text-dc-ink">
            <span
              v-if="row.before"
              class="text-dc-gray line-through decoration-dc-pink/70"
            >
              {{ row.before }}
            </span>
            <span v-if="row.before" aria-hidden="true">→</span>
            <span>{{ row.after }}</span>
          </div>
        </li>
      </ul>
    </ConfirmDialog>

    <ConfirmDialog
      :open="Boolean(pendingCheckInUndo)"
      title="Undo check-in?"
      :message="pendingCheckInUndo ? `Remove the check-in record for ${pendingCheckInUndo.name}? Their registration will remain active.` : ''"
      confirm-label="Undo check-in"
      busy-label="Undoing..."
      cancel-label="Keep check-in"
      :busy="Boolean(actionRegistrationId)"
      @cancel="pendingCheckInUndo = null"
      @confirm="confirmCheckInUndo"
    />

    <ConfirmDialog
      :open="Boolean(pendingCancellation)"
      title="Cancel registration?"
      :message="pendingCancellation ? `Remove ${pendingCancellation.name} from the active guest list?` : ''"
      confirm-label="Cancel registration"
      busy-label="Cancelling..."
      cancel-label="Keep registration"
      danger
      :busy="Boolean(actionRegistrationId)"
      @cancel="pendingCancellation = null"
      @confirm="confirmCancellation"
    />

    <ConfirmDialog
      :open="Boolean(pendingRemoval) && canRemoveTestGuest"
      title="Remove test guest?"
      :message="pendingRemoval ? `${pendingRemoval.name} (${pendingRemoval.email}) and their check-in and email-delivery records will be permanently deleted. This cannot be undone.` : ''"
      confirm-label="Remove guest"
      busy-label="Removing..."
      cancel-label="Keep guest"
      danger
      :busy="Boolean(actionRegistrationId)"
      @cancel="pendingRemoval = null"
      @confirm="confirmRemoval"
    />
  </div>
</template>

<style scoped>
.registration-page-wrap {
  padding-top: clamp(1rem, 2vh, 1.5rem);
  padding-bottom: clamp(1rem, 2vh, 1.5rem);
}

.registration-page-header {
  margin-bottom: 0.5rem;
}

.registration-page-header h1 {
  color: #111111;
  font-size: clamp(2.125rem, 3.5vw, 2.75rem);
  font-weight: 800;
  letter-spacing: -0.04em;
  line-height: 1;
}

.registration-page-header p {
  max-width: 42rem;
  margin-top: 0.5rem;
  color: #6f6c65;
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1.5;
}

.registration-workspace-tabs {
  display: flex;
  gap: 1.5rem;
  overflow-x: auto;
  border-bottom: 1px solid #d6d2c8;
  padding: 0 0.125rem;
  scrollbar-width: none;
}

.registration-workspace-tabs::-webkit-scrollbar {
  display: none;
}

.registration-workspace-tab {
  position: relative;
  display: inline-flex;
  align-items: center;
  min-height: 2.875rem;
  flex: 0 0 auto;
  gap: 0.45rem;
  padding: 0.125rem 0;
  color: #6f6c65;
  font-size: 0.8125rem;
  font-weight: 600;
  letter-spacing: 0;
  transition:
    color 150ms cubic-bezier(0.4, 0, 0.2, 1),
    transform 100ms cubic-bezier(0.4, 0, 0.2, 1);
}

.registration-workspace-tab-icon {
  width: 0.9rem;
  height: 0.9rem;
  flex: 0 0 auto;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.7;
}

.registration-workspace-tab::after {
  position: absolute;
  right: 0;
  bottom: -1px;
  left: 0;
  height: 2px;
  border-radius: 999px;
  background: #e8117f;
  content: '';
  opacity: 0;
  transform: scaleX(0.5);
  transform-origin: center;
  transition:
    opacity 150ms cubic-bezier(0.4, 0, 0.2, 1),
    transform 200ms cubic-bezier(0.16, 1, 0.3, 1);
}

.registration-workspace-tab[aria-selected='true'] {
  color: #111111;
}

.registration-workspace-tab[aria-selected='true']::after {
  opacity: 1;
  transform: scaleX(1);
}

.registration-workspace-tab:focus-visible {
  border-radius: 6px;
  outline: 2px solid rgba(232, 17, 127, 0.35);
  outline-offset: 3px;
}

.registration-workspace-tab:active {
  transform: scale(0.97);
}

.registration-overview {
  border: 1px solid #d6d2c8;
  border-radius: 12px;
  background: #ffffff;
  padding: clamp(1.25rem, 2.6vw, 2rem);
  box-shadow: 0 1px 0 rgba(17, 17, 17, 0.06);
}

.registration-overview-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.registration-overview-header h2 {
  color: #111111;
  font-size: 1.25rem;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.registration-overview-header-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 0.625rem;
}

.registration-overview-updated {
  color: #85817a;
  font-family: var(--font-mono);
  font-size: 0.625rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.registration-overview-refresh {
  display: inline-flex;
  min-height: 2.25rem;
  align-items: center;
  gap: 0.4rem;
  border: 1px solid #d6d2c8;
  border-radius: 8px;
  padding: 0.4rem 0.7rem;
  background: #ffffff;
  color: #111111;
  font-family: var(--font-mono);
  font-size: 0.625rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  transition:
    border-color 150ms cubic-bezier(0.4, 0, 0.2, 1),
    opacity 150ms cubic-bezier(0.4, 0, 0.2, 1),
    transform 100ms cubic-bezier(0.4, 0, 0.2, 1);
}

.registration-overview-refresh svg {
  width: 0.875rem;
  height: 0.875rem;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.7;
}

.registration-overview-refresh:disabled {
  cursor: wait;
  opacity: 0.55;
}

.registration-overview-reopen {
  border-color: #e8117f;
  background: #e8117f;
  color: #ffffff;
}

.registration-overview-qr-link {
  border-color: #111111;
  background: #fff7bf;
}

@media (hover: hover) and (pointer: fine) {
  .registration-overview-refresh:not(:disabled):hover {
    border-color: #111111;
  }

  .registration-overview-reopen:not(:disabled):hover {
    border-color: #c90f6f;
    background: #c90f6f;
  }
}

.registration-overview-metrics {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 2rem;
  margin-top: clamp(2rem, 5vw, 3.5rem);
}

.registration-overview-figure {
  display: flex;
  min-height: 4rem;
  align-items: baseline;
  gap: 0.5rem;
  color: #111111;
  line-height: 1;
}

.registration-overview-figure strong {
  display: inline-block;
  min-width: 1ch;
  font-size: clamp(3rem, 6vw, 4.5rem);
  font-weight: 800;
  letter-spacing: -0.055em;
}

.registration-overview-figure span {
  color: #85817a;
  font-size: clamp(1.5rem, 3vw, 2rem);
  font-weight: 600;
  letter-spacing: -0.035em;
}

.registration-overview-primary > p:last-child,
.registration-overview-secondary span {
  color: #6f6c65;
  font-size: 0.875rem;
  font-weight: 600;
}

.registration-overview-secondary {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  text-align: right;
}

.registration-overview-secondary strong {
  color: #111111;
  font-size: clamp(2rem, 4vw, 3rem);
  font-weight: 800;
  letter-spacing: -0.045em;
  line-height: 1.05;
}

.registration-overview-progress-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 1rem;
  margin-top: 1.75rem;
}

.registration-overview-progress {
  height: 0.5rem;
  overflow: hidden;
  border-radius: 999px;
  background: #e9e6de;
  box-shadow: inset 0 0 0 1px rgba(17, 17, 17, 0.05);
}

.registration-overview-progress-fill {
  width: 100%;
  height: 100%;
  border-radius: inherit;
  background: #148461;
  transform-origin: left center;
  transition: transform 250ms cubic-bezier(0.16, 1, 0.3, 1);
}

.registration-overview-progress-row > p {
  min-width: 4.5rem;
  color: #6f6c65;
  font-size: 0.75rem;
  font-weight: 700;
  text-align: right;
}

.registration-overview-empty,
.registration-overview-details {
  margin-top: 1.75rem;
  border-top: 1px solid #e2ded5;
  padding-top: 1.25rem;
}

.registration-overview-empty {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1rem 2rem;
}

.registration-overview-empty-title {
  color: #111111;
  font-size: 0.9375rem;
  font-weight: 700;
}

.registration-overview-empty-copy {
  margin-top: 0.25rem;
  color: #6f6c65;
  font-size: 0.8125rem;
  line-height: 1.55;
}

.registration-overview-action {
  display: inline-flex;
  min-height: 2.75rem;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  border-radius: 8px;
  padding: 0.625rem 1rem;
  background: #e8117f;
  color: #ffffff;
  font-size: 0.8125rem;
  font-weight: 700;
}

.registration-overview-action svg {
  width: 1.125rem;
  height: 1.125rem;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.6;
}

.registration-overview-action:focus-visible {
  outline: 3px solid rgba(232, 17, 127, 0.28);
  outline-offset: 3px;
}

.registration-overview-details {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem 1.5rem;
}

.registration-overview-detail {
  display: inline-flex;
  align-items: baseline;
  gap: 0.375rem;
  color: #6f6c65;
  font-size: 0.8125rem;
  font-weight: 600;
}

.registration-overview-detail strong {
  color: #111111;
  font-size: 1.125rem;
}

.registration-overview-detail--waitlist,
.registration-overview-detail--waitlist strong {
  color: #866a00;
}

.registration-overview--inactive .registration-overview-metrics,
.registration-overview--inactive .registration-overview-progress-row,
.registration-overview--inactive .registration-overview-details {
  opacity: 0.55;
}

.registration-value-enter-active,
.registration-value-leave-active {
  transition:
    opacity 140ms cubic-bezier(0.4, 0, 0.2, 1),
    transform 180ms cubic-bezier(0.16, 1, 0.3, 1);
}

.registration-value-enter-from {
  opacity: 0;
  transform: translate3d(0, 0.35rem, 0);
}

.registration-value-leave-to {
  opacity: 0;
  transform: translate3d(0, -0.25rem, 0);
}

.registration-panel-forward-enter-active,
.registration-panel-forward-leave-active,
.registration-panel-backward-enter-active,
.registration-panel-backward-leave-active {
  transition:
    opacity 160ms cubic-bezier(0.4, 0, 0.2, 1),
    transform 220ms cubic-bezier(0.16, 1, 0.3, 1);
}

.registration-panel-forward-enter-from,
.registration-panel-backward-leave-to {
  opacity: 0;
  transform: translate3d(1rem, 0, 0);
}

.registration-panel-forward-leave-to,
.registration-panel-backward-enter-from {
  opacity: 0;
  transform: translate3d(-0.75rem, 0, 0);
}

.registration-page-details-enter-active,
.registration-page-details-leave-active {
  transition:
    opacity 160ms cubic-bezier(0.4, 0, 0.2, 1),
    transform 220ms cubic-bezier(0.16, 1, 0.3, 1);
}

.registration-page-details-enter-from,
.registration-page-details-leave-to {
  opacity: 0;
  transform: translate3d(0, -0.5rem, 0);
}

.registration-overview-control-enter-active,
.registration-overview-control-leave-active {
  transition:
    opacity 140ms cubic-bezier(0.4, 0, 0.2, 1),
    transform 180ms cubic-bezier(0.16, 1, 0.3, 1);
}

.registration-overview-control-enter-from,
.registration-overview-control-leave-to {
  opacity: 0;
  transform: translate3d(0.35rem, 0, 0);
}

.registration-alphabet-control-enter-active,
.registration-alphabet-control-leave-active {
  transition:
    opacity 140ms cubic-bezier(0.4, 0, 0.2, 1),
    transform 180ms cubic-bezier(0.16, 1, 0.3, 1);
}

.registration-alphabet-control-enter-from,
.registration-alphabet-control-leave-to {
  opacity: 0;
  transform: translate3d(0, -0.35rem, 0);
}

@media (hover: hover) and (pointer: fine) {
  .registration-workspace-tab:hover {
    color: #111111;
  }

  .registration-overview-action:hover {
    background: #c90f6f;
  }
}

@media (max-width: 639px) {
  .registration-page-header {
    margin-bottom: 0.5rem;
    padding-bottom: 0;
  }

  .registration-page-header h1 {
    font-size: 2rem;
    letter-spacing: -0.035em;
    line-height: 1;
  }

  .registration-page-header p {
    margin-top: 0.625rem;
    font-size: 0.875rem;
  }

  .registration-workspace-tabs {
    gap: 1.125rem;
  }

  .registration-overview-metrics {
    grid-template-columns: minmax(0, 1fr);
    gap: 1.5rem;
  }

  .registration-overview-secondary {
    align-items: flex-start;
    text-align: left;
  }

  .registration-overview-progress-row {
    grid-template-columns: minmax(0, 1fr);
    gap: 0.5rem;
  }

  .registration-overview-progress-row > p {
    text-align: left;
  }
}

@media (prefers-reduced-motion: reduce) {
  .registration-workspace-tab,
  .registration-workspace-tab::after,
  .registration-overview-progress-fill,
  .registration-value-enter-active,
  .registration-value-leave-active,
  .registration-panel-forward-enter-active,
  .registration-panel-forward-leave-active,
  .registration-panel-backward-enter-active,
  .registration-panel-backward-leave-active,
  .registration-page-details-enter-active,
  .registration-page-details-leave-active,
  .registration-overview-control-enter-active,
  .registration-overview-control-leave-active,
  .registration-alphabet-control-enter-active,
  .registration-alphabet-control-leave-active {
    transition: none;
  }

  .registration-workspace-tab:active,
  .registration-value-enter-from,
  .registration-value-leave-to,
  .registration-panel-forward-enter-from,
  .registration-panel-forward-leave-to,
  .registration-panel-backward-enter-from,
  .registration-panel-backward-leave-to,
  .registration-page-details-enter-from,
  .registration-page-details-leave-to,
  .registration-overview-control-enter-from,
  .registration-overview-control-leave-to,
  .registration-alphabet-control-enter-from,
  .registration-alphabet-control-leave-to {
    transform: none;
  }
}
</style>
