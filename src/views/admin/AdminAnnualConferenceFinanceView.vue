<script setup lang="ts">
import { computed, nextTick, onUnmounted, reactive, ref } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { useRoute } from 'vue-router';
import AnnualConferenceNav from '@/src/components/AnnualConferenceNav.vue';
import AppDropdown from '@/src/components/AppDropdown.vue';
import AppDatePicker from '@/src/components/ui/AppDatePicker.vue';
import {
  ANNUAL_CONFERENCE_FINANCE_CATEGORIES,
  ANNUAL_CONFERENCE_FINANCE_CATEGORY_LABELS,
  type AnnualConferenceFinanceCategory,
  type AnnualConferenceFinanceEntry,
  type AnnualConferenceFinanceEntryKind,
  type AnnualConferenceFinanceEntryStatus,
} from '@/lib/annual-conference-finance';
import {
  amendAnnualConferenceFinanceIncomeExpectation,
  cancelAnnualConferenceFinanceIncomeExpectation,
  createAnnualConferenceFinanceBudget,
  createAnnualConferenceFinanceEntry,
  fetchAnnualConferenceFinance,
  queryKeys,
  recordAnnualConferenceFinanceIncomeReceipt,
} from '@/src/lib/api';
import { notify } from '@/src/lib/notify';

const route = useRoute();
const queryClient = useQueryClient();
const year = computed(() => String(route.params.year));
const actionError = ref('');
type FinanceDrawerMode = 'budget' | 'entry' | 'income';
type IncomeDrawerStep = 'overview' | 'amend' | 'receipt' | 'cancel';
const financeDrawerMode = ref<FinanceDrawerMode | null>(null);
const incomeDrawerStep = ref<IncomeDrawerStep>('overview');
const selectedIncomeEntry = ref<AnnualConferenceFinanceEntry | null>(null);
const financeDrawerPanel = ref<HTMLElement | null>(null);
const financeDrawerCloseButton = ref<HTMLButtonElement | null>(null);
const pageContent = ref<HTMLElement | null>(null);
let financeDrawerTrigger: HTMLElement | null = null;
let previousBodyOverflow = '';

const financeQuery = useQuery({
  queryKey: computed(() => queryKeys.annualConferenceFinance(year.value)),
  queryFn: () => fetchAnnualConferenceFinance(year.value),
});

const finance = computed(() => financeQuery.data.value);
const summary = computed(() => finance.value?.summary);
const canManage = computed(() => finance.value?.permissions.can_manage === true);
const selectedIncomeAmendments = computed(() => finance.value?.income_amendments
  .filter((amendment) => amendment.entry_id === selectedIncomeEntry.value?.id) ?? []);
const selectedIncomeReceipts = computed(() => finance.value?.income_receipts
  .filter((receipt) => receipt.entry_id === selectedIncomeEntry.value?.id) ?? []);
const categories = computed(() => ANNUAL_CONFERENCE_FINANCE_CATEGORIES.map((value) => ({
  value,
  label: ANNUAL_CONFERENCE_FINANCE_CATEGORY_LABELS[value],
})));
const categoryLabel = (category: AnnualConferenceFinanceCategory) => ANNUAL_CONFERENCE_FINANCE_CATEGORY_LABELS[category];

const budgetForm = reactive({
  category: 'venue' as AnnualConferenceFinanceCategory,
  label: '',
  amount: '',
});
const entryForm = reactive({
  kind: 'expense' as AnnualConferenceFinanceEntryKind,
  category: 'venue' as AnnualConferenceFinanceCategory,
  description: '',
  amount: '',
  status: 'committed' as AnnualConferenceFinanceEntryStatus,
  vendor: '',
  entry_date: new Date().toISOString().slice(0, 10),
  notes: '',
});
const incomeAmendmentForm = reactive({ amount: '', reason: '' });
const incomeReceiptForm = reactive({
  amount: '',
  received_date: new Date().toISOString().slice(0, 10),
  payment_reference: '',
  notes: '',
  idempotency_key: '',
});
const incomeCancellationForm = reactive({ reason: '' });

const budgetMutation = useMutation({
  mutationFn: async () => {
    const amountMinor = amountToMinor(budgetForm.amount);
    if (amountMinor === null) throw new Error('Enter a valid GHS amount with up to two decimal places.');
    if (!budgetForm.label.trim()) throw new Error('Add a label for this budget line.');
    return createAnnualConferenceFinanceBudget(year.value, {
      category: budgetForm.category,
      label: budgetForm.label.trim(),
      amount_minor: amountMinor,
    });
  },
  onSuccess: async () => {
    actionError.value = '';
    budgetForm.label = '';
    budgetForm.amount = '';
    await queryClient.invalidateQueries({ queryKey: queryKeys.annualConferenceFinance(year.value) });
    notify.success('Budget line added.');
    await closeFinanceDrawer();
  },
  onError: (error) => {
    actionError.value = error instanceof Error ? error.message : 'Unable to add the budget line.';
  },
});

