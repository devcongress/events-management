<script setup lang="ts">
import { computed, nextTick, onUnmounted, reactive, ref } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { useRoute } from 'vue-router';
import AppDropdown from '@/src/components/AppDropdown.vue';
import AppDatePicker from '@/src/components/ui/AppDatePicker.vue';
import {
  type MonthlyMeetupFinanceExpense,
  type MonthlyMeetupFinanceExpenseStatus,
} from '@/lib/monthly-meetup-finance';
import {
  createMonthlyMeetupFinanceCategory,
  createMonthlyMeetupFinanceExpense,
  fetchMonthlyMeetupFinance,
  updateMonthlyMeetupFinanceExpense,
  queryKeys,
} from '@/src/lib/api';
import { notify } from '@/src/lib/notify';

const route = useRoute();
const queryClient = useQueryClient();
const eventId = computed(() => String(route.params.eventId ?? ''));
const actionError = ref('');
const categoryComposerOpen = ref(false);
const newCategoryName = ref('');
const drawerOpen = ref(false);
const editingExpenseId = ref<string | null>(null);
const drawerPanel = ref<HTMLElement | null>(null);
const drawerCloseButton = ref<HTMLButtonElement | null>(null);
const pageContent = ref<HTMLElement | null>(null);
let drawerTrigger: HTMLElement | null = null;
let previousBodyOverflow = '';

const financeQuery = useQuery({
  queryKey: computed(() => queryKeys.monthlyMeetupFinance(eventId.value)),
  queryFn: () => fetchMonthlyMeetupFinance(eventId.value),
  enabled: computed(() => Boolean(eventId.value)),
});

const finance = computed(() => financeQuery.data.value);
const summary = computed(() => finance.value?.summary);
const categoryOptions = computed(() => (finance.value?.categories ?? []).map((category) => ({
  value: category.name,
  label: category.name,
})));
const statusOptions = [
  { value: 'paid', label: 'Paid' },
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'cancelled', label: 'Cancelled' },
];
const expenseForm = reactive({
  category: '',
  description: '',
  amount: '',
  status: 'paid' as MonthlyMeetupFinanceExpenseStatus,
  vendor: '',
  expense_date: new Date().toISOString().slice(0, 10),
  notes: '',
});

const expenseMutation = useMutation({
  mutationFn: async () => {
    const amountMinor = amountToMinor(expenseForm.amount);
    if (amountMinor === null) throw new Error('Enter a valid GHS amount with up to two decimal places.');
    if (!expenseForm.category) throw new Error('Choose or add a category first.');
    if (!expenseForm.description.trim()) throw new Error('Add a description for this expense.');
    if (!expenseForm.expense_date) throw new Error('Choose the expense date.');
    const input = {
      category: expenseForm.category,
      description: expenseForm.description.trim(),
      amount_minor: amountMinor,
      status: expenseForm.status,
      vendor: expenseForm.vendor.trim() || null,
      expense_date: expenseForm.expense_date,
      notes: expenseForm.notes.trim() || null,
    };
    return editingExpenseId.value
      ? updateMonthlyMeetupFinanceExpense(eventId.value, editingExpenseId.value, input)
      : createMonthlyMeetupFinanceExpense(eventId.value, input);
  },
  onSuccess: async () => {
    actionError.value = '';
    expenseForm.description = '';
    expenseForm.amount = '';
    expenseForm.vendor = '';
    expenseForm.notes = '';
    const wasEditing = Boolean(editingExpenseId.value);
    editingExpenseId.value = null;
    await queryClient.invalidateQueries({ queryKey: queryKeys.monthlyMeetupFinance(eventId.value) });
    notify.success(wasEditing ? 'Monthly expense updated.' : 'Monthly expense added.');
    await closeDrawer();
  },
  onError: (error) => {
    actionError.value = error instanceof Error ? error.message : 'Unable to add the monthly expense.';
  },
});

const categoryMutation = useMutation({
  mutationFn: async () => {
    const name = newCategoryName.value.trim().replace(/\s+/g, ' ');
    if (!name) throw new Error('Enter a category name.');
    return createMonthlyMeetupFinanceCategory(eventId.value, { name });
  },
  onSuccess: (category) => {
    const current = financeQuery.data.value;
    if (current) {
      const normalizedName = category.name.toLowerCase();
      const categories = [
        ...current.categories.filter((item) => item.name.toLowerCase() !== normalizedName),
        category,
      ].sort((left, right) => left.name.localeCompare(right.name));
      queryClient.setQueryData(queryKeys.monthlyMeetupFinance(eventId.value), {
        ...current,
        categories,
      });
    }
    expenseForm.category = category.name;
    newCategoryName.value = '';
    categoryComposerOpen.value = false;
    actionError.value = '';
  },
  onError: (error) => {
    actionError.value = error instanceof Error ? error.message : 'Unable to add the category.';
  },
});

