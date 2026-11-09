<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import AppDropdown from '@/src/components/AppDropdown.vue';
import AppPagination from '@/src/components/AppPagination.vue';
import ConfirmDialog from '@/src/components/ui/ConfirmDialog.vue';
import BoneyardPageSkeleton from '@/src/components/ui/BoneyardPageSkeleton.vue';
import { fetchAnnualConferenceSponsorAllocations, fetchJson } from '@/src/lib/api';

const props = defineProps<{ year: string; active: boolean }>();
const base = '/api/annual-conference/2026/ticketing/complimentary';
const queryClient = useQueryClient();
const guests = ref([{ name: '', email: '' }]);
const reason = ref('');
const selectedSupporters = ref<Supporter[]>([]);
const supporterPage = ref(0);
const supportersOpen = ref(false);
const allocation = ref('new');
const preview = ref<{ subject: string; html: string } | null>(null);
const pending = ref(false);
const page = ref(0);
const pendingCancellation = ref<Ticket | null>(null);
const attempted = ref(false);
const requestKey = ref(crypto.randomUUID());
const message = ref('');
const testRecipient = ref('');
const testKey = ref(crypto.randomUUID());
const testMessage = ref('');
const testing = ref(false);

type Supporter = { order_id: string; name: string; email: string; seats: number; existing_admission: boolean; issued_complimentary: boolean; total_count: number };
const supporters = useQuery({ queryKey: computed(() => ['complimentary-supporters', props.year, supporterPage.value]),
  queryFn: () => fetchJson<{ supporters: Supporter[]; has_more: boolean }>(`${base}/supporters?offset=${supporterPage.value * 25}`),
  enabled: computed(() => supportersOpen.value) });
const recipients = computed(() => [
  ...selectedSupporters.value.map(supporter => ({ name: supporter.name, email: supporter.email, supporter_order_id: supporter.order_id })),
  ...guests.value.filter(guest => guest.name.trim() || guest.email.trim()),
]);
const supporterCurrentPage = computed({ get: () => supporterPage.value + 1, set: value => { supporterPage.value = value - 1; } });

type Ticket = { ticket_id: string; name: string; email: string; status: string; reason: string; allocation_name: string; delivery_status: string | null; delivery_id: string | null; active_total: number; total_count: number; supporter_order_id: string | null };
const tickets = useQuery({ queryKey: computed(() => ['complimentary-tickets', props.year, page.value]),
  queryFn: () => fetchJson<{ tickets: Ticket[]; has_more: boolean }>(`${base}?offset=${page.value * 25}`) });
const sponsors = useQuery({ queryKey: ['annual-conference-sponsor-allocations', props.year],
  queryFn: () => fetchAnnualConferenceSponsorAllocations(props.year) });
const options = computed(() => [{ value: 'new', label: 'Reserve new seats' },
  ...(sponsors.data.value?.allocations ?? []).filter(item => item.quantity > 0)
    .map(item => ({ value: item.id, label: `${item.sponsor_name} (${item.quantity} held)` }))]);
const activeCount = computed(() => tickets.data.value?.tickets[0]?.active_total ?? 0);
const totalCount = computed(() => tickets.data.value?.tickets[0]?.total_count ?? 0);
const currentPage = computed({ get: () => page.value + 1, set: value => { page.value = value - 1; } });

watch([() => supporters.isSuccess.value, () => supporters.data.value, supporterPage], ([success, data, current]) => {
  if (success && data && current > 0 && data.supporters.length === 0) supporterPage.value = 0;
});

watch(() => props.active, (active) => {
  if (!active) pendingCancellation.value = null;
}, { flush: 'sync' });

async function showPreview() {
  message.value = '';
  if (!reason.value.trim() || !recipients.value.length || recipients.value.length > 100 || guests.value.some(guest => Boolean(guest.name.trim()) !== Boolean(guest.email.trim()))) {
    message.value = 'Enter each guest’s name and email and an internal reason.';

    return;
  }
  pending.value = true;
  try {
    testKey.value = crypto.randomUUID();
    testMessage.value = '';
    preview.value = await fetchJson(`${base}/preview`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ allocation_id: allocation.value === 'new' ? null : allocation.value, reason: reason.value, guests: recipients.value, idempotency_key: requestKey.value }) });
  } catch (error) {
    message.value = error instanceof Error ? error.message : 'Unable to preview the email.';
  } finally {
    pending.value = false;
  }
}