const entryMutation = useMutation({
  mutationFn: async () => {
    const amountMinor = amountToMinor(entryForm.amount);
    if (amountMinor === null) throw new Error('Enter a valid GHS amount with up to two decimal places.');
    if (!entryForm.description.trim()) throw new Error('Add a description for this record.');
    return createAnnualConferenceFinanceEntry(year.value, {
      kind: entryForm.kind,
      category: entryForm.category,
      description: entryForm.description.trim(),
      amount_minor: amountMinor,
      status: entryForm.status,
      vendor: entryForm.vendor.trim() || null,
      entry_date: entryForm.entry_date || null,
      notes: entryForm.notes.trim() || null,
    });
  },
  onSuccess: async () => {
    actionError.value = '';
    entryForm.description = '';
    entryForm.amount = '';
    entryForm.vendor = '';
    entryForm.notes = '';
    await queryClient.invalidateQueries({ queryKey: queryKeys.annualConferenceFinance(year.value) });
    notify.success(entryForm.kind === 'income' ? 'Income record added.' : 'Expense record added.');
    await closeFinanceDrawer();
  },
  onError: (error) => {
    actionError.value = error instanceof Error ? error.message : 'Unable to add the finance record.';
  },
});

const incomeAmendmentMutation = useMutation({
  mutationFn: async () => {
    const entry = selectedIncomeEntry.value;
    const amountMinor = amountToMinor(incomeAmendmentForm.amount);
    if (!entry) throw new Error('Choose an income expectation first.');
    if (amountMinor === null) throw new Error('Enter a valid revised GHS amount with up to two decimal places.');
    if (!incomeAmendmentForm.reason.trim()) throw new Error('Explain why the expected amount changed.');
    return amendAnnualConferenceFinanceIncomeExpectation(year.value, entry.id, {
      amount_minor: amountMinor,
      reason: incomeAmendmentForm.reason.trim(),
    });
  },
  onSuccess: async () => {
    actionError.value = '';
    await queryClient.invalidateQueries({ queryKey: queryKeys.annualConferenceFinance(year.value) });
    notify.success('Expected income updated.');
    await closeFinanceDrawer();
  },
  onError: (error) => {
    actionError.value = error instanceof Error ? error.message : 'Unable to amend the expected income.';
  },
});

const incomeReceiptMutation = useMutation({
  mutationFn: async () => {
    const entry = selectedIncomeEntry.value;
    const amountMinor = amountToMinor(incomeReceiptForm.amount);
    if (!entry) throw new Error('Choose an income expectation first.');
    if (amountMinor === null) throw new Error('Enter a valid received GHS amount with up to two decimal places.');
    if (!incomeReceiptForm.received_date) throw new Error('Choose the date the payment was received.');
    if (!incomeReceiptForm.idempotency_key) incomeReceiptForm.idempotency_key = crypto.randomUUID();
    return recordAnnualConferenceFinanceIncomeReceipt(year.value, entry.id, {
      amount_minor: amountMinor,
      received_date: incomeReceiptForm.received_date,
      payment_reference: incomeReceiptForm.payment_reference.trim() || null,
      notes: incomeReceiptForm.notes.trim() || null,
      idempotency_key: incomeReceiptForm.idempotency_key,
    });
  },
  onSuccess: async () => {
    actionError.value = '';
    await queryClient.invalidateQueries({ queryKey: queryKeys.annualConferenceFinance(year.value) });
    notify.success('Payment receipt recorded.');
    await closeFinanceDrawer();
  },
  onError: (error) => {
    actionError.value = error instanceof Error ? error.message : 'Unable to record the payment receipt.';
  },
});

const incomeCancellationMutation = useMutation({
  mutationFn: async () => {
    const entry = selectedIncomeEntry.value;
    if (!entry) throw new Error('Choose an income expectation first.');
    if (!incomeCancellationForm.reason.trim()) throw new Error('Explain why this expectation is no longer expected.');
    return cancelAnnualConferenceFinanceIncomeExpectation(year.value, entry.id, {
      reason: incomeCancellationForm.reason.trim(),
    });
  },
  onSuccess: async () => {
    actionError.value = '';
    await queryClient.invalidateQueries({ queryKey: queryKeys.annualConferenceFinance(year.value) });
    notify.success('Expected income cancelled.');
    await closeFinanceDrawer();
  },
  onError: (error) => {
    actionError.value = error instanceof Error ? error.message : 'Unable to cancel the expected income.';
  },
});

const entryStatusOptions = computed(() => entryForm.kind === 'expense'
  ? [
      { value: 'draft', label: 'Draft' },
      { value: 'committed', label: 'Committed' },
      { value: 'paid', label: 'Paid' },
      { value: 'cancelled', label: 'Cancelled' },
    ]
  : [
      { value: 'expected', label: 'Expected' },
      { value: 'received', label: 'Received' },
      { value: 'cancelled', label: 'Cancelled' },
    ]);

function changeEntryKind(value: string | number) {
  entryForm.kind = value === 'income' ? 'income' : 'expense';
  entryForm.status = entryForm.kind === 'income' ? 'expected' : 'committed';
}

