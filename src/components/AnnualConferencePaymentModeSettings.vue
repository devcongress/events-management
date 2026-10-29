<script setup lang="ts">
import BoneyardPageSkeleton from '@/src/components/ui/BoneyardPageSkeleton.vue';
import { computed, reactive, ref, watch } from 'vue';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import ConfirmDialog from '@/src/components/ui/ConfirmDialog.vue';
import { fetchJson, queryKeys } from '@/src/lib/api';

type PaymentMode = 'test' | 'live';
type PaymentSettings = {
  payment_mode: PaymentMode;
  settings_version: number;
  tester_emails: string[];
  readiness: Record<PaymentMode, { ready: boolean; reasons: string[] }>;
};
type ReviewedSettings = Pick<PaymentSettings, 'payment_mode' | 'settings_version' | 'tester_emails'>;

const props = defineProps<{ year: string }>();
const queryClient = useQueryClient();
const endpoint = computed(() => `/api/annual-conference/${props.year}/registrations/payment-mode`);
const settingsKey = computed(() => ['conference-payment-mode', props.year]);
const settingsQuery = useQuery({
  queryKey: settingsKey,
  queryFn: () => fetchJson<PaymentSettings>(endpoint.value, { credentials: 'include' }),
});
const draft = reactive({ mode: 'test' as PaymentMode, emails: '' });
const review = ref<ReviewedSettings | null>(null);
const busy = ref(false);
const error = ref('');
const message = ref('');
const preserveDraft = ref(false);
const testerEmails = computed(() => [...new Set(draft.emails.split(/[\n,;]/).map((email) => email.trim().toLowerCase()).filter(Boolean))]);
const emailError = computed(() => testerEmails.value.length > 200
  ? 'Use up to 200 tester email addresses.'
  : testerEmails.value.some((email) => email.includes('*') || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    ? 'Check each email address. Use one per line.' : '');
const selectedReadiness = computed(() => settingsQuery.data.value?.readiness[draft.mode]);
const activatingLive = computed(() => draft.mode === 'live' && settingsQuery.data.value?.payment_mode !== 'live');
const reviewActivatesLive = computed(() => review.value?.payment_mode === 'live' && settingsQuery.data.value?.payment_mode !== 'live');
const changed = computed(() => Boolean(settingsQuery.data.value && (
  draft.mode !== settingsQuery.data.value.payment_mode
  || testerEmails.value.join('\n') !== settingsQuery.data.value.tester_emails.join('\n')
)));
const canReview = computed(() => changed.value && !busy.value && !settingsQuery.isFetching.value
  && !settingsQuery.isError.value && !emailError.value
  && (!activatingLive.value || selectedReadiness.value?.ready === true));
const confirmationTitle = computed(() => reviewActivatesLive.value ? 'Enable real payments?'
  : review.value?.payment_mode === 'live' ? 'Save approved tester emails?' : 'Save Testing mode?');
const confirmationMessage = computed(() => reviewActivatesLive.value
  ? 'New website checkouts will charge real money through Paystack. Existing test orders remain test orders. Save this mode and the approved email list together?'
  : review.value?.payment_mode === 'live'
    ? 'The website will stay in Live mode. These approved addresses still control existing test orders and email delivery. Save the updated list?'
    : `New website checkouts will use Paystack test payments. Only the ${review.value?.tester_emails.length ?? 0} approved addresses can purchase or receive test tickets and emails. Test tickets do not admit guests. Save these settings together?`);

function hydrate(value: PaymentSettings) {
  draft.mode = value.payment_mode;
  draft.emails = value.tester_emails.join('\n');
}

watch(() => settingsQuery.data.value, (value, previous) => {
  const unchanged = !previous || (draft.mode === previous.payment_mode
    && testerEmails.value.join('\n') === previous.tester_emails.join('\n'));

  if (value && unchanged && !review.value && !preserveDraft.value) hydrate(value);
}, { immediate: true });

function updateEmails(event: Event) {
  draft.emails = (event.target as HTMLTextAreaElement).value;
}

function reviewSettings() {
  if (!canReview.value || !settingsQuery.data.value) return;

  error.value = '';
  message.value = '';
  review.value = {
    payment_mode: draft.mode,
    tester_emails: [...testerEmails.value],
    settings_version: settingsQuery.data.value.settings_version,
  };
}

async function saveSettings() {
  const reviewed = review.value;

  if (!reviewed || busy.value) return;
  if (reviewed.settings_version !== settingsQuery.data.value?.settings_version) {
    review.value = null;
    error.value = 'Payment settings changed. Your draft is preserved. Review the current settings before saving again.';

    return;
  }
  if (reviewActivatesLive.value && settingsQuery.data.value?.readiness.live.ready !== true) return;

  busy.value = true;
  error.value = '';
  preserveDraft.value = true;
  const requestYear = props.year;

  try {
    const response = await fetch(endpoint.value, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...reviewed, confirmed: true }),
      signal: AbortSignal.timeout(15000),
    });
    const payload: unknown = await response.json().catch(() => null);
    const code = payload && typeof payload === 'object' && 'code' in payload ? payload.code : null;

    if (response.status === 409 && (code === 'checkout_settings_changed' || code === 'payment_mode_not_ready')) {
      review.value = null;
      await settingsQuery.refetch();
      error.value = code === 'payment_mode_not_ready'
        ? 'Live payments could not be enabled because payment configuration is not ready. Your draft is preserved. Review the readiness details before saving again.'
        : 'Payment settings changed. Your draft is preserved. Review the current settings before saving again.';

      return;
    }
    if (!response.ok) {
      throw new Error(payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
        ? payload.error : 'Payment settings could not be saved.');
    }

    review.value = null;
    message.value = 'Payment settings saved.';
    await Promise.allSettled([
      queryClient.invalidateQueries({ queryKey: ['conference-payment-mode', requestYear] }),
      queryClient.invalidateQueries({ queryKey: ['conference-registration-testing', requestYear] }),
      queryClient.invalidateQueries({ queryKey: queryKeys.annualConferenceTicketing(requestYear) }),
    ]);

    if (settingsQuery.isError.value) {
      message.value = 'Payment settings were saved. Refresh to confirm the current mode.';
    } else if (settingsQuery.data.value) {
      hydrate(settingsQuery.data.value);
    }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Payment settings could not be saved.';
  } finally {
    busy.value = false;
    preserveDraft.value = false;
  }
}
</script>

