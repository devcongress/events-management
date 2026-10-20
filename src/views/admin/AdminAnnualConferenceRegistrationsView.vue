<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import AnnualConferenceNav from '@/src/components/AnnualConferenceNav.vue';
import AnnualConferenceRegistrationNav from '@/src/components/AnnualConferenceRegistrationNav.vue';
import AnnualConferenceRegistrationEmails from '@/src/components/AnnualConferenceRegistrationEmails.vue';
import AnnualConferenceCommunityTickets from '@/src/components/AnnualConferenceCommunityTickets.vue';
import AnnualConferenceGuests from '@/src/components/AnnualConferenceGuests.vue';
import type { ConferenceRegistrationGuest as Registration } from '@/src/lib/conference-guests';
import AppPagination from '@/src/components/AppPagination.vue';
import { eventBlastStarters } from '@/src/lib/event-blast-workspace';
import AppDropdown from '@/src/components/AppDropdown.vue';
import ConfirmDialog from '@/src/components/ui/ConfirmDialog.vue';
import BoneyardPageSkeleton from '@/src/components/ui/BoneyardPageSkeleton.vue';
import { validateAnnualConferenceCapacity } from '@/lib/annual-conference-ticketing';
import { hasAnyAnnualConferenceCapability } from '@/lib/annual-conference-capabilities';
import {
  fetchAdminSession,
  fetchAnnualConferenceTicketing,
  fetchAnnualConferenceWorkPlan,
  fetchJson,
  queryKeys,
  updateAnnualConferenceTicketingCapacity,
} from '@/src/lib/api';