function amountToMinor(value: string): number | null {
  const normalized = value.trim().replace(/,/g, '');
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, fraction = ''] = normalized.split('.');
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(amount) && amount <= 9_000_000_000_000 ? amount : null;
}

function formatMoney(amountMinor: number): string {
  return 'GHS ' + (amountMinor / 100).toLocaleString('en-GH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function statusLabel(status: AnnualConferenceFinanceEntryStatus): string {
  return status === 'committed'
    ? 'Committed'
    : status === 'paid'
      ? 'Paid'
      : status === 'expected'
        ? 'Expected'
        : status === 'partially_received'
          ? 'Partly received'
        : status === 'received'
          ? 'Received'
          : status === 'cancelled'
            ? 'Cancelled'
            : 'Draft';
}

function sourceLabel(entry: AnnualConferenceFinanceEntry): string {
  if (entry.source_type === 'ticket') return 'Ticketing';
  if (entry.source_type === 'sponsor') return 'Sponsorship';
  return 'Manual';
}

function canManageIncome(entry: AnnualConferenceFinanceEntry): boolean {
  return canManage.value && entry.kind === 'income' && entry.source_type === 'manual';
}

const financeDrawerTitle = computed(() => {
  if (financeDrawerMode.value === 'budget') return 'Add budget line';
  if (financeDrawerMode.value === 'entry') return 'Add financial record';
  if (incomeDrawerStep.value === 'amend') return 'Amend expected income';
  if (incomeDrawerStep.value === 'receipt') return 'Record payment received';
  if (incomeDrawerStep.value === 'cancel') return 'Cancel expectation';
  return 'Manage income';
});
const financeDrawerDescription = computed(() => {
  if (financeDrawerMode.value === 'budget') return 'Set the amount you expect to spend before commitments arrive.';
  if (financeDrawerMode.value === 'entry') return 'Record an expense or income item and keep its state explicit.';
  if (incomeDrawerStep.value === 'amend') return 'Keep the original promise and record why the expected amount changed.';
  if (incomeDrawerStep.value === 'receipt') return 'Record money that has actually arrived. Partial payments stay visible.';
  if (incomeDrawerStep.value === 'cancel') return 'Use this only when no payment has been received and the commitment will not arrive.';
  return 'Review the commitment, its receipts, and the amount still outstanding.';
});

function setPageInteractionLocked(locked: boolean) {
  if (typeof document === 'undefined') return;

  if (locked) {
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    pageContent.value?.setAttribute('inert', '');
    return;
  }

  document.body.style.overflow = previousBodyOverflow;
  pageContent.value?.removeAttribute('inert');
}

async function openFinanceDrawer(mode: FinanceDrawerMode, event: MouseEvent) {
  if (!canManage.value) return;
  actionError.value = '';
  financeDrawerMode.value = mode;
  incomeDrawerStep.value = 'overview';
  selectedIncomeEntry.value = null;
  financeDrawerTrigger = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
  setPageInteractionLocked(true);
  await nextTick();
  financeDrawerCloseButton.value?.focus();
}

async function openIncomeDrawer(entry: AnnualConferenceFinanceEntry, event: MouseEvent) {
  if (!canManageIncome(entry)) return;
  actionError.value = '';
  selectedIncomeEntry.value = entry;
  incomeDrawerStep.value = 'overview';
  incomeAmendmentForm.amount = (entry.amount_minor / 100).toFixed(2);
  incomeAmendmentForm.reason = '';
  incomeReceiptForm.amount = '';
  incomeReceiptForm.received_date = new Date().toISOString().slice(0, 10);
  incomeReceiptForm.payment_reference = '';
  incomeReceiptForm.notes = '';
  incomeReceiptForm.idempotency_key = '';
  incomeCancellationForm.reason = '';
  financeDrawerMode.value = 'income';
  financeDrawerTrigger = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
  setPageInteractionLocked(true);
  await nextTick();
  financeDrawerCloseButton.value?.focus();
}

function selectIncomeDrawerStep(step: Exclude<IncomeDrawerStep, 'overview'>) {
  actionError.value = '';
  incomeDrawerStep.value = step;
}

function returnToIncomeOverview() {
  actionError.value = '';
  incomeDrawerStep.value = 'overview';
}

async function closeFinanceDrawer() {
  if (!financeDrawerMode.value) return;
  financeDrawerMode.value = null;
  selectedIncomeEntry.value = null;
  setPageInteractionLocked(false);
  await nextTick();
  financeDrawerTrigger?.focus();
  financeDrawerTrigger = null;
}

function handleFinanceDrawerKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault();
    void closeFinanceDrawer();
    return;
  }

  if (event.key !== 'Tab' || !financeDrawerPanel.value) return;

  const focusable = Array.from(financeDrawerPanel.value.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )).filter((element) => !element.hasAttribute('hidden'));
  if (focusable.length === 0) return;

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

onUnmounted(() => {
  if (financeDrawerMode.value) setPageInteractionLocked(false);
});
</script>

