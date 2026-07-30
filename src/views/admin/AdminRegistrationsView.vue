<script setup lang="ts">
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import AppDropdown from '@/src/components/AppDropdown.vue';
import AppDatePicker from '@/src/components/ui/AppDatePicker.vue';
import ConfirmDialog from '@/src/components/ui/ConfirmDialog.vue';
import RegistrationAlphabetFilter from '@/src/components/ui/RegistrationAlphabetFilter.vue';
import {
  cancelEventRegistration,
  checkInEventRegistration,
  fetchEventRegistrations,
  processEventRegistrationEmails,
  queryKeys,
  removeEventRegistration,
  updateEventRegistrationCampaign,
} from '@/src/lib/api';
import { notify } from '@/src/lib/notify';
import {
  ALL_REGISTRATION_INITIALS,
  registrationInitials,
} from '@/src/lib/registration-checkin';
import {
  changedRegistrationSettings,
  isInitialRegistrationSetupState,
  REGISTRATION_SETTINGS_FIELDS,
  REGISTRATION_SETUP_HISTORY_KEY,
  type RegistrationSettingsDraft,
  type RegistrationSettingsField,
} from '@/src/lib/registration-settings';
import {
  filterRegistrationGuests,
  summarizeRegistrationEmails,
  summarizeRegistrationWorkspace,
  type RegistrationGuestFilter,
} from '@/src/lib/registration-workspace';
import type { EventRegistration } from '@/types';

type RegistrationWorkspaceTab = 'summary' | 'guests' | 'form' | 'emails';
type RegistrationOverviewPhase = 'before' | 'live' | 'after';

const route = useRoute();
const queryClient = useQueryClient();
const eventId = computed(() => String(route.params.eventId ?? ''));
const registrationQuery = useQuery({
  queryKey: computed(() => queryKeys.eventRegistrations(eventId.value)),
  queryFn: () => fetchEventRegistrations(eventId.value),
  enabled: computed(() => Boolean(eventId.value)),
});
const settings = reactive({
  status: 'draft' as 'draft' | 'open' | 'closed',
  capacity: 100,
  opens_at: '',
  closes_at: '',
});
const activeWorkspaceTab = ref<RegistrationWorkspaceTab>('summary');
const workspacePanelTransition = ref('registration-panel-forward');
const search = ref('');
const selectedInitial = ref(ALL_REGISTRATION_INITIALS);
const selectedGuestStatus = ref<RegistrationGuestFilter>('all');
const savePending = ref(false);
const settingsConfirmationOpen = ref(false);
const retryPending = ref(false);
const actionRegistrationId = ref<string | null>(null);
const pendingCancellation = ref<EventRegistration | null>(null);
const pendingRemoval = ref<EventRegistration | null>(null);
const savedSettings = ref<RegistrationSettingsDraft | null>(null);
const initialSetupActive = ref(consumeInitialSetupFlag());
const publicLinkCopied = ref(false);
const devRegistrationRemovalEnabled = import.meta.env.DEV;
let publicLinkFeedbackTimer: ReturnType<typeof setTimeout> | null = null;

if (initialSetupActive.value) {
  activeWorkspaceTab.value = 'form';
}