type Overview = { mode: 'free' | 'paid'; status: 'draft' | 'open' | 'closed'; capacity: number; reserved: number; confirmed: number; waitlisted: number };
type Blast = { id: string; subject: string; body: string; status: string; recipients: number; accepted: number; needs_attention: number };
const route = useRoute();
const queryClient = useQueryClient();
const year = computed(() => String(route.params.year));
const endpoint = computed(() => `/api/annual-conference/${year.value}/registrations`);
const activeSection = computed(() => {
  const section = route.query.section;

  return section === 'guests' || section === 'form' || section === 'emails' || section === 'blasts'
    || (section === 'community' && year.value === '2026' && owner.value && canManageRegistration.value) ? section : 'summary';
});
const message = ref('');
const busy = ref(false);
const capacityBusy = ref(false);
const capacity = ref<number | null>(null);
const capacityError = ref('');
const cancellation = ref<Registration | null>(null);
const recovery = ref<Registration | null>(null);
const review = ref<Blast | null>(null);
const draft = reactive({ subject: '', body: '' });
const blastComposerOpen = ref(false);
const blastPage = ref(1);
const blastTemplates = computed(() => eventBlastStarters('DevCon' + year.value.slice(-2), 'on conference day'));
const settings = reactive({ mode: 'free', status: 'draft' });
const settingsConfirmation = ref(false);
const testingConfirmation = ref(false);
const draftConfirmation = ref(false);
const deliveryConfirmation = ref(false);
const error = ref('');
const testing = reactive({ enabled: false, emails: '' });
const modeOptions = [{ value: 'free', label: 'Free registration' }, { value: 'paid', label: 'Paid · Regular only' }];
const statusOptions = [{ value: 'draft', label: 'Draft' }, { value: 'open', label: 'Open' }, { value: 'closed', label: 'Closed' }];
const session = useQuery({ queryKey: queryKeys.adminSession, queryFn: fetchAdminSession });
const owner = computed(() => session.data.value?.user?.role === 'owner');
const workPlan = useQuery({
  queryKey: computed(() => queryKeys.annualConferenceWorkPlan(year.value)),
  queryFn: () => fetchAnnualConferenceWorkPlan(year.value),
});
const capabilities = computed(() => workPlan.data.value?.permissions.capabilities ?? []);
const canManageRegistration = computed(() => hasAnyAnnualConferenceCapability(capabilities.value, ['ticketing.manage']));
const canCheckIn = computed(() => hasAnyAnnualConferenceCapability(capabilities.value, ['ticketing.check_in', 'ticketing.manage']));
const ticketing = useQuery({
  queryKey: computed(() => queryKeys.annualConferenceTicketing(year.value)),
  queryFn: () => fetchAnnualConferenceTicketing(year.value),
  enabled: canManageRegistration,
});
const testingQuery = useQuery({
  queryKey: computed(() => ['conference-registration-testing', year.value]),
  enabled: owner,
  queryFn: () => fetchJson<{ enabled: boolean; tester_emails: string[]; local_delivery: boolean }>(`${endpoint.value}/testing`, { credentials: 'include' }),
});
const testerEmails = computed(() => [...new Set(testing.emails.split(/[\n,;]/).map((email) => email.trim().toLowerCase()).filter(Boolean))]);
const testingError = computed(() => testerEmails.value.length > 200
  ? 'Use up to 200 tester email addresses.'
  : testerEmails.value.some((email) => email.includes('*') || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    ? 'Check each email address. Use one per line.' : '');
const registrations = useQuery({
  queryKey: computed(() => ['conference-registrations', year.value]),
  enabled: canManageRegistration,
  queryFn: async () => {
    const requestEndpoint = endpoint.value;
    const all: Registration[] = [];
    let overview: Overview | undefined;

    for (let offset = 0; offset <= 5000; offset += 100) {
      const result = await fetchJson<{ overview: Overview; registrations: Registration[] }>(
        `${requestEndpoint}?offset=${offset}`, { credentials: 'include' },
      );

      overview = result.overview;
      all.push(...result.registrations);
      if (result.registrations.length < 100) return { overview, registrations: all };
    }

    throw new Error('The complete guest list could not be loaded.');
  },
  refetchInterval: 15_000,
  refetchIntervalInBackground: false,
});
const guests = computed(() => registrations.data.value?.registrations ?? []);
const overview = computed(() => registrations.data.value?.overview);
const placesLeft = computed(() => Math.max(0, (overview.value?.capacity ?? 0) - (overview.value?.reserved ?? 0)));
const filledPercent = computed(() => Math.min(100, Math.round(100 * (overview.value?.reserved ?? 0) / Math.max(1, overview.value?.capacity ?? 1))));

const capacityValidation = computed(() => {
  const data = ticketing.data.value;

  if (!data || capacity.value === null) return null;
  if (capacity.value > 5000) return 'Capacity cannot be higher than 5,000.';

  return validateAnnualConferenceCapacity(capacity.value, data.inventory);
});
const capacityHasChanged = computed(() => (
  capacity.value !== null && capacity.value !== ticketing.data.value?.settings.public_capacity
));
const capacityCanSave = computed(() => (
  capacityHasChanged.value && !capacityValidation.value && capacity.value !== null && capacity.value <= 5000
));
let capacityRequestGeneration = 0;
let mutationGeneration = 0;
const blasts = useQuery({
  queryKey: computed(() => ['conference-attendee-blasts', year.value]),
  queryFn: () => fetchJson<{ blasts: Blast[] }>(`${endpoint.value}/blasts`, { credentials: 'include' }),
});
const blastHistory = computed(() => blasts.data.value?.blasts ?? []);
const blastPageCount = computed(() => Math.max(1, Math.ceil(blastHistory.value.length / 10)));
const displayedBlasts = computed(() => blastHistory.value.slice((blastPage.value - 1) * 10, blastPage.value * 10));

watch(blastPageCount, (count) => { blastPage.value = Math.min(blastPage.value, count); });

watch(() => registrations.data.value?.overview, (overview, previous) => {
  const unchanged = !previous || (settings.mode === previous.mode && settings.status === previous.status);

  if (overview && unchanged && !settingsConfirmation.value) Object.assign(settings, { mode: overview.mode, status: overview.status });
}, { immediate: true });
watch(() => testingQuery.data.value, (value, previous) => {
  const unchanged = !previous || (testing.enabled === previous.enabled && testing.emails === previous.tester_emails.join('\n'));

  if (value && unchanged && !testingConfirmation.value) Object.assign(testing, { enabled: value.enabled, emails: value.tester_emails.join('\n') });
}, { immediate: true });
let hydratedCapacityYear = '';

watch(year, () => {
  mutationGeneration += 1;
  busy.value = false;
  message.value = '';
  blastComposerOpen.value = false;
  blastPage.value = 1;
  cancellation.value = null;
  recovery.value = null;
  review.value = null;
  settingsConfirmation.value = false;
  testingConfirmation.value = false;
  draftConfirmation.value = false;
  deliveryConfirmation.value = false;
  capacityRequestGeneration += 1;
  capacityBusy.value = false;
  capacity.value = null;
  capacityError.value = '';
  error.value = '';
  Object.assign(draft, { subject: '', body: '' });
});
watch([year, () => ticketing.data.value?.settings.public_capacity], ([currentYear, value]) => {
  if (value !== undefined && (currentYear !== hydratedCapacityYear || capacity.value === null)) {
    capacity.value = value;
    hydratedCapacityYear = currentYear;
  }
}, { immediate: true });

async function saveCapacity() {
  if (!canManageRegistration.value || !capacityCanSave.value || capacity.value === null || busy.value || capacityBusy.value) return;
  const requestGeneration = ++capacityRequestGeneration;
  const requestYear = year.value;
  const requestedCapacity = capacity.value;

  capacityBusy.value = true;
  capacityError.value = '';

  try {
    await updateAnnualConferenceTicketingCapacity(requestYear, requestedCapacity);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.annualConferenceTicketing(requestYear) }),
      queryClient.invalidateQueries({ queryKey: ['conference-registrations', requestYear] }),
    ]);

    if (requestGeneration === capacityRequestGeneration) {
      capacity.value = requestedCapacity;
      message.value = 'Conference capacity updated.';
    }
  } catch (cause) {
    if (requestGeneration === capacityRequestGeneration) {
      capacityError.value = cause instanceof Error ? cause.message : 'Unable to update conference capacity.';
    }
  } finally {
    if (requestGeneration === capacityRequestGeneration) capacityBusy.value = false;
  }
}