<template>
  <div ref="pageContent" class="editorial-page">
    <div class="editorial-wrap py-5 lg:py-6">
      <AnnualConferenceNav :show-page-heading="false" />

      <section v-if="financeQuery.isError.value" class="editorial-panel mb-6 border-dc-pink p-6" role="alert">
        <p class="text-lg font-semibold text-dc-ink">Finance data is temporarily unavailable.</p>
        <button
          type="button"
          class="motion-press mt-4 min-h-11 rounded-md border-2 border-dc-ink bg-dc-yellow px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.12em]"
          @click="financeQuery.refetch()"
        >
          Try again
        </button>
      </section>

      <template v-else>
        <header class="mb-5 flex flex-wrap items-end justify-between gap-4 border-b border-dc-border pb-4">
          <div>
            <p class="editorial-eyebrow">Private finance workspace</p>
            <h1 class="mt-1 text-3xl font-semibold tracking-tight text-dc-ink sm:text-4xl">Money at a glance</h1>
            <p class="mt-2 max-w-2xl text-sm leading-6 text-dc-gray">
              Values are stored in Ghana cedis. Planned budget, committed spend, paid spend, and income stay separate.
            </p>
          </div>
          <div class="flex flex-wrap items-center justify-end gap-2">
            <span class="rounded-md border border-dc-border bg-dc-paper-warm px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-dc-gray">
              GHS · {{ year }}
            </span>
            <template v-if="canManage">
              <button
                type="button"
                class="motion-press inline-flex min-h-11 min-w-44 items-center justify-center rounded-md border-2 border-dc-border bg-dc-paper px-4 py-2 text-sm font-semibold text-dc-ink shadow-[2px_2px_0_rgba(17,17,17,0.08)] hover:bg-dc-paper-warm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dc-ink/25"
                @click="openFinanceDrawer('budget', $event)"
              >
                Add budget line
              </button>
              <button
                type="button"
                class="motion-press inline-flex min-h-11 min-w-44 items-center justify-center rounded-md border-2 border-dc-ink bg-dc-pink px-4 py-2 font-mono text-sm font-semibold uppercase tracking-wide text-white shadow-[2px_2px_0_#111111] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dc-ink/25"
                @click="openFinanceDrawer('entry', $event)"
              >
                Add record
              </button>
            </template>
          </div>
        </header>

        <section v-if="summary" class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Finance summary">
          <article class="rounded-lg border-2 border-dc-ink bg-dc-yellow p-4">
            <p class="editorial-eyebrow !text-dc-ink">Planned budget</p>
            <p class="mt-3 text-2xl font-semibold tracking-tight text-dc-ink">{{ formatMoney(summary.planned_budget_minor) }}</p>
            <p class="mt-1 text-xs text-dc-ink/70">Budget lines entered</p>
          </article>
          <article class="rounded-lg border border-dc-border bg-dc-paper p-4">
            <p class="editorial-eyebrow">Committed</p>
            <p class="mt-3 text-2xl font-semibold tracking-tight text-dc-ink">{{ formatMoney(summary.committed_minor) }}</p>
            <p class="mt-1 text-xs text-dc-gray">Approved or paid expenses</p>
          </article>
          <article class="rounded-lg border border-dc-border bg-dc-paper p-4">
            <p class="editorial-eyebrow">Paid</p>
            <p class="mt-3 text-2xl font-semibold tracking-tight text-dc-ink">{{ formatMoney(summary.paid_minor) }}</p>
            <p class="mt-1 text-xs text-dc-gray">{{ formatMoney(summary.unpaid_committed_minor) }} still unpaid</p>
          </article>
          <article class="rounded-lg border border-dc-pink bg-[#fff7fb] p-4">
            <p class="editorial-eyebrow !text-dc-pink">Remaining</p>
            <p class="mt-3 text-2xl font-semibold tracking-tight" :class="summary.remaining_minor < 0 ? 'text-red-700' : 'text-dc-ink'">
              {{ formatMoney(summary.remaining_minor) }}
            </p>
            <p class="mt-1 text-xs text-dc-gray">Budget less committed spend</p>
          </article>
        </section>

        <section v-if="summary" class="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <article class="rounded-lg border border-dc-border bg-dc-paper">
            <div class="flex items-start justify-between gap-4 border-b border-dc-border px-4 py-4 sm:px-5">
              <div>
                <p class="editorial-eyebrow">Budget health</p>
                <h2 class="mt-1 text-lg font-semibold text-dc-ink">By category</h2>
              </div>
              <p class="text-right text-xs text-dc-gray">
                Income received<br><strong class="text-sm text-dc-ink">{{ formatMoney(summary.income_received_minor) }}</strong>
              </p>
            </div>
            <div v-if="summary.by_category.length === 0" class="px-5 py-10 text-sm text-dc-gray">
              No budget lines yet. Add the first category to make the conference budget visible here.
            </div>
            <div v-else class="overflow-x-auto">
              <table class="w-full min-w-[38rem] border-collapse text-left">
                <thead class="bg-dc-paper-warm font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-dc-gray">
                  <tr>
                    <th class="px-5 py-3">Category</th>
                    <th class="px-3 py-3 text-right">Budget</th>
                    <th class="px-3 py-3 text-right">Committed</th>
                    <th class="px-5 py-3 text-right">Variance</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-dc-border">
                  <tr v-for="category in summary.by_category" :key="category.category">
                    <td class="px-5 py-3 text-sm font-semibold text-dc-ink">{{ categoryLabel(category.category) }}</td>
                    <td class="px-3 py-3 text-right text-sm text-dc-gray">{{ formatMoney(category.planned_minor) }}</td>
                    <td class="px-3 py-3 text-right text-sm text-dc-gray">{{ formatMoney(category.committed_minor) }}</td>
                    <td class="px-5 py-3 text-right text-sm font-semibold" :class="category.variance_minor < 0 ? 'text-red-700' : 'text-dc-ink'">
                      {{ formatMoney(category.variance_minor) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </article>

          <aside class="rounded-lg border border-dc-border bg-dc-paper p-4 sm:p-5">
            <p class="editorial-eyebrow">Income position</p>
            <h2 class="mt-1 text-lg font-semibold text-dc-ink">What is coming in</h2>
            <dl class="mt-5 divide-y divide-dc-border">
              <div class="flex items-center justify-between gap-4 py-3">
                <dt class="text-sm text-dc-gray">Expected</dt>
                <dd class="text-sm font-semibold text-dc-ink">{{ formatMoney(summary.income_expected_minor) }}</dd>
              </div>
              <div class="flex items-center justify-between gap-4 py-3">
                <dt class="text-sm text-dc-gray">Received</dt>
                <dd class="text-sm font-semibold text-dc-ink">{{ formatMoney(summary.income_received_minor) }}</dd>
              </div>
              <div class="flex items-center justify-between gap-4 py-3">
                <dt class="text-sm text-dc-gray">Cash position</dt>
                <dd class="text-sm font-semibold text-dc-ink">{{ formatMoney(summary.net_cash_minor) }}</dd>
              </div>
            </dl>
            <p class="mt-5 border-t border-dc-border pt-4 text-xs leading-5 text-dc-gray">
              Income is tracked separately from spend so sponsorship and other receipts do not hide the real cost of the event.
            </p>
          </aside>
        </section>

        <section class="mt-4 rounded-lg border border-dc-border bg-dc-paper">
          <div class="border-b border-dc-border px-4 py-4 sm:px-5">
            <p class="editorial-eyebrow">Ledger</p>
            <h2 class="mt-1 text-lg font-semibold text-dc-ink">Recent records</h2>
          </div>
          <div v-if="finance?.entries.length === 0" class="px-5 py-10 text-sm text-dc-gray">
            No expenses or income records have been added yet.
          </div>
          <div v-else class="overflow-x-auto">
            <table class="w-full min-w-[58rem] border-collapse text-left">
              <thead class="bg-dc-paper-warm font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-dc-gray">
                <tr>
                  <th class="px-5 py-3">Record</th>
                  <th class="px-3 py-3">Category</th>
                  <th class="px-3 py-3">Source</th>
                  <th class="px-3 py-3">Status</th>
                  <th class="px-3 py-3">Date</th>
                  <th class="px-5 py-3 text-right">Amount</th>
                  <th v-if="canManage" class="px-5 py-3 text-right"><span class="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody class="divide-y divide-dc-border">
                <tr v-for="entry in finance?.entries" :key="entry.id">
                  <td class="px-5 py-3">
                    <p class="text-sm font-semibold text-dc-ink">{{ entry.description }}</p>
                    <p v-if="entry.vendor" class="mt-0.5 text-xs text-dc-gray">{{ entry.vendor }}</p>
                  </td>
                  <td class="px-3 py-3 text-sm text-dc-gray">{{ categoryLabel(entry.category) }}</td>
                  <td class="px-3 py-3">
                    <span class="inline-flex rounded-md border border-dc-border bg-dc-paper-warm px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-dc-gray">
                      {{ sourceLabel(entry) }}
                    </span>
                  </td>
                  <td class="px-3 py-3">
                    <span class="inline-flex rounded-md border px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.08em]" :class="entry.kind === 'income' ? 'border-dc-success/40 bg-dc-success/10 text-dc-success' : 'border-dc-border bg-dc-paper-warm text-dc-gray'">
                      {{ statusLabel(entry.status) }}
                    </span>
                  </td>
                  <td class="px-3 py-3 text-sm text-dc-gray">{{ entry.entry_date || '—' }}</td>
                  <td class="px-5 py-3 text-right text-sm font-semibold" :class="entry.kind === 'income' ? 'text-dc-success' : 'text-dc-ink'">
                    {{ entry.kind === 'income' ? '+' : '−' }}{{ formatMoney(entry.amount_minor) }}
                    <p v-if="entry.kind === 'income' && entry.status !== 'cancelled'" class="mt-1 text-[11px] font-medium text-dc-gray">
                      {{ formatMoney(entry.received_amount_minor) }} received · {{ formatMoney(entry.outstanding_amount_minor) }} outstanding
                    </p>
                  </td>
                  <td v-if="canManage" class="px-5 py-3 text-right">
                    <button
                      v-if="canManageIncome(entry)"
                      type="button"
                      class="motion-press rounded-md border border-dc-border px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-wide text-dc-ink hover:border-dc-pink hover:text-dc-pink"
                      @click="openIncomeDrawer(entry, $event)"
                    >
                      Manage
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </template>
    </div>
  </div>

  <Teleport to="body">
    <Transition name="finance-drawer">
      <div
        v-if="financeDrawerMode"
        class="fixed inset-0 z-[110] flex justify-end bg-dc-ink/35"
        role="presentation"
        @click.self="closeFinanceDrawer"
      >
        <aside
          ref="financeDrawerPanel"
          class="finance-drawer flex h-full w-full max-w-[var(--organizer-detail-drawer-width)] flex-col border-l border-dc-border bg-dc-paper shadow-2xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="finance-drawer-title"
          aria-describedby="finance-drawer-description"
          @keydown="handleFinanceDrawerKeydown"
        >
          <header class="flex shrink-0 items-start justify-between gap-5 border-b border-dc-border px-5 py-5 sm:px-6">
            <div class="min-w-0">
              <p class="editorial-eyebrow">Owner action</p>
              <h2 id="finance-drawer-title" class="mt-1 text-2xl font-semibold tracking-tight text-dc-ink">
                {{ financeDrawerTitle }}
              </h2>
              <p id="finance-drawer-description" class="mt-2 max-w-md text-sm leading-6 text-dc-gray">
                {{ financeDrawerDescription }}
              </p>
            </div>
            <button
              ref="financeDrawerCloseButton"
              type="button"
              class="motion-press inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-dc-border text-dc-gray hover:border-dc-ink hover:text-dc-ink"
              aria-label="Close finance drawer"
              @click="closeFinanceDrawer"
            >
              <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                <path stroke-linecap="round" d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </header>

          <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
            <div v-if="actionError" class="mb-4 rounded-md border border-red-700 bg-red-50 p-4 text-sm font-medium text-red-800" role="alert">
              {{ actionError }}
            </div>

            <form v-if="financeDrawerMode === 'budget'" class="grid gap-4" @submit.prevent="budgetMutation.mutate()">
              <AppDropdown v-model="budgetForm.category" label="Category" :options="categories" density="compact" menu-class="min-w-64" teleport />
              <label>
                <span class="editorial-label">Label</span>
                <input v-model="budgetForm.label" class="editorial-input mt-1.5" maxlength="160" placeholder="Main venue hire" required>
              </label>
              <label>
                <span class="editorial-label">Amount (GHS)</span>
                <input v-model="budgetForm.amount" class="editorial-input mt-1.5" inputmode="decimal" placeholder="0.00" required>
              </label>
              <button class="editorial-action motion-press mt-2 min-h-11 justify-center disabled:cursor-not-allowed disabled:opacity-50" :disabled="budgetMutation.isPending.value">
                {{ budgetMutation.isPending.value ? 'Saving…' : 'Add budget line' }}
              </button>
            </form>

            <form v-else-if="financeDrawerMode === 'entry'" class="grid gap-4" @submit.prevent="entryMutation.mutate()">
              <div class="grid gap-4 sm:grid-cols-2">
                <AppDropdown
                  :model-value="entryForm.kind"
                  label="Record type"
                  :options="[{ value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }]"
                  density="compact"
                  menu-class="min-w-48"
                  teleport
                  @update:model-value="changeEntryKind"
                />
                <AppDropdown v-model="entryForm.status" label="Status" :options="entryStatusOptions" density="compact" menu-class="min-w-48" teleport />
              </div>
              <div class="grid gap-4 sm:grid-cols-2">
                <AppDropdown v-model="entryForm.category" label="Category" :options="categories" density="compact" menu-class="min-w-64" teleport />
                <label>
                  <span class="editorial-label">Amount (GHS)</span>
                  <input v-model="entryForm.amount" class="editorial-input mt-1.5" inputmode="decimal" placeholder="0.00" required>
                </label>
              </div>
              <label>
                <span class="editorial-label">Description</span>
                <input v-model="entryForm.description" class="editorial-input mt-1.5" maxlength="200" placeholder="Venue deposit" required>
              </label>
              <div class="grid gap-4 sm:grid-cols-2">
                <label>
                  <span class="editorial-label">Vendor or source</span>
                  <input v-model="entryForm.vendor" class="editorial-input mt-1.5" maxlength="160" placeholder="Supplier or sponsor">
                </label>
                <AppDatePicker v-model="entryForm.entry_date" label="Date" />
              </div>
              <label>
                <span class="editorial-label">Notes</span>
                <textarea v-model="entryForm.notes" class="editorial-input mt-1.5 min-h-20 resize-none" maxlength="500" placeholder="Optional context or payment reference"></textarea>
              </label>
              <button class="editorial-action motion-press mt-2 min-h-11 justify-center disabled:cursor-not-allowed disabled:opacity-50" :disabled="entryMutation.isPending.value">
                {{ entryMutation.isPending.value ? 'Saving…' : 'Add record' }}
              </button>
            </form>

            <template v-else-if="selectedIncomeEntry">
              <div v-if="incomeDrawerStep === 'overview'" class="grid gap-5">
                <section class="rounded-lg border border-dc-border bg-dc-paper-warm p-4">
                  <div class="flex items-start justify-between gap-4">
                    <div>
                      <p class="text-sm font-semibold text-dc-ink">{{ selectedIncomeEntry.description }}</p>
                      <p v-if="selectedIncomeEntry.vendor" class="mt-1 text-xs text-dc-gray">{{ selectedIncomeEntry.vendor }}</p>
                    </div>
                    <span class="rounded-md border border-dc-success/40 bg-dc-success/10 px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-dc-success">
                      {{ statusLabel(selectedIncomeEntry.status) }}
                    </span>
                  </div>
                  <dl class="mt-4 grid grid-cols-3 gap-3 border-t border-dc-border pt-4">
                    <div>
                      <dt class="editorial-label">Expected</dt>
                      <dd class="mt-1 text-sm font-semibold text-dc-ink">{{ formatMoney(selectedIncomeEntry.amount_minor) }}</dd>
                    </div>
                    <div>
                      <dt class="editorial-label">Received</dt>
                      <dd class="mt-1 text-sm font-semibold text-dc-success">{{ formatMoney(selectedIncomeEntry.received_amount_minor) }}</dd>
                    </div>
                    <div>
                      <dt class="editorial-label">Outstanding</dt>
                      <dd class="mt-1 text-sm font-semibold text-dc-ink">{{ formatMoney(selectedIncomeEntry.outstanding_amount_minor) }}</dd>
                    </div>
                  </dl>
                  <p v-if="selectedIncomeEntry.original_amount_minor !== selectedIncomeEntry.amount_minor" class="mt-4 text-xs leading-5 text-dc-gray">
                    Original expectation: {{ formatMoney(selectedIncomeEntry.original_amount_minor) }}.
                  </p>
                </section>

                <div v-if="selectedIncomeEntry.status !== 'cancelled'" class="grid gap-2">
                  <button
                    v-if="selectedIncomeEntry.outstanding_amount_minor > 0"
                    type="button"
                    class="editorial-action motion-press min-h-11 justify-center"
                    @click="selectIncomeDrawerStep('receipt')"
                  >
                    Record payment received
                  </button>
                  <button
                    type="button"
                    class="motion-press min-h-11 rounded-md border-2 border-dc-border bg-dc-paper px-4 py-2 text-sm font-semibold text-dc-ink hover:bg-dc-paper-warm"
                    @click="selectIncomeDrawerStep('amend')"
                  >
                    Amend expectation
                  </button>
                  <button
                    v-if="selectedIncomeEntry.received_amount_minor === 0"
                    type="button"
                    class="motion-press min-h-11 rounded-md border border-red-700/50 bg-red-50 px-4 py-2 text-sm font-semibold text-red-800 hover:border-red-700"
                    @click="selectIncomeDrawerStep('cancel')"
                  >
                    Cancel expectation
                  </button>
                </div>

                <section v-if="selectedIncomeReceipts.length || selectedIncomeAmendments.length" class="border-t border-dc-border pt-5">
                  <p class="editorial-eyebrow">History</p>
                  <div class="mt-3 grid gap-2">
                    <article v-for="receipt in selectedIncomeReceipts" :key="receipt.id" class="rounded-md border border-dc-border px-3 py-3">
                      <p class="text-xs font-semibold text-dc-ink">Payment received · {{ formatMoney(receipt.amount_minor) }}</p>
                      <p class="mt-1 text-[11px] text-dc-gray">{{ receipt.received_date }}<span v-if="receipt.payment_reference"> · {{ receipt.payment_reference }}</span></p>
                      <p v-if="receipt.notes" class="mt-2 text-xs leading-5 text-dc-gray">{{ receipt.notes }}</p>
                    </article>
                    <article v-for="amendment in selectedIncomeAmendments" :key="amendment.id" class="rounded-md border border-dc-border px-3 py-3">
                      <p class="text-xs font-semibold text-dc-ink">
                        {{ amendment.action === 'cancel' ? 'Expectation cancelled' : `Expectation changed to ${formatMoney(amendment.next_amount_minor)}` }}
                      </p>
                      <p class="mt-1 text-xs leading-5 text-dc-gray">{{ amendment.reason }}</p>
                    </article>
                  </div>
                </section>
              </div>

              <form v-else-if="incomeDrawerStep === 'amend'" class="grid gap-4" @submit.prevent="incomeAmendmentMutation.mutate()">
                <p class="rounded-md border border-dc-border bg-dc-paper-warm px-3 py-3 text-xs leading-5 text-dc-gray">
                  {{ formatMoney(selectedIncomeEntry.received_amount_minor) }} has already been received. The revised expectation cannot be lower than that amount.
                </p>
                <label>
                  <span class="editorial-label">Revised expected amount (GHS)</span>
                  <input v-model="incomeAmendmentForm.amount" class="editorial-input mt-1.5" inputmode="decimal" placeholder="0.00" required>
                </label>
                <label>
                  <span class="editorial-label">Reason</span>
                  <textarea v-model="incomeAmendmentForm.reason" class="editorial-input mt-1.5 min-h-24 resize-none" maxlength="500" placeholder="Sponsor reduced the commitment after review" required></textarea>
                </label>
                <div class="grid gap-2 sm:grid-cols-2">
                  <button type="button" class="motion-press min-h-11 rounded-md border-2 border-dc-border bg-dc-paper px-4 py-2 text-sm font-semibold text-dc-ink" @click="returnToIncomeOverview">Back</button>
                  <button class="editorial-action motion-press min-h-11 justify-center disabled:cursor-not-allowed disabled:opacity-50" :disabled="incomeAmendmentMutation.isPending.value">
                    {{ incomeAmendmentMutation.isPending.value ? 'Saving…' : 'Save expectation' }}
                  </button>
                </div>
              </form>

              <form v-else-if="incomeDrawerStep === 'receipt'" class="grid gap-4" @submit.prevent="incomeReceiptMutation.mutate()">
                <p class="rounded-md border border-dc-border bg-dc-paper-warm px-3 py-3 text-xs leading-5 text-dc-gray">
                  Outstanding: <strong class="text-dc-ink">{{ formatMoney(selectedIncomeEntry.outstanding_amount_minor) }}</strong>. This can be a partial payment.
                </p>
                <div class="grid gap-4 sm:grid-cols-2">
                  <label>
                    <span class="editorial-label">Amount received (GHS)</span>
                    <input v-model="incomeReceiptForm.amount" class="editorial-input mt-1.5" inputmode="decimal" placeholder="0.00" required>
                  </label>
                  <AppDatePicker v-model="incomeReceiptForm.received_date" label="Received date" />
                </div>
                <label>
                  <span class="editorial-label">Payment reference</span>
                  <input v-model="incomeReceiptForm.payment_reference" class="editorial-input mt-1.5" maxlength="160" placeholder="Optional transfer or invoice reference">
                </label>
                <label>
                  <span class="editorial-label">Notes</span>
                  <textarea v-model="incomeReceiptForm.notes" class="editorial-input mt-1.5 min-h-20 resize-none" maxlength="500" placeholder="Optional context"></textarea>
                </label>
                <div class="grid gap-2 sm:grid-cols-2">
                  <button type="button" class="motion-press min-h-11 rounded-md border-2 border-dc-border bg-dc-paper px-4 py-2 text-sm font-semibold text-dc-ink" @click="returnToIncomeOverview">Back</button>
                  <button class="editorial-action motion-press min-h-11 justify-center disabled:cursor-not-allowed disabled:opacity-50" :disabled="incomeReceiptMutation.isPending.value">
                    {{ incomeReceiptMutation.isPending.value ? 'Saving…' : 'Record receipt' }}
                  </button>
                </div>
              </form>

              <form v-else class="grid gap-4" @submit.prevent="incomeCancellationMutation.mutate()">
                <p class="rounded-md border border-red-700/40 bg-red-50 px-3 py-3 text-xs leading-5 text-red-800">
                  This marks the remaining commitment as no longer expected. It cannot be used once money has been received.
                </p>
                <label>
                  <span class="editorial-label">Reason</span>
                  <textarea v-model="incomeCancellationForm.reason" class="editorial-input mt-1.5 min-h-24 resize-none" maxlength="500" placeholder="Sponsor withdrew the commitment" required></textarea>
                </label>
                <div class="grid gap-2 sm:grid-cols-2">
                  <button type="button" class="motion-press min-h-11 rounded-md border-2 border-dc-border bg-dc-paper px-4 py-2 text-sm font-semibold text-dc-ink" @click="returnToIncomeOverview">Back</button>
                  <button class="motion-press min-h-11 rounded-md border-2 border-red-700 bg-red-700 px-4 py-2 font-mono text-sm font-semibold uppercase tracking-wide text-white disabled:cursor-not-allowed disabled:opacity-50" :disabled="incomeCancellationMutation.isPending.value">
                    {{ incomeCancellationMutation.isPending.value ? 'Cancelling…' : 'Cancel expectation' }}
                  </button>
                </div>
              </form>
            </template>
          </div>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.finance-drawer-enter-active,
.finance-drawer-leave-active {
  transition: opacity 180ms cubic-bezier(0.4, 0, 0.2, 1);
}

.finance-drawer-enter-active .finance-drawer,
.finance-drawer-leave-active .finance-drawer {
  transition: transform 250ms cubic-bezier(0.16, 1, 0.3, 1);
}

.finance-drawer-enter-from,
.finance-drawer-leave-to {
  opacity: 0;
}

.finance-drawer-enter-from .finance-drawer,
.finance-drawer-leave-to .finance-drawer {
  transform: translateX(100%);
}

@media (prefers-reduced-motion: reduce) {
  .finance-drawer-enter-active,
  .finance-drawer-leave-active,
  .finance-drawer-enter-active .finance-drawer,
  .finance-drawer-leave-active .finance-drawer {
    transition-duration: 0.01ms;
    transition-delay: 0ms;
  }

  .finance-drawer-enter-from .finance-drawer,
  .finance-drawer-leave-to .finance-drawer {
    transform: none;
  }
}
</style>
