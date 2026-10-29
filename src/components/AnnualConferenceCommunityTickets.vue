<script setup lang="ts">
import BoneyardPageSkeleton from '@/src/components/ui/BoneyardPageSkeleton.vue';
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import AppDropdown from '@/src/components/AppDropdown.vue';
import { fetchJson } from '@/src/lib/api';
import type { CommunityPurchase, CommunitySeat } from '@/lib/annual-conference-community-purchases';

const props = defineProps<{ year: string }>();
const queryClient = useQueryClient();
const offset = ref(0);
const mode = ref<'live' | 'test'>('live');
const paymentModeOptions: Array<{ value: 'live' | 'test'; label: string }> = [
  { value: 'live', label: 'Live purchases' },
  { value: 'test', label: 'Test purchases' },
];
const orderId = ref<string | null>(null);
const seatId = ref<string | null>(null);
const recipient = reactive({ name: '', email: '' });
const busy = ref(false);
const error = ref('');
const success = ref('');
const reviewing = ref(false);
const assignmentKey = ref('');
const dialog = ref<HTMLDialogElement | null>(null);
const closeButton = ref<HTMLButtonElement | null>(null);
const reviewHeading = ref<HTMLElement | null>(null);
const nameInput = ref<HTMLInputElement | null>(null);
let previousFocus: HTMLElement | null = null;
let previousOverflow: string | null = null;
let previousRootOverflow: string | null = null;
const endpoint = computed(() => `/api/annual-conference/${props.year}/ticketing/flexible/community-pool`);
const pool = useQuery({
  queryKey: computed(() => ['conference-community-purchases', props.year, mode.value, offset.value]),
  enabled: computed(() => props.year === '2026'),
  queryFn: () => fetchJson<{ purchases: CommunityPurchase[]; next_offset: number | null }>(
    `${endpoint.value}/purchases?mode=${mode.value}&offset=${offset.value}`, { credentials: 'include' },
  ),
});
const purchase = computed(() => pool.data.value?.purchases.find((item) => item.order_id === orderId.value));
const selected = computed(() => purchase.value?.seats.find((seat) => seat.allocation_id === seatId.value));
const unavailable = computed(() => busy.value || pool.isFetching.value || pool.isError.value);

function updatePaymentMode(value: string | number) {
  if (busy.value) return;

  const option = paymentModeOptions.find(item => item.value === value);

  if (option) mode.value = option.value;
}

function resetAssignment() {
  seatId.value = null;
  reviewing.value = false;
  recipient.name = '';
  recipient.email = '';
  error.value = '';
}

function unlock() {
  if (previousOverflow !== null) document.body.style.overflow = previousOverflow;
  previousOverflow = null;
  if (previousRootOverflow !== null) document.documentElement.style.overflow = previousRootOverflow;
  previousRootOverflow = null;
  if (previousFocus?.isConnected) previousFocus.focus();
  previousFocus = null;
}

async function openPurchase(item: CommunityPurchase) {
  previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  previousOverflow = document.body.style.overflow;
  previousRootOverflow = document.documentElement.style.overflow;
  resetAssignment();
  success.value = '';
  orderId.value = item.order_id;
  await nextTick();
  dialog.value?.showModal();
  document.body.style.overflow = 'hidden';
  document.documentElement.style.overflow = 'hidden';
  closeButton.value?.focus();
}

function close() {
  if (busy.value) return;
  dialog.value?.close();
  orderId.value = null;
  resetAssignment();
  unlock();
}

async function choose(seat: CommunitySeat) {
  if (unavailable.value || seat.status !== 'pending') return;
  resetAssignment();
  seatId.value = seat.allocation_id;
  assignmentKey.value = crypto.randomUUID();
  success.value = '';
  await nextTick();
  nameInput.value?.focus();
}

async function review() {
  reviewing.value = true;
  await nextTick();
  reviewHeading.value?.focus();
}

async function editRecipient() {
  reviewing.value = false;
  await nextTick();
  nameInput.value?.focus();
}

