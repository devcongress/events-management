<script setup lang="ts">
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import AppDropdown from '@/src/components/AppDropdown.vue';
import AppDatePicker from '@/src/components/ui/AppDatePicker.vue';
import ConfirmDialog from '@/src/components/ui/ConfirmDialog.vue';
import RegistrationAlphabetFilter from '@/src/components/ui/RegistrationAlphabetFilter.vue';
import { summarizeEventRegistrations } from '@/lib/event-registration';
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
  filterRegistrationsForCheckIn,
  registrationInitials,
  SIMULATED_REGISTRATION_COUNT,
} from '@/src/lib/registration-checkin';
import {
  changedRegistrationSettings,
  isInitialRegistrationSetupState,
  REGISTRATION_SETTINGS_FIELDS,
  REGISTRATION_SETUP_HISTORY_KEY,
  type RegistrationSettingsDraft,
  type RegistrationSettingsField,
} from '@/src/lib/registration-settings';
import type { EventRegistration, EventRegistrationSummary } from '@/types';

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
  waitlist_enabled: true,
  auto_confirm: true,
});
const search = ref('');
const selectedInitial = ref(ALL_REGISTRATION_INITIALS);
const simulationActive = ref(false);
const simulatedRegistrations = ref<EventRegistration[]>([]);
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
const devRegistrationSimulationEnabled = import.meta.env.DEV;
const simulatedRegistrationCapacity = 100;
let publicLinkFeedbackTimer: ReturnType<typeof setTimeout> | null = null;