const statusOptions = [
  { value: 'draft', label: 'Draft' },
  { value: 'open', label: 'Open' },
  { value: 'closed', label: 'Closed' },
];
const workspaceTabs: Array<{
  id: RegistrationWorkspaceTab;
  label: string;
}> = [
  { id: 'summary', label: 'Summary' },
  { id: 'guests', label: 'Guests' },
  { id: 'form', label: 'Form & capacity' },
  { id: 'emails', label: 'Emails' },
];
const data = computed(() => registrationQuery.data.value ?? null);
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
const registrationOverview = computed(() => {
  const summary = workspaceSummary.value;
  const phase = registrationOverviewPhase.value;
  const campaignStatus = data.value?.campaign?.status ?? 'draft';

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
      statusLabel: 'Registration unavailable',
      statusTone: 'neutral',
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
      statusLabel: 'Event complete',
      statusTone: 'neutral',
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
      statusLabel: 'Event in progress',
      statusTone: 'positive',
    };
  }

  const progressPercent = summary.capacity > 0
    ? Math.min(100, Math.round((summary.going / summary.capacity) * 100))
    : 0;
  const statusLabel = campaignStatus === 'open'
    ? 'Registration open'
    : campaignStatus === 'closed'
      ? 'Registration closed'
      : 'Registration draft';

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
    statusLabel,
    statusTone: campaignStatus === 'open'
      ? 'positive'
      : campaignStatus === 'draft'
        ? 'attention'
        : 'neutral',
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
    : data.value?.campaign?.status === 'closed'
      ? 'Registration is closed. Review the form settings before inviting guests.'
      : 'Finish the form settings and open registration when you are ready to invite guests.'
));
const registrationOverviewActionLabel = computed(() => (
  canUsePublicRegistrationForm.value
    ? publicLinkCopied.value
      ? 'Link copied'
      : 'Copy registration link'
    : 'Review form settings'
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
  && data.value?.campaign?.status === 'open'
));
const currentSettings = computed<RegistrationSettingsDraft>(() => ({
  status: settings.status,
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
const canRequestSettingsSave = computed(() => Boolean(
  savedSettings.value
  && !savePending.value
  && !settingsConfirmationOpen.value
  && (initialSetupActive.value || hasSettingsChanges.value)
));
const settingsReviewRows = computed(() => {
  const baseline = savedSettings.value;
  if (!baseline) return [];

  const fields = changedSettingFields.value.length > 0
    ? changedSettingFields.value
    : initialSetupActive.value
      ? REGISTRATION_SETTINGS_FIELDS
      : [];

  return fields.map((field) => ({
    field,
    label: settingLabel(field),
    before: changedSettingFields.value.includes(field)
      ? displaySettingValue(field, baseline[field])
      : null,
    after: displaySettingValue(field, currentSettings.value[field]),
  }));
});
const settingsConfirmationTitle = computed(() => (
  hasSettingsChanges.value ? 'Save registration changes?' : 'Confirm registration settings?'
));
const settingsConfirmationMessage = computed(() => (
  hasSettingsChanges.value
    ? `Review ${changedSettingFields.value.length} change${changedSettingFields.value.length === 1 ? '' : 's'} before updating the campaign.`
    : 'These are the initial settings created with the event. Confirm them before continuing.'
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
    capacity: campaign.capacity,
    opens_at: toLocalDateTime(campaign.opens_at),
    closes_at: toLocalDateTime(campaign.closes_at),
  };
  Object.assign(settings, snapshot);
  savedSettings.value = { ...snapshot };
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

function consumeInitialSetupFlag(): boolean {
  if (typeof window === 'undefined' || !isInitialRegistrationSetupState(window.history.state)) {
    return false;
  }

  const nextState = { ...window.history.state };
  delete nextState[REGISTRATION_SETUP_HISTORY_KEY];
  window.history.replaceState(nextState, '');
  return true;
}

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

async function refresh() {
  await queryClient.invalidateQueries({ queryKey: queryKeys.eventRegistrations(eventId.value) });
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
      capacity: settings.capacity,
      opens_at: toIso(settings.opens_at),
      closes_at: toIso(settings.closes_at),
    });
    await refresh();
    settingsConfirmationOpen.value = false;
    initialSetupActive.value = false;
    notify.success(settings.status === 'open' ? 'Registration is open.' : 'Registration settings saved.');
  } catch (error) {
    notify.error(error instanceof Error ? error.message : 'Unable to save registration settings.');
  } finally {
    savePending.value = false;
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
  if (!registration || actionRegistrationId.value || !devRegistrationRemovalEnabled) return;
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
    <div class="editorial-wrap">
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

      <div v-if="registrationQuery.isPending.value" class="editorial-panel min-h-80 animate-pulse" />
      <div v-else-if="registrationQuery.isError.value || !data" class="rounded-md border-2 border-red-500 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
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
            {{ tab.label }}
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
          >
            <div class="registration-overview-header">
              <h2>Registration overview</h2>
              <span
                class="registration-overview-status"
                :class="`registration-overview-status--${registrationOverview.statusTone}`"
              >
                {{ registrationOverview.statusLabel }}
              </span>
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
              <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div class="w-full max-w-md">
                  <label for="guest-search" class="editorial-label">Search guests</label>
                  <input id="guest-search" v-model="search" type="search" class="editorial-input" placeholder="Name or email">
                </div>
                <p class="shrink-0 font-mono text-[10px] font-semibold uppercase tracking-wide text-dc-gray">
                  {{ filteredRegistrations.length }} of {{ displayedRegistrations.length }} shown
                </p>
              </div>

              <div class="flex flex-wrap gap-2" aria-label="Guest status filters">
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

              <RegistrationAlphabetFilter
                v-model="selectedInitial"
                :initials="availableInitials"
              />
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
                  v-if="registration.status !== 'cancelled'"
                  type="button"
                  class="min-h-11 rounded-md border-2 border-dc-ink bg-white px-4 font-mono text-xs font-semibold uppercase text-dc-ink disabled:opacity-50"
                  :disabled="Boolean(actionRegistrationId)"
                  @click="pendingCancellation = registration"
                >
                  Cancel
                </button>
                <button
                  v-if="devRegistrationRemovalEnabled"
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
                <h2 class="mt-1 text-xl font-bold text-dc-ink">Registration availability</h2>
                <p class="mt-1 text-sm leading-6 text-dc-gray">Control when the form is public and how many guests receive places.</p>
              </div>
              <div v-if="canUsePublicRegistrationForm" class="flex flex-wrap gap-2">
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
              </div>
              <span
                v-else
                class="rounded-sm border border-dc-border bg-white px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-dc-gray"
              >
                Form link available when open
              </span>
            </div>
          </div>

          <form class="grid gap-4 p-5 md:grid-cols-2 lg:grid-cols-3" @submit.prevent="requestSaveSettings">
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
            v-else
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
        </Transition>
      </template>
    </div>

    <ConfirmDialog
      :open="settingsConfirmationOpen"
      :title="settingsConfirmationTitle"
      :message="settingsConfirmationMessage"
      :confirm-label="hasSettingsChanges ? 'Save changes' : 'Confirm settings'"
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
      :open="Boolean(pendingRemoval)"
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
.registration-page-header {
  margin-bottom: 2rem;
  border-bottom: 1px solid #d6d2c8;
  padding-bottom: 1.5rem;
}

.registration-page-header h1 {
  color: #111111;
  font-size: clamp(2.25rem, 5vw, 3.25rem);
  font-weight: 800;
  letter-spacing: -0.04em;
  line-height: 0.98;
}

.registration-page-header p {
  max-width: 42rem;
  margin-top: 0.75rem;
  color: #6f6c65;
  font-size: 0.9375rem;
  font-weight: 500;
  line-height: 1.6;
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
  min-height: 3.25rem;
  flex: 0 0 auto;
  padding: 0.125rem 0;
  color: #6f6c65;
  font-size: 0.8125rem;
  font-weight: 600;
  letter-spacing: 0;
  transition:
    color 150ms cubic-bezier(0.4, 0, 0.2, 1),
    transform 100ms cubic-bezier(0.4, 0, 0.2, 1);
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

.registration-overview-status {
  display: inline-flex;
  min-height: 1.875rem;
  align-items: center;
  border: 1px solid #d6d2c8;
  border-radius: 999px;
  padding: 0.25rem 0.75rem;
  background: #faf9f5;
  color: #625f58;
  font-size: 0.75rem;
  font-weight: 700;
}

.registration-overview-status--positive {
  border-color: #a8d9c8;
  background: #eef9f4;
  color: #0f7154;
}

.registration-overview-status--attention {
  border-color: #e8d37c;
  background: #fff9dc;
  color: #785f00;
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
    margin-bottom: 1.5rem;
    padding-bottom: 1.125rem;
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
  .registration-panel-backward-leave-active {
    transition: none;
  }

  .registration-workspace-tab:active,
  .registration-value-enter-from,
  .registration-value-leave-to,
  .registration-panel-forward-enter-from,
  .registration-panel-forward-leave-to,
  .registration-panel-backward-enter-from,
  .registration-panel-backward-leave-to {
    transform: none;
  }
}
</style>
