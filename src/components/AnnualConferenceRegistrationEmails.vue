<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import AppPagination from '@/src/components/AppPagination.vue';
import ConfirmDialog from '@/src/components/ui/ConfirmDialog.vue';
import {
  fetchAnnualConferenceTicketEmailDeliveries,
  retryAnnualConferenceTicketEmailDelivery,
  type AnnualConferenceTicketEmailDelivery,
  type AnnualConferenceTicketEmailDeliveryStatus,
} from '@/src/lib/api';

const props = defineProps<{ year: string }>();
const client = useQueryClient();
const page = ref(1);
const status = ref<AnnualConferenceTicketEmailDeliveryStatus | 'all'>('all');
const selected = ref<AnnualConferenceTicketEmailDelivery | null>(null);
const busy = ref(false);
const error = ref('');
const message = ref('');
let generation = 0;
const deliveries = useQuery({
  queryKey: computed(() => ['conference-registration-emails', props.year, page.value, status.value]),
  queryFn: () => fetchAnnualConferenceTicketEmailDeliveries(props.year, {
    page: page.value, pageSize: 8, status: status.value === 'all' ? undefined : status.value,
  }),
  refetchInterval: 15_000,
  refetchIntervalInBackground: false,
});
const total = computed(() => deliveries.data.value?.total ?? 0);
const pages = computed(() => Math.max(1, Math.ceil(total.value / 8)));
const summaries = computed(() => {
  const summary = deliveries.data.value?.summary;

  return [
    { label: 'Accepted by provider', value: summary?.accepted ?? 0 },
    { label: 'Delivered', value: summary?.delivered ?? 0 },
    { label: 'Queued / sending', value: (summary?.queued ?? 0) + (summary?.sending ?? 0) },
    { label: 'Failed', value: summary?.failed ?? 0 },
  ];
});

function canRetry(delivery: AnnualConferenceTicketEmailDelivery) {
  return delivery.status === 'failed' && delivery.attempt_count < 5
    && !delivery.provider_email_id && !delivery.accepted_at;
}

function kindLabel(delivery: AnnualConferenceTicketEmailDelivery) {
  if (delivery.kind === 'waitlist_notice') return 'Waitlist notice';
  if (delivery.kind === 'payment_receipt') return 'Payment receipt';

  return 'Admission confirmation';
}

async function retry() {
  const delivery = selected.value;

  if (!delivery || !canRetry(delivery) || busy.value) return;
  const request = ++generation;
  const year = props.year;

  busy.value = true;
  error.value = '';

  try {
    await retryAnnualConferenceTicketEmailDelivery(year, delivery.id);
    await client.invalidateQueries({ queryKey: ['conference-registration-emails', year] });
    if (request !== generation) return;
    selected.value = null;
    message.value = 'Email queued for retry. Provider acceptance and inbox delivery are reported separately.';
  } catch (cause) {
    if (request === generation) error.value = cause instanceof Error ? cause.message : 'Unable to retry this email.';
  } finally {
    if (request === generation) busy.value = false;
  }
}

watch([() => props.year, status], () => { page.value = 1; });
watch(() => props.year, () => {
  generation += 1;
  selected.value = null;
  busy.value = false;
  error.value = '';
  message.value = '';
});
watch(pages, (count) => { page.value = Math.min(page.value, count); });
</script>

<template>
  <section class="ops-panel overflow-hidden" aria-label="Registration emails">
    <div class="border-b border-dc-border bg-dc-paper-warm px-5 py-4">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p class="editorial-eyebrow">Transactional only</p>
          <h2 class="mt-1 text-xl font-bold text-dc-ink">Registration emails</h2>
          <p class="mt-1 max-w-2xl text-sm leading-6 text-dc-gray">Admission confirmations and waitlist notices. Send conference updates from Blasts.</p>
        </div>
        <button type="button" class="editorial-action" :disabled="deliveries.isFetching.value" @click="deliveries.refetch()">Refresh</button>
      </div>
    </div>
    <p v-if="message" class="px-5 py-3 text-sm" role="status">{{ message }}</p>
    <p v-if="deliveries.isPending.value" class="p-5" role="status">Loading delivery records…</p>
    <div v-else-if="deliveries.isError.value" class="p-5" role="alert">
      <p>Delivery records could not be loaded.</p>
      <button class="editorial-action mt-3" @click="deliveries.refetch()">Try again</button>
    </div>
    <template v-else>
      <div class="grid gap-3 border-b border-dc-border p-5 sm:grid-cols-2 lg:grid-cols-4">
        <div v-for="item in summaries" :key="item.label" class="rounded-lg border border-dc-border bg-white px-4 py-3">
          <p class="font-mono text-[10px] font-semibold uppercase tracking-wide text-dc-gray">{{ item.label }}</p>
          <p class="mt-1 text-2xl font-bold text-dc-ink">{{ item.value }}</p>
        </div>
      </div>
      <div class="border-b border-dc-border p-5">
        <label for="conference-email-status" class="editorial-label">Delivery status</label>
        <select id="conference-email-status" v-model="status" class="editorial-input max-w-xs">
          <option value="all">All emails</option>
          <option value="queued">Queued</option><option value="sending">Sending</option>
          <option value="accepted">Accepted by provider</option><option value="delivered">Delivered</option>
          <option value="failed">Failed</option>
        </select>
      </div>
      <p v-if="!total" class="px-5 py-12 text-center text-sm text-dc-gray">No delivery records match this status.</p>
      <div v-else class="divide-y divide-dc-border" role="list" aria-label="Registration email delivery records">
        <div v-for="delivery in deliveries.data.value?.deliveries" :key="delivery.id" class="flex flex-wrap items-center justify-between gap-3 px-5 py-4" role="listitem">
          <div class="min-w-0">
            <p class="font-bold text-dc-ink">{{ delivery.recipient_name }}</p>
            <p class="break-all text-sm text-dc-gray">{{ delivery.recipient_email }}</p>
            <p class="mt-1 font-mono text-[10px] uppercase text-dc-gray">{{ kindLabel(delivery) }}</p>
          </div>
          <div class="flex items-center gap-3">
            <span class="rounded-sm border border-dc-border px-2 py-1 font-mono text-[10px] uppercase">{{ delivery.status === 'accepted' ? 'Accepted by provider' : delivery.status }}</span>
            <button v-if="canRetry(delivery)" class="editorial-action" :disabled="busy" @click="selected = delivery; error = ''">Retry</button>
          </div>
        </div>
      </div>
      <AppPagination v-if="total > 8" v-model:page="page" :page-count="pages" :total="total" :range-start="(page - 1) * 8 + 1" :range-end="Math.min(page * 8, total)" item-label="emails" />
    </template>
    <ConfirmDialog :open="Boolean(selected)" title="Retry registration email?" :message="'Queue a retry for ' + (selected?.recipient_name ?? '') + '. Emails already accepted by the provider will not be resent.'" confirm-label="Queue retry" :busy="busy" @cancel="selected = null" @confirm="retry">
      <p v-if="error" class="text-dc-pink" role="alert">{{ error }}</p>
    </ConfirmDialog>
  </section>
</template>