async function assign() {
  if (!selected.value || selected.value.status !== 'pending' || unavailable.value || !reviewing.value) return;
  const seatNumber = selected.value.seat_index;

  busy.value = true;
  error.value = '';
  try {
    const result = await fetchJson<{ assigned: true; delivery_queued: boolean }>(`${endpoint.value}/assign`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        allocation_id: selected.value.allocation_id,
        attendee_name: recipient.name.trim(),
        attendee_email: recipient.email.trim().toLowerCase(),
        idempotency_key: assignmentKey.value,
      }),
    });

    resetAssignment();
    success.value = `Seat ${seatNumber} assigned. ${result.delivery_queued ? 'Admission email queued; delivery is tracked separately.' : 'Email delivery is not confirmed. Check email activity.'}`;
    await queryClient.invalidateQueries({ queryKey: ['conference-community-purchases', props.year] });
    await queryClient.invalidateQueries({ queryKey: ['conference-community-ticket-pool', props.year] });
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Unable to assign this seat. Please try again.';
  } finally {
    busy.value = false;
    await nextTick();
    if (success.value) closeButton.value?.focus();
  }
}

watch(() => selected.value?.status, (status) => {
  if (seatId.value && status !== 'pending') resetAssignment();
});
watch(mode, () => {
  close();
  offset.value = 0;
});
watch(() => props.year, () => close());
onBeforeUnmount(unlock);
</script>

