<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useQuery } from '@tanstack/vue-query';
import AnnualConferenceNav from '@/src/components/AnnualConferenceNav.vue';
import { fetchAdminSession, fetchJson, queryKeys } from '@/src/lib/api';

type Registration = { id: string; name: string; email: string; status: 'confirmed' | 'waitlisted' | 'cancelled'; created_at: string };
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
const session = useQuery({ queryKey: queryKeys.adminSession, queryFn: fetchAdminSession });
const owner = computed(() => session.data.value?.user?.role === 'owner');
const registrations = useQuery({
  queryKey: computed(() => ['conference-registrations', year.value, offset.value]),
  queryFn: () => fetchJson<{ overview: Overview; registrations: Registration[] }>(`${endpoint.value}?offset=${offset.value}`, { credentials: 'include' }),
});
const blasts = useQuery({
  queryKey: computed(() => ['conference-attendee-blasts', year.value]),
  queryFn: () => fetchJson<{ blasts: Blast[] }>(`${endpoint.value}/blasts`, { credentials: 'include' }),
});

watch(() => registrations.data.value?.overview, (overview) => {
  if (overview) Object.assign(settings, { mode: overview.mode, status: overview.status });
}, { immediate: true });
watch(year, () => { offset.value = 0; cancellation.value = null; review.value = null; });

