<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useQuery } from '@tanstack/vue-query';
import AnnualConferenceNav from '@/src/components/AnnualConferenceNav.vue';
import AppDropdown from '@/src/components/AppDropdown.vue';
import ConfirmDialog from '@/src/components/ui/ConfirmDialog.vue';
import AnnualConferenceRouteSkeleton from '@/src/components/ui/page-skeletons/AnnualConferenceRouteSkeleton.vue';
import { fetchAdminSession, fetchJson, queryKeys } from '@/src/lib/api';

type Registration = { id: string; name: string; email: string; status: 'confirmed' | 'waitlisted' | 'cancelled'; created_at: string; is_test: boolean };
type Overview = { mode: 'free' | 'paid'; status: 'draft' | 'open' | 'closed'; capacity: number; reserved: number; confirmed: number; waitlisted: number };
type Blast = { id: string; subject: string; body: string; status: string; recipients: number; accepted: number; needs_attention: number };
const route = useRoute();
const year = computed(() => String(route.params.year));
const endpoint = computed(() => `/api/annual-conference/${year.value}/registrations`);
const offset = ref(0);
const message = ref('');
const busy = ref(false);
const cancellation = ref<Registration | null>(null);
const review = ref<Blast | null>(null);
const draft = reactive({ subject: '', body: '' });
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
  queryKey: computed(() => ['conference-registrations', year.value, offset.value]),
  queryFn: () => fetchJson<{ overview: Overview; registrations: Registration[] }>(`${endpoint.value}?offset=${offset.value}`, { credentials: 'include' }),
});
const blasts = useQuery({
  queryKey: computed(() => ['conference-attendee-blasts', year.value]),
  queryFn: () => fetchJson<{ blasts: Blast[] }>(`${endpoint.value}/blasts`, { credentials: 'include' }),
});

watch(() => registrations.data.value?.overview, (overview, previous) => {
  const unchanged = !previous || (settings.mode === previous.mode && settings.status === previous.status);

  if (overview && unchanged && !settingsConfirmation.value) Object.assign(settings, { mode: overview.mode, status: overview.status });
}, { immediate: true });
watch(() => testingQuery.data.value, (value, previous) => {
  const unchanged = !previous || (testing.enabled === previous.enabled && testing.emails === previous.tester_emails.join('\n'));

  if (value && unchanged && !testingConfirmation.value) Object.assign(testing, { enabled: value.enabled, emails: value.tester_emails.join('\n') });
}, { immediate: true });
watch(year, () => {
  offset.value = 0;
  cancellation.value = null;
  review.value = null;
  settingsConfirmation.value = false;
  testingConfirmation.value = false;
  draftConfirmation.value = false;
  deliveryConfirmation.value = false;
  error.value = '';
  Object.assign(draft, { subject: '', body: '' });
});

