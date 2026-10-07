<script setup lang="ts">
import { computed, nextTick, onUnmounted, reactive, ref, watch } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { useRoute } from 'vue-router';
import AnnualConferenceNav from '@/src/components/AnnualConferenceNav.vue';
import AnnualConferenceRouteSkeleton from '@/src/components/ui/page-skeletons/AnnualConferenceRouteSkeleton.vue';
import { formatTicketMoney, parseGhsAmountToMinor, tierSavings, validateAnnualConferenceCapacity, validateAnnualConferenceTicketPrices } from '@/lib/annual-conference-ticketing';
import {
  createAnnualConferenceSponsorAllocation,
  fetchAnnualConferenceTicketEmailDeliveries,
  fetchAnnualConferenceSponsorAllocations,
  fetchAnnualConferenceTicketing,
  queryKeys,
  retryAnnualConferenceTicketEmailDelivery,
  type AnnualConferenceTicketEmailDelivery,
  type AnnualConferenceTicketEmailDeliveryStatus,
  updateAnnualConferenceTicketingCapacity,
  updateAnnualConferenceTicketPrices,
  type AnnualConferenceSponsorAllocation,
} from '@/src/lib/api';
import { notify } from '@/src/lib/notify';

type SponsorFormField = 'sponsor_name' | 'contact_name' | 'contact_email' | 'quantity';

const sponsorInputIds: Record<SponsorFormField, string> = {
  sponsor_name: 'sponsor-allocation-name',
  contact_name: 'sponsor-allocation-contact',
  contact_email: 'sponsor-allocation-email',
  quantity: 'sponsor-allocation-quantity',
};

const route = useRoute();
const queryClient = useQueryClient();
const year = computed(() => String(route.params.year));
const capacity = ref<number | null>(null);
const capacityError = ref('');
const pricingOpen = ref(false);
const pricingError = ref('');
const pricingDrawerPanel = ref<HTMLElement | null>(null);
const pricingDrawerCloseButton = ref<HTMLButtonElement | null>(null);
const sponsorStatus = ref('');
const sponsorFormErrors = reactive<Partial<Record<SponsorFormField, string>>>({});
const sponsorForm = reactive({ sponsor_name: '', contact_name: '', contact_email: '', quantity: 1 });
const pricingForm = reactive({ regular: '', team_3: '', team_5: '' });
const emailDeliveryPage = ref(1);
const emailDeliveryStatus = ref<AnnualConferenceTicketEmailDeliveryStatus | 'all'>('all');
const emailDeliveryFilters: Array<{ value: AnnualConferenceTicketEmailDeliveryStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'failed', label: 'Needs review' },
  { value: 'queued', label: 'Queued' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'delivered', label: 'Delivered' },
];
let pricingDrawerTrigger: HTMLElement | null = null;
let pricingDrawerAppWasInert = false;
let previousBodyOverflow = '';
let previousDocumentOverflow = '';

const ticketingQuery = useQuery({
  queryKey: computed(() => queryKeys.annualConferenceTicketing(year.value)),
  queryFn: () => fetchAnnualConferenceTicketing(year.value),
});

const ticketing = computed(() => ticketingQuery.data.value);
const sponsorQuery = useQuery({
  queryKey: computed(() => ['annual-conference-sponsor-allocations', year.value]),
  queryFn: () => fetchAnnualConferenceSponsorAllocations(year.value),
});
const emailDeliveryQuery = useQuery({
  queryKey: computed(() => [
    'annual-conference-ticket-email-deliveries',
    year.value,
    emailDeliveryPage.value,
    emailDeliveryStatus.value,
  ]),
  queryFn: () => fetchAnnualConferenceTicketEmailDeliveries(year.value, {
    page: emailDeliveryPage.value,
    pageSize: 8,
    status: emailDeliveryStatus.value === 'all' ? undefined : emailDeliveryStatus.value,
  }),
});
const regularTier = computed(() => ticketing.value?.settings.ticket_tiers.find((tier) => tier.key === 'regular'));
const pricingIsEditable = computed(() => ticketing.value?.settings.ticket_sales_status === 'draft');
const pricingValidation = computed(() => {
  const prices = {
    regular: parseGhsAmountToMinor(pricingForm.regular),
    team_3: parseGhsAmountToMinor(pricingForm.team_3),
    team_5: parseGhsAmountToMinor(pricingForm.team_5),
  };

  if (Object.values(prices).some((price) => price === null)) {
    return 'Use a whole GHS amount or up to two decimal places for every pass.';
  }

  return validateAnnualConferenceTicketPrices(prices as { regular: number; team_3: number; team_5: number });
});
const capacityValidation = computed(() => {
  if (!ticketing.value || capacity.value === null) return null;

  if (capacity.value > 5000) return 'Capacity cannot be higher than 5,000.';

  return validateAnnualConferenceCapacity(capacity.value, ticketing.value.inventory);
});
const capacityHasChanged = computed(() => (
  capacity.value !== null && capacity.value !== ticketing.value?.settings.public_capacity
));
const capacityCanSave = computed(() => capacityHasChanged.value && !capacityValidation.value && capacity.value !== null && capacity.value <= 5000);
const reservationBreakdown = computed(() => {
  if (!ticketing.value) return [];

  return [
    ['Paid', ticketing.value.inventory.paid_seats],
    ['Sponsor-held', ticketing.value.inventory.sponsor_seats_held],
    ['Active checkout holds', ticketing.value.inventory.checkout_seats_held],
  ];
});
const emailDeliverySummary = computed(() => {
  const summary = emailDeliveryQuery.data.value?.summary;

  return {
    queued: (summary?.queued ?? 0) + (summary?.sending ?? 0),
    accepted: summary?.accepted ?? 0,
    delivered: summary?.delivered ?? 0,
    failed: summary?.failed ?? 0,
  };
});
const emailDeliveryPageCount = computed(() => Math.max(1, Math.ceil((emailDeliveryQuery.data.value?.total ?? 0) / 8)));

