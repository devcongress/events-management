<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { formatTicketMoney, parseGhsAmountToMinor, type AnnualConferenceTicketTierKey } from '@/lib/annual-conference-ticketing';
import { createDevcon26TestCouponSchema, type Devcon26TestCoupon, type Devcon26TestCouponCreated } from '@/lib/devcon26-test-coupons';
import { createDevcon26TestCoupon, DEVCON26_TEST_CHECKOUT_PAGE_SIZE, fetchDevcon26TestCoupons, toggleDevcon26TestCoupon } from '@/src/lib/api';
import { copyTextToClipboard } from '@/src/lib/clipboard';
import AppDropdown from '@/src/components/AppDropdown.vue';
import AppCopyButton from '@/src/components/ui/AppCopyButton.vue';
import AppDatePicker from '@/src/components/ui/AppDatePicker.vue';

const props = defineProps<{ year: string }>();
const queryClient = useQueryClient();
const page = ref(1);
const checkoutPage = ref(1);
const formElement = ref<HTMLFormElement | null>(null);
const error = ref('');
const feedback = ref('');
const expiryError = ref('');
const createdCoupon = ref<Devcon26TestCouponCreated | null>(null);
const copyStates = reactive<Record<string, 'idle' | 'copying' | 'copied'>>({});
const copyTimers = new Map<string, ReturnType<typeof setTimeout>>();
let copyGeneration = 0;

const form = reactive({
  discount_type: 'fixed_minor' as 'fixed_minor' | 'percentage_bps', discount: '',
  eligible_tiers: ['regular', 'team_3', 'team_5'] as AnnualConferenceTicketTierKey[],
  expires_at: '', max_completed: 1,
});
const discountTypes = [
  { value: 'fixed_minor', label: 'Fixed GHS amount' },
  { value: 'percentage_bps', label: 'Percentage' },
];
const tiers: Array<{ key: AnnualConferenceTicketTierKey; label: string }> = [
  { key: 'regular', label: 'Regular pass' }, { key: 'team_3', label: 'Team of 3' }, { key: 'team_5', label: 'Team of 5' },
];
const query = useQuery({
  queryKey: computed(() => ['devcon26-test-coupons', props.year, page.value, checkoutPage.value, DEVCON26_TEST_CHECKOUT_PAGE_SIZE]),
  queryFn: () => fetchDevcon26TestCoupons(props.year, page.value, checkoutPage.value),
  enabled: computed(() => props.year === '2026'),
});
const pageCount = computed(() => Math.max(1, Math.ceil((query.data.value?.total ?? 0) / 8)));
const checkoutRows = computed(() => query.data.value?.checkouts.slice(0, DEVCON26_TEST_CHECKOUT_PAGE_SIZE) ?? []);
const checkoutPageCount = computed(() => Math.max(1, Math.ceil((query.data.value?.checkout_total ?? 0) / DEVCON26_TEST_CHECKOUT_PAGE_SIZE)));
const checkoutStart = computed(() => (checkoutPage.value - 1) * DEVCON26_TEST_CHECKOUT_PAGE_SIZE + 1);
const checkoutEnd = computed(() => checkoutStart.value + checkoutRows.value.length - 1);

watch(() => query.data.value, (data) => {
  if (data && checkoutPage.value > checkoutPageCount.value) {
    checkoutPage.value = checkoutPageCount.value;
  }
});

async function refresh() {
  await queryClient.invalidateQueries({ queryKey: ['devcon26-test-coupons', props.year] });
}

const createMutation = useMutation({
  mutationFn: createCoupon,
  onSuccess: async ({ coupon }) => {
    createdCoupon.value = coupon;
    form.discount = '';
    page.value = 1;
    feedback.value = 'Test coupon created. Its terms are now fixed.';
    await refresh();
  },
  onError: (failure) => { error.value = failure instanceof Error ? failure.message : 'The test coupon could not be created.'; },
});
const toggleMutation = useMutation({
  mutationFn: (coupon: Devcon26TestCoupon) => toggleDevcon26TestCoupon(props.year, coupon.id, !coupon.enabled),
  onSuccess: async ({ coupon }) => {
    feedback.value = coupon.enabled ? 'Test coupon enabled.' : 'Test coupon disabled. Existing reserved checkouts keep their discount.';
    await refresh();
  },
  onError: (failure) => { error.value = failure instanceof Error ? failure.message : 'The test coupon could not be updated.'; },
});