<template>
  <section class="ops-panel registration-panel payment-mode-settings">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h2 class="text-xl font-semibold text-dc-ink">Payment mode</h2>
      <span v-if="settingsQuery.data.value" class="rounded-md border border-dc-ink/15 bg-dc-cream px-2 py-1 text-xs text-dc-gray">Current: {{ settingsQuery.data.value.payment_mode === 'test' ? 'Testing' : 'Live' }}</span>
    </div>
    <p class="text-sm text-dc-gray">The website uses this saved mode for new checkouts. Existing payments keep their original mode.</p>
    <BoneyardPageSkeleton
      v-if="settingsQuery.isPending.value && !settingsQuery.data.value"
      name="annual-conference-payment-settings"
      label="payment settings"
      layout="form"
      :show-header="false"
    />
    <div v-else-if="settingsQuery.isError.value" role="alert">
      <p class="text-dc-pink">Payment settings could not be refreshed. Your draft has been kept.</p>
      <button type="button" class="motion-press" :disabled="busy" @click="settingsQuery.refetch()">Refresh payment settings</button>
    </div>
    <form v-if="settingsQuery.data.value" class="payment-mode-form" @submit.prevent="reviewSettings">
      <fieldset :disabled="busy || Boolean(review)" class="payment-mode-choices">
        <legend class="editorial-label">Payment environment</legend>
        <label class="payment-mode-choice">
          <input type="radio" name="conference-payment-mode" value="test" :checked="draft.mode === 'test'" @change="draft.mode = 'test'" />
          <span><strong>Testing</strong><small>Approved emails only. No real charges or valid admission.</small></span>
        </label>
        <label class="payment-mode-choice">
          <input type="radio" name="conference-payment-mode" value="live" :checked="draft.mode === 'live'" @change="draft.mode = 'live'" />
          <span><strong>Live</strong><small>Real payments for new website checkouts.</small></span>
        </label>
      </fieldset>
      <div v-if="selectedReadiness && !selectedReadiness.ready" class="payment-readiness" role="status">
        <p>{{ draft.mode === 'live' ? 'Live checkout is not ready.' : 'Test checkout is not ready.' }}</p>
        <ul v-if="selectedReadiness.reasons.length" class="list-disc pl-5">
          <li v-for="reason in selectedReadiness.reasons" :key="reason">{{ reason }}</li>
        </ul>
      </div>
      <label for="payment-tester-emails" class="editorial-label">Approved tester emails</label>
      <textarea id="payment-tester-emails" :value="draft.emails" class="app-form-control w-full" rows="4" maxlength="51000" :disabled="busy || Boolean(review)" aria-describedby="payment-tester-help payment-email-error" :aria-invalid="Boolean(emailError)" @input="updateEmails" />
      <p id="payment-tester-help" class="text-xs text-dc-gray">One address per line. {{ testerEmails.length }} / 200 addresses. These restrictions also apply to existing test orders after switching to Live.</p>
      <p v-if="draft.mode === 'test' && !testerEmails.length" class="text-sm text-dc-gray" role="status">An empty approved list can be saved, but blocks all test checkout and delivery.</p>
      <p id="payment-email-error" class="text-sm text-dc-pink" role="status">{{ emailError }}</p>
      <button class="motion-press" type="submit" :disabled="!canReview">Review payment settings</button>
    </form>
    <p v-if="message" class="text-sm text-dc-gray" role="status">{{ message }}</p>
    <p v-if="error && !review" class="text-sm text-dc-pink" role="alert">{{ error }}</p>
    <ConfirmDialog
      :open="Boolean(review)"
      :title="confirmationTitle"
      :message="confirmationMessage"
      confirm-label="Save payment settings"
      :busy="busy"
      :danger="review?.payment_mode === 'live'"
      :confirm-disabled="Boolean(emailError) || (reviewActivatesLive && settingsQuery.data.value?.readiness.live.ready !== true)"
      @cancel="review = null"
      @confirm="saveSettings"
    >
      <p v-if="error" class="text-dc-pink" role="alert">{{ error }}</p>
    </ConfirmDialog>
  </section>