watch([emailDeliveryStatus, year], () => {
  emailDeliveryPage.value = 1;
});

async function refreshEmailDeliveriesAfterRetry() {
  const refreshed = await emailDeliveryQuery.refetch();
  const finalPage = Math.max(1, Math.ceil((refreshed.data?.total ?? 0) / 8));

  if (emailDeliveryPage.value <= finalPage) return;

  emailDeliveryPage.value = finalPage;
  await nextTick();
  await emailDeliveryQuery.refetch();
}

const capacityMutation = useMutation({
  mutationFn: () => {
    if (!ticketing.value || capacity.value === null) {
      throw new Error('Enter a new capacity before saving.');
    }

    const validationError = validateAnnualConferenceCapacity(capacity.value, ticketing.value.inventory);

    if (validationError) throw new Error(validationError);

    return updateAnnualConferenceTicketingCapacity(year.value, capacity.value);
  },
  onSuccess: async () => {
    capacityError.value = '';
    capacity.value = null;
    await queryClient.invalidateQueries({ queryKey: queryKeys.annualConferenceTicketing(year.value) });
    notify.success('Ticket capacity updated.');
  },
  onError: (error) => {
    capacityError.value = error instanceof Error ? error.message : 'Unable to update capacity.';
  },
});

const pricingMutation = useMutation({
  mutationFn: () => {
    if (pricingValidation.value) throw new Error(pricingValidation.value);

    return updateAnnualConferenceTicketPrices(year.value, { ...pricingForm });
  },
  onSuccess: async () => {
    pricingError.value = '';
    await closePricingEditor(true);
    await queryClient.invalidateQueries({ queryKey: queryKeys.annualConferenceTicketing(year.value) });
    notify.success('Ticket prices updated.');
  },
  onError: (error) => {
    pricingError.value = error instanceof Error ? error.message : 'Unable to update ticket prices.';
  },
});

const sponsorMutation = useMutation({
  mutationFn: () => createAnnualConferenceSponsorAllocation(year.value, sponsorForm),
  onSuccess: async () => {
    sponsorForm.sponsor_name = '';
    sponsorForm.contact_name = '';
    sponsorForm.contact_email = '';
    sponsorForm.quantity = 1;
    sponsorStatus.value = 'Sponsor allocation reserved.';
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['annual-conference-sponsor-allocations', year.value] }),
      queryClient.invalidateQueries({ queryKey: queryKeys.annualConferenceTicketing(year.value) }),
    ]);
    notify.success('Sponsor allocation reserved.');
  },
  onError: (error) => {
    sponsorStatus.value = error instanceof Error ? error.message : 'Unable to reserve sponsor tickets.';
  },
});

const retryEmailDeliveryMutation = useMutation({
  mutationFn: (deliveryId: string) => retryAnnualConferenceTicketEmailDelivery(year.value, deliveryId),
  onSuccess: async () => {
    await refreshEmailDeliveriesAfterRetry();
    notify.success('Email retry queued.');
  },
  onError: (error) => {
    notify.error(error instanceof Error ? error.message : 'Unable to queue the email retry.');
  },
});

function saveCapacity() {
  capacityError.value = capacityValidation.value ?? '';

  if (capacityError.value || !capacityHasChanged.value) return;

  capacityMutation.mutate();
}

function lockPricingDrawerPage() {
  previousBodyOverflow = document.body.style.overflow;
  previousDocumentOverflow = document.documentElement.style.overflow;
  document.body.style.overflow = 'hidden';
  document.documentElement.style.overflow = 'hidden';

  const app = document.querySelector<HTMLElement>('#app');

  pricingDrawerAppWasInert = app?.hasAttribute('inert') ?? false;
  if (!pricingDrawerAppWasInert) app?.setAttribute('inert', '');
}

function unlockPricingDrawerPage() {
  document.body.style.overflow = previousBodyOverflow;
  document.documentElement.style.overflow = previousDocumentOverflow;

  const app = document.querySelector<HTMLElement>('#app');

  if (!pricingDrawerAppWasInert) app?.removeAttribute('inert');
}