watch(() => props.year, () => {
  page.value = 1;
  checkoutPage.value = 1;
  error.value = '';
  feedback.value = '';
  expiryError.value = '';
  createdCoupon.value = null;
  resetCopyStates();
});

watch(() => form.expires_at, () => { expiryError.value = ''; });
onBeforeUnmount(resetCopyStates);

function setDiscountType(value: string | number) {
  if (value === 'fixed_minor' || value === 'percentage_bps') {
    form.discount_type = value;
  }
}

function submitCoupon() {
  if (createMutation.isPending.value) return;
  createMutation.mutate();
}

async function createCoupon() {
  error.value = '';
  feedback.value = '';
  expiryError.value = '';
  const expiry = new Date(form.expires_at);
  const input = createDevcon26TestCouponSchema.safeParse({
    discount_type: form.discount_type,
    discount_value: parseGhsAmountToMinor(form.discount),
    eligible_tiers: form.eligible_tiers,
    expires_at: Number.isNaN(expiry.getTime()) ? '' : expiry.toISOString(),
    max_completed: form.max_completed,
  });

  if (!input.success) {
    const issue = input.error.issues[0];
    const field = issue?.path[0] === 'discount_value' ? 'discount' : String(issue?.path[0] ?? 'discount');
    const message = field === 'expires_at' ? 'Choose a future expiry date and time.' : issue?.message ?? 'Check the coupon details.';

    if (field === 'expires_at') expiryError.value = message;

    await nextTick();
    formElement.value?.querySelector<HTMLElement>(`[data-coupon-field="${field}"] button, [name="${field}"]`)?.focus();

    throw new Error(message);
  }

  return createDevcon26TestCoupon(props.year, input.data);
}

function resetCopyStates() {
  copyGeneration++;
  for (const timer of copyTimers.values()) clearTimeout(timer);
  copyTimers.clear();
  for (const code of Object.keys(copyStates)) delete copyStates[code];
}

async function copyCoupon(code: string) {
  if (copyStates[code] && copyStates[code] !== 'idle') return;
  const generation = copyGeneration;

  copyStates[code] = 'copying';
  try {
    await copyTextToClipboard(code);
    if (generation !== copyGeneration) return;

    copyStates[code] = 'copied';
    copyTimers.set(code, setTimeout(() => {
      copyStates[code] = 'idle';
      copyTimers.delete(code);
    }, 1800));
  } catch {
    if (generation !== copyGeneration) return;
    copyStates[code] = 'idle';
    error.value = 'Could not copy the coupon. Select the code and copy it manually.';
  }
}

function couponState(coupon: Devcon26TestCoupon) {
  if (!coupon.enabled) return 'Disabled';
  if (Date.parse(coupon.expires_at) <= Date.now()) return 'Expired';
  if (coupon.remaining === 0) return 'Fully reserved';

  return 'Enabled';
}