async function mutate(path: string, body: unknown, success: string, method = 'POST') {
  if (busy.value) return;
  busy.value = true;
  message.value = '';

  try {
    await fetchJson(`${endpoint.value}${path}`, { method, credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    message.value = success;
    cancellation.value = null;
    review.value = null;
    settingsConfirmation.value = false;
    await Promise.all([registrations.refetch(), blasts.refetch()]);
  } catch (error) {
    message.value = error instanceof Error ? error.message : 'The change could not be saved.';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <main class="conference-registration-admin">
    <AnnualConferenceNav title="Registration" description="Manage places, the waitlist, and updates for this annual conference." />
    <p role="status" aria-live="polite">{{ message }}</p>
    <p v-if="registrations.isPending.value">Loading registration…</p>
    <section v-else-if="registrations.isError.value" class="panel"><h2>Registration unavailable</h2><p>Check your access and connection.</p><button @click="registrations.refetch()">Try again</button></section>
    <template v-else-if="registrations.data.value">
      <section class="panel">
        <h2>Places in the room</h2>
        <div class="metrics">
          <p><strong>{{ registrations.data.value.overview.confirmed }}</strong> confirmed registrations</p>
          <p><strong>{{ registrations.data.value.overview.waitlisted }}</strong> waitlisted</p>
          <p><strong>{{ registrations.data.value.overview.reserved }} / {{ registrations.data.value.overview.capacity }}</strong> total reserved capacity</p>
        </div>
        <p>Capacity includes registrations, paid bookings, sponsor allocations, and active checkout holds. Change the capacity in Ticketing; increasing it promotes the oldest waitlisted registrations automatically.</p>
        <form v-if="owner" @submit.prevent="settingsConfirmation = true">
          <label>Registration mode<select class="app-form-control" v-model="settings.mode"><option value="free">Free registration</option><option value="paid">Paid · Regular only</option></select></label>
          <label>Availability<select class="app-form-control" v-model="settings.status"><option value="draft">Draft</option><option value="open">Open</option><option value="closed">Closed</option></select></label>
          <button :disabled="busy">Review settings</button>
        </form>
        <section v-if="settingsConfirmation" class="confirmation">
          <h3>Set {{ settings.mode }} registration to {{ settings.status }}?</h3>
          <p>This controls the public website. Resolve the free waitlist before reopening paid booking.</p>
          <button :disabled="busy" @click="mutate('/settings', settings, 'Registration settings updated.', 'PATCH')">Confirm change</button>
          <button :disabled="busy" @click="settingsConfirmation = false">Keep current settings</button>
        </section>
      </section>
      <section class="panel">
        <h2>Attendees and waitlist</h2>
        <p v-if="!registrations.data.value.registrations.length">No registrations on this page yet.</p>
        <ul class="attendees">
          <li v-for="person in registrations.data.value.registrations" :key="person.id">
            <div><strong>{{ person.name }}</strong><p>{{ person.email }}</p><span>{{ person.status }}</span></div>
            <button v-if="person.status !== 'cancelled'" :disabled="busy" @click="cancellation = person">Cancel registration</button>
          </li>
        </ul>
        <div class="actions"><button :disabled="offset === 0 || busy" @click="offset = Math.max(0, offset - 100)">Previous</button><button :disabled="registrations.data.value.registrations.length < 100 || busy" @click="offset += 100">Next</button></div>
        <section v-if="cancellation" class="confirmation">
          <h3>Cancel {{ cancellation.name }}’s registration?</h3>
          <p>Their QR will stop working. If a place opens, the next waitlisted person is promoted and emailed automatically.</p>
          <button :disabled="busy" @click="mutate(`/${cancellation.id}/cancel`, {}, 'Registration cancelled; available places were offered to the waitlist.')">Confirm cancellation</button>
          <button :disabled="busy" @click="cancellation = null">Keep registration</button>
        </section>
      </section>
      <section class="panel">
        <h2>Attendee updates</h2>
        <p>Create a separate update whenever needed. Each draft captures the confirmed audience at that moment. Use this for DevCon26 logistics and programme updates—not unrelated marketing. Waitlisted and cancelled people are excluded.</p>
        <form @submit.prevent="mutate('/blasts', draft, 'Draft prepared. Review its message and recipient count before sending.')">
          <label>Subject<input class="app-form-control" v-model="draft.subject" maxlength="160" required /></label>
          <label>Message<textarea class="app-form-control" v-model="draft.body" maxlength="12000" rows="5" required /></label>
          <button :disabled="busy">Prepare update</button>
        </form>
        <p v-if="blasts.isError.value">Update history could not be loaded.</p>
        <ul class="attendees"><li v-for="blast in blasts.data.value?.blasts ?? []" :key="blast.id"><div><strong>{{ blast.subject }}</strong><p>{{ blast.status }} · {{ blast.recipients }} recipients · {{ blast.accepted }} accepted by email provider · {{ blast.needs_attention }} failed or suppressed</p></div><button @click="review = blast">Review</button></li></ul>
        <section v-if="review" class="confirmation">
          <h3>{{ review.subject }}</h3>
          <p class="message-preview">{{ review.body }}</p>
          <p>{{ review.recipients }} snapshotted recipients. Delivery runs in batches when configured and email capacity is available.</p>
          <button v-if="review.status === 'draft'" :disabled="busy || review.recipients === 0" @click="mutate(`/blasts/${review.id}/send`, { confirmed: true }, 'Update queued. Delivery progress appears in the history.')">Confirm and queue update</button>
          <button :disabled="busy" @click="review = null">Close review</button>
        </section>
      </section>
    </template>
  </main>
</template>

<style scoped>
.conference-registration-admin {
  padding: 24px;
}
.panel {
  margin: 24px 0;
  padding: 24px;
  border: 1px solid #5555;
  border-radius: 12px;
}
h2 {
  font-size: 24px;
  font-weight: 700;
  margin-bottom: 16px;
}
p {
  line-height: 1.6;
  margin: 8px 0;
}
.metrics, .actions {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
}
.metrics strong {
  display: block;
  font-size: 28px;
}
form {
  display: grid;
  gap: 16px;
  max-width: 660px;
  margin: 20px 0;
}
label {
  display: grid;
  gap: 8px;
  font-weight: 600;
}
input, textarea, select {
  padding: 12px;
  border: 1px solid #888;
  border-radius: 8px;
  color: inherit;
  background: transparent;
}
button {
  padding: 12px 16px;
  min-height: 44px;
  border: 1px solid #888;
  border-radius: 8px;
  font-weight: 600;
}
button:disabled {
  opacity: .45;
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
  padding: 16px 0;
  border-bottom: 1px solid #5555;
}
.confirmation {
  padding: 20px;
  border: 1px solid #888;
  border-radius: 8px;
  margin-top: 20px;
}
.confirmation button {
  margin: 8px 12px 0 0;
}
.message-preview {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
@media (max-width: 600px) {
  .conference-registration-admin, .panel {
    padding: 16px;
  }
}
</style>