async function openPricingEditor(event: MouseEvent) {
  if (!ticketing.value) return;

  for (const tier of ticketing.value.settings.ticket_tiers) {
    pricingForm[tier.key] = (tier.price_minor / 100).toFixed(2);
  }

  pricingError.value = '';
  pricingDrawerTrigger = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
  pricingOpen.value = true;
  lockPricingDrawerPage();
  await nextTick();
  pricingDrawerCloseButton.value?.focus();
}

async function closePricingEditor(force = false) {
  if (!pricingOpen.value || (pricingMutation.isPending.value && !force)) return;

  pricingOpen.value = false;
  unlockPricingDrawerPage();
  await nextTick();
  pricingDrawerTrigger?.focus();
  pricingDrawerTrigger = null;
}

function requestClosePricingEditor() {
  void closePricingEditor();
}

function handlePricingDrawerKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault();
    void closePricingEditor();

    return;
  }

  if (event.key !== 'Tab' || !pricingDrawerPanel.value) return;

  const focusable = Array.from(pricingDrawerPanel.value.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )).filter((element) => !element.hasAttribute('hidden'));

  if (focusable.length === 0) {
    event.preventDefault();
    pricingDrawerPanel.value.focus();

    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function savePrices() {
  pricingError.value = pricingValidation.value ?? '';

  if (pricingError.value) return;

  pricingMutation.mutate();
}

function clearSponsorFormError(field: SponsorFormField) {
  delete sponsorFormErrors[field];
  sponsorStatus.value = '';
}

function validateSponsorForm(): boolean {
  Object.keys(sponsorFormErrors).forEach((field) => {
    delete sponsorFormErrors[field as SponsorFormField];
  });

  if (!sponsorForm.sponsor_name.trim()) sponsorFormErrors.sponsor_name = 'Enter the sponsor name.';
  if (!sponsorForm.contact_name.trim()) sponsorFormErrors.contact_name = 'Enter the contact name.';
  if (!sponsorForm.contact_email.trim()) {
    sponsorFormErrors.contact_email = 'Enter the contact email.';
  } else if (!/^\S+@\S+\.\S+$/.test(sponsorForm.contact_email)) {
    sponsorFormErrors.contact_email = 'Enter a valid email address.';
  }
  if (!Number.isInteger(sponsorForm.quantity) || sponsorForm.quantity < 1 || sponsorForm.quantity > 500) {
    sponsorFormErrors.quantity = 'Enter between 1 and 500 tickets.';
  }

  return Object.keys(sponsorFormErrors).length === 0;
}

function focusFirstSponsorFormError() {
  const field = ['sponsor_name', 'contact_name', 'contact_email', 'quantity'].find((name) => sponsorFormErrors[name as SponsorFormField]);

  if (!field) return;

  void nextTick(() => document.getElementById(sponsorInputIds[field as SponsorFormField])?.focus());
}

function saveSponsorAllocation() {
  sponsorStatus.value = '';

  if (!validateSponsorForm()) {
    sponsorStatus.value = 'Check the highlighted sponsor allocation fields.';
    focusFirstSponsorFormError();

    return;
  }

  sponsorMutation.mutate();
}

function canRetryEmailDelivery(delivery: AnnualConferenceTicketEmailDelivery) {
  return delivery.status === 'failed'
    && delivery.attempt_count < 5
    && !delivery.provider_email_id
    && !delivery.accepted_at;
}

function deliveryStatusLabel(delivery: AnnualConferenceTicketEmailDelivery) {
  if (delivery.status === 'accepted') return 'Accepted by provider';
  if (delivery.status === 'sending') return 'Sending';

  return delivery.status;
}

function setEmailDeliveryStatus(status: AnnualConferenceTicketEmailDeliveryStatus | 'all') {
  emailDeliveryStatus.value = status;
}

function sponsorContactLabel(allocation: AnnualConferenceSponsorAllocation) {
  return `${allocation.contact_name}, ${allocation.contact_email}`;
}

onUnmounted(() => {
  if (pricingOpen.value) unlockPricingDrawerPage();
});
</script>

<template>
  <div class="editorial-page">
    <div class="editorial-wrap">
      <AnnualConferenceNav :show-page-heading="false" />

      <AnnualConferenceRouteSkeleton v-if="ticketingQuery.isLoading.value" variant="overview" />

      <section v-else-if="ticketingQuery.isError.value" class="editorial-panel border-dc-pink p-6">
        <h2 class="text-xl font-semibold text-dc-ink">Ticketing is temporarily unavailable.</h2>
        <p class="mt-2 text-sm text-dc-gray">Check that the ticketing migration has been applied, then try again.</p>
        <button type="button" class="motion-press mt-4 rounded-md border-2 border-dc-ink bg-dc-yellow px-4 py-2 font-mono text-xs font-semibold uppercase" @click="ticketingQuery.refetch()">Try again</button>
      </section>

      <section v-else-if="ticketing" class="space-y-6">
        <header class="border-b-2 border-dc-ink pb-5">
          <p class="editorial-eyebrow">DevCon{{ year.slice(-2) }} · paid tickets</p>
          <h1 class="mt-2 text-3xl font-semibold tracking-tight text-dc-ink">Ticketing</h1>
          <p class="mt-2 max-w-2xl text-sm leading-6 text-dc-gray">Manage seat inventory and sponsor reservations while public checkout remains deliberately inactive.</p>
        </header>

        <section aria-labelledby="inventory-ledger-title">
          <div class="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p class="editorial-eyebrow">Inventory ledger</p>
              <h2 id="inventory-ledger-title" class="mt-1 text-xl font-semibold text-dc-ink">Every reserved seat accounted for</h2>
            </div>
            <p class="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-dc-gray">Live capacity accounting</p>
          </div>

          <div class="mt-3 grid gap-3 md:grid-cols-3">
            <article v-for="item in [
              ['Capacity', ticketing.inventory.public_capacity, 'Total seats available to this edition'],
              ['Reserved', ticketing.inventory.reduction_floor, 'Paid, sponsor-held, and active checkout holds'],
              ['Available', ticketing.inventory.remaining_public_seats, 'Seats not yet committed'],
            ]" :key="item[0]" class="rounded-lg border-2 border-dc-ink bg-dc-paper p-4">
              <p class="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-dc-gray">{{ item[0] }}</p>
              <strong class="mt-2 block font-mono text-3xl tracking-tight text-dc-ink">{{ item[1] }}</strong>
              <p class="mt-2 text-xs leading-5 text-dc-gray">{{ item[2] }}</p>
            </article>
          </div>

          <dl class="mt-3 grid divide-y rounded-lg border border-dc-border bg-dc-paper text-sm sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <div v-for="item in reservationBreakdown" :key="item[0]" class="flex items-center justify-between gap-3 px-4 py-3">
              <dt class="text-dc-gray">{{ item[0] }}</dt>
              <dd class="font-mono font-semibold text-dc-ink">{{ item[1] }}</dd>
            </div>
          </dl>
        </section>

        <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <section class="rounded-lg border-2 border-dc-ink bg-dc-paper p-5" aria-labelledby="capacity-title">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p class="editorial-eyebrow">Capacity</p>
                <h2 id="capacity-title" class="mt-1 text-xl font-semibold text-dc-ink">Venue-safe public inventory</h2>
              </div>
              <span class="rounded-full border border-dc-ink px-3 py-1 font-mono text-[10px] font-semibold uppercase">{{ ticketing.settings.ticket_sales_status }}</span>
            </div>
            <p class="mt-3 text-sm leading-6 text-dc-gray">Current capacity: <strong class="text-dc-ink">{{ ticketing.settings.public_capacity }}</strong>. It cannot fall below the <strong class="text-dc-ink">{{ ticketing.inventory.reduction_floor }}</strong> seats already paid, sponsor-held, or in an active checkout hold.</p>
            <form class="mt-5 flex flex-wrap items-end gap-3" @submit.prevent="saveCapacity">
              <label for="ticketing-new-capacity" class="min-w-48 flex-1">
                <span class="editorial-label">New capacity</span>
                <input id="ticketing-new-capacity" v-model.number="capacity" :min="Math.max(1, ticketing.inventory.reduction_floor)" max="5000" class="editorial-input mt-2" type="number" inputmode="numeric" :aria-describedby="capacityError || capacityValidation ? 'ticketing-capacity-error' : 'ticketing-capacity-help'" @input="capacityError = ''">
              </label>
              <button type="submit" class="motion-press min-h-11 rounded-md border-2 border-dc-ink bg-dc-yellow px-4 font-mono text-xs font-semibold uppercase disabled:cursor-not-allowed disabled:opacity-50" :disabled="capacityMutation.isPending.value || !capacityCanSave">{{ capacityMutation.isPending.value ? 'Saving…' : 'Save capacity' }}</button>
            </form>
            <p id="ticketing-capacity-help" class="mt-2 text-xs leading-5 text-dc-gray">Enter a changed whole number. The floor is enforced again when you save.</p>
            <p v-if="capacityError || capacityValidation" id="ticketing-capacity-error" class="mt-2 text-sm font-medium text-dc-pink" role="alert">{{ capacityError || capacityValidation }}</p>
          </section>

          <aside class="rounded-lg border-2 border-dc-ink bg-dc-paper p-5" aria-labelledby="activation-title">
            <p class="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-dc-pink">Activation status</p>
            <h2 id="activation-title" class="mt-2 text-xl font-semibold text-dc-ink">Checkout disabled</h2>
            <dl class="mt-4 space-y-3 text-sm">
              <div class="flex items-center justify-between gap-3 border-b border-dc-border pb-3"><dt class="text-dc-gray">Ticketing data</dt><dd class="font-semibold text-dc-ink">Ready</dd></div>
              <div class="flex items-center justify-between gap-3 border-b border-dc-border pb-3"><dt class="text-dc-gray">Checkout</dt><dd class="font-semibold text-dc-pink">Disabled</dd></div>
              <div class="flex items-center justify-between gap-3"><dt class="text-dc-gray">Merchant setup</dt><dd class="font-semibold text-dc-ink">Next step</dd></div>
            </dl>
            <p class="mt-4 text-sm leading-6 text-dc-gray">Next: confirm the merchant account and payment-provider configuration. No attendee can be charged from this workspace.</p>
          </aside>
        </div>

        <section class="border-y-2 border-dc-ink py-5" aria-labelledby="passes-title">
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p class="editorial-eyebrow">Public passes</p>
              <h2 id="passes-title" class="mt-1 text-xl font-semibold text-dc-ink">Pricing</h2>
              <p class="mt-2 max-w-2xl text-sm leading-6 text-dc-gray">Prices are editable while sales are in draft. They lock when sales leave draft or the first checkout hold exists.</p>
            </div>
            <div class="flex items-center gap-3">
              <span class="rounded-full border border-dc-ink px-3 py-1 font-mono text-[10px] font-semibold uppercase">{{ ticketing.settings.ticket_sales_status }}</span>
              <button v-if="pricingIsEditable" type="button" class="motion-press min-h-10 rounded-md border-2 border-dc-ink bg-dc-yellow px-4 font-mono text-xs font-semibold uppercase" @click="openPricingEditor">Edit prices</button>
            </div>
          </div>

          <dl class="mt-5 divide-y divide-dc-border border-y border-dc-border">
            <div v-for="tier in ticketing.settings.ticket_tiers" :key="tier.key" class="grid gap-1 py-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:gap-6">
              <div>
                <dt class="font-semibold text-dc-ink">{{ tier.label }}</dt>
                <dd class="mt-1 text-sm text-dc-gray">{{ tier.quantity }} {{ tier.quantity === 1 ? 'seat' : 'seats' }}<span v-if="regularTier && tier.key !== 'regular' && tierSavings(tier, regularTier) > 0"> · saves {{ formatTicketMoney(tierSavings(tier, regularTier)) }} against regular passes</span></dd>
              </div>
              <dd class="font-mono text-2xl font-semibold tracking-tight text-dc-ink">{{ formatTicketMoney(tier.price_minor) }}</dd>
              <dd class="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-dc-gray">GHS · fixed quantity</dd>
            </div>
          </dl>

          <p v-if="!pricingIsEditable" class="mt-5 text-sm text-dc-gray">Prices are locked because ticket sales have started. Existing order amounts remain unchanged.</p>
        </section>

        <section class="rounded-lg border border-dc-border bg-dc-paper" aria-labelledby="email-delivery-title">
          <header class="flex flex-wrap items-start justify-between gap-4 border-b border-dc-border px-5 py-4">
            <div>
              <p class="editorial-eyebrow">Ticket email delivery</p>
              <h2 id="email-delivery-title" class="mt-1 text-xl font-semibold text-dc-ink">Delivery health</h2>
              <p class="mt-1 text-sm leading-6 text-dc-gray">All ticket-email activity for this conference. Provider acceptance is not proof of inbox delivery.</p>
            </div>
            <button type="button" class="motion-press rounded-md border border-dc-border px-3 py-2 font-mono text-[10px] font-semibold uppercase text-dc-gray hover:border-dc-ink hover:text-dc-ink" :disabled="emailDeliveryQuery.isFetching.value" @click="emailDeliveryQuery.refetch()">Refresh</button>
          </header>

          <div class="grid divide-y divide-dc-border sm:grid-cols-4 sm:divide-x sm:divide-y-0">
            <dl v-for="item in [
              ['Queued', emailDeliverySummary.queued],
              ['Accepted', emailDeliverySummary.accepted],
              ['Delivered', emailDeliverySummary.delivered],
              ['Needs review', emailDeliverySummary.failed],
            ]" :key="item[0]" class="px-5 py-3">
              <dt class="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-dc-gray">{{ item[0] }}</dt>
              <dd class="mt-1 font-mono text-xl font-semibold text-dc-ink">{{ item[1] }}</dd>
            </dl>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-3 border-t border-dc-border px-5 py-3">
            <div class="flex flex-wrap items-center gap-2" aria-label="Filter ticket email deliveries">
              <button
                v-for="filter in emailDeliveryFilters"
                :key="filter.value"
                type="button"
                class="motion-press rounded-full border px-3 py-1.5 font-mono text-[10px] font-semibold uppercase"
                :class="emailDeliveryStatus === filter.value ? 'border-dc-ink bg-dc-ink text-dc-paper' : 'border-dc-border text-dc-gray hover:border-dc-ink hover:text-dc-ink'"
                :aria-pressed="emailDeliveryStatus === filter.value"
                @click="setEmailDeliveryStatus(filter.value)"
              >{{ filter.label }}</button>
            </div>
            <p class="text-xs text-dc-gray">{{ emailDeliveryQuery.data.value?.total ?? 0 }} {{ emailDeliveryStatus === 'all' ? 'records' : `${emailDeliveryStatus} records` }}</p>
          </div>

          <div class="divide-y divide-dc-border">
            <p v-if="emailDeliveryQuery.isLoading.value" class="px-5 py-5 text-sm text-dc-gray">Loading email delivery activity…</p>
            <div v-else-if="emailDeliveryQuery.isError.value" class="flex flex-wrap items-center justify-between gap-3 px-5 py-5">
              <p class="text-sm text-dc-pink" role="alert">Ticket email deliveries could not be loaded.</p>
              <button type="button" class="motion-press rounded-md border border-dc-ink px-3 py-2 font-mono text-[10px] font-semibold uppercase" @click="emailDeliveryQuery.refetch()">Try again</button>
            </div>
            <p v-else-if="!emailDeliveryQuery.data.value?.deliveries.length" class="px-5 py-5 text-sm text-dc-gray">No ticket emails have been queued yet.</p>
            <article v-for="delivery in emailDeliveryQuery.data.value?.deliveries" :key="delivery.id" class="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
              <div class="min-w-0">
                <p class="font-semibold text-dc-ink">{{ delivery.kind === 'ticket_delivery' ? 'Ticket delivery' : 'Payment receipt' }}</p>
                <p class="mt-1 break-all text-sm text-dc-gray">{{ delivery.recipient_email }}</p>
                <p v-if="delivery.last_error" class="mt-1 text-xs leading-5 text-dc-pink">{{ delivery.last_error }}</p>
              </div>
              <div class="flex shrink-0 items-center gap-3">
                <span class="rounded-full border border-dc-border px-2.5 py-1 font-mono text-[10px] font-semibold uppercase text-dc-ink">{{ deliveryStatusLabel(delivery) }}</span>
                <button v-if="canRetryEmailDelivery(delivery)" type="button" class="motion-press rounded-md border border-dc-ink px-3 py-2 font-mono text-[10px] font-semibold uppercase disabled:cursor-not-allowed disabled:opacity-50" :disabled="retryEmailDeliveryMutation.isPending.value" @click="retryEmailDeliveryMutation.mutate(delivery.id)">{{ retryEmailDeliveryMutation.isPending.value ? 'Queuing…' : 'Retry' }}</button>
              </div>
            </article>
          </div>

          <footer v-if="(emailDeliveryQuery.data.value?.total ?? 0) > 0" class="flex items-center justify-between gap-3 border-t border-dc-border px-5 py-3">
            <p class="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-dc-gray">Page {{ emailDeliveryPage }} of {{ emailDeliveryPageCount }}</p>
            <div class="flex gap-2">
              <button type="button" class="motion-press rounded-md border border-dc-border px-3 py-2 font-mono text-[10px] font-semibold uppercase text-dc-gray disabled:cursor-not-allowed disabled:opacity-50" :disabled="emailDeliveryPage <= 1 || emailDeliveryQuery.isFetching.value" @click="emailDeliveryPage -= 1">Previous</button>
              <button type="button" class="motion-press rounded-md border border-dc-border px-3 py-2 font-mono text-[10px] font-semibold uppercase text-dc-gray disabled:cursor-not-allowed disabled:opacity-50" :disabled="emailDeliveryPage >= emailDeliveryPageCount || emailDeliveryQuery.isFetching.value" @click="emailDeliveryPage += 1">Next</button>
            </div>
          </footer>
        </section>

        <section class="rounded-lg border-2 border-dc-ink bg-dc-paper p-5" aria-labelledby="sponsor-title">
          <p class="editorial-eyebrow">Sponsor allocations</p>
          <h2 id="sponsor-title" class="mt-1 text-xl font-semibold text-dc-ink">Reserve private sponsor tickets</h2>
          <p class="mt-2 text-sm leading-6 text-dc-gray">These seats are held in the inventory ledger immediately and are not public pass types.</p>

          <form class="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,1.15fr)_8rem]" novalidate @submit.prevent="saveSponsorAllocation">
            <label for="sponsor-allocation-name">
              <span class="editorial-label">Sponsor</span>
              <input id="sponsor-allocation-name" v-model.trim="sponsorForm.sponsor_name" name="sponsor_name" autocomplete="organization" class="editorial-input mt-2" :class="sponsorFormErrors.sponsor_name ? 'border-dc-pink' : ''" :aria-invalid="Boolean(sponsorFormErrors.sponsor_name)" :aria-describedby="sponsorFormErrors.sponsor_name ? 'sponsor-name-error' : undefined" @input="clearSponsorFormError('sponsor_name')">
              <span v-if="sponsorFormErrors.sponsor_name" id="sponsor-name-error" class="mt-1 block text-xs text-dc-pink" role="alert">{{ sponsorFormErrors.sponsor_name }}</span>
            </label>
            <label for="sponsor-allocation-contact">
              <span class="editorial-label">Contact name</span>
              <input id="sponsor-allocation-contact" v-model.trim="sponsorForm.contact_name" name="contact_name" autocomplete="name" class="editorial-input mt-2" :class="sponsorFormErrors.contact_name ? 'border-dc-pink' : ''" :aria-invalid="Boolean(sponsorFormErrors.contact_name)" :aria-describedby="sponsorFormErrors.contact_name ? 'sponsor-contact-error' : undefined" @input="clearSponsorFormError('contact_name')">
              <span v-if="sponsorFormErrors.contact_name" id="sponsor-contact-error" class="mt-1 block text-xs text-dc-pink" role="alert">{{ sponsorFormErrors.contact_name }}</span>
            </label>
            <label for="sponsor-allocation-email">
              <span class="editorial-label">Contact email</span>
              <input id="sponsor-allocation-email" v-model.trim="sponsorForm.contact_email" name="contact_email" autocomplete="email" spellcheck="false" class="editorial-input mt-2" :class="sponsorFormErrors.contact_email ? 'border-dc-pink' : ''" :aria-invalid="Boolean(sponsorFormErrors.contact_email)" :aria-describedby="sponsorFormErrors.contact_email ? 'sponsor-email-error' : undefined" type="email" @input="clearSponsorFormError('contact_email')">
              <span v-if="sponsorFormErrors.contact_email" id="sponsor-email-error" class="mt-1 block text-xs text-dc-pink" role="alert">{{ sponsorFormErrors.contact_email }}</span>
            </label>
            <label for="sponsor-allocation-quantity">
              <span class="editorial-label">Seats</span>
              <input id="sponsor-allocation-quantity" v-model.number="sponsorForm.quantity" name="quantity" autocomplete="off" min="1" max="500" class="editorial-input mt-2" :class="sponsorFormErrors.quantity ? 'border-dc-pink' : ''" :aria-invalid="Boolean(sponsorFormErrors.quantity)" :aria-describedby="sponsorFormErrors.quantity ? 'sponsor-quantity-error' : undefined" type="number" inputmode="numeric" @input="clearSponsorFormError('quantity')">
              <span v-if="sponsorFormErrors.quantity" id="sponsor-quantity-error" class="mt-1 block text-xs text-dc-pink" role="alert">{{ sponsorFormErrors.quantity }}</span>
            </label>
            <div class="md:col-span-2 xl:col-span-4"><button class="motion-press min-h-11 rounded-md border-2 border-dc-ink bg-dc-yellow px-4 font-mono text-xs font-semibold uppercase disabled:cursor-not-allowed disabled:opacity-50" :disabled="sponsorMutation.isPending.value">{{ sponsorMutation.isPending.value ? 'Reserving…' : 'Reserve sponsor tickets' }}</button></div>
          </form>
          <p v-if="sponsorStatus" class="mt-3 text-sm font-medium" :class="Object.keys(sponsorFormErrors).length ? 'text-dc-pink' : 'text-dc-ink'" aria-live="polite">{{ sponsorStatus }}</p>

          <div class="mt-6 border-y border-dc-border">
            <p v-if="sponsorQuery.isLoading.value" class="py-4 text-sm text-dc-gray">Loading allocations…</p>
            <div v-else-if="sponsorQuery.isError.value" class="flex flex-wrap items-center justify-between gap-3 py-4">
              <p class="text-sm text-dc-pink" role="alert">Sponsor allocations could not be loaded.</p>
              <button type="button" class="motion-press rounded-md border border-dc-ink px-3 py-2 font-mono text-[10px] font-semibold uppercase" @click="sponsorQuery.refetch()">Try again</button>
            </div>
            <p v-else-if="!sponsorQuery.data.value?.allocations.length" class="py-4 text-sm text-dc-gray">No sponsor tickets reserved yet.</p>
            <template v-else>
              <table class="hidden w-full text-left text-sm md:table">
                <thead class="border-b border-dc-border font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-dc-gray">
                  <tr><th class="py-3 pr-4">Sponsor</th><th class="py-3 pr-4 text-right">Seats</th><th class="py-3 pl-4">Contact</th></tr>
                </thead>
                <tbody class="divide-y divide-dc-border">
                  <tr v-for="allocation in sponsorQuery.data.value?.allocations" :key="allocation.id">
                    <th scope="row" class="min-w-0 break-words py-3 pr-4 font-semibold text-dc-ink">{{ allocation.sponsor_name }}</th>
                    <td class="shrink-0 py-3 pr-4 text-right font-mono font-semibold text-dc-ink">{{ allocation.quantity }}</td>
                    <td class="min-w-0 break-words py-3 pl-4"><details><summary class="cursor-pointer text-dc-gray underline decoration-dc-border underline-offset-4">View contact</summary><p class="mt-2 break-all text-dc-gray">{{ sponsorContactLabel(allocation) }}</p></details></td>
                  </tr>
                </tbody>
              </table>
              <div class="divide-y divide-dc-border md:hidden">
                <article v-for="allocation in sponsorQuery.data.value?.allocations" :key="allocation.id" class="py-4">
                  <div class="flex items-start justify-between gap-3">
                    <h3 class="min-w-0 break-words font-semibold text-dc-ink">{{ allocation.sponsor_name }}</h3>
                    <span class="shrink-0 rounded-full border border-dc-border px-2.5 py-1 font-mono text-xs font-semibold text-dc-ink">{{ allocation.quantity }} seats</span>
                  </div>
                  <details class="mt-3"><summary class="cursor-pointer text-sm text-dc-gray underline decoration-dc-border underline-offset-4">View contact</summary><p class="mt-2 break-all text-sm text-dc-gray">{{ sponsorContactLabel(allocation) }}</p></details>
                </article>
              </div>
            </template>
          </div>
        </section>
      </section>
    </div>
  </div>

  <Teleport to="body">
    <Transition name="pricing-drawer">
      <div v-if="pricingOpen && ticketing" class="pricing-drawer-backdrop fixed inset-0 z-[110] flex justify-end" role="presentation" @click.self="requestClosePricingEditor">
        <aside ref="pricingDrawerPanel" class="pricing-drawer flex h-full w-full max-w-xl flex-col border-l border-dc-border bg-dc-paper shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="pricing-drawer-title" aria-describedby="pricing-drawer-description" tabindex="-1" @keydown="handlePricingDrawerKeydown">
          <header class="flex shrink-0 items-start justify-between gap-5 border-b border-dc-border px-5 py-5 sm:px-6">
            <div class="min-w-0">
              <p class="editorial-eyebrow">Public passes</p>
              <h2 id="pricing-drawer-title" class="mt-1 text-2xl font-semibold tracking-tight text-dc-ink">Set draft prices</h2>
              <p id="pricing-drawer-description" class="mt-2 max-w-md text-sm leading-6 text-dc-gray">Enter the price for each pass in GHS. Quantities and currency are fixed.</p>
            </div>
            <button ref="pricingDrawerCloseButton" type="button" class="motion-press inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-dc-border text-dc-gray hover:border-dc-ink hover:text-dc-ink disabled:cursor-not-allowed disabled:opacity-50" aria-label="Close price editor" :disabled="pricingMutation.isPending.value" @click="requestClosePricingEditor">
              <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path stroke-linecap="round" d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </header>

          <form class="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-5 py-5 sm:px-6" novalidate @submit.prevent="savePrices">
            <div class="grid gap-5">
              <label v-for="tier in ticketing.settings.ticket_tiers" :key="tier.key" :for="`ticket-price-${tier.key}`">
                <span class="editorial-label">{{ tier.label }} (GHS)</span>
                <input :id="`ticket-price-${tier.key}`" v-model.trim="pricingForm[tier.key]" :name="`ticket_price_${tier.key}`" class="editorial-input mt-2" inputmode="decimal" autocomplete="off" placeholder="0.00" :aria-invalid="Boolean(pricingError || pricingValidation)" :aria-describedby="pricingError || pricingValidation ? 'ticket-prices-error' : undefined" @input="pricingError = ''">
                <span class="mt-2 block text-xs leading-5 text-dc-gray">{{ tier.quantity }} {{ tier.quantity === 1 ? 'seat' : 'seats' }} · fixed quantity</span>
              </label>
            </div>
            <p v-if="pricingError || pricingValidation" id="ticket-prices-error" class="mt-5 text-sm font-medium text-dc-pink" role="alert">{{ pricingError || pricingValidation }}</p>
            <div class="mt-auto flex flex-wrap justify-end gap-3 border-t border-dc-border pt-5">
              <button type="button" class="motion-press min-h-11 rounded-md border border-dc-border px-4 font-mono text-xs font-semibold uppercase text-dc-gray hover:border-dc-ink hover:text-dc-ink disabled:cursor-not-allowed disabled:opacity-50" :disabled="pricingMutation.isPending.value" @click="requestClosePricingEditor">Cancel</button>
              <button type="submit" class="motion-press min-h-11 rounded-md border-2 border-dc-ink bg-dc-yellow px-4 font-mono text-xs font-semibold uppercase disabled:cursor-not-allowed disabled:opacity-50" :disabled="pricingMutation.isPending.value || Boolean(pricingValidation)">{{ pricingMutation.isPending.value ? 'Saving…' : 'Save prices' }}</button>
            </div>
          </form>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.pricing-drawer-backdrop {
  background: linear-gradient(270deg, rgb(28 28 28 / 14%), rgb(28 28 28 / 8%));
  backdrop-filter: blur(2px);
}

.pricing-drawer-enter-active,
.pricing-drawer-leave-active {
  transition: opacity 180ms cubic-bezier(0.4, 0, 0.2, 1);
}

.pricing-drawer-enter-active .pricing-drawer,
.pricing-drawer-leave-active .pricing-drawer {
  transition: transform 250ms cubic-bezier(0.16, 1, 0.3, 1);
}

.pricing-drawer-enter-from,
.pricing-drawer-leave-to {
  opacity: 0;
}

.pricing-drawer-enter-from .pricing-drawer,
.pricing-drawer-leave-to .pricing-drawer {
  transform: translateX(100%);
}

@media (prefers-reduced-motion: reduce) {
  .pricing-drawer-enter-active,
  .pricing-drawer-leave-active,
  .pricing-drawer-enter-active .pricing-drawer,
  .pricing-drawer-leave-active .pricing-drawer {
    transition-duration: 0.01ms;
    transition-delay: 0ms;
  }

  .pricing-drawer-enter-from .pricing-drawer,
  .pricing-drawer-leave-to .pricing-drawer {
    transform: none;
  }
}
</style>