function dateLabel(value: string) {
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
</script>

<template>
  <section class="min-w-0 rounded-lg border-2 border-dc-ink bg-dc-paper p-5" aria-labelledby="test-coupons-title">
    <p class="editorial-eyebrow">Test checkout</p>
    <h2 id="test-coupons-title" class="mt-1 text-xl font-semibold text-dc-ink">Test checkout coupons</h2>
    <p class="mt-2 max-w-2xl text-sm leading-6 text-dc-gray">Create discounts for test payments. Coupon uses are reserved for 15 minutes and counted when a payment is verified. These checkouts do not issue admission tickets.</p>

    <details class="mt-5 rounded-md border border-dc-border p-4">
      <summary class="cursor-pointer text-sm font-semibold text-dc-ink">Create a test coupon</summary>
      <p class="mt-3 text-xs leading-5 text-dc-gray">Terms cannot be edited after creation. You can enable or disable the code.</p>
      <p class="mt-1 text-xs leading-5 text-dc-gray">A unique code is generated automatically when you create the coupon.</p>
      <form ref="formElement" class="mt-4" :aria-busy="createMutation.isPending.value" @submit.prevent="submitCoupon">
        <fieldset class="grid min-w-0 items-start gap-x-4 gap-y-5 md:grid-cols-2" :disabled="createMutation.isPending.value">
          <legend class="sr-only">Coupon terms</legend>
          <AppDropdown
            :model-value="form.discount_type"
            :options="discountTypes"
            class="coupon-term-field"
            label="Discount type"
            data-coupon-field="discount_type"
            teleport
            required
            :disabled="createMutation.isPending.value"
            @update:model-value="setDiscountType"
          />
          <label for="test-coupon-discount" class="coupon-term-field">
            <span class="editorial-label">{{ form.discount_type === 'fixed_minor' ? 'Discount (GHS)' : 'Discount (%)' }}</span>
            <span class="block min-w-0">
              <input id="test-coupon-discount" v-model.trim="form.discount" name="discount" required inputmode="decimal" class="editorial-input block" aria-describedby="test-coupon-discount-help">
              <span id="test-coupon-discount-help" class="mt-1 block text-xs text-dc-gray">Up to two decimal places. Every payment must remain above zero.</span>
            </span>
          </label>
          <label for="test-coupon-max" class="coupon-term-field">
            <span class="editorial-label">Maximum completed uses</span>
            <input id="test-coupon-max" v-model.number="form.max_completed" name="max_completed" type="number" min="1" max="1000000" required class="editorial-input block">
          </label>
          <AppDatePicker
            v-model="form.expires_at"
            class="coupon-term-field"
            label="Expiry (local time)"
            data-coupon-field="expires_at"
            mode="datetime"
            density="field"
            required
            :error="expiryError"
            :disabled="createMutation.isPending.value"
          />
          <fieldset class="min-w-0 md:col-span-2">
            <legend class="editorial-label">Eligible passes</legend>
            <div class="mt-2 flex flex-wrap gap-x-4 gap-y-2">
              <label
                v-for="tier in tiers"
                :key="tier.key"
                class="flex min-h-11 items-center gap-2 text-sm text-dc-ink"
                :class="createMutation.isPending.value ? 'cursor-not-allowed opacity-60' : 'motion-press cursor-pointer'"
              >
                <span class="relative flex size-5 shrink-0 items-center justify-center">
                  <input
                    v-model="form.eligible_tiers"
                    name="eligible_tiers"
                    type="checkbox"
                    :value="tier.key"
                    class="coupon-pass-input peer m-0 size-5 cursor-pointer appearance-none rounded-md border-2 border-dc-ink bg-dc-paper checked:border-dc-pink checked:bg-dc-pink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dc-pink focus-visible:ring-offset-2 focus-visible:ring-offset-dc-paper disabled:cursor-not-allowed"
                  >
                  <svg class="coupon-pass-check motion-colors pointer-events-none absolute inset-0 size-5 p-[3px] text-dc-paper opacity-0 peer-checked:opacity-100" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
                    <path d="m3 8 3 3 7-7" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                </span>
                <span>{{ tier.label }}</span>
              </label>
            </div>
          </fieldset>
          <div class="md:col-span-2">
            <button type="submit" class="motion-press min-h-11 rounded-md border-2 border-dc-ink bg-dc-yellow px-4 font-mono text-xs font-semibold uppercase disabled:cursor-not-allowed disabled:opacity-50" :disabled="createMutation.isPending.value">{{ createMutation.isPending.value ? 'Creating…' : 'Create test coupon' }}</button>
          </div>
        </fieldset>
      </form>
    </details>

    <p v-if="error" class="mt-3 text-sm text-dc-pink" role="alert">{{ error }}</p>
    <p v-if="feedback" class="mt-3 text-sm text-dc-ink" role="status">{{ feedback }}</p>
    <div v-if="createdCoupon" class="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-dc-border bg-dc-paper-warm p-4">
      <div class="min-w-0">
        <p class="text-xs font-semibold text-dc-gray">Latest coupon code</p>
        <p class="mt-1 select-text break-all font-mono text-base font-semibold text-dc-ink">{{ createdCoupon.code }}</p>
      </div>
      <AppCopyButton
        :state="copyStates[createdCoupon.code] ?? 'idle'"
        label="Copy new coupon code"
        class="min-h-11 rounded-md border border-dc-border bg-dc-paper px-3 text-sm text-dc-ink"
        @click="copyCoupon(createdCoupon.code)"
      />
    </div>
    <p v-if="query.isLoading.value" class="py-5 text-sm text-dc-gray">Loading test coupons…</p>
    <div v-else-if="query.isError.value" class="flex flex-wrap items-center justify-between gap-3 py-5">
      <p class="text-sm text-dc-pink" role="alert">Test coupons could not be loaded.</p>
      <button type="button" class="motion-press min-h-11 rounded-md border border-dc-ink px-3 text-sm" @click="query.refetch()">Try again</button>
    </div>
    <template v-else>
      <p v-if="!query.data.value?.coupons.length" class="py-5 text-sm text-dc-gray">Create a coupon to test a discounted checkout.</p>
      <div class="mt-4 divide-y divide-dc-border">
        <article v-for="coupon in query.data.value?.coupons" :key="coupon.id" class="py-4">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <h3 class="select-text break-all font-mono text-base font-semibold text-dc-ink">{{ coupon.code }}</h3>
                <AppCopyButton
                  icon-only
                  :state="copyStates[coupon.code] ?? 'idle'"
                  :label="`Copy ${coupon.code}`"
                  class="size-11 shrink-0 rounded-md border border-dc-border bg-dc-paper text-dc-gray"
                  @click="copyCoupon(coupon.code)"
                />
              </div>
              <p class="mt-1 text-sm text-dc-gray">{{ coupon.discount_type === 'fixed_minor' ? formatTicketMoney(coupon.discount_value) : `${coupon.discount_value / 100}%` }} off · {{ couponState(coupon) }}</p>
            </div>
            <button type="button" class="motion-press min-h-11 rounded-md border border-dc-ink px-3 text-sm disabled:opacity-50" :disabled="toggleMutation.isPending.value" :aria-label="`${coupon.enabled ? 'Disable' : 'Enable'} ${coupon.code}`" @click="toggleMutation.mutate(coupon)">{{ coupon.enabled ? 'Disable' : 'Enable' }}</button>
          </div>
          <p class="mt-2 text-xs leading-5 text-dc-gray">{{ coupon.eligible_tiers.map((key) => tiers.find((tier) => tier.key === key)?.label).join(', ') }} · Expires {{ dateLabel(coupon.expires_at) }}</p>
          <dl class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div><dt class="text-xs text-dc-gray">Completed / maximum</dt><dd class="mt-1 font-mono text-sm text-dc-ink">{{ coupon.completed }} / {{ coupon.max_completed }}</dd></div>
            <div><dt class="text-xs text-dc-gray">Active holds</dt><dd class="mt-1 font-mono text-sm text-dc-ink">{{ coupon.active_holds }}</dd></div>
            <div><dt class="text-xs text-dc-gray">Remaining uses</dt><dd class="mt-1 font-mono text-sm text-dc-ink">{{ coupon.remaining }}</dd></div>
            <div><dt class="text-xs text-dc-gray">Needs attention</dt><dd class="mt-1 font-mono text-sm text-dc-ink">{{ coupon.exceptions }}</dd></div>
          </dl>
        </article>
      </div>
      <div v-if="pageCount > 1" class="flex flex-wrap items-center justify-between gap-3 border-t border-dc-border py-3">
        <p class="text-xs text-dc-gray">Coupon page {{ page }} of {{ pageCount }}</p>
        <div class="flex gap-2">
          <button type="button" class="motion-press min-h-11 rounded-md border border-dc-border px-3 text-sm disabled:opacity-50" :disabled="page <= 1 || query.isFetching.value" @click="page--">Previous</button>
          <button type="button" class="motion-press min-h-11 rounded-md border border-dc-border px-3 text-sm disabled:opacity-50" :disabled="page >= pageCount || query.isFetching.value" @click="page++">Next</button>
        </div>
      </div>

      <h3 id="test-checkout-activity-title" class="mt-6 text-base font-semibold text-dc-ink">Test checkout activity</h3>
      <p class="mt-1 text-xs text-dc-gray">Private purchaser details and payment references. A verified test payment is not an admission ticket.</p>
      <p v-if="!checkoutRows.length" class="py-4 text-sm text-dc-gray">No test checkouts have started yet.</p>
      <div v-else class="mt-3 overflow-x-auto" role="region" aria-labelledby="test-checkout-activity-title" tabindex="0">
        <table class="w-full min-w-[760px] text-left text-sm">
          <caption class="sr-only">Test checkout activity, up to five checkouts per page</caption>
          <thead class="border-b border-dc-border text-xs text-dc-gray">
            <tr>
              <th scope="col" class="py-3 pr-4 font-medium">Checkout</th>
              <th scope="col" class="px-4 py-3 font-medium">Pass / coupon</th>
              <th scope="col" class="px-4 py-3 text-right font-medium">Amount</th>
              <th scope="col" class="px-4 py-3 font-medium">Status</th>
              <th scope="col" class="py-3 pl-4 font-medium">Details</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-dc-border">
            <tr v-for="checkout in checkoutRows" :key="checkout.id" class="align-top">
              <td class="py-4 pr-4">
                <p class="whitespace-nowrap text-dc-ink">{{ dateLabel(checkout.created_at) }}</p>
                <p class="mt-1 max-w-48 truncate font-mono text-xs text-dc-gray" :title="checkout.payment_reference">{{ checkout.payment_reference }}</p>
              </td>
              <td class="px-4 py-4">
                <p class="whitespace-nowrap font-medium text-dc-ink">{{ tiers.find((tier) => tier.key === checkout.tier_key)?.label }}</p>
                <p class="mt-1 text-xs text-dc-gray">{{ checkout.quantity }} {{ checkout.quantity === 1 ? 'seat' : 'seats' }}</p>
                <p class="mt-1 max-w-48 break-all text-xs text-dc-gray">{{ checkout.coupon_code ?? 'No coupon' }}</p>
              </td>
              <td class="px-4 py-4 text-right tabular-nums">
                <p class="whitespace-nowrap font-semibold text-dc-ink">{{ formatTicketMoney(checkout.amount_minor) }}</p>
                <p class="mt-1 whitespace-nowrap text-xs text-dc-gray"><span class="sr-only">Base amount minus discount: </span>{{ formatTicketMoney(checkout.base_amount_minor) }} − {{ formatTicketMoney(checkout.discount_amount_minor) }}</p>
              </td>
              <td class="px-4 py-4">
                <span class="inline-block whitespace-nowrap rounded-md border border-dc-border px-2 py-1 text-xs font-semibold capitalize" :class="checkout.status === 'refund_required' ? 'text-dc-pink' : 'text-dc-ink'">{{ checkout.status === 'refund_required' ? 'Needs attention' : checkout.status === 'rejected' ? 'Failed' : checkout.status }}</span>
                <p v-if="checkout.resolution_reason" class="mt-1 max-w-48 break-words text-xs text-dc-pink">{{ checkout.resolution_reason.replaceAll('_', ' ') }}</p>
              </td>
              <td class="py-4 pl-4">
                <details class="max-w-64 text-xs">
                  <summary class="min-h-11 cursor-pointer py-1 text-sm text-dc-ink underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-dc-pink" :aria-label="`Details: View purchaser and checkout ID for ${checkout.payment_reference}`">Details</summary>
                  <dl class="space-y-2 pb-2">
                    <div>
                      <dt class="text-dc-gray">Purchaser</dt>
                      <dd class="mt-1 break-words text-dc-ink">{{ checkout.purchaser_name ?? 'Legacy test checkout' }}</dd>
                      <dd class="mt-1 break-all text-dc-gray">{{ checkout.purchaser_email ?? 'Purchaser not collected' }}</dd>
                    </div>
                    <div>
                      <dt class="text-dc-gray">Payment reference</dt>
                      <dd class="mt-1 break-all font-mono text-dc-ink">{{ checkout.payment_reference }}</dd>
                    </div>
                    <div>
                      <dt class="text-dc-gray">Checkout ID</dt>
                      <dd class="mt-1 break-all font-mono text-dc-ink">{{ checkout.id }}</dd>
                    </div>
                  </dl>
                </details>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <nav v-if="checkoutRows.length" class="flex flex-wrap items-center justify-between gap-3 border-t border-dc-border py-3" aria-label="Checkout pagination">
        <p class="text-xs text-dc-gray" aria-live="polite">{{ checkoutStart }}–{{ checkoutEnd }} of {{ query.data.value?.checkout_total }} · Page {{ checkoutPage }} of {{ checkoutPageCount }}</p>
        <div class="flex gap-2">
          <button type="button" class="motion-press min-h-11 rounded-md border border-dc-border px-3 text-sm disabled:opacity-50" aria-label="Previous checkout page" :disabled="checkoutPage <= 1 || query.isFetching.value" @click="checkoutPage--">Previous</button>
          <button type="button" class="motion-press min-h-11 rounded-md border border-dc-border px-3 text-sm disabled:opacity-50" aria-label="Next checkout page" :disabled="checkoutPage >= checkoutPageCount || query.isFetching.value" @click="checkoutPage++">Next</button>
        </div>
      </nav>
    </template>
  </section>
</template>

<style scoped>
.coupon-term-field {
  display: grid;
  min-width: 0;
  align-content: start;
  gap: 0.5rem;
}

.coupon-term-field :deep(> .editorial-label),
.coupon-term-field :deep(> .editorial-input),
.coupon-term-field :deep(> .app-form-control) {
  margin: 0;
}

@media (forced-colors: active) {
  .coupon-pass-input {
    appearance: auto;
  }

  .coupon-pass-check {
    display: none;
  }
}
</style>
