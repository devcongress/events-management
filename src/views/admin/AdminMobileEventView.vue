<script setup lang="ts">
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import ConfirmDialog from '@/src/components/ui/ConfirmDialog.vue';
import { adminPath } from '@/src/admin-routes';
import {
  checkInEventRegistration,
  decideEventSpeakerSubmission,
  fetchEventById,
  fetchEventRegistrations,
  fetchEventSpeakerSubmissions,
  queryKeys,
  undoCheckInEventRegistration,
} from '@/src/lib/api';
import { notify } from '@/src/lib/notify';
import { ALL_REGISTRATION_INITIALS } from '@/src/lib/registration-checkin';
import {
  filterRegistrationGuests,
  registrationEventHasEnded,
  type RegistrationGuestFilter,
} from '@/src/lib/registration-workspace';
import { safePublicResourceUrl } from '@/lib/safe-url';
import {
  ORGANIZER_PHONE_EVENTS_ROUTE_PATH,
  organizerPhoneCheckInPath,
  organizerPhoneEventBlastsPath,
} from '@/src/organizer-viewport';
import type { EventRegistration, EventStatus, SpeakerSubmission } from '@/types';

type MobileEventSection = 'overview' | 'guests' | 'submissions';
type SubmissionFilter = 'submitted' | 'selected' | 'not_selected';

const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  draft: 'Draft',
  cfp_open: 'Submissions open',
  cfp_closed: 'Review',
  upcoming: 'Upcoming',
  live: 'Live now',
  completed: 'Completed',
};
const EVENT_DATE_FORMATTER = new Intl.DateTimeFormat('en-GH', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'Africa/Accra',
});
const SUBMITTED_DATE_FORMATTER = new Intl.DateTimeFormat('en-GH', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Africa/Accra',
});
const sectionOrder: MobileEventSection[] = ['overview', 'guests', 'submissions'];
const guestFilters: Array<{ value: RegistrationGuestFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'going', label: 'Confirmed' },
  { value: 'waitlisted', label: 'Waitlist' },
  { value: 'checked_in', label: 'Checked in' },
];
const submissionFilters: Array<{ value: SubmissionFilter; label: string }> = [
  { value: 'submitted', label: 'Pending' },
  { value: 'selected', label: 'Selected' },
  { value: 'not_selected', label: 'Not selected' },
];

const route = useRoute();
const queryClient = useQueryClient();
const eventId = computed(() => String(route.params.eventId ?? ''));
const activeSection = ref<MobileEventSection>('overview');
const panelTransition = ref('mobile-event-panel-forward');
const guestSearch = ref('');
const guestFilter = ref<RegistrationGuestFilter>('all');
const submissionFilter = ref<SubmissionFilter>('submitted');
const expandedSubmissionId = ref<string | null>(null);
const actionRegistrationId = ref<string | null>(null);
const decidingSubmissionId = ref<string | null>(null);
const pendingCheckInUndo = ref<EventRegistration | null>(null);
const pendingNotSelected = ref<SpeakerSubmission | null>(null);

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
  refetchOnWindowFocus: true,
});
const submissionsQuery = useQuery({
  queryKey: computed(() => queryKeys.eventSpeakerSubmissions(eventId.value)),
  queryFn: () => fetchEventSpeakerSubmissions(eventId.value),
  enabled: computed(() => Boolean(eventId.value)),
  retry: false,
  refetchOnWindowFocus: true,
});

const event = computed(() => eventQuery.data.value ?? null);
const managedInternally = computed(() => registrationsQuery.data.value?.managed_internally === true);
const registrations = computed(() => registrationsQuery.data.value?.registrations ?? []);
const registrationSummary = computed(() => registrationsQuery.data.value?.summary ?? null);
const registrationUrl = computed(() => registrationsQuery.data.value?.public_url || event.value?.registration_url || null);
const submissions = computed(() => submissionsQuery.data.value?.submissions ?? []);
const pendingSubmissionCount = computed(() => submissions.value.filter((submission) => submission.status === 'submitted').length);
const eventHasEnded = computed(() => event.value ? registrationEventHasEnded(event.value) : false);
const filteredGuests = computed(() => filterRegistrationGuests(registrations.value, {
  query: guestSearch.value,
  initial: ALL_REGISTRATION_INITIALS,
  status: guestFilter.value,
  eventEnded: eventHasEnded.value,
}));
const filteredSubmissions = computed(() => submissions.value
  .filter((submission) => submission.status === submissionFilter.value)
  .sort((first, second) => new Date(second.created_at).getTime() - new Date(first.created_at).getTime()));
