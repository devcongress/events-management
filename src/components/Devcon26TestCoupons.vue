<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { formatTicketMoney, parseGhsAmountToMinor, type AnnualConferenceTicketTierKey } from '@/lib/annual-conference-ticketing';
import { createDevcon26TestCouponSchema, type Devcon26TestCoupon } from '@/lib/devcon26-test-coupons';
import { createDevcon26TestCoupon, fetchDevcon26TestCoupons, toggleDevcon26TestCoupon } from '@/src/lib/api';

const props = defineProps<{ year: string }>();
const queryClient = useQueryClient();
const page = ref(1);
const checkoutPage = ref(1);
const formElement = ref<HTMLFormElement | null>(null);
const error = ref('');
const feedback = ref('');
const form = reactive({
  code: '', discount_type: 'fixed_minor' as 'fixed_minor' | 'percentage_bps', discount: '',
  eligible_tiers: ['regular', 'team_3', 'team_5'] as AnnualConferenceTicketTierKey[],
  expires_at: '', max_completed: 1,
});
const tiers: Array<{ key: AnnualConferenceTicketTierKey; label: string }> = [
  { key: 'regular', label: 'Regular pass' }, { key: 'team_3', label: 'Team of 3' }, { key: 'team_5', label: 'Team of 5' },
];
const query = useQuery({
  queryKey: computed(() => ['devcon26-test-coupons', props.year, page.value, checkoutPage.value]),
  queryFn: () => fetchDevcon26TestCoupons(props.year, page.value, checkoutPage.value),
  enabled: computed(() => props.year === '2026'),
});
const pageCount = computed(() => Math.max(1, Math.ceil((query.data.value?.total ?? 0) / 8)));
const checkoutPageCount = computed(() => Math.max(1, Math.ceil((query.data.value?.checkout_total ?? 0) / 8)));

async function refresh() {
  await queryClient.invalidateQueries({ queryKey: ['devcon26-test-coupons', props.year] });
}

