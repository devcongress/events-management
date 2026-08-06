import type { Event } from '@/types';

export const MONTHLY_MEETUP_FINANCE_CURRENCY = 'GHS' as const;

export const MONTHLY_MEETUP_FINANCE_DEFAULT_CATEGORY_NAMES = [
  'Venue',
  'Food and refreshments',
  'Connectivity',
  'Transport',
  'Promotion',
  'Supplies',
  'Speaker support',
  'Other',
] as const;

export interface MonthlyMeetupFinanceCategory {
  id: string;
  name: string;
}

export interface MonthlyMeetupFinanceCategoryInput {
  name: string;
}

export function normalizeMonthlyMeetupFinanceCategoryName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

export const MONTHLY_MEETUP_FINANCE_EXPENSE_STATUSES = ['paid', 'unpaid', 'cancelled'] as const;
export type MonthlyMeetupFinanceExpenseStatus = typeof MONTHLY_MEETUP_FINANCE_EXPENSE_STATUSES[number];

export interface MonthlyMeetupFinanceExpense {
  id: string;
  event_id: string;
  category: string;
  description: string;
  amount_minor: number;
  currency: typeof MONTHLY_MEETUP_FINANCE_CURRENCY;
  status: MonthlyMeetupFinanceExpenseStatus;
  vendor: string | null;
  expense_date: string;
  notes: string | null;
  created_by_email: string | null;
  updated_by_email: string | null;
  created_at: string;
  updated_at: string;
}

export interface MonthlyMeetupFinanceExpenseInput {
  category: string;
  description: string;
  amount_minor: number;
  status: MonthlyMeetupFinanceExpenseStatus;
  vendor?: string | null;
  expense_date: string;
  notes?: string | null;
}

export type MonthlyMeetupFinanceExpenseUpdate = MonthlyMeetupFinanceExpenseInput;

export interface MonthlyMeetupFinanceCategorySummary {
  category: string;
  incurred_minor: number;
  paid_minor: number;
  unpaid_minor: number;
}

export interface MonthlyMeetupFinanceSummary {
  currency: typeof MONTHLY_MEETUP_FINANCE_CURRENCY;
  actual_spend_minor: number;
  paid_minor: number;
  unpaid_minor: number;
  cancelled_minor: number;
  expense_count: number;
  by_category: MonthlyMeetupFinanceCategorySummary[];
}

export interface MonthlyMeetupFinanceSnapshot {
  event: Pick<Event, 'id' | 'name' | 'event_date' | 'series_type'>;
  categories: MonthlyMeetupFinanceCategory[];
  expenses: MonthlyMeetupFinanceExpense[];
}

export function summarizeMonthlyMeetupFinance(
  expenses: readonly MonthlyMeetupFinanceExpense[],
  categories: readonly MonthlyMeetupFinanceCategory[] = [],
): MonthlyMeetupFinanceSummary {
  const categoryNames = new Map<string, string>();
  for (const category of categories) {
    categoryNames.set(normalizeMonthlyMeetupFinanceCategoryName(category.name), category.name);
  }
  for (const expense of expenses) {
    const normalizedName = normalizeMonthlyMeetupFinanceCategoryName(expense.category);
    if (!categoryNames.has(normalizedName)) {
      categoryNames.set(normalizedName, expense.category.trim());
    }
  }

  const categorySummaries = new Map<string, MonthlyMeetupFinanceCategorySummary>(
    [...categoryNames.entries()].map(([normalizedName, category]) => [normalizedName, {
      category,
      incurred_minor: 0,
      paid_minor: 0,
      unpaid_minor: 0,
    }]),
  );

  let actualSpend = 0;
  let paid = 0;
  let unpaid = 0;
  let cancelled = 0;
  let expenseCount = 0;

  for (const expense of expenses) {
    if (expense.status === 'cancelled') {
      cancelled += expense.amount_minor;
      continue;
    }

    expenseCount += 1;
    actualSpend += expense.amount_minor;
    const category = categorySummaries.get(normalizeMonthlyMeetupFinanceCategoryName(expense.category));
    if (category) category.incurred_minor += expense.amount_minor;

    if (expense.status === 'paid') {
      paid += expense.amount_minor;
      if (category) category.paid_minor += expense.amount_minor;
    } else {
      unpaid += expense.amount_minor;
      if (category) category.unpaid_minor += expense.amount_minor;
    }
  }

  return {
    currency: MONTHLY_MEETUP_FINANCE_CURRENCY,
    actual_spend_minor: actualSpend,
    paid_minor: paid,
    unpaid_minor: unpaid,
    cancelled_minor: cancelled,
    expense_count: expenseCount,
    by_category: [...categorySummaries.values()].filter((category) => category.incurred_minor > 0),
  };
}