const eventLocation = computed(() => (
  event.value?.location?.label
  || event.value?.location?.name
  || event.value?.venue_address
  || (event.value?.location_type === 'online' ? 'Online' : 'Location not set')
));
const eventStatusClass = computed(() => {
  if (event.value?.status === 'live') return 'mobile-event-status--live';
  if (event.value?.status === 'completed') return 'mobile-event-status--done';
  if (event.value?.status === 'draft') return 'mobile-event-status--draft';
  return 'mobile-event-status--upcoming';
});

function selectSection(section: MobileEventSection) {
  const currentIndex = sectionOrder.indexOf(activeSection.value);
  const nextIndex = sectionOrder.indexOf(section);
  panelTransition.value = nextIndex >= currentIndex
    ? 'mobile-event-panel-forward'
    : 'mobile-event-panel-back';
  activeSection.value = section;
}

function formatEventDate(value: string) {
  return EVENT_DATE_FORMATTER.format(new Date(value));
}

function formatSubmittedDate(value: string) {
  return SUBMITTED_DATE_FORMATTER.format(new Date(value));
}

function submissionKindLabel(submission: SpeakerSubmission) {
  return submission.kind === 'product_demo' ? 'Product demo' : 'Talk';
}

function submissionStatusLabel(status: SpeakerSubmission['status']) {
  if (status === 'selected') return 'Selected';
  if (status === 'not_selected') return 'Not selected';
  if (status === 'withdrawn') return 'Withdrawn';
  return 'Pending';
}

function toggleSubmission(submissionId: string) {
  expandedSubmissionId.value = expandedSubmissionId.value === submissionId ? null : submissionId;
}

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

async function undoCheckInGuest() {
  const registration = pendingCheckInUndo.value;
  if (!eventId.value || !registration || actionRegistrationId.value) return;
  actionRegistrationId.value = registration.id;
  try {
    await undoCheckInEventRegistration(eventId.value, registration.id);
    await queryClient.invalidateQueries({ queryKey: queryKeys.eventRegistrations(eventId.value) });
    pendingCheckInUndo.value = null;
    notify.success(`${registration.name}'s check-in was undone.`);
  } catch (error) {
    notify.error(error instanceof Error ? error.message : 'Unable to undo this check-in.');
  } finally {
    actionRegistrationId.value = null;
  }
}

async function decideSubmission(submission: SpeakerSubmission, status: 'selected' | 'not_selected') {
  if (decidingSubmissionId.value) return;
  decidingSubmissionId.value = submission.id;
  try {
    await decideEventSpeakerSubmission(submission.id, status);
    await queryClient.invalidateQueries({ queryKey: queryKeys.eventSpeakerSubmissions(eventId.value) });
    pendingNotSelected.value = null;
    expandedSubmissionId.value = null;
    notify.success(status === 'selected'
      ? 'Proposal selected and private archive link prepared.'
      : 'Proposal marked as not selected.');
  } catch (error) {
    notify.error(error instanceof Error ? error.message : 'Unable to update this proposal.');
  } finally {
    decidingSubmissionId.value = null;
  }
}
</script>

