<script setup lang="ts">
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import RegistrationAlphabetFilter from '@/src/components/ui/RegistrationAlphabetFilter.vue';
import {
  checkInEventRegistration,
  fetchEventById,
  fetchEventRegistrations,
  queryKeys,
} from '@/src/lib/api';
import { notify } from '@/src/lib/notify';
import {
  ALL_REGISTRATION_INITIALS,
  filterRegistrationsForCheckIn,
  registrationInitials,
} from '@/src/lib/registration-checkin';
import { ORGANIZER_PHONE_ROUTE_PATH } from '@/src/organizer-viewport';
import type { EventRegistration } from '@/types';

const EVENT_DATE_FORMATTER = new Intl.DateTimeFormat('en', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

const route = useRoute();
const queryClient = useQueryClient();
const eventId = computed(() => String(route.params.eventId ?? ''));
const search = ref('');
const selectedInitial = ref(ALL_REGISTRATION_INITIALS);
const actionRegistrationId = ref<string | null>(null);

const eventQuery = useQuery({
  queryKey: computed(() => queryKeys.event(eventId.value)),
  queryFn: () => fetchEventById(eventId.value),
  enabled: computed(() => Boolean(eventId.value)),
});
const registrationsQuery = useQuery({
  queryKey: computed(() => queryKeys.eventRegistrations(eventId.value)),
  queryFn: () => fetchEventRegistrations(eventId.value),
  enabled: computed(() => Boolean(eventId.value)),
  retry: false,
});
const managedInternally = computed(() => registrationsQuery.data.value?.managed_internally === true);
const displayedRegistrations = computed(() => registrationsQuery.data.value?.registrations ?? []);
const availableInitials = computed(() => registrationInitials(displayedRegistrations.value));
const filteredRegistrations = computed(() => filterRegistrationsForCheckIn(
  displayedRegistrations.value,
  {
    query: search.value,
    initial: selectedInitial.value,
  },
));
const checkInSummary = computed(() => {
  const guestsWithPlaces = displayedRegistrations.value.filter((registration) => (
    registration.status === 'confirmed'
  ));

  return {
    withPlaces: guestsWithPlaces.length,
    checkedIn: guestsWithPlaces.filter((registration) => Boolean(registration.checked_in_at)).length,
  };
});
const eventContext = computed(() => {
  const event = eventQuery.data.value;
  if (!event) return null;

  const location = event.location?.label ?? event.location?.name;
  return [EVENT_DATE_FORMATTER.format(new Date(event.event_date)), location]
    .filter(Boolean)
    .join(' · ');
});

async function checkInGuest(registration: EventRegistration) {
  if (!eventId.value || actionRegistrationId.value) return;
  actionRegistrationId.value = registration.id;

  try {
    await checkInEventRegistration(eventId.value, registration.id);
    await queryClient.invalidateQueries({ queryKey: queryKeys.eventRegistrations(eventId.value) });
    notify.success(`${registration.name} checked in.`);
  } catch (error) {
    notify.error(error instanceof Error ? error.message : 'Unable to check in this guest.');
  } finally {
    actionRegistrationId.value = null;
  }
}

watch(availableInitials, (initials) => {
  if (
    selectedInitial.value !== ALL_REGISTRATION_INITIALS
    && !initials.includes(selectedInitial.value)
  ) {
    selectedInitial.value = ALL_REGISTRATION_INITIALS;
  }
});
</script>

<template>
  <section class="mobile-ops-page mobile-checkin-page">
    <div class="mobile-ops-wrap mobile-checkin-wrap">
      <div class="mobile-checkin-back-bar">
        <RouterLink :to="ORGANIZER_PHONE_ROUTE_PATH" class="mobile-checkin-back">
          <span aria-hidden="true">←</span>
          Back to events
        </RouterLink>
      </div>

      <header class="mobile-ops-hero mobile-checkin-hero">
        <p class="editorial-eyebrow">guest check-in</p>
        <div class="mobile-checkin-title-row">
          <h1>{{ eventQuery.data.value?.name ?? 'Guest check-in' }}</h1>
          <span
            v-if="managedInternally"
            class="mobile-checkin-progress"
            aria-live="polite"
          >
            {{ checkInSummary.checkedIn }}/{{ checkInSummary.withPlaces }}
          </span>
        </div>
        <p v-if="eventContext">{{ eventContext }}</p>
        <p v-else-if="eventQuery.isPending.value">Loading event details…</p>
      </header>

      <section class="mobile-ops-panel mobile-checkin-panel" aria-label="Guest check-in controls">
        <p
          v-if="registrationsQuery.isPending.value"
          class="mobile-ops-checkin-state"
          role="status"
        >
          Loading guest list…
        </p>
        <div
          v-else-if="registrationsQuery.isError.value"
          class="mobile-ops-checkin-state mobile-ops-checkin-state--error"
        >
          <p>Guest check-in is unavailable for this event.</p>
          <button
            type="button"
            class="mobile-ops-checkin-retry"
            @click="registrationsQuery.refetch()"
          >
            Try again
          </button>
        </div>
        <div
          v-else-if="!managedInternally"
          class="mobile-ops-checkin-state mobile-ops-checkin-state--historical"
          role="status"
        >
          <p class="editorial-eyebrow">historical registration</p>
          <h2>Registration was not managed in this app</h2>
          <p>
            This event has no internal guest list or native check-in records. Historical attendance,
            when available, remains in the full Attendance workspace.
          </p>
        </div>
        <template v-else>
          <div class="mobile-ops-checkin-heading">
            <div>
              <p class="editorial-eyebrow">find a guest</p>
              <h2>Name or email</h2>
            </div>
          </div>

          <label for="mobile-check-in-search" class="mobile-ops-checkin-label">
            Guest name or email
          </label>
          <input
            id="mobile-check-in-search"
            v-model="search"
            type="search"
            inputmode="search"
            autocomplete="off"
            class="mobile-ops-checkin-search"
            placeholder="Start typing to find a guest"
          >

          <div class="mobile-ops-checkin-filters">
            <RegistrationAlphabetFilter
              v-model="selectedInitial"
              :initials="availableInitials"
            />
            <p>
              {{ filteredRegistrations.length }} of {{ displayedRegistrations.length }} shown
            </p>
          </div>

          <p
            v-if="filteredRegistrations.length === 0"
            class="mobile-ops-checkin-state"
          >
            {{
              search || selectedInitial !== ALL_REGISTRATION_INITIALS
                ? 'No guest matches that name, email, or first letter.'
                : 'No registrations yet.'
            }}
          </p>
          <ul v-else class="mobile-ops-guest-list">
            <li
              v-for="registration in filteredRegistrations"
              :key="registration.id"
              class="mobile-ops-guest"
            >
              <div class="mobile-ops-guest-heading">
                <div class="min-w-0">
                  <p class="mobile-ops-guest-name">{{ registration.name }}</p>
                  <p class="mobile-ops-guest-email">{{ registration.email }}</p>
                </div>
                <span
                  v-if="registration.checked_in_at || registration.status !== 'confirmed'"
                  class="mobile-ops-guest-status"
                  :class="{
                    'mobile-ops-guest-status--checked': registration.checked_in_at,
                    'mobile-ops-guest-status--waiting': registration.status === 'waitlisted',
                    'mobile-ops-guest-status--cancelled': registration.status === 'cancelled',
                  }"
                >
                  {{ registration.checked_in_at ? 'Checked in' : registration.status }}
                </span>
              </div>
              <button
                v-if="registration.status === 'confirmed' && !registration.checked_in_at"
                type="button"
                class="mobile-ops-guest-checkin"
                :disabled="Boolean(actionRegistrationId)"
                @click="checkInGuest(registration)"
              >
                {{ actionRegistrationId === registration.id ? 'Checking in…' : 'Check in' }}
              </button>
            </li>
          </ul>
        </template>
      </section>
    </div>
  </section>
</template>