const monthLabel = computed(() => {
  const value = finance.value?.event.event_date;
  if (!value) return 'Monthly meetup';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Monthly meetup';
  return new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(date);
});

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

function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function statusLabel(status: MonthlyMeetupFinanceExpenseStatus): string {
  return status[0]!.toUpperCase() + status.slice(1);
}

function categoryLabel(category: string): string {
  return category;
}

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

function resetExpenseForm() {
  editingExpenseId.value = null;
  expenseForm.category = finance.value?.categories.find(
    (category) => category.name.toLowerCase() === 'venue',
  )?.name ?? finance.value?.categories[0]?.name ?? '';
  expenseForm.description = '';
  expenseForm.amount = '';
  expenseForm.status = 'paid';
  expenseForm.vendor = '';
  expenseForm.expense_date = new Date().toISOString().slice(0, 10);
  expenseForm.notes = '';
  categoryComposerOpen.value = false;
  newCategoryName.value = '';
}

function startCreateExpense(event: MouseEvent) {
  resetExpenseForm();
  void openDrawer(event);
}

function startEditExpense(expense: MonthlyMeetupFinanceExpense, event: MouseEvent) {
  editingExpenseId.value = expense.id;
  expenseForm.category = expense.category;
  expenseForm.description = expense.description;
  expenseForm.amount = (expense.amount_minor / 100).toFixed(2);
  expenseForm.status = expense.status;
  expenseForm.vendor = expense.vendor ?? '';
  expenseForm.expense_date = expense.expense_date;
  expenseForm.notes = expense.notes ?? '';
  categoryComposerOpen.value = false;
  newCategoryName.value = '';
  void openDrawer(event);
}

async function openDrawer(event: MouseEvent) {
  actionError.value = '';
  drawerOpen.value = true;
  drawerTrigger = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
  setPageInteractionLocked(true);
  await nextTick();
  drawerCloseButton.value?.focus();
}

async function closeDrawer() {
  if (!drawerOpen.value) return;
  drawerOpen.value = false;
  setPageInteractionLocked(false);
  await nextTick();
  drawerTrigger?.focus();
  drawerTrigger = null;
}

function handleDrawerKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault();
    void closeDrawer();
    return;
  }
  if (event.key !== 'Tab' || !drawerPanel.value) return;
  const focusable = Array.from(drawerPanel.value.querySelectorAll<HTMLElement>(
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
  if (drawerOpen.value) setPageInteractionLocked(false);
});
</script>