async function sendTest() {
  testing.value = true;
  testMessage.value = '';
  try {
    await fetchJson(`${base}/send-test`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guest: { name: recipients.value[0].name, email: recipients.value[0].email }, recipient: testRecipient.value, request_id: testKey.value }) });
    testMessage.value = `Test email accepted for ${testRecipient.value}.`;
    testKey.value = crypto.randomUUID();
  } catch (error) {
    testMessage.value = error instanceof Error ? error.message : 'Unable to send test email.';
  } finally {
    testing.value = false;
  }
}

async function issue() {
  pending.value = true;
  attempted.value = true;
  message.value = '';
  try {
    await fetchJson(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      allocation_id: allocation.value === 'new' ? null : allocation.value,
      reason: reason.value, guests: recipients.value, idempotency_key: requestKey.value,
    }) });
    guests.value = [{ name: '', email: '' }];
    selectedSupporters.value = [];
    reason.value = '';
    allocation.value = 'new';
    preview.value = null;
    attempted.value = false;
    requestKey.value = crypto.randomUUID();
    message.value = 'Tickets issued and emails queued. Delivery status appears below.';
    await Promise.all([tickets.refetch(), queryClient.invalidateQueries({ queryKey: ['complimentary-supporters', props.year] }), queryClient.invalidateQueries({ queryKey: ['annual-conference-ticketing', props.year] }), sponsors.refetch()]);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unable to issue tickets.';

    if (errorMessage.startsWith('Check guest names') || errorMessage.startsWith('Seats are unavailable') || errorMessage.startsWith('A selected supporter')) {
      attempted.value = false;
      preview.value = null;
      message.value = errorMessage;
      if (errorMessage.startsWith('A selected supporter')) {
        await queryClient.invalidateQueries({ queryKey: ['complimentary-supporters', props.year] });
      }
    } else {
      message.value = `${errorMessage} Retry this same request to avoid issuing duplicates.`;
    }
  } finally {
    pending.value = false;
  }
}