<template>
  <section class="mobile-event-page">
    <div class="mobile-event-wrap">
      <div class="mobile-event-back-bar">
        <RouterLink :to="ORGANIZER_PHONE_EVENTS_ROUTE_PATH" class="mobile-event-back">
          <span aria-hidden="true">←</span>
          Events
        </RouterLink>
      </div>

      <div v-if="eventQuery.isPending.value" class="mobile-event-loading" role="status">
        <div class="mobile-event-loading-line mobile-event-loading-line--short" />
        <div class="mobile-event-loading-line" />
        <div class="mobile-event-loading-block" />
      </div>

      <section v-else-if="eventQuery.isError.value || !event" class="mobile-event-error">
        <span>Event unavailable</span>
        <h1>This event could not be opened</h1>
        <p>Check your connection, then return to Events and try again.</p>
        <button type="button" @click="eventQuery.refetch()">Try again</button>
      </section>

      <template v-else>
        <header class="mobile-event-hero">
          <div class="mobile-event-status-row">
            <span class="mobile-event-status" :class="eventStatusClass">{{ EVENT_STATUS_LABELS[event.status] }}</span>
            <span v-if="event.format" class="mobile-event-kind">{{ event.format }}</span>
          </div>
          <h1>{{ event.name }}</h1>
          <dl>
            <div><dt>When</dt><dd>{{ formatEventDate(event.event_date) }}</dd></div>
            <div><dt>Where</dt><dd>{{ eventLocation }}</dd></div>
          </dl>
        </header>

        <nav class="mobile-event-tabs" aria-label="Event workspace">
          <button type="button" :aria-current="activeSection === 'overview' ? 'page' : undefined" @click="selectSection('overview')">Overview</button>
          <button type="button" :aria-current="activeSection === 'guests' ? 'page' : undefined" @click="selectSection('guests')">
            Guests
            <span v-if="managedInternally">{{ registrationSummary?.total ?? registrations.length }}</span>
          </button>
          <button type="button" :aria-current="activeSection === 'submissions' ? 'page' : undefined" @click="selectSection('submissions')">
            Submissions
            <span v-if="pendingSubmissionCount">{{ pendingSubmissionCount > 99 ? '99+' : pendingSubmissionCount }}</span>
          </button>
        </nav>

        <Transition :name="panelTransition" mode="out-in">
          <main :key="activeSection" class="mobile-event-content">
            <template v-if="activeSection === 'overview'">
              <section class="mobile-event-section">
                <header class="mobile-event-section-heading">
                  <span>At a glance</span>
                  <h2>Event operations</h2>
                </header>
                <div class="mobile-event-signals">
                  <button type="button" @click="selectSection('guests')">
                    <strong>{{ managedInternally ? registrationSummary?.confirmed ?? 0 : '—' }}</strong>
                    <span>confirmed guests</span>
                  </button>
                  <button type="button" @click="selectSection('submissions')">
                    <strong>{{ pendingSubmissionCount }}</strong>
                    <span>pending proposals</span>
                  </button>
                </div>
              </section>

              <section class="mobile-event-section">
                <header class="mobile-event-section-heading">
                  <span>Quick actions</span>
                  <h2>What do you need to do?</h2>
                </header>
                <div class="mobile-event-action-list">
                  <RouterLink v-if="managedInternally" :to="organizerPhoneCheckInPath(event.id)" class="mobile-event-primary-action">Guest check-in mode <span aria-hidden="true">→</span></RouterLink>
                  <RouterLink v-if="managedInternally" :to="organizerPhoneEventBlastsPath(event.id)">Email guests <span aria-hidden="true">→</span></RouterLink>
                  <a v-if="registrationUrl" :href="registrationUrl" target="_blank" rel="noreferrer">Open registration page <span aria-hidden="true">→</span></a>
                  <RouterLink v-if="managedInternally && event.status !== 'completed'" :to="adminPath(`registration-display/${encodeURIComponent(event.id)}`)">Show registration QR <span aria-hidden="true">→</span></RouterLink>
                  <a v-if="event.status === 'cfp_open'" :href="`/cfp/${encodeURIComponent(event.id)}`" target="_blank" rel="noreferrer">Open submission form <span aria-hidden="true">→</span></a>
                  <a v-if="event.external_url" :href="event.external_url" target="_blank" rel="noreferrer">Open source event <span aria-hidden="true">→</span></a>
                  <p v-if="!managedInternally && !registrationUrl && event.status !== 'cfp_open' && !event.external_url">No phone actions are available for this event yet.</p>
                </div>
              </section>

              <section v-if="event.description" class="mobile-event-section mobile-event-description">
                <header class="mobile-event-section-heading"><span>About</span><h2>Event details</h2></header>
                <p>{{ event.description }}</p>
              </section>
            </template>

            <template v-else-if="activeSection === 'guests'">
              <section class="mobile-event-section">
                <header class="mobile-event-section-heading mobile-event-section-heading--split">
                  <div><span>Guest list</span><h2>Registrations</h2></div>
                  <RouterLink v-if="managedInternally" :to="organizerPhoneCheckInPath(event.id)">Check-in mode</RouterLink>
                </header>

                <p v-if="registrationsQuery.isPending.value" class="mobile-event-state" role="status">Loading registered guests…</p>
                <div v-else-if="registrationsQuery.isError.value" class="mobile-event-state mobile-event-state--error">
                  <p>The guest list could not be loaded.</p>
                  <button type="button" @click="registrationsQuery.refetch()">Try again</button>
                </div>
                <div v-else-if="!managedInternally" class="mobile-event-state">
                  <strong>No internal guest list</strong>
                  <p>Registration for this event was managed outside EMS.</p>
                  <a v-if="registrationUrl" :href="registrationUrl" target="_blank" rel="noreferrer">Open registration source ↗</a>
                </div>
                <template v-else>
                  <label class="mobile-event-search">
                    <span>Find a guest</span>
                    <input v-model="guestSearch" type="search" inputmode="search" autocomplete="off" placeholder="Name or email">
                  </label>
                  <div class="mobile-event-filter-row" aria-label="Filter guests">
                    <button v-for="filter in guestFilters" :key="filter.value" type="button" :aria-pressed="guestFilter === filter.value" @click="guestFilter = filter.value">{{ filter.label }}</button>
                  </div>
                  <p class="mobile-event-result-count">{{ filteredGuests.length }} of {{ registrations.length }} guests</p>

                  <p v-if="filteredGuests.length === 0" class="mobile-event-state">No guests match this view.</p>
                  <ul v-else class="mobile-event-list">
                    <li v-for="registration in filteredGuests" :key="registration.id" class="mobile-event-guest">
                      <div class="mobile-event-row-heading">
                        <div class="min-w-0"><strong>{{ registration.name }}</strong><span>{{ registration.email }}</span></div>
                        <span class="mobile-event-row-status" :class="{ 'is-checked': registration.checked_in_at, 'is-waiting': registration.status === 'waitlisted', 'is-cancelled': registration.status === 'cancelled' }">{{ registration.checked_in_at ? 'Checked in' : registration.status }}</span>
                      </div>
                      <button v-if="registration.status === 'confirmed' && !registration.checked_in_at" type="button" class="mobile-event-row-action" :disabled="Boolean(actionRegistrationId)" @click="checkInGuest(registration)">{{ actionRegistrationId === registration.id ? 'Checking in…' : 'Check in' }}</button>
                      <button v-else-if="registration.status === 'confirmed' && registration.checked_in_at" type="button" class="mobile-event-row-action mobile-event-row-action--quiet" :disabled="Boolean(actionRegistrationId)" @click="pendingCheckInUndo = registration">{{ actionRegistrationId === registration.id ? 'Undoing…' : 'Undo check-in' }}</button>
                    </li>
                  </ul>
                </template>
              </section>
            </template>

            <template v-else>
              <section class="mobile-event-section">
                <header class="mobile-event-section-heading">
                  <span>Speaker and demo inbox</span>
                  <h2>Presentation proposals</h2>
                </header>

                <p v-if="submissionsQuery.isPending.value" class="mobile-event-state" role="status">Loading submissions…</p>
                <div v-else-if="submissionsQuery.isError.value" class="mobile-event-state mobile-event-state--error">
                  <p>Speaker and demo submissions could not be loaded.</p>
                  <button type="button" @click="submissionsQuery.refetch()">Try again</button>
                </div>
                <template v-else>
                  <div class="mobile-event-filter-row" aria-label="Filter submissions">
                    <button v-for="filter in submissionFilters" :key="filter.value" type="button" :aria-pressed="submissionFilter === filter.value" @click="submissionFilter = filter.value">{{ filter.label }}</button>
                  </div>
                  <p class="mobile-event-result-count">{{ filteredSubmissions.length }} {{ submissionFilters.find((filter) => filter.value === submissionFilter)?.label.toLowerCase() }} proposals</p>

                  <p v-if="filteredSubmissions.length === 0" class="mobile-event-state">No proposals in this view.</p>
                  <ul v-else class="mobile-event-list">
                    <li v-for="submission in filteredSubmissions" :key="submission.id" class="mobile-event-submission">
                      <button type="button" class="mobile-event-submission-summary" :aria-expanded="expandedSubmissionId === submission.id" @click="toggleSubmission(submission.id)">
                        <span class="mobile-event-submission-meta"><span>{{ submissionKindLabel(submission) }}</span><span>{{ formatSubmittedDate(submission.created_at) }}</span></span>
                        <strong>{{ submission.title }}</strong>
                        <span>{{ submission.speaker_name }} · {{ submission.topic }}</span>
                        <span class="mobile-event-submission-toggle">{{ expandedSubmissionId === submission.id ? 'Hide details ↑' : 'View proposal ↓' }}</span>
                      </button>
                      <div v-if="expandedSubmissionId === submission.id" class="mobile-event-submission-detail">
                        <dl>
                          <div><dt>Presenter</dt><dd>{{ submission.speaker_name }}<br><a :href="`mailto:${submission.speaker_email}`">{{ submission.speaker_email }}</a></dd></div>
                          <div><dt>Type</dt><dd>{{ submissionKindLabel(submission) }}</dd></div>
                          <div><dt>Status</dt><dd>{{ submissionStatusLabel(submission.status) }}</dd></div>
                        </dl>
                        <div v-if="submission.abstract"><span>Proposal</span><p>{{ submission.abstract }}</p></div>
                        <div v-if="submission.bio"><span>Presenter bio</span><p>{{ submission.bio }}</p></div>
                        <a v-if="safePublicResourceUrl(submission.resource_url)" :href="safePublicResourceUrl(submission.resource_url) || undefined" target="_blank" rel="noreferrer" class="mobile-event-resource">Open supporting link ↗</a>
                        <div v-if="submission.status === 'submitted'" class="mobile-event-decision-actions">
                          <button type="button" :disabled="Boolean(decidingSubmissionId)" @click="decideSubmission(submission, 'selected')">{{ decidingSubmissionId === submission.id ? 'Saving…' : 'Select proposal' }}</button>
                          <button type="button" class="is-negative" :disabled="Boolean(decidingSubmissionId)" @click="pendingNotSelected = submission">Not select</button>
                        </div>
                      </div>
                    </li>
                  </ul>
                </template>
              </section>
            </template>
          </main>
        </Transition>
      </template>
    </div>

    <ConfirmDialog
      :open="Boolean(pendingCheckInUndo)"
      title="Undo check-in?"
      :message="pendingCheckInUndo ? `Remove the check-in record for ${pendingCheckInUndo.name}? Their registration remains active.` : ''"
      confirm-label="Undo check-in"
      busy-label="Undoing…"
      cancel-label="Keep check-in"
      :busy="Boolean(actionRegistrationId)"
      @confirm="undoCheckInGuest"
      @cancel="pendingCheckInUndo = null"
    />
    <ConfirmDialog
      :open="Boolean(pendingNotSelected)"
      title="Mark this proposal as not selected?"
      :message="pendingNotSelected ? `${pendingNotSelected.speaker_name}'s ${submissionKindLabel(pendingNotSelected).toLowerCase()} will move out of the pending review queue.` : ''"
      confirm-label="Not select"
      busy-label="Saving…"
      cancel-label="Keep pending"
      :busy="Boolean(decidingSubmissionId)"
      @confirm="pendingNotSelected && decideSubmission(pendingNotSelected, 'not_selected')"
      @cancel="pendingNotSelected = null"
    />
  </section>
