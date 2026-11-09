<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import AppDropdown from '@/src/components/AppDropdown.vue';
import AppPagination from '@/src/components/AppPagination.vue';
import ConfirmDialog from '@/src/components/ui/ConfirmDialog.vue';
import BoneyardPageSkeleton from '@/src/components/ui/BoneyardPageSkeleton.vue';
import { fetchAnnualConferenceSponsorAllocations, fetchJson } from '@/src/lib/api';
import { notify } from '@/src/lib/notify';

const props = defineProps<{ year: string; active: boolean }>();
const base = '/api/annual-conference/2026/ticketing/complimentary';
const queryClient = useQueryClient();
const guests = ref([{ name: '', email: '' }]);
const reason = ref('');
const selectedSupporters = ref<Supporter[]>([]);
const supporterPage = ref(0);
const allocation = ref('new');
const preview = ref<{ subject: string; html: string } | null>(null);
const drawerOpen = ref(false);
const drawerMode = ref<'compose' | 'review' | 'detail' | 'test'>('compose');
const selectedTicket = ref<Ticket | null>(null);
const drawer = ref<HTMLElement | null>(null);
const closeButton = ref<HTMLButtonElement | null>(null);
const reopenButton = ref<HTMLButtonElement | null>(null);
const heading = ref<HTMLElement | null>(null);
let previousFocus: HTMLElement | null = null;
let previousBodyOverflow = '';
let previousDocumentOverflow = '';
let appWasInert = false;
const pending = ref(false);
const page = ref(0);
const pendingCancellation = ref<Ticket | null>(null);
const attempted = ref(false);
const requestKey = ref(crypto.randomUUID());
const message = ref('');
const pageMessage = ref('');
const cancellationError = ref('');
const testRecipient = ref('');
const testKey = ref(crypto.randomUUID());
const testMessage = ref('');
const testing = ref(false);
const recentTests = ref<{ id: string; recipient: string; time: string }[]>([]);

type Supporter = { order_id: string; name: string; email: string; seats: number; existing_admission: boolean; issued_complimentary: boolean; total_count: number };
const supporters = useQuery({ queryKey: computed(() => ['complimentary-supporters', props.year, supporterPage.value]),
  queryFn: () => fetchJson<{ supporters: Supporter[]; has_more: boolean }>(`${base}/supporters?offset=${supporterPage.value * 25}`),
  enabled: computed(() => drawerOpen.value && drawerMode.value === 'compose') });
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
  if (!active) {
    pendingCancellation.value = null;
    drawerOpen.value = false;
  }
}, { flush: 'sync' });

function closeDrawer() {
  if (!pending.value && !testing.value) drawerOpen.value = false;
}

function handleDrawerKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    const dropdown = drawer.value?.querySelector<HTMLButtonElement>('button[aria-haspopup="listbox"][aria-expanded="true"]');

    if (dropdown) {
      dropdown.click();
      dropdown.focus();
    } else {
      event.preventDefault();
      closeDrawer();
    }

    return;
  }
  if (event.key !== 'Tab' || !drawer.value) return;
  const focusable = Array.from(drawer.value.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input:not(:disabled), textarea:not(:disabled), iframe, [tabindex]:not([tabindex="-1"])'))
    .filter(element => element.getClientRects().length > 0);
  const first = focusable[0];
  const last = focusable.at(-1);

  if (first && !drawer.value.contains(document.activeElement)) {
    event.preventDefault();
    first.focus();
  } else if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}

function unlockPage() {
  document.body.style.overflow = previousBodyOverflow;
  document.documentElement.style.overflow = previousDocumentOverflow;
  if (!appWasInert) document.querySelector<HTMLElement>('#app')?.removeAttribute('inert');
  document.removeEventListener('keydown', handleDrawerKeydown);
}

watch(drawerOpen, async (open, wasOpen) => {
  if (open && !wasOpen) {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    previousBodyOverflow = document.body.style.overflow;
    previousDocumentOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    const app = document.querySelector<HTMLElement>('#app');

    appWasInert = app?.hasAttribute('inert') ?? false;
    if (!appWasInert) app?.setAttribute('inert', '');
    document.addEventListener('keydown', handleDrawerKeydown);
    await nextTick();
    if (drawerOpen.value) closeButton.value?.focus();
  } else if (!open && wasOpen) {
    unlockPage();
    await nextTick();
    if (drawerOpen.value || !props.active || pendingCancellation.value) return;
    if (previousFocus?.isConnected && !previousFocus.matches(':disabled') && !previousFocus.closest('[inert]')) previousFocus.focus();
    else if (reopenButton.value) reopenButton.value.focus();
    else heading.value?.focus();
    previousFocus = null;
  }
}, { flush: 'sync' });