function reviewCapacityChange() {
  capacityError.value = capacityValidation.value ?? '';

  if (capacityError.value || !capacityCanSave.value) return;

  void saveCapacity();
}

async function mutate(path: string, body: unknown, success: string, method = 'POST') {
  if (busy.value) return;
  const request = ++mutationGeneration;

  busy.value = true;
  message.value = '';
  error.value = '';

  try {
    const response = await fetchJson<{ recovery?: { status: 'confirmed' | 'waitlisted' | 'cancelled'; created: boolean }; admissions?: { configured: boolean; accepted: number }; social?: { configured: boolean; accepted: number }; updates?: { configured: boolean; accepted: number } }>(`${endpoint.value}${path}`, { method, credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

    if (request !== mutationGeneration) return;
    message.value = path === '/testing/deliver'
      ? [response.admissions, response.social, response.updates].every((result) => result?.configured)
        ? `Email batch processed: ${(response.admissions?.accepted ?? 0) + (response.social?.accepted ?? 0) + (response.updates?.accepted ?? 0)} accepted by the provider. Check delivery and your inbox separately.`
        : 'Some email senders are not configured locally. Check the admission, social-card, and attendee-update email settings before retrying.'
      : response.recovery
        ? response.recovery.created
          ? `Registration recovered as ${response.recovery.status}. A fresh email is queued; delivery is not yet confirmed.`
          : `Recovery was already processed. The newer registration is ${response.recovery.status}; no new email was queued.`
        : success;
    cancellation.value = null;
    recovery.value = null;
    review.value = null;
    settingsConfirmation.value = false;
    testingConfirmation.value = false;
    draftConfirmation.value = false;
    deliveryConfirmation.value = false;
    if (path === '/blasts') {
      Object.assign(draft, { subject: '', body: '' });
      blastComposerOpen.value = false;
    }
    await Promise.all([registrations.refetch(), blasts.refetch(), ...(owner.value ? [testingQuery.refetch()] : [])]);
  } catch (cause) {
    if (request === mutationGeneration) error.value = cause instanceof Error ? cause.message : 'The change could not be saved.';
  } finally {
    if (request === mutationGeneration) busy.value = false;
  }
}
</script>

<template>
  <main class="editorial-page"><div class="editorial-wrap registration-content">
    <AnnualConferenceNav :show-page-heading="false" />
    <AnnualConferenceRegistrationNav :active="activeSection" :can-manage-registration="canManageRegistration" :can-check-in="canCheckIn" :can-manage-community="owner && canManageRegistration && year === '2026'" />
    <p v-if="message" role="status" aria-live="polite">{{ message }}</p>
    <BoneyardPageSkeleton v-if="registrations.isPending.value" name="annual-conference-registrations" label="conference registrations" layout="workspace" />
    <section v-else-if="registrations.isError.value" class="editorial-panel registration-panel"><h2>Registration unavailable</h2><p>Check your access and connection.</p><button @click="registrations.refetch()">Try again</button></section>
    <template v-else-if="registrations.data.value">
      <section v-if="activeSection === 'summary'" class="registration-overview">
        <div class="registration-overview-header">
          <h2>Registration overview</h2>
          <div class="registration-overview-header-actions">
            <span class="registration-overview-updated">Updated {{ new Date(registrations.dataUpdatedAt.value).toLocaleTimeString() }}</span>
            <button type="button" class="registration-overview-refresh" :disabled="registrations.isFetching.value" @click="registrations.refetch()">Refresh</button>
          </div>
        </div>
        <div class="registration-overview-metrics">
          <div class="registration-overview-primary">
            <p class="registration-overview-figure"><strong>{{ overview?.confirmed }}</strong><span>/ {{ overview?.capacity }}</span></p>
            <p>confirmed registrations</p>
          </div>
          <div class="registration-overview-secondary"><strong>{{ placesLeft }}</strong><span>places left</span></div>
        </div>
        <div class="registration-overview-progress-row">
          <div class="registration-overview-progress" role="progressbar" aria-label="Reserved capacity" :aria-valuenow="overview?.reserved" :aria-valuemax="overview?.capacity" aria-valuemin="0">
            <div class="registration-overview-progress-fill" :style="{ transform: `scaleX(${filledPercent / 100})` }" />
          </div>
          <p>{{ filledPercent }}% filled</p>
        </div>
        <p class="mt-5 text-sm text-dc-gray">{{ overview?.waitlisted }} waitlisted · {{ overview?.reserved }} total reserved, including other admissions and active holds.</p>
      </section>
      <section v-if="activeSection === 'form'" class="ops-panel registration-panel">
        <h2>Form &amp; capacity</h2>
        <p>Increasing capacity promotes the oldest waitlisted registrations automatically.</p>
        <div v-if="canManageRegistration" class="registration-capacity-control">
          <p v-if="ticketing.isPending.value" role="status">Loading capacity controls…</p>
          <div v-else-if="ticketing.isError.value" role="alert">
            <p class="text-dc-pink">Capacity controls could not be loaded.</p>
            <button type="button" :disabled="capacityBusy" @click="ticketing.refetch()">Try again</button>
          </div>
          <form v-else-if="ticketing.data.value" class="registration-settings-row" @submit.prevent="reviewCapacityChange">
            <label for="conference-capacity" class="min-w-48 flex-1">
              <span class="editorial-label">Venue capacity</span>
              <input id="conference-capacity" v-model.number="capacity" class="app-form-control" type="number" inputmode="numeric" :min="Math.max(1, ticketing.data.value.inventory.reduction_floor)" max="5000" :disabled="capacityBusy || busy" :aria-describedby="capacityError || capacityValidation ? 'conference-capacity-error' : 'conference-capacity-help'" @input="capacityError = ''" />
            </label>
            <button type="submit" :disabled="capacityBusy || busy || !capacityCanSave">{{ capacityBusy ? 'Saving…' : 'Save capacity' }}</button>
            <p id="conference-capacity-help" class="text-xs text-dc-gray">Current {{ ticketing.data.value.settings.public_capacity }}. Minimum {{ ticketing.data.value.inventory.reduction_floor }} reserved seats; maximum 5,000.</p>
            <p v-if="capacityError || capacityValidation" id="conference-capacity-error" class="text-sm text-dc-pink" role="alert">{{ capacityError || capacityValidation }}</p>
          </form>
        </div>
        <form v-if="owner" class="registration-settings-row" @submit.prevent="error = ''; settingsConfirmation = true">
          <AppDropdown v-model="settings.mode" label="Registration mode" :options="modeOptions" :disabled="busy" />
          <AppDropdown v-model="settings.status" label="Availability" :options="statusOptions" :disabled="busy" />
          <button type="submit" :disabled="busy">Review settings</button>
        </form>
        <ConfirmDialog :open="settingsConfirmation" title="Update registration availability?" :message="'Set ' + settings.mode + ' registration to ' + settings.status + '. This changes the public website. Resolve the waitlist and active holds before switching to paid.'" confirm-label="Save settings" :busy="busy" @cancel="settingsConfirmation = false" @confirm="mutate('/settings', settings, 'Registration settings updated.', 'PATCH')">
          <p v-if="error" role="alert" class="text-dc-pink">{{ error }}</p>
        </ConfirmDialog>
      </section>
      <section v-if="owner && activeSection === 'form'" class="ops-panel registration-panel">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2>Testing settings</h2>
          <span v-if="testingQuery.data.value" class="registration-badge">{{ testingQuery.data.value.enabled ? 'Restricted to testers' : 'Off' }}</span>
        </div>
        <p class="text-sm text-dc-gray">Use real registration with approved emails. Testing uses actual places and admission codes; it is not an isolated sandbox.</p>
        <p v-if="testingQuery.isPending.value" role="status">Loading testing settings…</p>
        <div v-else-if="testingQuery.isError.value">
          <p class="text-dc-pink">Apply the registration testing migration to enable these controls.</p>
          <button @click="testingQuery.refetch()">Try again</button>
        </div>
        <form v-else class="testing-settings-form" @submit.prevent="error = ''; testingConfirmation = true">
          <label class="testing-toggle"><input v-model="testing.enabled" type="checkbox" :disabled="busy" /> Restrict to approved testers</label>
          <div class="testing-settings-row">
            <label for="tester-emails">Approved tester emails
              <textarea id="tester-emails" v-model="testing.emails" class="app-form-control w-full" rows="4" maxlength="51000" :disabled="busy" aria-describedby="tester-help tester-error" :aria-invalid="Boolean(testingError)" />
            </label>
            <button type="submit" :disabled="busy || Boolean(testingError)">Review testing settings</button>
          </div>
          <p id="tester-help" class="text-xs text-dc-gray">One address per line. Add or remove addresses, then save. {{ testerEmails.length }} / 200 addresses. An empty list blocks everyone while enabled.</p>
          <p id="tester-error" role="status" class="text-sm text-dc-pink">{{ testingError }}</p>
        </form>
        <ConfirmDialog :open="testingConfirmation" :title="testing.enabled ? 'Save testing restrictions?' : 'Turn off testing restrictions?'" :message="testing.enabled ? 'Only the ' + testerEmails.length + ' approved addresses can register and receive conference emails. Changes apply to future sends; messages already in flight or sent cannot be recalled.' : 'Open registration will no longer be restricted to testers. Existing testing records, valid QR codes, and capacity remain. Review cleanup separately before launch. Testing-record emails remain restricted to the saved list.'" confirm-label="Save testing settings" :busy="busy" :confirm-disabled="Boolean(testingError)" :danger="!testing.enabled && Boolean(testingQuery.data.value?.enabled)" @cancel="testingConfirmation = false" @confirm="mutate('/testing', { enabled: testing.enabled, tester_emails: testerEmails }, 'Testing settings saved.', 'PATCH')">
          <p v-if="error" role="alert" class="text-dc-pink">{{ error }}</p>
        </ConfirmDialog>
        <div v-if="testingQuery.data.value?.enabled && testingQuery.data.value?.local_delivery" class="mt-5 border-t border-dc-ink/15 pt-4">
          <p class="text-sm text-dc-gray">The scheduled email worker does not run in local development. Process a bounded batch here after registering or queueing an update.</p>
          <button type="button" :disabled="busy" @click="error = ''; deliveryConfirmation = true">Process queued emails</button>
        </div>
        <ConfirmDialog :open="deliveryConfirmation" title="Process queued conference emails?" message="This sends real emails to approved tester addresses using your local email configuration. It processes one bounded batch; provider acceptance is not proof of inbox delivery." confirm-label="Process batch" :busy="busy" @cancel="deliveryConfirmation = false" @confirm="mutate('/testing/deliver', {}, 'Email batch processed.')">
          <p v-if="error" role="alert" class="text-dc-pink">{{ error }}</p>
        </ConfirmDialog>
      </section>
      <AnnualConferenceGuests v-if="activeSection === 'guests'" :registrations="guests"
        :refresh-registrations="() => registrations.refetch()" :management-busy="busy" :allow-recovery="owner"
        @cancel="cancellation = $event" @recover="error = ''; recovery = $event" />
      <ConfirmDialog :open="Boolean(recovery)" :title="'Recover ' + (recovery?.name ?? '') + '’s registration?'" message="Create a fresh registration using this guest’s saved details. Older waitlisted guests keep priority. A new admission QR or waitlist notice will be queued for email. The cancelled registration and its old QR remain cancelled." confirm-label="Recover and queue email" :busy="busy" @cancel="error = ''; recovery = null" @confirm="recovery && mutate('/' + recovery.id + '/recover', { confirmed: true }, 'Registration recovered.')">
        <p v-if="error" role="alert" class="text-dc-pink">{{ error }}</p>
      </ConfirmDialog>
        <ConfirmDialog :open="Boolean(cancellation)" :title="'Cancel ' + (cancellation?.name ?? '') + '’s registration?'" message="Their QR will stop working. Available places go to the oldest waitlisted registrations, which are queued for email. Checked-in registrations cannot be cancelled." confirm-label="Cancel registration" danger :busy="busy" @cancel="cancellation = null" @confirm="cancellation && mutate('/' + cancellation.id + '/cancel', {}, 'Registration cancelled.')">
          <p v-if="error" role="alert" class="text-dc-pink">{{ error }}</p>
        </ConfirmDialog>

      <AnnualConferenceRegistrationEmails v-if="activeSection === 'emails'" :year="year" />
      <AnnualConferenceCommunityTickets v-if="owner && canManageRegistration && activeSection === 'community'" :year="year" />
      <section v-if="activeSection === 'blasts'" class="ops-panel registration-panel">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2>Blasts</h2>
          <button type="button" class="editorial-action" :disabled="busy" @click="blastComposerOpen = !blastComposerOpen">{{ blastComposerOpen ? 'Cancel' : 'Create blast' }}</button>
        </div>
        <p>Create a separate update whenever needed. Each draft captures the confirmed audience at that moment. Use this for DevCon26 logistics and programme updates—not unrelated marketing. Waitlisted and cancelled people are excluded.</p>
        <form v-if="blastComposerOpen" class="blast-composer" @submit.prevent="error = ''; draftConfirmation = true">
          <p class="font-semibold">Write the update</p>
          <div class="flex flex-wrap gap-2" aria-label="Blast starter templates">
            <button v-for="starter in blastTemplates" :key="starter.id" type="button" @click="Object.assign(draft, { subject: starter.subject, body: starter.body })">{{ starter.label }}</button>
          </div>
          <label>Subject<input class="app-form-control" v-model="draft.subject" maxlength="160" required /></label>
          <label>Message<textarea class="app-form-control" v-model="draft.body" maxlength="12000" rows="5" required /></label>
          <button type="submit" :disabled="busy">Review draft</button>
        </form>
        <p v-if="blasts.isError.value">Update history could not be loaded.</p>
        <p v-if="blasts.isPending.value" role="status">Loading blast history…</p>
        <p v-else-if="!blasts.isError.value && !blastHistory.length" class="py-8 text-center text-sm text-dc-gray">No blasts yet. Create an update for your confirmed guests.</p>
        <ul class="attendees"><li v-for="blast in displayedBlasts" :key="blast.id"><div><strong>{{ blast.subject }}</strong><p>{{ blast.status }} · {{ blast.recipients }} recipients · {{ blast.accepted }} accepted by email provider · {{ blast.needs_attention }} failed or suppressed</p></div><button @click="review = blast">Review</button></li></ul>
        <AppPagination v-if="blastHistory.length > 10" v-model:page="blastPage" :page-count="blastPageCount" :total="blastHistory.length" :range-start="(blastPage - 1) * 10 + 1" :range-end="Math.min(blastPage * 10, blastHistory.length)" item-label="blasts" />
        <ConfirmDialog :open="Boolean(review)" :title="review?.subject ?? 'Review update'" :message="(review?.recipients ?? 0) + ' snapshotted recipients. Delivery runs in batches. While testing, only approved emails can send.'" confirm-label="Queue update" :busy="busy" :confirm-disabled="review?.status !== 'draft' || review?.recipients === 0" @cancel="review = null" @confirm="review && mutate('/blasts/' + review.id + '/send', { confirmed: true }, 'Update queued.')">
          <p class="max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-md border border-dc-ink/15 bg-dc-cream p-4 text-sm">{{ review?.body }}</p>
          <p v-if="error" role="alert" class="text-dc-pink">{{ error }}</p>
        </ConfirmDialog>
      </section>
    </template>
      <ConfirmDialog :open="draftConfirmation" title="Prepare this update?" message="Save a draft and capture the confirmed audience. Nothing sends until you review and queue it." confirm-label="Prepare draft" :busy="busy" @cancel="draftConfirmation = false" @confirm="mutate('/blasts', draft, 'Draft prepared. Review it before sending.')">
        <h3 class="font-semibold">{{ draft.subject }}</h3>
        <p class="max-h-60 overflow-auto whitespace-pre-wrap break-words text-sm">{{ draft.body }}</p>
        <p v-if="error" role="alert" class="text-dc-pink">{{ error }}</p>
      </ConfirmDialog>
    </div>
  </main>
</template>

<style scoped src="@/src/styles/registration-workspace.css"></style>

<style scoped>
.registration-content {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 24px;
}

.registration-content > * {
  min-width: 0;
}

.registration-guest-controls {
  position: static;
  box-shadow: none;
}
.registration-panel {
  padding: 24px;
}
.guest-status-filter {
  border: 1px solid #d6d2c8;
  font-size: 10px;
}
.guest-status-filter--active {
  border-color: #e8117f;
  background: #e8117f;
  color: white;
}
h2 {
  @apply text-xl font-semibold text-dc-ink;
  margin-bottom: 12px;
}
.registration-panel p {
  line-height: 1.6;
  margin: 8px 0;
}
.metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}
.metrics p {
  @apply rounded-lg border border-dc-ink/15 bg-dc-cream p-4 text-sm text-dc-gray;
}
.metrics strong {
  @apply mb-2 block text-3xl font-semibold tabular-nums text-dc-ink;
}
.actions {
  display: flex;
  justify-content: space-between;
  gap: 16px;
}
form {
  display: grid;
  gap: 16px;
  max-width: 660px;
  margin-top: 20px;
}
.registration-settings-row,
.testing-settings-form,
.blast-composer {
  max-width: none;
}
.testing-settings-row {
  display: grid;
  gap: 16px;
}
.registration-settings-row > *,
.testing-settings-row > * {
  min-width: 0;
}
@media (min-width: 900px) {
  .registration-settings-row {
    grid-template-columns: repeat(2, minmax(0, 1fr)) auto;
    align-items: end;
  }
  .testing-settings-row {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: end;
  }
}
label {
  display: grid;
  gap: 8px;
  @apply text-sm font-semibold;
}
.testing-toggle {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 44px;
}
.testing-toggle input {
  width: 20px;
  height: 20px;
  accent-color: #ed008c;
}
button {
  @apply min-h-11 rounded-md border-2 border-dc-ink bg-white px-4 py-2 font-mono text-xs font-semibold uppercase text-dc-ink disabled:cursor-not-allowed disabled:opacity-50;
  transition: transform 120ms cubic-bezier(.4, 0, .2, 1);
}
button:active:not(:disabled) {
  transform: scale(.97);
}
button[type="submit"] {
  @apply bg-dc-pink text-white;
}
.attendees {
  list-style: none;
  padding: 0;
}
.attendees li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
  padding: 20px 0;
  @apply border-b border-dc-ink/15;
}
.attendees li > div {
  min-width: 0;
  overflow-wrap: anywhere;
}
.registration-badge {
  @apply inline-flex rounded-md border border-dc-ink/15 bg-dc-cream px-2 py-1 text-xs font-medium text-dc-ink;
}
@media (max-width: 600px) {
  .registration-panel {
    padding: 20px;
  }
  .metrics {
    grid-template-columns: 1fr;
    gap: 8px;
  }
}
@media (prefers-reduced-motion: reduce) {
  button {
    transition: none;
  }
  button:active:not(:disabled) {
    transform: none;
  }
}
</style>
