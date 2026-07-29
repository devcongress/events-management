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
  { id: 'form', label: 'Form & Capacity' },
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
const capacityUsePercent = computed(() => {
  const summary = workspaceSummary.value;
  if (!summary || summary.capacity <= 0) return 0;
  return Math.min(100, Math.round((summary.going / summary.capacity) * 100));
});
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
      <div class="editorial-header">
        <div>
          <p class="editorial-eyebrow">registration</p>
          <h1 class="editorial-title">{{ data && !managedInternally ? 'Registration History' : 'Registration' }}</h1>
          <p class="editorial-subtitle">
            {{
              data && !managedInternally
                ? 'Review how registration records are represented for this event.'
                : data?.event?.name
                  ? `Manage places, guests, and transactional delivery for ${data.event.name}.`
                  : 'Manage places, guests, and transactional delivery for this event.'
            }}
          </p>
        </div>
      </div>

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
            :class="activeWorkspaceTab === tab.id
              ? 'border-dc-yellow text-[#E5E5E5]'
              : 'border-transparent text-[#A1A1A1]'"
            :aria-selected="activeWorkspaceTab === tab.id"
            :aria-controls="`registration-panel-${tab.id}`"
            :tabindex="activeWorkspaceTab === tab.id ? 0 : -1"
            @click="activeWorkspaceTab = tab.id"
          >
            {{ tab.label }}
          </button>
        </div>

        <section
          v-if="activeWorkspaceTab === 'summary'"
          id="registration-panel-summary"
          role="tabpanel"
          aria-labelledby="registration-tab-summary"
          class="editorial-panel mt-5 overflow-hidden"
        >
          <div class="border-b border-dc-border bg-dc-paper-warm px-5 py-5 sm:px-6">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p class="editorial-eyebrow">at a glance</p>
                <h2 class="mt-1 text-2xl font-bold text-dc-ink">Guest position</h2>
              </div>
              <span class="rounded-sm border border-dc-border bg-white px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-wide text-dc-gray">
                {{ data?.campaign?.status ?? 'Unavailable' }}
              </span>
            </div>
          </div>

          <div class="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
            <div class="rounded-lg border border-dc-border bg-white p-5 sm:p-6">
              <div class="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p class="text-3xl font-bold tracking-tight text-emerald-700">
                    <span aria-hidden="true">●</span>
                    {{ workspaceSummary?.going ?? 0 }} going
                  </p>
                  <p class="mt-1 text-sm text-dc-gray">
                    Registered guests receive a place immediately until capacity is reached.
                  </p>
                </div>
                <p class="text-right text-sm font-semibold text-dc-gray">
                  Capacity
                  <span class="ml-1 text-2xl font-bold text-dc-ink">{{ workspaceSummary?.capacity ?? 0 }}</span>
                </p>
              </div>

              <div
                class="mt-6 h-3 overflow-hidden rounded-full bg-dc-paper-warm"
                role="progressbar"
                aria-label="Places allocated"
                aria-valuemin="0"
                :aria-valuemax="workspaceSummary?.capacity ?? 0"
                :aria-valuenow="workspaceSummary?.going ?? 0"
              >
                <div
                  class="h-full rounded-full bg-emerald-500"
                  :style="{ width: `${capacityUsePercent}%` }"
                />
              </div>

              <div
                v-if="(workspaceSummary?.waitlisted ?? 0) > 0"
                class="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-dc-border pt-4"
              >
                <p class="font-semibold text-amber-700">
                  <span aria-hidden="true">●</span>
                  {{ workspaceSummary?.waitlisted }} waitlisted
                </p>
                <p class="text-sm text-dc-gray">Capacity is full; overflow is being held automatically.</p>
              </div>
              <p
                v-else
                class="mt-4 border-t border-dc-border pt-4 text-sm leading-6 text-dc-gray"
              >
                The waitlist stays out of the way until capacity is reached, then overflow registrations join it automatically.
              </p>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div
                v-for="item in [
                  { label: 'Places left', value: workspaceSummary?.placesLeft ?? 0 },
                  { label: 'Checked in', value: workspaceSummary?.checkedIn ?? 0 },
                  { label: 'Cancelled', value: workspaceSummary?.cancelled ?? 0 },
                ]"
                :key="item.label"
                class="rounded-lg border border-dc-border bg-white px-4 py-4"
              >
                <p class="font-mono text-[10px] font-semibold uppercase tracking-wide text-dc-gray">{{ item.label }}</p>
                <p class="mt-2 text-3xl font-bold text-dc-ink">{{ item.value }}</p>
              </div>
              <div
                v-if="workspaceSummary?.eventEnded"
                class="rounded-lg border border-red-200 bg-red-50 px-4 py-4"
              >
                <p class="font-mono text-[10px] font-semibold uppercase tracking-wide text-red-700">No-shows</p>
                <p class="mt-2 text-3xl font-bold text-red-700">{{ workspaceSummary?.noShows ?? 0 }}</p>
              </div>
              <div
                v-else
                class="rounded-lg border border-dc-border bg-dc-paper-warm px-4 py-4"
              >
                <p class="font-mono text-[10px] font-semibold uppercase tracking-wide text-dc-gray">No-shows</p>
                <p class="mt-2 text-sm font-semibold leading-5 text-dc-gray">Available after the event</p>
              </div>
            </div>
          </div>
        </section>

        <section
          v-else-if="activeWorkspaceTab === 'guests'"
          id="registration-panel-guests"
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
                    ? 'border-dc-ink bg-dc-ink text-white'
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
.registration-workspace-tabs {
  display: flex;
  gap: 0.25rem;
  overflow-x: auto;
  border: 1px solid #1c1c1c;
  border-radius: 8px;
  background: #1c1c1c;
  padding: 0 0.5rem;
  scrollbar-width: none;
}

.registration-workspace-tabs::-webkit-scrollbar {
  display: none;
}

.registration-workspace-tab {
  min-height: 3rem;
  flex: 0 0 auto;
  border-bottom-width: 3px;
  padding: 0 0.875rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  transition: transform 100ms cubic-bezier(0.4, 0, 0.2, 1);
}

.registration-workspace-tab:active {
  transform: scale(0.97);
}

@media (hover: hover) and (pointer: fine) {
  .registration-workspace-tab:hover {
    color: #e5e5e5;
  }
}

@media (prefers-reduced-motion: reduce) {
  .registration-workspace-tab {
    transition: none;
  }

  .registration-workspace-tab:active {
    transform: none;
  }
}
</style>