<template>
  <div ref="pageContent" class="editorial-page">
    <div class="editorial-wrap py-5 lg:py-6">
      <section v-if="financeQuery.isError.value" class="editorial-panel border-dc-pink p-6" role="alert">
        <p class="text-lg font-semibold text-dc-ink">Monthly finance is temporarily unavailable.</p>
        <p class="mt-2 text-sm leading-6 text-dc-gray">Only Owners and Organizers can access this ledger. Both roles can add and edit expenses.</p>
        <button
          type="button"
          class="motion-press mt-4 min-h-11 rounded-md border-2 border-dc-ink bg-dc-yellow px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.12em]"
          @click="financeQuery.refetch()"
        >
          Try again
        </button>
      </section>

      <section v-else-if="financeQuery.isPending.value" class="editorial-panel p-6" aria-live="polite">
        <p class="editorial-eyebrow">Monthly meetup finance</p>
        <p class="mt-3 text-sm text-dc-gray">Loading the expense ledger…</p>
      </section>

      <template v-else-if="finance && summary">
        <header class="mb-5 flex flex-wrap items-end justify-between gap-4 border-b border-dc-border pb-4">
          <div>
            <p class="editorial-eyebrow">Monthly meetup finance</p>
            <h1 class="mt-1 text-3xl font-semibold tracking-tight text-dc-ink sm:text-4xl">{{ monthLabel }} expenses</h1>
            <p class="mt-2 max-w-2xl text-sm leading-6 text-dc-gray">
              Record every expense incurred for this meetup in Ghana cedis. This view tracks actual spend only; it does not require a budget.
            </p>
          </div>
          <div class="flex flex-wrap items-center justify-end gap-2">
            <span class="rounded-md border border-dc-border bg-dc-paper-warm px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-dc-gray">GHS · {{ monthLabel }}</span>
            <button
              v-if="finance.permissions.can_manage"
              type="button"
              class="motion-press inline-flex min-h-11 min-w-44 items-center justify-center rounded-md border-2 border-dc-ink bg-dc-pink px-4 py-2 font-mono text-sm font-semibold uppercase tracking-wide text-white shadow-[2px_2px_0_#111111] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dc-ink/25"
              @click="startCreateExpense"
            >
              Add expense
            </button>
          </div>
        </header>

        <section class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Monthly finance summary">
          <article class="rounded-lg border-2 border-dc-ink bg-dc-yellow p-4">
            <p class="editorial-eyebrow !text-dc-ink">Actual spend</p>
            <p class="mt-3 text-2xl font-semibold tracking-tight text-dc-ink">{{ formatMoney(summary.actual_spend_minor) }}</p>
            <p class="mt-1 text-xs text-dc-ink/70">Paid and unpaid expenses</p>
          </article>
          <article class="rounded-lg border border-dc-border bg-dc-paper p-4">
            <p class="editorial-eyebrow">Paid</p>
            <p class="mt-3 text-2xl font-semibold tracking-tight text-dc-ink">{{ formatMoney(summary.paid_minor) }}</p>
            <p class="mt-1 text-xs text-dc-gray">Already settled</p>
          </article>
          <article class="rounded-lg border border-dc-pink bg-[#fff7fb] p-4">
            <p class="editorial-eyebrow !text-dc-pink">Unpaid</p>
            <p class="mt-3 text-2xl font-semibold tracking-tight text-dc-ink">{{ formatMoney(summary.unpaid_minor) }}</p>
            <p class="mt-1 text-xs text-dc-gray">Still to settle</p>
          </article>
          <article class="rounded-lg border border-dc-border bg-dc-paper p-4">
            <p class="editorial-eyebrow">Expenses</p>
            <p class="mt-3 text-2xl font-semibold tracking-tight text-dc-ink">{{ summary.expense_count }}</p>
            <p class="mt-1 text-xs text-dc-gray">Cancelled items excluded</p>
          </article>
        </section>

        <section class="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <article class="rounded-lg border border-dc-border bg-dc-paper">
            <div class="border-b border-dc-border px-4 py-4 sm:px-5">
              <p class="editorial-eyebrow">Spend shape</p>
              <h2 class="mt-1 text-lg font-semibold text-dc-ink">By category</h2>
            </div>
            <div v-if="summary.by_category.length === 0" class="px-5 py-10 text-sm text-dc-gray">
              No expenses yet. Add the first expense to start the monthly total.
            </div>
            <div v-else class="overflow-x-auto">
              <table class="w-full min-w-[34rem] border-collapse text-left">
                <thead class="bg-dc-paper-warm font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-dc-gray">
                  <tr>
                    <th class="px-5 py-3">Category</th>
                    <th class="px-3 py-3 text-right">Incurred</th>
                    <th class="px-5 py-3 text-right">Unpaid</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-dc-border">
                  <tr v-for="category in summary.by_category" :key="category.category">
                    <td class="px-5 py-3 text-sm font-semibold text-dc-ink">{{ categoryLabel(category.category) }}</td>
                    <td class="px-3 py-3 text-right text-sm text-dc-gray">{{ formatMoney(category.incurred_minor) }}</td>
                    <td class="px-5 py-3 text-right text-sm font-semibold text-dc-ink">{{ formatMoney(category.unpaid_minor) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </article>

          <aside class="rounded-lg border border-dc-border bg-dc-paper p-4 sm:p-5">
            <p class="editorial-eyebrow">Monthly view</p>
            <h2 class="mt-1 text-lg font-semibold text-dc-ink">Actuals first</h2>
            <p class="mt-4 text-sm leading-6 text-dc-gray">
              Every monthly meetup gets its own ledger. There is no budget form here, so the total stays focused on what the month actually cost.
            </p>
            <p v-if="summary.cancelled_minor > 0" class="mt-4 border-t border-dc-border pt-4 text-xs leading-5 text-dc-gray">
              {{ formatMoney(summary.cancelled_minor) }} in cancelled entries is kept for audit context and excluded from actual spend.
            </p>
          </aside>
        </section>

        <section class="mt-4 rounded-lg border border-dc-border bg-dc-paper">
          <div class="border-b border-dc-border px-4 py-4 sm:px-5">
            <p class="editorial-eyebrow">Expense ledger</p>
            <h2 class="mt-1 text-lg font-semibold text-dc-ink">All expenses for {{ monthLabel }}</h2>
          </div>
          <div v-if="finance.expenses.length === 0" class="px-5 py-10 text-sm text-dc-gray">
            No monthly expenses have been added yet.
          </div>
          <div v-else class="overflow-x-auto">
            <table class="w-full min-w-[48rem] border-collapse text-left">
              <thead class="bg-dc-paper-warm font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-dc-gray">
                <tr>
                  <th class="px-5 py-3">Expense</th>
                  <th class="px-3 py-3">Category</th>
                  <th class="px-3 py-3">Status</th>
                  <th class="px-3 py-3">Date</th>
                  <th class="px-5 py-3 text-right">Amount</th>
                  <th v-if="finance.permissions.can_manage" class="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-dc-border">
                <tr v-for="expense in finance.expenses" :key="expense.id">
                  <td class="px-5 py-3">
                    <p class="text-sm font-semibold text-dc-ink">{{ expense.description }}</p>
                    <p v-if="expense.vendor" class="mt-0.5 text-xs text-dc-gray">{{ expense.vendor }}</p>
                  </td>
                  <td class="px-3 py-3 text-sm text-dc-gray">{{ categoryLabel(expense.category) }}</td>
                  <td class="px-3 py-3">
                    <span class="inline-flex rounded-md border px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.08em]" :class="expense.status === 'paid' ? 'border-dc-success/40 bg-dc-success/10 text-dc-success' : expense.status === 'cancelled' ? 'border-dc-border bg-dc-paper-warm text-dc-gray' : 'border-dc-pink/40 bg-[#fff7fb] text-dc-pink'">
                      {{ statusLabel(expense.status) }}
                    </span>
                  </td>
                  <td class="px-3 py-3 text-sm text-dc-gray">{{ formatDate(expense.expense_date) }}</td>
                  <td class="px-5 py-3 text-right text-sm font-semibold" :class="expense.status === 'cancelled' ? 'text-dc-gray line-through' : 'text-dc-ink'">{{ formatMoney(expense.amount_minor) }}</td>
                  <td v-if="finance.permissions.can_manage" class="px-5 py-3 text-right">
                    <button
                      type="button"
                      class="motion-press rounded-md border border-dc-border px-2.5 py-1.5 font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-dc-gray hover:border-dc-ink hover:text-dc-ink"
                      @click="startEditExpense(expense, $event)"
                    >
                      Edit
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
    <Transition name="monthly-finance-drawer">
      <div v-if="drawerOpen" class="fixed inset-0 z-[110] flex justify-end bg-dc-ink/35" role="presentation" @click.self="closeDrawer">
        <aside
          ref="drawerPanel"
          class="monthly-finance-drawer flex h-full w-full max-w-xl flex-col border-l border-dc-border bg-dc-paper shadow-2xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="monthly-finance-drawer-title"
          aria-describedby="monthly-finance-drawer-description"
          @keydown="handleDrawerKeydown"
        >
          <header class="flex shrink-0 items-start justify-between gap-5 border-b border-dc-border px-5 py-5 sm:px-6">
            <div class="min-w-0">
              <p class="editorial-eyebrow">Finance action</p>
              <h2 id="monthly-finance-drawer-title" class="mt-1 text-2xl font-semibold tracking-tight text-dc-ink">{{ editingExpenseId ? 'Edit expense' : 'Add expense' }}</h2>
              <p id="monthly-finance-drawer-description" class="mt-2 max-w-md text-sm leading-6 text-dc-gray">{{ editingExpenseId ? 'Update the details for this monthly expense.' : 'Capture one expense incurred for this monthly meetup.' }}</p>
            </div>
            <button
              ref="drawerCloseButton"
              type="button"
              class="motion-press inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-dc-border text-dc-gray hover:border-dc-ink hover:text-dc-ink"
              aria-label="Close monthly finance drawer"
              @click="closeDrawer"
            >
              <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path stroke-linecap="round" d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </header>

          <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
            <div v-if="actionError" class="mb-4 rounded-md border border-red-700 bg-red-50 p-4 text-sm font-medium text-red-800" role="alert">{{ actionError }}</div>
            <form class="grid gap-4" @submit.prevent="expenseMutation.mutate()">
              <div class="grid gap-4 sm:grid-cols-2">
                <div>
                  <AppDropdown
                    v-model="expenseForm.category"
                    label="Category"
                    :options="categoryOptions"
                    placeholder="Choose or add a category"
                    :disabled="categoryOptions.length === 0"
                    required
                    density="compact"
                    menu-class="min-w-64"
                    teleport
                  />
                  <button
                    v-if="finance?.permissions.can_manage"
                    type="button"
                    class="motion-press mt-2 rounded-md border border-dc-border px-2.5 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-dc-gray hover:border-dc-ink hover:text-dc-ink"
                    @click="categoryComposerOpen = !categoryComposerOpen"
                  >
                    {{ categoryComposerOpen ? 'Close category' : 'Add category' }}
                  </button>
                  <div v-if="categoryComposerOpen" class="mt-3 rounded-md border border-dc-border bg-dc-paper-warm p-3">
                    <label>
                      <span class="editorial-label">New monthly category</span>
                      <input
                        v-model="newCategoryName"
                        class="editorial-input mt-1.5"
                        maxlength="80"
                        placeholder="e.g. Community outreach"
                        :disabled="categoryMutation.isPending.value"
                        @keydown.enter.prevent="categoryMutation.mutate()"
                      >
                    </label>
                    <p class="mt-2 text-xs leading-5 text-dc-gray">This category will be available across every monthly meetup.</p>
                    <button
                      type="button"
                      class="editorial-action motion-press mt-3 min-h-10 justify-center disabled:cursor-not-allowed disabled:opacity-50"
                      :disabled="categoryMutation.isPending.value"
                      @click="categoryMutation.mutate()"
                    >
                      {{ categoryMutation.isPending.value ? 'Saving…' : 'Save category' }}
                    </button>
                  </div>
                </div>
                <AppDropdown v-model="expenseForm.status" label="Status" :options="statusOptions" density="compact" menu-class="min-w-48" teleport />
              </div>
              <div class="grid gap-4 sm:grid-cols-2">
                <label>
                  <span class="editorial-label">Amount (GHS)</span>
                  <input v-model="expenseForm.amount" class="editorial-input mt-1.5" inputmode="decimal" placeholder="0.00" required>
                </label>
                <AppDatePicker v-model="expenseForm.expense_date" label="Date" density="field" required />
              </div>
              <label>
                <span class="editorial-label">Description</span>
                <input v-model="expenseForm.description" class="editorial-input mt-1.5" maxlength="200" placeholder="Venue hire" required>
              </label>
              <label>
                <span class="editorial-label">Vendor or source</span>
                <input v-model="expenseForm.vendor" class="editorial-input mt-1.5" maxlength="160" placeholder="Supplier or venue">
              </label>
              <label>
                <span class="editorial-label">Notes</span>
                <textarea v-model="expenseForm.notes" class="editorial-input mt-1.5 min-h-20 resize-none" maxlength="2000" placeholder="Optional context or payment reference"></textarea>
              </label>
              <button class="editorial-action motion-press mt-2 min-h-11 justify-center disabled:cursor-not-allowed disabled:opacity-50" :disabled="expenseMutation.isPending.value">
                {{ expenseMutation.isPending.value ? 'Saving…' : editingExpenseId ? 'Save changes' : 'Add expense' }}
              </button>
            </form>
          </div>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.monthly-finance-drawer-enter-active,
.monthly-finance-drawer-leave-active {
  transition: opacity 180ms cubic-bezier(0.4, 0, 0.2, 1);
}

.monthly-finance-drawer-enter-active .monthly-finance-drawer,
.monthly-finance-drawer-leave-active .monthly-finance-drawer {
  transition: transform 250ms cubic-bezier(0.16, 1, 0.3, 1);
}

.monthly-finance-drawer-enter-from,
.monthly-finance-drawer-leave-to {
  opacity: 0;
}

.monthly-finance-drawer-enter-from .monthly-finance-drawer,
.monthly-finance-drawer-leave-to .monthly-finance-drawer {
  transform: translateX(100%);
}

@media (prefers-reduced-motion: reduce) {
  .monthly-finance-drawer-enter-active,
  .monthly-finance-drawer-leave-active,
  .monthly-finance-drawer-enter-active .monthly-finance-drawer,
  .monthly-finance-drawer-leave-active .monthly-finance-drawer {
    transition-duration: 0.01ms;
  }

  .monthly-finance-drawer-enter-from .monthly-finance-drawer,
  .monthly-finance-drawer-leave-to .monthly-finance-drawer {
    transform: none;
  }
}
</style>
