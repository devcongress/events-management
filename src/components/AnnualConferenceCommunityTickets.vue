<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import ConfirmDialog from '@/src/components/ui/ConfirmDialog.vue';
import { fetchJson } from '@/src/lib/api';

type PoolTicket = {
  allocation_id: string;
  order_id: string;
  seat_index: number;
  ticket_id: string;
  ticket_status: 'pending';
};

const props = defineProps<{ year: string }>();
const queryClient = useQueryClient();
const offset = ref(0);
const selected = ref<PoolTicket | null>(null);
const recipient = reactive({ name: '', email: '' });
const busy = ref(false);
const error = ref('');
const success = ref('');
const confirmationOpen = ref(false);
const assignmentKey = ref('');
const endpoint = computed(() => `/api/annual-conference/${props.year}/ticketing/flexible/community-pool`);
const pool = useQuery({
  queryKey: computed(() => ['conference-community-ticket-pool', props.year, offset.value]),
  enabled: computed(() => props.year === '2026'),
  queryFn: () => fetchJson<{ tickets: PoolTicket[]; next_offset: number | null }>(
    `${endpoint.value}?offset=${offset.value}`, { credentials: 'include' },
  ),
});

function choose(ticket: PoolTicket) {
  selected.value = ticket;
  recipient.name = '';
  recipient.email = '';
  assignmentKey.value = crypto.randomUUID();
  error.value = '';
  success.value = '';
}

async function assign() {
  if (!selected.value || busy.value || props.year !== '2026') return;

  busy.value = true;
  error.value = '';
  confirmationOpen.value = false;

  try {
    await fetchJson<{ assigned: true; delivery_queued: boolean }>(`${endpoint.value}/assign`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        allocation_id: selected.value.allocation_id,
        attendee_name: recipient.name.trim(),
        attendee_email: recipient.email.trim().toLowerCase(),
        idempotency_key: assignmentKey.value,
      }),
    });

    success.value = `Seat ${selected.value.seat_index} was assigned. An admission email is queued; check delivery separately.`;
    selected.value = null;
    await queryClient.invalidateQueries({ queryKey: ['conference-community-ticket-pool', props.year] });
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Unable to assign this seat. Refresh the pool and try again.';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="ops-panel registration-panel community-pool">
    <div class="community-heading">
      <div>
        <h2>Community-funded seats</h2>
        <p>These paid places are waiting for DevCongress to choose a recipient. Assign one seat at a time; the admission code is emailed directly to that person.</p>
      </div>
      <button type="button" :disabled="pool.isFetching.value || busy" @click="pool.refetch()">Refresh</button>
    </div>

    <p v-if="year !== '2026'" role="status">This pool is available for DevCon26 only.</p>
    <p v-else-if="pool.isPending.value" role="status">Loading community-funded seats…</p>
    <div v-else-if="pool.isError.value" role="alert">
      <p>Unable to load the community pool. Check the migration and your connection.</p>
      <button type="button" @click="pool.refetch()">Try again</button>
    </div>
    <template v-else-if="pool.data.value">
      <p v-if="!pool.data.value.tickets.length" class="community-empty" role="status">No community-funded seats are waiting for assignment.</p>
      <ul v-else class="community-list" aria-label="Unassigned community-funded tickets">
        <li v-for="ticket in pool.data.value.tickets" :key="ticket.allocation_id" class="community-row">
          <div>
            <strong>Seat {{ ticket.seat_index }}</strong>
            <span>Order {{ ticket.order_id.slice(0, 8).toUpperCase() }}</span>
          </div>
          <button type="button" :disabled="busy" @click="choose(ticket)">Assign recipient</button>
        </li>
      </ul>
      <div class="community-pagination">
        <button type="button" :disabled="offset === 0 || busy" @click="offset = Math.max(0, offset - 100)">Previous</button>
        <span>Page {{ Math.floor(offset / 100) + 1 }}</span>
        <button type="button" :disabled="pool.data.value.next_offset === null || busy" @click="offset = pool.data.value.next_offset!">Next</button>
      </div>
    </template>

    <form v-if="selected" class="community-form" @submit.prevent="confirmationOpen = true">
      <div class="community-form-heading">
        <h3>Assign seat {{ selected.seat_index }}</h3>
        <button type="button" :disabled="busy" @click="selected = null">Cancel</button>
      </div>
      <p>Use the recipient’s own name and email. Once assigned, the code is private to them and cannot be reassigned here.</p>
      <div class="community-fields">
        <label>Name<input v-model="recipient.name" class="app-form-control" required maxlength="120" autocomplete="name" :disabled="busy" /></label>
        <label>Email<input v-model="recipient.email" class="app-form-control" type="email" required maxlength="254" autocomplete="email" :disabled="busy" /></label>
      </div>
      <button type="submit" :disabled="busy">Review assignment</button>
    </form>
    <p v-if="error" role="alert" class="text-dc-pink">{{ error }}</p>
    <p v-if="success" role="status">{{ success }}</p>
    <ConfirmDialog :open="confirmationOpen" title="Assign this community seat?" :message="`Seat ${selected?.seat_index ?? ''} will be assigned to ${recipient.name.trim()} at ${recipient.email.trim()}. An admission email will be queued; this cannot be undone in this screen.`" confirm-label="Assign and queue email" :busy="busy" @cancel="confirmationOpen = false" @confirm="assign" />
  </section>
</template>

<style scoped>
.community-pool { display: grid; gap: 1.25rem; }
.community-heading, .community-row, .community-form-heading, .community-pagination { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
.community-heading { align-items: start; }
.community-heading p, .community-form p { max-width: 65ch; color: var(--dc-gray, #666); }
.community-list { display: grid; gap: .5rem; padding: 0; list-style: none; }
.community-row { padding: .9rem 0; border-top: 1px solid rgb(0 0 0 / 14%); }
.community-row div { display: grid; gap: .15rem; }
.community-row span { color: var(--dc-gray, #666); font-size: .875rem; }
.community-pagination { justify-content: flex-end; }
.community-empty { padding: 1.5rem; border: 1px dashed rgb(0 0 0 / 22%); border-radius: 8px; }
.community-form { display: grid; gap: 1rem; padding: 1.25rem; border: 1px solid rgb(0 0 0 / 20%); border-radius: 8px; }
.community-form h3 { font-size: 1.1rem; font-weight: 700; }
.community-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
.community-fields label { display: grid; gap: .35rem; }
button { transition: transform 120ms cubic-bezier(0.4, 0, 0.2, 1); }
button:active { transform: scale(.97); }
@media (max-width: 680px) {
  .community-heading, .community-row { align-items: stretch; flex-direction: column; }
  .community-fields { grid-template-columns: 1fr; }
  .community-pagination { justify-content: space-between; }
}
@media (prefers-reduced-motion: reduce) { button { transition: none; } }
</style>