</template>

<style scoped>
.mobile-event-page { min-height: 100%; background: #f5f2e8; color: #111; }
.mobile-event-wrap { display: grid; width: min(100%, 42rem); margin: 0 auto; gap: .75rem; padding: max(.75rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right)) max(1.5rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left)); }
.mobile-event-back-bar { position: sticky; top: env(safe-area-inset-top); z-index: 20; display: flex; padding-block: .2rem; background: rgba(245, 242, 232, .95); backdrop-filter: blur(10px); }
.mobile-event-back { display: inline-flex; min-height: 2.75rem; align-items: center; gap: .45rem; border: 1px solid #b8b3a9; border-radius: 8px; background: #fff; padding: .65rem .8rem; color: #111; font-family: var(--font-mono), monospace; font-size: .7rem; font-weight: 700; text-transform: uppercase; }
.mobile-event-hero, .mobile-event-section, .mobile-event-error, .mobile-event-loading { overflow: hidden; border: 1px solid #d9d5cc; border-radius: 12px; background: #fff; }
.mobile-event-hero { padding: 1rem; }
.mobile-event-status-row { display: flex; flex-wrap: wrap; gap: .45rem; }
.mobile-event-status, .mobile-event-kind { display: inline-flex; min-height: 1.75rem; align-items: center; border: 1px solid #d9d5cc; border-radius: 6px; padding: 0 .55rem; font-family: var(--font-mono), monospace; font-size: .62rem; font-weight: 700; text-transform: uppercase; }
.mobile-event-status--live { border-color: #e8117f; background: #e8117f; color: #fff; }
.mobile-event-status--done { border-color: #15803d; background: #eaf7ee; color: #15803d; }
.mobile-event-status--draft { background: #f5f2e8; color: #5f5b54; }
.mobile-event-status--upcoming { border-color: #111; background: #f5e642; }
.mobile-event-kind { background: #fff; color: #5f5b54; }
.mobile-event-hero h1 { margin: .8rem 0 0; font-size: clamp(1.75rem, 8vw, 2.35rem); font-weight: 800; letter-spacing: -.035em; line-height: 1.02; overflow-wrap: anywhere; }
.mobile-event-hero dl { display: grid; gap: .55rem; margin: 1rem 0 0; }
.mobile-event-hero dl > div { display: grid; grid-template-columns: 3.25rem minmax(0, 1fr); gap: .65rem; }
.mobile-event-hero dt, .mobile-event-section-heading > span, .mobile-event-section-heading > div > span, .mobile-event-search > span, .mobile-event-submission-detail dt, .mobile-event-submission-detail > div > span { color: #77736b; font-family: var(--font-mono), monospace; font-size: .58rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
.mobile-event-hero dd { margin: 0; color: #45413b; font-size: .82rem; font-weight: 600; line-height: 1.45; }
.mobile-event-tabs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); overflow: hidden; border: 1px solid #d9d5cc; border-radius: 10px; background: #fff; padding: 3px; }
.mobile-event-tabs button { position: relative; display: flex; min-width: 0; min-height: 2.75rem; align-items: center; justify-content: center; gap: .3rem; border: 0; border-radius: 7px; background: transparent; padding: .45rem .3rem; color: #69645c; font-family: var(--font-mono), monospace; font-size: clamp(.54rem, 2.6vw, .65rem); font-weight: 700; text-transform: uppercase; transition: transform 100ms cubic-bezier(.4,0,.2,1), background-color 150ms cubic-bezier(.4,0,.2,1), color 150ms cubic-bezier(.4,0,.2,1); }
.mobile-event-tabs button[aria-current=page] { background: #f5e642; color: #111; }
.mobile-event-tabs button > span { display: grid; min-width: 1.15rem; min-height: 1.15rem; place-items: center; border-radius: 999px; background: #e8117f; padding: 0 .25rem; color: #fff; font-size: .52rem; }
.mobile-event-content { display: grid; gap: .75rem; }
.mobile-event-section-heading { padding: 1rem; }
.mobile-event-section-heading h2 { margin: .3rem 0 0; font-size: 1.15rem; letter-spacing: -.02em; line-height: 1.15; }
.mobile-event-section-heading--split { display: flex; align-items: flex-end; justify-content: space-between; gap: .75rem; }
.mobile-event-section-heading--split > a { display: inline-flex; min-height: 2.75rem; align-items: center; border-radius: 7px; background: #f5e642; padding: 0 .7rem; color: #111; font-family: var(--font-mono), monospace; font-size: .62rem; font-weight: 700; text-transform: uppercase; }
.mobile-event-signals { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); border-top: 1px solid #e1ddd4; }
.mobile-event-signals button { display: grid; min-height: 5.75rem; align-content: center; gap: .3rem; border: 0; background: #fefce8; padding: .9rem; text-align: left; }
.mobile-event-signals button + button { border-left: 1px solid #e1ddd4; }
.mobile-event-signals strong { font-size: 1.65rem; line-height: 1; }
.mobile-event-signals span { color: #5f5b54; font-size: .72rem; font-weight: 600; line-height: 1.3; }
.mobile-event-action-list { display: grid; border-top: 1px solid #e1ddd4; }
.mobile-event-action-list > a { display: flex; min-height: 3.15rem; align-items: center; justify-content: space-between; gap: 1rem; border-bottom: 1px solid #e1ddd4; padding: .8rem 1rem; color: #111; font-size: .82rem; font-weight: 700; }
.mobile-event-action-list > a:last-of-type { border-bottom: 0; }
.mobile-event-action-list > .mobile-event-primary-action { background: #e8117f; color: #fff; }
.mobile-event-action-list > p { margin: 0; padding: 1rem; color: #5f5b54; font-size: .82rem; line-height: 1.5; }
.mobile-event-description > p { margin: 0; border-top: 1px solid #e1ddd4; padding: 1rem; color: #555; font-size: .88rem; line-height: 1.6; white-space: pre-line; }
.mobile-event-search { display: grid; gap: .45rem; border-top: 1px solid #e1ddd4; padding: 1rem; }
.mobile-event-search input { min-height: 3rem; width: 100%; border: 1px solid #b8b3a9; border-radius: 8px; background: #fff; padding: 0 .85rem; color: #111; font-size: 1rem; outline: none; }
.mobile-event-search input:focus { border-color: #e8117f; box-shadow: 0 0 0 3px rgba(232,17,127,.12); }
.mobile-event-filter-row { display: flex; gap: .45rem; overflow-x: auto; border-top: 1px solid #e1ddd4; padding: .75rem 1rem; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
.mobile-event-filter-row::-webkit-scrollbar { display: none; }
.mobile-event-filter-row button { min-height: 2.75rem; flex: 0 0 auto; border: 1px solid #b8b3a9; border-radius: 7px; background: #fff; padding: 0 .75rem; color: #5f5b54; font-family: var(--font-mono), monospace; font-size: .62rem; font-weight: 700; text-transform: uppercase; }
.mobile-event-filter-row button[aria-pressed=true] { border-color: #111; background: #f5e642; color: #111; }
.mobile-event-result-count { margin: 0; border-top: 1px solid #e1ddd4; padding: .65rem 1rem; color: #77736b; font-family: var(--font-mono), monospace; font-size: .6rem; font-weight: 700; text-transform: uppercase; }
.mobile-event-list { margin: 0; border-top: 1px solid #e1ddd4; padding: 0; list-style: none; }
.mobile-event-list > li + li { border-top: 1px solid #e1ddd4; }
.mobile-event-guest { display: grid; gap: .75rem; padding: 1rem; }
.mobile-event-row-heading { display: flex; min-width: 0; align-items: flex-start; justify-content: space-between; gap: .75rem; }
.mobile-event-row-heading strong, .mobile-event-row-heading > div > span { display: block; overflow-wrap: anywhere; }
.mobile-event-row-heading strong { font-size: .9rem; }
.mobile-event-row-heading > div > span { margin-top: .2rem; color: #666159; font-size: .74rem; }
.mobile-event-row-status { flex: 0 0 auto; border-radius: 999px; background: #f5f2e8; padding: .35rem .5rem; color: #5f5b54; font-family: var(--font-mono), monospace; font-size: .54rem; font-weight: 700; text-transform: uppercase; }
.mobile-event-row-status.is-checked { background: #eaf7ee; color: #15803d; }
.mobile-event-row-status.is-waiting { background: #fff7d6; color: #8a5a00; }
.mobile-event-row-status.is-cancelled { background: #feecec; color: #b91c1c; }
.mobile-event-row-action, .mobile-event-state button, .mobile-event-error button { min-height: 2.75rem; border: 2px solid #111; border-radius: 8px; background: #e8117f; padding: .65rem .8rem; color: #fff; font-family: var(--font-mono), monospace; font-size: .68rem; font-weight: 700; text-transform: uppercase; box-shadow: 1px 1px 0 #111; }
.mobile-event-row-action--quiet { background: #fff; color: #111; }
.mobile-event-row-action:disabled { opacity: .5; box-shadow: none; }
.mobile-event-submission-summary { display: grid; width: 100%; min-height: 6.5rem; gap: .35rem; border: 0; background: #fff; padding: 1rem; color: #111; text-align: left; }
.mobile-event-submission-summary strong { font-size: .95rem; line-height: 1.3; }
.mobile-event-submission-summary > span:not(.mobile-event-submission-meta, .mobile-event-submission-toggle) { color: #5f5b54; font-size: .76rem; }
.mobile-event-submission-meta { display: flex; justify-content: space-between; gap: .75rem; color: #77736b; font-family: var(--font-mono), monospace; font-size: .56rem; font-weight: 700; text-transform: uppercase; }
.mobile-event-submission-toggle { margin-top: .2rem; color: #e8117f; font-family: var(--font-mono), monospace; font-size: .58rem; font-weight: 700; text-transform: uppercase; }
.mobile-event-submission-detail { display: grid; gap: 1rem; border-top: 1px solid #e1ddd4; background: #fefce8; padding: 1rem; }
.mobile-event-submission-detail dl { display: grid; gap: .7rem; margin: 0; }
.mobile-event-submission-detail dl > div { display: grid; grid-template-columns: 4.5rem minmax(0, 1fr); gap: .75rem; }
.mobile-event-submission-detail dd { margin: 0; font-size: .78rem; font-weight: 600; line-height: 1.45; overflow-wrap: anywhere; }
.mobile-event-submission-detail dd a { color: #e8117f; }
.mobile-event-submission-detail > div > p { margin: .35rem 0 0; color: #45413b; font-size: .82rem; line-height: 1.55; white-space: pre-line; }
.mobile-event-resource { display: inline-flex; min-height: 2.75rem; align-items: center; justify-content: center; border: 1px solid #111; border-radius: 8px; background: #fff; padding: .65rem .8rem; color: #111; font-family: var(--font-mono), monospace; font-size: .64rem; font-weight: 700; text-transform: uppercase; }
.mobile-event-decision-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .6rem; border-top: 1px solid #e1ddd4; padding-top: 1rem; }
.mobile-event-decision-actions button { min-height: 2.75rem; border: 2px solid #111; border-radius: 8px; background: #e8117f; padding: .65rem; color: #fff; font-family: var(--font-mono), monospace; font-size: .62rem; font-weight: 700; text-transform: uppercase; box-shadow: 1px 1px 0 #111; }
.mobile-event-decision-actions button.is-negative { border: 1px solid #b91c1c; background: #fff; color: #b91c1c; box-shadow: none; }
.mobile-event-decision-actions button:disabled { opacity: .5; box-shadow: none; }
.mobile-event-state { margin: 0; border-top: 1px solid #e1ddd4; padding: 1.25rem 1rem; color: #5f5b54; font-size: .82rem; line-height: 1.55; text-align: center; }
.mobile-event-state strong, .mobile-event-state p { display: block; margin: 0; }
.mobile-event-state p + button, .mobile-event-state p + a { margin-top: .75rem; }
.mobile-event-state a { display: inline-flex; min-height: 2.75rem; align-items: center; color: #e8117f; font-weight: 700; }
.mobile-event-state--error { color: #b91c1c; }
.mobile-event-error, .mobile-event-loading { padding: 1.25rem; }
.mobile-event-error > span { color: #e8117f; font-family: var(--font-mono), monospace; font-size: .62rem; font-weight: 700; text-transform: uppercase; }
.mobile-event-error h1 { margin: .5rem 0 0; font-size: 1.35rem; }
.mobile-event-error p { color: #5f5b54; font-size: .84rem; line-height: 1.5; }
.mobile-event-loading { display: grid; gap: .75rem; }
.mobile-event-loading-line, .mobile-event-loading-block { border-radius: 6px; background: #ece8de; }
.mobile-event-loading-line { width: 85%; height: 1.1rem; }
.mobile-event-loading-line--short { width: 35%; }
.mobile-event-loading-block { height: 8rem; }
.mobile-event-back:active, .mobile-event-tabs button:active, .mobile-event-signals button:active, .mobile-event-action-list > a:active, .mobile-event-filter-row button:active, .mobile-event-row-action:active, .mobile-event-submission-summary:active, .mobile-event-resource:active, .mobile-event-decision-actions button:active { transform: scale(.97); }
.mobile-event-back:focus-visible, .mobile-event-tabs button:focus-visible, .mobile-event-signals button:focus-visible, .mobile-event-action-list > a:focus-visible, .mobile-event-filter-row button:focus-visible, .mobile-event-row-action:focus-visible, .mobile-event-submission-summary:focus-visible, .mobile-event-resource:focus-visible, .mobile-event-decision-actions button:focus-visible { outline: 2px solid #e8117f; outline-offset: 2px; }
.mobile-event-panel-forward-enter-active, .mobile-event-panel-forward-leave-active, .mobile-event-panel-back-enter-active, .mobile-event-panel-back-leave-active { transition: opacity 160ms cubic-bezier(.16,1,.3,1), transform 160ms cubic-bezier(.16,1,.3,1); }
.mobile-event-panel-forward-enter-from, .mobile-event-panel-back-leave-to { opacity: 0; transform: translate3d(10px,0,0); }
.mobile-event-panel-forward-leave-to, .mobile-event-panel-back-enter-from { opacity: 0; transform: translate3d(-10px,0,0); }
@media (prefers-reduced-motion: reduce) {
  .mobile-event-back, .mobile-event-tabs button, .mobile-event-signals button, .mobile-event-action-list > a, .mobile-event-filter-row button, .mobile-event-row-action, .mobile-event-submission-summary, .mobile-event-resource, .mobile-event-decision-actions button, .mobile-event-panel-forward-enter-active, .mobile-event-panel-forward-leave-active, .mobile-event-panel-back-enter-active, .mobile-event-panel-back-leave-active { transition-duration: 1ms !important; }
  .mobile-event-panel-forward-enter-from, .mobile-event-panel-back-leave-to, .mobile-event-panel-forward-leave-to, .mobile-event-panel-back-enter-from { transform: none; }
}
</style>