onUnmounted(() => {
  if (drawerOpen.value) unlockPage();
});

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
    drawerMode.value = 'review';
    drawerOpen.value = props.active;
  } catch (error) {
    message.value = error instanceof Error ? error.message : 'Unable to preview the email.';
  } finally {
    pending.value = false;
    await nextTick();
    if (drawerOpen.value && drawerMode.value === 'review') closeButton.value?.focus();
  }
}

async function editGuests() {
  preview.value = null;
  drawerMode.value = 'compose';
  message.value = '';
  await nextTick();
  closeButton.value?.focus();
}

async function sendTest() {
  testing.value = true;
  testMessage.value = '';
  let acceptedRecipient = '';

  try {
    const result = await fetchJson<{ accepted: boolean; recipient: string }>(`${base}/send-test`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guest: drawerMode.value === 'test' ? { name: 'DevCon Guest', email: testRecipient.value } : { name: recipients.value[0].name, email: recipients.value[0].email }, recipient: testRecipient.value, request_id: testKey.value }) });

    if (!result.accepted || !result.recipient) throw new Error('Test acceptance could not be confirmed. Check the inbox before retrying.');
    acceptedRecipient = result.recipient;
    recentTests.value = [{ id: testKey.value, recipient: result.recipient, time: new Date().toLocaleString() }, ...recentTests.value].slice(0, 10);
    testKey.value = crypto.randomUUID();
  } catch (error) {
    testMessage.value = error instanceof Error ? error.message : 'Unable to send test email.';
  } finally {
    testing.value = false;
  }

  if (acceptedRecipient) {
    closeDrawer();
    notify.success(`Test email accepted for ${acceptedRecipient}.`);
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
    drawerOpen.value = false;
    attempted.value = false;
    requestKey.value = crypto.randomUUID();
    pageMessage.value = 'Tickets issued and emails queued. Delivery status appears below.';
    await Promise.all([tickets.refetch(), queryClient.invalidateQueries({ queryKey: ['complimentary-supporters', props.year] }), queryClient.invalidateQueries({ queryKey: ['annual-conference-ticketing', props.year] }), sponsors.refetch()]);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unable to issue tickets.';

    if (errorMessage.startsWith('Check guest names') || errorMessage.startsWith('Seats are unavailable') || errorMessage.startsWith('A selected supporter')) {
      attempted.value = false;
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
  cancellationError.value = '';
  pageMessage.value = '';
  try {
    await fetchJson(`${base}/${ticket.ticket_id}/cancel`, { method: 'POST' });
    pendingCancellation.value = null;
    pageMessage.value = 'Ticket cancelled and seat released.';
    await nextTick();
    if (props.active && !drawerOpen.value && !pendingCancellation.value) reopenButton.value?.focus();
    await Promise.all([tickets.refetch(), sponsors.refetch(), queryClient.invalidateQueries({ queryKey: ['complimentary-supporters', props.year] }), queryClient.invalidateQueries({ queryKey: ['annual-conference-ticketing', props.year] })]);
  } catch (error) {
    cancellationError.value = error instanceof Error ? error.message : 'Unable to cancel ticket.';
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <section class="space-y-5" aria-labelledby="complimentary-title">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 id="complimentary-title" ref="heading" tabindex="-1" class="text-xl font-semibold">Complimentary tickets <span class="text-dc-gray">({{ activeCount }})</span></h2>
        <p class="mt-1 text-sm text-dc-gray">Named guests receive a private ticket and attendee badge link.</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <button type="button" class="motion-press min-h-11 rounded-md border border-dc-border bg-dc-paper px-3 text-sm font-semibold hover:bg-dc-cream" @click="testMessage = ''; drawerMode = 'test'; drawerOpen = true">Send test email</button>
        <button ref="reopenButton" type="button" class="motion-press inline-flex min-h-11 items-center gap-2 rounded-md border border-dc-border bg-dc-paper px-3 text-sm font-semibold text-dc-ink hover:bg-dc-cream" @click="drawerMode = preview ? 'review' : 'compose'; if (!preview) message = ''; drawerOpen = true">
          <svg v-if="!preview" viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8a2 2 0 0 0 0 4v4h18v-4a2 2 0 0 1 0-4V4H3zM8 4v12M15 7v6M12 10h6" /></svg>
          {{ preview ? 'Continue review' : 'Add tickets' }}
        </button>
      </div>
    </div>
    <p v-if="pageMessage && !drawerOpen" class="text-sm font-medium" role="status">{{ pageMessage }}</p>
    <p v-if="message && !drawerOpen" class="text-sm font-medium" role="status">{{ message }}</p>
    <section v-if="recentTests.length" aria-labelledby="recent-tests-title" class="space-y-2">
      <h3 id="recent-tests-title" class="font-semibold">Recent test emails</h3>
      <p class="text-sm text-dc-gray">This session only, up to 10 tests. Provider acceptance does not confirm inbox delivery. Tests do not issue tickets or reserve seats.</p>
      <div class="overflow-hidden rounded-lg border border-dc-border bg-dc-paper">
        <table class="w-full table-fixed text-left text-sm" aria-label="Recent test emails">
          <thead>
            <tr class="border-b border-dc-border text-dc-gray">
              <th scope="col" class="px-4 py-3 font-semibold">Recipient</th>
              <th scope="col" class="px-4 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="test in recentTests" :key="test.id" class="border-b border-dc-border last:border-0">
              <td class="break-all px-4 py-3">{{ test.recipient }}</td>
              <td class="px-4 py-3">
                Accepted by provider
                <span class="block text-dc-gray">{{ test.time }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
    <div class="rounded-lg border border-dc-border bg-dc-paper">
      <BoneyardPageSkeleton v-if="tickets.isLoading.value" name="annual-conference-complimentary-tickets" label="complimentary tickets" layout="list" :show-header="false" />
      <p v-else-if="tickets.isError.value" class="p-5">Unable to load tickets. <button class="underline" @click="tickets.refetch()">Try again</button></p>
      <table v-else class="w-full table-fixed text-left text-sm" aria-label="Issued complimentary tickets">
        <thead><tr class="border-b border-dc-border text-dc-gray"><th scope="col" class="px-4 py-3 font-semibold">Guest</th><th scope="col" class="hidden px-4 py-3 font-semibold sm:table-cell">Email</th><th scope="col" class="w-28 px-4 py-3 font-semibold sm:w-40">Status</th></tr></thead>
        <tbody>
          <tr v-if="!tickets.data.value?.tickets.length"><td colspan="3" class="px-4 py-6 text-dc-gray">No complimentary tickets issued yet.</td></tr>
          <tr v-for="ticket in tickets.data.value?.tickets ?? []" :key="ticket.ticket_id" class="cursor-pointer border-b border-dc-border last:border-0" @click="selectedTicket = ticket; drawerMode = 'detail'; drawerOpen = true">
            <td class="px-4 py-2"><button type="button" class="min-h-11 max-w-full text-left font-semibold underline" @click="selectedTicket = ticket; drawerMode = 'detail'; drawerOpen = true">{{ ticket.name }}</button></td>
            <td class="hidden break-all px-4 py-2 sm:table-cell">{{ ticket.email }}</td>
            <td class="break-words px-4 py-2">{{ ticket.status.replace('_', ' ') }}</td>
          </tr>
        </tbody>
      </table>
      <div v-if="totalCount > 25" class="px-4"><AppPagination v-model:page="currentPage" :page-count="Math.ceil(totalCount / 25)" :total="totalCount" :range-start="page * 25 + 1" :range-end="Math.min((page + 1) * 25, totalCount)" :disabled="tickets.isFetching.value" item-label="tickets" aria-label="Complimentary ticket pagination" /></div>
    </div>
    <Teleport to="body">
      <Transition name="complimentary-drawer">
        <div v-if="drawerOpen" class="fixed inset-0 z-[140] flex justify-end bg-black/30" role="presentation" @click.self="closeDrawer">
          <section ref="drawer" class="complimentary-drawer flex h-full w-full max-w-[var(--organizer-detail-drawer-width)] flex-col border-l border-dc-border bg-dc-paper shadow-xl" role="dialog" aria-modal="true" aria-labelledby="complimentary-drawer-title" tabindex="-1">
            <header class="flex shrink-0 items-start justify-between gap-4 border-b border-dc-border bg-dc-paper-warm px-5 py-4 sm:px-6">
              <div><p class="editorial-eyebrow">Complimentary tickets</p><h2 id="complimentary-drawer-title" class="mt-1 text-2xl font-bold">{{ drawerMode === 'compose' ? 'Add complimentary tickets' : drawerMode === 'review' ? 'Review email' : drawerMode === 'test' ? 'Send test email' : 'Ticket details' }}</h2></div>
              <button ref="closeButton" type="button" :disabled="pending || testing" class="motion-press grid min-h-11 min-w-11 place-items-center rounded-md text-2xl font-semibold text-dc-pink hover:bg-dc-pink/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-dc-pink disabled:opacity-50" aria-label="Close complimentary ticket drawer" @click="closeDrawer">×</button>
            </header>
            <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6">
              <template v-if="drawerMode === 'compose'">
                <form class="space-y-5" @submit.prevent="showPreview">
                  <fieldset :disabled="pending || testing || attempted" class="space-y-4">
                    <legend class="font-semibold">Guests</legend>
                    <section aria-labelledby="supporter-selection-title">
                      <h3 id="supporter-selection-title" class="font-semibold">Community supporters</h3>
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
                    </section>
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
                    <template v-if="options.length > 1">
                      <AppDropdown v-model="allocation" label="Seat source" :options="options" teleport />
                      <p class="text-sm text-dc-gray">Existing sponsor seats are already reserved. New seats count against conference capacity.</p>
                    </template>
                    <p v-else class="text-sm text-dc-gray">These tickets count toward conference capacity.</p>
                    <button type="submit" class="motion-press min-h-11 rounded-md bg-dc-pink px-4 font-semibold text-white" :disabled="pending">Preview email</button>
                  </fieldset>
                  <p v-if="message" class="text-sm font-medium" role="status">{{ message }}</p>
                </form>
              </template>
              <template v-else-if="drawerMode === 'test'">
                <p class="text-sm text-dc-gray">Send a sample complimentary ticket email personalized for DevCon Guest. The test PDF and badge link cannot be used for admission or badge access. No ticket is issued or seat reserved.</p>
                <form class="mt-4 space-y-4" @submit.prevent="sendTest">
                  <label class="block">Test email address<input v-model.trim="testRecipient" :disabled="testing || pending" type="email" required maxlength="254" class="editorial-input mt-1 w-full"></label>
                  <button type="submit" :disabled="testing || pending" class="motion-press min-h-11 rounded-md bg-dc-pink px-4 font-semibold text-white disabled:opacity-50">{{ testing ? 'Sending test…' : 'Send test email' }}</button>
                </form>
                <p v-if="testMessage" class="mt-2 text-sm" role="status">{{ testMessage }}</p>
              </template>
              <template v-else-if="drawerMode === 'review' && preview">
                <p class="mt-2 text-sm font-semibold">{{ allocation === 'new' ? `Will reserve ${recipients.length} new ${recipients.length === 1 ? 'seat' : 'seats'}` : 'Will use already reserved sponsor seats; no additional seats reserved' }}</p>
                <p class="mt-2 text-sm text-dc-gray">{{ preview.subject }} · Preview for {{ recipients[0].name }}. Each guest receives their own ticket PDF and badge link.</p>
                <iframe :srcdoc="preview.html" sandbox="" title="Complimentary ticket email preview" class="mt-4 h-96 w-full border border-dc-border bg-white" />
                <form class="mt-4 flex flex-wrap items-end gap-3" @submit.prevent="sendTest">
                  <label class="min-w-0 flex-1">Test email address<input v-model.trim="testRecipient" :disabled="testing || pending" type="email" required maxlength="254" class="editorial-input mt-1 w-full"></label>
                  <button type="submit" :disabled="testing || pending" class="min-h-11 rounded-md border border-dc-border px-4 font-semibold disabled:opacity-50">{{ testing ? 'Sending test…' : 'Send test email' }}</button>
                </form>
                <p class="mt-2 text-sm text-dc-gray">The test PDF and badge link cannot be used for admission or badge access. No seat is reserved.</p>
                <p v-if="testMessage" class="mt-2 text-sm" role="status">{{ testMessage }}</p>
                <p v-if="message" class="mt-4 text-sm font-medium" role="status">{{ message }}</p>
                <div class="mt-4 flex flex-wrap gap-3">
                  <button type="button" :disabled="pending || testing" class="motion-press min-h-11 rounded-md bg-dc-pink px-4 font-semibold text-white disabled:opacity-50" @click="issue">{{ pending ? 'Issuing…' : attempted ? 'Retry issue and send' : `Issue and send ${recipients.length} ${recipients.length === 1 ? 'ticket' : 'tickets'}` }}</button>
                  <button v-if="!attempted" type="button" :disabled="pending || testing" class="min-h-11 px-3 underline disabled:opacity-50" @click="editGuests">Edit guests</button>
                </div>
              </template>
              <div v-else-if="drawerMode === 'detail' && selectedTicket" class="space-y-4">
                <div><p class="text-sm text-dc-gray">Guest</p><p class="font-semibold">{{ selectedTicket.name }}</p><p class="break-all">{{ selectedTicket.email }}</p></div>
                <div><p class="text-sm text-dc-gray">Ticket status</p><p>{{ selectedTicket.status.replace('_', ' ') }}</p></div>
                <div><p class="text-sm text-dc-gray">Email status</p><p>{{ selectedTicket.delivery_status ?? 'Unavailable' }}</p></div>
                <div><p class="text-sm text-dc-gray">Seat source</p><p>{{ selectedTicket.allocation_name }}</p></div>
                <div v-if="selectedTicket.supporter_order_id"><p class="text-sm text-dc-gray">Recipient</p><p>Community supporter</p></div>
                <div><p class="text-sm text-dc-gray">Internal reason</p><p class="whitespace-pre-wrap break-words">{{ selectedTicket.reason }}</p></div>
                <RouterLink v-if="selectedTicket.delivery_status === 'failed' && selectedTicket.status === 'issued'" :to="{ query: { section: 'delivery' } }" class="inline-block min-h-11 underline" @click="drawerOpen = false">Review failed delivery</RouterLink>
                <div v-if="selectedTicket.status === 'issued'"><button type="button" :disabled="pending" class="min-h-11 underline" @click="cancellationError = ''; pendingCancellation = selectedTicket; drawerOpen = false">Cancel ticket</button></div>
              </div>
            </div>
          </section>
        </div>
      </Transition>
    </Teleport>
    <ConfirmDialog :open="Boolean(pendingCancellation)" title="Cancel complimentary ticket?" :message="`The ticket and badge for ${pendingCancellation?.name ?? ''} will stop working and the seat will be released.`" confirm-label="Cancel ticket" :busy="pending" danger mobile-sheet above-drawer @cancel="pendingCancellation = null; reopenButton?.focus()" @confirm="pendingCancellation && cancel(pendingCancellation)">
      <p v-if="cancellationError" class="text-sm font-medium" role="alert">{{ cancellationError }}</p>
    </ConfirmDialog>
  </section>
</template>

<style scoped>
.complimentary-drawer-enter-active,
.complimentary-drawer-leave-active {
  transition: opacity 180ms cubic-bezier(0.4, 0, 0.2, 1);
}

.complimentary-drawer-enter-active .complimentary-drawer,
.complimentary-drawer-leave-active .complimentary-drawer {
  transition: transform 260ms cubic-bezier(0.16, 1, 0.3, 1);
}

.complimentary-drawer-enter-from,
.complimentary-drawer-leave-to {
  opacity: 0;
}

.complimentary-drawer-enter-from .complimentary-drawer,
.complimentary-drawer-leave-to .complimentary-drawer {
  transform: translate3d(100%, 0, 0);
}

@media (prefers-reduced-motion: reduce) {
  .complimentary-drawer-enter-active,
  .complimentary-drawer-leave-active,
  .complimentary-drawer-enter-active .complimentary-drawer,
  .complimentary-drawer-leave-active .complimentary-drawer {
    transition: none;
  }
}
</style>