const createMutation = useMutation({
  mutationFn: createCoupon,
  onSuccess: async () => {
    form.code = '';
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
});

async function createCoupon() {
  error.value = '';
  feedback.value = '';
  const expiry = new Date(form.expires_at);
  const input = createDevcon26TestCouponSchema.safeParse({
    code: form.code,
    discount_type: form.discount_type,
    discount_value: parseGhsAmountToMinor(form.discount),
    eligible_tiers: form.eligible_tiers,
    expires_at: Number.isNaN(expiry.getTime()) ? '' : expiry.toISOString(),
    max_completed: form.max_completed,
  });

  if (!input.success) {
    const issue = input.error.issues[0];
    const field = issue?.path[0] === 'discount_value' ? 'discount' : String(issue?.path[0] ?? 'code');

    await nextTick();
    formElement.value?.querySelector<HTMLElement>(`[name="${field}"]`)?.focus();

    throw new Error(issue?.message ?? 'Check the coupon details.');
  }

  return createDevcon26TestCoupon(props.year, input.data);
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
  <section class="rounded-lg border-2 border-dc-ink bg-dc-paper p-5" aria-labelledby="test-coupons-title">
    <p class="editorial-eyebrow">Test checkout</p>
    <h2 id="test-coupons-title" class="mt-1 text-xl font-semibold text-dc-ink">Test checkout coupons</h2>
    <p class="mt-2 max-w-2xl text-sm leading-6 text-dc-gray">Create discounts for test payments. Coupon uses are reserved for 15 minutes and counted when a payment is verified. These checkouts do not issue admission tickets.</p>

    <details class="mt-5 rounded-md border border-dc-border p-4">
      <summary class="cursor-pointer text-sm font-semibold text-dc-ink">Create a test coupon</summary>
      <p class="mt-3 text-xs leading-5 text-dc-gray">Terms cannot be edited after creation. You can enable or disable the code.</p>
      <form ref="formElement" class="mt-4 grid gap-4 md:grid-cols-2" @submit.prevent="createMutation.mutate()">
        <label for="test-coupon-code">
          <span class="editorial-label">Code</span>
          <input id="test-coupon-code" v-model.trim="form.code" name="code" required minlength="3" maxlength="48" pattern="[A-Za-z0-9-]{3,48}" autocomplete="off" class="editorial-input mt-2 uppercase" aria-describedby="test-coupon-code-help">
          <span id="test-coupon-code-help" class="mt-1 block text-xs text-dc-gray">Letters, numbers, and hyphens; case does not matter.</span>
        </label>
        <label for="test-coupon-type">
          <span class="editorial-label">Discount type</span>
          <select id="test-coupon-type" v-model="form.discount_type" name="discount_type" class="editorial-input mt-2">
            <option value="fixed_minor">Fixed GHS amount</option>
            <option value="percentage_bps">Percentage</option>
          </select>
        </label>
        <label for="test-coupon-discount">
          <span class="editorial-label">{{ form.discount_type === 'fixed_minor' ? 'Discount (GHS)' : 'Discount (%)' }}</span>
          <input id="test-coupon-discount" v-model.trim="form.discount" name="discount" required inputmode="decimal" class="editorial-input mt-2" aria-describedby="test-coupon-discount-help">
          <span id="test-coupon-discount-help" class="mt-1 block text-xs text-dc-gray">Up to two decimal places. Every payment must remain above zero.</span>
        </label>
        <label for="test-coupon-max">
          <span class="editorial-label">Maximum completed uses</span>
          <input id="test-coupon-max" v-model.number="form.max_completed" name="max_completed" type="number" min="1" max="1000000" required class="editorial-input mt-2">
        </label>
        <fieldset class="min-w-0">
          <legend class="editorial-label">Eligible passes</legend>
          <div class="mt-2 flex flex-wrap gap-x-4 gap-y-2">
            <label v-for="tier in tiers" :key="tier.key" class="flex min-h-11 items-center gap-2 text-sm text-dc-ink">
              <input v-model="form.eligible_tiers" name="eligible_tiers" type="checkbox" :value="tier.key">{{ tier.label }}
            </label>
          </div>
        </fieldset>
        <label for="test-coupon-expiry">
          <span class="editorial-label">Expiry (local time)</span>
          <input id="test-coupon-expiry" v-model="form.expires_at" name="expires_at" type="datetime-local" required class="editorial-input mt-2">
        </label>
        <div class="md:col-span-2">
          <button type="submit" class="motion-press min-h-11 rounded-md border-2 border-dc-ink bg-dc-yellow px-4 font-mono text-xs font-semibold uppercase disabled:cursor-not-allowed disabled:opacity-50" :disabled="createMutation.isPending.value">{{ createMutation.isPending.value ? 'Creating…' : 'Create test coupon' }}</button>
        </div>
      </form>
    </details>

    <p v-if="error" class="mt-3 text-sm text-dc-pink" role="alert">{{ error }}</p>
    <p v-if="feedback" class="mt-3 text-sm text-dc-ink" role="status">{{ feedback }}</p>
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
              <h3 class="break-all font-mono text-base font-semibold text-dc-ink">{{ coupon.code }}</h3>
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

      <h3 class="mt-6 text-base font-semibold text-dc-ink">Test checkout activity</h3>
      <p class="mt-1 text-xs text-dc-gray">Private purchaser details and payment references. A verified test payment is not an admission ticket.</p>
      <p v-if="!query.data.value?.checkouts.length" class="py-4 text-sm text-dc-gray">No test checkouts have started yet.</p>
      <div class="mt-3 divide-y divide-dc-border">
        <article v-for="checkout in query.data.value?.checkouts" :key="checkout.id" class="py-4">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0 flex-1">
              <p class="break-all font-mono text-xs text-dc-ink">{{ checkout.payment_reference }}</p>
              <p class="mt-1 text-sm text-dc-gray">{{ checkout.quantity }} {{ checkout.quantity === 1 ? 'seat' : 'seats' }} · {{ checkout.coupon_code ?? 'No coupon' }} · {{ dateLabel(checkout.created_at) }}</p>
            </div>
            <span class="rounded-md border border-dc-border px-2 py-1 text-xs font-semibold" :class="checkout.status === 'refund_required' ? 'text-dc-pink' : 'text-dc-ink'">{{ checkout.status === 'refund_required' ? 'Needs attention' : checkout.status === 'rejected' ? 'Failed' : checkout.status }}</span>
          </div>
          <p class="mt-2 text-xs text-dc-gray">{{ formatTicketMoney(checkout.base_amount_minor) }} − {{ formatTicketMoney(checkout.discount_amount_minor) }} = {{ formatTicketMoney(checkout.amount_minor) }}</p>
          <p v-if="checkout.resolution_reason" class="mt-1 text-xs text-dc-pink">{{ checkout.resolution_reason.replaceAll('_', ' ') }}</p>
          <details class="mt-2 text-sm">
            <summary class="cursor-pointer text-dc-gray underline underline-offset-4">View purchaser and checkout ID</summary>
            <p class="mt-2 break-words text-dc-ink">{{ checkout.purchaser_name ?? 'Legacy test checkout' }}</p>
            <p class="mt-1 break-all text-dc-gray">{{ checkout.purchaser_email ?? 'Purchaser not collected' }}</p>
            <p class="mt-1 break-all font-mono text-xs text-dc-gray">{{ checkout.id }}</p>
          </details>
        </article>
      </div>
      <div v-if="checkoutPageCount > 1" class="flex flex-wrap items-center justify-between gap-3 border-t border-dc-border py-3">
        <p class="text-xs text-dc-gray">Checkout page {{ checkoutPage }} of {{ checkoutPageCount }}</p>
        <div class="flex gap-2">
          <button type="button" class="motion-press min-h-11 rounded-md border border-dc-border px-3 text-sm disabled:opacity-50" :disabled="checkoutPage <= 1 || query.isFetching.value" @click="checkoutPage--">Previous</button>
          <button type="button" class="motion-press min-h-11 rounded-md border border-dc-border px-3 text-sm disabled:opacity-50" :disabled="checkoutPage >= checkoutPageCount || query.isFetching.value" @click="checkoutPage++">Next</button>
        </div>
      </div>
    </template>
  </section>
</template>