</template>

<style scoped>
.payment-mode-settings {
  padding: 24px;
}
.payment-mode-settings p {
  margin: 8px 0;
  line-height: 1.6;
}
.payment-mode-settings button {
  @apply min-h-11 rounded-md border-2 border-dc-ink bg-white px-4 py-2 font-mono text-xs font-semibold uppercase text-dc-ink disabled:cursor-not-allowed disabled:opacity-50;
}
.payment-mode-settings button[type="submit"] {
  @apply bg-dc-pink text-white;
  justify-self: start;
}
.payment-mode-form {
  display: grid;
  gap: 12px;
}
.payment-mode-choices {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.payment-mode-choices legend {
  margin-bottom: 8px;
}
.payment-mode-choice {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-height: 72px;
  padding: 12px;
  border: 1px solid var(--dc-border, #d6d3d1);
  border-radius: 8px;
}
.payment-mode-choice:has(input:checked) {
  border-color: #e8117f;
  background: #fff5fa;
}
.payment-mode-choice input {
  margin-top: 4px;
  accent-color: #e8117f;
}
.payment-mode-choice strong,
.payment-mode-choice small {
  display: block;
}
.payment-mode-choice small {
  margin-top: 4px;
  color: #737373;
  font-size: 12px;
}
.payment-readiness {
  font-size: 13px;
}
@media (max-width: 600px) {
  .payment-mode-choices {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