async function mutate(path: string, body: unknown, success: string, method = 'POST') {
  if (busy.value) return;
  busy.value = true;
  message.value = '';
  error.value = '';

  try {
    const response = await fetchJson<{ admissions?: { configured: boolean; accepted: number }; social?: { configured: boolean; accepted: number }; updates?: { configured: boolean; accepted: number } }>(`${endpoint.value}${path}`, { method, credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

    message.value = path === '/testing/deliver'
      ? [response.admissions, response.social, response.updates].every((result) => result?.configured)
        ? `Email batch processed: ${(response.admissions?.accepted ?? 0) + (response.social?.accepted ?? 0) + (response.updates?.accepted ?? 0)} accepted by the provider. Check delivery and your inbox separately.`
        : 'Some email senders are not configured locally. Check the admission, social-card, and attendee-update email settings before retrying.'
      : success;
    cancellation.value = null;
    review.value = null;
    settingsConfirmation.value = false;
    testingConfirmation.value = false;
    draftConfirmation.value = false;
    deliveryConfirmation.value = false;
    if (path === '/blasts') Object.assign(draft, { subject: '', body: '' });
    await Promise.all([registrations.refetch(), blasts.refetch(), ...(owner.value ? [testingQuery.refetch()] : [])]);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'The change could not be saved.';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <main class="editorial-page"><div class="editorial-wrap registration-content">
    <AnnualConferenceNav :show-page-heading="false" />
    <header class="border-b-2 border-dc-ink pb-5">
      <p class="editorial-eyebrow">DevCon{{ year.slice(-2) }} · attendees</p>
      <h1 class="mt-2 text-3xl font-semibold text-dc-ink">Registration</h1>
      <p class="mt-2 text-sm text-dc-gray">Manage places, the waitlist, and conference updates.</p>
    </header>
    <p role="status" aria-live="polite">{{ message }}</p>
    <AnnualConferenceRouteSkeleton v-if="registrations.isPending.value" variant="overview" />
    <section v-else-if="registrations.isError.value" class="editorial-panel registration-panel"><h2>Registration unavailable</h2><p>Check your access and connection.</p><button @click="registrations.refetch()">Try again</button></section>
    <template v-else-if="registrations.data.value">
      <section class="editorial-panel registration-panel">
        <h2>Places in the room</h2>
        <div class="metrics">
          <p><strong>{{ registrations.data.value.overview.confirmed }}</strong> confirmed registrations</p>
          <p><strong>{{ registrations.data.value.overview.waitlisted }}</strong> waitlisted</p>
          <p><strong>{{ registrations.data.value.overview.reserved }} / {{ registrations.data.value.overview.capacity }}</strong> total reserved capacity</p>
        </div>
        <p>Capacity includes registrations, paid bookings, sponsor allocations, and active checkout holds. Change the capacity in Ticketing; increasing it promotes the oldest waitlisted registrations automatically.</p>
        <form v-if="owner" @submit.prevent="error = ''; settingsConfirmation = true">
          <AppDropdown v-model="settings.mode" label="Registration mode" :options="modeOptions" :disabled="busy" />
          <AppDropdown v-model="settings.status" label="Availability" :options="statusOptions" :disabled="busy" />
          <button type="submit" :disabled="busy">Review settings</button>
        </form>
        <ConfirmDialog :open="settingsConfirmation" title="Update registration availability?" :message="'Set ' + settings.mode + ' registration to ' + settings.status + '. This changes the public website. Resolve the waitlist and active holds before switching to paid.'" confirm-label="Save settings" :busy="busy" @cancel="settingsConfirmation = false" @confirm="mutate('/settings', settings, 'Registration settings updated.', 'PATCH')">
          <p v-if="error" role="alert" class="text-dc-pink">{{ error }}</p>
        </ConfirmDialog>
      </section>
      <section v-if="owner" class="editorial-panel registration-panel">
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
        <form v-else @submit.prevent="error = ''; testingConfirmation = true">
          <label class="testing-toggle"><input v-model="testing.enabled" type="checkbox" :disabled="busy" /> Restrict to approved testers</label>
          <label for="tester-emails">Approved tester emails</label>
          <textarea id="tester-emails" v-model="testing.emails" class="app-form-control w-full" rows="4" maxlength="51000" :disabled="busy" aria-describedby="tester-help tester-error" :aria-invalid="Boolean(testingError)" />
          <p id="tester-help" class="text-xs text-dc-gray">One address per line. Add or remove addresses, then save. {{ testerEmails.length }} / 200 addresses. An empty list blocks everyone while enabled.</p>
          <p id="tester-error" role="status" class="text-sm text-dc-pink">{{ testingError }}</p>
          <button type="submit" :disabled="busy || Boolean(testingError)">Review testing settings</button>
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
      <section class="editorial-panel registration-panel">
        <h2>Attendees and waitlist</h2>
        <div v-if="!registrations.data.value.registrations.length" class="py-6"><h3 class="font-semibold">Ready for your first registration</h3><p class="text-sm text-dc-gray">Open free registration and share the page with your approved testers.</p></div>
        <ul class="attendees">
          <li v-for="person in registrations.data.value.registrations" :key="person.id">
            <div><strong>{{ person.name }}</strong><p>{{ person.email }}</p><span class="registration-badge">{{ person.status }}</span><span v-if="person.is_test" class="registration-badge ml-2">Testing</span></div>
            <button v-if="person.status !== 'cancelled'" :disabled="busy" @click="cancellation = person">Cancel registration</button>
          </li>
        </ul>
        <div class="actions"><button :disabled="offset === 0 || busy" @click="offset = Math.max(0, offset - 100)">Previous</button><button :disabled="registrations.data.value.registrations.length < 100 || busy" @click="offset += 100">Next</button></div>
        <ConfirmDialog :open="Boolean(cancellation)" :title="'Cancel ' + (cancellation?.name ?? '') + '’s registration?'" message="Their QR will stop working. Available places go to the oldest waitlisted registrations, which are queued for email. Checked-in registrations cannot be cancelled." confirm-label="Cancel registration" danger :busy="busy" @cancel="cancellation = null" @confirm="cancellation && mutate('/' + cancellation.id + '/cancel', {}, 'Registration cancelled.')">
          <p v-if="error" role="alert" class="text-dc-pink">{{ error }}</p>
        </ConfirmDialog>
      </section>
      <section class="editorial-panel registration-panel">
        <h2>Attendee updates</h2>
        <p>Create a separate update whenever needed. Each draft captures the confirmed audience at that moment. Use this for DevCon26 logistics and programme updates—not unrelated marketing. Waitlisted and cancelled people are excluded.</p>
        <form @submit.prevent="error = ''; draftConfirmation = true">
          <label>Subject<input class="app-form-control" v-model="draft.subject" maxlength="160" required /></label>
          <label>Message<textarea class="app-form-control" v-model="draft.body" maxlength="12000" rows="5" required /></label>
          <button type="submit" :disabled="busy">Prepare update</button>
        </form>
        <p v-if="blasts.isError.value">Update history could not be loaded.</p>
        <ul class="attendees"><li v-for="blast in blasts.data.value?.blasts ?? []" :key="blast.id"><div><strong>{{ blast.subject }}</strong><p>{{ blast.status }} · {{ blast.recipients }} recipients · {{ blast.accepted }} accepted by email provider · {{ blast.needs_attention }} failed or suppressed</p></div><button @click="review = blast">Review</button></li></ul>
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

<style scoped>
.registration-content {
  display: grid;
  gap: 24px;
}
.registration-panel {
  padding: 24px;
}
h2 {
  @apply text-xl font-semibold text-dc-ink;
  margin-bottom: 12px;
}
p {
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