const statusOptions = [
  { value: 'draft', label: 'Draft' },
  { value: 'open', label: 'Open' },
  { value: 'closed', label: 'Closed' },
];
const data = computed(() => registrationQuery.data.value ?? null);
const displayedRegistrations = computed(() => (
  simulationActive.value ? simulatedRegistrations.value : data.value?.registrations ?? []
));
const availableInitials = computed(() => registrationInitials(displayedRegistrations.value));
const displaySummary = computed<EventRegistrationSummary | null>(() => {
  if (simulationActive.value) {
    const active = displayedRegistrations.value.filter((registration) => registration.status !== 'cancelled');
    const confirmed = active.filter((registration) => registration.status === 'confirmed').length;

    return {
      total: active.length,
      confirmed,
      waitlisted: active.filter((registration) => registration.status === 'waitlisted').length,
      checked_in: active.filter((registration) => Boolean(registration.checked_in_at)).length,
      available: Math.max(0, simulatedRegistrationCapacity - confirmed),
      pending_emails: 0,
    };
  }

  return data.value
    ? summarizeEventRegistrations(data.value.campaign, displayedRegistrations.value)
    : null;
});
const canUsePublicRegistrationForm = computed(() => (
  Boolean(data.value?.public_url)
  && data.value?.campaign.status === 'open'
));
const currentSettings = computed<RegistrationSettingsDraft>(() => ({
  status: settings.status,
  capacity: Number(settings.capacity),
  opens_at: settings.opens_at,
  closes_at: settings.closes_at,
  waitlist_enabled: settings.waitlist_enabled,
  auto_confirm: settings.auto_confirm,
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
const filteredRegistrations = computed(() => {
  return filterRegistrationsForCheckIn(displayedRegistrations.value, {
    query: search.value,
    initial: selectedInitial.value,
  });
});

watch(() => data.value?.campaign, (campaign) => {
  if (!campaign) return;
  const snapshot: RegistrationSettingsDraft = {
    status: campaign.status,
    capacity: campaign.capacity,
    opens_at: toLocalDateTime(campaign.opens_at),
    closes_at: toLocalDateTime(campaign.closes_at),
    waitlist_enabled: campaign.waitlist_enabled,
    auto_confirm: campaign.auto_confirm,
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
  if (field === 'closes_at') return 'Closes at';
  if (field === 'auto_confirm') return 'Auto-confirm';
  return 'Waitlist';
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
  if (field === 'auto_confirm' || field === 'waitlist_enabled') {
    return value ? 'Enabled' : 'Disabled';
  }
  return String(value);
}

function statusClass(registration: EventRegistration): string {
  if (registration.status === 'confirmed') return 'border-emerald-300 bg-emerald-50 text-emerald-800';
  if (registration.status === 'waitlisted') return 'border-amber-300 bg-amber-50 text-amber-800';
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
      waitlist_enabled: settings.waitlist_enabled,
      auto_confirm: settings.auto_confirm,
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

  if (simulationActive.value) {
    simulatedRegistrations.value = simulatedRegistrations.value.map((guest) => (
      guest.id === registration.id
        ? { ...guest, checked_in_at: new Date().toISOString() }
        : guest
    ));
    notify.success(`${registration.name} checked in for this simulation.`);
    actionRegistrationId.value = null;
    return;
  }

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

async function toggleSimulation() {
  if (!devRegistrationSimulationEnabled || actionRegistrationId.value) return;

  if (!simulationActive.value) {
    const { createSimulatedRegistrations } = await import('@/src/lib/registration-simulation');
    simulatedRegistrations.value = createSimulatedRegistrations();
    simulationActive.value = true;
  } else {
    simulationActive.value = false;
    simulatedRegistrations.value = [];
  }
  search.value = '';
  selectedInitial.value = ALL_REGISTRATION_INITIALS;
}

async function confirmCancellation() {
  const registration = pendingCancellation.value;
  if (!registration || actionRegistrationId.value) return;
  actionRegistrationId.value = registration.id;
  try {
    await cancelEventRegistration(eventId.value, registration.id);
    await refresh();
    notify.success(`${registration.name}'s registration was cancelled.`);
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
      <div class="editorial-header flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p class="editorial-eyebrow">registration</p>
          <h1 class="editorial-title">Guest List</h1>
          <p class="editorial-subtitle">Open registration, manage capacity, and check guests in by name or email.</p>
        </div>
        <div
          v-if="devRegistrationSimulationEnabled || (canUsePublicRegistrationForm && !simulationActive)"
          class="flex shrink-0 flex-wrap gap-2"
        >
          <button
            v-if="devRegistrationSimulationEnabled"
            type="button"
            class="min-h-12 rounded-md border-2 border-dc-ink bg-white px-4 font-mono text-xs font-semibold uppercase text-dc-ink shadow-[2px_2px_0_#111111]"
            :aria-pressed="simulationActive"
            @click="toggleSimulation"
          >
            {{ simulationActive ? 'Exit simulation' : `Preview ${SIMULATED_REGISTRATION_COUNT} guests` }}
          </button>
          <template v-if="canUsePublicRegistrationForm && !simulationActive">
            <a
              :href="data?.public_url"
              target="_blank"
              rel="noopener noreferrer"
              class="editorial-secondary-action min-h-12 min-w-32 justify-center"
            >
              OPEN FORM
            </a>
            <button
              type="button"
              class="editorial-action min-h-12 min-w-32 justify-center"
              @click="copyPublicLink"
            >
              <span aria-live="polite">{{ publicLinkCopied ? 'COPIED' : 'COPY FORM' }}</span>
            </button>
          </template>
        </div>
      </div>

      <div v-if="!simulationActive && registrationQuery.isPending.value" class="editorial-panel min-h-80 animate-pulse" />
      <div v-else-if="!simulationActive && (registrationQuery.isError.value || !data)" class="rounded-md border-2 border-red-500 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
        {{ registrationQuery.error.value?.message ?? 'Unable to load registrations.' }}
      </div>

      <template v-else>
        <section
          v-if="simulationActive"
          class="mb-5 flex flex-col gap-2 rounded-lg border-2 border-dc-ink bg-dc-yellow px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          role="status"
        >
          <div>
            <p class="font-mono text-[10px] font-semibold uppercase tracking-wide text-dc-pink">Development simulation</p>
            <p class="mt-1 text-sm font-semibold text-dc-ink">
              Showing {{ SIMULATED_REGISTRATION_COUNT }} fictional guests. Nothing here is saved or emailed.
            </p>
          </div>
          <span class="font-mono text-[10px] font-semibold uppercase text-dc-gray">Resets on exit</span>
        </section>

        <section class="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div v-for="item in [
            { label: 'Registered', value: displaySummary?.total ?? 0 },
            { label: 'Has a place', value: displaySummary?.confirmed ?? 0 },
            { label: 'Waitlisted', value: displaySummary?.waitlisted ?? 0 },
            { label: 'Checked in', value: displaySummary?.checked_in ?? 0 },
            { label: 'Places left', value: displaySummary?.available ?? 0 },
          ]" :key="item.label" class="rounded-lg border border-dc-border bg-white px-4 py-3">
            <p class="font-mono text-[10px] font-semibold uppercase tracking-wide text-dc-gray">{{ item.label }}</p>
            <p class="mt-1 text-2xl font-bold text-dc-ink">{{ item.value }}</p>
          </div>
        </section>

        <section v-if="!simulationActive" class="editorial-panel mb-5 overflow-hidden">
          <div class="border-b border-dc-border bg-dc-paper-warm px-5 py-4">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p class="editorial-eyebrow">campaign</p>
                <h2 class="mt-1 text-xl font-bold">Registration settings</h2>
              </div>
              <span class="rounded-sm border border-dc-border bg-white px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-wide">{{ data?.campaign.status ?? 'Unavailable' }}</span>
            </div>
          </div>
          <form class="grid gap-4 p-5 md:grid-cols-3" @submit.prevent="requestSaveSettings">
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
            <div class="grid gap-2 sm:grid-cols-2">
              <label class="flex items-center gap-2 rounded-md border border-dc-border bg-dc-paper-warm px-3 py-3 text-sm font-semibold">
                <input v-model="settings.auto_confirm" type="checkbox" class="size-4 accent-dc-pink"> Auto-confirm
              </label>
              <label class="flex items-center gap-2 rounded-md border border-dc-border bg-dc-paper-warm px-3 py-3 text-sm font-semibold">
                <input v-model="settings.waitlist_enabled" type="checkbox" class="size-4 accent-dc-pink"> Waitlist
              </label>
            </div>
          </form>
        </section>

        <section class="ops-panel overflow-hidden">
          <div class="border-b border-dc-border bg-dc-paper-warm px-4 py-3">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div class="w-full max-w-md">
                <label for="guest-search" class="editorial-label">Check in by name or email</label>
                <input id="guest-search" v-model="search" type="search" class="editorial-input" placeholder="Start typing a guest name or email">
              </div>
              <button
                v-if="!simulationActive && (displaySummary?.pending_emails ?? 0) > 0"
                type="button"
                class="min-h-11 rounded-md border-2 border-dc-ink bg-white px-4 font-mono text-xs font-semibold uppercase disabled:opacity-50"
                :disabled="retryPending"
                @click="retryEmails"
              >
                {{ retryPending ? 'RETRYING…' : `RETRY ${displaySummary?.pending_emails ?? 0} EMAIL${displaySummary?.pending_emails === 1 ? '' : 'S'}` }}
              </button>
            </div>
            <div class="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <RegistrationAlphabetFilter
                v-model="selectedInitial"
                :initials="availableInitials"
                class="min-w-0 flex-1"
              />
              <p class="shrink-0 font-mono text-[10px] font-semibold uppercase tracking-wide text-dc-gray">
                {{ filteredRegistrations.length }} of {{ displayedRegistrations.length }} shown
              </p>
            </div>
          </div>

          <div v-if="filteredRegistrations.length === 0" class="px-5 py-10 text-center text-sm text-dc-gray">
            {{
              search || selectedInitial !== ALL_REGISTRATION_INITIALS
                ? 'No guest matches that name, email, or first letter.'
                : 'No one has registered yet.'
            }}
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
                    v-if="registration.status !== 'confirmed'"
                    class="rounded-sm border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase"
                    :class="statusClass(registration)"
                  >
                    {{ registration.status }}
                  </span>
                  <span v-if="registration.checked_in_at" class="rounded-sm border border-dc-ink bg-dc-ink px-2 py-0.5 font-mono text-[10px] font-semibold uppercase text-white">Checked in</span>
                </div>
                <p class="mt-1 truncate text-sm text-dc-gray">{{ registration.email }}</p>
                <p class="mt-1 font-mono text-[10px] uppercase tracking-wide text-dc-gray">
                  {{
                    simulationActive
                      ? 'Simulation record · not saved'
                      : `Registered ${formatDateTime(registration.created_at)} · Email ${registration.email_status ?? 'not queued'}`
                  }}
                </p>
              </div>
              <div
                v-if="
                  (registration.status === 'confirmed' && !registration.checked_in_at)
                  || (!simulationActive && (registration.status !== 'cancelled' || devRegistrationRemovalEnabled))
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
                  v-if="!simulationActive && registration.status !== 'cancelled'"
                  type="button"
                  class="min-h-11 rounded-md border-2 border-dc-ink bg-white px-4 font-mono text-xs font-semibold uppercase text-dc-ink disabled:opacity-50"
                  :disabled="Boolean(actionRegistrationId)"
                  @click="pendingCancellation = registration"
                >
                  Cancel
                </button>
                <button
                  v-if="!simulationActive && devRegistrationRemovalEnabled"
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