<template>
  <section class="ops-panel registration-panel community-pool">
    <div class="community-heading">
      <div>
        <h2>Community-funded tickets</h2>
        <p>See who supported the community and assign their tickets to recipients.</p>
      </div>
      <button type="button" class="editorial-action" :disabled="pool.isFetching.value || busy" @click="pool.refetch()">Refresh</button>
    </div>
    <AppDropdown
      class="community-mode"
      label="Payment mode"
      :model-value="mode"
      :options="paymentModeOptions"
      :disabled="busy"
      teleport
      @update:model-value="updatePaymentMode"
    />
    <p v-if="year !== '2026'" role="status">Community tickets are available for DevCon26 only.</p>
    <BoneyardPageSkeleton
      v-else-if="pool.isPending.value && !pool.data.value"
      name="annual-conference-community-purchases"
      label="community purchases"
      layout="table"
      :show-header="false"
    />
    <div v-else-if="pool.isError.value" role="alert">
      <p>Unable to load community purchases.</p>
      <button type="button" class="editorial-action" @click="pool.refetch()">Try again</button>
    </div>
    <template v-else-if="pool.data.value">
      <p v-if="!pool.data.value.purchases.length" role="status">No paid community purchases yet.</p>
      <table v-else class="community-table">
        <caption class="sr-only">Community purchases and assignment progress</caption>
        <thead><tr><th scope="col">Supporter</th><th scope="col">Purchase</th><th scope="col">Assignment progress</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
        <tbody>
          <tr v-for="item in pool.data.value.purchases" :key="item.order_id" @click="openPurchase(item)">
            <td data-label="Supporter"><strong>{{ item.supporter_name }}</strong><span class="supporter-email">{{ item.supporter_email }}</span></td>
            <td data-label="Purchase"><span>{{ item.total }} community {{ item.total === 1 ? 'ticket' : 'tickets' }}</span><small>{{ item.order_id.slice(0, 8).toUpperCase() }} · {{ item.payment_mode === 'test' ? 'Test' : 'Live' }}</small></td>
            <td data-label="Progress">
              <span>{{ item.assigned }} of {{ item.total - item.cancelled }} assigned</span>
              <progress :value="item.assigned" :max="Math.max(1, item.total - item.cancelled)" :aria-label="`Assignment progress for ${item.supporter_name}`" />
              <small>{{ item.available }} awaiting assignment<span v-if="item.cancelled"> · {{ item.cancelled }} cancelled</span></small>
            </td>
            <td class="purchase-action"><button type="button" class="editorial-action" :aria-label="`View tickets supported by ${item.supporter_name}`" @click.stop="openPurchase(item)">View tickets <span aria-hidden="true">→</span></button></td>
          </tr>
        </tbody>
      </table>
      <div class="community-pagination">
        <button type="button" class="editorial-action" :disabled="offset === 0 || pool.isFetching.value" @click="offset = Math.max(0, offset - 25)">Previous</button>
        <span>Page {{ Math.floor(offset / 25) + 1 }}</span>
        <button type="button" class="editorial-action" :disabled="pool.data.value.next_offset === null || pool.isFetching.value" @click="offset = pool.data.value.next_offset!">Next</button>
      </div>
    </template>
    <Teleport to="body">
      <dialog ref="dialog" class="community-drawer" aria-labelledby="community-drawer-title" @cancel.prevent="close" @click="(event) => { if (event.target === dialog) close(); }">
        <header class="community-drawer-header">
          <div><p class="editorial-eyebrow">Community purchase</p><h2 id="community-drawer-title">{{ purchase?.supporter_name ?? 'Purchase details' }}</h2></div>
          <button ref="closeButton" type="button" class="editorial-action" :disabled="busy" @click="close">Close</button>
        </header>
        <div class="community-drawer-body">
          <p v-if="pool.isError.value" role="alert">Unable to refresh this purchase. Assignment is paused. <button type="button" class="editorial-action" @click="pool.refetch()">Retry</button></p>
          <template v-if="purchase">
            <p class="supporter-email">{{ purchase.supporter_email }}</p>
            <p class="purchase-meta">Order {{ purchase.order_id.slice(0, 8).toUpperCase() }} · {{ purchase.payment_mode === 'test' ? 'Test payment' : 'Live payment' }}</p>
            <div class="assignment-summary"><strong>{{ purchase.assigned }} of {{ purchase.total - purchase.cancelled }} assigned</strong><span>{{ purchase.available }} awaiting assignment<span v-if="purchase.cancelled"> · {{ purchase.cancelled }} cancelled</span></span></div>
            <p v-if="success" class="assignment-success" role="status">{{ success }}</p>
            <ul class="community-seats" aria-label="Community tickets in this purchase">
              <li v-for="seat in purchase.seats" :key="seat.allocation_id">
                <div><strong>Seat {{ seat.seat_index }}</strong><span>{{ seat.status === 'pending' ? 'Awaiting recipient' : seat.status === 'checked_in' ? 'Checked in' : seat.status === 'issued' ? 'Assigned' : 'Cancelled' }}</span><span v-if="seat.attendee_name">{{ seat.attendee_name }}</span><small v-if="seat.attendee_email">{{ seat.attendee_email }}</small></div>
                <button v-if="seat.status === 'pending'" type="button" class="editorial-action" :disabled="unavailable" :aria-label="`Assign recipient to seat ${seat.seat_index}`" @click="choose(seat)">Assign</button>
              </li>
            </ul>
            <form v-if="selected" class="community-assignment" @submit.prevent="reviewing ? assign() : review()">
              <h3 ref="reviewHeading" tabindex="-1">Assign seat {{ selected.seat_index }}</h3>
              <template v-if="!reviewing">
                <label>Recipient name<input ref="nameInput" v-model="recipient.name" class="app-form-control" required maxlength="120" autocomplete="off" :disabled="unavailable" /></label>
                <label>Recipient email<input v-model="recipient.email" class="app-form-control" type="email" required maxlength="254" autocomplete="off" :disabled="unavailable" /></label>
                <div class="assignment-actions"><button type="button" class="editorial-action" :disabled="busy" @click="resetAssignment(); closeButton?.focus()">Cancel</button><button type="submit" class="editorial-action primary" :disabled="unavailable">Review assignment</button></div>
              </template>
              <template v-else>
                <p>Assign this ticket to <strong>{{ recipient.name.trim() }}</strong> at <strong class="recipient-address">{{ recipient.email.trim() }}</strong>?</p>
                <p>An admission email will be queued. You cannot reassign this ticket from this screen.</p>
                <div class="assignment-actions"><button type="button" class="editorial-action" :disabled="busy" @click="editRecipient">Edit recipient</button><button type="submit" class="editorial-action primary" :disabled="unavailable">{{ busy ? 'Assigning…' : 'Assign and queue email' }}</button></div>
              </template>
              <p v-if="error" role="alert">{{ error }}</p>
            </form>
          </template>
          <p v-else role="status">This purchase is no longer on the current page. Close the drawer and refresh the list.</p>
        </div>
      </dialog>
    </Teleport>
  </section>
</template>

<style scoped>
.community-mode {
  width: min(100%, 240px);
}

.community-pool {
  display: grid;
  gap: 1.25rem;
}

.community-heading, .community-pagination, .community-drawer-header, .assignment-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.community-heading {
  align-items: start;
}

.community-heading p, .purchase-meta, small {
  color: var(--dc-gray, #666);
}

.community-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
}