async function cancel(ticket: Ticket) {
  pending.value = true;
  message.value = '';
  try {
    await fetchJson(`${base}/${ticket.ticket_id}/cancel`, { method: 'POST' });
    pendingCancellation.value = null;
    message.value = 'Ticket cancelled and seat released.';
    await Promise.all([tickets.refetch(), sponsors.refetch(), queryClient.invalidateQueries({ queryKey: ['complimentary-supporters', props.year] }), queryClient.invalidateQueries({ queryKey: ['annual-conference-ticketing', props.year] })]);
  } catch (error) {
    message.value = error instanceof Error ? error.message : 'Unable to cancel ticket.';
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <section class="space-y-6" aria-labelledby="complimentary-title">
    <div class="rounded-lg border border-dc-border bg-dc-paper p-5">
      <h2 id="complimentary-title" class="text-xl font-semibold">Complimentary tickets</h2>
      <p class="mt-2 text-sm text-dc-gray">Thank guests with a confirmed place. Each person receives a private QR ticket and a link to create their attendee badge.</p>
      <form class="mt-5 space-y-5" @submit.prevent="showPreview">
        <fieldset :disabled="pending || testing || attempted || Boolean(preview)" class="space-y-4">
          <legend class="font-semibold">Guests</legend>
          <details :open="supportersOpen" @toggle="supportersOpen = ($event.target as HTMLDetailsElement).open">
            <summary class="min-h-11 cursor-pointer py-2 font-semibold">Select community supporters</summary>
            <p class="text-sm text-dc-gray">Choose paid live supporters to thank with their own additional admission. Community pool seats are unchanged.</p>
            <p v-if="supporters.isLoading.value" class="mt-3 text-sm">Loading supporters…</p>
            <p v-else-if="supporters.isError.value" class="mt-3 text-sm">Unable to load supporters. <button type="button" class="min-h-11 underline" @click="supporters.refetch()">Try again</button></p>
            <p v-else-if="!supporters.data.value?.supporters.length" class="mt-3 text-sm">No paid live community supporters found.</p>
            <div v-else class="mt-3 divide-y divide-dc-border border-y border-dc-border">
              <label v-for="supporter in supporters.data.value.supporters" :key="supporter.order_id" class="flex min-h-11 items-start gap-3 py-3">
                <input type="checkbox" :checked="selectedSupporters.some(item => item.email === supporter.email)" @change="selectedSupporters = ($event.target as HTMLInputElement).checked ? [...selectedSupporters, supporter] : selectedSupporters.filter(item => item.email !== supporter.email)" :disabled="supporter.existing_admission && !selectedSupporters.some(item => item.email === supporter.email)" class="mt-1">
                <span class="min-w-0"><span class="block font-semibold">{{ supporter.name }}</span><span class="block text-sm text-dc-gray"><span class="break-all">{{ supporter.email }}</span> · {{ supporter.seats }} community seats · {{ supporter.issued_complimentary ? 'Complimentary ticket issued' : supporter.existing_admission ? 'Existing admission' : 'Eligible' }}</span></span>
              </label>
            </div>
            <AppPagination v-if="(supporters.data.value?.supporters[0]?.total_count ?? 0) > 25" v-model:page="supporterCurrentPage" :page-count="Math.ceil((supporters.data.value?.supporters[0]?.total_count ?? 0) / 25)" :total="supporters.data.value?.supporters[0]?.total_count ?? 0" :range-start="supporterPage * 25 + 1" :range-end="Math.min((supporterPage + 1) * 25, supporters.data.value?.supporters[0]?.total_count ?? 0)" item-label="supporters" />
          </details>
          <div v-if="selectedSupporters.length" class="space-y-2 text-sm">
            <p class="font-semibold">Selected supporters ({{ selectedSupporters.length }})</p>
            <p v-for="supporter in selectedSupporters" :key="supporter.order_id">{{ supporter.name }} · <span class="break-all">{{ supporter.email }}</span> <button type="button" class="min-h-11 underline" @click="selectedSupporters = selectedSupporters.filter(item => item.email !== supporter.email)">Remove</button></p>
          </div>
          <div v-for="(guest, index) in guests" :key="index" class="grid gap-3 border-b border-dc-border pb-4 md:grid-cols-[1fr_1fr_auto]">
            <label>Name <input v-model.trim="guest.name" maxlength="120" class="editorial-input mt-1" autocomplete="name"></label>
            <label>Email <input v-model.trim="guest.email" maxlength="254" type="email" class="editorial-input mt-1" autocomplete="email"></label>
            <button v-if="guests.length > 1" type="button" class="min-h-11 self-end text-sm underline" :aria-label="`Remove guest ${index + 1}`" @click="guests.splice(index, 1)">Remove</button>
          </div>
          <button v-if="recipients.length < 100" type="button" class="min-h-11 text-sm font-semibold underline" @click="guests.push({ name: '', email: '' })">Add another guest</button>
          <label class="block">Internal reason <textarea v-model.trim="reason" required maxlength="1000" rows="2" class="editorial-input mt-1 w-full" /><span class="mt-1 block text-sm text-dc-gray">Only organizers can see this; it is not included in the email.</span></label>
          <AppDropdown v-model="allocation" label="Seat source" :options="options" />
          <p class="text-sm text-dc-gray">Existing sponsor seats are already reserved. New seats count against conference capacity.</p>
          <button type="submit" class="motion-press min-h-11 rounded-md bg-dc-pink px-4 font-semibold text-white" :disabled="pending">Preview email</button>
        </fieldset>
      </form>
      <p v-if="message" class="mt-4 text-sm font-medium" role="status">{{ message }}</p>
    </div>
    <section v-if="preview" class="rounded-lg border border-dc-border bg-dc-paper p-5" aria-labelledby="complimentary-preview-title">
      <h3 id="complimentary-preview-title" class="text-lg font-semibold">Review email</h3>
      <p class="mt-2 text-sm font-semibold">{{ allocation === 'new' ? `Will reserve ${recipients.length} new ${recipients.length === 1 ? 'seat' : 'seats'}` : 'Will use already reserved sponsor seats; no additional seats reserved' }}</p>
      <p class="mt-2 text-sm text-dc-gray">{{ preview.subject }} · Preview for {{ recipients[0].name }}. Each guest receives their own ticket PDF and badge link.</p>
      <iframe :srcdoc="preview.html" sandbox="" title="Complimentary ticket email preview" class="mt-4 h-96 w-full border border-dc-border bg-white" />
      <form class="mt-4 flex flex-wrap items-end gap-3" @submit.prevent="sendTest">
        <label class="min-w-0 flex-1">Test email address<input v-model.trim="testRecipient" type="email" required maxlength="254" class="editorial-input mt-1 w-full"></label>
        <button type="submit" :disabled="testing || pending" class="min-h-11 rounded-md border border-dc-border px-4 font-semibold disabled:opacity-50">{{ testing ? 'Sending test…' : 'Send test email' }}</button>
      </form>
      <p class="mt-2 text-sm text-dc-gray">The test PDF and badge link cannot be used for admission or badge access. No seat is reserved.</p>
      <p v-if="testMessage" class="mt-2 text-sm" role="status">{{ testMessage }}</p>
      <div class="mt-4 flex flex-wrap gap-3">
        <button type="button" :disabled="pending || testing" class="motion-press min-h-11 rounded-md bg-dc-pink px-4 font-semibold text-white disabled:opacity-50" @click="issue">{{ pending ? 'Issuing…' : attempted ? 'Retry issue and send' : `Issue and send ${recipients.length} ${recipients.length === 1 ? 'ticket' : 'tickets'}` }}</button>
        <button v-if="!attempted" type="button" :disabled="pending || testing" class="min-h-11 px-3 underline disabled:opacity-50" @click="preview = null">Edit guests</button>
      </div>
    </section>
    <section class="rounded-lg border border-dc-border bg-dc-paper p-5" aria-labelledby="complimentary-list-title">
      <h3 id="complimentary-list-title" class="text-lg font-semibold">Issued complimentary tickets <span class="text-dc-gray">({{ activeCount }})</span></h3>
      <p class="mt-1 text-sm text-dc-gray">Complimentary guests are separate from paid orders.</p>
      <BoneyardPageSkeleton v-if="tickets.isLoading.value" name="annual-conference-complimentary-tickets" label="complimentary tickets" layout="list" :show-header="false" />
      <p v-else-if="tickets.isError.value" class="mt-4">Unable to load tickets. <button class="underline" @click="tickets.refetch()">Try again</button></p>
      <p v-else-if="!tickets.data.value?.tickets.length" class="mt-4 text-sm text-dc-gray">No complimentary tickets issued yet.</p>
      <ul v-else class="mt-4 divide-y divide-dc-border">
        <li v-for="ticket in tickets.data.value.tickets" :key="ticket.ticket_id" class="flex flex-wrap items-start justify-between gap-3 py-4">
          <div><p class="font-semibold">{{ ticket.name }}</p><p class="break-all text-sm text-dc-gray">{{ ticket.email }}</p><p class="mt-1 text-sm">{{ ticket.status.replace('_', ' ') }} · Email {{ ticket.delivery_status ?? 'unavailable' }}</p><p class="mt-1 text-sm text-dc-gray">{{ ticket.allocation_name }} · {{ ticket.supporter_order_id ? 'Community supporter · ' : '' }}{{ ticket.reason }}</p><RouterLink v-if="ticket.delivery_status === 'failed' && ticket.status === 'issued'" :to="{ query: { section: 'delivery' } }" class="mt-2 inline-block text-sm underline">Review failed delivery</RouterLink></div>
          <button v-if="ticket.status === 'issued'" type="button" :disabled="pending" class="min-h-11 px-2 text-sm underline" @click="pendingCancellation = ticket">Cancel ticket</button>
        </li>
      </ul>
      <AppPagination v-model:page="currentPage" :page-count="Math.ceil(totalCount / 25)" :total="totalCount" :range-start="totalCount ? page * 25 + 1 : 0" :range-end="Math.min((page + 1) * 25, totalCount)" :disabled="tickets.isFetching.value" item-label="tickets" aria-label="Complimentary ticket pagination" />
    </section>
    <ConfirmDialog :open="Boolean(pendingCancellation)" title="Cancel complimentary ticket?" :message="`The ticket and badge for ${pendingCancellation?.name ?? ''} will stop working and the seat will be released.`" confirm-label="Cancel ticket" :busy="pending" danger mobile-sheet @cancel="pendingCancellation = null" @confirm="pendingCancellation && cancel(pendingCancellation)" />
  </section>
</template>