.community-table th {
  padding: .75rem;
  font-size: .75rem;
  text-transform: uppercase;
}

.community-table td {
  padding: 1rem .75rem;
  border-top: 1px solid #ddd9cf;
  vertical-align: middle;
}

.community-table td > span, .community-table small, .community-seats span, .community-seats small {
  display: block;
}

.community-table tbody tr {
  cursor: pointer;
}

.supporter-email, .recipient-address, .community-seats small {
  overflow-wrap: anywhere;
}

.community-table progress {
  display: block;
  width: min(100%, 180px);
  height: 8px;
  margin: .5rem 0;
  accent-color: var(--dc-pink, #d83280);
}

.community-pagination {
  justify-content: flex-end;
}

.community-drawer {
  position: fixed;
  inset: 0 0 0 auto;
  margin: 0;
  width: min(100%, 620px);
  max-width: 100%;
  height: 100dvh;
  max-height: 100dvh;
  overflow: hidden;
  overscroll-behavior: none;
  padding: 0;
  border: 0;
  border-left: 1px solid #ddd9cf;
  color: var(--dc-ink, #111);
  background: var(--dc-paper, #f5f2e8);
}

.community-drawer[open] {
  display: flex;
  flex-direction: column;
}

.community-drawer::backdrop {
  background: rgb(17 17 17 / 25%);
}

.community-drawer-header {
  padding: 1.25rem;
  border-bottom: 1px solid #ddd9cf;
}

.community-drawer-header > div {
  min-width: 0;
}

.community-drawer-header h2 {
  font-size: 1.5rem;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.community-drawer-body {
  flex: 1;
  overflow-y: auto;
  overscroll-behavior: contain;
  min-height: 0;
  padding: 1.25rem 1.25rem max(1.25rem, env(safe-area-inset-bottom));
}

.assignment-summary {
  display: grid;
  gap: .25rem;
  margin: 1.25rem 0;
  padding: 1rem;
  background: white;
  border: 1px solid #ddd9cf;
  border-radius: 8px;
}

.community-seats {
  list-style: none;
  padding: 0;
}

.community-seats li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 1rem 0;
  border-top: 1px solid #ddd9cf;
}

.community-seats li > div {
  min-width: 0;
}

.community-assignment {
  display: grid;
  gap: 1rem;
  padding: 1rem;
  border: 1px solid #ddd9cf;
  border-radius: 8px;
  background: white;
  margin-top: 1rem;
}

.community-assignment h3 {
  font-size: 1.125rem;
  font-weight: 700;
}

.community-assignment label {
  display: grid;
  gap: .4rem;
}

.community-assignment input {
  min-height: 44px;
  font-size: 16px;
  width: 100%;
}

.assignment-actions {
  flex-wrap: wrap;
}

.editorial-action {
  min-height: 44px;
  width: auto;
  flex-shrink: 0;
}

.community-drawer-header {
  flex-shrink: 0;
}

.community-drawer-header > div {
  flex: 1;
}

.primary {
  background: var(--dc-pink, #d83280);
  color: white;
}

.assignment-success {
  padding: .75rem;
  border-left: 3px solid #227744;
}

@media (hover: hover) and (pointer: fine) {
  .community-table tbody tr:hover {
    background: rgb(255 255 255 / 60%);
  }

}

@media (prefers-reduced-motion: no-preference) {
  .editorial-action {
    transition: transform 120ms cubic-bezier(.4, 0, .2, 1);
  }

  .editorial-action:not(:disabled):active {
    transform: scale(.97);
  }

}

@media (max-width: 680px) {
  .community-heading {
    flex-wrap: wrap;
  }

  .community-table thead {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }

  .community-table, .community-table tbody, .community-table tr, .community-table td {
    display: block;
  }

  .community-table tr {
    padding: 1rem;
    border: 1px solid #ddd9cf;
    border-radius: 8px;
    background: white;
    margin-bottom: .75rem;
  }

  .community-table td {
    border: 0;
    padding: .35rem 0;
  }

  .community-table td::before {
    content: attr(data-label);
    display: block;
    color: var(--dc-gray, #666);
    font-size: .75rem;
  }

  .community-table .purchase-action {
    padding-top: .75rem;
  }

  .community-pagination {
    justify-content: space-between;
  }

  .community-drawer {
    border: 0;
  }

}
</style>
